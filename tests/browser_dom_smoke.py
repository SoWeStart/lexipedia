"""Browser DOM/UI smoke test: in-memory page, Wikipedia and Worker mocked. No external traffic."""
import os,re
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
html=(ROOT/'index.html').read_text()
css=(ROOT/'styles.css').read_text()
css=re.sub(r'@import[^;]+;','',css)
html=html.replace('<link rel="stylesheet" href="./styles.css">','<style>'+css+'</style>')
html=re.sub(r'<script type="module" src="./src/app.js"></script>','',html)
modules=['core','concepts','articles','language','pool','wiki','app']
source='\n'.join((ROOT/f'src/{name}.js').read_text() for name in modules)
source=re.sub(r'^import .*?;\s*$','',source,flags=re.MULTILINE)
source=re.sub(r'\bexport (function|const|class|async function)\b',r'\1',source)
source=source.replace('import.meta.url','location.href')
# API responses are backed by an explicit Wikimedia-like fixture.
fixture='''{
  "query":{"pages":[{"title":"Mosquito","extract":"Mosquitoes, the Culicidae, are a family of small flies consisting of thousands of species. The word mosquito comes from Spanish and Portuguese for little fly. Mosquitoes are animals in the insect group. These flying insects are common near water and plants. Female mosquitoes can bite humans and other mammals. Mosquitoes lay eggs in water, and the larvae grow before becoming adult insects. Biology studies animals, including insects and their environment. Many species can spread malaria and other diseases, while others feed on nectar and visit flowers.","fullurl":"https://en.wikipedia.org/wiki/Mosquito"}]}
}'''
prelude="""
window.history.replaceState=function(){};
window.fetch=async()=>({ok:true,status:200,json:async()=>MOCK_FIXTURE});
class TestWorker {constructor(){this.onmessage=null;}
 postMessage(d){const send=msg=>setTimeout(()=>this.onmessage?.({data:{epoch:d.epoch,...msg}}),5);
 if(d.type==='init'){this.text=d.text;send({type:'ready',mode:'basic',detail:'Grundmodus'});}
 if(d.type==='score'){const scores=conceptBatch(d.guess,[...new Set(tokenize(this.text).filter(isWord).map(normalizeWord))]);send({type:'score',requestId:d.requestId,guess:d.guess,scores});}
 }
 terminate(){}
}
window.Worker=TestWorker;
window.navigator.serviceWorker=undefined;
"""
script='const MOCK_FIXTURE='+fixture+';\nMOCK_FIXTURE.query.pages[0].ns=0;\n'+source.replace('ensureWorker();setupEvents();',prelude+'\nensureWorker();setupEvents();')
with sync_playwright() as playwright:
 browser=playwright.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
 for name,w,h in [('desktop',1280,900),('mobile',390,844)]:
  context=browser.new_context(viewport={'width':w,'height':h},device_scale_factor=1)
  page=context.new_page()
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.set_content(html,wait_until='domcontentloaded')
  page.add_script_tag(content=script)
  page.wait_for_selector('#guessInput:not([disabled])',timeout=12000)
  page.get_by_role('button',name='English',exact=True).click()
  assert page.locator('html').get_attribute('lang')=='en'
  assert page.locator('#guessInput').get_attribute('placeholder')=='English word'
  assert page.locator('.word.hidden').count()>3
  assert page.locator('#maskedTitle .word.hidden').count()==1
  # A tap or keyboard action temporarily overlays the exact letter count.
  hidden=page.locator('#articleText .word.hidden').first
  expected=hidden.get_attribute('data-length')
  assert expected and expected.isdigit()
  hidden.click()
  assert 'length-peek' in hidden.get_attribute('class')
  assert hidden.evaluate('(el)=>getComputedStyle(el,"::after").content')=='"'+expected+'"'
  assert page.locator('#guessCount').inner_text()=='0'
  page.wait_for_timeout(1900)
  assert 'length-peek' not in hidden.get_attribute('class')
  titleword=page.locator('#maskedTitle .word.hidden').first
  titleword.focus()
  page.keyboard.press('Enter')
  assert 'length-peek' in titleword.get_attribute('class')
  assert page.locator('#maskedTitle .word.exact').count()==0
  page.screenshot(path=f'/mnt/data/lexipedia-{name}-before.png',full_page=True)
  for i,word in enumerate(['biology','animal','insect','fly','mosquito'],1):
   page.locator('#guessInput').fill(word)
   page.locator('#submitButton').click()
   page.wait_for_function('(n)=>document.querySelector("#guessCount").textContent===String(n)',arg=i,timeout=12000)
  assert page.locator('#maskedTitle .word.exact').count()==1
  assert page.locator('#winDialog').evaluate('(el)=>el.open')
  assert page.locator('#articleBadge').inner_text()=='SOLVED'
  assert page.locator('#sourceLink').is_visible()
  page.screenshot(path=f'/mnt/data/lexipedia-{name}-win.png',full_page=True)
  print(name,'OK, 5 guesses, win dialog, errors:',errors)
  assert not errors
  context.close()
 browser.close()
