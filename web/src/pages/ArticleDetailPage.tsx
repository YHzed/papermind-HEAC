import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChatPanel } from "@/components/ChatPanel";
import { api, type ArticleDetail, type Template } from "@/lib/api";

export function ArticleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [article, setArticle] = useState<ArticleDetail | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [a, config] = await Promise.all([
        api.getArticle(id),
        api.getConfig(),
      ]);
      setArticle(a);
      setTemplates(config.templates || []);
    } catch (e) {
      toast.error("加载失败: " + (e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!article) {
    return <div className="py-12 text-center text-muted-foreground">加载中...</div>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* Header bar */}
      <div className="flex shrink-0 items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
          ← 返回
        </Button>
        <h2 className="flex-1 truncate text-xl font-semibold">
          {article.original_name}
        </h2>
        <Badge
          variant={
            article.status === "completed"
              ? "default"
              : article.status === "error"
                ? "destructive"
                : "secondary"
          }
        >
          {article.status}
        </Badge>
      </div>

      {article.error_message && (
        <Card className="shrink-0 border-destructive/50 bg-destructive/5">
          <CardContent className="py-3 text-sm text-destructive">
            {article.error_message}
          </CardContent>
        </Card>
      )}

      {/* Left-right split layout */}
      <div className="flex min-h-0 flex-1 gap-4">
        {/* Left: Article content */}
        <div className="flex w-3/5 flex-col overflow-hidden rounded-lg border bg-card shadow-sm">
          <div className="flex shrink-0 items-center justify-between border-b bg-muted/50 px-4 py-2.5">
            <span className="text-sm font-medium text-foreground">文章内容</span>
            {article.images && article.images.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {article.images.length} 张图片
              </Badge>
            )}
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {article.content ? (
              <div className="prose prose-sm max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                  components={{
                    img: ({ src, alt, ...props }) => {
                      const resolvedSrc =
                        src?.startsWith("./images/") && id
                          ? api.imageUrl(id, src.replace("./images/", ""))
                          : src;
                      return (
                        <img
                          src={resolvedSrc}
                          alt={alt}
                          className="max-w-full rounded"
                          {...props}
                        />
                      );
                    },
                  }}
                >
                  {article.content}
                </ReactMarkdown>
              </div>
            ) : (
              <p className="text-muted-foreground">暂无内容</p>
            )}
          </div>
        </div>

        {/* Right: Chat panel */}
        <div className="w-2/5">
          {id && <ChatPanel articleId={id} templates={templates} />}
        </div>
      </div>
    </div>
  );
}
