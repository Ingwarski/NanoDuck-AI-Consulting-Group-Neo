import { evidenceLedger, compactEvidence, evidenceTable, resolveEvidenceReferences, researchBundle, researchRecords } from "./research-evidence.mjs";
import { randomId } from "./crypto.mjs";
import { activeOrders, parseHeadPlan, parseOrderAssessment, parseTeamReview, parseResearchPlan } from "./parallel-contract.mjs";
import { createRuntimePrompts, parseRuntimeInstructions, runtimeInstructionsFor } from "./prompt-contracts.mjs";
import { containsInternalToolTrace } from "./output-safety.mjs";
import { containsSecretLikeContent } from "./content-policy.mjs";
import { hasProhibitedLanguage, hasUnsafeExternalUrl, safeExternalUrl } from "./validation.mjs";
import { deriveConversationTitle } from "./conversation-title.mjs";
import { readFileSync } from "node:fs";

const publicInstructions = parseRuntimeInstructions(readFileSync(new URL("../../instructions/RUNTIME_PROMPTS.md", import.meta.url), "utf8"));
const roleSettings = snapshot => ({
  head: { provider: "codex", model: snapshot.headModel, effort: snapshot.headReasoning },
  consultant: { provider: "codex", model: snapshot.headModel, effort: snapshot.headReasoning },
  critic: snapshot.criticProvider === "claude_code"
    ? { provider: "claude_code", model: snapshot.criticClaudeModel ?? snapshot.criticModel, effort: snapshot.criticClaudeReasoning ?? snapshot.criticReasoning }
    : { provider: "codex", model: snapshot.criticCodexModel ?? snapshot.criticModel, effort: snapshot.criticCodexReasoning ?? snapshot.criticReasoning }
});
const languageFor = value => {
  if (/\b(?:answer|respond|reply|write)\s+in\s+english\b|англійськ/iu.test(value)) return "English";
  if (/\b(?:answer|respond|reply|write)\s+in\s+ukrainian\b|українськ/iu.test(value)) return "Ukrainian";
  return /[А-Яа-яІіЇїЄєҐґ]/u.test(value) ? "Ukrainian" : "English";
};
const present = value => typeof value === "string" && value.trim();
const sourceRecord = sources => (sources ?? []).map(source => `${source.title}: ${source.url}\nSupported claim: ${source.claim}\nRetrieved: ${source.retrievedAt}${source.publishedAt ? `; published: ${source.publishedAt}` : ""}`).join("\n");
const mergeSources = (...groups) => [...new Map(groups.flat().map(source => [JSON.stringify([source.url, source.claim]), source])).values()];
const evidenceRecord = message => `${message?.body ?? "pending"}${message?.sources?.length ? `\nSources:\n${sourceRecord(message.sources)}` : ""}`;
const compactRecord = (work, events) => work.assignments.map((assignment, index) => {
  const result = work.results[assignment.id];
  return `${index + 1}. ${assignment.role}\nTask: ${assignment.task}\nLatest answer: ${evidenceRecord(events.find(item => item.id === result?.messageId) ?? result)}`;
}).join("\n\n");
const orderRecord = work => activeOrders(work).map(order => {
  const role = work.assignments.find(item => item.id === order.assignmentId)?.role;
  return `${role}: ${order.issue}\nCorrection required: ${order.correction}\nState: ${order.state}${order.assessmentReason ? `\nCritic assessment: ${order.assessmentReason}` : ""}`;
}).join("\n\n");
const publicQuery = body => {
  if (!present(body) || hasProhibitedLanguage(body) || hasUnsafeExternalUrl(body) || containsSecretLikeContent(body)) return undefined;
  let unsafe = false;
  const withoutUrls = body.replace(/https:\/\/[^\s)]+/gu, value => {
    const url = safeExternalUrl(value);
    if (!url || new URL(url).search || new URL(url).hash) unsafe = true;
    return "[public page]";
  });
  if (unsafe || /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu.test(withoutUrls) || /(?:\+?\d[\d\s().-]{7,}\d)/u.test(withoutUrls)) return undefined;
  return body.trim();
};
const correctionPrompt = assignment => `${assignment}\n\nReplace the withheld draft completely. Use only English or Ukrainian, omit disallowed fragments or URLs, and do not describe this correction.`;
const initialGuidance = ["Strategy", "Finance", "Operations", "Entrepreneurship", "Sales", "Marketing", "Product", "Data", "Risk", "Spiritual", "Psychotherapist"].join(", ");

