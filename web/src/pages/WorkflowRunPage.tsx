import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import {
  CheckCircle2,
  Circle,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { streamSSE } from "@/lib/sse";
import { api, type WorkflowRunDetail } from "@/lib/api";

interface StepState {
  name: string;
  type: "per_article" | "aggregate";
  status: "pending" | "running" | "completed" | "error";
  articleStatuses: Record<string, "pending" | "running" | "completed">;
  articleContents: Record<string, string>;
  aggregateContent: string;
}

const remarkPlugins = [remarkGfm, remarkMath];
const rehypePlugins = [rehypeKatex];

function StepIcon({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="h-5 w-5 text-emerald-600" />;
    case "running":
      return <Loader2 className="h-5 w-5 animate-spin text-blue-600" />;
    case "error":
      return <AlertCircle className="h-5 w-5 text-destructive" />;
    default:
      return <Circle className="h-5 w-5 text-muted-foreground/40" />;
  }
}

export function WorkflowRunPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const [runId, setRunId] = useState<string | null>(id || null);
  const [workflowName, setWorkflowName] = useState("");
  const [articles, setArticles] = useState<{ id: string; name: string }[]>([]);
  const [steps, setSteps] = useState<StepState[]>([]);
  const [overallStatus, setOverallStatus] = useState<"running" | "completed" | "error">("running");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  const [isExecuting, setIsExecuting] = useState(false);

  const executedRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const toggleStep = (idx: number) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  // Load an existing run
  const loadExistingRun = useCallback(async (runId: string) => {
    try {
      const run: WorkflowRunDetail = await api.getWorkflowRun(runId);
      setRunId(run.id);
      setWorkflowName(run.workflow_name);
      setArticles(run.articles);
      setOverallStatus(run.status);
      setErrorMessage(run.error_message);

      const stepStates: StepState[] = run.steps.map((s) => {
        const articleStatuses: Record<string, "pending" | "running" | "completed"> = {};
        const articleContents: Record<string, string> = {};
        if (s.type === "per_article" && s.results) {
          for (const aid of run.article_ids) {
            articleStatuses[aid] = s.results[aid] ? "completed" : "pending";
            articleContents[aid] = s.results[aid] || "";
          }
        }
        return {
          name: s.name,
          type: s.type,
          status: s.status,
          articleStatuses,
          articleContents,
          aggregateContent: s.result || "",
        };
      });
      setSteps(stepStates);

      // Expand all completed steps with content
      const expanded = new Set<number>();
      stepStates.forEach((s, i) => {
        if (s.status === "completed") expanded.add(i);
      });
      setExpandedSteps(expanded);
    } catch (e) {
      toast.error("加载运行记录失败: " + (e as Error).message);
    }
  }, []);

  // Execute a new workflow run via SSE
  const executeNewRun = useCallback(async (wfName: string, articleIds: string[]) => {
    setIsExecuting(true);
    setOverallStatus("running");

    try {
      const res = await fetch("/api/workflow-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflow_name: wfName, article_ids: articleIds }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || res.statusText);
      }

      for await (const { event, data } of streamSSE(res)) {
        switch (event) {
          case "run_created": {
            const newRunId = data.run_id as string;
            setRunId(newRunId);
            setWorkflowName(data.workflow_name as string);
            setArticles(data.articles as { id: string; name: string }[]);
            window.history.replaceState(null, "", `/workflows/run/${newRunId}`);

            const stepCount = data.step_count as number;
            setSteps(
              Array.from({ length: stepCount }, () => ({
                name: "",
                type: "per_article" as const,
                status: "pending" as const,
                articleStatuses: {},
                articleContents: {},
                aggregateContent: "",
              })),
            );
            break;
          }
          case "step_start": {
            const idx = data.step_index as number;
            setSteps((prev) => {
              const next = [...prev];
              next[idx] = {
                ...next[idx],
                name: data.step_name as string,
                type: data.step_type as "per_article" | "aggregate",
                status: "running",
              };
              return next;
            });
            setExpandedSteps((prev) => new Set(prev).add(idx));
            break;
          }
          case "article_start": {
            const idx = data.step_index as number;
            const aid = data.article_id as string;
            setSteps((prev) => {
              const next = [...prev];
              next[idx] = {
                ...next[idx],
                articleStatuses: { ...next[idx].articleStatuses, [aid]: "running" },
              };
              return next;
            });
            break;
          }
          case "delta": {
            const idx = data.step_index as number;
            const aid = data.article_id as string | undefined;
            const content = data.content as string;
            setSteps((prev) => {
              const next = [...prev];
              if (aid) {
                next[idx] = {
                  ...next[idx],
                  articleContents: {
                    ...next[idx].articleContents,
                    [aid]: (next[idx].articleContents[aid] || "") + content,
                  },
                };
              } else {
                next[idx] = {
                  ...next[idx],
                  aggregateContent: next[idx].aggregateContent + content,
                };
              }
              return next;
            });
            break;
          }
          case "article_done": {
            const idx = data.step_index as number;
            const aid = data.article_id as string;
            setSteps((prev) => {
              const next = [...prev];
              next[idx] = {
                ...next[idx],
                articleStatuses: { ...next[idx].articleStatuses, [aid]: "completed" },
              };
              return next;
            });
            break;
          }
          case "step_done": {
            const idx = data.step_index as number;
            setSteps((prev) => {
              const next = [...prev];
              next[idx] = { ...next[idx], status: "completed" };
              return next;
            });
            break;
          }
          case "done":
            setOverallStatus("completed");
            break;
          case "error":
            setOverallStatus("error");
            setErrorMessage(data.message as string);
            toast.error("工作流执行失败: " + (data.message as string));
            break;
        }
      }
    } catch (err) {
      setOverallStatus("error");
      setErrorMessage((err as Error).message);
      toast.error("执行失败: " + (err as Error).message);
    } finally {
      setIsExecuting(false);
    }
  }, []);

  useEffect(() => {
    if (executedRef.current) return;
    executedRef.current = true;

    if (id) {
      loadExistingRun(id);
    } else {
      const state = location.state as { workflowName?: string; articleIds?: string[] } | null;
      if (state?.workflowName && state?.articleIds?.length) {
        setWorkflowName(state.workflowName);
        executeNewRun(state.workflowName, state.articleIds);
      } else {
        toast.error("缺少工作流参数");
        navigate("/workflows");
      }
    }
  }, [id, location.state, loadExistingRun, executeNewRun, navigate]);

  // Auto-scroll to bottom during execution
  useEffect(() => {
    if (isExecuting) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [steps, isExecuting]);

  // Find the last step with result content (for final result display)
  const lastStepWithContent = [...steps].reverse().find(
    (s) => s.status === "completed" && (s.aggregateContent || Object.keys(s.articleContents).length > 0),
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/workflows")}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          返回
        </Button>
        <div className="flex-1">
          <h2 className="text-xl font-semibold">{workflowName || "工作流运行"}</h2>
          {articles.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {articles.map((a) => a.name).join(", ")}
            </p>
          )}
        </div>
        <Badge
          variant={
            overallStatus === "completed"
              ? "default"
              : overallStatus === "error"
                ? "destructive"
                : "secondary"
          }
          className="text-xs"
        >
          {overallStatus === "running" && "运行中"}
          {overallStatus === "completed" && "已完成"}
          {overallStatus === "error" && "失败"}
        </Badge>
      </div>

      {errorMessage && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex items-center gap-2 py-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {errorMessage}
          </CardContent>
        </Card>
      )}

      {/* Steps timeline */}
      <div className="space-y-3">
        {steps.map((step, idx) => {
          const isExpanded = expandedSteps.has(idx);
          const hasContent =
            step.aggregateContent ||
            Object.values(step.articleContents).some((c) => c.length > 0);

          return (
            <Card key={idx} className={step.status === "running" ? "ring-1 ring-blue-200" : ""}>
              <CardHeader
                className="cursor-pointer py-3"
                onClick={() => hasContent && toggleStep(idx)}
              >
                <CardTitle className="flex items-center gap-3 text-base font-medium">
                  <StepIcon status={step.status} />
                  <span className="text-xs font-normal text-muted-foreground">
                    步骤 {idx + 1}
                  </span>
                  <span>{step.name || `步骤 ${idx + 1}`}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {step.type === "per_article" ? "逐篇处理" : "汇总整合"}
                  </Badge>

                  {/* Per-article progress indicator */}
                  {step.type === "per_article" && articles.length > 0 && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      {Object.values(step.articleStatuses).filter((s) => s === "completed").length}
                      /{articles.length}
                    </span>
                  )}

                  {hasContent && (
                    <span className="ml-auto">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </span>
                  )}
                </CardTitle>
              </CardHeader>

              {/* Expanded step content */}
              {isExpanded && hasContent && (
                <CardContent className="space-y-4 border-t pt-4">
                  {step.type === "per_article" &&
                    articles.map((art) => {
                      const artStatus = step.articleStatuses[art.id] || "pending";
                      const artContent = step.articleContents[art.id] || "";
                      return (
                        <div key={art.id} className="space-y-2">
                          <div className="flex items-center gap-2 text-sm">
                            <StepIcon status={artStatus} />
                            <span className="font-medium">{art.name}</span>
                          </div>
                          {artContent && (
                            <div className="ml-7 rounded-md border bg-muted/30 p-3">
                              <div className="prose prose-sm max-w-none">
                                <ReactMarkdown
                                  remarkPlugins={remarkPlugins}
                                  rehypePlugins={rehypePlugins}
                                >
                                  {artContent}
                                </ReactMarkdown>
                                {artStatus === "running" && (
                                  <span className="inline-block h-4 w-1.5 animate-pulse bg-primary" />
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                  {step.type === "aggregate" && step.aggregateContent && (
                    <div className="rounded-md border bg-muted/30 p-4">
                      <div className="prose prose-sm max-w-none">
                        <ReactMarkdown
                          remarkPlugins={remarkPlugins}
                          rehypePlugins={rehypePlugins}
                        >
                          {step.aggregateContent}
                        </ReactMarkdown>
                        {step.status === "running" && (
                          <span className="inline-block h-4 w-1.5 animate-pulse bg-primary" />
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {/* Final result (prominent display) */}
      {overallStatus === "completed" && lastStepWithContent && (
        <Card className="border-emerald-200 bg-emerald-50/30">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              最终结果
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none">
              <ReactMarkdown
                remarkPlugins={remarkPlugins}
                rehypePlugins={rehypePlugins}
              >
                {lastStepWithContent.aggregateContent ||
                  Object.entries(lastStepWithContent.articleContents)
                    .map(([aid, content]) => {
                      const art = articles.find((a) => a.id === aid);
                      return `### ${art?.name || aid}\n\n${content}`;
                    })
                    .join("\n\n---\n\n")}
              </ReactMarkdown>
            </div>
          </CardContent>
        </Card>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
