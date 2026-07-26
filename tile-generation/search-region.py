#!/usr/bin/env python3
"""Build a province/territory-scale SEARCH index (NO tiles) for the Context Map.

The Context Map (the no-graphics, describe-your-surroundings demo) reads
`/api/map-nearby` + `/api/map-search` over the OpenSearch `map-features` index and
loads NO tiles — so its coverage is the index, not tiles. A whole province is too
big to parse in one pass (one process would have to hold every feature + geometry
in memory -> OOM on a 16 GB box). So this tool:

  1. slices the region into N equal VERTICAL strips,
  2. cuts them in one `osmium extract` pass (strategy 'smart' — KEEP natural
     features; lakes/rivers/forests are the whole point of a describe tool),
  3. parses each slice in its OWN process IN PARALLEL (memory releases per slice;
     the parse is the CPU bottleneck, ~89% in geometry building),
  4. concatenates the slice NDJSONs and CAPS giant geometries (no single doc may
     be huge — bad for indexing AND for the Node nearest-point route, which loads
     each candidate's geometry).

Output: <localDir>/search/map-features.ndjson — ready to ship + upsert with
tile-generation/deploy-search-region.sh.

Usage:
  ./venv/bin/python tile-generation/search-region.py --region quebec
  ./venv/bin/python tile-generation/search-region.py --region ontario --slices 24 --parallel 5
The region must exist in regions.json with `source` (the province .pbf) and
`bounds` (province bbox). Optional region field `searchSlices` sets the default
slice count. Get the province extract from Geofabrik first if `source` is missing.
"""
import argparse, json, os, sys, time, shutil, subprocess, concurrent.futures
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
REGIONS_FILE = PROJECT_ROOT / "regions.json"
BUILD = PROJECT_ROOT / "tile-generation" / "build-tiles.py"
PY = sys.executable  # the venv python running this orchestrator

# --- geometry capping: no doc may be huge (decimate giant rings + the location
#     multi-point). Coarse is fine for "the lake is 200 m north"; nothing dropped. ---
CAP_THRESH = 8000   # only docs bigger than this are parsed/capped
RING_MAX = 200      # max vertices kept per geom ring
LOC_MAX = 32        # max points kept in the location multi-point
RINGS_MAX = 30      # keep at most this many (largest) rings

def decimate(seq, maxn):
    if len(seq) <= maxn:
        return seq
    stepf = len(seq) / maxn
    out = [seq[int(i * stepf)] for i in range(maxn)]
    if seq and seq[0] == seq[-1] and out[-1] != seq[0]:   # keep a ring closed
        out.append(seq[0])
    return out

def cap_line(line):
    """Return (line, was_capped). Only touches docs above CAP_THRESH bytes."""
    if len(line) < CAP_THRESH:
        return line, False
    try:
        d = json.loads(line)
    except Exception:
        return line, False
    changed = False
    g = d.get("geom")
    if isinstance(g, dict) and isinstance(g.get("c"), list):
        rings = g["c"]
        if len(rings) > RINGS_MAX:
            rings = sorted(rings, key=len, reverse=True)[:RINGS_MAX]; changed = True
        newrings = [decimate(r, RING_MAX) for r in rings]
        if changed or any(len(a) != len(b) for a, b in zip(newrings, g["c"])):
            g["c"] = newrings; changed = True
    loc = d.get("location")
    if isinstance(loc, list) and len(loc) > LOC_MAX:
        d["location"] = decimate(loc, LOC_MAX); changed = True
    if not changed:
        return line, False
    return json.dumps(d, ensure_ascii=False) + "\n", True

def resolve_region(region_id):
    data = json.loads(REGIONS_FILE.read_text())
    by_id = {r["id"]: r for r in data.get("regions", [])}
    if region_id not in by_id:
        sys.exit(f"region '{region_id}' not in regions.json")
    return by_id[region_id]

