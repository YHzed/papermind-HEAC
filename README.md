# PaperMind

上传 PDF / Markdown 文章，自动解析并借助 LLM 进行分析和对话的全栈工具。

## 功能

- **文章上传与解析** — 支持 PDF（通过 Mistral OCR）和 Markdown 文件，自动提取文本和图片
- **LLM 对话** — 解析后的文章自动加载为上下文，支持多轮对话
- **多会话管理** — 每篇文章支持多个独立对话 Tab，互不干扰
- **任务模板** — 预定义模板一键触发 LLM 处理，也可自由对话
- **流式输出** — SSE 实时流式返回模型回复
- **调试面板** — 查看完整请求体、模型输出、token 用量和日志
- **LaTeX 渲染** — 支持数学公式显示
- **Web 配置** — 在线管理 API Key、模型参数、系统提示词和任务模板

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 19 · Vite · Tailwind CSS v4 · Shadcn/ui · React Markdown |
| 后端 | Python · FastAPI · Uvicorn |
| LLM | OpenAI 兼容 API（支持 OpenRouter 等中转） |
| OCR | Mistral API（PDF 解析） |

## 快速开始

### 前置要求

- Python 3.11+
- Node.js 18+
- OpenAI 兼容 API Key（用于对话）
- Mistral API Key（用于 PDF 解析，仅上传 PDF 时需要）

### 安装

```bash
# 克隆项目
git clone <repo-url> && cd papermind

# 后端依赖
python -m venv .venv
source .venv/bin/activate
pip install -r server/requirements.txt

# 前端依赖
cd web && npm install && cd ..
```

### 配置

复制示例配置并填入你的 API Key：

```bash
cp config.yaml.example config.yaml
```

编辑 `config.yaml`：

```yaml
api_keys:
  mistral: your-mistral-api-key    # PDF 解析用
  openai: your-openai-api-key      # LLM 对话用
llm:
  base_url: https://api.openai.com/v1  # 或 OpenRouter 等兼容地址
  model: gpt-4o
  temperature: 0.7
  max_tokens: 4096
system_prompt: 你是一个专业的文章分析助手。...
```

也可以通过 `.env` 文件设置 API Key（优先级高于 config.yaml）：

```bash
OPENAI_API_KEY=sk-xxx
MISTRAL_API_KEY=xxx
```

### 启动

```bash
# 一键启动前后端
bash start.sh
```

或分别启动：

```bash
# 后端 (http://127.0.0.1:8000)
.venv/bin/uvicorn server.main:app --reload --host 127.0.0.1 --port 8000

# 前端 (http://127.0.0.1:5173)
cd web && npm run dev
```

打开浏览器访问 `http://127.0.0.1:5173`。

## 项目结构

```
papermind/
├── server/                  # 后端 (FastAPI)
│   ├── main.py              # API 路由
│   ├── config_manager.py    # 配置读写
│   ├── ocr_service.py       # PDF → Markdown (Mistral OCR)
│   ├── md_parser.py         # Markdown 解析与图片提取
│   ├── llm_service.py       # LLM 文章处理（一次性任务）
│   ├── chat_service.py      # LLM 多轮对话与会话管理
│   ├── vision_payload.py    # 多模态消息构建（文图交错）
│   └── requirements.txt
├── web/                     # 前端 (React + Vite)
│   ├── src/
│   │   ├── pages/           # 页面组件
│   │   ├── components/      # UI 组件
│   │   └── lib/             # API 客户端、工具函数
│   └── package.json
├── config.yaml.example      # 配置示例
├── start.sh                 # 一键启动脚本
└── data/                    # 运行时数据（git 忽略）
    ├── uploads/             # 上传的原始文件
    └── articles/            # 解析后的文章数据
```

## 使用流程

1. **上传文章** — 在首页上传 PDF 或 Markdown 文件，系统自动解析
2. **查看内容** — 点击文章进入详情页，左侧显示解析后的文章内容
3. **开始对话** — 右侧选择任务模板一键开始，或直接自由提问
4. **多轮交互** — 在同一会话中继续追问，或新建 Tab 开启新会话
5. **配置管理** — 在配置页面修改模型参数、系统提示词和任务模板

## License

MIT
