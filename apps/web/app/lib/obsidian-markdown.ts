export type ObsidianMarkdownBlock =
  | { type: "heading"; depth: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "blockquote"; text: string }
  | { type: "code"; language: string | null; code: string }
  | { type: "table"; header: string[]; rows: string[][] }
  | { type: "rule" };

function normalizeMarkdown(markdown: string) {
  return markdown.replace(/\r\n?/g, "\n");
}

export function stripObsidianMarkdown(markdown: string) {
  let value = normalizeMarkdown(markdown).trim();
  if (value.startsWith("---\n")) {
    value = value.replace(/^---\n[\s\S]*?\n---\n*/u, "");
  }
  return value.replace(/<!--[^]*?-->/g, "").trim();
}

function isBlank(line: string) {
  return line.trim().length === 0;
}

function isRule(line: string) {
  const trimmed = line.trim();
  return trimmed === "---" || trimmed === "***" || trimmed === "___";
}

function isListLine(line: string) {
  return /^(\s*)([-*]|\d+\.)\s+/.test(line);
}

function parseListLine(line: string) {
  const match = line.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
  if (!match) {
    return null;
  }
  return {
    ordered: /\d+\./.test(match[2]),
    indent: match[1].length,
    text: match[3].trim(),
  };
}

function splitTableRow(line: string) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function isTableSeparator(line: string) {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function isTableStart(line: string, nextLine?: string) {
  return line.includes("|") && Boolean(nextLine) && isTableSeparator(nextLine ?? "");
}

function isSpecialBlockStart(line: string, nextLine?: string) {
  const trimmed = line.trim();
  return (
    trimmed.startsWith("```") ||
    /^#{1,6}\s+/.test(trimmed) ||
    /^>\s?/.test(trimmed) ||
    isListLine(line) ||
    isRule(line) ||
    isTableStart(line, nextLine)
  );
}

export function parseObsidianMarkdown(markdown: string): ObsidianMarkdownBlock[] {
  const lines = stripObsidianMarkdown(markdown).split("\n");
  const blocks: ObsidianMarkdownBlock[] = [];

  for (let index = 0; index < lines.length;) {
    const line = lines[index] ?? "";
    const nextLine = lines[index + 1];

    if (isBlank(line)) {
      index += 1;
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      blocks.push({ type: "heading", depth: headingMatch[1].length, text: headingMatch[2].trim() });
      index += 1;
      continue;
    }

    if (line.trim().startsWith("```")) {
      const language = line.trim().slice(3).trim() || null;
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        code.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      blocks.push({ type: "code", language, code: code.join("\n") });
      continue;
    }

    if (isTableStart(line, nextLine)) {
      const header = splitTableRow(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && lines[index].includes("|")) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }
      blocks.push({ type: "table", header, rows });
      continue;
    }

    if (/^>\s?/.test(line.trim())) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index].trim())) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push({ type: "blockquote", text: quoteLines.join("\n") });
      continue;
    }

    if (isListLine(line)) {
      const firstItem = parseListLine(line);
      const ordered = Boolean(firstItem?.ordered);
      const items: string[] = [];
      let current = firstItem?.text ?? "";
      let currentIndent = firstItem?.indent ?? 0;
      index += 1;

      while (index <= lines.length) {
        const candidate = lines[index];
        if (candidate == null || isBlank(candidate)) {
          if (current) {
            items.push(current.trim());
          }
          if (candidate != null) {
            index += 1;
          }
          break;
        }
        const parsedCandidate = parseListLine(candidate);
        if (parsedCandidate && parsedCandidate.ordered === ordered) {
          items.push(current.trim());
          current = parsedCandidate.text;
          currentIndent = parsedCandidate.indent;
          index += 1;
          continue;
        }
        if (parsedCandidate || isSpecialBlockStart(candidate, lines[index + 1])) {
          items.push(current.trim());
          break;
        }
        if (candidate.match(/^\s+/)?.[0].length ?? 0 > currentIndent) {
          current = `${current}\n${candidate.trim()}`;
          index += 1;
          continue;
        }
        items.push(current.trim());
        break;
      }

      blocks.push({ type: "list", ordered, items });
      continue;
    }

    if (isRule(line)) {
      blocks.push({ type: "rule" });
      index += 1;
      continue;
    }

    const paragraph: string[] = [line.trim()];
    index += 1;
    while (index < lines.length && !isBlank(lines[index]) && !isSpecialBlockStart(lines[index], lines[index + 1])) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push({ type: "paragraph", text: paragraph.join(" ") });
  }

  return blocks;
}
