"""Browser smoke test with mocked Wikipedia HTTP; no outbound network required."""
import base64, json, os, threading
from functools import partial
from urllib.parse import urlparse,unquote
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def serve_local(route):
    from mimetypes import guess_type
    path=unquote(urlparse(route.request.url).path).lstrip('/') or 'index.html'
    filepath=(Path(ROOT)/path).resolve()
    if not filepath.is_relative_to(Path(ROOT).resolve()) or not filepath.is_file():
        route.fulfill(status=404,body='404');return
    route.fulfill(status=200,body=filepath.read_bytes(),content_type=guess_type(str(filepath))[0] or 'application/octet-stream')

sample='Mosquitoes, the Culicidae, are a family of small flies consisting of thousands of species. The word mosquito comes from Spanish and Portuguese for little fly. Mosquitoes are animals in the insect group. These flying insects are common near water and plants. Female mosquitoes can bite humans and other mammals. Mosquitoes lay eggs in water, and the larvae grow before becoming adult insects. Biology studies animals, including insects and their environment. Many species can spread malaria and other diseases, while others feed on nectar and visit flowers.'
fixture={'query':{'pages':[{'title':'Mosquito','extract':sample,'fullurl':'https://en.wikipedia.org/wiki/Mosquito'}]}}
title='Mosquito'; code=base64.urlsafe_b64encode(title.encode()).decode().rstrip('=')
with sync_playwright() as playwright:
    browser=playwright.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    for size in [('desktop',1280,900),('mobile',390,844)]:
        name,w,h=size
        context=browser.new_context(viewport={'width':w,'height':h},device_scale_factor=1)
        page=context.new_page()
        errors=[]
        page.on('pageerror',lambda e: errors.append(str(e)))
        page.route('https://lexipedia.test/**',serve_local)
        page.route('https://en.wikipedia.org/**',lambda route:route.fulfill(status=200,content_type='application/json',body=json.dumps(fixture)))
        page.route('https://cdn.jsdelivr.net/**',lambda route:route.abort())
        page.route('https://fonts.googleapis.com/**',lambda route:route.abort())
        page.goto('https://lexipedia.test/?t='+code,wait_until='domcontentloaded',timeout=25000)
        page.wait_for_selector('#guessInput:not([disabled])',timeout=20000)
        assert page.locator('.word.hidden').count()>2
        assert page.locator('#maskedTitle .word.hidden').count()==1
        page.screenshot(path=f'/mnt/data/lexipedia-{name}-before.png',full_page=True)
        for i,guess in enumerate(['biology','animal','insect','fly','mosquito'],1):
            page.locator('#guessInput').fill(guess)
            page.locator('#submitButton').click()
            page.wait_for_function('(n)=>document.querySelector("#guessCount").textContent===String(n)',arg=i,timeout=12000)
        assert page.locator('#maskedTitle .word.exact').count()==1
        assert page.locator('#winDialog').evaluate('(el)=>el.open')
        assert page.locator('#articleBadge').inner_text()=='GELÖST'
        assert page.locator('#sourceLink').is_visible()
        page.screenshot(path=f'/mnt/data/lexipedia-{name}-win.png',full_page=True)
        print(name,'OK, guesses:',page.locator('#guessCount').inner_text(),'title:',page.locator('#winTitle').inner_text(),'errors:',errors[:3])
        assert not errors,errors
        context.close()
    browser.close()
