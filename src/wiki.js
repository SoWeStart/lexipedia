import {ARTICLES, PRACTICE} from './articles.js';
import {seedIndex} from './core.js';

const API='https://en.wikipedia.org/w/api.php';
function queryUrl(args){ return `${API}?${new URLSearchParams({action:'query',prop:'extracts|pageimages|info',exintro:'1',explaintext:'1',exchars:'3600',pithumbsize:'600',inprop:'url',redirects:'1',format:'json',formatversion:'2',origin:'*',...args})}`; }
export function parseWikiResponse(json){
  const p=json?.query?.pages?.[0];
  if(!p || p.missing || !p.title || !p.extract)throw new Error('Wikipedia returned no suitable article');
  const text=p.extract.replace(/\[[0-9]+\]/g,'').replace(/\n{3,}/g,'\n\n').trim();
  if(text.length<220 || text.length>6000 || p.title.startsWith('List of ') || p.title.includes('(disambiguation)'))throw new Error('Unsuitable Wikipedia introduction');
  return {title:p.title,extract:text,source:p.fullurl||`https://en.wikipedia.org/wiki/${encodeURIComponent(p.title.replaceAll(' ','_'))}`,image:p.thumbnail?.source||''};
}
async function request(url,signal){
  const response=await fetch(url,{signal,cache:'no-cache'});
  if(!response.ok)throw new Error(`Wikipedia HTTP ${response.status}`);
  return parseWikiResponse(await response.json());
}
export async function fetchTitle(title,signal){
  return request(queryUrl({titles:title}),signal);
}
export async function fetchRandomArticle(signal){
  for(let i=0;i<7;i++){
    try { return await request(queryUrl({generator:'random',grnnamespace:'0',grnlimit:'1'}),signal); }
    catch(e){if(signal?.aborted)throw e;}
  }
  throw new Error('No suitable random article found');
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
export function practiceArticle(){return {...PRACTICE};}