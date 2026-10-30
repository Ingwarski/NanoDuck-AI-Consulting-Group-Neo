import { containsSecretLikeContent } from "./content-policy.mjs";
const text = (value, maximum) => typeof value === "string" && value.trim().length > 0 && value.length <= maximum;
const identifier = value => typeof value === "string" && /^[A-Za-z0-9_-]{16,128}$/u.test(value);
const forbiddenHostSuffixes = Object.freeze([".ru", ".by", ".su", ".xn--p1ai", ".xn--90ais"]);
// Shared vocabulary such as Ukrainian "які" cannot identify a prohibited
// language by itself. Match distinctive letters/words, including in mixed prose.
const forbiddenLanguage = /[\p{L}]*[ЁёЫыЪъЭэЎў][\p{L}]*|(?<!\p{L})(?:россия|русск(?:ий|ая|ие|ого|им|их)?|беларус(?:ь|ский|кая|кие|кого|ким|ких)?|как|это|какой|какая|какие|котор(?:ый|ая|ые|ого|ому|ых|ыми)?|сегодня|сейчас|только|может|нужно|должен|будет|время|деньги|рынок|решение|вопрос|источник|исследование|данные|продажи|цена|цены|гэта|якая|якія|крыніца|даследаванне|рашэнне|пытанне|сёння|цяпер|толькі|можа|павінен|будзе|рынак)(?!\p{L})/iu;
const sentenceSegmenter = new Intl.Segmenter("en", { granularity: "sentence" });

// MySQL MEDIUMTEXT stores the encrypted body as Base64URL. An eight MiB
// plaintext remains safely below that column's 16 MiB encoded limit and also
// matches the provider transport ceiling.
export const maximumMessageBytes = 8 * 1024 * 1024;

export const hasProhibitedLanguage = value => typeof value === "string" && forbiddenLanguage.test(value);
export function omitProhibitedLanguage(value) {
  if (typeof value !== "string") return { body: value, omittedCount: 0, substantive: false };
  let omittedCount = 0;
  // Remove the sentence containing a distinctive prohibited-language signal.
  // Replacing just that signal would leak the remainder of a Russian sentence.
  const body = [...sentenceSegmenter.segment(value)].map(({ segment }) => {
    if (!hasProhibitedLanguage(segment)) return segment;
    omittedCount += 1;
    return `[prohibited-language fragment omitted]${segment.match(/\s*$/u)?.[0] ?? ""}`;
  }).join("");
  const remaining = body.replaceAll("[prohibited-language fragment omitted]", "")
    .replaceAll("[unapproved URL omitted]", "")
    .replaceAll("(source link omitted: unapproved URL)", "");
  return { body, omittedCount, substantive: /[\p{L}\p{N}]/u.test(remaining) };
}
export const hasProhibitedSourceHost = hostname => hostname === "ru" || hostname === "by" || hostname === "su" || hostname === "xn--p1ai" || hostname === "xn--90ais" || forbiddenHostSuffixes.some(suffix => hostname.endsWith(suffix));

export function parseJson(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  return value;
}

const externalUrlMatch = /\bhttps?:\/\/[^\s<>"']+/gu;
const trimUrlPunctuation = value => value.replace(/[),.;:!?]+$/gu, "");
export const hasUnsafeExternalUrl = value => typeof value === "string" && [...value.matchAll(externalUrlMatch)].some(match => !safeExternalUrl(trimUrlPunctuation(match[0])));

// Model prose may include one unsuitable citation even when its advice is
// otherwise usable. Remove that link explicitly instead of discarding the
// whole answer; source metadata is validated separately.
export function omitUnsafeExternalUrls(value) {
  if (typeof value !== "string") return { body: value, omittedCount: 0 };
  let omittedCount = 0;
  const withoutBadMarkdownLinks = value.replace(/\[([^\]\n]{1,280})\]\((https?:\/\/[^\s)]+)\)/gu, (whole, label, url) => {
    if (safeExternalUrl(url)) return whole;
    omittedCount += 1;
    return `${label} (source link omitted: unapproved URL)`;
  });
  const body = withoutBadMarkdownLinks.replace(externalUrlMatch, raw => {
    const candidate = trimUrlPunctuation(raw);
    if (safeExternalUrl(candidate)) return raw;
    omittedCount += 1;
    return `[unapproved URL omitted]${raw.slice(candidate.length)}`;
  });
  return { body, omittedCount };
}

export function parseMessage(value) {
  const body = parseJson(value);
  const message = typeof body?.body === "string" ? body.body.trim() : "";
  if (!body || !message || Buffer.byteLength(message, "utf8") > maximumMessageBytes || !identifier(body.clientRequestId) || hasProhibitedLanguage(message) || hasUnsafeExternalUrl(message) || containsSecretLikeContent(message)) return undefined;
  const attachmentIds = body.attachmentIds === undefined ? [] : body.attachmentIds;
  if (!Array.isArray(attachmentIds) || attachmentIds.length > maxAttachmentsPerMessage || attachmentIds.some(item => !identifier(item)) || new Set(attachmentIds).size !== attachmentIds.length) return undefined;
  return Object.freeze({ body: message, clientRequestId: body.clientRequestId, attachmentIds: Object.freeze([...attachmentIds]) });
}

export function messageError(value) {
  const body = parseJson(value);
  return body && (hasProhibitedLanguage(body.body) || hasUnsafeExternalUrl(body.body)) ? "language_not_supported" : "invalid_message";
}

