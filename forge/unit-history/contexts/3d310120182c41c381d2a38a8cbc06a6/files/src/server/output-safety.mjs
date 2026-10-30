// Provider output is untrusted until this check and the role-specific
// contract validation have both passed. These markers belong to a provider's
// execution protocol, never to a human-facing consultation contribution.
export const containsInternalToolTrace = value => typeof value === "string" && /<\s*(?:invoke|parameter|tool(?:_use|_result)?)\b|\b(?:tool_use|tool_result)\b/iu.test(value);
