import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { chromium, webkit } from 'playwright';
const entry = '/src/__study_clarity_fixture__.tsx';
const id = resolve(process.cwd(), entry.slice(1));
const server = await createServer({
  plugins: [{ name: 'study-clarity-fixture', enforce: 'pre', resolveId(path) { if(path === entry) return id; }, load(path) {
    if(path.endsWith('/src/integrations/supabase/client.ts')) return 'export const supabase = { functions: { invoke: async () => ({ data: { ok: true }, error: null }) } };';
    if(path === id) return `
      import React from 'react'; import { createRoot } from 'react-dom/client'; import '@/index.css';
      import { RealStudyRunner } from '@/components/study/RealStudyRunner';
      import { RealMatchingGame } from '@/components/study/RealMatchingGame';
      import { buildDeterministicFlashcards, buildDeterministicMultipleChoice, buildDeterministicMatchingPairs, validateArtifactPayload } from '../supabase/functions/_shared/artifact-validation';
      const names = ['Encoding','Storage','Retrieval']; const concepts = names.map(name => ({id:name,name}));
      const source = 'Hale · Fall 2026 Key concepts for Quiz 1 · Encoding: getting info into memory · Storage: keeping it over time · Retrieval: getting it back out · Assignment due September 12.';
      const sources = new Map(names.map(name => [name,source]));
      const kind = new URLSearchParams(location.search).get('kind') || 'flashcards';
      const raw = kind === 'flashcards' ? {cards:buildDeterministicFlashcards(concepts,sources,3)} : kind === 'matching' ? {pairs:buildDeterministicMatchingPairs(concepts,sources,3).pairs} : {questions:buildDeterministicMultipleChoice(concepts,sources,3)};
      const validated = validateArtifactPayload(kind, raw, { concepts, expectedCount:3, sourceExcerptByConcept:sources });
      if(!validated.ok) throw new Error(validated.error);
      const artifact = {id:kind,user_id:'fixture',kind,concept_ids:names,study_scope_type:'recent',study_scope_id:'recent',study_scope_snapshot:{},payload:validated.payload,stale:false};
      createRoot(document.getElementById('root')).render(kind === 'matching'
        ? <RealMatchingGame payload={validated.payload} allowedConceptIds={names} onComplete={()=>{}} />
        : <RealStudyRunner open onOpenChange={()=>{}} artifact={artifact} />);
    `;
  }}], server: { host:'127.0.0.1', port:4177, strictPort:true }
});
await server.listen();
await mkdir('test-results/study-clarity', {recursive:true});
try {
  for (const type of [chromium, webkit]) {
    const browser = await type.launch();
    try {
      for(const kind of ['flashcards','multiple_choice','matching']) {
        const page = await browser.newPage({viewport:{width:390,height:844}});
        const errors=[]; page.on('pageerror',e=>errors.push(e.message));
        await page.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:4177') ? route.continue() : route.abort());
        await page.route('**/clarity?*', async route => route.fulfill({contentType:'text/html',body:await server.transformIndexHtml('/clarity',`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main id="root" style="padding:16px"></main><script type="module" src="${entry}"></script></body></html>`)}));
        await page.goto(`http://127.0.0.1:4177/clarity?kind=${kind}`);
        if(kind === 'flashcards') {
          await page.getByRole('button',{name:/very sure/i}).click();
          await page.getByRole('button',{name:/reveal answer/i}).click();
          await page.getByText('getting info into memory',{exact:true}).waitFor();
        } else if(kind === 'multiple_choice') {
          await page.getByRole('button',{name:/getting info into memory/i}).click();
          await page.getByRole('button',{name:/very sure/i}).click();
          await page.getByRole('button',{name:/check answer/i}).click();
        } else {
          await page.getByRole('button',{name:'Encoding',exact:true}).waitFor();
        }
        assert.equal(await page.getByText(/Hale/).isVisible(), false);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth),false);
        assert.deepEqual(errors,[]);
        await page.screenshot({path:`test-results/study-clarity/${type.name()}-${kind}.png`,fullPage:true});
        if(kind !== 'matching') {
          await page.getByText('Show source',{exact:true}).click();
          assert.equal(await page.getByText(/Hale/).isVisible(),true);
        }
        console.log(`${type.name()} ${kind}: concise answers, collapsed source, no horizontal overflow PASS`);
        await page.close();
      }
    } finally { await browser.close(); }
  }
} finally { await server.close(); }
