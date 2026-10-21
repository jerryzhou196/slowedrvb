const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fetchPreferredAudio } = require('../download.js');
const video = 'https://www.youtube.com/watch?v=KfEEm4Zx-EU';
const defaults = { probeEndpoint: 'https://ec2.test/probe', primaryEndpoint: 'https://ec2.test/download', fallbackEndpoint: 'https://mac.test/download', wait: async () => {}, random: () => 0 };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const audio = () => new Response('audio', { headers: { 'content-type': 'audio/mp4' } });

test('healthy EC2 probe downloads from EC2 without touching Mac', async () => {
  const calls=[];
  const result=await fetchPreferredAudio(video,{...defaults,fetch:async (url, options)=>{
    calls.push(url);
    assert.equal(options.headers,undefined);
    return url.includes('/probe?') ? json({status:'ok'}) : audio();
  }});
  assert.equal(await result.blob.text(),'audio');
  assert.deepEqual(calls.map(url=>url.split('?')[0]),['https://ec2.test/probe','https://ec2.test/download']);
  assert.equal(new URL(calls[0]).searchParams.get('url'),video);
});

test('IP block from probe skips EC2 download and uses Mac', async () => {
  const calls=[];
  await fetchPreferredAudio(video,{...defaults,fetch:async (url,options)=>{
    calls.push(url.split('?')[0]);
    if(url.includes('/probe?'))return json({status:'ip_blocked',reason:'youtube_bot_or_ip_check'});
    assert.equal(options.headers['X-Local-Download'],'1');return audio();
  }});
  assert.deepEqual(calls,['https://ec2.test/probe','https://mac.test/download']);
});

test('block after successful probe switches once without retrying EC2', async () => {
  const calls=[];
  await fetchPreferredAudio(video,{...defaults,fetch:async url=>{
    calls.push(url.split('?')[0]);
    if(url.includes('/probe?'))return json({status:'ok'});
    if(url.includes('ec2.test'))return json({detail:{code:'youtube_ip_blocked',detail:'blocked'}},502);
    return audio();
  }});
  assert.deepEqual(calls,['https://ec2.test/probe','https://ec2.test/download','https://mac.test/download']);
});

test('unavailable video, server errors and malformed probe never trigger fallback', async () => {
  for(const reply of [()=>json({status:'video_unavailable'},404),()=>json({status:'error',reason:'probe_timeout'},503),()=>new Response('not JSON')]){
    let calls=0;
    await assert.rejects(fetchPreferredAudio(video,{...defaults,fetch:async()=>{calls++;return reply();}}));
    assert.equal(calls,1);
  }
});

test('probe timeout is bounded and does not trigger Mac fallback', async () => {
  let calls=0;
  await assert.rejects(fetchPreferredAudio(video,{...defaults,probeTimeoutMs:5,fetch:(_url,{signal})=>{
    calls++;return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError'))));
  }}),/timed out/);
  assert.equal(calls,1);
});

test('canceling a pending probe prevents both downloads', async () => {
  const controller=new AbortController();let calls=0;
  const task=fetchPreferredAudio(video,{...defaults,signal:controller.signal,fetch:(_url,{signal})=>{
    calls++;return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError'))));
  }});
  controller.abort();await assert.rejects(task,{name:'AbortError'});assert.equal(calls,1);
});

test('ordinary EC2 download failure does not silently fall back to Mac', async () => {
  const calls=[];
  await assert.rejects(fetchPreferredAudio(video,{...defaults,fetch:async url=>{
    calls.push(url.split('?')[0]);return url.includes('/probe?')?json({status:'ok'}):json({detail:'private video'},400);
  }}));
  assert.deepEqual(calls,['https://ec2.test/probe','https://ec2.test/download']);
});
