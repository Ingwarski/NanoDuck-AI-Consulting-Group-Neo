import assert from "node:assert/strict";
import test from "node:test";
import { createConsultationService } from "../src/server/consultation.mjs";
import { createMemoryStore, defaultSettings } from "../src/server/store.mjs";
import { testRuntimeInstructions } from "./fixtures/runtime-instructions.mjs";

const waitFor = async predicate => {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error("timed_out");
};
const plan = (roles = ["Demand Analyst", "Capacity Planner"], dependencies = [[], []]) => JSON.stringify({ assignments: roles.map((role, index) => ({ role, guidance: `Examine ${role.toLowerCase()} evidence.`, task: `Answer the ${role.toLowerCase()} decision for the bakery.`, dependsOn: dependencies[index] })), researchQuery: null });
const fixture = async (overrides = {}) => {
  const store = createMemoryStore();
  const conversation = await store.createConversation();
  const accepted = await store.acceptMessage(conversation.id, { body: "Should our fictional bakery test preorders?", clientRequestId: "parallel-fixture-0001" }, { ...defaultSettings, runtimeInstructions: testRuntimeInstructions, contractVersion: "parallel-v1", specialistCount: "2", discussionDepth: "1", ...overrides });
  return { store, id: conversation.id, run: accepted.run };
};
const start = async (sample, provider) => {
  const service = createConsultationService({ store: sample.store, provider });
  await service.start(sample.id, sample.run);
  return service;
};
const answer = input => {
  switch (input.outputKind) {
    case "head_plan": return plan();
    case "specialist_position": return `${input.assignment.includes("Demand Analyst") ? "Demand" : "Capacity"} evidence supports a small reversible pilot.`;
    case "team_review": return JSON.stringify({ summary: "Both decisions address the assigned questions.", findings: [] });
    case "head_final": return "Run a small preorder pilot and measure conversion and capacity.";
    default: throw new Error(`unexpected ${input.outputKind}`);
  }
};

test("Head creates unlisted roles; independent consultants overlap and faster results appear first", async () => {
  const sample = await fixture(); const calls = [];
  let releaseSlow;
  const slow = new Promise(resolve => { releaseSlow = resolve; });
  const provider = { async invoke(input) {
    calls.push(input);
    if (input.outputKind === "specialist_position" && input.assignment.includes("Demand Analyst")) await slow;
    return { ok: true, body: answer(input), sources: [] };
  } };
  await start(sample, provider);
  await waitFor(() => calls.filter(input => input.outputKind === "specialist_position").length === 2);
  await waitFor(async () => (await sample.store.events(sample.id)).some(event => event.role === "Capacity Planner"));
  assert.equal((await sample.store.events(sample.id)).some(event => event.role === "Demand Analyst"), false);
  releaseSlow();
  await waitFor(async () => (await sample.store.run(sample.id)).status === "complete");
  const events = await sample.store.events(sample.id);
  assert.deepEqual(events.filter(event => event.role === "Head Consultant" && event.recipient).map(event => event.recipient), ["Demand Analyst", "Capacity Planner"]);
  assert.deepEqual(events.filter(event => ["Demand Analyst", "Capacity Planner"].includes(event.role)).map(event => event.role), ["Capacity Planner", "Demand Analyst"]);
  const consultantCalls = calls.filter(input => input.outputKind === "specialist_position");
  assert.ok(consultantCalls.every(input => input.evidence.owner.includes("fictional bakery")));
  assert.ok(consultantCalls.every(input => !input.evidence.discussion.includes("fictional bakery")));
  assert.equal(calls.filter(input => input.outputKind === "team_review").length, 1);
  assert.equal(calls.filter(input => input.outputKind === "head_final").length, 1);
});

test("an unusual long Head task reaches its recipient byte-for-byte", async () => {
  const sample = await fixture({ specialistCount: "1" });
  const task = `  Test the bakery's exceptional overnight preorder constraint.\n${"Consider the cold-chain handoff and name the one measurable failure point. ".repeat(20)}  `;
  const provider = { async invoke(input) {
    const body = input.outputKind === "head_plan" ? JSON.stringify({ assignments: [{ role: "Cold Chain Analyst", guidance: "Assess temperature-sensitive handoffs.", task, dependsOn: [] }], researchQuery: null }) : answer(input);
    return { ok: true, body, sources: [] };
  } };
  await start(sample, provider);
  await waitFor(async () => (await sample.store.run(sample.id)).status === "complete");
  const assignment = (await sample.store.events(sample.id)).find(event => event.role === "Head Consultant" && event.recipient === "Cold Chain Analyst");
  assert.equal(assignment.body, task);
});

