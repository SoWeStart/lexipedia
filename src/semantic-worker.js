/* Isolates model loading/inference from the UI thread. All inference is local in the browser. */
import {conceptBatch} from './concepts.js?v=7';
import {normalizeWord, tokenize, isWord, isSemanticCandidate, sameWord, calibratedEmbeddingScore} from './core.js?v=7';

let currentEpoch=0, language='en', targetWords=[], extractedVectors=new Map(), extractor=null, modelReady=false;
const MODELS={en:'Xenova/all-MiniLM-L6-v2',de:'Xenova/paraphrase-multilingual-MiniLM-L12-v2'};
const modelPromises=new Map();

function post(type,payload={}) {self.postMessage({type,epoch:currentEpoch,...payload});}
function uniqueWords(input,lang){
  return [...new Set(tokenize(input).filter(isWord).map(normalizeWord).filter(w=>w.length<=42 && isSemanticCandidate(w,lang)))];
}
function cosine(a,b){
  if(!a||!b||a.length!==b.length)return 0;
  let dot=0;for(let i=0;i<a.length;i++)dot+=a[i]*b[i];
  return Math.max(0,Math.min(1,dot));
}
async function embedBatch(model,words){
  const output=await model(words,{pooling:'mean',normalize:true});
  return output.tolist();
}
function ensureModel(lang){
  if(!modelPromises.has(lang)){
    const promise=(async()=>{
      const {pipeline,env}=await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1');
      env.allowLocalModels=false;
      return pipeline('feature-extraction',MODELS[lang],{device:'wasm',dtype:'q8'});
    })().catch(error=>{modelPromises.delete(lang);throw error;});
    modelPromises.set(lang,promise);
  }
  return modelPromises.get(lang);
}
async function init(epoch,text,lang){
  currentEpoch=epoch;
  language=lang;
  targetWords=uniqueWords(text,lang);
  extractedVectors=new Map();
  modelReady=false;
  try{
    const model=await ensureModel(lang);
    if(epoch!==currentEpoch)return;
    for(let i=0;i<targetWords.length;i+=12){
      if(epoch!==currentEpoch)return;
      const batch=targetWords.slice(i,i+12);
      const vectors=await embedBatch(model,batch);
      if(epoch!==currentEpoch)return;
      batch.forEach((word,j)=>extractedVectors.set(word,vectors[j]));
    }
    if(epoch===currentEpoch){
      extractor=model;
      modelReady=true;
      post('ready',{mode:'model'});
    }
  }catch{
    if(epoch===currentEpoch)post('ready',{mode:'basic'});
  }
}
async function score(epoch,guess,requestId){
  if(epoch!==currentEpoch)return;
  const word=normalizeWord(guess), candidate=isSemanticCandidate(word,language);
  const scores=candidate?conceptBatch(word,targetWords,language):{};
  if(modelReady&&candidate){
    try {
      const vector=(await embedBatch(extractor,[word]))[0];
      if(epoch!==currentEpoch)return;
      for(const target of targetWords){
        if(sameWord(word,target,language)) continue;
        const similarity=calibratedEmbeddingScore(cosine(vector,extractedVectors.get(target)));
        if(similarity>=0.38) scores[target]=Math.max(scores[target]||0,similarity);
      }
    }catch{
      // Keep the lexical hints if inference fails.
    }
  }
  if(epoch===currentEpoch)post('score',{requestId,guess:word,scores,mode:modelReady?'model':'basic'});
}
self.onmessage=e=>{
  const d=e.data;
  if(d.type==='init')void init(d.epoch,d.text,d.language==='de'?'de':'en');
  if(d.type==='score')void score(d.epoch,d.guess,d.requestId);
};
