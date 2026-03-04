const BASE = "/api";

export interface ArticleMeta {
  id: string;
  original_name: string;
  created_at: string;
  status: "parsing" | "parsed" | "processing" | "completed" | "error";
  template_used: string | null;
  error_message: string | null;
}

export interface ArticleDetail extends ArticleMeta {
  content?: string;
  result?: string;
  images: string[];
}

export interface AppConfig {
  api_keys: { mistral: string; openai: string };
  llm: {
    base_url: string;
    model: string;
    temperature: number;
    max_tokens: number;
  };
  system_prompt: string;
  templates: Template[];
}

export interface Template {
  name: string;
  description: string;
  user_prompt: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface Session {
  id: string;
  name: string;
  template_name: string | null;
  created_at: string;
  message_count: number;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(BASE + url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || res.statusText);
  }
  return res.json();
}

export const api = {
  getConfig: () => request<AppConfig>("/config"),

  updateConfig: (data: Partial<Pick<AppConfig, "api_keys" | "llm" | "system_prompt" | "templates">>) =>
    request("/config", { method: "PUT", body: JSON.stringify(data) }),

  upload: async (file: File): Promise<ArticleMeta> => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(BASE + "/upload", { method: "POST", body: form });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || res.statusText);
    }
    return res.json();
  },

  listArticles: () => request<ArticleMeta[]>("/articles"),

  getArticle: (id: string) => request<ArticleDetail>(`/articles/${id}`),

  processArticle: (id: string, templateName: string) =>
    request<ArticleMeta>(`/articles/${id}/process`, {
      method: "POST",
      body: JSON.stringify({ template_name: templateName }),
    }),

  deleteArticle: (id: string) =>
    request(`/articles/${id}`, { method: "DELETE" }),

  imageUrl: (articleId: string, filename: string) =>
    `${BASE}/articles/${articleId}/images/${filename}`,

  // --- Sessions ---

  listSessions: (articleId: string) =>
    request<Session[]>(`/articles/${articleId}/sessions`),

  createSession: (articleId: string, opts: {
    name?: string;
    template_name?: string | null;
  }) =>
    request<Session>(`/articles/${articleId}/sessions`, {
      method: "POST",
      body: JSON.stringify(opts),
    }),

  deleteSession: (articleId: string, sessionId: string) =>
    request(`/articles/${articleId}/sessions/${sessionId}`, { method: "DELETE" }),

  getSessionChat: (articleId: string, sessionId: string) =>
    request<ChatMessage[]>(`/articles/${articleId}/sessions/${sessionId}/chat`),

  deleteSessionMessage: (articleId: string, sessionId: string, messageId: string) =>
    request(`/articles/${articleId}/sessions/${sessionId}/chat/${messageId}`, { method: "DELETE" }),
};
