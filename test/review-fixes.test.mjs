import assert from 'node:assert/strict';
import test from 'node:test';
import { buildProviderContext } from '../src/server/provider-context.mjs';
import { createMemoryStore, defaultSettings } from '../src/server/store.mjs';
import { runParallelConsultation } from '../src/server/consultation-parallel.mjs';
import { activeOrders, parseHeadPlan, validateParallelTransition } from '../src/server/parallel-contract.mjs';
import { validateLocalState } from '../src/server/local-state.mjs';
import { parseRuntimeInstructions } from '../src/server/prompt-contracts.mjs';
import { exportConversationRtf } from '../src/server/conversation-export.mjs';
import { testRuntimeInstructions } from './fixtures/runtime-instructions.mjs';
const plan = (roles = ['Analyst'], dependencies = roles.map(() => []), researchQuery = null) => JSON.stringify({ assignments: roles.map((role, i) => ({ role, guidance: 'Check the assigned evidence.', task: `Resolve the ${role} question.`, dependsOn: dependencies[i] })), researchQuery });
const fixture = async (extra = {}) => {
  const store = createMemoryStore(); const conversation = await store.createConversation();
  const { run } = await store.acceptMessage(conversation.id, { body: 'Evaluate a fictional bakery pilot.', clientRequestId: 'review-fixture-0001' }, { ...defaultSettings, runtimeInstructions: testRuntimeInstructions, contractVersion: 'parallel-v1', specialistCount: '1', discussionDepth: '1', ...extra });
  return { store, conversationId: conversation.id, runState: run, signal: new AbortController().signal, onProvider() {} };
};
const source = number => ({ url: `https://example.com/evidence-${number}`, title: `Evidence ${number}`, claim: `Verified condition ${number}`, retrievedAt: '2026-09-26T00:00:00.000Z' });
const ok = (body, sources = []) => ({ ok: true, body, sources });
const review = (findings = [], researchRequest = null) => JSON.stringify({ summary: 'Retain the UNIQUE_REVIEW_CONDITION in the recommendation.', findings, researchRequest });
const finding = { assignment: 1, issue: 'Missing demand evidence.', correction: 'Provide a verifiable demand estimate.' };
const orderIds = input => [...input.evidence.discussion.matchAll(/ order ([A-Za-z0-9_-]{32})/gu)].map(match => match[1]);
const assess = (input, state) => JSON.stringify({ assessments: orderIds(input).map(orderId => ({ orderId, state, reason: state === 'open' ? 'Evidence is still absent.' : 'The evidence now supports the corrected estimate.' })) });
const defaults = input => input.outputKind === 'head_plan' ? plan() : input.outputKind === 'team_review' ? review() : 'Use a measured pilot.';

test('unresolved directives receive linked attempts; new defects survive; Critic alone resolves the latest attempt', async () => {
  const sample = await fixture({ discussionDepth: '3' }); const calls = []; let rounds = 0; let replies = 0; let assessments = 0;
  await runParallelConsultation({ ...sample, provider: { async invoke(input) {
    calls.push(input);
    if (input.outputKind === 'team_review') return ok(review(++rounds === 2 ? [{ assignment: 1, issue: 'Missing capacity evidence.', correction: 'Calculate capacity.' }] : rounds === 1 ? [finding] : []));
    if (input.outputKind === 'specialist_reply') return ok(`Revised evidence attempt ${++replies}.`);
    if (input.outputKind === 'critic_order_assessment') return ok(assess(input, ++assessments === 1 ? 'open' : 'resolved_corrected'));
    return ok(defaults(input));
  } } });
  const work = (await sample.store.run(sample.conversationId)).snapshot.parallelWork;
  assert.equal(rounds, 3); assert.equal(replies, 2); assert.equal(assessments, 2);
  assert.equal(work.orders[0].state, 'open'); assert.deepEqual(work.orders[1].previousOrderIds, [work.orders[0].id]);
  assert.match(work.orders[1].issue, /demand/); assert.match(work.orders[1].issue, /capacity/);
  assert.equal(activeOrders(work).length, 1); assert.equal(work.consiliumReached, true);
  validateLocalState(sample.store.snapshotState());
  const tampered = structuredClone(work); tampered.revision++; tampered.orders[1].previousOrderIds = [];
  assert.equal(validateParallelTransition(work, tampered, [], await sample.store.events(sample.conversationId)), false);
  assert.match(calls.find(input => input.outputKind === 'head_final').evidence.discussion, /UNIQUE_REVIEW_CONDITION/);
});

