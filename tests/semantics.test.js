import { test } from 'node:test';
import assert from 'node:assert/strict';
import {isSemanticCandidate, calibratedEmbeddingScore, createRound, applyGuess, tokenState, mergeHints, useClue, revealRound, CLUE_LIMIT, getTitleProgress} from '../src/core.js';
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

test('nearby years show the guess and closer guesses replace it',()=>{
  const round=createRound({title:'1701',extract:'The events of 1701 followed those of 1699 and 1650.'});
  applyGuess(round,'1700');
  assert.equal(tokenState(round,'1701').label,'1700');
  assert.equal(tokenState(round,'1701').type,'near');
  assert.equal(tokenState(round,'1701',true).type,'hidden');
  assert.equal(tokenState(round,'1650').type,'hidden');
  assert.equal(tokenState(round,'1699').type,'near');
  applyGuess(round,'1708');
  assert.equal(tokenState(round,'1701').label,'1700');
  assert.equal(applyGuess(round,'1701').won,true);
  assert.equal(tokenState(round,'1701').type,'exact');
});

test('exact small numbers work without generating numeric hints from the model',()=>{
  const round=createRound({title:'Example',extract:'There were 12 groups of 13 people in 1701.'});
  applyGuess(round,'12',{13:.95,1701:.95});
  assert.equal(tokenState(round,'12').type,'exact');
  assert.equal(tokenState(round,'13').type,'hidden');
  assert.equal(tokenState(round,'1701').type,'hidden');
});

test('calendar hints work without the model and preserve the function-word filter',()=>{
  const targets=['november','september','may','months','monday','year','physics','is'];
  for(const guess of ['september','month','months','calendar']){
    const round=createRound({title:'November',extract:'November is a month and may be rainy.'});
    applyGuess(round,guess,conceptBatch(guess,targets));
    assert.equal(tokenState(round,'November').type,'near',guess);
    assert.equal(tokenState(round,'November',true).type,'hidden');
    assert.equal(tokenState(round,'may').type,'hidden');
    assert.equal(tokenState(round,'is').type,'hidden');
  }
  assert.ok(conceptBatch('monday',['friday']).friday>=.38);
  assert.ok(conceptBatch('summer',['winter']).winter>=.38);
  assert.ok(conceptBatch('blue',['red']).red>=.38);
  assert.equal(conceptBatch('september',['monday']).monday,0);
});

test('German clues use German categories and function-word filtering',()=>{
  const round=createRound({title:'November',extract:'November ist ein Monat, 1701 war ein Jahr.',language:'de'});
  applyGuess(round,'September',{...conceptBatch('September',['november'],'de'),ist:1,ein:1});
  assert.equal(tokenState(round,'November').type,'near');
  assert.equal(tokenState(round,'ist').type,'hidden');
  assert.equal(tokenState(round,'ein').type,'hidden');
  assert.ok(conceptBatch('Monate',['November'],'de').November>=.38);
  applyGuess(round,'1700');
  assert.equal(tokenState(round,'1701').type,'near');
  assert.equal(applyGuess(round,'NOVEMBER').won,true);
});

test('three individual letter clues persist and revealing the article ends the round without a win',()=>{
  const round=createRound({title:'Vulkan',extract:'Ein Vulkan hat Lava.',language:'de'});
  assert.equal(useClue(round,'t:0'),true);
  assert.equal(useClue(round,'t:0'),false);
  assert.equal(tokenState(round,'Vulkan',true).type,'hidden');
  assert.equal(useClue(round,'p:0:4'),true);
  const restored=JSON.parse(JSON.stringify(round));
  assert.equal(useClue(restored,'p:0:6'),true);
  assert.equal(restored.clues.length,CLUE_LIMIT);
  assert.equal(useClue(restored,'p:0:0'),false);
  assert.equal(revealRound(restored),true);
  assert.equal(tokenState(restored,'Vulkan',true).type,'revealed');
  assert.equal(tokenState(restored,'Lava').type,'revealed');
  assert.equal(getTitleProgress(restored).complete,false);
  assert.equal(applyGuess(restored,'Vulkan').accepted,false);
  assert.equal(revealRound(restored),false);
});
