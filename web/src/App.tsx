import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { ArticlesPage } from "@/pages/ArticlesPage";
import { ArticleDetailPage } from "@/pages/ArticleDetailPage";
import { ConfigPage } from "@/pages/ConfigPage";
import { WorkflowsPage } from "@/pages/WorkflowsPage";
import { WorkflowRunPage } from "@/pages/WorkflowRunPage";

function App() {
  return (
    <BrowserRouter>
      <div className="flex h-full flex-col overflow-hidden bg-background">
        <header className="shrink-0 border-b border-border/60 bg-white/80 backdrop-blur-md">
          <div className="flex h-14 items-center gap-6 px-6">
            <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-primary">
              <img src="/icon.svg" alt="" className="h-6 w-6" />
              PaperMind
            </h1>
            <nav className="flex gap-1">
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 text-sm transition-colors ${isActive ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:text-foreground"}`
                }
              >
                文章
              </NavLink>
              <NavLink
                to="/workflows"
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 text-sm transition-colors ${isActive ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:text-foreground"}`
                }
              >
                工作流
              </NavLink>
              <NavLink
                to="/config"
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 text-sm transition-colors ${isActive ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:text-foreground"}`
                }
              >
                配置
              </NavLink>
            </nav>
          </div>
        </header>
        <main className="flex min-h-0 flex-1 flex-col">
          <Routes>
            <Route
              path="/"
              element={
                <div className="min-h-0 flex-1 overflow-auto px-6 py-6">
                  <div className="mx-auto max-w-5xl"><ArticlesPage /></div>
                </div>
              }
            />
            <Route
              path="/articles/:id"
              element={
                <div className="flex min-h-0 flex-1 flex-col px-6 py-4">
                  <ArticleDetailPage />
                </div>
              }
            />
            <Route
              path="/workflows"
              element={
                <div className="min-h-0 flex-1 overflow-auto px-6 py-6">
                  <div className="mx-auto max-w-5xl"><WorkflowsPage /></div>
                </div>
              }
            />
            <Route
              path="/workflows/run"
              element={
                <div className="min-h-0 flex-1 overflow-auto px-6 py-6">
                  <div className="mx-auto max-w-5xl"><WorkflowRunPage /></div>
                </div>
              }
            />
            <Route
              path="/workflows/run/:id"
              element={
                <div className="min-h-0 flex-1 overflow-auto px-6 py-6">
                  <div className="mx-auto max-w-5xl"><WorkflowRunPage /></div>
                </div>
              }
            />
            <Route
              path="/config"
              element={
                <div className="min-h-0 flex-1 overflow-auto px-6 py-6">
                  <div className="mx-auto max-w-5xl"><ConfigPage /></div>
                </div>
              }
            />
          </Routes>
        </main>
      </div>
      <Toaster />
    </BrowserRouter>
  );
}

export default App;