const knownCodexEfforts = new Set(["low", "medium", "high", "xhigh", "max", "ultra"]);
const preservedAstraEfforts = new Set(["xhigh", "ultra"]);
const knownClaudeEfforts = new Set(["low", "medium", "high", "extra", "max"]);
const catalogFor = (catalog, provider) => Array.isArray(catalog)
  ? (provider === "codex" ? catalog : [])
  : Array.isArray(catalog?.[provider]?.models) ? catalog[provider].models : [];
const modelSupports = (models, model, effort) => models.some(candidate => candidate?.id === model && Array.isArray(candidate.efforts) && candidate.efforts.includes(effort));
const validModelId = value => typeof value === "string" && /^[A-Za-z0-9._-]{1,128}$/u.test(value);

export function parseSettings(value, catalog = undefined) {
  const body = parseJson(value);
  if (!body) return undefined;
  const validSpecialistCounts = new Set(["1", "2", "3", "5", "auto"]);
  const validDiscussionDepths = new Set(["1", "3", "5", "auto"]);
  const validNotificationSounds = new Set(["knock", "chime", "ripple", "off"]);
  const codexModels = catalogFor(catalog, "codex");
  const claudeModels = catalogFor(catalog, "claude_code");
  const codexAllowed = (model, effort) => codexModels.length
    ? modelSupports(codexModels, model, effort)
    : model === "gpt-6-astra" && preservedAstraEfforts.has(effort);
  const criticProvider = body.criticProvider ?? "codex";
  const criticCodexModel = body.criticCodexModel ?? body.criticModel;
  const criticCodexReasoning = body.criticCodexReasoning ?? body.criticReasoning;
  // Revision 2 stored placeholders that were never valid Claude desktop
  // choices. Treat them as an absent inactive preference so the owner sees
  // the verified Opus 5 / High defaults instead of being locked out of saving.
  const criticClaudeModel = body.criticClaudeModel === "claude-code-default" ? undefined : body.criticClaudeModel;
  const criticClaudeReasoning = ["default", "xhigh"].includes(body.criticClaudeReasoning) ? undefined : body.criticClaudeReasoning;
  const activeClaudeModel = criticClaudeModel ?? "claude-opus-5";
  const activeClaudeReasoning = criticClaudeReasoning ?? "high";
  const criticAllowed = criticProvider === "codex"
    ? codexAllowed(criticCodexModel, criticCodexReasoning)
    : criticProvider === "claude_code" && claudeModels.length > 0 && modelSupports(claudeModels, activeClaudeModel, activeClaudeReasoning);
  const notificationSound = body.notificationSound ?? "knock";
  const inactiveClaudeValid = (criticClaudeModel === undefined || validModelId(criticClaudeModel)) && (criticClaudeReasoning === undefined || knownClaudeEfforts.has(criticClaudeReasoning));
  if (!codexAllowed(body.headModel, body.headReasoning) || !criticAllowed || !validModelId(criticCodexModel) || !knownCodexEfforts.has(criticCodexReasoning) || !inactiveClaudeValid || !validSpecialistCounts.has(body.specialistCount) || !validDiscussionDepths.has(body.discussionDepth) || !validNotificationSounds.has(notificationSound)) return undefined;
  const criticModel = criticProvider === "claude_code" ? activeClaudeModel : criticCodexModel;
  const criticReasoning = criticProvider === "claude_code" ? activeClaudeReasoning : criticCodexReasoning;
  return Object.freeze({ headModel: body.headModel, headReasoning: body.headReasoning, criticProvider, criticCodexModel, criticCodexReasoning, ...(criticClaudeModel === undefined ? {} : { criticClaudeModel }), ...(criticClaudeReasoning === undefined ? {} : { criticClaudeReasoning }), criticModel, criticReasoning, specialistCount: body.specialistCount, discussionDepth: body.discussionDepth, notificationSound });
}

export function parseConversationId(value) {
  return identifier(value) ? value : undefined;
}

export function parseConversationIds(value) {
  const body = parseJson(value);
  const ids = body?.conversationIds;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 100 || ids.some(item => !identifier(item)) || new Set(ids).size !== ids.length) return undefined;
  return Object.freeze([...ids]);
}

export function safeExternalUrl(value) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/gu, "");
    const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/u)?.slice(1).map(Number);
    const privateIpv4 = ipv4 && (ipv4.some(part => part > 255) || ipv4[0] === 0 || ipv4[0] === 10 || ipv4[0] === 127 || (ipv4[0] === 100 && ipv4[1] >= 64 && ipv4[1] <= 127) || (ipv4[0] === 169 && ipv4[1] === 254) || (ipv4[0] === 172 && ipv4[1] >= 16 && ipv4[1] <= 31) || (ipv4[0] === 192 && ipv4[1] === 168) || (ipv4[0] === 198 && [18, 19].includes(ipv4[1])) || ipv4[0] >= 224);
    const firstIpv6Hextet = hostname.includes(":") ? Number.parseInt(hostname.split(":", 1)[0] || "0", 16) : undefined;
    const privateIpv6 = firstIpv6Hextet !== undefined && (hostname.startsWith("::") || (firstIpv6Hextet & 0xfe00) === 0xfc00 || (firstIpv6Hextet & 0xffc0) === 0xfe80 || (firstIpv6Hextet & 0xffc0) === 0xfec0 || (firstIpv6Hextet & 0xff00) === 0xff00);
    if (url.protocol !== "https:" || url.username || url.password || hostname === "localhost" || hostname.endsWith(".local") || hostname.endsWith(".internal") || hasProhibitedSourceHost(hostname) || privateIpv4 || privateIpv6) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}
import { maxAttachmentsPerMessage } from "./attachments.mjs";
