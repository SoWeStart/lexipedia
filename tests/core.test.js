import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeWord,stemWord,sameWord,tokenize,isWord,createRound,applyGuess,mergeHints,tokenState,getTitleProgress,encodeTitle,decodeTitle,seedIndex} from '../src/core.js';
import {conceptSimilarity,conceptBatch} from '../src/concepts.js';
import {parseWikiResponse,practiceArticle} from '../src/wiki.js';
import {ARTICLES} from '../src/articles.js';

test('normalization, case, and Unicode boundaries',()=>{
  assert.equal(normalizeWord('  (Mosquito!)  '),'mosquito');
  assert.equal(normalizeWord('  FLIES '),'flies');
  assert.equal(stemWord('flies'),'fly');
  assert.equal(stemWord('mosquitoes'),'mosquito');
  assert.equal(stemWord('running'),'run');
  assert.equal(stemWord('studies'),'study');
  assert.equal(sameWord('Fly','flies'),true);
  assert.equal(sameWord('MOSQUITO','mosquitoes'),true);
  assert.equal(sameWord('animal','insect'),false);
  assert.equal(sameWord('biology','geology'),false);
  assert.equal(sameWord('the','them'),false);
  assert.equal(stemWord('constructor'),'constructor');
  assert.equal(sameWord('news','new'),false);
  assert.equal(sameWord('series','sery'),false);
  assert.equal(sameWord('physics','physic'),false);
});

test('tokenizer preserves article punctuation and spaces',()=>{
  const tokens=tokenize('Mosquitoes, the Culicidae, are small flies (insect-like).');
  assert.equal(tokens.join(''),'Mosquitoes, the Culicidae, are small flies (insect-like).');
  assert.ok(tokens.includes('Mosquitoes'));
  assert.ok(tokens.includes('insect-like'));
  assert.ok(tokens.some(t=>!isWord(t)));
});

test('title needs exact guesses; near scores never reveal title',()=>{
  const round=createRound({title:'Mosquito',extract:'Mosquitoes are small insects. A mosquito can fly.'});
  assert.deepEqual(getTitleProgress(round),{total:1,found:0,complete:false});
  const near=applyGuess(round,'insect',{mosquito:.98,mosquitoes:.98,small:.45});
  assert.equal(near.won,false);
  assert.equal(tokenState(round,'Mosquito',true).type,'hidden');
  assert.equal(tokenState(round,'mosquitoes').type,'near');
  const win=applyGuess(round,'mosquito');
  assert.equal(win.won,true);
  assert.equal(tokenState(round,'Mosquito',true).type,'exact');
  assert.equal(tokenState(round,'mosquitoes').type,'exact');
  assert.ok(round.finishedAt);
});

test('only stronger hints replace prior hints',()=>{
  const round=createRound({title:'Bird',extract:'An owl is an animal.'});
  applyGuess(round,'nature',{owl:.44});
  assert.equal(tokenState(round,'owl').label,'nature');
  applyGuess(round,'animal',{owl:.31});
  assert.equal(tokenState(round,'owl').label,'nature');
  applyGuess(round,'eagle',{owl:.79});
  assert.equal(tokenState(round,'owl').label,'eagle');
  mergeHints(round,'nature',{owl:.4});
  assert.equal(tokenState(round,'owl').label,'eagle');
});

test('duplicate, invalid and post-win guesses are ignored',()=>{
  const round=createRound({title:'Fox',extract:'A fox is an animal.'});
  assert.equal(applyGuess(round,'two words').accepted,false);
  assert.equal(applyGuess(round,'animal').accepted,true);
  assert.equal(applyGuess(round,'animal').accepted,false);
  assert.equal(applyGuess(round,'fox').won,true);
  assert.equal(applyGuess(round,'extra').accepted,false);
  assert.deepEqual(round.guesses,['animal','fox']);
});

test('compound titles require all terms',()=>{
  const round=createRound({title:'Great Barrier Reef',extract:'The Great Barrier Reef is a coral reef.'});
  applyGuess(round,'great');applyGuess(round,'reef');
  assert.deepEqual(getTitleProgress(round),{total:3,found:2,complete:false});
  assert.equal(applyGuess(round,'barrier').won,true);
});

test('conceptual fallback has coherent biological hierarchy',()=>{
  const s=word=>conceptSimilarity(word,'mosquito');
  assert.ok(s('insect')>s('animal'));
  assert.ok(s('animal')>s('mammal'));
  assert.ok(s('animal')>s('mathematics'));
  assert.ok(conceptSimilarity('biology','insect')>0.3);
  assert.ok(conceptSimilarity('mosquito','malaria')>0.65);
  assert.ok(conceptBatch('nature',['insect','mathematics']).insect>0);
});

test('seed selection is deterministic and links handle unicode',()=>{
  assert.equal(seedIndex('abc-def',ARTICLES.length),seedIndex('abc-def',ARTICLES.length));
  assert.equal(decodeTitle(encodeTitle('Café (science)')),'Café (science)');
  assert.throws(()=>decodeTitle('!!!!'));
});

test('Wikipedia API response validation and offline practice',()=>{
  const text='Mosquitoes are small insects. '.repeat(20);
  const result=parseWikiResponse({query:{pages:[{title:'Mosquito',extract:text,fullurl:'https://en.wikipedia.org/wiki/Mosquito'}]}});
  assert.equal(result.title,'Mosquito');
  assert.ok(result.source.endsWith('/Mosquito'));
  assert.throws(()=>parseWikiResponse({query:{pages:[{title:'X',extract:'Too short'}]}}));
  assert.equal(practiceArticle().title,'Volcano');
});
