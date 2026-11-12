import test from 'node:test';
import assert from 'node:assert/strict';
import {POOL,GERMAN_POOL,candidateOrder,titleKey} from '../src/pool.js';
import {fetchCuratedArticle,fetchTitle,parseWikiResponse,practiceArticle} from '../src/wiki.js';

const extract='A lighthouse guides ships along a coast by projecting a beam across the water. Sailors use these signals to navigate safely past rocky shores, shallow reefs, and narrow harbor entrances. Early towers burned wood or oil to produce light after sunset. Modern equipment uses electric lamps and lenses to concentrate the beam and make it visible from a greater distance. Each station can transmit a distinct pattern of flashes. Mariners compare that pattern with nautical charts to identify their position and plan a safe approach through fog, storms, or darkness.';
const page=(title,overrides={})=>({title,ns:0,extract:extract.replace(' Early towers','\nEarly towers').replace(' Each station','\nEach station'),...overrides});
const response=p=>({query:{pages:[p]}});

test('curated pool has unique titles and rotates through every candidate before recycling',()=>{
  const titles=Object.values(POOL).flat(2);
  assert.equal(new Set(titles.map(titleKey)).size,titles.length);
  const seen=[];
  for(let index=0;index<titles.length;index++){
    const title=candidateOrder(seen,()=>0.5)[0];
    assert.ok(!seen.includes(title));
    seen.unshift(title);
  }
  assert.equal(candidateOrder(seen,()=>0.5)[0],seen.at(-1));
});

test('weighted selection favors intermediate difficulty and rotates topics',()=>{
  const first=candidateOrder([],()=>0.5)[0];
  const recent=candidateOrder([first.replaceAll(' ','_').toUpperCase()],()=>0.5)[0];
  assert.ok(POOL.physics[1].includes(first));
  assert.ok(!POOL.physics.flat().includes(recent));
  assert.deepEqual(candidateOrder([first],()=>0.5),candidateOrder([first],()=>0.5));
});

test('quality gates reject missing, ambiguous, non-article and thin pages',()=>{
  const unsuitable=[
    page('Lighthouse',{missing:true}),page('Lighthouse',{pageprops:{disambiguation:''}}),
    page('Lighthouse',{ns:1}),page('Lighthouse',{extract:'Lighthouse '.repeat(100)}),
    page('Lighthouse',{extract:'A short introduction.'}),page('List of lighthouses')
  ];
  for(const invalid of unsuitable){
    assert.throws(()=>parseWikiResponse(response(invalid),{curated:true}));
  }
  assert.equal(parseWikiResponse(response(page('Lighthouse')),{curated:true}).title,'Lighthouse');
});

test('fetch skips unsuitable candidates and redirects to already played articles',async t=>{
  const history=['Magnetism'];
  const [first,second,third]=candidateOrder(history,()=>0.5);
  const calls=[];
  t.mock.method(globalThis,'fetch',async url=>{
    const params=new URL(url).searchParams;
    assert.equal(params.has('generator'),false);
    assert.equal(params.get('ppprop'),'disambiguation|wikibase_item');
    const title=params.get('titles');
    calls.push(title);
    const result=title===first?page(title,{missing:true}):page(title===second?'Magnetism':title);
    return {ok:true,json:async()=>response(result)};
  });
  assert.equal((await fetchCuratedArticle(history,undefined,()=>0.5)).title,third);
  assert.deepEqual(calls,[first,second,third]);
});

test('fetch recycles the least recent title and stops immediately on network errors or abort',async t=>{
  const history=candidateOrder([],()=>0.5);
  const fetchMock=t.mock.method(globalThis,'fetch',async url=>({
    ok:true,json:async()=>response(page(new URL(url).searchParams.get('titles')))
  }));
  assert.equal((await fetchCuratedArticle(history,undefined,()=>0.5)).title,history.at(-1));
  assert.equal(fetchMock.mock.callCount(),1);
  const controller=new AbortController();
  controller.abort();
  await assert.rejects(fetchCuratedArticle([],controller.signal),{name:'AbortError'});
  assert.equal(fetchMock.mock.callCount(),1);
  fetchMock.mock.mockImplementation(async()=>({ok:false,status:503}));
  await assert.rejects(fetchCuratedArticle([]),/HTTP 503/);
  assert.equal(fetchMock.mock.callCount(),2);
});

