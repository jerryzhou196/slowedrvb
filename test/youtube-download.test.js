const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const handler = require('../api/youtube-download.js');

let server, base, realFetch, upstreamCalls;

beforeEach(async () => {
  realFetch = global.fetch;
  upstreamCalls = [];
  process.env.DOWNLOADS_TUNNEL_SECRET = 's3cret';
  server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
});
afterEach(async () => {
  global.fetch = realFetch;
  await new Promise(resolve => server.close(resolve));
});

// Requests to the test server use the real fetch; requests to the tunnel go to `reply`.
function upstream(reply) {
  global.fetch = async (url, options) => {
    if (String(url).startsWith(base)) return realFetch(url, options);
    upstreamCalls.push({ url: String(url), headers: options.headers });
    return reply();
  };
}
const get = (q = '?url=' + encodeURIComponent('https://www.youtube.com/watch?v=abc123xyz00')) =>
  realFetch(base + '/api/youtube-download' + q);

test('sends the secret to the tunnel and streams the audio back with its headers', async () => {
  upstream(() => new Response('audio-bytes', { headers: {
    'content-type': 'audio/mp4', 'content-length': '11',
    'content-disposition': "attachment; filename*=UTF-8''Song.m4a",
  } }));
  const res = await get();
  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'audio-bytes');
  assert.equal(res.headers.get('content-type'), 'audio/mp4');
  assert.equal(res.headers.get('content-disposition'), "attachment; filename*=UTF-8''Song.m4a");
  assert.equal(upstreamCalls.length, 1);
  assert.equal(upstreamCalls[0].url, 'https://downloads.jerryzhou.ca/download?url=' + encodeURIComponent('https://www.youtube.com/watch?v=abc123xyz00'));
  assert.equal(upstreamCalls[0].headers.Authorization, 'Bearer s3cret');
  assert.equal(upstreamCalls[0].headers['X-Local-Download'], '1');
});

test('passes the downloader\'s JSON errors and Retry-After through', async () => {
  upstream(() => new Response('{"detail":"Two downloads are already running."}', {
    status: 503, headers: { 'content-type': 'application/json', 'retry-after': '5' },
  }));
  const res = await get();
  assert.equal(res.status, 503);
  assert.equal(res.headers.get('retry-after'), '5');
  assert.match(await res.text(), /Two downloads/);
});

test('turns Cloudflare\'s HTML error pages into a short JSON error', async () => {
  upstream(() => new Response('<!DOCTYPE html><html>Bad gateway</html>', { status: 530, headers: { 'content-type': 'text/html' } }));
  const res = await get();
  assert.equal(res.status, 502);
  assert.deepEqual(await res.json(), { detail: 'The download service is unavailable. Please try again shortly.' });
});

test('refuses to run without a secret or a link', async () => {
  upstream(() => { throw new Error('should not be called'); });
  assert.equal((await get('')).status, 400);
  delete process.env.DOWNLOADS_TUNNEL_SECRET;
  assert.equal((await get()).status, 503);
  assert.equal(upstreamCalls.length, 0);
});

test('keeps the browser identity across requests without exposing the secret', async () => {
  upstream(() => new Response('audio', {headers:{'content-type':'audio/mp4'}}));
  const first=await get();await first.text();
  const cookie=first.headers.get('set-cookie');
  assert.match(cookie,/HttpOnly; Secure; SameSite=Lax/);
  const pair=cookie.split(';')[0];
  const visitor=upstreamCalls[0].headers['X-Download-Visitor'];
  assert.match(visitor,/^[a-f0-9]{32}$/);
  const second=await realFetch(base+'/api/youtube-download?url='+encodeURIComponent('https://www.youtube.com/watch?v=abc123xyz00'),{headers:{cookie:pair}});await second.text();
  assert.equal(upstreamCalls[1].headers['X-Download-Visitor'],visitor);
  assert.equal(upstreamCalls[1].headers['X-Download-Source'],'slowedrvb');
  assert.equal(cookie.includes('s3cret'),false);
});

test('forwards platform client IP rather than browser-supplied analytics headers', async () => {
  const before=process.env.VERCEL;process.env.VERCEL='1';
  try {
    upstream(() => new Response('audio',{headers:{'content-type':'audio/mp4'}}));
    const res=await realFetch(base+'/api/youtube-download?url='+encodeURIComponent('https://www.youtube.com/watch?v=abc123xyz00'),{headers:{'x-forwarded-for':'8.8.8.8','x-download-client-ip':'1.1.1.1','x-download-visitor':'forged'}});await res.text();
    assert.equal(upstreamCalls[0].headers['X-Download-Client-IP'],'8.8.8.8');
    assert.notEqual(upstreamCalls[0].headers['X-Download-Visitor'],'forged');
  } finally {if(before===undefined)delete process.env.VERCEL;else process.env.VERCEL=before;}
});
