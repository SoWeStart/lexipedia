import {ARTICLES, PRACTICE} from './articles.js';
import {seedIndex} from './core.js?v=8';
import {candidateOrder,titleKey} from './pool.js?v=8';

function wikiHost(language){return language==='de'?'https://de.wikipedia.org':'https://en.wikipedia.org';}
class UnsuitableArticle extends Error {}
function queryUrl(args,language){ return `${wikiHost(language)}/w/api.php?${new URLSearchParams({action:'query',prop:'extracts|pageimages|info|pageprops',ppprop:'disambiguation',exintro:'1',explaintext:'1',exchars:'1200',pithumbsize:'600',inprop:'url',redirects:'1',format:'json',formatversion:'2',origin:'*',...args})}`; }
export function parseWikiResponse(json,{curated=false,language='en'}={}){
  if(json?.error)throw new Error('Wikipedia API error');
  const p=json?.query?.pages?.[0];
  if(!p || p.missing || !p.title || !p.extract)throw new UnsuitableArticle('Wikipedia returned no suitable article');
  const text=p.extract.replace(/^\s*(?:Vorlage|Template):[^\n]*\n/gm,'').replace(/\[[0-9]+\]/g,'').replace(/\n{3,}/g,'\n\n').trim();
  if(text.length<220 || text.length>6000 || /^(List of |Liste )|\((disambiguation|Begriffsklärung)\)$/i.test(p.title))throw new UnsuitableArticle('Unsuitable Wikipedia introduction');
  if(curated){
    const words=text.toLowerCase().match(/\p{L}{3,}/gu)??[];
    if(p.ns!==0 || Object.hasOwn(p.pageprops??{},'disambiguation') ||
      words.length<55 || new Set(words).size<35){
      throw new UnsuitableArticle('Wikipedia article does not meet pool quality criteria');
    }
  }
  return {title:p.title,extract:text,source:p.fullurl||`${wikiHost(language)}/wiki/${encodeURIComponent(p.title.replaceAll(' ','_'))}`,image:p.thumbnail?.source||'',language};
}
async function request(url,signal,options){
  const response=await fetch(url,{signal,cache:'no-cache'});
  if(!response.ok)throw new Error(`Wikipedia HTTP ${response.status}`);
  return parseWikiResponse(await response.json(),options);
}
export async function fetchTitle(title,signal,language='en'){
  return request(queryUrl({titles:title},language),signal,{language});
}
export async function fetchCuratedArticle(history,signal,random=Math.random,language='en'){
  const played=new Map([...new Set(history.map(titleKey))].map((key,index)=>[key,index]));
  const tried=new Set();
  let oldest;
  const order=candidateOrder(history,random,language);
  for(const title of order){
    signal?.throwIfAborted();
    if(tried.has(titleKey(title)))continue;
    let article;
    try {
      article=await request(queryUrl({titles:title},language),signal,{curated:true,language});
    }catch(error){
      if(!(error instanceof UnsuitableArticle) || signal?.aborted)throw error;
      continue;
    }
    const key=titleKey(article.title);
    tried.add(key);
    if(!played.has(key))return article;
    const position=played.get(key);
    if(!oldest || position>oldest.position){
      oldest={article,position};
    }
    // A canonical match here is already ordered by recency among known titles.
    if(played.has(titleKey(title)) && key===titleKey(title))return oldest.article;
  }
  if(oldest)return oldest.article;
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
