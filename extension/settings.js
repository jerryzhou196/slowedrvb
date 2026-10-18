// shared by the popup, content script, offscreen engine and service worker
var SLOWEDRVB_DEFAULTS = {
  rate: 0.85,          // playback rate (pitch drops with speed, like a slowed record)
  reverbMix: 35,       // 0-100 % wet
  reverbDecay: 3.0,    // seconds
  bass: 0,             // dB low-shelf boost
  eightD: false,       // auto-sweep left <-> right
  eightDPeriod: 8,     // seconds per orbit
  pan: 0,              // -100 (left) .. 100 (right)
  volume: 100          // 0-100 %
};

var SLOWEDRVB_RATE_MIN = 0.5;
var SLOWEDRVB_RATE_MAX = 1.5;

function slowedrvbWithDefaults(stored) {
  var out = {};
  for (var k in SLOWEDRVB_DEFAULTS) {
    out[k] = (stored && stored[k] !== undefined) ? stored[k] : SLOWEDRVB_DEFAULTS[k];
  }
  return out;
}
