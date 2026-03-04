import { useState } from "react";
import { Badge } from "@/components/ui/badge";

interface RequestInfo {
  model: string;
  base_url: string;
  temperature: number;
  max_tokens: number;
  template_name: string;
  system_prompt: string;
  user_prompt_length: number;
  image_count: number;
  images: { name: string; mime: string; size: number }[];
}

export function RequestPanel({ info }: { info: RequestInfo | null }) {
  const [expanded, setExpanded] = useState(false);

  if (!info) return null;

  return (
    <div className="overflow-hidden rounded-lg border bg-card font-mono text-xs shadow-sm">
      <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-2">
        <span className="text-[11px] font-medium text-muted-foreground">Request Details</span>
        <button
          className="text-[11px] text-primary hover:text-primary/80"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "收起" : "展开"}
        </button>
      </div>
      <div className="space-y-2 px-4 py-3">
        <div className="flex flex-wrap gap-2">
          <Badge variant="default">{info.model}</Badge>
          <Badge variant="secondary">temp: {info.temperature}</Badge>
          <Badge variant="secondary">max: {info.max_tokens}</Badge>
          <Badge variant="outline">模板: {info.template_name}</Badge>
          {info.image_count > 0 && (
            <Badge variant="secondary" className="border-amber-200 bg-amber-50 text-amber-700">
              {info.image_count} 张图片
            </Badge>
          )}
        </div>
        <div className="text-muted-foreground">
          <span className="text-foreground/50">Endpoint: </span>
          {info.base_url}
        </div>
        <div className="text-muted-foreground">
          <span className="text-foreground/50">Prompt 长度: </span>
          {info.user_prompt_length.toLocaleString()} 字符
        </div>

        {expanded && (
          <div className="mt-2 space-y-2 border-t pt-2">
            {info.system_prompt && (
              <div>
                <div className="mb-1 text-muted-foreground">System Prompt:</div>
                <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-foreground/70">
                  {info.system_prompt}
                </pre>
              </div>
            )}
            {info.images.length > 0 && (
              <div>
                <div className="mb-1 text-muted-foreground">图片列表:</div>
                {info.images.map((img, i) => (
                  <div key={i} className="text-foreground/70">
                    {img.name}{" "}
                    <span className="text-muted-foreground">
                      ({img.mime}, {(img.size / 1024).toFixed(1)} KB)
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