test('German rounds draw from the German pool and use the German Wikipedia and fallback',async t=>{
  const candidates=Object.values(GERMAN_POOL).flat(2);
  const calls=[];
  t.mock.method(globalThis,'fetch',async url=>{
    const target=new URL(url);
    calls.push(target.hostname);
    return {ok:true,json:async()=>response(page(target.searchParams.get('titles')))};
  });
  const article=await fetchCuratedArticle([],undefined,()=>0.5,'de');
  assert.ok(candidates.includes(article.title));
  assert.equal(article.language,'de');
  assert.match(article.source,/^https:\/\/de\.wikipedia\.org/);
  assert.equal((await fetchTitle('Vulkan',undefined,'de')).language,'de');
  assert.equal((await fetchTitle('Volcano')).language,'en');
  assert.deepEqual(calls,['de.wikipedia.org','de.wikipedia.org','en.wikipedia.org']);
  assert.equal(practiceArticle('de').title,'Vulkan');
});

test('new rounds prefer a different topic over a recently played translation',async t=>{
  const [translated,next]=candidateOrder([],()=>0.5,'de');
  const calls=[];
  t.mock.method(globalThis,'fetch',async url=>{
    const title=new URL(url).searchParams.get('titles');
    calls.push(title);
    const p=page(title,{pageprops:{wikibase_item:title===translated?'Q1':'Q2'}});
    return {ok:true,json:async()=>response(p)};
  });
  assert.equal((await fetchCuratedArticle([],undefined,()=>0.5,'de',['Q1'])).title,next);
  assert.deepEqual(calls,[translated,next]);
});

test('both pools exclude the flagged specialist biography and historical period',()=>{
  const titles=[...Object.values(POOL).flat(2),...Object.values(GERMAN_POOL).flat(2)];
  assert.ok(titles.every(title=>!/ramanujan|meiji/i.test(title)));
});

test('short introductions take only enough paragraphs from the first section',async t=>{
  const intro=extract.replace(' Early towers','\nEarly towers');
  const paragraphs=[
    'A third paragraph adds context and describes how the coastal signals were used by sailors.',
    'A fourth paragraph adds another detail about navigation at night and in bad weather.',
    'This paragraph is beyond the cap and must not be included in the puzzle text.',
  ];
  const html='<div class="mw-parser-output"><h2>History</h2>'+paragraphs.map(p=>'<p>'+p+'</p>').join('')+'</div>';
  globalThis.document={createElement:()=>({
    set innerHTML(value){assert.equal(value,html);},
    content:{querySelector:()=>({querySelectorAll:()=>paragraphs.map(textContent=>({textContent,closest:()=>null,querySelectorAll:()=>[]}))})}
  })};
  t.after(()=>{delete globalThis.document;});
  const calls=[];
  t.mock.method(globalThis,'fetch',async url=>{
    const params=new URL(url).searchParams;
    calls.push(params);
    return {ok:true,json:async()=>params.has('exintro')
      ?response(page('Lighthouse',{extract:intro}))
      :{parse:{text:html}}};
  });
  const article=await fetchTitle('Lighthouse');
  assert.equal(article.extract.split('\n\n').length,4);
  assert.match(article.extract,/fourth paragraph/);
  assert.doesNotMatch(article.extract,/History|beyond the cap|Unrelated detail/);
  assert.equal(calls[0].has('exchars'),false);
  assert.equal(calls[1].get('action'),'parse');
  assert.equal(calls[1].get('section'),'1');
});

test('unavailable continuation leaves a short playable lead',async t=>{
  t.mock.method(globalThis,'fetch',async url=>new URL(url).searchParams.has('exintro')
    ?{ok:true,json:async()=>response(page('Lighthouse',{extract}))}
    :{ok:false,status:503});
  assert.equal((await fetchTitle('Lighthouse')).extract,extract);
});

test('long excerpts stop on a complete sentence within the character limit',()=>{
  const short='This is a complete opening sentence.';
  const longParagraph=short+' '+('More historical details are available. '.repeat(90));
  const article=parseWikiResponse(response(page('Lighthouse',{extract:longParagraph})));
  assert.ok(article.extract.length<=2400);
  assert.ok(article.extract.endsWith('available.'));
});
