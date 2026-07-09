#!/usr/bin/env python3
"""
GTFS-static -> transit-stops NDJSON for the Knowledge Map.

Pulls the Mobility Database catalog, filters to the covered regions (all of Canada +
the international trial cities), downloads each agency's GTFS-static feed, and for
every STOP computes the set of ROUTES that serve it (name + mode) plus a coarse
service pattern. Emits one NDJSON doc per stop for the `transit-stops` OpenSearch
index (mirrors map-features: keyed by a unique id, streamed by the upserter).

Knowledge, not live times: "which routes serve nearby stops" is macronavigation, from
the published static schedule. No realtime, no scraping. Feeds are free open data
(Mobility Database catalog); attribution per feed licence.

Usage:
  gtfs-ingest.py --out transit-stops.ndjson            # full run (all matched feeds)
  gtfs-ingest.py --out t.ndjson --limit 3              # first 3 matched feeds (test)
  gtfs-ingest.py --out t.ndjson --only 903,1234        # specific feeds by mdb id
  gtfs-ingest.py --list                                # list matched feeds; don't download
Stdlib only (urllib/csv/zipfile) — no pip installs.
"""
import argparse, csv, datetime, io, json, os, ssl, sys, time, zipfile, urllib.request

# macOS Python ships without a system CA bundle, so verification of many feeds' HTTPS
# certs fails and silently drops the feed. Verify against certifi's bundle when present.
try:
    import certifi
    SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CTX = ssl.create_default_context()

CATALOG_URL = "https://storage.googleapis.com/storage/v1/b/mdb-csv/o/sources.csv?alt=media"  # Mobility Database catalog
REGIONS_JSON = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "regions.json")
UA = "a11ybob.com transit-ingest (bob@a11ybob.com)"
MAX_ROUTES_PER_STOP = 14
DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]

def log(*a): print(*a, file=sys.stderr, flush=True)

def fetch(url, timeout=120):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    return urllib.request.urlopen(req, timeout=timeout, context=SSL_CTX).read()

def read_catalog(cache="/tmp/mdb-sources.csv"):
    fresh = (os.path.exists(cache) and os.path.getsize(cache) > 100000
             and (time.time() - os.path.getmtime(cache)) < 86400)
    if not fresh:
        log("fetching Mobility Database catalog...")
        data = fetch(CATALOG_URL, timeout=90)
        if len(data) < 100000:
            raise SystemExit(f"catalog download looks wrong ({len(data)} bytes)")
        tmp = cache + ".tmp"
        with open(tmp, "wb") as f: f.write(data)
        os.replace(tmp, cache)   # atomic — a failed fetch never leaves a bad cache
    with open(cache, encoding="utf-8") as f:
        return list(csv.DictReader(f))

def load_region_boxes():
    """The map's coverage as (south, north, west, east) boxes from regions.json. Transit is
    scoped to exactly where the map has features (all-Canada provinces + the trial cities)."""
    boxes = []
    for r in json.load(open(REGIONS_JSON))["regions"]:
        b = r.get("bounds")
        if b and all(k in b for k in ("south", "north", "west", "east")):
            boxes.append((b["south"], b["north"], b["west"], b["east"]))
    return boxes

def feed_box(row):
    try:
        return (float(row["location.bounding_box.minimum_latitude"]),
                float(row["location.bounding_box.maximum_latitude"]),
                float(row["location.bounding_box.minimum_longitude"]),
                float(row["location.bounding_box.maximum_longitude"]))
    except Exception:
        return None

def overlaps(fb, boxes):
    if not fb: return False
    la0, la1, lo0, lo1 = fb
    return any(la0 <= n and la1 >= s and lo0 <= e and lo1 >= w for s, n, w, e in boxes)

def in_boxes(lat, lon, boxes):
    return any(s <= lat <= n and w <= lon <= e for s, n, w, e in boxes)

