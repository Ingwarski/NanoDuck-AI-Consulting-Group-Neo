const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const prose = value => typeof value === "string" && value.trim().length > 0 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value.trim());
const name = value => prose(value) && value.length <= 64 && !/[<>\[\]{}\r\n]/u.test(value);
const id = value => typeof value === "string" && /^[A-Za-z0-9_-]{32}$/u.test(value);
const reservedRoles = new Set(["owner", "system", "head consultant", "critic"]);
export const activeOrders = work => {
  const replaced = new Set(work.orders.flatMap(order => order.previousOrderIds ?? []));
  return work.orders.filter(order => !replaced.has(order.id));
};
const states = new Set(["open", "blocked_evidence", "resolved_corrected", "resolved_objection_upheld"]);

export function parseStructuredReply(body) {
  if (typeof body !== "string") throw new Error("provider_contract");
  const cleaned = body.trim().replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "");
  try { return JSON.parse(cleaned); } catch { throw new Error("provider_contract"); }
}

export function parseHeadPlan(body, count, ids) {
  const value = parseStructuredReply(body);
  if (!object(value) || !Array.isArray(value.assignments) || value.assignments.length < 1 || value.assignments.length > 5 || (count !== "auto" && value.assignments.length !== Number(count))) throw new Error("provider_contract");
  const assignments = value.assignments.map((item, index) => {
    if (!object(item) || !name(item.role) || reservedRoles.has(item.role.trim().toLowerCase()) || !prose(item.guidance) || !prose(item.task) || !Array.isArray(item.dependsOn) || item.dependsOn.some(number => !Number.isInteger(number) || number < 1 || number > index)) throw new Error("provider_contract");
    return { id: ids[index], role: item.role.trim(), guidance: item.guidance.trim(), task: item.task, dependsOn: [...new Set(item.dependsOn)].map(number => ids[number - 1]) };
  });
  if (new Set(assignments.map(item => item.role.toLocaleLowerCase())).size !== assignments.length) throw new Error("provider_contract");
  if (value.researchQuery !== null && value.researchQuery !== undefined && value.researchQuery !== "" && !prose(value.researchQuery)) throw new Error("provider_contract");
  return { assignments, researchQuery: value.researchQuery?.trim() || null, researchFor: researchRecipients(value.researchFor, assignments) };
}

export function parseTeamReview(body, assignments) {
  const value = parseStructuredReply(body);
  if (!object(value) || !prose(value.summary) || !Array.isArray(value.findings)) throw new Error("provider_contract");
  const findings = value.findings.map(item => {
    if (!object(item) || !Number.isInteger(item.assignment) || item.assignment < 1 || item.assignment > assignments.length || !prose(item.issue) || !prose(item.correction)) throw new Error("provider_contract");
    return { assignmentId: assignments[item.assignment - 1].id, issue: item.issue.trim(), correction: item.correction.trim() };
  });
  if (value.researchRequest != null && !prose(value.researchRequest)) throw new Error("provider_contract");
  const grouped = new Map();
  for (const finding of findings) {
    const items = grouped.get(finding.assignmentId) ?? [];
    items.push(finding); grouped.set(finding.assignmentId, items);
  }
  return { summary: value.summary.trim(), researchRequest: value.researchRequest?.trim() || null, findings: [...grouped].map(([assignmentId, items]) => items.length === 1 ? items[0] : {
    assignmentId,
    issue: items.map((item, index) => `${index + 1}. ${item.issue}`).join("\n\n"),
    correction: items.map((item, index) => `${index + 1}. ${item.correction}`).join("\n\n")
  }) };
}

export function parseOrderAssessment(body, orders) {
  const value = parseStructuredReply(body);
  if (!object(value) || !Array.isArray(value.assessments) || value.assessments.length !== orders.length) throw new Error("provider_contract");
  const allowed = new Set(orders.map(item => item.id));
  const assessments = value.assessments.map(item => {
    if (!object(item) || !allowed.has(item.orderId) || !states.has(item.state) || !prose(item.reason)) throw new Error("provider_contract");
    return { orderId: item.orderId, state: item.state, reason: item.reason.trim() };
  });
  if (new Set(assessments.map(item => item.orderId)).size !== orders.length) throw new Error("provider_contract");
  return assessments;
}