test("a repeated answer cannot satisfy a Critic order; final answer remains provisional", async () => {
  const sample = await fixture({ specialistCount: "1" }); const calls = [];
  const provider = { async invoke(input) {
    calls.push(input);
    const body = input.outputKind === "head_plan" ? plan(["Demand Analyst"], [[]])
      : input.outputKind === "specialist_position" || input.outputKind === "specialist_reply" ? "Demand is certainly 50,000 customers."
      : input.outputKind === "team_review" ? JSON.stringify({ summary: "The customer count is unsupported.", findings: [{ assignment: 1, issue: "The 50,000 customer claim has no evidence.", correction: "Remove the figure or provide a verifiable source." }] })
      : input.outputKind === "critic_order_assessment" ? JSON.stringify({ assessments: [{ orderId: JSON.parse(input.assignment.match(/Previous draft:\n(.+)/su)?.[1] ?? "null")?.assessments?.[0]?.orderId ?? input.evidence.discussion.match(/order ([A-Za-z0-9_-]{32})/u)?.[1], state: input.assignment.includes("Repair") ? "open" : "resolved_corrected", reason: "The same unsupported figure remains." }] })
      : "The recommendation is provisional until demand is verified.";
    return { ok: true, body, sources: [] };
  } };
  await start(sample, provider);
  await waitFor(async () => (await sample.store.run(sample.id)).status === "complete");
  const work = (await sample.store.run(sample.id)).snapshot.parallelWork;
  assert.equal(work.orders.length, 1);
  assert.equal(work.orders[0].state, "open");
  assert.equal(work.consiliumReached, false);
  assert.equal(calls.filter(input => input.outputKind === "critic_order_assessment").length, 2);
});

test("retry keeps a successful sibling and runs only the missing consultant", async () => {
  const sample = await fixture(); const calls = []; let failedOnce = false;
  const provider = { async invoke(input) {
    calls.push(input);
    if (input.outputKind === "specialist_position" && input.assignment.includes("Demand Analyst") && !failedOnce) { failedOnce = true; return { ok: false, code: "provider_unavailable" }; }
    return { ok: true, body: answer(input), sources: [] };
  } };
  const service = await start(sample, provider);
  await waitFor(async () => (await sample.store.run(sample.id)).status === "failed");
  assert.equal((await sample.store.events(sample.id)).filter(event => event.role === "Capacity Planner").length, 1);
  await service.continue(sample.id);
  await waitFor(async () => (await sample.store.run(sample.id)).status === "complete");
  assert.equal(calls.filter(input => input.outputKind === "specialist_position" && input.assignment.includes("Capacity Planner")).length, 1);
  assert.equal((await sample.store.events(sample.id)).filter(event => event.role === "Capacity Planner").length, 1);
});

test("fixed depth performs all selected team reviews without forced replies", async () => {
  const sample = await fixture({ specialistCount: "1", discussionDepth: "3" }); const calls = [];
  const provider = { async invoke(input) {
    calls.push(input);
    return { ok: true, body: input.outputKind === "head_plan" ? plan(["Demand Analyst"], [[]]) : answer(input), sources: [] };
  } };
  await start(sample, provider);
  await waitFor(async () => (await sample.store.run(sample.id)).status === "complete");
  assert.equal(calls.filter(input => input.outputKind === "team_review").length, 3);
  assert.equal(calls.filter(input => input.outputKind === "specialist_reply").length, 0);
  assert.equal(calls.filter(input => input.outputKind === "head_review").length, 0);
  assert.equal((await sample.store.run(sample.id)).snapshot.parallelWork.rounds.length, 3);
});

test("five-review setting remains a fixed owner choice", async () => {
  const sample = await fixture({ specialistCount: "1", discussionDepth: "5" }); const calls = [];
  const provider = { async invoke(input) {
    calls.push(input);
    return { ok: true, body: input.outputKind === "head_plan" ? plan(["Demand Analyst"], [[]]) : answer(input), sources: [] };
  } };
  await start(sample, provider);
  await waitFor(async () => (await sample.store.run(sample.id)).status === "complete");
  assert.equal(calls.filter(input => input.outputKind === "team_review").length, 5);
  assert.equal(calls.filter(input => input.outputKind === "specialist_reply").length, 0);
});

