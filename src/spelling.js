const dictionaries={
  de:'dictionary-de@3.0.0',
  en:'dictionary-en@4.0.0',
};
const checkers=new Map();

async function readDictionaryFile(pkg,extension){
  const response=await fetch(`https://cdn.jsdelivr.net/npm/${pkg}/index.${extension}`,{signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw new Error('Dictionary unavailable');
  return response.text();
}

export function prepareSpelling(language){
  if(!checkers.has(language)){
    const pkg=dictionaries[language];
    const checker=Promise.all([
      import('https://cdn.jsdelivr.net/npm/nspell@2.1.5/+esm'),
      readDictionaryFile(pkg,'aff'),
      readDictionaryFile(pkg,'dic'),
    ]).then(([{default:spell},aff,dic])=>spell({aff,dic})).catch(()=>null);
    checkers.set(language,checker);
  }
  return checkers.get(language);
}

export function spellingIssue(checker,word,language){
  if(!checker || !/^\p{L}+(?:[’'-]\p{L}+)*$/u.test(word))return null;
  const capitalized=word.charAt(0).toLocaleUpperCase(language)+word.slice(1);
  if(checker.correct(word) || checker.correct(capitalized))return null;
  try{
    const suggestions=word.length<=18?checker.suggest(language==='de'?capitalized:word):[];
    return {suggestion:suggestions.find(candidate=>/^\p{L}+(?:[’'-]\p{L}+)*$/u.test(candidate))??''};
  }catch{return {suggestion:''};}
}