test('dependent worker starts before an unrelated slow worker finishes', async () => {
  const sample = await fixture({ specialistCount: '3' }); let release; const held = new Promise(resolve => { release = resolve; }); let dependentStarted;
  const ready = new Promise(resolve => { dependentStarted = resolve; });
  const running = runParallelConsultation({ ...sample, provider: { async invoke(input) {
    if (input.outputKind === 'head_plan') return ok(plan(['Fast', 'Slow', 'Dependent'], [[], [], [1]]));
    if (input.outputKind === 'specialist_position' && input.assignment.includes('You are the Slow')) await held;
    if (input.outputKind === 'specialist_position' && input.assignment.includes('You are the Dependent')) dependentStarted(input);
    return ok(defaults(input));
  } } });
  try {
    const input = await Promise.race([ready, new Promise((_, reject) => setTimeout(() => reject(Error('dependent blocked by unrelated worker')), 500))]);
    assert.match(input.evidence.discussion, /Fast/);
    assert.equal((await sample.store.events(sample.conversationId)).some(event => event.role === 'Slow'), false);
  } finally { release(); await running; }
});

test('role transport accepts 64 characters, repairs longer/reserved names, and preserves task text', () => {
  for (const role of ['owner', ' Owner ', 'System', 'head consultant', 'CRITIC', 'A'.repeat(65)]) assert.throws(() => parseHeadPlan(plan([role]), '1', ['a'.repeat(32)]), /provider_contract/);
  assert.equal(parseHeadPlan(plan(['A'.repeat(64)]), '1', ['a'.repeat(32)]).assignments[0].role.length, 64);
});

test('saved position/reply and selected role guidance reach both specialist calls', async () => {
  const markdown = testRuntimeInstructions.markdown.replace('## Specialist Position\n', '## Specialist Position\nPOSITION_MARKER ').replace('## Specialist Reply\n', '## Specialist Reply\nREPLY_MARKER ').replace('## Spiritual Consultant\n', '## Spiritual Consultant\nROLE_MARKER ');
  const sample = await fixture({ runtimeInstructions: parseRuntimeInstructions(markdown) }); const calls = [];
  await runParallelConsultation({ ...sample, provider: { async invoke(input) {
    calls.push(input);
    if (input.outputKind === 'head_plan') return ok(plan(['Spiritual Consultant']));
    if (input.outputKind === 'team_review') return ok(review([finding]));
    if (input.outputKind === 'specialist_reply') return ok('A corrected and supported answer.');
    if (input.outputKind === 'critic_order_assessment') return ok(assess(input, 'resolved_corrected'));
    return ok(defaults(input));
  } } });
  assert.match(calls.find(input => input.outputKind === 'specialist_position').assignment, /POSITION_MARKER/);
  assert.match(calls.find(input => input.outputKind === 'specialist_reply').assignment, /REPLY_MARKER/);
  for (const input of calls.filter(item => ['specialist_position', 'specialist_reply'].includes(item.outputKind))) assert.match(input.assignment, /ROLE_MARKER/);
});

test('secret-like output is neither persisted nor forwarded, while ordinary phone numbers remain allowed', async () => {
  const sample = await fixture(); const secret = `sk-${'x'.repeat(30)}`; const calls = [];
  await assert.rejects(runParallelConsultation({ ...sample, provider: { async invoke(input) { calls.push(input); return ok(input.outputKind === 'head_plan' ? plan() : secret); } } }), /output_policy/);
  assert.equal(JSON.stringify(await sample.store.events(sample.conversationId)).includes(secret), false);
  assert.equal(calls.some(input => input.outputKind === 'team_review'), false);
  const allowed = await fixture();
  await runParallelConsultation({ ...allowed, provider: { async invoke(input) { return ok(input.outputKind === 'specialist_position' ? 'Public contact: +1 202 555 0147.' : defaults(input)); } } });
  assert.equal((await allowed.store.run(allowed.conversationId)).status, 'complete');
});

