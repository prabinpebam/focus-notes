import { Fragment, useId, type ReactNode } from "react";
import * as s from "./NoteContent.css.ts";

/** A note's content as the Markdown bridge parses it (ProseMirror JSON, `@focus-notes/markdown`). */
export interface BlockNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: BlockNode[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  text?: string;
}

export interface NoteContentProps {
  blocks: readonly BlockNode[];
  id?: string;
}

/**
 * The block components (DD-CMP-04): paragraphs, headings, lists and task lists, quotes, code, tables,
 * rules, inline marks, and unknown syntax kept verbatim (EXT-05), read-only. Text is always text: a
 * note's HTML is never parsed, and a link without a safe address (the publisher checks it) is plain text.
 */
export function NoteContent({ blocks, id }: NoteContentProps) {
  const base = useId();
  return <div id={id} className={s.prose}>{blocks.map((b, i) => <Block key={i} node={b} path={`${base}-${i}`} />)}</div>;
}

const kids = (node: BlockNode, path: string): ReactNode[] =>
  (node.content ?? []).map((c, i) => <Block key={i} node={c} path={`${path}-${i}`} />);

/** ParagraphBlock, HeadingBlock, ListBlock, QuoteBlock, CodeBlock, TableBlock, DividerBlock, UnknownBlock. */
function Block({ node, path }: { node: BlockNode; path: string }): ReactNode {
  switch (node.type) {
    case "paragraph": return <p dir="auto"><Inline nodes={node.content} /></p>;
    case "heading": {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level) || 1));
      const H = `h${level}` as "h1";
      return <H dir="auto"><Inline nodes={node.content} /></H>;
    }
    case "bulletList": return <ul>{kids(node, path)}</ul>;
    case "orderedList": {
      const start = Number(node.attrs?.start ?? 1);
      return <ol {...(start !== 1 ? { start } : {})}>{kids(node, path)}</ol>;
    }
    case "listItem": return <li>{kids(node, path)}</li>;
    case "taskList": return <ul data-type="taskList">{kids(node, path)}</ul>;
    case "taskItem": {
      const checked = node.attrs?.checked === true;
      return (
        <li data-checked={checked}>
          <span><input type="checkbox" checked={checked} disabled aria-labelledby={`${path}-t`} /></span>
          <div id={`${path}-t`}>{kids(node, path)}</div>
        </li>
      );
    }
    case "blockquote": return <blockquote>{kids(node, path)}</blockquote>;
    case "codeBlock": return <pre tabIndex={0}><code>{(node.content ?? []).map((c) => c.text ?? "").join("")}</code></pre>;
    case "horizontalRule": return <hr />;
    // A page break the note asks for (<!-- pagebreak -->, SHR-12): nothing on screen, a new page on paper.
    case "pageBreak": return <div data-page-break="" aria-hidden="true" />;
    case "table": return <div data-table="" tabIndex={0}><table><tbody>{kids(node, path)}</tbody></table></div>;
    case "tableRow": return <tr>{kids(node, path)}</tr>;
    case "tableHeader": return <th scope="col" {...align(node)}>{kids(node, path)}</th>;
    case "tableCell": return <td {...align(node)}>{kids(node, path)}</td>;
    // UnknownBlock: syntax the editor can't show yet, kept verbatim as text.
    default: return <pre tabIndex={0} data-raw-markdown="">{String(node.attrs?.source ?? (node.content ?? []).map((c) => c.text ?? "").join(""))}</pre>;
  }
}

const align = (node: BlockNode) => (typeof node.attrs?.align === "string" ? { "data-align": node.attrs.align } : {});

/** InlineMarks: bold, italic, strikethrough, inline code, and links. */
function Inline({ nodes }: { nodes: BlockNode[] | undefined }): ReactNode {
  return (nodes ?? []).map((n, i) => {
    if (n.type === "hardBreak") return <br key={i} />;
    let out: ReactNode = n.text ?? "";
    for (const m of [...(n.marks ?? [])].reverse()) {
      if (m.type === "bold") out = <strong>{out}</strong>;
      else if (m.type === "italic") out = <em>{out}</em>;
      else if (m.type === "strike") out = <s>{out}</s>;
      else if (m.type === "code") out = <code>{out}</code>;
      else if (m.type === "link" && typeof m.attrs?.href === "string") out = <a href={m.attrs.href}>{out}</a>;
    }
    return <Fragment key={i}>{out}</Fragment>;
  });
}
