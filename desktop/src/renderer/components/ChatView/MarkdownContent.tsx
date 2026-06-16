import type React from "react";

interface Props {
  text: string;
}

type Block =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "code"; lang: string; text: string }
  | { type: "blockquote"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] };

export function MarkdownContent({ text }: Props) {
  const blocks = parseBlocks(text);
  return (
    <>
      {blocks.map((block, idx) => (
        <MarkdownBlock key={idx} block={block} />
      ))}
    </>
  );
}

function MarkdownBlock({ block }: { block: Block }) {
  switch (block.type) {
    case "heading": {
      const children = parseInline(block.text);
      if (block.level === 1) return <h1>{children}</h1>;
      if (block.level === 2) return <h2>{children}</h2>;
      return <h3>{children}</h3>;
    }
    case "paragraph":
      return <p>{parseInline(block.text)}</p>;
    case "code":
      return (
        <pre>
          {block.lang ? (
            <header>
              <span>{block.lang}</span>
            </header>
          ) : null}
          <code>{block.text}</code>
        </pre>
      );
    case "blockquote":
      return <blockquote>{parseInline(block.text)}</blockquote>;
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag>
          {block.items.map((item, idx) => (
            <li key={idx}>{parseInline(item)}</li>
          ))}
        </Tag>
      );
    }
    case "table":
      return (
        <table>
          <thead>
            <tr>
              {block.headers.map((header, idx) => (
                <th key={idx}>{parseInline(header)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, rowIdx) => (
              <tr key={rowIdx}>
                {block.headers.map((_, cellIdx) => (
                  <td key={cellIdx}>{parseInline(row[cellIdx] ?? "")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
  }
}

function parseBlocks(text: string): Block[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (!line.trim()) {
      i++;
      continue;
    }

    const fence = line.match(/^```([\w-]*)\s*$/);
    if (fence) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i] ?? "")) {
        code.push(lines[i] ?? "");
        i++;
      }
      if (i < lines.length) i++;
      blocks.push({ type: "code", lang: fence[1] ?? "", text: code.join("\n") });
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1]!.length as 1 | 2 | 3,
        text: heading[2]!,
      });
      i++;
      continue;
    }

    if (isTableStart(lines, i)) {
      const headers = splitTableRow(lines[i]!);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|.+\|\s*$/.test(lines[i] ?? "")) {
        rows.push(splitTableRow(lines[i]!));
        i++;
      }
      blocks.push({ type: "table", headers, rows });
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i] ?? "")) {
        quote.push((lines[i] ?? "").replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ type: "blockquote", text: quote.join(" ") });
      continue;
    }

    const ordered = /^\d+\.\s+/.test(line);
    const unordered = /^[-*]\s+/.test(line);
    if (ordered || unordered) {
      const items: string[] = [];
      const pattern = ordered ? /^\d+\.\s+/ : /^[-*]\s+/;
      while (i < lines.length && pattern.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(pattern, ""));
        i++;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    const paragraph: string[] = [];
    while (
      i < lines.length &&
      lines[i]?.trim() &&
      !/^```/.test(lines[i] ?? "") &&
      !/^(#{1,3})\s+/.test(lines[i] ?? "") &&
      !/^>\s?/.test(lines[i] ?? "") &&
      !/^\d+\.\s+/.test(lines[i] ?? "") &&
      !/^[-*]\s+/.test(lines[i] ?? "") &&
      !isTableStart(lines, i)
    ) {
      paragraph.push(lines[i] ?? "");
      i++;
    }
    blocks.push({ type: "paragraph", text: paragraph.join(" ") });
  }

  return blocks;
}

function isTableStart(lines: string[], index: number): boolean {
  const header = lines[index] ?? "";
  const separator = lines[index + 1] ?? "";
  return (
    /^\s*\|.+\|\s*$/.test(header) &&
    /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(separator)
  );
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function parseInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) != null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const token = match[0];
    const key = nodes.length;

    if (token.startsWith("`")) {
      nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("**")) {
      nodes.push(<strong key={key}>{parseInline(token.slice(2, -2))}</strong>);
    } else if (token.startsWith("*")) {
      nodes.push(<em key={key}>{parseInline(token.slice(1, -1))}</em>);
    } else {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      const href = link?.[2] ?? "";
      nodes.push(
        <a key={key} href={safeHref(href)} target="_blank" rel="noreferrer">
          {parseInline(link?.[1] ?? token)}
        </a>,
      );
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function safeHref(href: string): string {
  return /^(https?:|mailto:)/i.test(href) ? href : "#";
}
