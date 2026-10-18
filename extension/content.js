// Injected into every frame of the active tab by the popup (activeTab + scripting).
// Routes the page's <audio>/<video> elements through the same effect chain as
// slowedrvb.com: rate (pitch drops) → bass low-shelf → dry/wet reverb → volume → pan/8D.
// The popup talks to this file through window.__slowedrvb (see popup.js).
(function () {
  if (window.__slowedrvb) return;   // the popup re-injects on every open

  var settings = slowedrvbWithDefaults(null);
  var enabled = false;

  var media = new Set();             // every element we've touched
  var routed = new WeakMap();        // element -> MediaElementAudioSourceNode
  var speedOnly = new WeakSet();     // cross-origin media Web Audio would silence

  var ctx = null;
  var input, bassFilter, convolverNode, dryGain, wetGain, outputBus, volumeGain, pannerNode;
  var lfoOsc = null, lfoGain = null;

  // ---- reverb impulse (decaying stereo noise, same shape as the site) ----
  function generateImpulseResponse(duration, decay) {
    var length = Math.max(1, Math.floor(ctx.sampleRate * duration));
    var impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (var ch = 0; ch < 2; ch++) {
      var data = impulse.getChannelData(ch);
      for (var i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    return impulse;
  }

  var decayTimer = null, builtDecay = null;
  function scheduleImpulse() {
    if (!ctx || builtDecay === settings.reverbDecay) return;
    clearTimeout(decayTimer);
    decayTimer = setTimeout(function () {
      builtDecay = settings.reverbDecay;
      var buf = generateImpulseResponse(settings.reverbDecay, 2.5);
      // duck the wet path across the swap so the tail doesn't click
      var now = ctx.currentTime;
      wetGain.gain.cancelScheduledValues(now);
      wetGain.gain.setValueAtTime(wetGain.gain.value, now);
      wetGain.gain.linearRampToValueAtTime(0, now + 0.02);
      setTimeout(function () {
        convolverNode.buffer = buf;
        applyGraph();
      }, 25);
    }, 150);
  }

  function ensureGraph() {
    if (ctx) return;
    ctx = new AudioContext();
    input = ctx.createGain();
    bassFilter = ctx.createBiquadFilter();
    bassFilter.type = 'lowshelf';
    bassFilter.frequency.value = 160;
    convolverNode = ctx.createConvolver();
    dryGain = ctx.createGain();
    wetGain = ctx.createGain();
    outputBus = ctx.createGain();
    volumeGain = ctx.createGain();
    pannerNode = ctx.createPanner();
    pannerNode.panningModel = 'HRTF';
    pannerNode.distanceModel = 'inverse';
    pannerNode.refDistance = 1;
    pannerNode.rolloffFactor = 0;

    input.connect(bassFilter);
    bassFilter.connect(dryGain);
    bassFilter.connect(convolverNode);
    convolverNode.connect(wetGain);
    dryGain.connect(outputBus);
    wetGain.connect(outputBus);
    outputBus.connect(volumeGain);
    pannerNode.connect(ctx.destination);

    scheduleImpulse();
    applyGraph();
  }

  // HRTF colors the sound even at center, so only route through it when panning.
  var spatialRouted = null;
  function routeOutput(spatial) {
    if (spatialRouted === spatial) return;
    spatialRouted = spatial;
    volumeGain.disconnect();
    volumeGain.connect(spatial ? pannerNode : ctx.destination);
  }

  function setParam(param, value) {
    var now = ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setTargetAtTime(value, now, 0.015);
  }

  function applyPan(pan) {
    var az = pan * 80 * Math.PI / 180;
    pannerNode.positionX.value = Math.sin(az);
    pannerNode.positionY.value = 0;
    pannerNode.positionZ.value = -Math.cos(az);
  }

  function start8D() {
    stop8D();
    lfoOsc = ctx.createOscillator();
    lfoOsc.frequency.value = 1 / settings.eightDPeriod;
    lfoGain = ctx.createGain();
    lfoGain.gain.value = 1;
    pannerNode.positionX.value = 0;
    pannerNode.positionY.value = 0;
    pannerNode.positionZ.value = -0.3;
    lfoOsc.connect(lfoGain);
    lfoGain.connect(pannerNode.positionX);
    lfoOsc.start();
  }

  function stop8D() {
    if (lfoOsc) { try { lfoOsc.stop(); } catch (e) {} lfoOsc.disconnect(); lfoOsc = null; }
    if (lfoGain) { lfoGain.disconnect(); lfoGain = null; }
  }

  // push the current settings into the graph; disabled = transparent passthrough
  function applyGraph() {
    if (!ctx) return;
    var mix = enabled ? settings.reverbMix / 100 : 0;
    setParam(dryGain.gain, 1 - mix);
    setParam(wetGain.gain, mix);
    setParam(bassFilter.gain, enabled ? settings.bass : 0);
    setParam(volumeGain.gain, enabled ? settings.volume / 100 : 1);

    var eightD = enabled && settings.eightD;
    if (eightD) {
      if (!lfoOsc) start8D();
      else lfoOsc.frequency.setTargetAtTime(1 / settings.eightDPeriod, ctx.currentTime, 0.05);
    } else {
      stop8D();
      applyPan(settings.pan / 100);
    }
    routeOutput(eightD || (enabled && settings.pan !== 0));
  }

  // ---- media elements ----
  function isSameOriginMedia(el) {
    if (el.srcObject) return true;
    var src = el.currentSrc || el.src;
    if (!src || /^(blob|data):/.test(src)) return true;   // MSE players (youtube, soundcloud)
    if (el.crossOrigin) return true;                      // server opted into CORS
    try { return new URL(src, location.href).origin === location.origin; } catch (e) { return false; }
  }

  function configurePitch(el, preserve) {
    try { el.preservesPitch = preserve; } catch (e) {}
    try { el.webkitPreservesPitch = preserve; } catch (e) {}
  }

  function applyRate(el) {
    var target = enabled ? settings.rate : 1;
    configurePitch(el, !enabled);
    if (Math.abs(el.playbackRate - target) > 0.001) el.playbackRate = target;
  }

  function tryRoute(el) {
    if (routed.has(el) || !enabled) return;
    if (!isSameOriginMedia(el)) { speedOnly.add(el); return; }
    ensureGraph();
    // a suspended context would silence the element, so wait for one that runs
    if (ctx.state !== 'running') { ctx.resume().then(function () { if (ctx.state === 'running') tryRoute(el); }); return; }
    try {
      var node = ctx.createMediaElementSource(el);
      node.connect(input);
      routed.set(el, node);
      speedOnly.delete(el);
    } catch (e) {
      speedOnly.add(el);   // already owned by the page's own audio graph
    }
  }

  function track(el) {
    if (!media.has(el)) {
      media.add(el);
      // sites like youtube reset the rate on every new video; keep ours applied
      el.addEventListener('ratechange', function () { if (enabled) applyRate(el); });
      el.addEventListener('loadedmetadata', function () { applyRate(el); tryRoute(el); });
    }
    applyRate(el);
    tryRoute(el);
  }

  function scan() {
    document.querySelectorAll('audio, video').forEach(track);
  }

  // media events don't bubble, but capture-phase listeners still see them
  document.addEventListener('play', function (e) {
    if (e.target instanceof HTMLMediaElement) track(e.target);
  }, true);

  // the page may not have had a user gesture yet; resume on the first one
  ['pointerdown', 'keydown'].forEach(function (type) {
    window.addEventListener(type, function () {
      if (ctx && ctx.state !== 'running') ctx.resume().then(scan);
    }, true);
  });

  new MutationObserver(function () { if (enabled) scan(); })
    .observe(document.documentElement || document, { childList: true, subtree: true });

  function update() {
    scan();
    media.forEach(applyRate);
    applyGraph();
  }

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== 'local' || !changes.settings) return;
    settings = slowedrvbWithDefaults(changes.settings.newValue);
    scheduleImpulse();
    update();
  });

  chrome.storage.local.get('settings').then(function (got) {
    settings = slowedrvbWithDefaults(got.settings);
    scheduleImpulse();
    update();
  });

  window.__slowedrvb = {
    setEnabled: function (on) {
      enabled = !!on;
      update();
      return this.state();
    },
    togglePlay: function () {
      var list = Array.from(media).filter(function (el) { return el.isConnected; });
      var playing = list.filter(function (el) { return !el.paused; });
      if (playing.length) playing.forEach(function (el) { el.pause(); });
      else if (list[0]) list[0].play().catch(function () {});
      return this.state();
    },
    state: function () {
      scan();
      var list = Array.from(media).filter(function (el) { return el.isConnected; });
      return {
        enabled: enabled,
        mediaCount: list.length,
        playing: list.some(function (el) { return !el.paused && !el.ended; }),
        speedOnly: list.filter(function (el) { return speedOnly.has(el); }).length,
        suspended: !!(enabled && ctx && ctx.state !== 'running')
      };
    }
  };
})();
