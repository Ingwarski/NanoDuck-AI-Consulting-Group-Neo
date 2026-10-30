import { Buffer } from "node:buffer";
import { createConsultationService } from "../src/server/consultation.mjs";
import { createMemoryStore, defaultSettings } from "../src/server/store.mjs";
import { documentNames, readDocumentDefault } from "../src/server/instruction-documents.mjs";
import { readPromptDefault } from "../src/server/instruction-bootstrap.mjs";
import { buildProviderContext } from "../src/server/provider-context.mjs";

const baseBody = "Should a fictional bakery test preorders? Compare buyer demand and capacity, give a reversible recommendation and explain what evidence would change it.";
const runtimeInstructions = await readPromptDefault();
const instructionDocuments = await Promise.all(documentNames.map(async name => ({ name, revision: 1, markdown: await readDocumentDefault(name) })));
const complete = async store => {
  for (let index = 0; index < 1000; index += 1) {
    const run = (await store.activeRuns())[0];
    if (!run) return;
    await new Promise(resolve => setTimeout(resolve, 2));
  }
  throw new Error("synthetic_measurement_timeout");
};
const syntheticReply = (input, scenario) => {
  switch (input.outputKind) {
    case "owner_deliverables": return "1. Compare demand and capacity. 2. Recommend a reversible test and evidence threshold.";
    case "auto_team": return "[TEAM: Sales Consultant, Operations Consultant]";
    case "head_task": return `Evaluate the ${input.recipient} evidence needed for the preorder pilot.`;
    case "research_query": return scenario === "repeated_gap" ? JSON.stringify({query:null,reuseRecord:"initial",fresh:false,researchFor:[1]}) : scenario.startsWith("research_") ? "public bakery pilot capacity evidence" : "[RESEARCH: NONE]";
    case "public_research": return "A small measured pilot establishes actual capacity. [Pilot source](https://example.com/pilot).";
    case "head_review": return "[REVIEW: CLOSE]";
    case "critic_final": return "The bounded pilot is adequately grounded. [CONSILIUM: REACHED]";
    case "head_plan": return JSON.stringify({ assignments: [
      { role: "Sales Consultant", guidance: "Evaluate buyer demand.", task: "Specify the buyer-demand test and decision threshold.", dependsOn: [] },
      { role: "Operations Consultant", guidance: "Evaluate delivery capacity.", task: "Specify the delivery-capacity limit and fallback.", dependsOn: [] }
    ], researchQuery: ["initial_research", "repeated_gap", "shared_evidence"].includes(scenario) ? "public bakery preorder evidence" : null, researchFor: [1] });
    case "team_review": if (["research_followup", "research_recovery", "repeated_gap"].includes(scenario)) return JSON.stringify({summary:"Verify the specific pilot capacity fact.",findings:[],researchRequest:"Establish a measured capacity method."});
      return JSON.stringify(scenario === "targeted_rework"
      ? { summary: "The demand threshold lacks a source.", findings: [{ assignment: 1, issue: "The buyer threshold is unsupported.", correction: "State a measurable acceptance threshold without inventing a market count." }] }
      : { summary: "Both answers support a bounded pilot.", findings: [] });
    case "specialist_reply": return "Use the measured acceptance rate of a small prospect sample; do not assume a market count.";
    case "critic_order_assessment": return JSON.stringify({ assessments: [{ orderId: input.evidence.discussion.match(/order ([A-Za-z0-9_-]{32})/u)?.[1], state: "resolved_corrected", reason: "The revised answer now uses a measured sample threshold." }] });
    case "head_final": return "Test a small preorder pilot with a buyer acceptance and delivery-capacity threshold.";
    default: return "A small pilot is reversible; record evidence, uncertainty and the decision threshold.";
  }
};
const measure = async (parallel, scenario) => {
  const store = createMemoryStore(); const conversation = await store.createConversation(); const calls = [];
  const body = scenario === "long_request" ? `${baseBody}\n${"Additional confirmed capacity constraint and requested verification. ".repeat(160)}` : baseBody;
  const snapshot = { ...defaultSettings, specialistCount: "2", discussionDepth: "1", runtimeInstructions, instructionDocuments, ...(parallel ? { contractVersion: "parallel-v1" } : {}) };
  const accepted = await store.acceptMessage(conversation.id, { body, clientRequestId: parallel ? "synthetic-parallel-case" : "synthetic-legacy-case" }, snapshot);
  let interrupted = false; let startedResearch; const researchStarted = new Promise(resolve => { startedResearch = resolve; });
  const provider = { async invoke(input) {
    calls.push(input);
    if (scenario === "research_recovery" && input.outputKind === "public_research" && !interrupted) {
      interrupted = true; startedResearch();
      await new Promise(resolve => input.signal.addEventListener("abort", resolve, { once:true }));
      return {ok:false,code:"cancelled"};
    }
    return { ok: true, body: syntheticReply(input, scenario), sources: input.outputKind === "public_research" || (scenario === "shared_evidence" && input.outputKind === "specialist_position") ? [{url:"https://example.com/pilot",title:"Pilot source",claim:scenario === "shared_evidence" ? "Pilot measurements apply only to the sampled service and season; retain the uncertainty. ".repeat(30) : "Measure pilot capacity.",retrievedAt:"2026-09-26T00:00:00Z"}] : [] };
  } };
  const service = createConsultationService({ store, provider });
  await service.start(conversation.id, accepted.run);
  if (scenario === "research_recovery") { await researchStarted; await service.stop(conversation.id); await service.continue(conversation.id); }
  await complete(store);
  const run = await store.run(conversation.id);
  if (run.status !== "complete") throw new Error(`synthetic_measurement_${parallel ? "parallel" : "legacy"}_${run.status}`);
  const steps = calls.map(input => {
    const built = buildProviderContext(input);
    return {stage:input.outputKind,promptBytes:built.promptBytes,prefixBytes:built.prefixBytes,sharedEvidenceBytes:Buffer.byteLength(input.evidence?.shared ?? ""),discussionBytes:Buffer.byteLength(input.evidence?.discussion ?? "")};
  });
  await service.close();
  return { calls:calls.length, promptBytes:steps.reduce((sum,item)=>sum+item.promptBytes,0), steps, researchCalls:calls.filter(item=>item.research).length, queryCalls:calls.filter(item=>item.outputKind==="research_query").length, tokenUsage:"unavailable_in_synthetic_provider" };
};
const cases = [];
for (const scenario of ["clean", "targeted_rework", "long_request", "initial_research", "research_followup", "repeated_gap", "research_recovery", "shared_evidence"]) cases.push({scenario,...await measure(true,scenario)});

process.stdout.write(`${JSON.stringify({ method: "current_shared_builder_two_consultants_fixed_one_round_same_guidance_and_settings", cases }, null, 2)}\n`);