def wanted(row, boxes):
    """A GTFS-schedule feed — active, no-auth, with a download URL — whose coverage box
    overlaps the map's coverage. (No-bbox feeds fall back to country == CA.)"""
    if (row.get("data_type") or "").strip() != "gtfs":                      # not gtfs_rt
        return False
    # Production feeds only, as an ALLOWLIST — a status the catalog invents later must not be
    # ingested by default. The catalog also carries 'deprecated', 'inactive' and 'development'.
    # TTC publishes both: mdb 732 (production) and mdb 2253 ('development', "Static feed for
    # beta realtime feed"). Both were being ingested, so every Toronto stop existed twice under
    # distinct ids; the beta feed carries no subway routes at all, and types route 882
    # "Operator Shuttles" as route_type 4 (ferry), tagging 36 downtown stops as ferry stops.
    if (row.get("status") or "active").strip().lower() not in ("", "active"):
        return False
    if (row.get("urls.authentication_type") or "0").strip() not in ("0", "", "None"):
        return False
    if not (row.get("urls.direct_download") or row.get("urls.latest")):
        return False
    fb = feed_box(row)
    if fb is None:
        return (row.get("location.country_code") or "").strip().upper() == "CA"
    return overlaps(fb, boxes)

def mode_of(rt):
    try: rt = int(str(rt).strip())
    except Exception: return "transit"
    base = {0: "streetcar", 1: "subway", 2: "train", 3: "bus", 4: "ferry",
            5: "cable car", 6: "gondola", 7: "funicular", 11: "trolleybus", 12: "monorail"}
    if rt in base: return base[rt]
    if 100 <= rt < 200: return "train"
    if 200 <= rt < 300: return "bus"
    if 400 <= rt < 500: return "subway"
    if 700 <= rt < 900: return "bus"
    if 900 <= rt < 1000: return "streetcar"
    if 1000 <= rt < 1100: return "ferry"
    if 1400 <= rt < 1500: return "funicular"
    return "transit"

def hms_to_sec(s):
    """GTFS 'HH:MM:SS' -> seconds since service-day midnight. May exceed 24h for
    after-midnight trips ('25:10:00' = 1:10am next day). None if unparseable."""
    p = (s or "").strip().split(":")
    try:
        if len(p) >= 2:
            return int(p[0]) * 3600 + int(p[1]) * 60 + (int(p[2]) if len(p) > 2 else 0)
    except ValueError:
        pass
    return None

