import { test } from 'node:test';
import assert from 'node:assert/strict';
import {isSemanticCandidate, relativeEmbeddingScores, rankEmbeddingHints, topicCloseness, createRound, applyGuess, tokenState, mergeHints, useClue, revealRound, CLUE_LIMIT, getTitleProgress} from '../src/core.js';

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

test('only content words are eligible for model hints',()=>{
  for(const w of ['a','an','is','are','the','of','and','some','to','with','they','because','two'])assert.equal(isSemanticCandidate(w),false,w);
  for(const w of ['biology','insect','mosquito','animal','fly','physics','music'])assert.equal(isSemanticCandidate(w),true,w);
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

test('German model hints preserve function-word filtering and exact title guesses',()=>{
  const round=createRound({title:'November',extract:'November ist ein Monat, 1701 war ein Jahr.',language:'de'});
  applyGuess(round,'September',{november:.61,ist:1,ein:1});
  assert.equal(tokenState(round,'November').type,'near');
  assert.equal(tokenState(round,'ist').type,'hidden');
  assert.equal(tokenState(round,'ein').type,'hidden');
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

test('model hints retain strong candidates and bound the number of matches',()=>{
  const scores=[
    ['generic',.52,.9],['distant',.35,.3],['strongest',.91,.3],
    ...Array.from({length:8},(_,i)=>['related'+i,.85-i*.002,.3]),
    ...Array.from({length:12},(_,i)=>['background'+i,.26,.3]),
  ];
  const relative=relativeEmbeddingScores(scores);
  const ranked=rankEmbeddingHints(relative,.3);
  assert.equal(ranked[0][0],'strongest');
  assert.equal(ranked.length,6);
  assert.ok(ranked.every(([,score])=>score<=.67));
  assert.ok(ranked.every(([word])=>word!=='generic'&&word!=='distant'));
  assert.deepEqual(rankEmbeddingHints(relative,.02),[]);
  assert.deepEqual(rankEmbeddingHints(relativeEmbeddingScores(Array.from({length:20},(_,i)=>['word'+i,.85,.7])),.5,'de'),[]);
});

test('topic hints strengthen when title, article and passages agree',()=>{
  const weak=topicCloseness(.2,.4,[.19,.21,.12],'de');
  const close=topicCloseness(.49,.55,[.47,.53,.29],'de');
  assert.ok(weak>0&&weak<.42);
  assert.ok(close>.82);
  assert.equal(topicCloseness(.03,.95,[.04,.06,.02],'de'),0);
  assert.equal(topicCloseness(.02,.05,[.02,.03,.45],'en'),0);
});

test('borderline topic scores require lexical evidence across the article',()=>{
  assert.equal(topicCloseness(.15,.25,[.17,.13],'en',.10),0);
  assert.ok(topicCloseness(.15,.25,[.17,.13],'en',.27)>0);
});

test('topic support can admit a borderline word without accepting generic matches',()=>{
  const words=relativeEmbeddingScores([['borderline',.39,.2],['generic',.39,.8],...Array.from({length:8},(_,i)=>['background'+i,.2,.2])]);
  assert.deepEqual(rankEmbeddingHints(words,.3),[]);
  assert.deepEqual(rankEmbeddingHints(words,.3,'en',.6).map(([word])=>word),['borderline']);
});

test('showing the text after a win preserves the win and its time',()=>{
  const round=createRound({title:'Mond',extract:'Der Mond ist ein Satellit.',language:'de'});
  assert.equal(applyGuess(round,'Mond').won,true);
  const finishedAt=round.finishedAt;
  assert.equal(revealRound(round),true);
  assert.equal(round.finishedAt,finishedAt);
  assert.equal(round.abandoned,undefined);
  assert.equal(tokenState(round,'Satellit').type,'revealed');
});