test('Critic requests isolated follow-up research; source metadata reaches review, correction, assessment and final export record', async () => {
  const sample = await fixture(); const calls = [];
  await runParallelConsultation({ ...sample, provider: { async invoke(input) {
    calls.push(input);
    if (input.outputKind === 'head_plan') return ok(plan(['Analyst'], [[]], 'public bakery demand statistics'));
    if (input.outputKind === 'public_research') return ok('Public evidence.', [source(calls.filter(i => i.outputKind === 'public_research').length)]);
    if (input.outputKind === 'research_query') return ok('public bakery capacity statistics');
    if (input.outputKind === 'specialist_position') return ok('Initial estimate.', [source(3)]);
    if (input.outputKind === 'team_review') return ok(review([finding], 'Verify updated bakery capacity.'));
    if (input.outputKind === 'specialist_reply') return ok('Revised estimate.', [source(4)]);
    if (input.outputKind === 'critic_order_assessment') return ok(assess(input, 'resolved_corrected'));
    return ok(defaults(input), [source(5)]);
  } } });
  const researchCalls = calls.filter(input => input.outputKind === 'public_research');
  assert.equal(researchCalls.length, 2);
  assert.equal(researchCalls[0].evidence.discussion, '');
  assert.match(researchCalls[1].evidence.shared, /evidence-1/);
  assert.ok(researchCalls.every(input => !input.evidence.owner.includes('fictional') && !input.runtimeInstructions.documents));
  assert.match(buildProviderContext(calls.find(input => input.outputKind === 'team_review')).prompt, /evidence-3/);
  assert.match(calls.find(input => input.outputKind === 'specialist_reply').evidence.shared, /evidence-2/);
  assert.match(buildProviderContext(calls.find(input => input.outputKind === 'specialist_reply')).prompt, /evidence-2/);
  const assessment = buildProviderContext(calls.find(input => input.outputKind === 'critic_order_assessment')).prompt;
  for (const n of [1, 2, 3, 4]) assert.ok(assessment.includes(`evidence-${n}`));
  const final = (await sample.store.events(sample.conversationId)).at(-1);
  assert.deepEqual(final.sources.map(item => item.url).sort(), [1, 2, 3, 4, 5].map(n => source(n).url).sort());
  const exported = exportConversationRtf(await sample.store.exportConversation(sample.conversationId));
  for (const n of [1, 2, 3, 4, 5]) assert.ok(exported.includes(source(n).url));
  validateLocalState(sample.store.snapshotState());
});

test('Auto Head receives Critic summary even when there are no correction orders', async () => {
  const sample = await fixture({ discussionDepth: 'auto' }); const calls = [];
  await runParallelConsultation({ ...sample, provider: { async invoke(input) { calls.push(input); return ok(input.outputKind === 'head_review' ? '[REVIEW: CLOSE]' : defaults(input)); } } });
  for (const kind of ['head_review', 'head_final']) assert.match(calls.find(input => input.outputKind === kind).evidence.discussion, /UNIQUE_REVIEW_CONDITION/);
});