test("stopping fences all in-flight consultant results", async () => {
  const sample = await fixture(); const calls = [];
  const provider = { async invoke(input) {
    calls.push(input);
    if (input.outputKind === "specialist_position") return new Promise(resolve => input.signal.addEventListener("abort", () => resolve({ ok: false, code: "cancelled" }), { once: true }));
    return { ok: true, body: answer(input), sources: [] };
  } };
  const service = await start(sample, provider);
  await waitFor(() => calls.filter(input => input.outputKind === "specialist_position").length === 2);
  await service.stop(sample.id);
  assert.equal((await sample.store.run(sample.id)).status, "stopped");
  assert.equal((await sample.store.events(sample.id)).filter(event => ["Demand Analyst", "Capacity Planner"].includes(event.role)).length, 0);
});

test("a dependent consultant waits for its declared prerequisite", async () => {
  const sample = await fixture(); const calls = [];
  let releaseDemand; const waitDemand = new Promise(resolve => { releaseDemand = resolve; });
  const provider = { async invoke(input) {
    calls.push(input);
    if (input.outputKind === "head_plan") return { ok: true, body: plan(["Demand Analyst", "Capacity Planner"], [[], [1]]), sources: [] };
    if (input.outputKind === "specialist_position" && input.assignment.includes("Demand Analyst")) await waitDemand;
    return { ok: true, body: answer(input), sources: [] };
  } };
  await start(sample, provider);
  await waitFor(() => calls.some(input => input.outputKind === "specialist_position"));
  assert.equal(calls.filter(input => input.outputKind === "specialist_position").length, 1);
  releaseDemand();
  await waitFor(async () => (await sample.store.run(sample.id)).status === "complete");
  const capacity = calls.find(input => input.outputKind === "specialist_position" && input.assignment.includes("Capacity Planner"));
  assert.match(capacity.evidence.discussion, /Demand evidence supports/u);
});

test("Auto depth closes on Head decision after one team review", async () => {
  const sample = await fixture({ discussionDepth: "auto", specialistCount: "1" }); const calls = [];
  const provider = { async invoke(input) {
    calls.push(input);
    return { ok: true, body: input.outputKind === "head_plan" ? plan(["Demand Analyst"], [[]]) : input.outputKind === "head_review" ? "[REVIEW: CLOSE]" : answer(input), sources: [] };
  } };
  await start(sample, provider);
  await waitFor(async () => (await sample.store.run(sample.id)).status === "complete");
  assert.equal(calls.filter(input => input.outputKind === "team_review").length, 1);
  assert.equal(calls.filter(input => input.outputKind === "head_review").length, 1);
  assert.equal((await sample.store.run(sample.id)).snapshot.parallelWork.rounds[0].decision, "CLOSE");
});

test("Auto never exceeds ten reviews even when Head keeps requesting more", async () => {
  const sample = await fixture({ discussionDepth: "auto", specialistCount: "1" }); const calls = [];
  const provider = { async invoke(input) {
    calls.push(input);
    return { ok: true, body: input.outputKind === "head_plan" ? plan(["Demand Analyst"], [[]]) : input.outputKind === "head_review" ? "[REVIEW: CONTINUE]" : answer(input), sources: [] };
  } };
  await start(sample, provider);
  await waitFor(async () => (await sample.store.run(sample.id)).status === "complete");
  assert.equal(calls.filter(input => input.outputKind === "team_review").length, 10);
  assert.equal((await sample.store.run(sample.id)).snapshot.parallelWork.rounds.at(-1).decision, "CLOSE");
});