export function validateParallelWork(work, stream = []) {
  if (!object(work) || work.version !== 1 || !Number.isSafeInteger(work.revision) || work.revision < 0 || !Array.isArray(work.ownerMessageIds) || !Array.isArray(work.assignments) || work.assignments.length < 1 || work.assignments.length > 5 || !object(work.results) || !Array.isArray(work.orders) || !Array.isArray(work.rounds)) return false;
  const byId = new Map(stream.map(item => [item.id, item]));
  const match = (messageId, role, recipient) => id(messageId) && byId.get(messageId)?.role === role && (byId.get(messageId)?.recipient ?? null) === (recipient ?? null);
  if (work.ownerMessageIds.some(messageId => !match(messageId, "owner", null))) return false;
  const assignments = new Map(work.assignments.map(item => [item.id, item]));
  if (assignments.size !== work.assignments.length) return false;
  for (const [index, item] of work.assignments.entries()) {
    if (!id(item.id) || !name(item.role) || !prose(item.guidance) || !prose(item.task) || !Array.isArray(item.dependsOn) || item.dependsOn.some(dependency => !work.assignments.slice(0, index).some(prior => prior.id === dependency)) || !match(item.taskMessageId, "Head Consultant", item.role)) return false;
  }
  for (const [assignmentId, result] of Object.entries(work.results)) {
    const assignment = assignments.get(assignmentId);
    if (!assignment || !object(result) || !match(result.messageId, assignment.role, "Critic") || byId.get(result.messageId).body !== result.body || !prose(result.body) || !Number.isSafeInteger(result.version) || result.version < 1) return false;
  }
  if (new Set(work.orders.map(item => item.id)).size !== work.orders.length) return false;
  const replacedOrders = new Set();
  for (const [index, order] of work.orders.entries()) {
    if (!object(order)) return false;
    if (order.directives !== undefined && (!Array.isArray(order.directives) || !order.directives.length || order.directives.some(item => !object(item) || !prose(item.issue) || !prose(item.correction)) || order.directives.map(item => item.issue).join("\n\n") !== order.issue || order.directives.map(item => item.correction).join("\n\n") !== order.correction)) return false;
    if (order.previousOrderIds !== undefined) {
      if (!Array.isArray(order.previousOrderIds) || new Set(order.previousOrderIds).size !== order.previousOrderIds.length) return false;
      for (const previousId of order.previousOrderIds) {
        const previous = work.orders.slice(0, index).find(item => item.id === previousId);
        if (!previous || previous.assignmentId !== order.assignmentId || !["open", "blocked_evidence"].includes(previous.state) || !previous.assessmentMessageId || replacedOrders.has(previousId)) return false;
        replacedOrders.add(previousId);
      }
    }
    const assignment = assignments.get(order.assignmentId);
    if (!id(order.id) || !assignment || !match(order.resultMessageId, assignment.role, "Critic") || !match(order.messageId, "Critic", assignment.role) || !prose(order.issue) || !prose(order.correction) || !states.has(order.state)) return false;
    if (order.responseMessageId != null && !match(order.responseMessageId, assignment.role, "Critic")) return false;
    if (order.assessmentMessageId != null && !match(order.assessmentMessageId, "Critic", "Head Consultant")) return false;
    if ((order.state !== "open" || order.assessmentMessageId) && (!order.responseMessageId || !order.assessmentMessageId || !prose(order.assessmentReason))) return false;
  }
  const validRecipients = value => value === undefined || (Array.isArray(value) && value.every(id => work.assignments.some(item => item.id === id)) && new Set(value).size === value.length);
  if (!validRecipients(work.researchFor) || !validRecipients(work.research?.assignmentIds)) return false;
  for (const [index, round] of work.rounds.entries()) {
    if (!object(round) || round.number !== index + 1 || !match(round.reviewMessageId, "Critic", "Head Consultant") || !Array.isArray(round.orderIds) || round.orderIds.some(orderId => !work.orders.some(order => order.id === orderId))) return false;
    if (!validRecipients(round.research?.assignmentIds)) return false;
    if (round.researchPlan && (!object(round.researchPlan) || !Array.isArray(round.researchPlan.assignmentIds) || round.researchPlan.assignmentIds.some(id => !work.assignments.some(item => item.id === id)) || typeof round.researchPlan.fresh !== "boolean" || (round.researchPlan.query != null && !prose(round.researchPlan.query)))) return false;
    if (round.researchPlan?.reuseRecord) {
      const key = round.researchPlan.reuseRecord;
      const earlier = key === "initial" ? work.research : /^round:[1-9][0-9]*$/u.test(key) ? work.rounds.find(item => `round:${item.number}` === key && item.number < round.number)?.research : undefined;
      if (round.researchPlan.fresh || round.researchPlan.query || earlier?.status !== "complete") return false;
    }
    if (round.assessmentMessageId != null && !match(round.assessmentMessageId, "Critic", "Head Consultant")) return false;
  }
  if (work.finalMessageId != null && !match(work.finalMessageId, "Head Consultant", null)) return false;
  if (work.finalMessageId && (work.rounds.length < 1 || work.assignments.some(item => !work.results[item.id]) || (work.consiliumReached && activeOrders(work).some(item => ["open", "blocked_evidence"].includes(item.state))))) return false;
  return true;
}