test('checkpointed follow-up evidence and replies survive an encrypted restart without replay', async () => {
  const { randomBytes } = await import('node:crypto');
  const { encryptText, decryptText } = await import('../src/server/crypto.mjs');
  const dataKey = randomBytes(32);
  let store = createMemoryStore();
  const conversation = await store.createConversation();
  const { run } = await store.acceptMessage(conversation.id, { body: 'Evaluate a fictional bakery pilot.', clientRequestId: 'durable-fixture-0001' }, { ...defaultSettings, runtimeInstructions: testRuntimeInstructions, contractVersion: 'parallel-v1', specialistCount: '1', discussionDepth: '3' });
  let failOnce = true; let round = 0; const calls = [];
  const provider = { async invoke(input) {
    calls.push(input.outputKind);
    if (input.outputKind === 'team_review') { round++; return ok(review(round <= 2 ? [finding] : [], round === 2 ? 'Verify demand.' : null)); }
    if (input.outputKind === 'research_query') return ok('public bakery demand');
    if (input.outputKind === 'public_research') return ok('Verified public demand evidence.', [source(1)]);
    if (input.outputKind === 'specialist_reply') return ok(`Corrected answer for round ${round}.`);
    if (input.outputKind === 'critic_order_assessment') {
      if (round === 2 && failOnce) { failOnce = false; return { ok: false, code: 'provider_unavailable' }; }
      return ok(assess(input, round === 1 ? 'open' : 'resolved_corrected'));
    }
    return ok(defaults(input));
  } };
  const execute = runState => runParallelConsultation({ store, conversationId: conversation.id, runState, signal: new AbortController().signal, onProvider() {}, provider });
  await assert.rejects(execute(run), /provider_unavailable/);
  const saved = await store.run(conversation.id);
  assert.equal(saved.snapshot.parallelWork.orders[1].assessmentMessageId, undefined);
  assert.ok(saved.snapshot.parallelWork.orders[1].responseMessageId);
  assert.equal(saved.snapshot.parallelWork.rounds[1].research.status, 'complete');
  const sealed = encryptText(JSON.stringify(store.snapshotState()), dataKey);
  assert.equal(JSON.stringify(sealed).includes('public bakery demand'), false);
  store = createMemoryStore(JSON.parse(decryptText(sealed, dataKey)));
  await execute(await store.run(conversation.id));
  assert.equal(calls.filter(kind => kind === 'public_research').length, 1);
  assert.equal(calls.filter(kind => kind === 'specialist_reply').length, 2);
  assert.equal((await store.run(conversation.id)).snapshot.parallelWork.consiliumReached, true);
});

test('unsafe Head follow-up queries never reach public research', async () => {
  const sample = await fixture(); let searched = false;
  await runParallelConsultation({ ...sample, provider: { async invoke(input) {
    if (input.outputKind === 'team_review') return ok(review([], 'Check an external claim.'));
    if (input.outputKind === 'research_query') return ok('Contact private.person@example.com about bakery demand');
    if (input.outputKind === 'public_research') searched = true;
    return ok(defaults(input));
  } } });
  assert.equal(searched, false);
  assert.equal((await sample.store.run(sample.conversationId)).snapshot.parallelWork.rounds[0].research.reason, 'unsafe_query');
});

test('metadata repair preserves Head task and legacy generated owner roles do not become owner context', async () => {
  const sample = await fixture();
  await sample.store.appendAgentMessage(sample.conversationId, sample.runState.generation, { role: 'owner', recipient: 'Critic', body: 'LEGACY_GENERATED_OWNER_ROLE', sources: [] });
  let drafts = 0; const task = '  Preserve this exact task.\nVerify the demand.  '; const role = 'A'.repeat(64); const calls = [];
  await runParallelConsultation({ ...sample, provider: { async invoke(input) {
    calls.push(input);
    if (input.outputKind === 'head_plan') return ok(JSON.stringify({ assignments: [{ role: ++drafts === 1 ? 'owner' : role, guidance: 'Assess the evidence.', task, dependsOn: [] }], researchQuery: null }));
    return ok(defaults(input));
  } } });
  assert.equal(drafts, 2);
  assert.equal((await sample.store.events(sample.conversationId)).find(event => event.recipient === role).body, task);
  assert.ok(calls.every(input => !input.evidence.owner.includes('LEGACY_GENERATED_OWNER_ROLE')));
  assert.equal((await sample.store.run(sample.conversationId)).snapshot.parallelWork.ownerMessageIds.length, 1);
  validateLocalState(sample.store.snapshotState());
});
