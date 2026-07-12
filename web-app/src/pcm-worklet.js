/* AudioWorklet: capture mic audio as linear16 PCM for streaming to Deepgram.
 *
 * The Web Audio graph gives us Float32 samples at the AudioContext's sample rate (usually
 * 48 kHz). Deepgram's live socket wants raw linear16 (signed 16-bit) — so we convert each
 * 128-sample frame to Int16 and post it (transferable) to the main thread, which forwards it
 * over the WebSocket. We tell Deepgram the real sample rate, so no resampling is needed. */
class PCMWorklet extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    const ch = input && input[0]; // mono channel, Float32Array (128 samples)
    if (ch && ch.length) {
      const out = new Int16Array(ch.length);
      for (let i = 0; i < ch.length; i++) {
        const s = Math.max(-1, Math.min(1, ch[i]));
        out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      this.port.postMessage(out.buffer, [out.buffer]);
    }
    return true; // keep the processor alive
  }
}
registerProcessor("pcm-worklet", PCMWorklet);
