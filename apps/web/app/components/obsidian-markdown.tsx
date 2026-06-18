import type { JSX, ReactNode } from "react";
import { useMemo } from "react";
import { parseObsidianMarkdown, type ObsidianMarkdownBlock } from "../lib/obsidian-markdown";
import { INLINE_REFERENCE_PATTERN, findInlineReferenceToken } from "../lib/self-evolution-links";

export type ObsidianDocumentReference = {
  label: string;
  title: string;
  path: string;
  vaultPath: string;
  href: string;
  exists: boolean;
  markdown: string | null;
  sectionId?: string | null;
};

type ObsidianMarkdownProps = {
  markdown: string;
  className?: string;
  documents?: ObsidianDocumentReference[];
  onOpenDocument?: (document: ObsidianDocumentReference) => void;
  resolveInlineHref?: (token: string) => string | null;
};

function normalizeWikiPath(target: string) {
  return target.trim().replace(/\\/g, "/").replace(/\.md$/i, "");
}

function wikiLabel(target: string) {
  const normalized = normalizeWikiPath(target);
  const leaf = normalized.split("/").at(-1) ?? normalized;
  return leaf.split("#")[0] ?? leaf;
}

function renderTextSegment(text: string, keyPrefix: string, resolveInlineHref?: (token: string) => string | null) {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  INLINE_REFERENCE_PATTERN.lastIndex = 0;
  while ((match = INLINE_REFERENCE_PATTERN.exec(text))) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    const href = resolveInlineHref?.(token) ?? null;
    if (href) {
      nodes.push(
        <a key={`${keyPrefix}-ref-${match.index}`} href={href} className="obsidian-inline-link">
          {token}
        </a>,
      );
    } else {
      nodes.push(token);
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function renderText(text: string, keyPrefix: string, resolveInlineHref?: (token: string) => string | null) {
  return text.split("\n").flatMap((part, index) => (index === 0 ? renderTextSegment(part, `${keyPrefix}-line-${index}`, resolveInlineHref) : [<br key={`${keyPrefix}-br-${index}`} />, ...renderTextSegment(part, `${keyPrefix}-line-${index}`, resolveInlineHref)]));
}

function renderInline(
  text: string,
  keyPrefix: string,
  documentsByPath: Map<string, ObsidianDocumentReference>,
  onOpenDocument?: (document: ObsidianDocumentReference) => void,
  resolveInlineHref?: (token: string) => string | null,
) {
  const nodes: ReactNode[] = [];
  const pattern = /(\[\[[^\]]+\]\]|\[[^\]]+\]\([^\)]+\)|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) {
      nodes.push(...renderText(text.slice(lastIndex, match.index), `${keyPrefix}-text-${lastIndex}`, resolveInlineHref));
    }

    const token = match[0];
    if (token.startsWith("[[") && token.endsWith("]]")) {
      const body = token.slice(2, -2);
      const [target, label] = body.split("|");
      const normalizedTarget = normalizeWikiPath(target ?? body);
      const document = documentsByPath.get(normalizedTarget);
      const content = label?.trim() || wikiLabel(target ?? body);
      const fallbackToken = findInlineReferenceToken(label?.trim() || target || body);
      const fallbackHref = fallbackToken ? resolveInlineHref?.(fallbackToken) ?? null : null;
      if (document && onOpenDocument) {
        nodes.push(
          <button
            key={`${keyPrefix}-wiki-${match.index}`}
            type="button"
            className="obsidian-inline-link"
            onClick={() => onOpenDocument(document)}
          >
            {content}
          </button>,
        );
      } else if (fallbackHref) {
        nodes.push(
          <a key={`${keyPrefix}-wiki-link-${match.index}`} href={fallbackHref} className="obsidian-inline-link">
            {content}
          </a>,
        );
      } else {
        nodes.push(
          <span key={`${keyPrefix}-wiki-${match.index}`} className="obsidian-inline-link obsidian-inline-link-static">
            {content}
          </span>,
        );
      }
    } else if (token.startsWith("[") && token.includes("](")) {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^\)]+)\)$/);
      if (linkMatch) {
        nodes.push(
          <a key={`${keyPrefix}-link-${match.index}`} href={linkMatch[2]} target="_blank" rel="noreferrer" className="obsidian-inline-link">
            {linkMatch[1]}
          </a>,
        );
      } else {
        nodes.push(token);
      }
    } else if (token.startsWith("`")) {
      nodes.push(<code key={`${keyPrefix}-code-${match.index}`}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("**")) {
      nodes.push(
        <strong key={`${keyPrefix}-strong-${match.index}`}>
          {renderInline(token.slice(2, -2), `${keyPrefix}-strong-${match.index}`, documentsByPath, onOpenDocument, resolveInlineHref)}
        </strong>,
      );
    } else if (token.startsWith("*")) {
      nodes.push(
        <em key={`${keyPrefix}-em-${match.index}`}>
          {renderInline(token.slice(1, -1), `${keyPrefix}-em-${match.index}`, documentsByPath, onOpenDocument, resolveInlineHref)}
        </em>,
      );
    } else {
      nodes.push(token);
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(...renderText(text.slice(lastIndex), `${keyPrefix}-tail`, resolveInlineHref));
  }

  return nodes;
}

