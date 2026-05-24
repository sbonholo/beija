import ReactMarkdown from 'react-markdown';
import { useNavigate } from 'react-router-dom';

interface Props {
  content: string;
}

export function MarkdownPage({ content }: Props) {
  const nav = useNavigate();
  return (
    <div className="screen" style={{ paddingBottom: 40 }}>
      <div className="header">
        <button className="chip" onClick={() => nav(-1)} aria-label="Voltar">← Voltar</button>
      </div>
      <article className="markdown-body" style={{ lineHeight: 1.55 }}>
        <ReactMarkdown>{content}</ReactMarkdown>
      </article>
    </div>
  );
}
