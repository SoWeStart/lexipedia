/** Pure game logic: importable by Node tests and by the browser. */
const IRREGULAR = Object.freeze({
  people:'person', men:'man', women:'woman', children:'child', mice:'mouse', geese:'goose', teeth:'tooth', feet:'foot',
  flies:'fly', flew:'fly', flown:'fly', babies:'baby', species:'species', fish:'fish', deer:'deer', sheep:'sheep',
  went:'go', gone:'go', made:'make', ate:'eat', eaten:'eat', is:'be', are:'be', was:'be', were:'be', been:'be',
  has:'have', had:'have', does:'do', did:'do', ran:'run', swam:'swim', swum:'swim', written:'write', wrote:'write',
  leaves:'leaf', wolves:'wolf', lives:'life', knives:'knife', crises:'crisis', fungi:'fungus', nuclei:'nucleus',
  news:'news', series:'series', means:'means', proceedings:'proceedings', politics:'politics', economics:'economics', physics:'physics',
  algae:'alga', cacti:'cactus', mosquitoes:'mosquito', volcanoes:'volcano', heroes:'hero'
});

export function normalizeWord(value) {
  return String(value || '').trim().toLocaleLowerCase('en-US').normalize('NFKC').replace(/[’‘]/g, "'")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

export function stemWord(value) {
  const w=normalizeWord(value);
  if (!w) return '';
  if (Object.hasOwn(IRREGULAR,w)) return IRREGULAR[w];
  if (/^\d+$/.test(w)) return w;
  if (w.length < 4) return w;
  if (w.endsWith('ies') && w.length > 4) return w.slice(0,-3)+'y';
  if (w.endsWith('oes') && w.length > 4) return w.slice(0,-2);
  if (/(xes|ches|shes|zzes|sses)$/.test(w)) return w.slice(0,-2);
  if (w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') && !w.endsWith('is')) return w.slice(0,-1);
  if (w.endsWith('ing') && w.length > 6) {
    const b=w.slice(0,-3);
    return /(.)\1$/.test(b) ? b.slice(0,-1) : b;
  }
  if (w.endsWith('ed') && w.length > 5) {
    const b=w.slice(0,-2);
    return /(.)\1$/.test(b) ? b.slice(0,-1) : b.endsWith('i') ? b.slice(0,-1)+'y' : b;
  }
  return w;
}

/** Function words are syntactic glue, not semantic neighbors of content terms.
 * They still count when guessed exactly. Protects against the high background
 * cosine scores produced by sentence models on isolated 1-token inputs. */
const FUNCTION_WORDS = new Set(`
 a an the and or but nor so yet as at by for from in into of off on onto out over under with without to toward towards up down upon
 is am are was were be been being do does did doing have has had having shall should will would can could may might must
 i me my mine we us our ours you your yours he him his she her hers it its they them their theirs who whom whose what which this that these those
 there here where when why how all any each every either neither both few fewer less many more most much some such no none not never only other another same
 if then than though although because since while until unless whether after before during between among around through throughout across against
 one two three four five six seven eight nine ten first second third several
 about above below beside besides beyond within via per vs etc also just even still already now very quite rather too enough
 i'm you're it's we're they're isn't aren't wasn't weren't don't doesn't didn't hasn't haven't hadn't can't won't couldn't shouldn't wouldn't
`.trim().split(/\s+/));
const GERMAN_FUNCTION_WORDS=new Set(`der die das des dem den ein eine einer eines einem einen und oder aber doch denn sowie als wenn dass weil ob wie was wer wen wem wessen welcher welche welches ich du er sie es wir ihr mich dich sich uns euch mir dir ihm ihnen mein dein sein unser euer ist sind bist bin war waren wurde wurden wird werden gewesen haben hat hatte hatten kann können konnte muss müssen soll sollte darf dürfen mag möchte nicht kein keine auch nur sehr noch schon mehr man mit von vom aus bei auf über unter nach vor zur zum bis durch für gegen ohne seit zwischen über um an am im in zu so hin her dort hier dann dabei dazu damit darin davon diese dieser dieses jene jedem alle jeder einige etwas solche ersten erste zweiter zweite`.split(' '));
export function isSemanticCandidate(value,language='en') {
  const w=normalizeWord(value);
  if (!w || (language==='de'?GERMAN_FUNCTION_WORDS:FUNCTION_WORDS).has(w)) return false;
  if (/^\d+$/.test(w)) return false;
  // Short terms are often pronouns, auxiliary verbs or unreliable model subwords.
  return [...w].length>=3;
}
/** Calibrate a sentence embedding used out of distribution on single words.
 * Raw values below 0.69 are too noisy; explicit graph relations are preferred. */
export function calibratedEmbeddingScore(raw) {
  const cosine=Number(raw);
  if (!Number.isFinite(cosine) || cosine<0.69) return 0;
  return Math.min(0.93, Math.max(0, (cosine-0.55)*2.75));
}
export function rankEmbeddingHints(candidates){
  const ranked=candidates.filter(([,similarity])=>Number.isFinite(similarity)&&similarity>=.73)
    .sort((a,b)=>b[1]-a[1]);
  if(!ranked.length)return [];
  const cutoff=ranked[0][1]-.10;
  return ranked.filter(([,similarity])=>similarity>=cutoff).slice(0,6)
    .map(([word,similarity])=>[word,Math.min(.67,calibratedEmbeddingScore(similarity))]);
}

export function sameWord(a,b,language='en') {
  const x=normalizeWord(a), y=normalizeWord(b);
  if (!x || !y) return false;
  return x === y || (language==='en' && stemWord(x) === stemWord(y));
}

export function tokenize(text) {
  // Unicode words with apostrophes/hyphens, punctuation and whitespace kept separately.
  return String(text || '').match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*|[^\p{L}\p{N}]+/gu) || [];
}
export function isWord(part) { return /^[\p{L}\p{N}]/u.test(part); }
export function titleWords(title) { return tokenize(title).filter(isWord).map(normalizeWord); }

export const CLUE_LIMIT=3;
export function createRound({title, extract, source, image='', seed=null, language='en', item=null}) {
  if (!title || !extract) throw new TypeError('Title and introduction required');
  return {title, extract, source, image, seed, language, item, guesses:[], hints:{}, clues:[], startedAt:Date.now(), finishedAt:null};
}
export function useClue(round,key){
  const clues=round.clues??=[];
  if(round.finishedAt || clues.length>=CLUE_LIMIT || clues.includes(key))return false;
  clues.push(key);
  return true;
}
export function revealRound(round){
  if(round.revealed)return false;
  round.revealed=true;
  if(!round.finishedAt){
    round.abandoned=true;
    round.finishedAt=Date.now();
  }
  return true;
}
export function getTitleProgress(round) {
  const ts=titleWords(round.title);
  const found=ts.map(t=>round.guesses.some(g=>sameWord(g,t,round.language)));
  return {total:ts.length, found:found.filter(Boolean).length, complete:found.length>0 && found.every(Boolean)};
}
export function applyGuess(round, guess, scores={}) {
  const word=normalizeWord(guess);
  if (!word || !/^[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*$/u.test(word) || word.length>42) {
    return {accepted:false, reason:'Bitte ein einzelnes Wort (maximal 42 Zeichen) eingeben.'};
  }
  if (round.guesses.some(g=>g===word)) return {accepted:false, reason:'Dieses Wort hast du bereits geraten.'};
  if (round.finishedAt) return {accepted:false, reason:'Diese Runde ist bereits gelöst.'};
  round.guesses.push(word);
  mergeHints(round,word,scores);
  if (getTitleProgress(round).complete) round.finishedAt=Date.now();
  return {accepted:true, won:Boolean(round.finishedAt)};
}
export function mergeHints(round,guess,scores={}) {
  const word=normalizeWord(guess);
  // Four-digit years have a separate distance rule and never use model scores.
  if(/^[12]\d{3}$/.test(word)){
    for(const token of new Set(tokenize(round.extract))){
      if(!/^[12]\d{3}$/.test(token))continue;
      const distance=Math.abs(Number(word)-Number(token));
      if(distance>0 && distance<=25)storeHint(round,token,word,.9-distance*.02);
    }
    return;
  }
  if(!isSemanticCandidate(word,round.language))return;
  for (const [target, rawScore] of Object.entries(scores)) {
    const targetWord=normalizeWord(target);
    if (!isSemanticCandidate(targetWord,round.language) || sameWord(word,targetWord,round.language)) continue;
    const score=Math.min(1,Math.max(0,Number(rawScore)||0));
    if(score>=.38)storeHint(round,targetWord,word,score);
  }
}
function storeHint(round,target,guess,score){
  const previous=Object.hasOwn(round.hints,target)?round.hints[target]:undefined;
  if(!previous || score>previous.score){
    round.hints[target]={guess,score};
  }
}
export function tokenState(round, token, inTitle=false) {
  if (!isWord(token)) return {type:'punct', label:token};
  if (round.guesses.some(g=>sameWord(g,token,round.language))) return {type:'exact', label:token};
  if (round.revealed) return {type:'revealed', label:token};
  if (inTitle) return {type:'hidden', label:token};
  const key=normalizeWord(token);
  const hint=Object.hasOwn(round.hints,key)?round.hints[key]:undefined;
  if (hint) return {type:'near', label:hint.guess, score:hint.score};
  return {type:'hidden', label:token};
}
export function formatElapsed(ms) {
  const sec=Math.max(0,Math.floor(ms/1000)),min=Math.floor(sec/60);
  return `${String(min).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;
}
export function titleMasked(round) {
  return tokenize(round.title).map(part=>isWord(part)?(
    round.revealed || round.guesses.some(g=>sameWord(g,part,round.language)) ? part : '▰'.repeat(Math.max(2,Math.min(11,part.length)))
  ):part).join('');
}
export function encodeTitle(title) {
  const bytes=new TextEncoder().encode(title);
  let s=''; for(const b of bytes) s+=String.fromCharCode(b);
  return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
export function decodeTitle(code) {
  if (!/^[a-zA-Z0-9_-]{1,300}$/.test(code)) throw new Error('Invalid shared link');
  const src=atob(code.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-code.length%4)%4));
  return new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(src,c=>c.charCodeAt(0)));
}
export function seedIndex(seed, count) {
  let h=2166136261;
  for (let i=0;i<seed.length;i++) {h^=seed.charCodeAt(i); h=Math.imul(h,16777619);}
  return (h>>>0)%count;
}
