import test from 'node:test';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { evidenceLedger, evidenceTable, compactEvidence, resolveEvidenceReferences, researchBundle, researchRecords, sourceText } from '../src/server/research-evidence.mjs';
import { createMemoryStore, defaultSettings } from '../src/server/store.mjs';
import { runParallelConsultation } from '../src/server/consultation-parallel.mjs';
import { validateLocalState } from '../src/server/local-state.mjs';
import { testRuntimeInstructions } from './fixtures/runtime-instructions.mjs';
import { buildProviderContext } from '../src/server/provider-context.mjs';
import { encryptText, decryptText } from '../src/server/crypto.mjs';
const source = {url:'https://example.com/evidence',title:'Evidence "report"',claim:'Measure the pilot; uncertain outside this sample.',retrievedAt:'2026-09-26T00:00:00Z',publishedAt:'2026-09-01'};
const ok = (body,sources=[]) => ({ok:true,body,sources});

test('evidence references preserve distinct claims, dates, qualifications, JSON validity and reject unknown IDs', () => {
 const sources=[source,{...source,claim:'Capacity has a different constraint.'}];const ledger=evidenceLedger([...sources,source]);
 assert.equal(ledger.length,2);assert.equal(evidenceLedger(JSON.parse(JSON.stringify(sources)))[0].id,ledger[0].id);
 const compact=compactEvidence(`${sourceText(source)}\nOriginal qualification remains. [Report](https://example.com/evidence)`,ledger);
 assert.match(compact,/Original qualification remains/);assert.equal(compact.includes(source.url),false);
 assert.match(evidenceTable(ledger),/2026-09-01/);assert.match(evidenceTable(ledger),/uncertain outside/);
 const resolved=resolveEvidenceReferences(JSON.stringify({summary:`Known [${ledger[0].id}] and [${ledger[1].id}]`,findings:[]}),ledger);
 assert.match(JSON.parse(resolved.body).summary,/https:\/\/example.com\/evidence/);assert.equal(resolved.sources.length,2);
 assert.throws(()=>resolveEvidenceReferences('[S-invented]',ledger),/evidence_reference/);
 assert.throws(()=>resolveEvidenceReferences(`[${ledger[0].id}]`,[]),/evidence_reference/);
});

async function fixture(depth='1', store=createMemoryStore()) {
 const conversation=await store.createConversation();
 const accepted=await store.acceptMessage(conversation.id,{body:'Current request: assess a fictional pilot.',clientRequestId:'research-evidence-case-0001'},{...defaultSettings,contractVersion:'parallel-v1',runtimeInstructions:testRuntimeInstructions,specialistCount:'2',discussionDepth:depth});
 return {store,conversationId:conversation.id,runState:accepted.run,onProvider(){}};
}
const plan=JSON.stringify({assignments:[{role:'Demand',guidance:'Measure demand.',task:'Assess demand.',dependsOn:[]},{role:'Capacity',guidance:'Measure capacity.',task:'Assess capacity.',dependsOn:[]}],researchQuery:'public pilot methods',researchFor:[1]});

test('Head routes evidence, explicitly reuses it across rounds and visible references resolve before storage',async()=>{
 const f=await fixture('3');const calls=[];const controller=new AbortController();
 await runParallelConsultation({...f,signal:controller.signal,provider:{async invoke(input){
  calls.push(input);switch(input.outputKind){
   case 'head_plan':return ok(plan);
   case 'public_research':return ok('Measured pilot fact with qualifications.',[source]);
   case 'research_query':return ok(JSON.stringify({query:null,reuseRecord:'initial',fresh:false,researchFor:[1]}));
   case 'team_review':return ok(JSON.stringify({summary:'Check the existing pilot fact.',researchRequest:'Review the pilot method.',findings:[]}));
   case 'specialist_position':return ok(input.assignment.includes('Demand')?`Use [${evidenceLedger([source])[0].id}].`:'Capacity is bounded.');
   case 'head_final':return ok(`Final [${evidenceLedger([source])[0].id}].`);
   default:return ok('A specific answer.');
  }
 }}});
 assert.equal(calls.filter(x=>x.research).length,1);
 const positions=calls.filter(x=>x.outputKind==='specialist_position');assert.match(positions[0].evidence.shared,/Measured pilot/);assert.doesNotMatch(positions[1].evidence.shared,/Measured pilot|example.com/);
 const w=(await f.store.run(f.conversationId)).snapshot.parallelWork;assert.equal(w.rounds.length,3);assert.ok(w.rounds.every(r=>r.research.reusedFrom==='initial'));
 const final=(await f.store.events(f.conversationId)).at(-1);assert.match(final.body,/https:\/\/example.com\/evidence/);assert.doesNotMatch(final.body,/\[S-/);assert.equal(final.sources[0].publishedAt,'2026-09-01');
 validateLocalState(f.store.snapshotState());
 assert.deepEqual(researchRecords(w).map(r=>r.key),['initial','round:1','round:2','round:3']);
 const bundle=researchBundle(w);assert.equal(bundle.body.split('Measured pilot fact').length-1,1);
});

test('Stop during follow-up search preserves formed query through restored state; fresh search is not replaced by reuse',async()=>{
 const dataKey=randomBytes(32);let disk=createMemoryStore();
 const f=await fixture('1',disk);let queryCalls=0,searchCalls=0;let controller=new AbortController();
 const provider={async invoke(input){
  if(input.outputKind==='head_plan')return ok(plan);
  if(input.outputKind==='team_review')return ok(JSON.stringify({summary:'A fresh measurement is required.',findings:[],researchRequest:'Check newer public pilot methods.'}));
  if(input.outputKind==='research_query'){queryCalls++;return ok(JSON.stringify({query:'public newer pilot methods',reuseRecord:null,fresh:true,researchFor:[2]}));}
  if(input.research){searchCalls++;if(searchCalls===2){controller.abort();await f.store.stop(f.conversationId);return {ok:false,code:'cancelled'};}return ok('Evidence retained.',[source]);}
  return ok('A useful answer.');
 }};
 await assert.rejects(runParallelConsultation({...f,signal:controller.signal,provider}),/cancelled/);
 const sealed=encryptText(JSON.stringify(disk.snapshotState()),dataKey);
 assert.equal(JSON.stringify(sealed).includes('public newer pilot methods'),false);
 disk=createMemoryStore(JSON.parse(decryptText(sealed,dataKey)));const restored=disk;const resumed=await restored.continueRun(f.conversationId);controller=new AbortController();
 await runParallelConsultation({...f,store:restored,runState:resumed,signal:controller.signal,provider});
 assert.equal(queryCalls,1);assert.equal(searchCalls,3);assert.equal((await restored.run(f.conversationId)).status,'complete');
});

test('unknown citation gets one repair with unchanged owner context and known table',async()=>{
 const f=await fixture();let attempts=0;
 await runParallelConsultation({...f,signal:new AbortController().signal,provider:{async invoke(input){
  if(input.outputKind==='head_plan')return ok(plan);
  if(input.research)return ok('Research evidence.',[source]);
  if(input.outputKind==='team_review')return ok(JSON.stringify({summary:'Sufficient.',findings:[]}));
  if(input.outputKind==='head_final'){attempts++;assert.match(input.evidence.owner,/Current request/);assert.match(buildProviderContext(input).prompt,/example.com/);return ok(attempts===1?'Unknown [S-invented]':`Valid [${evidenceLedger([source])[0].id}]`);}
  return ok('Specific result.');
 }}});
 assert.equal(attempts,2);assert.doesNotMatch((await f.store.events(f.conversationId)).at(-1).body,/\[S-/);
});
