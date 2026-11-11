/** Pure game logic: importable by Node tests and by the browser. */
const IRREGULAR = Object.freeze({
  people:'person', men:'man', women:'woman', children:'child', mice:'mouse', geese:'goose', teeth:'tooth', feet:'foot',
  flies:'fly', flew:'fly', flown:'fly', babies:'baby', species:'species', fish:'fish', deer:'deer', sheep:'sheep',
  went:'go', gone:'go', made:'make', ate:'eat', eaten:'eat', is:'be', are:'be', was:'be', were:'be', been:'be',
  has:'have', had:'have', does:'do', did:'do', ran:'run', swam:'swim', swum:'swim', written:'write', wrote:'write',
  leaves:'leaf', wolves:'wolf', lives:'life', knives:'knife', crises:'crisis', fungi:'fungus', nuclei:'nucleus',
  algae:'alga', mosquitoes:'mosquito', volcanoes:'volcano', heroes:'hero'
});

export function normalizeWord(value) {
  return String(value || '').trim().toLocaleLowerCase('en-US').normalize('NFKC').replace(/[’‘]/g, "'")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

export function stemWord(value) {
  const w=normalizeWord(value);
  if (!w) return '';
  if (IRREGULAR[w]) return IRREGULAR[w];
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

export function sameWord(a,b) {
  const x=normalizeWord(a), y=normalizeWord(b);
  if (!x || !y) return false;
  return x === y || stemWord(x) === stemWord(y);
}

export function tokenize(text) {
  // Unicode words with apostrophes/hyphens, punctuation and whitespace kept separately.
  return String(text || '').match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*|[^\p{L}\p{N}]+/gu) || [];
}
export function isWord(part) { return /^[\p{L}\p{N}]/u.test(part); }
export function titleWords(title) { return tokenize(title).filter(isWord).map(normalizeWord); }

export function createRound({title, extract, source, image='', seed=null}) {
  if (!title || !extract) throw new TypeError('Title and introduction required');
  return {title, extract, source, image, seed, guesses:[], hints:{}, startedAt:Date.now(), finishedAt:null};
}
export function getTitleProgress(round) {
  const ts=titleWords(round.title);
  const found=ts.map(t=>round.guesses.some(g=>sameWord(g,t)));
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
  for (const [target, rawScore] of Object.entries(scores)) {
    const targetWord=normalizeWord(target);
    if (!targetWord || sameWord(word,targetWord)) continue;
    const score=Math.min(1,Math.max(0,Number(rawScore)||0));
    if (score >= 0.38 && (!round.hints[targetWord] || score > round.hints[targetWord].score)) {
      round.hints[targetWord] = {guess:word, score};
    }
  }
}
export function tokenState(round, token, inTitle=false) {
  if (!isWord(token)) return {type:'punct', label:token};
  if (round.guesses.some(g=>sameWord(g,token))) return {type:'exact', label:token};
  if (inTitle) return {type:'hidden', label:token};
  const hint=round.hints[normalizeWord(token)];
  if (hint) return {type:'near', label:hint.guess, score:hint.score};
  return {type:'hidden', label:token};
}
export function formatElapsed(ms) {
  const sec=Math.max(0,Math.floor(ms/1000)),min=Math.floor(sec/60);
  return `${String(min).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;
}
export function titleMasked(round) {
  return tokenize(round.title).map(part=>isWord(part)?(
    round.guesses.some(g=>sameWord(g,part)) ? part : '▰'.repeat(Math.max(2,Math.min(11,part.length)))
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