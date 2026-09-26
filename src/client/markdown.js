const forbiddenHostSuffixes = Object.freeze([".ru", ".by", ".su", ".xn--p1ai", ".xn--90ais"]);
const protectEscapedMarkdown = value => value.replace(/\\([\\`*_[\]{}()#+\-.!|])/gu, "\uE000$1");
const unescapeMarkdown = value => value.replace(/\uE000(.)/gu, "$1").replace(/\\([\\`*_[\]{}()#+\-.!|])/gu, "$1");
const text = value => Object.freeze({ type: "text", value: unescapeMarkdown(value) });
const isForbiddenHost = hostname => hostname === "ru" || hostname === "by" || hostname === "su" || hostname === "xn--p1ai" || hostname === "xn--90ais" || forbiddenHostSuffixes.some(suffix => hostname.endsWith(suffix));
const isPrivateAddress = hostname => {
  const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/u)?.slice(1).map(Number);
  if (ipv4) return ipv4.some(part => part > 255) || ipv4[0] === 0 || ipv4[0] === 10 || ipv4[0] === 127 || (ipv4[0] === 100 && ipv4[1] >= 64 && ipv4[1] <= 127) || (ipv4[0] === 169 && ipv4[1] === 254) || (ipv4[0] === 172 && ipv4[1] >= 16 && ipv4[1] <= 31) || (ipv4[0] === 192 && ipv4[1] === 168) || (ipv4[0] === 198 && [18, 19].includes(ipv4[1])) || ipv4[0] >= 224;
  if (!hostname.includes(":")) return false;
  const first = Number.parseInt(hostname.split(":", 1)[0] || "0", 16);
  return hostname.startsWith("::") || (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 || (first & 0xffc0) === 0xfec0 || (first & 0xff00) === 0xff00;
};

export function safeMarkdownHref(value) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/gu, "");
    if (url.protocol !== "https:" || url.username || url.password || hostname === "localhost" || hostname.endsWith(".local") || hostname.endsWith(".internal") || isForbiddenHost(hostname) || isPrivateAddress(hostname)) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

const inlinePattern = /(?<![\\\uE000*_])(\[([^\]\n]+)\]\((https:\/\/[^\s)]+)\)|\*\*([^*\n]+)\*\*|__([^_\n]+)__|`([^`\n]+)`|\*([^*\n]+)\*|_([^_\n]+)_)/gu;

export function parseInline(value) {
  const input = protectEscapedMarkdown(String(value ?? ""));
  const tokens = [];
  let cursor = 0;
  for (const match of input.matchAll(inlinePattern)) {
    const index = match.index ?? 0;
    if (index > cursor) tokens.push(text(input.slice(cursor, index)));
    if (match[2] !== undefined) {
      const href = safeMarkdownHref(match[3]);
      tokens.push(href ? Object.freeze({ type: "link", value: unescapeMarkdown(match[2]), href }) : text(match[0]));
    } else if (match[4] !== undefined || match[5] !== undefined) tokens.push(Object.freeze({ type: "strong", value: unescapeMarkdown(match[4] ?? match[5]) }));
    else if (match[6] !== undefined) tokens.push(Object.freeze({ type: "code", value: unescapeMarkdown(match[6]) }));
    else tokens.push(Object.freeze({ type: "emphasis", value: unescapeMarkdown(match[7] ?? match[8]) }));
    cursor = index + match[0].length;
  }
  if (cursor < input.length) tokens.push(text(input.slice(cursor)));
  return Object.freeze(tokens);
}

const inlineLines = lines => Object.freeze(lines.flatMap((line, index) => index === 0 ? parseInline(line) : [Object.freeze({ type: "break" }), ...parseInline(line)]));
const headingLine = /^(#{1,3})\s+(.+?)\s*#*$/u;
const unorderedLine = /^\s*[-+*]\s+(.+)$/u;
const orderedLine = /^\s*\d+[.)]\s+(.+)$/u;
const quoteLine = /^\s*>\s?(.*)$/u;

// Split only unescaped pipes; escaped pipes remain literal inline content.
const tableCells = line => {
  const cells = []; let cell = ""; let separators = 0;
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === "\\" && i + 1 < line.length) { cell += line[i] + line[++i]; continue; }
    if (line[i] === "|") { cells.push(cell.trim()); cell = ""; separators += 1; }
    else cell += line[i];
  }
  cells.push(cell.trim());
  if (!separators) return null;
  if (cells[0] === "") cells.shift();
  if (cells.at(-1) === "") cells.pop();
  return cells;
};
const tableStart = (lines, index) => {
  const headers = tableCells(lines[index] ?? "");
  const delimiters = tableCells(lines[index + 1] ?? "");
  if (!headers?.length || headers.length !== delimiters?.length || !delimiters.every(cell => /^:?-{3,}:?$/u.test(cell))) return null;
  return { headers, alignments: delimiters.map(cell => cell.endsWith(":") ? cell.startsWith(":") ? "center" : "right" : "left") };
};

export function parseMarkdown(value) {
  const lines = String(value ?? "").replace(/\r\n?/gu, "\n").split("\n");
  const blocks = [];
  for (let index = 0; index < lines.length;) {
    if (!lines[index].trim()) { index += 1; continue; }
    const table = tableStart(lines, index);
    if (table) {
      const rows = []; index += 2;
      while (index < lines.length && lines[index].trim()) {
        const cells = tableCells(lines[index]);
        // Keep malformed rows as ordinary text rather than silently dropping cells.
        if (!cells || cells.length !== table.headers.length) break;
        rows.push(Object.freeze(cells.map(parseInline))); index += 1;
      }
      blocks.push(Object.freeze({ type: "table", headers: Object.freeze(table.headers.map(parseInline)), alignments: Object.freeze(table.alignments), rows: Object.freeze(rows) }));
      continue;
    }
    const heading = lines[index].match(headingLine);
    if (heading) {
      blocks.push(Object.freeze({ type: "heading", level: Math.min(4, heading[1].length + 2), content: parseInline(heading[2]) }));
      index += 1; continue;
    }
    const firstList = lines[index].match(unorderedLine) ?? lines[index].match(orderedLine);
    if (firstList) {
      const ordered = Boolean(lines[index].match(orderedLine)); const items = [];
      while (index < lines.length) {
        const item = lines[index].match(ordered ? orderedLine : unorderedLine);
        if (!item) break;
        items.push(parseInline(item[1])); index += 1;
      }
      blocks.push(Object.freeze({ type: "list", ordered, items: Object.freeze(items) })); continue;
    }
    if (quoteLine.test(lines[index])) {
      const quote = [];
      while (index < lines.length) {
        const line = lines[index].match(quoteLine); if (!line) break;
        quote.push(line[1]); index += 1;
      }
      blocks.push(Object.freeze({ type: "quote", content: inlineLines(quote) })); continue;
    }
    const paragraph = [];
    while (index < lines.length && lines[index].trim() && !tableStart(lines, index) && !headingLine.test(lines[index]) && !unorderedLine.test(lines[index]) && !orderedLine.test(lines[index]) && !quoteLine.test(lines[index])) {
      paragraph.push(lines[index]); index += 1;
    }
    blocks.push(Object.freeze({ type: "paragraph", content: inlineLines(paragraph) }));
  }
  return Object.freeze(blocks);
}