for (const resolution of ["blocked_evidence", "resolved_objection_upheld"]) {
  test(`Critic alone records ${resolution} against the addressed answer`, async () => {
    const sample = await fixture({ specialistCount: "1" });
    const provider = { async invoke(input) {
      const body = input.outputKind === "head_plan" ? plan(["Demand Analyst"], [[]])
        : input.outputKind === "specialist_position" ? resolution === "blocked_evidence" ? "The estimate is 50,000 buyers." : "A 50,000 ceiling is hypothetical for scenario planning, not observed demand."
        : input.outputKind === "team_review" ? JSON.stringify({ summary: "The estimate lacks direct evidence.", findings: [{ assignment: 1, issue: "The buyer count has no direct source.", correction: "Supply direct evidence or withdraw the count." }] })
        : input.outputKind === "specialist_reply" ? resolution === "blocked_evidence" ? "I cannot verify the count with current evidence." : "The Critic misread this as a market count; it is a hypothetical ceiling, not a factual estimate."
        : input.outputKind === "critic_order_assessment" ? JSON.stringify({ assessments: [{ orderId: input.evidence.discussion.match(/order ([A-Za-z0-9_-]{32})/u)?.[1], state: resolution, reason: resolution === "blocked_evidence" ? "Direct evidence is unavailable." : "The original statement was clearly a hypothetical limit." }] })
        : "The advice remains conditional on buyer evidence.";
      return { ok: true, body, sources: [] };
    } };
    await start(sample, provider);
    await waitFor(async () => (await sample.store.run(sample.id)).status === "complete");
    const work = (await sample.store.run(sample.id)).snapshot.parallelWork;
    assert.equal(work.orders[0].state, resolution);
    assert.ok(work.orders[0].assessmentMessageId);
    assert.equal(work.consiliumReached, resolution === "resolved_objection_upheld");
  });
}

test("a new owner send is isolated from the earlier request even in the same chat", async () => {
  const sample = await fixture({ specialistCount: "1" }); const calls = [];
  const provider = { async invoke(input) {
    calls.push(input);
    return { ok: true, body: input.outputKind === "head_plan" ? plan(["Demand Analyst"], [[]]) : answer(input), sources: [] };
  } };
  const service = await start(sample, provider);
  await waitFor(async () => (await sample.store.run(sample.id)).status === "complete");
  calls.length = 0;
  const correction = "Correction: include a reversible one-week capacity limit.";
  const accepted = await sample.store.acceptMessage(sample.id, { body: correction, clientRequestId: "parallel-fixture-0002" }, { ...defaultSettings, runtimeInstructions: testRuntimeInstructions, contractVersion: "parallel-v1", specialistCount: "1", discussionDepth: "1" });
  await service.start(sample.id, accepted.run);
  await waitFor(async () => (await sample.store.run(sample.id)).status === "complete");
  for (const call of calls) {
    assert.equal(call.evidence.owner.split("Should our fictional bakery test preorders?").length - 1, 0);
    assert.equal(call.evidence.owner.split(correction).length - 1, 1);
    assert.equal(call.evidence.discussion.includes("Consolidated advice"), false);
    assert.equal(call.contextScope, accepted.run.id);
  }
});

test("multiple Critic findings for one consultant become one complete order and one reply", async () => {
  const sample = await fixture(); const calls = [];
  const defects = [
    { assignment: 1, issue: "The demand number lacks evidence.", correction: "Replace it with a measured preorder count." },
    { assignment: 2, issue: "Capacity excludes packing.", correction: "Include packing time in the capacity estimate." },
    { assignment: 1, issue: "The trial has no stop condition.", correction: "State a measurable stop condition." }
  ];
  await start(sample, { async invoke(input) {
    calls.push(input);
    const body = input.outputKind === "team_review" ? JSON.stringify({ summary: "Three material defects need correction.", findings: defects })
      : input.outputKind === "specialist_reply" ? "Use a measured preorder count, a measurable stop condition and packing time in the estimate."
      : input.outputKind === "critic_order_assessment" ? JSON.stringify({ assessments: [...input.evidence.discussion.matchAll(/order ([A-Za-z0-9_-]{32})/gu)].map(match => ({ orderId: match[1], state: "resolved_corrected", reason: "The requested measures and conditions are now supplied." })) })
      : answer(input);
    return { ok: true, body, sources: [] };
  } });
  await waitFor(async () => (await sample.store.run(sample.id)).status === "complete");
  const work = (await sample.store.run(sample.id)).snapshot.parallelWork;
  assert.equal(work.orders.length, 2);
  const first = work.orders.find(item => item.assignmentId === work.assignments[0].id);
  for (const defect of [defects[0], defects[2]]) { assert.ok(first.issue.includes(defect.issue)); assert.ok(first.correction.includes(defect.correction)); }
  assert.equal(work.orders.every(order => order.state === "resolved_corrected"), true);
  assert.equal(calls.filter(input => input.outputKind === "team_review").length, 1, "Valid repeated recipients never spend a format-repair call");
  assert.equal(calls.filter(input => input.outputKind === "specialist_reply").length, 2);
  assert.equal(calls.filter(input => input.outputKind === "critic_order_assessment").length, 1);
});

