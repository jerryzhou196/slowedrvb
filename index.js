// ---- monkeytype palette (for canvas drawing) ----
var COLOR_BG = '#323437';
var COLOR_MAIN = '#e2b714';
var COLOR_SUB = '#646669';
var COLOR_TEXT = '#d1d0c5';
var COLOR_ERROR = '#ca4754';

// ---- audio graph ----
var audioContext;
var streamSource, scriptNode;
var bassFilter, convolverNode, dryGain, wetGain, outputBus, pannerNode;

// ---- circular buffer ----
var circularBuffer;
var bufferLength = 0;
var writePos = 0;   // total samples ever written (monotonic)
var readPos = 0;    // fractional read head (monotonic), always <= writePos
var isStreaming = false;

// How much backlog (in seconds) you must build up to unlock the full 2.0x.
var FULL_SPEED_HEADROOM = 6;
// Visualization window.
var VIZ_SECONDS = 60;

// The largest playback rate the current buffer can sustain. Updated every frame.
var allowedMaxRate = 1.0;
var vizRafId = null;

// ---- 8D auto-pan ----
// Driven by an audio-thread oscillator (not requestAnimationFrame), so the
// sweep keeps running smoothly even while this tab is in the background.
var eightDEnabled = false;
var lfoOsc = null, lfoGain = null;

// ---- elements ----
var playbackControl = document.querySelector('#playback-rate-control');
var playbackValue = document.querySelector('#playback-rate-value');
var rateLock = document.querySelector('#rate-lock');
var bufferedReadout = document.querySelector('#buffered-readout');
var maxRateReadout = document.querySelector('#maxrate-readout');
var reverbMixControl = document.querySelector('#reverb-mix-control');
var reverbMixValue = document.querySelector('#reverb-mix-value');
var reverbDecayControl = document.querySelector('#reverb-decay-control');
var reverbDecayValue = document.querySelector('#reverb-decay-value');
var bassControl = document.querySelector('#bass-boost-control');
var bassValue = document.querySelector('#bass-boost-value');
var panControl = document.querySelector('#pan-control');
var panValue = document.querySelector('#pan-value');
var panSection = document.querySelector('#pan-section');
var btn8d = document.querySelector('#btn-8d');
var eightdSpeed = document.querySelector('#eightd-speed');
var eightdPeriodControl = document.querySelector('#eightd-period-control');
var eightdPeriodValue = document.querySelector('#eightd-period-value');
var statusEl = document.querySelector('#status');
var clearBtn = document.querySelector('#btn-clear');
var bufferCanvas = document.querySelector('#buffer-canvas');
var bufferCtx = bufferCanvas ? bufferCanvas.getContext('2d') : null;

function setStatus(text, className) {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.className = 'status' + (className ? ' ' + className : '');
}