function renderBlock(
  block: ObsidianMarkdownBlock,
  key: string,
  documentsByPath: Map<string, ObsidianDocumentReference>,
  onOpenDocument?: (document: ObsidianDocumentReference) => void,
  resolveInlineHref?: (token: string) => string | null,
) {
  switch (block.type) {
    case "heading": {
      const HeadingTag = `h${Math.min(block.depth, 6)}` as keyof JSX.IntrinsicElements;
      return <HeadingTag key={key}>{renderInline(block.text, `${key}-heading`, documentsByPath, onOpenDocument, resolveInlineHref)}</HeadingTag>;
    }
    case "paragraph":
      return <p key={key}>{renderInline(block.text, `${key}-paragraph`, documentsByPath, onOpenDocument, resolveInlineHref)}</p>;
    case "list": {
      const ListTag = block.ordered ? "ol" : "ul";
      return (
        <ListTag key={key}>
          {block.items.map((item, index) => (
            <li key={`${key}-item-${index}`}>{renderInline(item, `${key}-item-${index}`, documentsByPath, onOpenDocument, resolveInlineHref)}</li>
          ))}
        </ListTag>
      );
    }
    case "blockquote":
      return <blockquote key={key}>{renderInline(block.text, `${key}-quote`, documentsByPath, onOpenDocument, resolveInlineHref)}</blockquote>;
    case "code":
      return (
        <pre key={key}>
          <code>{block.code}</code>
        </pre>
      );
    case "table":
      return (
        <div key={key} className="obsidian-markdown-table-shell">
          <table>
            <thead>
              <tr>
                {block.header.map((cell, index) => (
                  <th key={`${key}-head-${index}`}>{renderInline(cell, `${key}-head-${index}`, documentsByPath, onOpenDocument, resolveInlineHref)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={`${key}-row-${rowIndex}`}>
                  {row.map((cell, cellIndex) => (
                    <td key={`${key}-row-${rowIndex}-cell-${cellIndex}`}>
                      {renderInline(cell, `${key}-row-${rowIndex}-cell-${cellIndex}`, documentsByPath, onOpenDocument, resolveInlineHref)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "rule":
      return <hr key={key} />;
    default:
      return null;
  }
}

export function ObsidianMarkdown({ markdown, className, documents = [], onOpenDocument, resolveInlineHref }: ObsidianMarkdownProps) {
  const blocks = useMemo(() => parseObsidianMarkdown(markdown), [markdown]);
  const documentsByPath = useMemo(() => {
    const entries = documents.flatMap((document) => {
      const normalized = normalizeWikiPath(document.vaultPath);
      return [[normalized, document], [normalizeWikiPath(document.path), document]] as const;
    });
    return new Map(entries);
  }, [documents]);

  if (blocks.length === 0) {
    return <p className="muted">No markdown content available.</p>;
  }

  return <div className={["task-modal-markdown", "obsidian-markdown", className].filter(Boolean).join(" ")}>{blocks.map((block, index) => renderBlock(block, `block-${index}`, documentsByPath, onOpenDocument, resolveInlineHref))}</div>;
}
