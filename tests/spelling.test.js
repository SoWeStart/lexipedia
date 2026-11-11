import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spellingIssue} from '../src/spelling.js';

test('spelling suggestions accept German noun capitalization and retain unknown entries for editing',()=>{
  const checker={
    correct:word=>word==='Astronomie',
    suggest:word=>word==='Astonromie'?['Astronomie']:[],
  };
  assert.equal(spellingIssue(checker,'astronomie','de'),null);
  assert.deepEqual(spellingIssue(checker,'astonromie','de'),{suggestion:'Astronomie'});
  assert.deepEqual(spellingIssue(checker,'zzxq','de'),{suggestion:''});
  assert.equal(spellingIssue(checker,'1700','de'),null);
  assert.equal(spellingIssue(null,'astronomie','de'),null);
});
