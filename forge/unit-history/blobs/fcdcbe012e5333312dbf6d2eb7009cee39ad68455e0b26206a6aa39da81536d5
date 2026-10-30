import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProviderContext } from '../src/server/provider-context.mjs';
import { createRuntimePrompts } from '../src/server/prompt-contracts.mjs';
import { createMemoryStore, defaultSettings } from '../src/server/store.mjs';
import { runParallelConsultation } from '../src/server/consultation-parallel.mjs';
import { validateLocalState } from '../src/server/local-state.mjs';
import { testRuntimeInstructions } from './fixtures/runtime-instructions.mjs';

const commonPrefix = (a, b) => { let i = 0; while (i < Math.min(a.length, b.length) && a[i] === b[i]) i++; return i; };
const instructions = { ...testRuntimeInstructions, documents: [{ name: 'AGENTS.md', revision: 1, markdown: 'Stable role policy. '.repeat(300) }, { name: 'WORKING_CONTEXT.md', revision: 1, markdown: 'PRIVATE_MEMORY_MARKER' }] };
const input = { runtimeInstructions: instructions, contextScope: 'request-A', outputKind: 'specialist_position', research: false, assignment: 'Demand: answer the assigned question.', evidence: { owner: 'EXACT_REQUEST_αβ', shared: 'SHARED_RESEARCH_MARKER', discussion: 'Current evidence.' } };

test('cacheable prefix precedes varying assignments, excludes memory and separates request scopes', () => {
  const a = buildProviderContext(input); const b = buildProviderContext({ ...input, assignment: 'Capacity: answer a different question.' });
  assert.ok(commonPrefix(a.prompt, b.prompt) > 5000);
  assert.equal(a.prompt.includes('PRIVATE_MEMORY_MARKER'), false);
  assert.equal(a.prompt.split(input.evidence.owner).length - 1, 1);
  assert.ok(a.prompt.indexOf(input.evidence.owner) < a.prompt.indexOf(input.assignment));
  assert.ok(a.prompt.indexOf(input.evidence.shared) < a.prompt.indexOf(input.assignment));
  assert.equal(a.prompt.split(input.evidence.shared).length - 1, 1);
  const c = buildProviderContext({ ...input, contextScope: 'request-B', evidence: { owner: 'OTHER_REQUEST', discussion: '' } });
  assert.equal(c.prompt.includes(input.evidence.owner), false);
  assert.ok(commonPrefix(a.prompt, c.prompt) < a.prompt.indexOf(input.evidence.owner));
  const prompts = createRuntimePrompts(instructions);
  const old = item => `${item.assignment}\n\nOwner question:\n${item.evidence.owner}\n\nPrior confirmed discussion:\n${item.evidence.discussion}\n\n${prompts.outputContract(item)} ${prompts.providerPolicy(false)}`;
  assert.equal(commonPrefix(old(input), old({ ...input, assignment: 'Capacity: answer a different question.' })), 0);
  assert.equal(a.promptBytes, Buffer.byteLength(a.prompt));
});

test('request binding survives Continue and rejects rebinding or previous request sources', async () => {
  const store = createMemoryStore(); const chat = await store.createConversation();
  const snapshot = { ...defaultSettings, contractVersion: 'parallel-v1', runtimeInstructions: testRuntimeInstructions, instructionDocuments: instructions.documents, specialistCount: '1', discussionDepth: '1' };
  const previous = await store.acceptMessage(chat.id, { body: 'OLD_REQUEST_MARKER', clientRequestId: 'context-test-old-0001' }, snapshot);
  await store.appendAgentMessage(chat.id, previous.run.generation, { role: 'Head Consultant', body: 'OLD_ANSWER_MARKER', sources: [{ url: 'https://example.com/old-only', title: 'Old source', claim: 'Old evidence', retrievedAt: new Date().toISOString() }] });
  await store.finishRun(chat.id, previous.run.generation, 'complete');
  const accepted = await store.acceptMessage(chat.id, { body: 'CURRENT_REQUEST_MARKER', clientRequestId: 'context-test-new-0001' }, snapshot);
  assert.equal(await store.updateRunSnapshot(chat.id, accepted.run.generation, { ...accepted.run.snapshot, requestMessageId: previous.message.id }), undefined);
  await store.stop(chat.id); const resumed = await store.continueRun(chat.id);
  assert.equal(resumed.id, accepted.run.id);
  assert.equal(resumed.snapshot.requestMessageId, accepted.message.id);
  const calls = [];
  await runParallelConsultation({ store, conversationId: chat.id, runState: resumed, signal: new AbortController().signal, onProvider() {}, provider: { async invoke(call) {
    calls.push(call);
    const body = call.outputKind === 'head_plan' ? JSON.stringify({ assignments: [{ role: 'Analyst', task: 'Resolve the current decision.', guidance: 'Check evidence.', dependsOn: [] }], researchQuery: null }) : call.outputKind === 'team_review' ? JSON.stringify({ summary: 'Evidence sufficient.', findings: [] }) : 'Current answer.';
    return { ok: true, body, sources: [] };
  } } });
  for (const call of calls) {
    assert.ok(call.evidence.owner.includes('CURRENT_REQUEST_MARKER'));
    assert.doesNotMatch(buildProviderContext(call).prompt, /OLD_REQUEST_MARKER|OLD_ANSWER_MARKER|old-only|PRIVATE_MEMORY_MARKER/);
    assert.equal(call.contextScope, accepted.run.id);
  }
  assert.deepEqual((await store.events(chat.id)).at(-1).sources, []);
  validateLocalState(store.snapshotState());
});

test('Head control decisions avoid full answer replay while final synthesis retains complete results', async () => {
  const store = createMemoryStore(); const chat = await store.createConversation();
  const { run } = await store.acceptMessage(chat.id, { body: 'Measure demand and capacity.', clientRequestId: 'context-control-0001' }, { ...defaultSettings, contractVersion: 'parallel-v1', runtimeInstructions: testRuntimeInstructions, specialistCount: '1', discussionDepth: 'auto' });
  const calls = []; const longAnswer = 'COMPLETE_EVIDENCE_DETAIL '.repeat(3000);
  await runParallelConsultation({ store, conversationId: chat.id, runState: run, signal: new AbortController().signal, onProvider() {}, provider: { async invoke(call) {
    calls.push(call);
    const body = call.outputKind === 'head_plan' ? JSON.stringify({ assignments: [{ role: 'Analyst', task: 'Measure demand.', guidance: 'Use data.', dependsOn: [] }], researchQuery: null }) : call.outputKind === 'team_review' ? JSON.stringify({ summary: 'All requested evidence is present; no material defects.', findings: [] }) : call.outputKind === 'head_review' ? '[REVIEW: CLOSE]' : call.outputKind === 'specialist_position' ? longAnswer : 'Final conclusion.';
    return { ok: true, body, sources: [] };
  } } });
  const control = calls.find(c => c.outputKind === 'head_review'); const final = calls.find(c => c.outputKind === 'head_final');
  assert.ok(control.evidence.discussion.length < final.evidence.discussion.length / 20);
  assert.match(control.evidence.discussion, /All requested evidence/);
  assert.ok(final.evidence.discussion.includes(longAnswer));
  assert.ok(calls.find(c => c.outputKind === 'team_review').evidence.discussion.includes(longAnswer));
});