// This coordinator is selected only for newly accepted parallel-v1 runs. Its
// work ledger is private encrypted state; the visible transcript holds only
// Head tasks, completed answers, Critic findings and the final synthesis.
export async function runParallelConsultation({ store, provider, conversationId, runState, signal, onProvider }) {
  const generation = runState.generation;
  const snapshot = runState.snapshot;
  const settings = roleSettings(snapshot);
  const allEvents = await store.events(conversationId);
  const acceptedOwnerIds = snapshot.requestMessageId ? [snapshot.requestMessageId] : snapshot.parallelWork?.ownerMessageIds;
  const allOwners = allEvents.filter(event => event.role === "owner" && !event.recipient);
  // Old paused ledgers retain their accepted scope; new sends bind exactly one message.
  const ownerEvents = acceptedOwnerIds ? allOwners.filter(event => acceptedOwnerIds.includes(event.id)) : allOwners.slice(-1);
  if (!ownerEvents.length) throw new Error("invalid_run_state");
  const owner = ownerEvents.map((event, index) => `${index + 1}. ${event.body}${event.attachments?.length ? `\n[${event.attachments.length} attached image(s); text-only routes cannot examine their pixels]` : ""}`).join("\n\n");
  const language = languageFor(ownerEvents.at(-1).body);
  const fullInstructions = Object.freeze({ ...runtimeInstructionsFor(snapshot), documents: (snapshot.instructionDocuments ?? []).filter(item => item.name !== "WORKING_CONTEXT.md") });
  const scopedInstructions = names => Object.freeze({ ...fullInstructions, documents: fullInstructions.documents.filter(item => names.includes(item.name)) });
  const consultantInstructions = scopedInstructions(["AGENTS.md", "CONSULTING_PLAYBOOK.md"]);
  const criticInstructions = scopedInstructions(["AGENTS.md", "CONSILIUM.md"]);
  const prompts = createRuntimePrompts(fullInstructions);
  const isCurrent = async () => {
    const run = await store.run(conversationId);
    return !signal.aborted && run?.status === "active" && run.generation === generation;
  };
  const currentWork = async () => (await store.run(conversationId))?.snapshot.parallelWork;
  const invoke = async ({ route, assignment, outputKind, usageParticipant, usageParticipantId, usagePurpose, discussion = "", sharedEvidence = "", sharedSources = [], research = false, instructions = fullInstructions, ownerText = owner }) => {
    if (!await isCurrent()) throw new Error("cancelled");
    onProvider(route.provider, outputKind);
    const relatedSources = research ? [] : (await store.events(conversationId)).filter(event => event.sequence >= ownerEvents[0].sequence).flatMap(event => event.sources ?? []).filter(source => discussion.includes(source.url) || assignment.includes(source.url));
    const ledger = evidenceLedger([...sharedSources, ...relatedSources]);
    const shared = [compactEvidence(sharedEvidence, ledger), evidenceTable(ledger)].filter(Boolean).join("\n\n");
    const input = { ...route, usageParticipant, usageParticipantId, usagePurpose, contextScope: runState.id, assignment: compactEvidence(assignment, ledger), evidence: { owner: ownerText, shared, discussion: compactEvidence(discussion, ledger) }, outputKind, research, runtimeInstructions: instructions, signal };
    let result = await provider.invoke(input);
    if (!result.ok && ["language_policy", "output_policy"].includes(result.code) && await isCurrent()) result = await provider.invoke({ ...input, usagePurpose: "retry", assignment: correctionPrompt(input.assignment) });
    if (!result.ok) throw new Error(result.code ?? "provider_unavailable");
    try {
      const resolved = resolveEvidenceReferences(result.body, ledger);
      result = { ...result, body: resolved.body, sources: mergeSources(result.sources ?? [], resolved.sources) };
    } catch (error) {
      if (error.message !== "evidence_reference" || !await isCurrent()) throw error;
      result = await provider.invoke({ ...input, usagePurpose: "retry", assignment: `${input.assignment}\nYour previous answer cited an unknown evidence ID. Regenerate using only the exact IDs in the supplied table, or explicitly state the evidence is unavailable. Do not invent references.` });
      if (!result.ok) throw new Error(result.code ?? "provider_unavailable");
      const resolved = resolveEvidenceReferences(result.body, ledger);
      result = { ...result, body: resolved.body, sources: mergeSources(result.sources ?? [], resolved.sources) };
    }
    if (containsSecretLikeContent(result.body) || (result.sources ?? []).some(source => containsSecretLikeContent(JSON.stringify(source)))) throw new Error("output_policy");
    if (containsInternalToolTrace(result.body)) throw new Error("provider_contract");
    if (!await isCurrent()) throw new Error("cancelled");
    return result;
  };
  const commit = async (change, messages = []) => {
    for (let retry = 0; retry < 30; retry += 1) {
      if (!await isCurrent()) throw new Error("cancelled");
      const before = await currentWork();
      const next = change(before ? structuredClone(before) : undefined);
      if (!next) return undefined;
      next.revision = (before?.revision ?? -1) + 1;
      const saved = await store.commitParallelWork(conversationId, generation, before?.revision ?? -1, next, messages);
      if (saved) return saved;
    }
    throw new Error("invalid_run_state");
  };

  let work = await currentWork();
  if (!work) {
    const count = snapshot.specialistCount ?? "2";
    const planPrompt = `You are Head Consultant and the orchestrator. Read the complete ordered owner messages once. This request is independent: do not infer earlier messages or saved personal context. In one coordinated plan, choose ${count === "auto" ? "one to five" : `exactly ${count}`} distinct consultants. Role examples: ${initialGuidance}; these are guidance, not an allowlist. Create another precise role if the case needs it. Role names must be at most 64 characters and cannot be owner, System, Head Consultant or Critic (case-insensitive). Give each consultant one concise, distinct, Head-authored task tied to a concrete owner deliverable and a private role guidance paragraph. Do not repeat or paraphrase the full owner request in each task; the app supplies it separately. A dependency is allowed only when a consultant truly needs another consultant's completed result. Use 1-based earlier assignment numbers in dependsOn. If current public facts are necessary, set researchQuery to one focused public evidence gap, listing the required facts and when it is answered, with no private details; otherwise null. researchFor lists the 1-based assignments that need this evidence; omit it only when all need it. Return only JSON: {"assignments":[{"role":"...","guidance":"...","task":"...","dependsOn":[]}],"researchQuery":null,"researchFor":[1]}. No advice to the owner. Write task and guidance in ${language}.`;
    let result = await invoke({ route: settings.head, assignment: planPrompt, outputKind: "head_plan", discussion: "" });
    const ids = Array.from({ length: 5 }, () => randomId());
    let plan;
    try { plan = parseHeadPlan(result.body, count, ids); }
    catch {
      result = await invoke({ route: settings.head, usagePurpose: "retry", assignment: `${planPrompt}\n\nRepair only the required JSON structure and recipient/dependency metadata. Retain your original specific task prose and role guidance. Previous draft:\n${result.body}`, outputKind: "head_plan", discussion: "" });
      plan = parseHeadPlan(result.body, count, ids);
    }
    const tasks = plan.assignments.map(item => ({ id: randomId(), role: "Head Consultant", recipient: item.role, body: item.task, sources: [] }));
    const assignments = plan.assignments.map((item, index) => ({ ...item, taskMessageId: tasks[index].id }));
    await commit(before => before ? undefined : { version: 1, ownerMessageIds: ownerEvents.map(item => item.id), assignments, researchQuery: plan.researchQuery, researchFor: plan.researchFor, results: {}, orders: [], rounds: [] }, tasks);
    work = await currentWork();
  }
  if (JSON.stringify(work.ownerMessageIds) !== JSON.stringify(ownerEvents.map(item => item.id))) throw new Error("invalid_run_state");

  const researchTopic = async (rawQuery, assignmentIds) => {
    if (!rawQuery || /^\[RESEARCH:\s*NONE\]$/iu.test(rawQuery.trim())) return { status: "none" };
    const query = publicQuery(rawQuery);
    if (!query) return { status: "unavailable", reason: "unsafe_query" };
    // Only earlier PUBLIC research from this request can enter the research route.
    const savedResearch = [work.research, ...work.rounds.map(round => round.research)].filter(item => item?.status === "complete");
    const knownSources = mergeSources(...savedResearch.map(item => item.sources ?? []));
    try {
      const result = await invoke({ route: settings.head, assignment: "Research only the specific public evidence gap in the query using live web search. First use the supplied public sources where they already answer it. Search only missing or outdated facts; prefer primary sources. Batch independent lookups where useful. Do not repeatedly open the same page or repeat equivalent queries without a concrete unresolved fact. Stop when the requested facts are supported, or explain the precise remaining evidence gap. Return a concise evidence digest with the actual findings, dates, direct URLs and necessary qualifications; no broad background essay. Do not infer private owner context.", outputKind: "public_research", usagePurpose: knownSources.length ? "followup_research" : "initial", research: true, instructions: publicInstructions, ownerText: query, sharedEvidence: "Existing public evidence from this request; not a fresh check.", sharedSources: knownSources });
      return { status: "complete", query, body: result.body, sources: result.sources ?? [], ...(assignmentIds ? { assignmentIds } : {}) };
    } catch (error) {
      if (error.message === "cancelled") throw error;
      return { status: "unavailable", reason: error.message };
    }
  };
  if (!work.research) {
    const research = await researchTopic(work.researchQuery, work.researchFor);
    await commit(before => before.research ? undefined : { ...before, research });
    work = await currentWork();
  }
  const evidenceFor = assignmentId => { const bundle = researchBundle(work, assignmentId); return { sharedEvidence: bundle.body, sharedSources: bundle.sources }; };
  const teamRecord = async value => compactRecord(value, await store.events(conversationId));
  const reviewRecord = async value => {
    const events = await store.events(conversationId);
    return value.rounds.map(round => `Critic round ${round.number}:\n${evidenceRecord(events.find(item => item.id === round.reviewMessageId))}`).join("\n\n");
  };

  const runPosition = async assignment => {
    const latest = await currentWork();
    if (latest.results[assignment.id]) return;
    const dependencyEvents = await store.events(conversationId);
    const dependencies = assignment.dependsOn.map(id => {
      const dependency = latest.assignments.find(item => item.id === id);
      return `${dependency.role}: ${evidenceRecord(dependencyEvents.find(item => item.id === latest.results[id].messageId))}`;
    }).join("\n\n");
    const prompt = `${prompts.specialistPosition({ specialist: assignment.role, assignedBrief: assignment.task, language })}\nPrivate role guidance: ${assignment.guidance}\nAnswer this task directly with a useful decision, evidence, uncertainty and next action. Do not restate the owner's request. Write in ${language}.`;
    const result = await invoke({ route: settings.consultant, usageParticipant: assignment.role, usageParticipantId: assignment.id, assignment: prompt, outputKind: "specialist_position", ...evidenceFor(assignment.id), discussion: dependencies, instructions: consultantInstructions });
    const message = { id: randomId(), role: assignment.role, recipient: "Critic", body: result.body, sources: result.sources ?? [] };
    await commit(before => before.results[assignment.id] ? undefined : { ...before, results: { ...before.results, [assignment.id]: { messageId: message.id, body: result.body, version: 1 } } }, [message]);
  };

  // Re-evaluate readiness on each completion, without replaying saved siblings.
  const running = new Map();
  let workerFailure;
  while (true) {
    work = await currentWork();
    const missing = work.assignments.filter(item => !work.results[item.id]);
    if (!workerFailure) for (const assignment of missing) {
      if (!running.has(assignment.id) && assignment.dependsOn.every(id => work.results[id])) {
        const promise = runPosition(assignment).catch(error => { workerFailure ??= error; }).finally(() => running.delete(assignment.id));
        running.set(assignment.id, promise);
      }
    }
    if (!running.size) {
      if (workerFailure) throw workerFailure;
      if (missing.length) throw new Error("invalid_run_state");
      break;
    }
    await Promise.race(running.values());
  }

  const maximumDepth = snapshot.discussionDepth === "auto" ? 10 : Number(snapshot.discussionDepth ?? "1");
  if (![1, 3, 5, 10].includes(maximumDepth)) throw new Error("invalid_run_state");
  for (let number = 1; number <= maximumDepth; number += 1) {
    work = await currentWork();
    if (number > 1 && work.rounds[number - 2]?.decision === "CLOSE") break;
    let round = work.rounds[number - 1];
    if (!round) {
      const reviewPrompt = `You are Critic reviewing the team together for substantive round ${number} of ${maximumDepth}. Compare the complete owner request and every Head assignment with the latest answer and evidence. Detect obvious nonsense, false certainty, circular repetition, omitted deliverables, unsupported claims and contradictions. Issue a direct correction order only for a material actual defect; do not manufacture one. Do not repeat an existing open order against the same result. If public evidence is missing, set researchRequest to the specific gap for Head to form a safe public query; otherwise null. A good answer needs no order. Return only JSON: {"summary":"brief team assessment","researchRequest":null,"findings":[{"assignment":1,"issue":"exact defect","correction":"specific required rework"}]}. The assignment number is 1-based. If no material defect, findings is []. Write text in ${language}.`;
      const review = await invoke({ route: settings.critic, assignment: reviewPrompt, outputKind: "team_review", discussion: `${await teamRecord(work)}\n\nExisting Critic team assessments:\n${await reviewRecord(work)}\n\nCritic orders:\n${orderRecord(work)}`, ...evidenceFor(), instructions: criticInstructions });
      let acceptedReview = review;
      let parsed;
      try { parsed = parseTeamReview(review.body, work.assignments); }
      catch {
        const repaired = await invoke({ route: settings.critic, usagePurpose: "retry", assignment: `${reviewPrompt}\nRepair only the structure of your previous review below. Preserve every substantive issue and correction, including multiple findings for a consultant; do not perform another review.\nPrevious review:\n${review.body}`, outputKind: "team_review", ...evidenceFor(), instructions: criticInstructions });
        try { parsed = parseTeamReview(repaired.body, work.assignments); acceptedReview = repaired; }
        catch { throw new Error("team_review_contract"); }
      }
      const reviewMessage = { id: randomId(), role: "Critic", recipient: "Head Consultant", body: parsed.summary, sources: acceptedReview.sources ?? [] };
      // Carry unresolved directives into one new attempt per consultant. Keep
      // the old response/assessment immutable and link the complete lineage.
      const orders = work.assignments.flatMap(assignment => {
        const previous = activeOrders(work).filter(order => order.assignmentId === assignment.id && ["open", "blocked_evidence"].includes(order.state));
        const findings = parsed.findings.filter(item => item.assignmentId === assignment.id);
        const directives = [...new Map([...previous.flatMap(item => item.directives ?? [{ issue: item.issue, correction: item.correction }]), ...findings].map(item => [JSON.stringify([item.issue, item.correction]), item])).values()];
        if (!directives.length) return [];
        return [{ id: randomId(), assignmentId: assignment.id, resultMessageId: work.results[assignment.id].messageId, messageId: randomId(), issue: directives.map(item => item.issue).join("\n\n"), correction: directives.map(item => item.correction).join("\n\n"), state: "open", directives: directives.map(({ issue, correction }) => ({ issue, correction })), previousOrderIds: previous.map(item => item.id) }];
      });
      const messages = [reviewMessage, ...orders.map(order => ({ id: order.messageId, role: "Critic", recipient: work.assignments.find(item => item.id === order.assignmentId).role, body: `${order.issue}\n\nRequired correction: ${order.correction}`, sources: [] }))];
      await commit(before => before.rounds[number - 1] ? undefined : { ...before, orders: [...before.orders, ...orders], rounds: [...before.rounds, { number, reviewMessageId: reviewMessage.id, researchRequest: parsed.researchRequest, orderIds: orders.map(item => item.id) }] }, messages);
      work = await currentWork(); round = work.rounds[number - 1];
    }

    if (round.researchRequest && !round.research) {
      if (!round.researchPlan) {
        const assignment = `You are Head Consultant. Resolve the Critic's specific evidence gap. Review the available evidence and research record keys below. If a completed record already answers this gap and no fresh check is required, select its reuseRecord key with query:null and fresh:false. Otherwise write one focused minimal public query listing the facts needed and when the gap is answered, without private contacts, identifiers, credentials or business details. Do not search a gap already answered unless inadequate or a fresh check is required. researchFor lists 1-based assignments needing these findings. Return JSON {"query":null,"reuseRecord":null,"fresh":false,"researchFor":[]}. Both query and reuseRecord null means research cannot help.`;
        const discussion = `Critic evidence request: ${round.researchRequest}\nAssignments:\n${work.assignments.map((item,index) => `${index+1}. ${item.role}: ${item.task}`).join("\n")}\nResearch records:\n${researchRecords(work).map(item => `${item.key}: ${item.status}; query: ${item.query ?? "none"}`).join("\n")}`;
        const input = { route: settings.head, outputKind: "research_query", assignment, discussion, ...evidenceFor(), instructions: { ...fullInstructions, documents: [] } };
        let query = await invoke(input); let plan;
        const parse = body => {
          const result = parseResearchPlan(body, work.assignments);
          if (result.reuseRecord && !researchRecords(work).some(item => item.key === result.reuseRecord && item.status === "complete")) throw new Error("provider_contract");
          return result;
        };
        try { plan = parse(query.body); } catch {
          query = await invoke({ ...input, usagePurpose: "retry", assignment: `${assignment}\nRepair the research plan structure or invalid record reference. Previous draft:\n${query.body}` }); plan = parse(query.body);
        }
        if (plan.query && !/^\[RESEARCH:\s*NONE\]$/iu.test(plan.query) && !publicQuery(plan.query)) {
          await commit(before => ({ ...before, rounds: before.rounds.map(item => item.number === number ? { ...item, research: { status: "unavailable", reason: "unsafe_query" } } : item) }));
        } else {
          await commit(before => ({ ...before, rounds: before.rounds.map(item => item.number === number ? { ...item, researchPlan: plan } : item) }));
        }
        work = await currentWork(); round = work.rounds[number - 1];
      }
      if (!round.research) {
        const plan = round.researchPlan;
        const reused = plan.reuseRecord ? researchRecords(work).find(item => item.key === plan.reuseRecord && item.status === "complete") : undefined;
        const research = reused ? { ...reused, reusedFrom: reused.reusedFrom ?? reused.key, assignmentIds: plan.assignmentIds } : await researchTopic(plan.query, plan.assignmentIds);
        await commit(before => ({ ...before, rounds: before.rounds.map(item => item.number === number ? { ...item, research } : item) }));
        work = await currentWork(); round = work.rounds[number - 1];
      }
    }

    const respond = async orderId => {
      const latest = await currentWork();
      const order = latest.orders.find(item => item.id === orderId);
      if (order.responseMessageId) return;
      const assignment = latest.assignments.find(item => item.id === order.assignmentId);
      const answer = latest.results[assignment.id];
      const prompt = `${prompts.specialistReply({ specialist: assignment.role, language })}\nPrivate role guidance: ${assignment.guidance}\nOriginal Head task: ${assignment.task}\nThe Critic has ordered you to stop going in circles and rework a material defect. Defect: ${order.issue}\nRequired correction: ${order.correction}\nCorrect the answer materially, give a specific evidence-based objection if the Critic is wrong, or acknowledge the missing evidence. Do not repeat an unsupported answer. Write in ${language}.`;
      const response = await invoke({ route: settings.consultant, usageParticipant: assignment.role, usageParticipantId: assignment.id, assignment: prompt, outputKind: "specialist_reply", ...evidenceFor(assignment.id), discussion: `Your latest answer:\n${evidenceRecord((await store.events(conversationId)).find(item => item.id === answer.messageId))}`, instructions: consultantInstructions });
      const message = { id: randomId(), role: assignment.role, recipient: "Critic", body: response.body, sources: response.sources ?? [] };
      await commit(before => {
        const old = before.orders.find(item => item.id === orderId);
        if (old.responseMessageId) return undefined;
        const prior = before.results[assignment.id];
        return { ...before, results: { ...before.results, [assignment.id]: { messageId: message.id, body: response.body, version: prior.version + 1 } }, orders: before.orders.map(item => item.id === orderId ? { ...item, responseMessageId: message.id } : item) };
      }, [message]);
    };
    const pendingOrders = round.orderIds.map(id => work.orders.find(item => item.id === id)).filter(item => !item.responseMessageId);
    const replies = await Promise.allSettled(pendingOrders.map(item => respond(item.id)));
    const failedReply = replies.find(item => item.status === "rejected");
    if (failedReply) throw failedReply.reason;
    work = await currentWork(); round = work.rounds[number - 1];

    if (round.orderIds.length && !round.assessmentMessageId) {
      const orders = round.orderIds.map(id => work.orders.find(item => item.id === id));
      const events = await store.events(conversationId);
      const exchange = orders.map(order => {
        const assignment = work.assignments.find(item => item.id === order.assignmentId);
        const defective = events.find(item => item.id === order.resultMessageId);
        const response = events.find(item => item.id === order.responseMessageId);
        if (!defective || !response || response.role !== assignment.role) throw new Error("invalid_run_state");
        return `${assignment.role} order ${order.id}\nDefect: ${order.issue}\nRequired: ${order.correction}\nDefective answer: ${evidenceRecord(defective)}\nResponse: ${evidenceRecord(response)}`;
      }).join("\n\n");
      const assessmentPrompt = `You are Critic assessing your direct orders for round ${number}. For every order ID, decide whether the correction actually fixes the defect, a specific grounded objection shows the order was wrong, evidence is still unavailable, or the defect remains. A response alone never resolves an order. Repetition of the defective answer must remain open. Return only JSON: {"assessments":[{"orderId":"exact ID","state":"open|blocked_evidence|resolved_corrected|resolved_objection_upheld","reason":"specific evidence-based reason"}]}. Include every order once, no extras. Write reasons in ${language}.`;
      let assessment = await invoke({ route: settings.critic, assignment: assessmentPrompt, outputKind: "critic_order_assessment", discussion: `${exchange}`, ...evidenceFor(), instructions: criticInstructions });
      let parsed;
      const assess = body => {
        const items = parseOrderAssessment(body, orders);
        for (const item of items) {
          if (item.state !== "resolved_corrected") continue;
          const order = orders.find(candidate => candidate.id === item.orderId);
          if (events.find(message => message.id === order.resultMessageId)?.body.trim() === events.find(message => message.id === order.responseMessageId)?.body.trim()) throw new Error("provider_contract");
        }
        return items;
      };
      try { parsed = assess(assessment.body); }
      catch {
        assessment = await invoke({ route: settings.critic, usagePurpose: "retry", assignment: `${assessmentPrompt}\n\nRepair the assessment structure and evidence reasoning. An identical repeated answer cannot be resolved_corrected. Previous draft:\n${assessment.body}`, outputKind: "critic_order_assessment", discussion: `${exchange}`, ...evidenceFor(), instructions: criticInstructions });
        parsed = assess(assessment.body);
      }
      const body = parsed.map(item => `${work.assignments.find(assignment => assignment.id === orders.find(order => order.id === item.orderId).assignmentId).role}: ${item.state.replaceAll("_", " ")} — ${item.reason}`).join("\n\n");
      const message = { id: randomId(), role: "Critic", recipient: "Head Consultant", body, sources: assessment.sources ?? [] };
      await commit(before => {
        if (before.rounds[number - 1]?.assessmentMessageId) return undefined;
        return { ...before, orders: before.orders.map(order => {
          const decision = parsed.find(item => item.orderId === order.id);
          return decision ? { ...order, state: decision.state, assessmentReason: decision.reason, assessmentMessageId: message.id } : order;
        }), rounds: before.rounds.map(item => item.number === number ? { ...item, assessmentMessageId: message.id } : item) };
      }, [message]);
      work = await currentWork(); round = work.rounds[number - 1];
    }

    if (snapshot.discussionDepth === "auto" && !round.decision) {
      const decisionPrompt = `You are Head Consultant deciding whether to use another substantive team review. This was round ${number} of at most 10. Review the actual remaining material issues and owner deliverables. Continue only if another round can resolve a specific issue; otherwise close and state uncertainties in the final advice. Return exactly [REVIEW: CONTINUE] or [REVIEW: CLOSE].`;
      const result = await invoke({ route: settings.head, assignment: decisionPrompt, outputKind: "head_review", discussion: `${work.assignments.map((item, index) => `${index + 1}. ${item.role}: ${item.task}; result ${work.results[item.id] ? "completed" : "missing"}`).join("\n")}\n\nCritic team assessments:\n${await reviewRecord(work)}\n\nCritic orders:\n${orderRecord(work)}`, instructions: { ...fullInstructions, documents: [] } });
      const match = /^\s*\[REVIEW:\s*(CONTINUE|CLOSE)\]\s*$/iu.exec(result.body);
      if (!match) throw new Error("provider_contract");
      const decision = number === 10 ? "CLOSE" : match[1].toUpperCase();
      await commit(before => ({ ...before, rounds: before.rounds.map(item => item.number === number ? { ...item, decision } : item) }));
      if (decision === "CLOSE") break;
    }
  }

  work = await currentWork();
  const unresolved = activeOrders(work).filter(item => ["open", "blocked_evidence"].includes(item.state));
  if (!work.finalMessageId) {
    const reviewStatus = unresolved.length ? "unresolved or unconfirmed" : "supported by the completed team review";
    const conclusionPrompt = `${prompts.conclusion(language, reviewStatus)}\nUse the latest completed consultant answers and the actual Critic assessments below. There are no separate compulsory final speeches. Cover every distinct owner deliverable. If any order remains open or blocked, explicitly mark the conclusion provisional and name the missing correction or evidence. Do not claim that Critic resolved it.`;
    const result = await invoke({ route: settings.head, assignment: conclusionPrompt, outputKind: "head_final", ...evidenceFor(), discussion: `${await teamRecord(work)}\n\nCritic team assessments:\n${await reviewRecord(work)}\n\nCritic orders:\n${orderRecord(work)}` });
    const text = result.body.replace(/^\s*(?:#{1,6}\s*|\*\*)?Consolidated advice(?:\*\*)?\s*:?\s*\n+/iu, "").trim();
    if (!text) throw new Error("provider_contract");
    const message = { id: randomId(), role: "Head Consultant", recipient: null, body: `## Consolidated advice\n\n${text}`, sources: mergeSources(result.sources ?? [], ...researchRecords(work).map(item => item.sources ?? []), ...(await store.events(conversationId)).filter(item => item.sequence >= ownerEvents[0].sequence).map(item => item.sources ?? [])) };
    await commit(before => before.finalMessageId ? undefined : { ...before, finalMessageId: message.id, consiliumReached: !unresolved.length }, [message]);
  }
  if (!await isCurrent()) throw new Error("cancelled");
  await store.finishRun(conversationId, generation, "complete", deriveConversationTitle(ownerEvents[0].body));
}
