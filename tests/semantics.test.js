import { test } from 'node:test';
import assert from 'node:assert/strict';
import {isSemanticCandidate, calibratedEmbeddingScore, createRound, applyGuess, tokenState, mergeHints} from '../src/core.js';
import {conceptBatch} from '../src/concepts.js';

test('function words never become semantic hints even with pathological model scores',()=>{
  const round=createRound({title:'Mosquito',extract:'A mosquito is an animal, and the insect flies.'});
  const guess=applyGuess(round,'animal',{a:.99,is:.99,an:.99,and:.99,the:.99,mosquito:.82,insect:.88});
  assert.equal(guess.accepted,true);
  for(const token of ['A','is','an','and','the']) assert.equal(tokenState(round,token).type,'hidden',`${token} must remain hidden`);
  assert.equal(tokenState(round,'insect').type,'near');
  assert.equal(tokenState(round,'animal').type,'exact');
});

test('a function-word guess can still reveal exact text, but not semantic neighbors',()=>{
  const round=createRound({title:'Whale',extract:'A whale is an animal in the ocean.'});
  applyGuess(round,'is',{animal:.99,ocean:.99,whale:.99});
  assert.equal(tokenState(round,'is').type,'exact');
  assert.equal(tokenState(round,'animal').type,'hidden');
  assert.equal(tokenState(round,'ocean').type,'hidden');
});

test('different output sources cannot bypass grammatical filtering',()=>{
  const round=createRound({title:'Nature',extract:'Is a bird an animal?'});
  mergeHints(round,'animal',{is:1,a:1,an:1,bird:.7});
  assert.deepEqual(Object.keys(round.hints),['bird']);
});

test('only content word pairs use raw embedding scores, with conservative calibration',()=>{
  for(const w of ['a','an','is','are','the','of','and','some','to','with','they','because','two'])assert.equal(isSemanticCandidate(w),false,w);
  for(const w of ['biology','insect','mosquito','animal','fly','physics','music'])assert.equal(isSemanticCandidate(w),true,w);
  assert.equal(calibratedEmbeddingScore(.40),0);
  assert.equal(calibratedEmbeddingScore(.65),0);
  assert.ok(calibratedEmbeddingScore(.8)>.38);
  assert.ok(calibratedEmbeddingScore(.9)>calibratedEmbeddingScore(.8));
});

test('biological topic progression is meaningful in the curated graph',()=>{
  const targets=['mosquito','insect','animal','mammal','physics','water'];
  const animal=conceptBatch('animal',targets);
  const insect=conceptBatch('insect',targets);
  assert.ok(insect.mosquito>animal.mosquito);
  assert.ok(animal.insect>animal.physics);
  assert.ok(animal.mammal>animal.physics);
  assert.equal(conceptBatch('mathematics',['biology']).biology,0, 'unrelated disciplines must not leak through science');
});