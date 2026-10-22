import { useId, useRef } from 'react';

export function JsonHighlight({ text }: { text: string }) {
  const pattern =
    /"(?:\\.|[^"\\])*"\s*(?=:)|"(?:\\.|[^"\\])*"|\b(?:true|false|null)\b|-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/g;
  const parts = [];
  let end = 0;
  for (const match of text.matchAll(pattern)) {
    const token = match[0];
    const start = match.index!;
    parts.push(text.slice(end, start));
    const kind = token.startsWith('"')
      ? text
          .slice(start + token.length)
          .trimStart()
          .startsWith(':')
        ? 'key'
        : 'string'
      : /true|false|null/.test(token)
        ? 'literal'
        : 'number';
    parts.push(
      <span key={start} className={`json-token--${kind}`}>
        {token}
      </span>,
    );
    end = start + token.length;
  }
  parts.push(text.slice(end));
  return <>{parts}</>;
}

export function JsonEditor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const id = useId();
  const preview = useRef<HTMLPreElement>(null);
  return (
    <div className="dev-editor">
      <label className="eyebrow" htmlFor={id}>
        {label}
      </label>
      <div className="json-code-editor">
        <pre ref={preview} aria-hidden="true">
          <JsonHighlight text={value} />
          {'\n'}
        </pre>
        <textarea
          id={id}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          wrap="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={(e) => {
            if (preview.current) {
              preview.current.scrollTop = e.currentTarget.scrollTop;
              preview.current.scrollLeft = e.currentTarget.scrollLeft;
            }
          }}
          placeholder="Pega aquí tu JSON…"
        />
      </div>
    </div>
  );
}