// ---- reverb impulse response ----
function generateImpulseResponse(ctx, duration, decay) {
  var sampleRate = ctx.sampleRate;
  var length = Math.max(1, Math.floor(sampleRate * duration));
  var impulse = ctx.createBuffer(2, length, sampleRate);
  for (var ch = 0; ch < 2; ch++) {
    var data = impulse.getChannelData(ch);
    for (var i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return impulse;
}

function rebuildImpulse() {
  if (!audioContext || !convolverNode) return;
  var decay = reverbDecayControl ? parseFloat(reverbDecayControl.value) : 3.0;
  convolverNode.buffer = generateImpulseResponse(audioContext, decay, 2.5);
}

// ---- effect setters ----
function applyReverbMix(mix01) {
  if (dryGain) dryGain.gain.value = 1 - mix01;
  if (wetGain) wetGain.gain.value = mix01;
}

function applyBass(db) {
  if (bassFilter) bassFilter.gain.value = db;
}

// pan in [-1, 1]; uses HRTF spatialization so it actually sounds 3D on headphones.
function applyPan(pan) {
  if (!pannerNode) return;
  var az = pan * 80 * Math.PI / 180; // +/- 80 degrees around the head
  var x = Math.sin(az);
  var z = -Math.cos(az);
  if (pannerNode.positionX) {
    pannerNode.positionX.value = x;
    pannerNode.positionY.value = 0;
    pannerNode.positionZ.value = z;
  } else if (pannerNode.setPosition) {
    pannerNode.setPosition(x, 0, z);
  }
}

function formatPan(p) {
  if (p === 0) return 'C';
  return (p < 0 ? 'L ' : 'R ') + Math.abs(p);
}

// Sweep positionX between -1 and +1 with a sine LFO, keeping the source a touch
// in front (z = -0.3) so it arcs ear-to-ear without passing through the head.
function start8D() {
  if (!audioContext || !pannerNode || !pannerNode.positionX) return;
  stop8D();
  var period = eightdPeriodControl ? parseFloat(eightdPeriodControl.value) : 8;
  lfoOsc = audioContext.createOscillator();
  lfoOsc.type = 'sine';
  lfoOsc.frequency.value = 1 / period;
  lfoGain = audioContext.createGain();
  lfoGain.gain.value = 1.0; // sweep amplitude on the X axis
  pannerNode.positionX.value = 0;
  pannerNode.positionY.value = 0;
  pannerNode.positionZ.value = -0.3;
  lfoOsc.connect(lfoGain);
  lfoGain.connect(pannerNode.positionX);
  lfoOsc.start();
}

function stop8D() {
  if (lfoOsc) {
    try { lfoOsc.stop(); } catch (e) { /* already stopped */ }
    lfoOsc.disconnect();
    lfoOsc = null;
  }
  if (lfoGain) {
    lfoGain.disconnect();
    lfoGain = null;
  }
}

function updateEightDUI() {
  if (btn8d) {
    btn8d.textContent = eightDEnabled ? 'on' : 'off';
    btn8d.classList.toggle('active', eightDEnabled);
    btn8d.setAttribute('aria-pressed', eightDEnabled ? 'true' : 'false');
  }
  if (eightdSpeed) eightdSpeed.hidden = !eightDEnabled;
  if (panControl) panControl.disabled = eightDEnabled;
  if (panSection) panSection.classList.toggle('disabled', eightDEnabled);
  if (panValue) {
    panValue.textContent = eightDEnabled
      ? '8D'
      : formatPan(panControl ? parseInt(panControl.value, 10) : 0);
  }
}

window.toggle_8d = function () {
  eightDEnabled = !eightDEnabled;
  updateEightDUI();
  if (eightDEnabled) {
    if (isStreaming) start8D();
  } else {
    stop8D();
    applyPan(panControl ? parseInt(panControl.value, 10) / 100 : 0);
  }
};

// ---- start ----
window.start_audio = async function () {
  try {
    var displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        suppressLocalAudioPlayback: true,
      },
    });

    var audioTracks = displayStream.getAudioTracks();
    if (!audioTracks.length) {
      displayStream.getTracks().forEach(function (t) { t.stop(); });
      throw new Error("No audio track. In the picker, choose a Chrome Tab and enable 'Share tab audio'.");
    }
    var audioOnlyStream = new MediaStream(audioTracks);
    displayStream.getVideoTracks().forEach(function (t) { t.stop(); });

    audioContext = new (window.AudioContext || window.webkitAudioContext)();

    // Circular buffer: ~5 minutes of headroom for slow playback.
    bufferLength = audioContext.sampleRate * 300;
    circularBuffer = new Float32Array(bufferLength);
    writePos = 0;
    readPos = 0;
    isStreaming = true;

    streamSource = audioContext.createMediaStreamSource(audioOnlyStream);
    scriptNode = audioContext.createScriptProcessor(2048, 1, 1);

    scriptNode.onaudioprocess = function (e) {
      var input = e.inputBuffer.getChannelData(0);
      var output = e.outputBuffer.getChannelData(0);
      var n = output.length;

      if (!isStreaming) {
        for (var k = 0; k < n; k++) output[k] = 0;
        return;
      }

      // Write incoming tab audio into the circular buffer.
      for (var i = 0; i < input.length; i++) {
        circularBuffer[writePos % bufferLength] = input[i];
        writePos++;
      }

      // If write has lapped read by more than the buffer, drop the oldest audio.
      if (writePos - readPos > bufferLength - 1) {
        readPos = writePos - bufferLength + 1;
      }

      // Read from the circular buffer at the (clamped) playback rate.
      var rate = playbackControl ? parseFloat(playbackControl.value) : 1.0;
      if (rate > allowedMaxRate) rate = allowedMaxRate;
      for (var j = 0; j < n; j++) {
        if (readPos >= writePos - 1) {
          output[j] = 0; // caught up to live — nothing buffered ahead
          continue;
        }
        var idx = Math.floor(readPos);
        var frac = readPos - idx;
        var s0 = circularBuffer[idx % bufferLength];
        var s1 = circularBuffer[(idx + 1) % bufferLength];
        output[j] = s0 * (1 - frac) + s1 * frac;
        readPos += rate;
      }
    };

    // Effect chain:
    //   scriptNode -> bassFilter -> dryGain ------------------> outputBus -> panner -> destination
    //                              `-> convolver -> wetGain ->'
    bassFilter = audioContext.createBiquadFilter();
    bassFilter.type = 'lowshelf';
    bassFilter.frequency.value = 160;

    convolverNode = audioContext.createConvolver();
    rebuildImpulse();

    dryGain = audioContext.createGain();
    wetGain = audioContext.createGain();
    outputBus = audioContext.createGain();

    pannerNode = audioContext.createPanner();
    pannerNode.panningModel = 'HRTF';
    pannerNode.distanceModel = 'inverse';
    pannerNode.refDistance = 1;
    pannerNode.rolloffFactor = 0; // distance shouldn't change loudness, only direction

    streamSource.connect(scriptNode);
    scriptNode.connect(bassFilter);

    bassFilter.connect(dryGain);
    dryGain.connect(outputBus);

    bassFilter.connect(convolverNode);
    convolverNode.connect(wetGain);
    wetGain.connect(outputBus);

    outputBus.connect(pannerNode);
    pannerNode.connect(audioContext.destination);

    // Apply current slider positions.
    applyReverbMix((reverbMixControl ? parseInt(reverbMixControl.value, 10) : 40) / 100);
    applyBass(bassControl ? parseFloat(bassControl.value) : 0);
    if (eightDEnabled) {
      start8D();
    } else {
      applyPan(panControl ? parseInt(panControl.value, 10) / 100 : 0);
    }

    if (clearBtn) clearBtn.disabled = false;
    setStatus('streaming — slow down to build a buffer, then speed up to catch up.', 'streaming');

    audioTracks[0].addEventListener('ended', function () {
      isStreaming = false;
      setStatus('tab share ended.', '');
    });

    startViz();
  } catch (e) {
    setStatus(e.name + ': ' + e.message, 'error');
  }
};

