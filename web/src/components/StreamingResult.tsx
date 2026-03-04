import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  content: string;
  streaming: boolean;
  elapsed: number;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null;
}

export function StreamingResult({ content, streaming, elapsed, usage }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (streaming) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [content, streaming]);

  return (
    <div className="overflow-hidden rounded-lg border bg-card font-mono text-xs shadow-sm">
      <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-muted-foreground">Response</span>
          {streaming && (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-600">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              streaming
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span>{elapsed.toFixed(1)}s</span>
          {usage && (
            <span>
              tokens: {usage.prompt_tokens} + {usage.completion_tokens} = {usage.total_tokens}
            </span>
          )}
        </div>
      </div>
      <div className="px-4 py-3">
        {content ? (
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            {streaming && <span className="inline-block h-4 w-1.5 animate-pulse bg-primary" />}
          </div>
        ) : (
          <div className="text-muted-foreground">等待响应...</div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