def sec_to_hhmm(sec):
    m = (sec // 60) % (24 * 60)   # wrap the service-day clock so 25:10 shows as 01:10
    return f"{m // 60:02d}:{m % 60:02d}"

# Headway windows (seconds from service-day midnight). Evening runs past 24h so
# after-midnight departures fold into the late window rather than being lost.
HW_WINDOWS = [("am_peak", 6 * 3600, 9 * 3600), ("midday", 9 * 3600, 15 * 3600),
              ("pm_peak", 15 * 3600, 18 * 3600 + 1800), ("evening", 18 * 3600 + 1800, 28 * 3600)]
DAYTYPES = [("weekday", {0, 1, 2, 3, 4}), ("saturday", {5}), ("sunday", {6})]

def _median(xs):
    xs = sorted(xs); n = len(xs)
    if not n: return None
    return xs[n // 2] if n % 2 else (xs[n // 2 - 1] + xs[n // 2]) / 2

def headway_profile(secs):
    """secs: departure seconds on the representative day -> {window: typical minutes between
    departures}. Median of consecutive gaps; a window with <2 departures is left out."""
    ss = sorted(set(secs))
    prof = {}
    for name, lo, hi in HW_WINDOWS:
        win = [x for x in ss if lo <= x < hi]
        if len(win) >= 2:
            gaps = [win[i + 1] - win[i] for i in range(len(win) - 1)]
            prof[name] = round(_median(gaps) / 60)
    return prof

def build_sched(times_by_svc, freq_by_svc, service_days):
    """Per-route schedule KNOWLEDGE for one stop: first/last departure + a coarse headway
    profile, split weekday / Saturday / Sunday. Never live times.

    times_by_svc: {service_id: [dep_sec,...]} from stop_times.
    freq_by_svc:  {service_id: [(start_sec, end_sec, headway_sec),...]} from frequencies.txt.
    Uses the DOMINANT service pattern per day-type (most departures) so overlapping calendars
    don't double-count a typical day."""
    all_svcs = set(times_by_svc) | set(freq_by_svc)
    if not all_svcs: return None
    sched = {}
    for name, days in DAYTYPES:
        cands = [sv for sv in all_svcs if service_days.get(sv, set()) & days]
        if not cands: continue
        def weight(sv):
            n = len(times_by_svc.get(sv, []))
            for st, en, hw in freq_by_svc.get(sv, []):
                n += max(1, (en - st) // max(hw, 60))
            return n
        rep = max(cands, key=weight)
        secs = list(times_by_svc.get(rep, []))       # dominant pattern -> frequency & trip count
        freqs = freq_by_svc.get(rep, [])
        # first/last span the UNION of every service on this day-type, so an intra-day split
        # (e.g. a separate late-night service_id) doesn't truncate the last departure.
        span = []
        for sv in cands:
            span += times_by_svc.get(sv, [])
            for st, en, hw in freq_by_svc.get(sv, []):
                span += (st, en)
        if not span: continue
        prof = headway_profile(secs)
        for st, en, hw in freqs:   # headway-based service: declared headway wins per overlapped window
            hwm = max(1, round(hw / 60))
            for wn, lo, hi in HW_WINDOWS:
                if st < hi and en > lo:
                    prof[wn] = min(prof.get(wn, hwm), hwm)
        entry = {"first": sec_to_hhmm(min(span)), "last": sec_to_hhmm(max(span))}
        if secs: entry["trips"] = len(secs)
        if prof: entry["headway"] = prof
        sched[name] = entry
    return sched or None

def wheel_label(vals):
    """GTFS wheelchair_accessible flags ('1'/'2') seen across a route's trips -> plain label.
    1 = at least some accessible vehicles, 2 = not accessible, absent/0 = no info."""
    has1, has2 = "1" in vals, "2" in vals
    if has1 and has2: return "some"   # mixed fleet
    if has1: return "yes"
    if has2: return "no"
    return ""                          # no info

def parse_feed(zbytes):
    """One GTFS zip -> list of stop dicts (only stops served by >=1 route)."""
    z = zipfile.ZipFile(io.BytesIO(zbytes))
    names = {n.lower().split("/")[-1]: n for n in z.namelist()}  # tolerate subdir/case
    def rows(fname):
        real = names.get(fname)
        if not real: return
        with z.open(real) as f:
            for r in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig", errors="replace")):
                yield r

    agencies = {}
    for r in rows("agency.txt"):
        agencies[(r.get("agency_id") or "").strip()] = (r.get("agency_name") or "").strip()
    default_agency = next((v for v in agencies.values() if v), "")

    routes = {}
    for r in rows("routes.txt"):
        rid = (r.get("route_id") or "").strip()
        routes[rid] = {
            "short": (r.get("route_short_name") or "").strip(),
            "long": (r.get("route_long_name") or "").strip(),
            "mode": mode_of(r.get("route_type")),
            "agency": agencies.get((r.get("agency_id") or "").strip(), default_agency) or default_agency,
        }

    trip_route, trip_service, trip_head, trip_wheel = {}, {}, {}, {}
    for r in rows("trips.txt"):
        t = (r.get("trip_id") or "").strip()
        trip_route[t] = (r.get("route_id") or "").strip()
        trip_service[t] = (r.get("service_id") or "").strip()
        trip_head[t] = (r.get("trip_headsign") or "").strip()   # destination / direction
        trip_wheel[t] = (r.get("wheelchair_accessible") or "0").strip()  # 0 unknown, 1 accessible, 2 not

    freq_rid = {}   # route_id -> {service_id: [(start_sec, end_sec, headway_sec),...]} (frequencies.txt)
    for r in rows("frequencies.txt"):
        t = (r.get("trip_id") or "").strip()
        rid = trip_route.get(t)
        st, en = hms_to_sec(r.get("start_time")), hms_to_sec(r.get("end_time"))
        try: hw = int((r.get("headway_secs") or "0").strip())
        except ValueError: hw = 0
        if rid and st is not None and en is not None and hw > 0:
            freq_rid.setdefault(rid, {}).setdefault(trip_service.get(t, ""), []).append((st, en, hw))

    service_days = {}
    for r in rows("calendar.txt"):
        sid = (r.get("service_id") or "").strip()
        service_days[sid] = set(i for i, d in enumerate(DAYS) if (r.get(d) or "0").strip() == "1")

    # calendar_dates.txt: feeds without a weekly calendar list each service DATE explicitly.
    # For service_ids with no (non-empty) calendar.txt row, derive the weekdays they run from
    # their added (exception_type=1) dates, so those feeds still get a service pattern + sched.
    cd_days = {}
    for r in rows("calendar_dates.txt"):
        if (r.get("exception_type") or "").strip() != "1":   # 1 = added; ignore 2 = removed
            continue
        sid = (r.get("service_id") or "").strip()
        if service_days.get(sid):                             # calendar.txt is authoritative when present
            continue
        ds = (r.get("date") or "").strip()
        if len(ds) == 8 and ds.isdigit():
            try:
                cd_days.setdefault(sid, set()).add(
                    datetime.date(int(ds[:4]), int(ds[4:6]), int(ds[6:8])).weekday())  # 0=Mon..6=Sun
            except ValueError:
                pass
    for sid, days in cd_days.items():
        service_days[sid] = days

    feed_date = ""
    for r in rows("feed_info.txt"):
        feed_date = (r.get("feed_version") or r.get("feed_start_date") or "").strip()
        break

    stops = {}
    for r in rows("stops.txt"):
        if (r.get("location_type") or "0").strip() not in ("0", ""):  # actual stops/platforms only
            continue
        sid = (r.get("stop_id") or "").strip()
        try:
            lat, lon = float(r["stop_lat"]), float(r["stop_lon"])
        except Exception:
            continue
        stops[sid] = {"name": (r.get("stop_name") or "").strip(), "lat": lat, "lon": lon,
                      "rids": set(), "svcs": set(), "rheads": {}, "rtimes": {}, "rwheel": {},
                      "wheel": (r.get("wheelchair_boarding") or "0").strip()}  # 0 unknown, 1 step-free, 2 not

    for r in rows("stop_times.txt"):  # the big join
        s = stops.get((r.get("stop_id") or "").strip())
        if not s: continue
        t = (r.get("trip_id") or "").strip()
        rid = trip_route.get(t)
        if rid:
            s["rids"].add(rid)
            h = trip_head.get(t)
            if h: s["rheads"].setdefault(rid, set()).add(h)   # destinations for this route AT this stop
            w = trip_wheel.get(t)
            if w and w != "0": s["rwheel"].setdefault(rid, set()).add(w)  # accessible-vehicle info per route
            dep = hms_to_sec(r.get("departure_time") or r.get("arrival_time"))
            if dep is not None:                                # scheduled departure -> first/last + headway
                s["rtimes"].setdefault(rid, {}).setdefault(trip_service.get(t, ""), []).append(dep)
        if t in trip_service: s["svcs"].add(trip_service[t])

    out = []
    for sid, s in stops.items():
        if not s["rids"]: continue
        bykey, modes, agency = {}, set(), default_agency
        for rid in s["rids"]:
            rt = routes.get(rid)
            if not rt: continue
            key = (rt["short"], rt["long"], rt["mode"])
            entry = bykey.setdefault(key, {"short": rt["short"], "long": rt["long"], "mode": rt["mode"],
                                           "dest": set(), "_times": {}, "_freq": {}, "_wheel": set()})
            entry["dest"] |= s["rheads"].get(rid, set())   # merge destinations across branch route-ids
            entry["_wheel"] |= s["rwheel"].get(rid, set())  # accessible-vehicle flags across branches
            for svc, lst in s["rtimes"].get(rid, {}).items():   # merge departure times across branches
                entry["_times"].setdefault(svc, []).extend(lst)
            for svc, flist in freq_rid.get(rid, {}).items():    # and any headway-based (frequencies.txt) windows
                entry["_freq"].setdefault(svc, []).extend(flist)
            modes.add(rt["mode"])
            if rt.get("agency"): agency = rt["agency"]
        if not bykey: continue
        rs = []
        for e in bykey.values():
            e["dest"] = sorted(e["dest"])[:4]
            e["sched"] = build_sched(e.pop("_times"), e.pop("_freq"), service_days)   # first/last + headway
            e["wheel"] = wheel_label(e.pop("_wheel"))   # accessible vehicles: yes/no/some/""
            rs.append(e)
        rs.sort(key=lambda r: (r["short"] or r["long"] or "").rjust(6))
        alldays = set()
        for svc in s["svcs"]:
            alldays |= service_days.get(svc, set())
        wd, we = ({0, 1, 2, 3, 4} & alldays), ({5, 6} & alldays)
        service = ("daily" if len(alldays) >= 6 else
                   "weekdays only" if wd and not we else
                   "weekends only" if we and not wd else
                   "some days" if alldays else "")
        out.append({"sid": sid, "name": s["name"], "lat": s["lat"], "lon": s["lon"],
                    "routes": rs[:MAX_ROUTES_PER_STOP], "modes": sorted(modes),
                    "agency": agency, "service": service, "feed_date": feed_date,
                    "wheel": s.get("wheel", "0")})
    return out

def route_label(r):
    lbl = (r["short"] + " " + r["long"]).strip() or r["short"] or r["long"]
    return lbl

def to_doc(mdb_id, d):
    return {
        "stop_id": f"{mdb_id}:{d['sid']}",
        "agency": d["agency"],
        "name": d["name"],
        "lat": round(d["lat"], 6), "lng": round(d["lon"], 6),
        "location": {"lat": d["lat"], "lon": d["lon"]},
        "routes": [{"short": r["short"], "long": r["long"], "mode": r["mode"], "dest": r.get("dest", []),
                    "sched": r.get("sched"), "wheel": r.get("wheel", "")} for r in d["routes"]],
        "route_labels": [route_label(r) for r in d["routes"]],
        "modes": d["modes"],
        "service": d["service"],
        "feed_date": d["feed_date"],
        "wheelchair": {"1": "yes", "2": "no"}.get(d.get("wheel", "0"), ""),   # stop step-free access
    }

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", help="NDJSON output path (default stdout)")
    ap.add_argument("--limit", type=int, default=0, help="process only the first N matched feeds")
    ap.add_argument("--only", help="comma list of mdb_source_id to process")
    ap.add_argument("--list", action="store_true", help="list matched feeds and exit")
    args = ap.parse_args()

    cat = read_catalog()
    boxes = load_region_boxes()
    feeds = [r for r in cat if wanted(r, boxes)]
    if args.only:
        keep = set(args.only.split(","))
        feeds = [r for r in feeds if (r.get("mdb_source_id") or "").strip() in keep]
    log(f"catalog: {len(cat)} rows; matched feeds: {len(feeds)}")

    if args.list:
        for r in feeds:
            log(f"  {r.get('mdb_source_id'):>5}  {r.get('location.country_code')}/{r.get('location.subdivision_name') or '-'}  "
                f"{r.get('provider','')[:50]}")
        return

    if args.limit: feeds = feeds[:args.limit]
    out = open(args.out, "w", encoding="utf-8") if args.out else sys.stdout

    total_stops, ok, failed = 0, 0, 0
    for i, r in enumerate(feeds, 1):
        mid = (r.get("mdb_source_id") or "").strip()
        prov = (r.get("provider") or "")[:45]
        url = (r.get("urls.direct_download") or r.get("urls.latest") or "").strip()
        try:
            t0 = time.time()
            docs = [d for d in parse_feed(fetch(url, timeout=180)) if in_boxes(d["lat"], d["lon"], boxes)]
            for d in docs:
                out.write(json.dumps(to_doc(mid, d), ensure_ascii=False) + "\n")
            total_stops += len(docs); ok += 1
            log(f"[{i}/{len(feeds)}] mdb {mid} {prov}: {len(docs)} stops  ({time.time()-t0:.0f}s)")
        except Exception as e:
            failed += 1
            log(f"[{i}/{len(feeds)}] mdb {mid} {prov}: FAILED — {type(e).__name__}: {e}")
    if args.out: out.close()
    log(f"\nDONE — feeds ok {ok}, failed {failed}; {total_stops} stop docs written.")

if __name__ == "__main__":
    main()
