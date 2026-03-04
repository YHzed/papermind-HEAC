import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Clock, Play, Trash2, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { api, type Workflow, type WorkflowRunSummary } from "@/lib/api";

const STATUS_STYLE: Record<string, { label: string; icon: typeof CheckCircle2; color: string }> = {
  running: { label: "运行中", icon: Loader2, color: "text-blue-600" },
  completed: { label: "已完成", icon: CheckCircle2, color: "text-emerald-600" },
  error: { label: "失败", icon: AlertCircle, color: "text-destructive" },
};

export function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [runs, setRuns] = useState<WorkflowRunSummary[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      const [config, runList] = await Promise.all([
        api.getConfig(),
        api.listWorkflowRuns(),
      ]);
      setWorkflows(config.workflows || []);
      setRuns(runList);
    } catch (e) {
      toast.error("加载失败: " + (e as Error).message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const confirmDeleteRun = async () => {
    if (!deleteTarget) return;
    try {
      await api.deleteWorkflowRun(deleteTarget);
      toast.success("已删除");
      await load();
    } catch (err) {
      toast.error("删除失败: " + (err as Error).message);
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">工作流</h2>
        <Button variant="outline" size="sm" onClick={load}>
          刷新
        </Button>
      </div>

      {/* Workflow templates */}
      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Play className="h-4 w-4" />
          可用工作流模板
        </h3>
        {workflows.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              暂无工作流模板，请在配置页面添加
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {workflows.map((w) => (
              <Card key={w.name}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Play className="h-4 w-4 text-primary" />
                    {w.name}
                    <Badge variant="secondary" className="ml-auto text-[10px]">
                      {w.steps.length} 步
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 pt-0">
                  {w.description && (
                    <p className="text-xs text-muted-foreground">{w.description}</p>
                  )}
                  <div className="flex flex-wrap gap-1">
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
                  <p className="text-[11px] text-muted-foreground/70">
                    在文章列表中选择文章后可运行此工作流
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Run history */}
      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Clock className="h-4 w-4" />
          运行历史
        </h3>
        {runs.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              暂无运行记录
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {runs.map((run) => {
              const st = STATUS_STYLE[run.status] || STATUS_STYLE.error;
              const Icon = st.icon;
              return (
                <Card
                  key={run.id}
                  className="cursor-pointer transition-shadow hover:shadow-md"
                  onClick={() => navigate(`/workflows/run/${run.id}`)}
                >
                  <CardContent className="flex items-center gap-4 py-4">
                    <Icon
                      className={`h-5 w-5 shrink-0 ${st.color} ${run.status === "running" ? "animate-spin" : ""}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{run.workflow_name}</p>
                        <Badge variant="outline" className="text-[10px]">
                          {run.articles.length} 篇文章
                        </Badge>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {run.articles.map((a) => a.name).join(", ")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(run.created_at).toLocaleString("zh-CN")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={run.status === "completed" ? "default" : run.status === "error" ? "destructive" : "secondary"}
                      >
                        {st.label}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(run.id); }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确定删除？</AlertDialogTitle>
            <AlertDialogDescription>
              此操作将永久删除该运行记录及其所有结果，无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDeleteRun}>
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
