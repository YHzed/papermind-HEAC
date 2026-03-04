import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { streamSSE } from "@/lib/sse";
import { api, type ChatMessage, type Template, type Session } from "@/lib/api";

interface ChatPanelProps {
  articleId: string;
  templates: Template[];
}

interface DebugData {
  requestInfo: Record<string, unknown> | null;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  } | null;
  elapsed: number;
  responseContent: string;
  logs: { time: string; level: string; message: string }[];
}

const remarkPlugins = [remarkGfm, remarkMath];
const rehypePlugins = [rehypeKatex];

function fmtTime() {
  return new Date().toLocaleTimeString("zh-CN", { hour12: false });
}

function DebugDialog({
  open,
  onOpenChange,
  data,
  streaming,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  data: DebugData;
  streaming: boolean;
}) {
  const { requestInfo, usage, elapsed, responseContent, logs } = data;
  const messagesBody = requestInfo?.messages_body as
    | Record<string, unknown>[]
    | undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col gap-0 p-0">
        <DialogHeader className="shrink-0 border-b px-5 py-4">
          <DialogTitle className="flex items-center gap-3 text-base">
            请求调试信息
            {streaming && (
              <span className="flex items-center gap-1.5 text-xs font-normal text-emerald-600">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                {elapsed.toFixed(1)}s
              </span>
            )}
            {!streaming && elapsed > 0 && (
              <span className="text-xs font-normal text-muted-foreground">
                {elapsed.toFixed(1)}s
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 font-mono text-xs leading-relaxed">
          {/* Request Config */}
          {requestInfo && (
            <section>
              <h3 className="mb-2 font-sans text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Request
              </h3>
              <div className="rounded-md border bg-muted/30 p-3">
                <table className="w-full">
                  <tbody className="[&_td]:py-0.5 [&_td:first-child]:w-28 [&_td:first-child]:text-muted-foreground [&_td:last-child]:text-foreground">
                    <tr>
                      <td>Model</td>
                      <td>{requestInfo.model as string}</td>
                    </tr>
                    <tr>
                      <td>Endpoint</td>
                      <td className="break-all">
                        {requestInfo.base_url as string}
                      </td>
                    </tr>
                    <tr>
                      <td>Temperature</td>
                      <td>{requestInfo.temperature as number}</td>
                    </tr>
                    <tr>
                      <td>Max Tokens</td>
                      <td>{requestInfo.max_tokens as number}</td>
                    </tr>
                    <tr>
                      <td>Images</td>
                      <td>{requestInfo.image_count as number} 张</td>
                    </tr>
                    <tr>
                      <td>History</td>
                      <td>{requestInfo.history_count as number} 条</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Response Stats */}
          {usage && (
            <section className="mt-4">
              <h3 className="mb-2 font-sans text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Response
              </h3>
              <div className="rounded-md border bg-muted/30 p-3">
                <table className="w-full">
                  <tbody className="[&_td]:py-0.5 [&_td:first-child]:w-28 [&_td:first-child]:text-muted-foreground [&_td:last-child]:text-foreground">
                    <tr>
                      <td>Prompt</td>
                      <td>{usage.prompt_tokens.toLocaleString()} tokens</td>
                    </tr>
                    <tr>
                      <td>Completion</td>
                      <td>
                        {usage.completion_tokens.toLocaleString()} tokens
                      </td>
                    </tr>
                    <tr>
                      <td>Total</td>
                      <td className="font-semibold">
                        {usage.total_tokens.toLocaleString()} tokens
                      </td>
                    </tr>
                    <tr>
                      <td>Elapsed</td>
                      <td>{elapsed.toFixed(2)}s</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Response Content */}
          {responseContent && (
            <section className="mt-4">
              <h3 className="mb-2 font-sans text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Output
                {streaming && (
                  <span className="ml-2 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                )}
              </h3>
              <div className="rounded-md border bg-muted/30">
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap p-3 text-[11px] leading-relaxed text-foreground/80">
                  {responseContent}
                </pre>
              </div>
            </section>
          )}

          {/* Messages Body */}
          {messagesBody && messagesBody.length > 0 && (
            <section className="mt-4">
              <h3 className="mb-2 font-sans text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Messages Body ({messagesBody.length} messages)
              </h3>
              <div className="space-y-2">
                {messagesBody.map((msg, i) => (
                  <div key={i} className="rounded-md border bg-muted/30">
                    <div className="flex items-center gap-2 border-b border-border/50 px-3 py-1.5">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                          (msg.role as string) === "system"
                            ? "bg-amber-100 text-amber-700"
                            : (msg.role as string) === "user"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {msg.role as string}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        #{i}
                      </span>
                    </div>
                    <pre className="max-h-60 overflow-auto whitespace-pre-wrap p-3 text-[11px] text-foreground/80">
                      {typeof msg.content === "string"
                        ? msg.content
                        : JSON.stringify(msg.content, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Logs */}
          {logs.length > 0 && (
            <section className="mt-4">
              <h3 className="mb-2 font-sans text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Log
              </h3>
              <div className="rounded-md border bg-muted/30 p-3">
                {logs.map((log, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="shrink-0 text-muted-foreground/50">
                      {log.time}
                    </span>
                    <span
                      className={
                        log.level === "error"
                          ? "text-red-500"
                          : log.level === "success"
                            ? "text-emerald-600"
                            : "text-primary"
                      }
                    >
                      {log.level === "error"
                        ? "✗"
                        : log.level === "success"
                          ? "✓"
                          : "›"}
                    </span>
                    <span className="text-foreground/80">{log.message}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {!requestInfo && !usage && logs.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              暂无调试数据，发送一条消息后可查看
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ChatPanel({ articleId, templates }: ChatPanelProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  const [debugData, setDebugData] = useState<DebugData>({
    requestInfo: null,
    usage: null,
    elapsed: 0,
    responseContent: "",
    logs: [],
  });

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  const newMenuRef = useRef<HTMLDivElement>(null);
  const streamingRef = useRef(false);

  const scrollToBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  const loadSessions = useCallback(async () => {
    try {
      const list = await api.listSessions(articleId);
      setSessions(list);
      return list;
    } catch (e) {
      toast.error("加载会话列表失败: " + (e as Error).message);
      return [];
    }
  }, [articleId]);

  const loadMessages = useCallback(
    async (sessionId: string) => {
      try {
        const history = await api.getSessionChat(articleId, sessionId);
        setMessages(history);
      } catch (e) {
        toast.error("加载对话记录失败: " + (e as Error).message);
      }
    },
    [articleId],
  );

  useEffect(() => {
    loadSessions().then((list) => {
      if (list.length > 0) {
        setActiveSessionId(list[list.length - 1].id);
      }
    });
  }, [loadSessions]);

  useEffect(() => {
    if (activeSessionId) {
      loadMessages(activeSessionId);
    } else {
      setMessages([]);
    }
  }, [activeSessionId, loadMessages]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamContent, scrollToBottom]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!showNewMenu) return;
    function handleClick(e: MouseEvent) {
      if (
        newMenuRef.current &&
        !newMenuRef.current.contains(e.target as Node)
      ) {
        setShowNewMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showNewMenu]);

  const sendMessage = useCallback(
    async (sessionId: string, msg: string) => {
      if (!msg || streamingRef.current) return;
      streamingRef.current = true;
      setStreaming(true);

      const tempUserMsg: ChatMessage = {
        id: "temp-" + Date.now(),
        role: "user",
        content: msg,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, tempUserMsg]);
      setInput("");
      setStreamContent("");
      setDebugData({ requestInfo: null, usage: null, elapsed: 0, responseContent: "", logs: [] });
      setElapsed(0);

      startTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        const e = (Date.now() - startTimeRef.current) / 1000;
        setElapsed(e);
        setDebugData((prev) => ({ ...prev, elapsed: e }));
      }, 100);

      try {
        const res = await fetch(
          `/api/articles/${articleId}/sessions/${sessionId}/chat`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: msg }),
          },
        );

        if (!res.ok) {
          const err = await res
            .json()
            .catch(() => ({ detail: res.statusText }));
          throw new Error(err.detail || res.statusText);
        }

        let fullContent = "";
        for await (const { event, data } of streamSSE(res)) {
          if (event === "request_info") {
            setDebugData((prev) => ({
              ...prev,
              requestInfo: data,
              logs: [
                ...prev.logs,
                {
                  time: fmtTime(),
                  level: "info",
                  message: `模型: ${data.model} | 图片: ${data.image_count} 张 | 历史: ${data.history_count} 条`,
                },
              ],
            }));
          } else if (event === "delta") {
            fullContent += data.content as string;
            setStreamContent(fullContent);
            setDebugData((prev) => ({ ...prev, responseContent: fullContent }));
          } else if (event === "done") {
            const u = data.usage as DebugData["usage"] | undefined;
            setDebugData((prev) => ({
              ...prev,
              usage: u ?? null,
              logs: [
                ...prev.logs,
                { time: fmtTime(), level: "success", message: "回复完成" },
              ],
            }));
            await loadMessages(sessionId);
            await loadSessions();
          } else if (event === "error") {
            setDebugData((prev) => ({
              ...prev,
              logs: [
                ...prev.logs,
                {
                  time: fmtTime(),
                  level: "error",
                  message: data.message as string,
                },
              ],
            }));
            toast.error("处理失败: " + (data.message as string));
          }
        }
      } catch (err) {
        toast.error("请求失败: " + (err as Error).message);
        setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
      } finally {
        streamingRef.current = false;
        setStreaming(false);
        setStreamContent("");
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        const finalElapsed = (Date.now() - startTimeRef.current) / 1000;
        setElapsed(finalElapsed);
        setDebugData((prev) => ({ ...prev, elapsed: finalElapsed }));
      }
    },
    [articleId, loadMessages, loadSessions],
  );

  const handleCreateSession = useCallback(
    async (template: Template | null) => {
      setShowNewMenu(false);
      try {
        const session = await api.createSession(articleId, {
          name: template ? template.name : "自由对话",
          template_name: template?.name ?? null,
        });
        setSessions((prev) => [...prev, session]);
        setActiveSessionId(session.id);
        setMessages([]);

        if (template && template.user_prompt.trim()) {
          await sendMessage(session.id, template.user_prompt.trim());
        } else {
          textareaRef.current?.focus();
        }
      } catch (e) {
        toast.error("创建会话失败: " + (e as Error).message);
      }
    },
    [articleId, sendMessage],
  );

  const handleDeleteSession = async (sessionId: string) => {
    try {
      await api.deleteSession(articleId, sessionId);
      setSessions((prev) => {
        const next = prev.filter((s) => s.id !== sessionId);
        if (activeSessionId === sessionId) {
          setActiveSessionId(
            next.length > 0 ? next[next.length - 1].id : null,
          );
        }
        return next;
      });
      if (activeSessionId === sessionId) {
        setMessages([]);
      }
    } catch (e) {
      toast.error("删除会话失败: " + (e as Error).message);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!activeSessionId) return;
    try {
      await api.deleteSessionMessage(articleId, activeSessionId, messageId);
      await loadMessages(activeSessionId);
      toast.success("已删除");
    } catch (e) {
      toast.error("删除失败: " + (e as Error).message);
    }
  };

  const handleSendOrCreate = async () => {
    const msg = input.trim();
    if (!msg || streamingRef.current) return;
    if (!activeSessionId) {
      try {
        const session = await api.createSession(articleId, {
          name: "自由对话",
        });
        setSessions((prev) => [...prev, session]);
        setActiveSessionId(session.id);
        await sendMessage(session.id, msg);
      } catch (e) {
        toast.error("创建会话失败: " + (e as Error).message);
      }
    } else {
      await sendMessage(activeSessionId, msg);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendOrCreate();
    }
  };

  const hasNoSessions = sessions.length === 0;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border bg-card shadow-sm">
      {/* Header */}
      <div className="shrink-0 border-b bg-muted/50">
        <div className="flex items-center justify-between px-4 py-2">
          <span className="text-sm font-medium text-foreground">对话</span>
          <div className="flex items-center gap-2">
            {streaming && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-600">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                {elapsed.toFixed(1)}s
              </div>
            )}
            <button
              className="rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => setShowDebug(true)}
              title="查看请求调试信息"
            >
              Debug
            </button>
          </div>
        </div>

        {/* Tab bar */}
        {sessions.length > 0 && (
          <div className="flex items-center px-2 pb-1.5">
            <div className="flex flex-1 items-center gap-0.5 overflow-x-auto">
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className={`group relative flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-2.5 py-1 text-xs transition-colors ${
                    s.id === activeSessionId
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-background/50 hover:text-foreground"
                  }`}
                  onClick={() => !streaming && setActiveSessionId(s.id)}
                >
                  <span
                    className={`mr-0.5 inline-block h-1.5 w-1.5 rounded-full ${
                      s.template_name
                        ? "bg-primary/60"
                        : "bg-muted-foreground/30"
                    }`}
                  />
                  <span className="max-w-[100px] truncate">{s.name}</span>
                  {s.message_count > 0 && (
                    <span className="text-[10px] text-muted-foreground/60">
                      {Math.ceil(s.message_count / 2)}
                    </span>
                  )}
                  <button
                    className="ml-0.5 hidden rounded-sm p-0.5 text-[10px] leading-none text-muted-foreground/40 hover:bg-destructive/10 hover:text-destructive group-hover:inline-flex"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteSession(s.id);
                    }}
                    title="关闭会话"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            <div className="relative shrink-0" ref={newMenuRef}>
              <button
                className="flex items-center rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-background/50 hover:text-foreground"
                onClick={() => setShowNewMenu(!showNewMenu)}
                title="新建会话"
              >
                +
              </button>
              {showNewMenu && (
                <div className="absolute right-0 top-full z-20 mt-1 min-w-[180px] rounded-md border bg-popover p-1 shadow-md">
                  <button
                    className="flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-xs text-popover-foreground hover:bg-accent"
                    onClick={() => handleCreateSession(null)}
                  >
                    自由对话
                  </button>
                  {templates.length > 0 && (
                    <div className="my-1 h-px bg-border" />
                  )}
                  {templates.map((t) => (
                    <button
                      key={t.name}
                      className="flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-xs text-popover-foreground hover:bg-accent"
                      onClick={() => handleCreateSession(t)}
                      title={t.description}
                    >
                      <span className="text-[10px] text-primary">●</span>
                      <span>{t.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Messages area */}
      <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-4 px-4 py-4">
          {hasNoSessions && !streaming && (
            <div className="flex min-h-[300px] flex-col items-center justify-center gap-6">
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">
                  选择任务模板开始
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  点击模板立即开始 AI 分析，或选择自由对话
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-3">
                {templates.map((t) => (
                  <button
                    key={t.name}
                    className="group flex w-[180px] flex-col items-start gap-1.5 rounded-lg border bg-card p-3 text-left transition-all hover:border-primary/50 hover:shadow-md"
                    onClick={() => handleCreateSession(t)}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="inline-block h-2 w-2 rounded-full bg-primary/60" />
                      <span className="text-sm font-medium text-foreground group-hover:text-primary">
                        {t.name}
                      </span>
                    </div>
                    {t.description && (
                      <p className="text-[11px] leading-relaxed text-muted-foreground">
                        {t.description}
                      </p>
                    )}
                  </button>
                ))}
                <button
                  className="group flex w-[180px] flex-col items-start gap-1.5 rounded-lg border border-dashed bg-card p-3 text-left transition-all hover:border-primary/50 hover:shadow-md"
                  onClick={() => handleCreateSession(null)}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/30" />
                    <span className="text-sm font-medium text-foreground group-hover:text-primary">
                      自由对话
                    </span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    自由提问，无预设模板
                  </p>
                </button>
              </div>
            </div>
          )}

          {!hasNoSessions &&
            activeSessionId &&
            messages.length === 0 &&
            !streaming && (
              <div className="flex min-h-[200px] items-center justify-center">
                <p className="text-sm text-muted-foreground">
                  输入问题开始对话
                </p>
              </div>
            )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`group flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
            >
              <div
                className={`relative max-w-[85%] rounded-lg px-3.5 py-2.5 text-sm ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                {msg.role === "assistant" ? (
                  <div className="prose prose-sm max-w-none">
                    <ReactMarkdown
                      remarkPlugins={remarkPlugins}
                      rehypePlugins={rehypePlugins}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                )}
                {msg.role === "user" && (
                  <button
                    className="absolute -bottom-5 right-0 hidden text-[11px] text-muted-foreground hover:text-destructive group-hover:inline-block"
                    onClick={() => handleDeleteMessage(msg.id)}
                  >
                    删除
                  </button>
                )}
              </div>
            </div>
          ))}

          {streaming && streamContent && (
            <div className="flex gap-3">
              <div className="max-w-[85%] rounded-lg bg-muted px-3.5 py-2.5 text-sm">
                <div className="prose prose-sm max-w-none">
                  <ReactMarkdown
                    remarkPlugins={remarkPlugins}
                    rehypePlugins={rehypePlugins}
                  >
                    {streamContent}
                  </ReactMarkdown>
                  <span className="inline-block h-4 w-1.5 animate-pulse bg-primary" />
                </div>
              </div>
            </div>
          )}

          {streaming && !streamContent && (
            <div className="flex gap-3">
              <div className="rounded-lg bg-muted px-3.5 py-2.5 text-sm text-muted-foreground">
                <span className="inline-flex gap-1">
                  <span className="animate-bounce">·</span>
                  <span className="animate-bounce" style={{ animationDelay: "0.1s" }}>·</span>
                  <span className="animate-bounce" style={{ animationDelay: "0.2s" }}>·</span>
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input area */}
      <div className="shrink-0 border-t bg-card px-4 py-3">
        <div className="flex gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              activeSessionId
                ? "输入问题... (Enter 发送, Shift+Enter 换行)"
                : "输入问题开始自由对话... (Enter 发送)"
            }
            className="min-h-[60px] max-h-[120px] resize-none text-sm"
            disabled={streaming}
          />
          <Button
            className="shrink-0 self-end"
            size="sm"
            onClick={handleSendOrCreate}
            disabled={streaming || !input.trim()}
          >
            {streaming ? "发送中" : "发送"}
          </Button>
        </div>
      </div>

      {/* Debug dialog — rendered via portal, zero layout impact */}
      <DebugDialog
        open={showDebug}
        onOpenChange={setShowDebug}
        data={debugData}
        streaming={streaming}
      />
    </div>
  );
}
