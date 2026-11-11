import {normalizeWord, tokenState, tokenize, isWord, createRound, getTitleProgress, applyGuess, mergeHints, sameWord, isSemanticCandidate, formatElapsed, titleWords, encodeTitle, decodeTitle} from './core.js?v=4';
import {conceptBatch} from './concepts.js?v=4';
import {strings} from './language.js';
import {titleKey} from './pool.js';
import {fetchSeededArticle,fetchCuratedArticle,fetchTitle,practiceArticle} from './wiki.js';

const $=id=>document.getElementById(id);
const ui={form:$('guessForm'),input:$('guessInput'),submit:$('submitButton'),message:$('message'),history:$('history'),guessCount:$('guessCount'),elapsed:$('elapsed'),titleProgress:$('titleProgress'),maskedTitle:$('maskedTitle'),articleText:$('articleText'),articleBadge:$('articleBadge'),sourceLink:$('sourceLink')};
const STORE_PREFIX='lexipedia:v1:';
const SEMANTIC_VERSION=3;
let round=null,activeRoute='',epoch=0,controller=null,worker=null,serial=0,pending=new Map(),busy=false;

function safeStorageGet(key){try{return localStorage.getItem(key)}catch{return null}}
function safeStorageSet(key,val){try{localStorage.setItem(key,val)}catch{/*Storage optional*/}}
function routeInfo(){
  const p=new URLSearchParams(location.search);
  const t=p.get('t'),s=p.get('seed');
  if(t){
    const id=p.get('round');
    try{return {kind:'title',title:decodeTitle(t),key:'t:'+t+(/^[a-z0-9-]{4,40}$/i.test(id??'')?':'+id:'')}}catch{/*Invalid link*/}
  }
  if(s&&/^[a-z0-9-]{4,40}$/i.test(s))return {kind:'seed',seed:s,key:'s:'+s};
  return null;
}
function setTitleRoute(title){
  const code=encodeTitle(title),id=makeSeed(),url=new URL(location.href);
  url.search='';url.searchParams.set('t',code);url.searchParams.set('round',id);history.replaceState({},'',url);
  return {kind:'title',title,key:'t:'+code+':'+id};
}
function makeSeed(){const data=crypto.getRandomValues(new Uint32Array(2));return Array.from(data,n=>n.toString(36)).join('-');}
function lastGames(){
  try{
    const stored=JSON.parse(safeStorageGet('lexipedia:seen')||'[]');
    return Array.isArray(stored)?stored.filter(title=>typeof title==='string'):[];
  }catch{return []}
}
let seen=lastGames();
function roundHistory(){
  const titles=new Map();
  for(const title of [...lastGames(),...seen]){
    const key=titleKey(title);
    if(!titles.has(key))titles.set(key,title);
  }
  return [...titles.values()];
}
function addSeen(title){
  const key=titleKey(title);
  seen=[title,...roundHistory().filter(value=>titleKey(value)!==key)];
  safeStorageSet('lexipedia:seen',JSON.stringify(seen));
}
let language=safeStorageGet('lexipedia:language')==='en'?'en':'de';
let message={key:'',kind:'',args:[]};
let articleStatus='';
function tr(key,...args){
  const value=strings[language][key];
  return typeof value==='function'?value(...args):value;
}
function renderMessage(){
  ui.message.textContent=message.key?tr(message.key,...message.args):'';
  ui.message.className='message'+(message.kind?' '+message.kind:'');
  ui.message.hidden=!message.key;
}
function showMessage(key='',kind='',...args){
  message={key,kind,args};
  renderMessage();
}
function renderArticleStatus(){
  if(!articleStatus)return;
  const status=document.createElement('div');
  status.className=articleStatus==='loading'?'article-loading':'article-error';
  status.lang=language;
  status.textContent=tr(articleStatus);
  ui.articleText.replaceChildren(status);
}
function setLanguage(value){
  language=value;
  safeStorageSet('lexipedia:language',value);
  document.documentElement.lang=value;
  for(const node of document.querySelectorAll('[data-text]'))node.textContent=tr(node.dataset.text);
  for(const node of document.querySelectorAll('[data-label]'))node.setAttribute('aria-label',tr(node.dataset.label));
  for(const node of document.querySelectorAll('[data-placeholder]'))node.placeholder=tr(node.dataset.placeholder);
  for(const button of document.querySelectorAll('[data-language]')){
    button.setAttribute('aria-pressed',String(button.dataset.language===value));
  }
  if(round){
    renderAll();
    if(round.finishedAt)renderWin();
  }else renderArticleStatus();
  renderMessage();
}
function showToast(message){const item=document.createElement('div');item.className='toast';item.textContent=message;document.body.append(item);setTimeout(()=>item.remove(),2500);}
function save(){if(round&&activeRoute)safeStorageSet(STORE_PREFIX+activeRoute,JSON.stringify(round));}
function loadSaved(key){try{
  const raw=safeStorageGet(STORE_PREFIX+key);if(!raw)return null;
  const r=JSON.parse(raw);
  if(!r || typeof r.title!=='string' || typeof r.extract!=='string' || !Array.isArray(r.guesses) || !r.hints)return null;
  if(r.semanticVersion!==SEMANTIC_VERSION){
    r.hints={}; r.semanticVersion=SEMANTIC_VERSION;
    for(const guess of r.guesses)mergeHints(r,guess,conceptBatch(guess,getUniqueWords(r.extract)));
  }
  return r;
}catch{return null}}
function getUniqueWords(text){return [...new Set(tokenize(text).filter(isWord).map(normalizeWord))].filter(isSemanticCandidate);}
function setBusy(value){busy=value;ui.submit.disabled=value;ui.input.disabled=value;}
function prepareSemantic(){
  if(!round)return;
  const current=epoch;
  round.semanticVersion=SEMANTIC_VERSION;
  if(worker){worker.postMessage({type:'init',epoch:current,text:round.extract});}
}
function ensureWorker(){
  try{
    worker=new Worker(new URL('./semantic-worker.js?v=4',import.meta.url),{type:'module'});
    worker.onmessage=e=>{
      const d=e.data;
      if(d.epoch!==epoch)return;
      if(d.type==='ready'){
        if(d.mode==='model'){
          for(const word of (round?.guesses||[])) requestScore(word,true);
        }
        return;
      }
      if(d.type==='score'){
        const request=pending.get(d.requestId);if(!request)return;
        pending.delete(d.requestId);
        if(request.replay){mergeHints(round,d.guess,d.scores);save();renderArticle();renderHistory();}
        else finishGuess(d.guess,d.scores);
      }
    };
    worker.onerror=()=>{worker?.terminate();worker=null;
      for(const request of pending.values())if(!request.replay)finishGuess(request.word,conceptBatch(request.word,getWords()));
      pending.clear();
    };
  }catch{worker=null;}
}
function getWords(){return getUniqueWords(round?.extract||'');}
function requestScore(word,replay=false){
  if(!round)return;
  if(!worker){const scores=conceptBatch(word,getWords());if(replay){mergeHints(round,word,scores);renderArticle();renderHistory();}else finishGuess(word,scores);return;}
  const requestId=++serial;
  pending.set(requestId,{word,replay});worker.postMessage({type:'score',epoch,guess:word,requestId});
}
function enableLengthPeek(span,token){
  const length=[...token].length;
  span.dataset.length=String(length);
  span.tabIndex=0;
  span.setAttribute('role','button');
  span.setAttribute('aria-label',tr('length',length));
  span.lang=language;
  let timer;
  const peek=()=>{
    clearTimeout(timer);
    span.classList.add('length-peek');
    timer=setTimeout(()=>span.classList.remove('length-peek'),1800);
  };
  span.addEventListener('click',peek);
  span.addEventListener('keydown',event=>{
    if(event.key==='Enter'||event.key===' '){event.preventDefault();peek();}
  });
}
function createArticleWord(token,inTitle=false){
  const state=tokenState(round,token,inTitle);
  if(state.type==='punct')return document.createTextNode(token);
  const span=document.createElement('span');span.className='word '+state.type;
  if(state.type==='hidden'){
    const len=[...token].length;
    span.style.width=`${Math.min(21,Math.max(1.5,len*.67))}ch`;
    enableLengthPeek(span,token);
  }else if(state.type==='exact')span.textContent=token;
  else if(state.type==='near'){
    span.textContent=state.label;
    span.classList.add(state.score>=.65?'high':state.score>=.49?'med':'low');
    span.title=tr('hint',state.label);
    enableLengthPeek(span,token);
  }
  return span;
}
function renderArticle(){
  if(!round)return;
  $('shareButton').disabled=activeRoute==='practice';
  const title=document.createDocumentFragment();
  for(const part of tokenize(round.title))title.append(createArticleWord(part,true));
  ui.maskedTitle.replaceChildren(title);
  const solved=getTitleProgress(round).complete;
  ui.maskedTitle.lang=solved?'en':language;
  ui.maskedTitle.setAttribute('aria-label',solved?round.title:tr('hiddenTitle'));
  const container=document.createDocumentFragment();
  for(const paragraph of round.extract.split(/\n\s*\n|\n/)){
    if(!paragraph.trim())continue;
    const p=document.createElement('p');
    for(const t of tokenize(paragraph))p.append(createArticleWord(t));
    container.append(p);
  }
  ui.articleText.replaceChildren(container);
  ui.sourceLink.href=round.source||'https://en.wikipedia.org/';
  ui.sourceLink.hidden=!round.finishedAt||!round.source;
  ui.articleBadge.textContent=round.finishedAt?tr('solved'):'';ui.articleBadge.hidden=!round.finishedAt;ui.articleBadge.classList.toggle('done',!!round.finishedAt);
}
function exactHits(guess){return tokenize(round.extract).filter(x=>isWord(x)&&sameWord(x,guess)).length;}
function semanticHits(guess){return Object.values(round.hints).filter(x=>x.guess===guess).length;}
function renderHistory(){
  if(!round)return;
  const fragment=document.createDocumentFragment();
  for(let i=round.guesses.length-1;i>=0;i--){
    const guess=round.guesses[i],ex=exactHits(guess),ne=semanticHits(guess);
    const row=document.createElement('div');row.className='history-item '+(ex?'found':ne?'related':'');
    const n=document.createElement('span');n.className='history-number';n.textContent=`${i+1}.`;
    const word=document.createElement('span');word.className='history-word';word.textContent=guess;
    const count=document.createElement('span');count.className='history-meta';count.textContent=[ex?tr('exactCount',ex):'',ne?tr('hintCount',ne):''].filter(Boolean).join(' · ')||tr('noHit');
    row.append(n,word,count);fragment.append(row);
  }
  ui.history.replaceChildren(fragment);
}
function renderStats(){
  if(!round)return;
  ui.guessCount.textContent=round.guesses.length;
  const p=getTitleProgress(round);
  ui.titleProgress.textContent=`${p.found} / ${p.total}`;
  const diff=(round.finishedAt||Date.now())-round.startedAt;
  ui.elapsed.textContent=formatElapsed(diff);
}
function renderAll(){renderStats();renderArticle();renderHistory();}
function finishGuess(word,scores){
  if(!round)return;
  const result=applyGuess(round,word,scores);
  setBusy(false);
  if(!result.accepted){showMessage('oneWord','error');return;}
  save();renderAll();
  showMessage('guessFeedback','',exactHits(word),semanticHits(word));
  if(result.won)showWin();
  ui.input.value='';ui.input.focus({preventScroll:true});
}
function renderWin(){
  $('winTitle').textContent=round.title;
  $('winStats').textContent=tr('result',round.guesses.length,formatElapsed(round.finishedAt-round.startedAt));
}
function showWin(){
  renderWin();
  if(!$('winDialog').open)$('winDialog').showModal();
}
async function startRound({route=null}={}){
  epoch++;const captured=epoch;
  if(controller)controller.abort();controller=new AbortController();
  pending.clear();setBusy(true);articleStatus='';showMessage();
  let info=route;
  if(info?.key){activeRoute=info.key;const old=loadSaved(info.key);
    if(old){round=old;addSeen(old.title);setBusy(false);renderAll();prepareSemantic();return;}
  }
  round=null;articleStatus='loading';renderArticleStatus();
  ui.maskedTitle.textContent='••••••••';
  ui.maskedTitle.lang=language;
  ui.maskedTitle.setAttribute('aria-label',tr('hiddenTitle'));
  ui.articleBadge.hidden=true;ui.sourceLink.hidden=true;ui.history.replaceChildren();
  ui.guessCount.textContent='0';ui.elapsed.textContent='00:00';ui.titleProgress.textContent='–';
  $('shareButton').disabled=true;
  try{
    let article;
    if(!info)article=await fetchCuratedArticle(roundHistory(),controller.signal);
    else if(info?.kind==='title')article=await fetchTitle(info.title,controller.signal);
    else article=await fetchSeededArticle(info.seed,controller.signal);
    if(captured!==epoch)return;
    if(!info)info=setTitleRoute(article.title);
    activeRoute=info.key;
    const prior=loadSaved(info.key);
    round=prior||createRound({...article,seed:info.kind==='seed'?info.seed:null});
    round.semanticVersion=SEMANTIC_VERSION;
    addSeen(article.title);
    save();setBusy(false);renderAll();prepareSemantic();
    ui.input.focus({preventScroll:true});
  }catch(error){
    if(captured!==epoch || controller.signal.aborted)return;
    if(info?.kind==='title'){
      articleStatus='loadError';renderArticleStatus();setBusy(false);return;
    }
    const article=practiceArticle();
    activeRoute='practice';round=createRound(article);round.semanticVersion=SEMANTIC_VERSION;setBusy(false);renderAll();prepareSemantic();
    showMessage('practice','error');
  }
}
async function shareText(text){
  try{
    if(navigator.share){await navigator.share({text});return;}
    if(navigator.clipboard){await navigator.clipboard.writeText(text);showToast(tr('copied'));return;}
    window.prompt(tr('copy'),text);
  }catch(e){if(e?.name!=='AbortError')window.prompt(tr('copy'),text);}
}
function challengeUrl(){return activeRoute==='practice'?location.origin+location.pathname:location.href;}
function shareChallenge(){if(round) return shareText(tr('challenge')+'\n'+challengeUrl());}
function shareResult(){return shareText(tr('result',round.guesses.length,formatElapsed(round.finishedAt-round.startedAt))+'\n'+challengeUrl());}
function closeDialog(id){const dlg=$(id);if(dlg.open)dlg.close();}
function setupEvents(){
  ui.form.addEventListener('submit',e=>{
    e.preventDefault();if(!round||busy||round.finishedAt)return;
    const value=normalizeWord(ui.input.value);
    if(!value){showMessage('word','error');return;}
    if(round.guesses.includes(value)){showMessage('duplicate','error');return;}
    if(!/^[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*$/u.test(value)){showMessage('oneWord','error');return;}
    setBusy(true);requestScore(value);
  });
  $('newButton').addEventListener('click',()=>startRound());
  $('shareButton').addEventListener('click',shareChallenge);
  for(const button of document.querySelectorAll('[data-language]')){
    button.addEventListener('click',()=>setLanguage(button.dataset.language));
  }
  $('helpButton').addEventListener('click',()=>$('helpDialog').showModal());
  $('nextWinButton').addEventListener('click',()=>{closeDialog('winDialog');startRound();});
  $('shareWinButton').addEventListener('click',shareResult);
  document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>closeDialog(button.dataset.close)));
  for(const id of ['helpDialog','winDialog'])$(id).addEventListener('click',e=>{if(e.target===$(id))closeDialog(id);});
  window.addEventListener('popstate',()=>{const route=routeInfo();if(route)startRound({route});});
  setInterval(renderStats,1000);
  if(window.matchMedia('(max-width:760px)').matches){
    // The history remains available via its own reveal button after the article on small screens.
    const button=document.createElement('button');button.type='button';button.className='btn btn-outline mobile-history-toggle';button.dataset.text='guesses';
    button.style.cssText='width:100%;margin-top:12px';
    document.querySelector('.history-panel').before(button);
    button.setAttribute('aria-expanded','false');
    button.addEventListener('click',()=>{
      const open=document.querySelector('.history-panel').classList.toggle('mobile-show');
      button.setAttribute('aria-expanded',String(open));
    });
  }
}
ensureWorker();setupEvents();setLanguage(language);const initial=routeInfo();void startRound({route:initial});
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