// ---- clear buffer: jump the playback head to live, discarding stale backlog ----
window.clear_buffer = function () {
  if (!circularBuffer || !isStreaming) {
    setStatus('nothing to clear — start streaming first.', '');
    return;
  }
  readPos = writePos;       // catch up to the live edge
  circularBuffer.fill(0);   // wipe the stored audio so the reverb of the old song dies out
  setStatus('buffer cleared — caught up to live audio.', 'streaming');
};

// ---- stop ----
window.stop_audio = function () {
  isStreaming = false;
  stop8D();
  if (scriptNode) scriptNode.disconnect();
  if (streamSource) streamSource.disconnect();
  if (bassFilter) bassFilter.disconnect();
  if (convolverNode) convolverNode.disconnect();
  if (dryGain) dryGain.disconnect();
  if (wetGain) wetGain.disconnect();
  if (outputBus) outputBus.disconnect();
  if (pannerNode) pannerNode.disconnect();
  stopViz();
  if (clearBtn) clearBtn.disabled = true;
  allowedMaxRate = 1.0;
  if (bufferedReadout) bufferedReadout.textContent = '0.0s';
  setStatus('stopped.', '');
};

// ---- visualization + dynamic speed cap ----
function startViz() {
  if (vizRafId !== null) return;
  var loop = function () {
    vizRafId = requestAnimationFrame(loop);
    updateSpeedCap();
    drawBuffer();
  };
  loop();
}

function stopViz() {
  if (vizRafId !== null) {
    cancelAnimationFrame(vizRafId);
    vizRafId = null;
  }
  if (rateLock) rateLock.style.left = '100%';
  if (maxRateReadout) {
    maxRateReadout.textContent = '1.00×';
    maxRateReadout.classList.remove('locked');
  }
  if (bufferCtx) bufferCtx.clearRect(0, 0, bufferCanvas.width, bufferCanvas.height);
}

// Only offer >1.0x when there's enough buffered audio to spend catching up.
function updateSpeedCap() {
  var lagSeconds = audioContext ? (writePos - readPos) / audioContext.sampleRate : 0;
  allowedMaxRate = 1.0 + Math.min(1.0, lagSeconds / FULL_SPEED_HEADROOM);

  // Snap to the slider step so the readout matches what's selectable.
  allowedMaxRate = Math.round(allowedMaxRate / 0.05) * 0.05;
  if (allowedMaxRate < 1.0) allowedMaxRate = 1.0;

  // Clamp the live value if the shrinking buffer no longer supports it.
  if (playbackControl && parseFloat(playbackControl.value) > allowedMaxRate) {
    playbackControl.value = allowedMaxRate.toFixed(2);
    if (playbackValue) playbackValue.textContent = allowedMaxRate.toFixed(2);
  }

  // Position the "locked" overlay over the unreachable part of the track.
  if (rateLock) {
    var min = parseFloat(playbackControl.min);
    var max = parseFloat(playbackControl.max);
    var pct = ((allowedMaxRate - min) / (max - min)) * 100;
    rateLock.style.left = Math.max(0, Math.min(100, pct)) + '%';
  }

  if (bufferedReadout) bufferedReadout.textContent = lagSeconds.toFixed(1) + 's';
  if (maxRateReadout) {
    maxRateReadout.textContent = allowedMaxRate.toFixed(2) + '×';
    maxRateReadout.classList.toggle('locked', allowedMaxRate < 1.95);
  }
}

