import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LogStream, type LogEntry } from "@/components/LogStream";
import { streamSSE } from "@/lib/sse";
import { api, type ArticleMeta } from "@/lib/api";

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
  const fileRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      setArticles(await api.listArticles());
    } catch (e) {
      toast.error("加载失败: " + (e as Error).message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

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
      await load();
    } catch (err) {
      toast.error("删除失败: " + (err as Error).message);
    }
  };

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
            return (
              <Card
                key={a.id}
                className="cursor-pointer transition-shadow hover:shadow-md"
                onClick={() => navigate(`/articles/${a.id}`)}
              >
                <CardContent className="flex items-center justify-between py-4">
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
    </div>
  );
}