export function validateParallelTransition(before, after, additions, stream) {
  const combined = [...stream, ...additions];
  if (!validateParallelWork(after, combined) || after.revision !== (before?.revision ?? -1) + 1) return false;
  if (!before) return after.rounds.length === 0 && after.orders.length === 0 && Object.keys(after.results).length === 0;
  if (JSON.stringify(before.assignments) !== JSON.stringify(after.assignments) || JSON.stringify(before.ownerMessageIds) !== JSON.stringify(after.ownerMessageIds) || after.rounds.length < before.rounds.length || after.orders.length < before.orders.length) return false;
  for (const [key, result] of Object.entries(before.results)) if (!after.results[key] || after.results[key].version < result.version || (after.results[key].version === result.version && after.results[key].messageId !== result.messageId)) return false;
  if (JSON.stringify(before.researchFor) !== JSON.stringify(after.researchFor) || (before.research && JSON.stringify(before.research) !== JSON.stringify(after.research))) return false;
  for (const old of before.rounds) {
    const next = after.rounds.find(item => item.number === old.number);
    if (old.researchPlan && JSON.stringify(old.researchPlan) !== JSON.stringify(next?.researchPlan)) return false;
    if (old.research && JSON.stringify(old.research) !== JSON.stringify(next?.research)) return false;
  }
  for (const old of before.orders) {
    const next = after.orders.find(item => item.id === old.id);
    if (!next || ["assignmentId", "resultMessageId", "messageId", "issue", "correction"].some(key => next[key] !== old[key])) return false;
    if (JSON.stringify(old.directives) !== JSON.stringify(next.directives)) return false;
    if (JSON.stringify(old.previousOrderIds ?? []) !== JSON.stringify(next.previousOrderIds ?? [])) return false;
    if (old.responseMessageId && next.responseMessageId !== old.responseMessageId) return false;
    if (old.assessmentMessageId && (next.assessmentMessageId !== old.assessmentMessageId || next.state !== old.state || next.assessmentReason !== old.assessmentReason)) return false;
    if (!old.responseMessageId && next.responseMessageId && !additions.some(message => message.id === next.responseMessageId && message.role === after.assignments.find(item => item.id === old.assignmentId).role)) return false;
    if (old.state !== next.state && (!next.responseMessageId || !next.assessmentMessageId || !additions.some(message => message.id === next.assessmentMessageId && message.role === "Critic" && message.recipient === "Head Consultant"))) return false;
  }
  for (const added of after.orders.slice(before.orders.length)) if (before.results[added.assignmentId]?.messageId !== added.resultMessageId || added.state !== "open" || added.responseMessageId || added.assessmentMessageId) return false;
  return true;
}

function researchRecipients(value, assignments) {
  if (value == null) return assignments.map(item => item.id);
  if (!Array.isArray(value) || value.some(index => !Number.isInteger(index) || index < 1 || index > assignments.length)) throw new Error("provider_contract");
  return [...new Set(value)].map(index => assignments[index - 1].id);
}
export function parseResearchPlan(body, assignments) {
  // Existing accepted runs/providers may still return a plain public query.
  if (!body.trim().startsWith("{") && !body.trim().startsWith("```")) return { query: body.trim(), assignmentIds: assignments.map(item => item.id), fresh: true, reuseRecord: null };
  const value = parseStructuredReply(body);
  if (!object(value) || (value.query != null && !prose(value.query)) || typeof value.fresh !== "boolean" || (value.reuseRecord != null && !/^(initial|round:[1-9][0-9]*)$/u.test(value.reuseRecord)) || (value.fresh && value.reuseRecord)) throw new Error("provider_contract");
  if (value.reuseRecord && value.query) throw new Error("provider_contract");
  return { query: value.query?.trim() ?? null, assignmentIds: researchRecipients(value.researchFor, assignments), fresh: value.fresh, reuseRecord: value.reuseRecord ?? null };
}
