# Diplomacy Backend

《外交风云》AI Diplomacy 后端 MVP 骨架，基于 Python 3.11+、FastAPI、Pydantic v2、asyncio 和 pytest。

本后端 MVP 不启动开发服务器；通过 `pytest` 运行测试验证。
前端独立开发，通过 WebSocket 协议接入。
当前只提供后端工程骨架、分层目录和健康检查接口，不连接真实数据库、不调用真实 LLM。

## 联调启动

一键启动后端 + 前端：

```bash
bash scripts/dev-up.sh
```

PowerShell：

```powershell
./scripts/dev-up.ps1
```

脚本按 后端 → `/readyz` → 前端 的顺序启动，后端默认 `http://127.0.0.1:8000`，前端默认 `http://127.0.0.1:5173`，按 Ctrl-C 同时退出两个本机 dev 进程。
房间进入 running 后，后端会按阶段时长自动推进 phase，联调时无需手动调用 debug advance。

最小冒烟测试：

```bash
python scripts/integration-smoke.py
```

冒烟脚本要求后端已启动，只在本机联调时使用，未做并发 / 鉴权 / 多房间压测。

后端本机联调启动：

```bash
bash scripts/backend-dev.sh
```

PowerShell：

```powershell
./scripts/backend-dev.ps1
```

按 Ctrl-C 退出本机 dev 进程。前端 Vite 开发服务器默认使用 `http://localhost:5173`，后端 dev 环境仅允许本机前端来源和 `EXTRA_CORS_ORIGINS` 中追加的来源访问。

前端本机联调启动：

```bash
npm run dev
```

默认仍使用前端 mock transport，不影响纯前端调试。切到真实 WebSocket 联调：

```bash
VITE_USE_WS=true npm run dev
```

健康检查与联调握手：

- `http://localhost:8000/healthz`
- `http://localhost:8000/readyz`
- `http://localhost:8000/debug/v1/runtime/config`

该启动方式仅用于本机前后端联调，未做鉴权、未做 TLS、未连接数据库。联调期间保持 `LLM_PROVIDER=mock`；行动期不调用 LLM 仍是架构红线，联调改动不得绕过这条边界。

## 目录结构

```text
app/
  api/
  core/
  domain/
  game/
  llm/
  protocol/
  repositories/
  services/
  tests/
```

## 说明

后端与前端保持隔离，通过 `protocol` 层定义消息与序列化边界，后续再接入 WebSocket 传输实现。

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

## Backend persistence plan

《外交风云》AI Diplomacy 后端未来 PostgreSQL + Redis 接入边界与迁移方案参见 [docs/PERSISTENCE_PLAN.md](docs/PERSISTENCE_PLAN.md)。
