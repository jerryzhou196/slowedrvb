// shared by the popup and the content script. State is per tab and lives in the
// tab's content script, so a fresh tab always starts neutral (= off).
var SLOWEDRVB_NEUTRAL = {
  rate: 1,             // playback rate (pitch drops with speed, like a record)
  reverbMix: 0,        // 0-100 % wet
  reverbDecay: 3.0,    // seconds
  bass: 0,             // dB low-shelf boost
  eightD: false,       // auto-sweep left <-> right
  eightDPeriod: 8,     // seconds per orbit
  pan: 0,              // -100 (left) .. 100 (right)
  volume: 100          // 0-100 %
};

// presets only touch the main three; "reset" also clears the extras
var SLOWEDRVB_PRESETS = {
  slowed: { rate: 0.85, reverbMix: 40, bass: 3 },
  spedup: { rate: 1.25, reverbMix: 0, bass: 0 },
  reset: SLOWEDRVB_NEUTRAL
};

function slowedrvbWithDefaults(partial) {
  var out = {};
  for (var k in SLOWEDRVB_NEUTRAL) {
    out[k] = (partial && partial[k] !== undefined) ? partial[k] : SLOWEDRVB_NEUTRAL[k];
  }
  return out;
}

// popup open tracing (see trace.js): when this file ran, i.e. popup.css and the
// html above it were loaded. Content scripts load this file too; they have no tracer.
if (typeof window !== 'undefined' && window.slowedrvbTrace) window.slowedrvbTrace.mark('settings.js start');
