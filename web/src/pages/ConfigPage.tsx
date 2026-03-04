import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { api, type AppConfig, type Template } from "@/lib/api";

export function ConfigPage() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [keys, setKeys] = useState({ mistral: "", openai: "" });
  const [llm, setLlm] = useState({ base_url: "", model: "", temperature: 0.7, max_tokens: 4096 });
  const [systemPrompt, setSystemPrompt] = useState("");
  const [templates, setTemplates] = useState<Template[]>([]);

  const load = useCallback(async () => {
    try {
      const c = await api.getConfig();
      setConfig(c);
      setKeys({ mistral: "", openai: "" });
      setLlm(c.llm);
      setSystemPrompt(c.system_prompt || "");
      setTemplates(c.templates || []);
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
    </div>
  );
}
