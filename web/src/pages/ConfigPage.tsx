import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { api, type AppConfig, type Template, type Workflow, type WorkflowStep } from "@/lib/api";

export function ConfigPage() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [keys, setKeys] = useState({ mistral: "", openai: "" });
  const [llm, setLlm] = useState({ base_url: "", model: "", temperature: 0.7, max_tokens: 4096 });
  const [systemPrompt, setSystemPrompt] = useState("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);

  const load = useCallback(async () => {
    try {
      const c = await api.getConfig();
      setConfig(c);
      setKeys({ mistral: "", openai: "" });
      setLlm(c.llm);
      setSystemPrompt(c.system_prompt || "");
      setTemplates(c.templates || []);
      setWorkflows(c.workflows || []);
    } catch (e) {
      toast.error("加载配置失败: " + (e as Error).message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveKeys = async () => {
    if (!keys.mistral && !keys.openai) {
      toast.info("未输入新的 Key");
      return;
    }
    try {
      await api.updateConfig({ api_keys: { mistral: keys.mistral, openai: keys.openai } });
      toast.success("API Keys 已更新");
      setKeys({ mistral: "", openai: "" });
      await load();
    } catch (e) {
      toast.error("保存失败: " + (e as Error).message);
    }
  };

  const saveLlm = async () => {
    try {
      await api.updateConfig({ llm });
      toast.success("LLM 设置已保存");
    } catch (e) {
      toast.error("保存失败: " + (e as Error).message);
    }
  };

  const saveSystemPrompt = async () => {
    try {
      await api.updateConfig({ system_prompt: systemPrompt });
      toast.success("系统提示词已保存");
    } catch (e) {
      toast.error("保存失败: " + (e as Error).message);
    }
  };

  const saveTemplates = async () => {
    try {
      await api.updateConfig({ templates });
      toast.success("模板已保存");
    } catch (e) {
      toast.error("保存失败: " + (e as Error).message);
    }
  };

  const addTemplate = () => {
    setTemplates([
      ...templates,
      { name: "新模板", description: "", user_prompt: "" },
    ]);
  };

  const removeTemplate = (index: number) => {
    setTemplates(templates.filter((_, i) => i !== index));
  };

  const updateTemplate = (index: number, field: keyof Template, value: string) => {
    setTemplates(templates.map((t, i) => (i === index ? { ...t, [field]: value } : t)));
  };

  // --- Workflows ---
  const saveWorkflows = async () => {
    try {
      await api.updateConfig({ workflows });
      toast.success("工作流已保存");
    } catch (e) {
      toast.error("保存失败: " + (e as Error).message);
    }
  };

  const addWorkflow = () => {
    setWorkflows([
      ...workflows,
      { name: "新工作流", description: "", steps: [{ name: "步骤1", type: "per_article", prompt: "" }] },
    ]);
  };

  const removeWorkflow = (index: number) => {
    setWorkflows(workflows.filter((_, i) => i !== index));
  };

  const updateWorkflow = (index: number, field: keyof Omit<Workflow, "steps">, value: string) => {
    setWorkflows(workflows.map((w, i) => (i === index ? { ...w, [field]: value } : w)));
  };

  const addStep = (wfIndex: number) => {
    setWorkflows(workflows.map((w, i) =>
      i === wfIndex
        ? { ...w, steps: [...w.steps, { name: `步骤${w.steps.length + 1}`, type: "per_article" as const, prompt: "" }] }
        : w
    ));
  };

  const removeStep = (wfIndex: number, stepIndex: number) => {
    setWorkflows(workflows.map((w, i) =>
      i === wfIndex ? { ...w, steps: w.steps.filter((_, si) => si !== stepIndex) } : w
    ));
  };

  const updateStep = (wfIndex: number, stepIndex: number, field: keyof WorkflowStep, value: string) => {
    setWorkflows(workflows.map((w, i) =>
      i === wfIndex
        ? { ...w, steps: w.steps.map((s, si) => (si === stepIndex ? { ...s, [field]: value } : s)) }
        : w
    ));
  };

  if (!config) {
    return <div className="py-12 text-center text-muted-foreground">加载中...</div>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">配置管理</h2>
      <p className="text-sm text-muted-foreground">
        也可直接编辑项目根目录下的 <code className="rounded bg-muted px-1">config.yaml</code> 文件
      </p>

      {/* API Keys */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">API Keys</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Mistral API Key</Label>
            <p className="text-xs text-muted-foreground">
              当前: {config.api_keys.mistral || "未设置"}
            </p>
            <Input
              placeholder="输入新的 Key（留空则不更改）"
              value={keys.mistral}
              onChange={(e) => setKeys({ ...keys, mistral: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>OpenAI API Key</Label>
            <p className="text-xs text-muted-foreground">
              当前: {config.api_keys.openai || "未设置"}
            </p>
            <Input
              placeholder="输入新的 Key（留空则不更改）"
              value={keys.openai}
              onChange={(e) => setKeys({ ...keys, openai: e.target.value })}
            />
          </div>
          <Button size="sm" onClick={saveKeys}>
            保存 Keys
          </Button>
        </CardContent>
      </Card>

      {/* LLM Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">LLM 设置</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Base URL</Label>
            <Input
              placeholder="留空使用 OpenAI 官方地址"
              value={llm.base_url}
              onChange={(e) => setLlm({ ...llm, base_url: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>模型</Label>
              <Input
                value={llm.model}
                onChange={(e) => setLlm({ ...llm, model: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Temperature</Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                max="2"
                value={llm.temperature}
                onChange={(e) => setLlm({ ...llm, temperature: parseFloat(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label>Max Tokens</Label>
              <Input
                type="number"
                step="256"
                min="256"
                value={llm.max_tokens}
                onChange={(e) => setLlm({ ...llm, max_tokens: parseInt(e.target.value) })}
              />
            </div>
          </div>
          <Button size="sm" onClick={saveLlm}>
            保存 LLM 设置
          </Button>
        </CardContent>
      </Card>

      {/* System Prompt */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">全局系统提示词</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            所有对话会话共享此系统提示词，文章内容会自动附加在其后发送给模型
          </p>
          <Textarea
            rows={4}
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="例如：你是一个专业的文章分析助手..."
          />
          <Button size="sm" onClick={saveSystemPrompt}>
            保存系统提示词
          </Button>
        </CardContent>
      </Card>

      {/* Templates */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">任务模板</CardTitle>
          <Button size="sm" variant="outline" onClick={addTemplate}>
            添加模板
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          {templates.map((t, i) => (
            <div key={i} className="space-y-3">
              {i > 0 && <Separator />}
              <div className="flex items-center gap-4">
                <div className="flex-1 space-y-2">
                  <Label>模板名称</Label>
                  <Input
                    value={t.name}
                    onChange={(e) => updateTemplate(i, "name", e.target.value)}
                  />
                </div>
                <div className="flex-1 space-y-2">
                  <Label>描述</Label>
                  <Input
                    value={t.description}
                    onChange={(e) => updateTemplate(i, "description", e.target.value)}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-6 text-destructive hover:text-destructive"
                  onClick={() => removeTemplate(i)}
                >
                  删除
                </Button>
              </div>
              <div className="space-y-2">
                <Label>
                  User Prompt{" "}
                  <span className="text-xs text-muted-foreground">
                    （点击模板时发送给模型的指令）
                  </span>
                </Label>
                <Textarea
                  rows={3}
                  value={t.user_prompt}
                  onChange={(e) => updateTemplate(i, "user_prompt", e.target.value)}
                />
              </div>
            </div>
          ))}
          {templates.length > 0 && (
            <Button size="sm" onClick={saveTemplates}>
              保存模板
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Workflows */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">工作流编排</CardTitle>
          <Button size="sm" variant="outline" onClick={addWorkflow}>
            添加工作流
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-xs text-muted-foreground">
            工作流可包含多个步骤，支持「逐篇处理」和「汇总整合」两种类型。
            汇总步骤会自动将前序步骤的输出作为上下文传给模型，Prompt 中只需写指令即可。
          </p>
          {workflows.map((w, wi) => (
            <div key={wi} className="space-y-4">
              {wi > 0 && <Separator />}
              <div className="flex items-center gap-4">
                <div className="flex-1 space-y-2">
                  <Label>工作流名称</Label>
                  <Input
                    value={w.name}
                    onChange={(e) => updateWorkflow(wi, "name", e.target.value)}
                  />
                </div>
                <div className="flex-1 space-y-2">
                  <Label>描述</Label>
                  <Input
                    value={w.description}
                    onChange={(e) => updateWorkflow(wi, "description", e.target.value)}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-6 text-destructive hover:text-destructive"
                  onClick={() => removeWorkflow(wi)}
                >
                  删除
                </Button>
              </div>

              {/* Steps */}
              <div className="ml-4 space-y-3 border-l-2 border-muted pl-4">
                <Label className="text-xs text-muted-foreground">步骤列表</Label>
                {w.steps.map((step, si) => (
                  <div key={si} className="space-y-2 rounded-md border bg-muted/20 p-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-medium text-primary">
                        {si + 1}
                      </span>
                      <div className="flex-1">
                        <Input
                          value={step.name}
                          onChange={(e) => updateStep(wi, si, "name", e.target.value)}
                          placeholder="步骤名称"
                          className="h-8 text-sm"
                        />
                      </div>
                      <select
                        className="h-8 rounded-md border bg-background px-2 text-xs"
                        value={step.type}
                        onChange={(e) => updateStep(wi, si, "type", e.target.value)}
                      >
                        <option value="per_article">逐篇处理</option>
                        <option value="aggregate">汇总整合</option>
                      </select>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs text-destructive hover:text-destructive"
                        onClick={() => removeStep(wi, si)}
                        disabled={w.steps.length <= 1}
                      >
                        删除
                      </Button>
                    </div>
                    <Textarea
                      rows={3}
                      value={step.prompt}
                      onChange={(e) => updateStep(wi, si, "prompt", e.target.value)}
                      placeholder={
                        step.type === "aggregate"
                          ? "汇总指令，前序步骤输出会自动作为上下文传入"
                          : "对每篇文章执行的提示词"
                      }
                      className="text-sm"
                    />
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => addStep(wi)}
                >
                  + 添加步骤
                </Button>
              </div>
            </div>
          ))}
          {workflows.length > 0 && (
            <Button size="sm" onClick={saveWorkflows}>
              保存工作流
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
