import { createHash } from "node:crypto";

const digest = value => createHash("sha256").update(value).digest("hex").slice(0, 20);
export const sourceKey = source => JSON.stringify([source.url, source.claim]);
export const sourceReference = source => `S-${digest(sourceKey(source))}`;
export const sourceText = source => `${source.title}: ${source.url}\nSupported claim: ${source.claim}\nRetrieved: ${source.retrievedAt}${source.publishedAt ? `; published: ${source.publishedAt}` : ""}`;
export const researchRecords = work => [
  ...(work?.research ? [{ ...work.research, key: "initial" }] : []),
  ...(work?.rounds ?? []).flatMap(round => round.research ? [{ ...round.research, key: `round:${round.number}` }] : [])
];
export function evidenceLedger(sources) {
  const ledger = new Map();
  for (const source of sources) {
    const id = sourceReference(source);
    if (!ledger.has(id)) ledger.set(id, { ...source, id });
  }
  return [...ledger.values()];
}
export function compactEvidence(text, ledger) {
  let result = text ?? "";
  // Preserve prose/qualifications. Only exact metadata blocks and link targets
  // already represented in the supplied table become references.
  for (const source of ledger) result = result.replaceAll(sourceText(source), `[${source.id}]`);
  return result.replace(/\[([^\]\n]+)\]\((https:\/\/[^\s)]+)\)/gu, (link, label, url) => {
    const matching = ledger.filter(source => source.url === url);
    return matching.length ? `${label} ${matching.map(source => `[${source.id}]`).join(" ")}` : link;
  });
}
export function evidenceTable(ledger) {
  return ledger.length ? `Evidence references (cite exact IDs; never invent an ID):\n${ledger.map(source => `[${source.id}] ${sourceText(source)}`).join("\n\n")}` : "";
}
export function resolveEvidenceReferences(body, ledger) {
  const sources = new Map();
  const replace = text => text.replace(/\[S-([^\]\s]+)\]/gu, (_, id) => {
    const source = ledger.find(item => item.id === `S-${id}`);
    if (!source) throw new Error("evidence_reference");
    const { id: unused, ...metadata } = source;
    sources.set(sourceKey(metadata), metadata);
    return `[${source.title.replace(/[\[\]\r\n]/gu, " ")}](${source.url})`;
  });
  let resolved;
  const cleaned = body.trim().replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "");
  if (cleaned.startsWith("{")) {
    let value; try { value = JSON.parse(cleaned); } catch { const resolved = replace(body); return { body: resolved, sources: [...sources.values()] }; }
    const walk = item => typeof item === "string" ? replace(item) : Array.isArray(item) ? item.map(walk) : item && typeof item === "object" ? Object.fromEntries(Object.entries(item).map(([key, value]) => [key, walk(value)])) : item;
    resolved = JSON.stringify(walk(value));
  } else resolved = replace(body);
  return { body: resolved, sources: [...sources.values()] };
}
export function researchBundle(work, assignmentId) {
  const records = researchRecords(work).filter(item => !assignmentId || !item.assignmentIds || item.assignmentIds.includes(assignmentId));
  const unique = [...new Map(records.map(item => [item.reusedFrom ?? item.key, item])).values()];
  const sources = unique.flatMap(item => item.status === "complete" ? item.sources ?? [] : []);
  const body = unique.map(item => item.status === "complete"
    ? `Public research query: ${item.query}\n${item.reusedFrom ? "Reused within this request; not a new search.\n" : ""}${item.body}`
    : item.status === "unavailable" ? "Public research was unavailable; do not claim it was completed." : "").filter(Boolean).join("\n\n");
  return { body, sources };
}
