const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fetchAudio } = require('../download.js');

function audio(data = 'complete audio') {
  return new Response(data, { headers: { 'content-type': 'audio/mp4', 'content-length': Buffer.byteLength(data).toString() } });
}
const instant = { random: () => 0, wait: async () => {} };

test('temporary server failure retries and returns only the complete audio', async () => {
  let calls = 0;
  const delays = [];
  const result = await fetchAudio('https://example.test/download', {
    ...instant, wait: async delay => delays.push(delay),
    fetch: async () => ++calls === 1 ? new Response('unavailable', { status: 503 }) : audio(),
  });
  assert.equal(calls, 2);
  assert.deepEqual(delays, [1000]);
  assert.equal(await result.blob.text(), 'complete audio');
});

test('permanent errors and bot checks do not retry', async () => {
  for (const [status, message, headers] of [[403, 'forbidden', {}], [400, 'invalid URL', {}], [502, 'Sign in to confirm you are not a bot', {}], [429, 'busy', { 'retry-after': '60' }]]) {
    let calls = 0;
    await assert.rejects(fetchAudio('https://example.test', { ...instant, fetch: async () => { calls++; return new Response(message, { status, headers }); } }));
    assert.equal(calls, 1);
  }
});

test('honors bounded Retry-After and stops after three transient failures', async () => {
  let calls = 0;
  const delays = [];
  await assert.rejects(fetchAudio('https://example.test', {
    ...instant, wait: async delay => delays.push(delay),
    fetch: async () => { calls++; return new Response('busy', { status: 429, headers: { 'retry-after': '3' } }); },
  }));
  assert.equal(calls, 3);
  assert.deepEqual(delays, [3000, 3000]);
});

test('a truncated transfer is discarded before retrying', async () => {
  let calls = 0;
  const result = await fetchAudio('https://example.test', {
    ...instant, fetch: async () => ++calls === 1 ? new Response('part', { headers: { 'content-length': '100', 'content-type': 'audio/mp4' } }) : audio('whole file'),
  });
  assert.equal(calls, 2);
  assert.equal(await result.blob.text(), 'whole file');
});

test('cancel during backoff prevents the next request', async () => {
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(fetchAudio('https://example.test', {
    ...instant, signal: controller.signal,
    wait: async () => controller.abort(),
    fetch: async () => { calls++; throw new TypeError('network error'); },
  }), { name: 'AbortError' });
  assert.equal(calls, 1);
});

test('request timeout retries; user cancellation does not', async () => {
  let calls = 0;
  const waiting = (_url, { signal }) => new Promise((_resolve, reject) => {
    calls++;
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  });
  await assert.rejects(fetchAudio('https://example.test', { ...instant, fetch: waiting, timeoutMs: 5 }), /timed out/);
  assert.equal(calls, 3);
  calls = 0;
  const controller = new AbortController();
  const task = fetchAudio('https://example.test', { ...instant, fetch: waiting, signal: controller.signal });
  controller.abort();
  await assert.rejects(task, { name: 'AbortError' });
  assert.equal(calls, 1);
});

test('HTTP 200 error pages are not cached or retried as audio', async () => {
  let calls = 0;
  await assert.rejects(fetchAudio('https://example.test', { ...instant, fetch: async () => { calls++; return new Response('error page', { headers: { 'content-type': 'text/html' } }); } }), /did not return an audio/);
  assert.equal(calls, 1);
});


test('local downloader authorization header is preserved across retries', async () => {
  let calls = 0;
  await fetchAudio('http://127.0.0.1:11183/download', {
    ...instant, headers: { 'X-Local-Download': '1' }, targetAddressSpace: 'loopback',
    fetch: async (_url, options) => {
      assert.equal(options.headers['X-Local-Download'], '1');
      assert.equal(options.targetAddressSpace, 'loopback');
      return ++calls === 1 ? new Response('busy', { status: 503 }) : audio();
    },
  });
  assert.equal(calls, 2);
});
