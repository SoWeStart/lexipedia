/* Isolates model loading/inference from the UI thread. All inference is local in the browser. */
import {conceptBatch} from './concepts.js';
import {normalizeWord, tokenize, isWord, isSemanticCandidate, sameWord, calibratedEmbeddingScore} from './core.js';

let currentEpoch=0, targetWords=[], extractedVectors=new Map(), extractor=null, extractorPromise=null;
const DIM=384;

function post(type,payload={}) {self.postMessage({type,epoch:currentEpoch,...payload});}
function uniqueWords(input){
  return [...new Set(tokenize(input).filter(isWord).map(normalizeWord).filter(w=>w.length<=42 && isSemanticCandidate(w)))];
}
function cosine(a,b){
  if(!a||!b||a.length!==b.length)return 0;
  let dot=0;for(let i=0;i<a.length;i++)dot+=a[i]*b[i];
  return Math.max(0,Math.min(1,dot));
}
async function embedBatch(words){
  const output=await extractor(words,{pooling:'mean',normalize:true});
  return output.tolist();
}
async function ensureModel(){
  if(extractor)return extractor;
  if(!extractorPromise){
    extractorPromise=(async()=>{
      post('status',{message:'Sprachmodell wird geladen (einmalig ca. 23 MB) …'});
      const {pipeline,env}=await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1');
      env.allowLocalModels=false;
      extractor=await pipeline('feature-extraction','Xenova/all-MiniLM-L6-v2',{device:'wasm',dtype:'q8'});
      return extractor;
    })().catch(e=>{extractorPromise=null;throw e;});
  }
  return extractorPromise;
}
async function init(epoch,text){
  currentEpoch=epoch;
  targetWords=uniqueWords(text);
  extractedVectors=new Map();
  post('ready',{mode:'basic',detail:'Grundmodus verfügbar; semantisches Modell wird geladen.'});
  try{
    await ensureModel();
    if(epoch!==currentEpoch)return;
    post('status',{message:`Berechne ${targetWords.length} Wortvektoren …`});
    for(let i=0;i<targetWords.length;i+=12){
      if(epoch!==currentEpoch)return;
      const batch=targetWords.slice(i,i+12);
      const vectors=await embedBatch(batch);
      if(epoch!==currentEpoch)return;
      batch.forEach((word,j)=>extractedVectors.set(word,vectors[j]));
      if(i%48===0)post('status',{message:`Wortvektoren: ${Math.min(i+12,targetWords.length)} / ${targetWords.length}`});
    }
    if(epoch===currentEpoch)post('ready',{mode:'model',detail:'Semantik-Modell bereit (lokal im Browser).'});
  }catch(error){
    if(epoch===currentEpoch)post('ready',{mode:'basic',detail:'Sprachmodell nicht verfügbar. Grundmodus ist aktiv.',error:String(error)});
  }
}
async function score(epoch,guess,requestId){
  if(epoch!==currentEpoch)return;
  const word=normalizeWord(guess), scores=isSemanticCandidate(word)?conceptBatch(word,targetWords):{};
  if(extractor&&extractedVectors.size){
    try {
      if (isSemanticCandidate(word)) {
        const vector=(await embedBatch([word]))[0];
        for(const target of targetWords){
          if(sameWord(word,target)) continue;
          const similarity=calibratedEmbeddingScore(cosine(vector,extractedVectors.get(target)));
          if(similarity>=0.38) scores[target]=Math.max(scores[target]||0,similarity);
        }
      }
    }catch(error){post('status',{message:'Ein Vektorvergleich ist fehlgeschlagen. Grundmodus weiterhin verfügbar.'});}
  }
  if(epoch===currentEpoch)post('score',{requestId,guess:word,scores,mode:extractedVectors.size?'model':'basic'});
}
self.onmessage=e=>{
  const d=e.data;
  if(d.type==='init')void init(d.epoch,d.text);
  if(d.type==='score')void score(d.epoch,d.guess,d.requestId);
};