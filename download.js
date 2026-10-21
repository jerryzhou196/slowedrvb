(function (root) {
  'use strict';
  var RETRYABLE = [408, 425, 429, 500, 502, 503, 504];

  function canceled() {
    var error = new Error('download canceled');
    error.name = 'AbortError';
    return error;
  }

  function wait(ms, signal) {
    return new Promise(function (resolve, reject) {
      if (signal && signal.aborted) return reject(canceled());
      var timer = setTimeout(done, ms);
      function done() { cleanup(); resolve(); }
      function abort() { clearTimeout(timer); cleanup(); reject(canceled()); }
      function cleanup() { if (signal) signal.removeEventListener('abort', abort); }
      if (signal) signal.addEventListener('abort', abort, { once: true });
    });
  }

  async function fetchAudio(url, options) {
    options = options || {};
    var signal = options.signal;
    var fetcher = options.fetch || root.fetch.bind(root);
    var pause = options.wait || wait;
    var random = options.random || Math.random;
    var notify = options.onStatus || function () {};
    var maxAttempts = 3;
    for (var attempt = 1; attempt <= maxAttempts; attempt++) {
      if (signal && signal.aborted) throw canceled();
      var controller = new AbortController();
      var timedOut = false;
      var response;
      var reader;
      var retryDelay = 1000 * Math.pow(2, attempt - 1) + Math.floor(random() * 250);
      var abort = function () { controller.abort(); };
      if (signal) signal.addEventListener('abort', abort, { once: true });
      var timer = setTimeout(function () { timedOut = true; controller.abort(); }, options.timeoutMs || 90000);
      var failure;
      try {
        notify(attempt === 1 ? 'fetching from youtube…' : 'retrying download… (attempt ' + attempt + ' of ' + maxAttempts + ')');
        response = await fetcher(url, { signal: controller.signal, headers: options.headers });
        if (!response.ok) {
          var message = (await response.text()).slice(0, 2000);
          var retryAfter = response.headers.get('retry-after');
          var after = retryAfter === null ? NaN : Number(retryAfter);
          if (retryAfter !== null && !Number.isFinite(after)) after = (Date.parse(retryAfter) - Date.now()) / 1000;
          if (Number.isFinite(after)) retryDelay = Math.max(0, after * 1000);
          failure = new Error('download failed (' + response.status + ')' + (message ? ': ' + message : ''));
          failure.retryable = RETRYABLE.indexOf(response.status) !== -1 && retryDelay <= 30000;
          if (/not a bot|sign in to confirm|private video|video unavailable|video has been removed/i.test(message)) failure.retryable = false;
          throw failure;
        }
        var type = response.headers.get('content-type') || '';
        if (/^(text\/|application\/json)/i.test(type)) {
          failure = new Error('the server did not return an audio file');
          failure.retryable = false;
          throw failure;
        }
        var total = Number(response.headers.get('content-length')) || 0;
        var blob;
        if (!response.body || !response.body.getReader) {
          blob = await response.blob();
        } else {
          reader = response.body.getReader();
          var chunks = [];
          var received = 0;
          while (true) {
            var chunk = await reader.read();
            if (chunk.done) break;
            received += chunk.value.length;
            chunks.push(chunk.value);
            notify(total ? 'receiving audio… ' + Math.min(100, Math.round(received / total * 100)) + '%' : 'receiving audio… ' + (received / 1048576).toFixed(1) + ' MB');
          }
          blob = new Blob(chunks, { type: type });
        }
        if (!blob.size || (total && !response.headers.get('content-encoding') && blob.size !== total)) {
          failure = new Error('audio transfer was interrupted');
          failure.retryable = true;
          throw failure;
        }
        if (signal && signal.aborted) throw canceled();
        return { blob: blob, response: response };
      } catch (error) {
        if (signal && signal.aborted) throw canceled();
        failure = error;
        if (timedOut) failure = new Error('download timed out');
        if (failure.retryable === undefined) failure.retryable = timedOut || error instanceof TypeError || error.name === 'NetworkError';
      } finally {
        clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', abort);
        controller.abort();
        if (reader) { try { await reader.cancel(); } catch (_) {} }
      }
      if (!failure.retryable || attempt === maxAttempts) throw failure;
      notify('connection interrupted — retrying in ' + Math.ceil(retryDelay / 1000) + 's…');
      await pause(retryDelay, signal);
    }
  }

  var api = { fetchAudio: fetchAudio, wait: wait };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.YoutubeDownload = api;
})(typeof window !== 'undefined' ? window : globalThis);