function drawBuffer() {
  if (!bufferCtx || !circularBuffer) return;

  // Keep the backing store crisp on hi-dpi screens.
  var dpr = window.devicePixelRatio || 1;
  var cssW = bufferCanvas.clientWidth || 480;
  var cssH = bufferCanvas.clientHeight || 90;
  var w = Math.round(cssW * dpr);
  var h = Math.round(cssH * dpr);
  if (bufferCanvas.width !== w || bufferCanvas.height !== h) {
    bufferCanvas.width = w;
    bufferCanvas.height = h;
  }

  var ctx = bufferCtx;
  ctx.clearRect(0, 0, w, h);

  var sr = audioContext.sampleRate;
  var windowSamples = Math.min(VIZ_SECONDS * sr, writePos);
  if (windowSamples < 1) return;
  var startSample = writePos - windowSamples;
  var mid = h / 2;
  var cols = Math.min(w, 600);

  // Backlog region: from the playback head to the live edge.
  var readX = ((readPos - startSample) / windowSamples) * w;
  readX = Math.max(0, Math.min(w, readX));
  ctx.fillStyle = 'rgba(226, 183, 20, 0.12)';
  ctx.fillRect(readX, 0, w - readX, h);

  // Waveform envelope (downsampled min/max per column).
  ctx.fillStyle = COLOR_SUB;
  for (var x = 0; x < cols; x++) {
    var a = startSample + Math.floor((windowSamples * x) / cols);
    var b = startSample + Math.floor((windowSamples * (x + 1)) / cols);
    if (b <= a) b = a + 1;
    var step = Math.max(1, Math.floor((b - a) / 8));
    var mn = 1, mx = -1, got = false;
    for (var s = a; s < b; s += step) {
      var v = circularBuffer[((s % bufferLength) + bufferLength) % bufferLength];
      if (v < mn) mn = v;
      if (v > mx) mx = v;
      got = true;
    }
    if (!got) continue;
    var px = (x / cols) * w;
    var pw = Math.max(1, w / cols);
    var yTop = mid - mx * mid * 0.9;
    var yBot = mid - mn * mid * 0.9;
    ctx.fillRect(px, yTop, pw, Math.max(1, yBot - yTop));
  }

  // Live edge (write head) — right side.
  ctx.fillStyle = COLOR_ERROR;
  ctx.fillRect(w - 2 * dpr, 0, 2 * dpr, h);

  // Playback head (read) — green/main marker.
  ctx.fillStyle = COLOR_MAIN;
  ctx.fillRect(Math.min(readX, w - 2 * dpr), 0, 2 * dpr, h);
}

// ---- slider wiring ----
if (playbackControl) {
  playbackControl.addEventListener('input', function () {
    var v = parseFloat(playbackControl.value);
    if (v > allowedMaxRate) {
      v = allowedMaxRate;
      playbackControl.value = v.toFixed(2);
    }
    if (playbackValue) playbackValue.textContent = v.toFixed(2);
  });
}

if (reverbMixControl) {
  reverbMixControl.addEventListener('input', function () {
    var val = parseInt(reverbMixControl.value, 10);
    if (reverbMixValue) reverbMixValue.textContent = val;
    applyReverbMix(val / 100);
  });
}

if (reverbDecayControl) {
  reverbDecayControl.addEventListener('input', function () {
    if (reverbDecayValue) reverbDecayValue.textContent = parseFloat(reverbDecayControl.value).toFixed(1);
    rebuildImpulse();
  });
}

if (bassControl) {
  bassControl.addEventListener('input', function () {
    var db = parseFloat(bassControl.value);
    if (bassValue) bassValue.textContent = db.toFixed(1);
    applyBass(db);
  });
}

if (panControl) {
  panControl.addEventListener('input', function () {
    var p = parseInt(panControl.value, 10);
    if (panValue) panValue.textContent = formatPan(p);
    applyPan(p / 100);
  });
}

if (eightdPeriodControl) {
  eightdPeriodControl.addEventListener('input', function () {
    var period = parseFloat(eightdPeriodControl.value);
    if (eightdPeriodValue) eightdPeriodValue.textContent = period.toFixed(1);
    if (lfoOsc) lfoOsc.frequency.value = 1 / period;
  });
}
