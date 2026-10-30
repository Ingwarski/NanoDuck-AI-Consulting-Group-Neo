const normalize = value => String(value ?? "").normalize("NFC").replace(/\s+/gu, " ").trim();

const questionClause = value => {
  const clauses = normalize(value).match(/[^.!?]+[.!?]+|[^.!?]+$/gu) ?? [];
  return [...clauses].reverse().find(clause => clause.includes("?")) ?? clauses.at(0) ?? "";
};

const removeLeadIn = value => value
  .replace(/^\s*(?:(?:please|kindly)\s+)?(?:can you|could you|would you|do you think|should I|what (?:is|are)|how (?:do|can) I)\s+/iu, "")
  .replace(/^\s*(?:будь ласка[,.]?\s*)?(?:чи варто|що таке|що є|як(?:\s+мені)?|які|який|яка)\s+/iu, "")
  .trim();

const shorten = (value, maximum = 56) => {
  const characters = Array.from(value);
  if (characters.length <= maximum) return value;
  const excerpt = characters.slice(0, maximum - 1).join("").trimEnd();
  const wordBoundary = excerpt.lastIndexOf(" ");
  return `${(wordBoundary >= 24 ? excerpt.slice(0, wordBoundary) : excerpt).trimEnd()}…`;
};

// This is deliberately deterministic: finishing a consultation must not spend a
// second model turn merely to name the saved record.
export function deriveConversationTitle(ownerQuestion) {
  const candidate = removeLeadIn(questionClause(ownerQuestion));
  const title = shorten(candidate || "Completed consultation");
  return `${title.slice(0, 1).toLocaleUpperCase()}${title.slice(1)}`;
}
