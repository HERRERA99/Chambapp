import Markdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

const components: Components = {
  a({ href, children, title }) {
    if (!href) return <span>{children}</span>;
    const external = /^(?:https?:)?\/\//i.test(href);
    return (
      <a
        href={href}
        title={title}
        target={external ? '_blank' : undefined}
        rel={external ? 'noopener noreferrer' : undefined}
      >
        {children}
      </a>
    );
  },
  img({ src, alt, title }) {
    if (!src) return <span>{alt}</span>;
    return (
      <img src={src} alt={alt ?? ''} title={title} loading="lazy" referrerPolicy="no-referrer" />
    );
  },
};

export function MarkdownPreview({ content }: { content: string }) {
  return (
    <div className="markdown-preview">
      {content.trim() ? (
        <Markdown
          skipHtml
          remarkPlugins={[remarkGfm]}
          remarkRehypeOptions={{ footnoteLabel: 'Notas al pie' }}
          components={components}
        >
          {content}
        </Markdown>
      ) : (
        <p className="muted">La vista previa aparecerá aquí al escribir.</p>
      )}
    </div>
  );
}
