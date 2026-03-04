import { useEffect, useRef } from "react";

export interface LogEntry {
  time: string;
  level: "info" | "success" | "error";
  message: string;
}

const LEVEL_STYLES: Record<string, string> = {
  info: "text-primary",
  success: "text-emerald-600",
  error: "text-red-500",
};

const LEVEL_PREFIX: Record<string, string> = {
  info: "›",
  success: "✓",
  error: "✗",
};

export function LogStream({ logs, loading }: { logs: LogEntry[]; loading: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs.length]);

  return (
    <div className="overflow-hidden rounded-lg border bg-card font-mono text-xs shadow-sm">
      <div className="flex items-center gap-2 border-b bg-muted/50 px-4 py-2">
        <span className="h-2 w-2 rounded-full bg-red-400" />
        <span className="h-2 w-2 rounded-full bg-yellow-400" />
        <span className="h-2 w-2 rounded-full bg-green-400" />
        <span className="ml-2 text-[11px] font-medium text-muted-foreground">Processing Log</span>
        {loading && (
          <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-primary">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            运行中
          </span>
        )}
      </div>
      <div ref={containerRef} className="max-h-[200px] overflow-y-auto px-4 py-3">
        {logs.map((log, i) => (
          <div key={i} className="flex gap-2 leading-relaxed">
            <span className="shrink-0 select-none text-muted-foreground/50">{log.time}</span>
            <span className={`shrink-0 ${LEVEL_STYLES[log.level]}`}>
              {LEVEL_PREFIX[log.level]}
            </span>
            <span className="text-foreground/80">{log.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