def main():
    ap = argparse.ArgumentParser(description="Province-scale search-only index for the Context Map.")
    ap.add_argument("--region", required=True, help="Region id in regions.json (source <province .pbf> + bounds).")
    ap.add_argument("--slices", type=int, help="Vertical slices (default: region.searchSlices or 16).")
    ap.add_argument("--parallel", type=int, help="Concurrent slice parses (default: cores-3, min 2).")
    ap.add_argument("--keep-slices", action="store_true", help="Keep slice pbfs/outputs (default: clean up on success).")
    ap.add_argument("--skip-extract", action="store_true", help="Reuse existing slice pbfs (retry after a failure).")
    ap.add_argument("--resume", action="store_true",
                    help="Pick up where a killed run left off: reuse the slice pbfs and skip slices that "
                         "already parsed successfully. Safe across a crash, a reboot, or a closed lid — "
                         "a step counts as done only once it RETURNED 0, never because its output exists.")
    ap.add_argument("--extract-batch", type=int, help="Slices to cut per osmium pass (default: all at once). "
                    "Lower it (e.g. 8) if `osmium extract` OOMs on a dense province — fewer simultaneous "
                    "output buffers + relation-completion sets per pass, at the cost of re-reading the .pbf.")
    ap.add_argument("--dem", action="store_true",
                    help="DEPRECATED and ignored. Every slice parse computes DEM street "
                         "grades now — it is part of the parse, not an option. Accepted "
                         "so existing callers and in-flight runners don't break.")
    args = ap.parse_args()

    region = resolve_region(args.region)
    src = region.get("source")
    if not src or not os.path.exists(src):
        sys.exit(f"source pbf not found: {src}\n  Download the province's Geofabrik extract first "
                 f"(e.g. https://download.geofabrik.de/north-america/canada/<prov>-latest.osm.pbf).")
    b = region["bounds"]; W, S, E, N = b["west"], b["south"], b["east"], b["north"]
    NS = args.slices or region.get("searchSlices") or 16
    PAR = args.parallel or max(2, (os.cpu_count() or 4) - 3)
    work = Path(region["localDir"]).parent / f"{args.region}-slices"
    work.mkdir(parents=True, exist_ok=True)
    out_nd = Path(region["localDir"]) / "search" / "map-features.ndjson"
    out_nd.parent.mkdir(parents=True, exist_ok=True)
    step = (E - W) / NS
    spath = lambda i: work / f"slice-{i:02d}.osm.pbf"

    # 1) cut N vertical slices with osmium (smart = keep whole natural features). All in
    #    one pass by default; in batches if --extract-batch is set (dense provinces OOM
    #    osmium when cutting too many smart extracts at once — Ontario's 132M nodes did).
    # A killed `osmium extract` leaves partial slice .pbfs on disk, so "the file is there" is not
    # proof it is whole. Only a marker written AFTER every pass returned means the slices can be
    # trusted — and it records NS, because a different slice count invalidates all of them.
    extract_done = work / "extract.done"
    slices_whole = extract_done.exists() and extract_done.read_text().strip() == str(NS)
    if (args.skip_extract or args.resume) and slices_whole and all(spath(i).exists() for i in range(NS)):
        print(f"[extract] reusing {NS} existing slices.", flush=True)
    else:
        if extract_done.exists():
            extract_done.unlink()
        EB = args.extract_batch or NS
        groups = [list(range(k, min(k + EB, NS))) for k in range(0, NS, EB)]
        if not args.resume:                                   # a fresh run trusts no old markers
            for old in work.glob("extract-*.done"):
                old.unlink()
        print(f"[extract] {NS} vertical slices (smart) in {len(groups)} pass(es) of <={EB} "
              f"over {Path(src).name}...", flush=True)
        for gi, grp in enumerate(groups):
            # Each pass gets its own marker. osmium holds an output buffer and a relation-completion
            # set per extract, so a big pass is what OOMs; when one dies (SIGKILL, no traceback) the
            # passes that already finished must not be paid for again. The signature pins the marker
            # to this exact slicing — change --slices or --extract-batch and it is worthless.
            gdone = work / f"extract-{gi:02d}.done"
            sig = f"{NS}:{EB}:{grp[0]}-{grp[-1]}"
            if args.resume and gdone.exists() and gdone.read_text().strip() == sig \
                    and all(spath(i).exists() for i in grp):
                print(f"  pass {gi + 1}/{len(groups)}: reusing slices {grp[0]:02d}..{grp[-1]:02d}", flush=True)
                continue
            extracts = [{"output": f"slice-{i:02d}.osm.pbf",
                         "bbox": [round(W + i * step, 5), S, round(W + (i + 1) * step, 5), N]} for i in grp]
            cfg = work / f"extract-{gi:02d}.json"
            cfg.write_text(json.dumps({"directory": str(work), "extracts": extracts}))
            if len(groups) > 1:
                print(f"  pass {gi + 1}/{len(groups)}: slices {grp[0]:02d}..{grp[-1]:02d}", flush=True)
            subprocess.run(["osmium", "extract", "--overwrite", "-s", "smart", "-c", str(cfg), src], check=True)
            gdone.write_text(sig)
        extract_done.write_text(str(NS))

    # 2) parse each slice in its own process, PAR at a time. Big/small interleaved so
    #    concurrent memory stays bounded.
    dpath = lambda i: work / f"slice-{i:02d}.done"

    def run_slice(i):
        w = round(W + i * step, 5); e = round(W + (i + 1) * step, 5)
        odir = work / f"slice-{i:02d}-out"
        nd = odir / "search" / "map-features.ndjson"
        # A slice killed mid-write leaves a TRUNCATED ndjson. The marker is written only after the
        # parse returned 0, so resuming re-parses that slice rather than shipping half of it.
        if args.resume and dpath(i).exists() and nd.exists():
            return (i, w, e, int(dpath(i).read_text().strip() or 0), 0, 0.0, True)
        t0 = time.time()
        with open(work / f"slice-{i:02d}.log", "w") as lg:
            # --bbox=... (joined form) so argparse doesn't read the leading negative lon as a flag.
            rc = subprocess.run([PY, str(BUILD), "--search-only",
                                 f"--source={spath(i)}", f"--bbox={w},{S},{e},{N}",
                                 f"--out={odir}"],
                                stdout=lg, stderr=lg).returncode
        c = sum(1 for _ in open(nd)) if nd.exists() else 0
        if rc == 0:
            tmp = work / f"slice-{i:02d}.done.tmp"      # atomic: never a half-written marker
            tmp.write_text(str(c))
            os.replace(tmp, dpath(i))
        return (i, w, e, c, rc, time.time() - t0, False)

    by_size = sorted(range(NS), key=lambda i: -spath(i).stat().st_size)
    order = []
    for a, z in zip(by_size[:len(by_size) // 2], by_size[len(by_size) // 2:][::-1]):
        order += [a, z]
    if len(by_size) % 2:
        order.append(by_size[len(by_size) // 2])

    print(f"[parse] {NS} slices, {PAR} at a time (cores={os.cpu_count()})...", flush=True)
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=PAR) as ex:
        for fut in concurrent.futures.as_completed([ex.submit(run_slice, i) for i in order]):
            r = fut.result(); results.append(r)
            i, _w, _e, c, rc, secs, reused = r
            tag = "  (reused)" if reused else ""
            print(f"  slice {i:02d} done  rc={rc}  docs={c:,}  {secs/60:.1f} min{tag}   ({len(results)}/{NS})", flush=True)

    fails = [r[0] for r in results if r[4] != 0]
    if fails:
        # Don't concat a partial region: a missing slice would ship as a silently incomplete state.
        print("\n===== SUMMARY =====")
        for i, w, e, c, rc, secs, reused in sorted(results):
            print(f"  slice {i:02d} [{w:8.3f}..{e:8.3f}]  docs={c:>9,}  {secs/60:5.1f} min" +
                  ("  (reused)" if reused else "") + ("" if rc == 0 else f"   <-- FAILED rc={rc}"))
        print(f"\nfailed slices: {fails}")
        print("Retry with --resume; if a slice OOM'd, raise --slices to shrink the dense ones.")
        sys.exit(1)

    # 3) concat + cap giant geoms in one streaming pass. Written to .part and renamed, so a run
    #    killed here leaves no half NDJSON for the deploy to pick up and ship as the whole region.
    print("[concat+cap] writing capped NDJSON...", flush=True)
    total = capped = 0
    part_nd = Path(str(out_nd) + ".part")
    with open(part_nd, "w") as out:
        for i in range(NS):
            nd = work / f"slice-{i:02d}-out" / "search" / "map-features.ndjson"
            if not nd.exists():
                continue
            with open(nd) as f:
                for line in f:
                    nl, was = cap_line(line)
                    out.write(nl); total += 1; capped += was
    os.replace(part_nd, out_nd)

    print("\n===== SUMMARY =====")
    for i, w, e, c, rc, secs, reused in sorted(results):
        print(f"  slice {i:02d} [{w:8.3f}..{e:8.3f}]  docs={c:>9,}  {secs/60:5.1f} min" +
              ("  (reused)" if reused else "") + ("" if rc == 0 else f"   <-- FAILED rc={rc}"))
    print(f"\nTOTAL: {total:,} docs  ({capped:,} giant geoms capped)  ->  {out_nd}")
    print("failed slices: none")
    if not args.keep_slices:
        shutil.rmtree(work, ignore_errors=True); print(f"cleaned {work}")
    print(f"\nNext: deploy with  tile-generation/deploy-search-region.sh {args.region}")

if __name__ == "__main__":
    main()
