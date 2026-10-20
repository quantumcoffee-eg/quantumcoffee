import test from 'node:test';
import assert from 'node:assert/strict';
import { validateImageIntent, makeImageKey, hasCorrectImageSignature, imageUrl, checkVerifiedKeys } from '../src/media/config.js';

test('upload intent allows bounded photographic image types',()=> {
  assert.equal(validateImageIntent({contentType:'image/webp',size:1024}).extension,'webp');
  assert.throws(()=>validateImageIntent({contentType:'image/svg+xml',size:20}));
  assert.throws(()=>validateImageIntent({contentType:'image/png',size:5*1024*1024+1}));
  assert.throws(()=>validateImageIntent({contentType:'image/png',size:20,owner:'other'}));
});
test('storage keys are unpredictable, constrained and URL generation is safe',()=> {
  const key=makeImageKey('jpg');
  assert.match(key,/^catalog\/[a-f0-9]{40}\.jpg$/);
  assert.notEqual(makeImageKey('jpg'),key);
  assert.equal(imageUrl(key,{R2_PUBLIC_BASE_URL:'https://assets.quantum.example'}),`https://assets.quantum.example/${key}`);
  assert.equal(imageUrl('../../wrong',{R2_PUBLIC_BASE_URL:'https://assets.quantum.example'}),null);
});
test('image signatures reject non-image content',()=> {
  assert.equal(hasCorrectImageSignature('image/png',Buffer.from([137,80,78,71,13,10,26,10,5])),true);
  assert.equal(hasCorrectImageSignature('image/webp',Buffer.from('RIFF\u0000\u0000\u0000\u0000WEBP')) ,true);
  assert.equal(hasCorrectImageSignature('image/jpeg',Buffer.from([0xff,0xd8,0xff,0x10])),true);
  assert.equal(hasCorrectImageSignature('image/jpeg',Buffer.from('not an image')),false);
});
test('gallery validation requires verified distinct assets',async()=> {
  const a=makeImageKey('webp');
  await checkVerifiedKeys([a],{countDocuments:async()=>1});
  await assert.rejects(()=>checkVerifiedKeys([a],{countDocuments:async()=>0}),/verified/);
  await assert.rejects(()=>checkVerifiedKeys([a,a],{countDocuments:async()=>1}),/gallery/);
});
