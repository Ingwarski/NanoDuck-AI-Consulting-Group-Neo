import { parseMarkdown } from "../client/markdown.js";

// Every user/provider value is escaped as text, never interpolated as RTF commands.
const escapeRtf = value => String(value ?? "").replace(/\r\n?/gu, "\n").split("").map(character => {
  if (character === "\\" || character === "{" || character === "}") return `\\${character}`;
  if (character === "\n") return "\\line ";
  if (character === "\t") return "\\tab ";
  const code = character.charCodeAt(0);
  if (code < 32 || code === 127) return "";
  return code > 126 ? `\\u${code > 32767 ? code - 65536 : code}?` : character;
}).join("");

const inline = tokens => tokens.map(token => {
  if (token.type === "break") return "\\line ";
  const value = escapeRtf(token.value);
  if (token.type === "strong") return `{\\b ${value}}`;
  if (token.type === "emphasis") return `{\\i ${value}}`;
  if (token.type === "code") return `{\\f1 ${value}}`;
  // Keep a readable, portable URL without introducing executable RTF fields.
  if (token.type === "link") return `${value} (${escapeRtf(token.href)})`;
  return value;
}).join("");

const paragraph = (content, style = "") => `\\pard\\plain\\f0\\fs22\\sa140\\sl286\\slmult1${style} ${content}\\par\n`;
const rtfTable = block => {
  const width = 9639; // A4 text area, in twips, matching document margins.
  return [block.headers, ...block.rows].map((cells, rowIndex) => {
    const borders = ["t", "l", "b", "r"].map(side => `\\clbrdr${side}\\brdrs\\brdrw10`).join("");
    const definitions = cells.map((_, index) => `${borders}\\cellx${Math.round(width * (index + 1) / cells.length)}`).join("");
    const content = cells.map((tokens, index) => {
      const alignment = { left: "ql", center: "qc", right: "qr" }[block.alignments[index]];
      return `\\pard\\plain\\intbl\\f0\\fs22\\${alignment} ${rowIndex === 0 ? `{\\b ${inline(tokens)}}` : inline(tokens)}\\cell `;
    }).join("");
    return `\\trowd\\trgaph100\\trleft0${rowIndex === 0 ? "\\trhdr" : ""}${definitions}\n${content}\\row\n`;
  }).join("") + "\\pard\\plain\\par\n";
};
const messageBody = body => parseMarkdown(body).map(block => {
  if (block.type === "table") return rtfTable(block);
  if (block.type === "list") return block.items.map((item, index) => paragraph(`${escapeRtf(block.ordered ? `${index + 1}.` : "•")}\\tab ${inline(item)}`, "\\li360\\fi-240\\tx360")).join("");
  if (block.type === "heading") return paragraph(`{\\b ${inline(block.content)}}`, "\\sb100\\keepn");
  if (block.type === "quote") return paragraph(inline(block.content), "\\li360\\ri180\\i");
  return paragraph(inline(block.content));
}).join("");
const roleName = role => role === "owner" ? "You" : role;

export function exportConversationRtf(record, timeZone = "UTC") {
  // Invalid request values are rejected before any document is emitted.
  if (typeof timeZone !== "string" || timeZone.length > 100) throw new RangeError("invalid_time_zone");
  const formatter = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const timeZoneLabel = timeZone === "Europe/Kiev" ? "Europe/Kyiv" : timeZone;
  const timestamp = value => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Time unavailable" : formatter.format(date);
  };
  const header = "{\\rtf1\\ansi\\ansicpg1252\\deff0\\uc1\n{\\fonttbl{\\f0\\fswiss Arial;}{\\f1\\fmodern Courier New;}}\n\\paperw11907\\paperh16840\\margl1134\\margr1134\\margt1134\\margb1134\n";
  const document = [header,
    paragraph("{\\b NanoDuck Consulting Group}", "\\fs28\\keepn"),
    paragraph(`{\\b ${escapeRtf(record.conversation.title)}}`, "\\fs34\\keepn"),
    paragraph(escapeRtf(`Started: ${timestamp(record.conversation.createdAt)} · Time zone: ${timeZoneLabel}`), "\\fs18\\sa260")
  ];
  for (const message of record.messages) {
    const recipient = message.recipient ? ` ${escapeRtf("→")} {\\b ${escapeRtf(roleName(message.recipient))}}` : "";
    document.push(paragraph(`{\\b ${escapeRtf(roleName(message.role))}}${recipient}\\line {\\fs18 ${escapeRtf(timestamp(message.createdAt))}}`, "\\sb240\\keepn"));
    document.push(messageBody(message.body));
    for (const [index, attachment] of (message.attachments ?? []).entries()) {
      document.push(paragraph(escapeRtf(`Image ${index + 1}: ${attachment.contentType} · ${attachment.byteLength} bytes · ${attachment.id}`), "\\fs18"));
    }
    if (message.attachments?.length) document.push(paragraph("Image files remain in the conversation; this document includes their references.", "\\fs18"));
    for (const source of message.sources ?? []) {
      document.push(paragraph(`{\\b ${escapeRtf(source.title)}}\\line ${escapeRtf(source.url)}`, "\\fs20"));
      if (source.claim) document.push(paragraph(escapeRtf(source.claim), "\\fs20"));
      if (source.publishedAt || source.retrievedAt) document.push(paragraph(escapeRtf([source.publishedAt && `Published: ${source.publishedAt}`, source.retrievedAt && `Retrieved: ${timestamp(source.retrievedAt)}`].filter(Boolean).join(" · ")), "\\fs18"));
    }
  }
  document.push("}\n");
  return Buffer.from(document.join(""), "ascii");
}
