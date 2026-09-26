#!/usr/bin/env node
let observedWorkspace;
import { createInterface } from "node:readline";

const send = value => process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...value })}\n`);
let threadModel;
const expectedFeatures = ["shell_tool", "unified_exec", "view_image", "shell_snapshot", "apps", "plugins", "hooks", "memories", "browser_use", "browser_use_external", "browser_use_full_cdp_access", "computer_use", "image_generation", "workspace_dependencies", "code_mode", "code_mode_host", "multi_agent", "multi_agent_v2", "skill_search", "tool_suggest", "request_permissions_tool"];
const replyFor = prompt => {
  let answer = "A bounded answer.";
  if (prompt.includes("Exercise distinct claims on one URL")) return "Two independently supported claims.\n" + ["First supported fact.", "Second supported fact."].map(claim => `<nanoduck-source>${JSON.stringify({url:"https://example.com/shared",title:"Shared report",claim})}</nanoduck-source>`).join("\n");
  if (prompt.includes("Exercise long source persistence")) return `A complete answer with source context.\n<nanoduck-source>${JSON.stringify({ title: "Evidence title ".repeat(30), url: "https://example.com/long-evidence", claim: "A supported fact with necessary context. ".repeat(80) })}</nanoduck-source>`;
  if (prompt.includes("Return a Ukrainian relative-pronoun example")) return 'Уточніть, які умови потрібно виконати.\n<nanoduck-source>{"title":"Курси, які доступні","url":"https://example.com/courses","claim":"Вимоги, які підтверджує програма."}</nanoduck-source>';
  if (prompt.includes("In one coordinated plan") && /Synthetic \w+ browser decision/u.test(prompt)) return JSON.stringify({ assignments: [
    { role: "Buyer Demand Analyst", guidance: "Evaluate buyer need.", task: "Find a reversible buyer-demand test.", dependsOn: [] },
    { role: "Capacity Planner", guidance: "Evaluate delivery capacity.", task: "Set a capacity threshold for that test.", dependsOn: [] }
  ], researchQuery: null });
  if (prompt.includes("In one coordinated plan")) return JSON.stringify({ assignments: [
    { role: "Strategy Consultant", guidance: "Assess buyer evidence and a reversible positioning test.", task: "Assess buyer evidence and name the positioning test that changes the decision.", dependsOn: [] },
    { role: "Finance Consultant", guidance: "Assess the cost and measurement of the buyer test.", task: "Assess the test cost and the threshold for proceeding.", dependsOn: [] }
  ], researchQuery: "buyer positioning evidence" });
  if (prompt.includes('Return only JSON: {"summary"') && /Synthetic \w+ browser decision/u.test(prompt)) return JSON.stringify({ summary: "Both answers support a bounded buyer test.", findings: [] });
  if (prompt.includes('Return only JSON: {"summary"')) return JSON.stringify({ summary: "The strategy answer assumes prospects will accept interviews; finance gives a bounded test cost.", findings: [{ assignment: 1, issue: "The strategy answer assumes those buyers will take calls without evidence.", correction: "Recruit calls from a defined prospect list and measure interview acceptance." }] });
  if (prompt.includes('Return only JSON: {"assessments"')) return JSON.stringify({ assessments: [{ orderId: prompt.match(/order ([A-Za-z0-9_-]{32})/u)?.[1], state: "resolved_corrected", reason: "The revision now measures interview acceptance from a defined prospect list." }] });
  if (prompt.includes("The Critic has ordered you to stop going in circles")) return "I accept the gap: recruit calls from a defined prospect list and record interview acceptance before drawing the conclusion.";
  if (prompt.includes("Private role guidance:") && prompt.includes("Head assignment:")) return "The position is viable only if a defined buyer has an urgent problem; test targeted interviews before committing.\n<nanoduck-source>{\"title\":\"Buyer evidence\",\"url\":\"https://example.com/buyer-evidence\",\"claim\":\"Buyer willingness must be measured before positioning.\",\"publishedAt\":\"2026-09-01\"}</nanoduck-source>";
  if (prompt.includes("There are no separate compulsory final speeches")) return "Start with a narrow buyer list, measure interview acceptance, then decide whether the position has evidence.";
  if (prompt.includes("List each distinct requested deliverable")) answer = "1. Assess current market evidence. 2. Recommend a positioning test with a source.";
  else if (prompt.includes("Return only [TEAM: Role, Role]")) answer = "[TEAM: Strategy Consultant, Finance Consultant]";
  else if (prompt.includes("Decide whether the owner's requested outputs require current public facts")) answer = "buyer positioning evidence";
  else if (prompt.includes("Research this public topic using live web search")) answer = "Public buyer research supports testing before scaling.";
  else if (prompt.includes("The application will deliver your exact text to")) answer = "Assess the buyer evidence and name the one test that would change the decision.";
  else if (prompt.includes("Answer the Head's task")) answer = "The position is viable only if a defined buyer has an urgent problem; test that through targeted interviews before committing.";
  else if (prompt.includes("directly on exchange")) answer = "That recommendation assumes those buyers will take calls; test their willingness before treating the interviews as evidence.";
  else if (prompt.includes("Respond directly to the Critic")) answer = "I accept the gap: recruit calls from a defined prospect list and record acceptance rate before drawing the conclusion.";
  else if (prompt.includes("Return exactly [REVIEW: CONTINUE] or [REVIEW: CLOSE]")) answer = "[REVIEW: CLOSE]";
  else if (prompt.includes("your final position after reading")) answer = "My final position is to test buyer willingness before scaling, using confirmed interview acceptance as the condition.";
  else if (prompt.includes("reviewing every selected specialist's final position")) answer = "The final positions support the same bounded buyer test, with no remaining conflict. [CONSILIUM: REACHED]";
  else if (prompt.includes("only owner-facing synthesis")) answer = "Start with a narrow buyer list, measure interview acceptance, then decide whether the position has evidence.";
  if (prompt.includes("Return a prohibited source")) return `${answer}\n<nanoduck-source>{\"title\":\"Как это работает\",\"url\":\"https://example.su/buyer-evidence\",\"claim\":\"Это запрещенный источник.\",\"publishedAt\":\"2026-09-01\"}</nanoduck-source>`;
  if (prompt.includes("Return prohibited body URL")) return "Read [blocked](https://example.su/buyer-evidence).";
  if (prompt.includes("Return only a prohibited body URL")) return "https://example.su/buyer-evidence";
  if (prompt.includes("Return prohibited prose")) return "Как это работает?";
  if (prompt.includes("Return mixed-language prose")) return "The buyer test should run for two weeks. Как это работает? Measure qualified replies and conversion.";
  if (prompt.includes("Use live public web research") && !prompt.includes("Use only English or Ukrainian sources")) return "The source language policy is missing.";
  return prompt.includes("Use live public web research") || prompt.includes("Answer the Head's task") ? `${answer}\n<nanoduck-source>{\"title\":\"Buyer evidence\",\"url\":\"https://example.com/buyer-evidence\",\"claim\":\"Buyer willingness must be measured before positioning.\",\"publishedAt\":\"2026-09-01\"}</nanoduck-source>` : answer;
};
createInterface({ input: process.stdin, crlfDelay: Infinity }).on("line", line => {
  const request = JSON.parse(line);
  if (request.method === "initialized" || request.id === undefined) return;
  if (request.method === "initialize") return send({ id: request.id, result: {} });
  if (request.method === "thread/start") {
    threadModel = request.params.model; observedWorkspace = request.params.cwd;
    const config = request.params?.config;
    const safe = request.params?.baseInstructions?.includes("consulting participant") && request.params?.ephemeral === true && request.params?.cwd === process.env.HOME && request.params?.environments?.length === 0 && expectedFeatures.every(key => config?.features?.[key] === false);
    return safe ? send({ id: request.id, result: { model: request.params.model, thread: { id: "isolated-thread", model: request.params.model } } }) : send({ id: request.id, error: { message: "unsafe_thread" } });
  }
  if (request.method === "account/read") return send({ id: request.id, result: { account: { type: "chatgpt" } } });
  if (request.method === "model/list") {
    const entry = (model, efforts) => ({ id: model, model, supportedReasoningEfforts: efforts.map(reasoningEffort => ({ reasoningEffort })) });
    const data = [entry("gpt-5.6-sol", ["low", "medium", "high", "xhigh", "max", "ultra"])];
    if (!process.argv.includes("--sol-only")) data.push(entry("gpt-6-astra", ["xhigh", "ultra"]));
    if (!process.argv.includes("--without-sol")) data.push(entry("gpt-6-sol", process.argv.includes("--limited-sol") ? ["medium", "unknown", "medium"] : ["low", "medium", "high", "xhigh", "max", "ultra"]));
    return send({ id: request.id, result: { data, nextCursor: null } });
  }
  if (request.method === "account/rateLimits/read") return send({ id: request.id, result: { rateLimits: { rateLimitReachedType: null } } });
  if (request.method === "turn/start") {
    const prompt = request.params?.input?.[0]?.text ?? "";
    if (prompt.includes("Exercise upstream usage")) {
      for (const responseId of (prompt.includes("partial raw") ? ["response-1"] : ["response-1", "response-1", "response-2"])) {
        const metadata = {input_tokens:50, output_tokens:20, total_tokens:70, input_tokens_details:{cached_tokens:30,...(prompt.includes("missing write") ? {} : {cache_write_tokens:prompt.includes("explicit zero") ? 0 : 10})},output_tokens_details:{reasoning_tokens:15},private_payload:"DO_NOT_STORE"};
        for(const [threadId,turnId] of [["isolated-thread","turn-1"],["wrong-thread","turn-1"],["isolated-thread","wrong-turn"]]) send({method:"rawResponse/completed",params:{threadId,turnId,responseId,usageMetadata:{metadata}}});
      }
    }
    if (!prompt.includes("Without token usage") && !prompt.includes("raw only")) {
      const tokenUsage = { total: { inputTokens: 100, outputTokens: 40, totalTokens: 140, cachedInputTokens: 60, reasoningOutputTokens: 30 }, last: { inputTokens: 10, outputTokens: 4, totalTokens: 14, cachedInputTokens: 6, reasoningOutputTokens: 3 } };
      for (let copy = 0; copy < 2; copy++) send({ method: "thread/tokenUsage/updated", params: { threadId: "isolated-thread", turnId: "turn-1", tokenUsage } });
      for (const [threadId, turnId] of [["wrong-thread", "turn-1"], ["isolated-thread", "wrong-turn"]]) send({ method: "thread/tokenUsage/updated", params: { threadId, turnId, tokenUsage: { total: { ...tokenUsage.total, totalTokens: 99999 }, last: tokenUsage.last } } });
    }
    if (prompt.includes("Report request workspace.")) return send({ id: request.id, result: { turn: { id: "turn-1", status: "completed", items: [{ type: "agentMessage", text: JSON.stringify({ workspace: observedWorkspace }) }] } } });
    if (prompt.includes("Exercise progress deadline")) {
      send({ id: request.id, result: { turn: { id: "turn-1", status: "inProgress" } } });
      const interval = setInterval(() => send({ method: "item/reasoning/summaryTextDelta", params: { threadId: "isolated-thread", turnId: prompt.includes("wrong turn") ? "other-turn" : "turn-1", delta: "private-reasoning-must-not-be-logged" } }), 40);
      if (!prompt.includes("never completes")) setTimeout(() => {
        clearInterval(interval);
        send({ method: "turn/completed", params: { threadId: "isolated-thread", turn: { id: "turn-1", status: "completed", items: [{ type: "agentMessage", text: "A bounded answer." }] } } });
      }, 650);
      return;
    }
    if (prompt.includes("Report selected model and effort")) return send({ id: request.id, result: { turn: { id: "turn-1", status: "completed", items: [{ type: "agentMessage", text: JSON.stringify({ threadModel, turnModel: request.params.model, effort: request.params.effort }) }] } } });
    if (prompt.includes("Report completed research diagnostics")) {
      const search = { type: "webSearch", id: "search-1", query: "synthetic-query-do-not-log", action: { type: "search", query: "synthetic-query-do-not-log" } };
      send({ method: "item/completed", params: { threadId: "another-thread", turnId: "turn-1", item: { ...search, id: "wrong-thread" } } });
      send({ method: "item/completed", params: { threadId: "isolated-thread", turnId: "another-turn", item: { ...search, id: "wrong-turn" } } });
      for (let repeat = 0; repeat < 2; repeat += 1) send({ method: "item/completed", params: { threadId: "isolated-thread", turnId: "turn-1", item: search } });
      return send({ id: request.id, result: { turn: { id: "turn-1", status: "completed", items: [search, { ...search, id: "search-2" }, { type: "agentMessage", text: "A bounded answer." }] } } });
    }
    if (prompt.includes("Wait for the notification")) {
      send({ id: request.id, result: { turn: { id: "turn-1", status: "inProgress" } } });
      return setTimeout(() => send({ method: "turn/completed", params: { threadId: "isolated-thread", turn: { id: "turn-1", status: "completed", items: [{ type: "agentMessage", text: replyFor(prompt) }] } } }), 10);
    }
    if (prompt.includes("Wait for a slow ephemeral turn")) {
      send({ id: request.id, result: { turn: { id: "turn-1", status: "inProgress" } } });
      send({ method: "turn/completed", params: { threadId: "another-thread", turn: { id: "turn-1", status: "completed", items: [{ type: "agentMessage", text: "Wrong thread." }] } } });
      send({ method: "turn/completed", params: { threadId: "isolated-thread", turn: { id: "another-turn", status: "completed", items: [{ type: "agentMessage", text: "Wrong turn." }] } } });
      send({ method: "item/agentMessage/delta", params: { threadId: "isolated-thread", turnId: "turn-1", delta: "Unconfirmed partial text." } });
      return setTimeout(() => {
        send({ method: "item/completed", params: { threadId: "isolated-thread", turnId: "turn-1", item: { type: "agentMessage", id: "answer", text: replyFor(prompt) } } });
        send({ method: "turn/completed", params: { threadId: "isolated-thread", turn: { id: "turn-1", status: "completed", items: [] } } });
      }, 2_800);
    }
    if (prompt.includes("Complete before the start response")) {
      send({ method: "turn/completed", params: { threadId: "isolated-thread", turn: { id: "turn-1", status: "completed", items: [{ type: "agentMessage", text: replyFor(prompt) }] } } });
      return setTimeout(() => send({ id: request.id, result: { turn: { id: "turn-1", status: "inProgress" } } }), 10);
    }
    if (prompt.includes("Fail the turn RPC")) return send({ id: request.id, error: { code: -32601, message: "Method is unsupported; do not expose authentication material." } });
    if (prompt.includes("Fail because context window")) return send({ id: request.id, error: { code: -32602, message: "Maximum context window exceeded; do not expose private diagnostic text." } });
    if (prompt.includes("Fail after a completed item")) {
      send({ id: request.id, result: { turn: { id: "turn-1", status: "inProgress" } } });
      send({ method: "item/completed", params: { threadId: "isolated-thread", turnId: "turn-1", item: { type: "agentMessage", text: "Do not accept this failed output." } } });
      return send({ method: "turn/completed", params: { threadId: "isolated-thread", turn: { id: "turn-1", status: "failed", error: { message: "Usage limit reached; do not expose private diagnostic text." } } } });
    }
    if (prompt.includes("Close without completion")) {
      send({ id: request.id, result: { turn: { id: "turn-1", status: "inProgress" } } });
      return setTimeout(() => process.exit(0), 10);
    }
    if (prompt.includes("Wait until cancelled")) return send({ id: request.id, result: { turn: { id: "turn-1", status: "inProgress" } } });
    return send({ id: request.id, result: { turn: { id: "turn-1", status: "completed", items: [{ type: "agentMessage", text: replyFor(prompt) }] } } });
  }
  if (request.method === "thread/read") {
    return send({ id: request.id, error: { code: -32600, message: "ephemeral threads do not support includeTurns" } });
  }
  if (request.method === "thread/unsubscribe") return send({ id: request.id, result: {} });
  send({ id: request.id, error: { message: "unknown_method" } });
});
