'use strict';
// GET /api/youtube-download?url=<youtube link>
//
// Streams the audio from the downloader on the Mac (behind the Cloudflare tunnel at
// downloads.jerryzhou.ca). The tunnel only answers requests carrying the shared
// secret, which lives here as DOWNLOADS_TUNNEL_SECRET and never reaches the browser.
// The Mac still validates the link (YouTube video IDs only) and caps concurrency.
//
// The response is streamed, so Vercel's 4.5 MB body limit doesn't apply.

var Readable = require('node:stream').Readable;
var crypto = require('node:crypto');
var net = require('node:net');

var REMOTE = (process.env.DOWNLOADS_TUNNEL_URL || 'https://downloads.jerryzhou.ca').replace(/\/+$/, '');
var PASS_THROUGH = ['content-type', 'content-length', 'content-disposition', 'retry-after'];

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return send(res, 405, { detail: 'GET only' });
  }
  var secret = process.env.DOWNLOADS_TUNNEL_SECRET;
  if (!secret) return send(res, 503, { detail: 'The download service is not configured.' });

  var url = new URL(req.url, 'http://x').searchParams.get('url') || '';
  if (!/^https?:\/\//i.test(url)) return send(res, 400, { detail: 'Enter a YouTube video URL' });

  // Anonymous, first-party downloading-browser ID. It is not a person/account ID.
  var cookie = String(req.headers.cookie || '').split(';').map(function (part) { return part.trim(); })
    .find(function (part) { return part.startsWith('slowedrvb_download_visitor='); });
  var visitor = cookie ? cookie.split('=')[1] : '';
  if (!/^[a-f0-9]{32}$/.test(visitor)) visitor = crypto.randomBytes(16).toString('hex');
  res.setHeader('Set-Cookie', 'slowedrvb_download_visitor=' + visitor + '; Max-Age=2592000; Path=/api/youtube-download; HttpOnly; Secure; SameSite=Lax');
  // Vercel overwrites this at the edge. Never accept an incoming X-Download-Client-IP.
  var clientIP = process.env.VERCEL === '1' ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '';
  if (!net.isIP(clientIP)) clientIP = '';

  // Closing the tab or pressing cancel aborts the upstream request, which makes the
  // Mac stop that yt-dlp run.
  var controller = new AbortController();
  res.on('close', function () { if (!res.writableFinished) controller.abort(); });

  var upstream;
  try {
    upstream = await fetch(REMOTE + '/download?url=' + encodeURIComponent(url), {
      headers: { 'X-Local-Download': '1', Authorization: 'Bearer ' + secret,
        'X-Download-Source': 'slowedrvb', 'X-Download-Visitor': visitor, 'X-Download-Client-IP': clientIP },
      signal: controller.signal,
    });
  } catch (e) {
    if (controller.signal.aborted) return;
    return send(res, 502, { detail: 'The download service is unavailable. Please try again shortly.' });
  }

  if (!upstream.ok && !/json/i.test(upstream.headers.get('content-type') || '')) {
    // Cloudflare answers with an HTML page when the Mac is offline or errors out.
    await upstream.body?.cancel();
    return send(res, upstream.status >= 500 ? 502 : upstream.status,
      { detail: 'The download service is unavailable. Please try again shortly.' });
  }

  res.statusCode = upstream.status;
  PASS_THROUGH.forEach(function (name) {
    var value = upstream.headers.get(name);
    if (value !== null) res.setHeader(name, value);
  });
  res.setHeader('Cache-Control', 'no-store');
  if (!upstream.body) return res.end();
  Readable.fromWeb(upstream.body)
    .on('error', function () { res.destroy(); })
    .pipe(res);
};

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
