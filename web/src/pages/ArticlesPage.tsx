import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Check, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LogStream, type LogEntry } from "@/components/LogStream";
import { streamSSE } from "@/lib/sse";
import { api, type ArticleMeta, type Workflow } from "@/lib/api";

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  parsing: { label: "解析中", variant: "secondary" },
  parsed: { label: "已解析", variant: "outline" },
  processing: { label: "处理中", variant: "secondary" },
  completed: { label: "已完成", variant: "default" },
  error: { label: "错误", variant: "destructive" },
};

function timestamp() {
  return new Date().toLocaleTimeString("zh-CN", { hour12: false });
}

export function ArticlesPage() {
  const [articles, setArticles] = useState<ArticleMeta[]>([]);
  const [uploading, setUploading] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [showWorkflowDialog, setShowWorkflowDialog] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      const [arts, config] = await Promise.all([
        api.listArticles(),
        api.getConfig(),
      ]);
      setArticles(arts);
      setWorkflows(config.workflows || []);
    } catch (e) {
      toast.error("加载失败: " + (e as Error).message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setLogs([]);

    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || res.statusText);
      }

      for await (const { event, data } of streamSSE(res)) {
        if (event === "log") {
          setLogs((prev) => [
            ...prev,
            { time: timestamp(), level: data.level as LogEntry["level"], message: data.message as string },
          ]);
        } else if (event === "page") {
          setLogs((prev) => [
            ...prev,
            {
              time: timestamp(),
              level: "info",
              message: `📄 第 ${data.page}/${data.total} 页 | ${data.images_count} 图 | ${(data.preview as string).slice(0, 60)}...`,
            },
          ]);
        } else if (event === "complete") {
          setLogs((prev) => [
            ...prev,
            { time: timestamp(), level: "success", message: "✅ 文章解析完成" },
          ]);
          await load();
        } else if (event === "error") {
          setLogs((prev) => [
            ...prev,
            { time: timestamp(), level: "error", message: `❌ ${data.message}` },
          ]);
        }
      }
    } catch (err) {
      setLogs((prev) => [
        ...prev,
        { time: timestamp(), level: "error", message: `❌ ${(err as Error).message}` },
      ]);
      toast.error("上传失败: " + (err as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("确定删除？")) return;
    try {
      await api.deleteArticle(id);
      toast.success("已删除");
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      await load();
    } catch (err) {
      toast.error("删除失败: " + (err as Error).message);
    }
  };

  const handleRunWorkflow = (workflow: Workflow) => {
    setShowWorkflowDialog(false);
    navigate("/workflows/run", {
      state: {
        workflowName: workflow.name,
        articleIds: Array.from(selected),
      },
    });
  };

  const parsedArticles = articles.filter((a) => a.status !== "parsing");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">文章列表</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}>
            刷新
          </Button>
          <Button size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? "上传中..." : "上传文件"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".md,.pdf"
            className="hidden"
            onChange={handleUpload}
          />
        </div>
      </div>

      {logs.length > 0 && (
        <div className="space-y-2">
          <LogStream logs={logs} loading={uploading} />
          {!uploading && (
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" onClick={() => setLogs([])}>
                清除日志
              </Button>
            </div>
          )}
        </div>
      )}

      {articles.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            暂无文章，点击上方按钮上传 .md 或 .pdf 文件
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {articles.map((a) => {
            const s = STATUS_MAP[a.status] || STATUS_MAP.error;
            const isSelected = selected.has(a.id);
            const canSelect = a.status !== "parsing";
            return (
              <Card
                key={a.id}
                className={`cursor-pointer transition-shadow hover:shadow-md ${isSelected ? "ring-2 ring-primary/50" : ""}`}
                onClick={() => navigate(`/articles/${a.id}`)}
              >
                <CardContent className="flex items-center gap-3 py-4">
                  {/* Checkbox */}
                  {canSelect && (
                    <div
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input hover:border-primary/50"
                      }`}
                      onClick={(e) => toggleSelect(a.id, e)}
                    >
                      {isSelected && <Check className="h-3.5 w-3.5" />}
                    </div>
                  )}
                  {!canSelect && <div className="w-5 shrink-0" />}

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{a.original_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(a.created_at).toLocaleString("zh-CN")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={s.variant}>{s.label}</Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={(e) => handleDelete(e, a.id)}
                    >
                      删除
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Floating action bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className="flex items-center gap-3 rounded-full border bg-background/95 px-5 py-2.5 shadow-lg backdrop-blur">
            <span className="text-sm font-medium">
              已选择 {selected.size} 篇文章
            </span>
            <Button
              size="sm"
              onClick={() => {
                if (workflows.length === 0) {
                  toast.error("暂未配置工作流，请在配置页面添加");
                  return;
                }
                if (selected.size > 0 && !parsedArticles.some((a) => selected.has(a.id))) {
                  toast.error("请选择已解析的文章");
                  return;
                }
                setShowWorkflowDialog(true);
              }}
              className="gap-1.5"
            >
              <Play className="h-3.5 w-3.5" />
              运行工作流
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelected(new Set())}
            >
              取消
            </Button>
          </div>
        </div>
      )}

      {/* Workflow selection dialog */}
      <Dialog open={showWorkflowDialog} onOpenChange={setShowWorkflowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>选择工作流</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            将对 {selected.size} 篇文章运行所选工作流
          </p>
          <div className="mt-2 space-y-2">
            {workflows.map((w) => (
              <button
                key={w.name}
                className="flex w-full flex-col items-start gap-1 rounded-lg border bg-card p-4 text-left transition-all hover:border-primary/50 hover:shadow-md"
                onClick={() => handleRunWorkflow(w)}
              >
                <div className="flex items-center gap-2">
                  <Play className="h-4 w-4 text-primary" />
                  <span className="font-medium">{w.name}</span>
                  <Badge variant="secondary" className="text-[10px]">
                    {w.steps.length} 步
                  </Badge>
                </div>
                {w.description && (
                  <p className="text-xs text-muted-foreground">{w.description}</p>
                )}
                <div className="mt-1 flex flex-wrap gap-1">
                  {w.steps.map((step, i) => (
                    <span
                      key={i}
                      className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                    >
                      {i + 1}. {step.name}
                      <span className="ml-1 opacity-60">
                        ({step.type === "per_article" ? "逐篇" : "汇总"})
                      </span>
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
