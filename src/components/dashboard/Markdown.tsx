import { Fragment, type ReactNode } from "react";
import styles from "./dashboard.module.css";

/**
 * Minimal, dependency-free Markdown renderer for AI profile summaries.
 * Renders to React elements (no dangerouslySetInnerHTML) so model output can
 * never inject HTML. Supports: #/##/### headings, - / * bullet lists, blank-line
 * paragraphs, and inline **bold**, *italic*, and `code`.
 */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  // Tokenize on the inline markers we support, longest-match first.
  const regex = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyPrefix}-${i++}`;
    if (tok.startsWith("**")) {
      out.push(<strong key={key}>{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith("`")) {
      out.push(<code key={key}>{tok.slice(1, -1)}</code>);
    } else {
      out.push(<em key={key}>{tok.slice(1, -1)}</em>);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let para: string[] = [];
  let list: string[] = [];
  let key = 0;

  const flushPara = () => {
    if (para.length === 0) return;
    blocks.push(
      <p key={`p-${key++}`}>{renderInline(para.join(" "), `p-${key}`)}</p>,
    );
    para = [];
  };
  const flushList = () => {
    if (list.length === 0) return;
    const items = list;
    blocks.push(
      <ul key={`ul-${key++}`}>
        {items.map((li, idx) => (
          <li key={idx}>{renderInline(li, `li-${key}-${idx}`)}</li>
        ))}
      </ul>,
    );
    list = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);

    if (heading) {
      flushPara();
      flushList();
      const level = heading[1].length;
      const content = renderInline(heading[2], `h-${key}`);
      if (level === 1) blocks.push(<h1 key={`h-${key++}`}>{content}</h1>);
      else if (level === 2) blocks.push(<h2 key={`h-${key++}`}>{content}</h2>);
      else blocks.push(<h3 key={`h-${key++}`}>{content}</h3>);
    } else if (bullet) {
      flushPara();
      list.push(bullet[1]);
    } else if (line.trim() === "") {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();

  return (
    <div className={styles.markdown}>
      {blocks.map((b, i) => (
        <Fragment key={i}>{b}</Fragment>
      ))}
    </div>
  );
}
