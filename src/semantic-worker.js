/* Isolates model loading/inference from the UI thread. All inference is local in the browser. */
import {normalizeWord, tokenize, isWord, isSemanticCandidate, sameWord, rankEmbeddingHints, topicCloseness, relativeEmbeddingScores} from './core.js?v=12';
import {prepareSpelling,spellingIssue} from './spelling.js?v=12';

let currentEpoch=0, language='en', targetWords=[], extractedVectors=new Map(), extractor=null, modelReady=false;
let articleVector=null, titleVector=null, passageVectors=[], typicalities=new Map();
const MODELS={en:'Xenova/all-MiniLM-L6-v2',de:'Xenova/paraphrase-multilingual-MiniLM-L12-v2'};
const modelPromises=new Map();

function post(type,payload={}) {self.postMessage({type,epoch:currentEpoch,...payload});}
function uniqueWords(input,lang){
  return [...new Set(tokenize(input).filter(isWord).map(normalizeWord).filter(w=>w.length<=42 && isSemanticCandidate(w,lang)))];
}
function dotProduct(a,b){
  if(!a||!b||a.length!==b.length)return 0;
  let dot=0;for(let i=0;i<a.length;i++)dot+=a[i]*b[i];
  return dot;
}
async function embedBatch(model,words){
  const output=await model(words,{pooling:'mean',normalize:true});
  return output.tolist();
}
function wordInput(word,lang){
  return lang==='de'?word[0].toLocaleUpperCase('de')+word.slice(1):word;
}
function getTypicalities(vectors){
  const first=vectors.values().next().value;
  if(!first)return new Map();
  const mean=new Float64Array(first.length);
  for(const vector of vectors.values()){
    for(let i=0;i<mean.length;i++)mean[i]+=vector[i]/vectors.size;
  }
  return new Map([...vectors].map(([word,vector])=>[word,dotProduct(vector,mean)]));
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
async function init(epoch,text,title,lang){
  currentEpoch=epoch;
  language=lang;
  targetWords=uniqueWords(text,lang);
  extractedVectors=new Map();
  articleVector=null;titleVector=null;passageVectors=[];typicalities=new Map();
  modelReady=false;
  void prepareSpelling(lang);
  try{
    const model=await ensureModel(lang);
    if(epoch!==currentEpoch)return;
    for(let i=0;i<targetWords.length;i+=12){
      if(epoch!==currentEpoch)return;
      const batch=targetWords.slice(i,i+12);
      const vectors=await embedBatch(model,batch.map(word=>wordInput(word,lang)));
      if(epoch!==currentEpoch)return;
      batch.forEach((word,j)=>extractedVectors.set(word,vectors[j]));
    }
    const words=text.slice(0,1000).trim().split(/\s+/);
    const passages=[];
    for(let index=0;index<words.length-14;index+=45){
      passages.push(words.slice(index,index+55).join(' '));
    }
    const [context]=await embedBatch(model,[text.slice(0,1000)]);
    if(epoch!==currentEpoch)return;
    const [headline,...sections]=await embedBatch(model,[title,...passages]);
    if(epoch===currentEpoch){
      articleVector=context;
      titleVector=headline;
      passageVectors=sections;
      typicalities=getTypicalities(extractedVectors);
      extractor=model;
      modelReady=true;
      post('ready',{mode:'model'});
    }
  }catch{
    if(epoch===currentEpoch)post('ready',{mode:'basic'});
  }
}
async function score(epoch,guess,requestId,checkSpelling){
  if(epoch!==currentEpoch)return;
  const word=normalizeWord(guess), candidate=isSemanticCandidate(word,language);
  if(checkSpelling){
    let timer;
    const deadline=new Promise(resolve=>{timer=setTimeout(()=>resolve(null),2200);});
    const checker=await Promise.race([prepareSpelling(language),deadline]);
    clearTimeout(timer);
    if(epoch!==currentEpoch)return;
    const issue=spellingIssue(checker,word,language);
    if(issue){post('spelling',{requestId,...issue});return;}
  }
  const scores=Object.create(null);
  let topic=null;
  if(modelReady&&candidate){
    try {
      const vector=(await embedBatch(extractor,[wordInput(word,language)]))[0];
      if(epoch!==currentEpoch)return;
      const comparisons=targetWords.filter(target=>!sameWord(word,target,language))
        .map(target=>[target,dotProduct(vector,extractedVectors.get(target)),typicalities.get(target)]);
      const context=dotProduct(vector,articleVector);
      const relative=relativeEmbeddingScores(comparisons);
      const leaders=relative.slice(0,4);
      const evidence=leaders.length===4?leaders.reduce((sum,[,,prominence])=>sum+prominence,0)/4:0;
      topic=topicCloseness(context,dotProduct(vector,titleVector),passageVectors.map(passage=>dotProduct(vector,passage)),language,evidence);
      for(const [target,similarity] of rankEmbeddingHints(relative,context,language,topic))scores[target]=similarity;
    }catch{if(epoch===currentEpoch)post('ready',{mode:'basic'});}
  }
  if(epoch===currentEpoch)post('score',{requestId,guess:word,scores,topic});
}
self.onmessage=e=>{
  const d=e.data;
  if(d.type==='init')void init(d.epoch,d.text,d.title,d.language==='de'?'de':'en');
  if(d.type==='score')void score(d.epoch,d.guess,d.requestId,d.checkSpelling);
};