for (const repaired of [true, false]) test(`malformed Critic review is repaired once; repair success=${repaired}`, async () => {
  const sample = await fixture(); let reviews = 0;
  const service = await start(sample, { async invoke(input) {
    if (input.outputKind === "team_review" && ++reviews <= (repaired ? 1 : 2)) return { ok: true, body: "The review omitted its JSON structure.", sources: [] };
    return { ok: true, body: answer(input), sources: [] };
  } });
  await waitFor(async () => (await sample.store.run(sample.id)).status === (repaired ? "complete" : "failed"));
  assert.equal(reviews, 2);
  const run = await sample.store.run(sample.id);
  assert.equal(Object.keys(run.snapshot.parallelWork.results).length, 2);
  if (!repaired) {
    assert.match((await sample.store.events(sample.id)).at(-1).body, /Critic review.*one format repair/);
    await service.continue(sample.id);
    await waitFor(async () => (await sample.store.run(sample.id)).status === "complete");
    assert.equal((await sample.store.events(sample.id)).filter(event => event.role === "Demand Analyst").length, 1);
  }
});

test("a repaired Critic review persists only the repaired response sources", async () => {
  const sample = await fixture({ specialistCount: "1" });
  const stale = { url: "https://example.com/stale", title: "Stale draft", claim: "Rejected draft source" };
  const repaired = { url: "https://example.com/repaired", title: "Repaired review", claim: "Accepted review source" };
  let reviews = 0;
  await start(sample, { async invoke(input) {
    if (input.outputKind === "head_plan") return { ok: true, body: plan(["Demand Analyst"], [[]]), sources: [] };
    if (input.outputKind === "team_review" && ++reviews === 1) return { ok: true, body: "Malformed first review", sources: [stale] };
    if (input.outputKind === "team_review") return { ok: true, body: JSON.stringify({ summary: "The repaired assessment is valid.", findings: [] }), sources: [repaired] };
    return { ok: true, body: answer(input), sources: [] };
  } });
  await waitFor(async () => (await sample.store.run(sample.id)).status === "complete");
  const review = (await sample.store.events(sample.id)).find(event => event.role === "Critic" && event.recipient === "Head Consultant" && event.body === "The repaired assessment is valid.");
  assert.deepEqual(review.sources, [repaired]);
  assert.equal(review.sources.some(source => source.url === stale.url), false);
});

test("a Send accepted during prior provider cleanup starts after that cleanup finishes", async () => {
  const sample = await fixture({ specialistCount: "1" });
  let releaseFirst; let markReleaseStarted;
  const firstReleaseAllowed = new Promise(resolve => { releaseFirst = resolve; });
  const firstReleaseStarted = new Promise(resolve => { markReleaseStarted = resolve; });
  const calls = [];
  const provider = {
    async invoke(input) {
      calls.push({ run: input.contextScope, outputKind: input.outputKind });
      return { ok: true, body: input.outputKind === "head_plan" ? plan(["Demand Analyst"], [[]]) : answer(input), sources: [] };
    },
    async releaseScope(scope) {
      if (scope === sample.run.id) {
        markReleaseStarted();
        await firstReleaseAllowed;
      }
    }
  };
  const service = await start(sample, provider);
  await waitFor(async () => (await sample.store.run(sample.id)).status === "complete");
  await firstReleaseStarted;

  const accepted = await sample.store.acceptMessage(sample.id, { body: "Now assess a one-week capacity limit.", clientRequestId: "parallel-cleanup-request-0002" }, { ...defaultSettings, runtimeInstructions: testRuntimeInstructions, contractVersion: "parallel-v1", specialistCount: "1", discussionDepth: "1" });
  await service.start(sample.id, accepted.run);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(calls.some(call => call.run === accepted.run.id), false);
  assert.equal((await sample.store.run(sample.id)).status, "active");

  releaseFirst();
  await waitFor(async () => (await sample.store.run(sample.id)).status === "complete");
  assert.equal(calls.some(call => call.run === accepted.run.id), true);
  await service.close();
});
