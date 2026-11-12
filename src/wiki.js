import {ARTICLES, PRACTICE} from './articles.js';
import {seedIndex} from './core.js?v=17';
import {candidateOrder,titleKey} from './pool.js?v=17';

function wikiHost(language){return language==='de'?'https://de.wikipedia.org':'https://en.wikipedia.org';}
class UnsuitableArticle extends Error {}
function queryUrl(args,language){ return `${wikiHost(language)}/w/api.php?${new URLSearchParams({action:'query',prop:'extracts|pageimages|info|pageprops',ppprop:'disambiguation|wikibase_item',explaintext:'1',pithumbsize:'600',inprop:'url',redirects:'1',format:'json',formatversion:'2',origin:'*',...args})}`; }
const MAX_EXCERPT=2400;
const MAX_PARAGRAPHS=4;
function cleanExtract(text){
  return text.replace(/^\s*(?:Vorlage|Template):[^\n]*\n/gm,'').replace(/\[[0-9]+\]/g,'').trim();
}
function excerpt(text,language){
  const paragraphs=[];
  let remaining=MAX_EXCERPT;
  for(const part of text.split(/\n+/).map(line=>line.trim()).filter(Boolean)){
    if(paragraphs.length===MAX_PARAGRAPHS||remaining<=0)break;
    if(part.length<=remaining){
      paragraphs.push(part);remaining-=part.length+2;
      continue;
    }
    const sentences=typeof Intl.Segmenter==='function'
      ?[...new Intl.Segmenter(language,{granularity:'sentence'}).segment(part)].map(({segment})=>segment)
      :part.match(/[^.!?]+[.!?]+(?:\s+|$)/g)??[];
    let partial='';
    for(const sentence of sentences){
      if(partial.length+sentence.length>remaining)break;
      partial+=sentence;
    }
    if(partial.trim())paragraphs.push(partial.trim());
    else if(!paragraphs.length)paragraphs.push(part.slice(0,remaining-1).replace(/\s+\S*$/,'')+'…');
    break;
  }
  return paragraphs.join('\n\n');
}
export function parseWikiResponse(json,{curated=false,language='en'}={}){
  if(json?.error)throw new Error('Wikipedia API error');
  const p=json?.query?.pages?.[0];
  if(!p || p.missing || !p.title || !p.extract)throw new UnsuitableArticle('Wikipedia returned no suitable article');
  const text=excerpt(cleanExtract(p.extract),language);
  if(text.length<220 || /^(List of |Liste )|\((disambiguation|Begriffsklärung)\)$/i.test(p.title))throw new UnsuitableArticle('Unsuitable Wikipedia introduction');
  if(curated){
    const words=text.toLowerCase().match(/\p{L}{3,}/gu)??[];
    if(p.ns!==0 || Object.hasOwn(p.pageprops??{},'disambiguation') ||
      words.length<55 || new Set(words).size<35){
      throw new UnsuitableArticle('Wikipedia article does not meet pool quality criteria');
    }
  }
  return {title:p.title,extract:text,source:p.fullurl||`${wikiHost(language)}/wiki/${encodeURIComponent(p.title.replaceAll(' ','_'))}`,image:p.thumbnail?.source||'',language,item:p.pageprops?.wikibase_item??null};
}
async function request(url,signal){
  const response=await fetch(url,{signal,cache:'no-cache'});
  if(!response.ok)throw new Error(`Wikipedia HTTP ${response.status}`);
  return response.json();
}
async function extendArticle(article,signal){
  if(article.extract.length>=1200||article.extract.split('\n\n').length>=3)return article;
  try{
    const deadline=AbortSignal.timeout(3500);
    const extensionSignal=signal?AbortSignal.any([signal,deadline]):deadline;
    const json=await request(queryUrl({titles:article.title,prop:'extracts',exsentences:'10',exsectionformat:'wiki'},article.language),extensionSignal);
    const extract=json?.query?.pages?.[0]?.extract;
    if(typeof extract!=='string')return article;
    const [,section]=cleanExtract(extract).split(/^={2,}[^\n]+={2,}[ \t]*$/gm);
    if(!section?.trim())return article;
    return {...article,extract:excerpt(article.extract+'\n\n'+section,article.language)};
  }catch(error){
    if(signal?.aborted)throw error;
    return article;
  }
}
export async function fetchTitle(title,signal,language='en'){
  const data=await request(queryUrl({titles:title,exintro:'1'},language),signal);
  return extendArticle(parseWikiResponse(data,{language}),signal);
}
export async function fetchCuratedArticle(history,signal,random=Math.random,language='en',recentItems=[]){
  const played=new Map([...new Set(history.map(titleKey))].map((key,index)=>[key,index]));
  const tried=new Set();
  const recent=new Set(recentItems);
  let oldest,recentTranslation;
  const order=candidateOrder(history,random,language);
  for(const title of order){
    signal?.throwIfAborted();
    if(tried.has(titleKey(title)))continue;
    let article;
    try {
      const data=await request(queryUrl({titles:title,exintro:'1'},language),signal);
      article=parseWikiResponse(data,{curated:true,language});
    }catch(error){
      if(!(error instanceof UnsuitableArticle) || signal?.aborted)throw error;
      continue;
    }
    const key=titleKey(article.title);
    tried.add(key);
    if(!played.has(key)){
      if(!recent.has(article.item))return extendArticle(article,signal);
      recentTranslation??=article;
      continue;
    }
    const position=played.get(key);
    if(!oldest || position>oldest.position){
      oldest={article,position};
    }
    // A canonical match here is already ordered by recency among known titles.
    if(played.has(titleKey(title)) && key===titleKey(title))return extendArticle(recentTranslation??oldest.article,signal);
  }
  if(recentTranslation||oldest)return extendArticle(recentTranslation??oldest.article,signal);
  throw new Error('No suitable curated article found');
}
export async function fetchSeededArticle(seed,signal){
  // Deterministic fallback trials: friends opening the same seed obtain the same article.
  const index=seedIndex(seed,ARTICLES.length);
  for(let i=0;i<6;i++){
    const title=ARTICLES[(index+i*37)%ARTICLES.length];
    try { return await fetchTitle(title,signal); }
    catch(e){if(signal?.aborted)throw e;}
  }
  throw new Error('Wikipedia temporarily unavailable');
}
const GERMAN_PRACTICE={
  title:'Vulkan',
  source:'',
  seed:'practice',
  extract:'Ein Vulkan ist eine Öffnung in der Kruste eines Planeten. Durch diese Öffnung können Lava, Gase und Asche aus dem Inneren an die Oberfläche gelangen. Viele Vulkane liegen dort, wo sich Erdplatten aufeinander zu oder voneinander weg bewegen. Bei einem Ausbruch können sich Lavaströme bilden und Aschewolken entstehen. Unter Wasser kann ein Vulkan im Laufe der Zeit eine Insel aufbauen. Forschende beobachten Erdbeben, Gase und Veränderungen an der Oberfläche, um mögliche Ausbrüche früh zu erkennen.',
};
export function practiceArticle(language='en'){return {...(language==='de'?GERMAN_PRACTICE:PRACTICE),language};}
