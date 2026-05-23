# 《外交风云》前后端联调任务型提示词库

> 项目：《外交风云》— 人机混战 AI Diplomacy
> 版本：v1.0
> 适用阶段：前端任务 1–18 与后端任务 1–22 已基本完成，进入双端联调。
> 用途：将下列任意一条任务提示词整段复制粘贴给 Cursor / Claude Code / Windsurf / Augment / Copilot Agent 等 AI 编程工具即可独立执行。
> 每条提示词都已内置项目背景、技术栈、允许范围、禁止事项、产物清单、验收标准。

---

## 零、联调阶段总体说明（必读）

### 0.1 阶段差异（与前两份任务集的关键差异）

| 维度 | 前端 / 后端独立开发期 | 联调期（本文档） |
|------|----------------------|------------------|
| 启动 uvicorn | 禁止 | **允许（仅联调时）** |
| 启动 npm run dev | 禁止 | **允许（仅联调时）** |
| 启动 Docker | 禁止 | 仍禁止 |
| 真实数据库 | 禁止 | 仍禁止（内存仓储） |
| 真实 LLM 调用 | 禁止 | 仍禁止（MockLLMClient） |
| 行动期调模型 | 禁止 | 仍禁止（架构红线） |
| 改 UI / store 业务逻辑 | 允许 | **禁止**（联调只动协议边界） |
| 改 service / repository 业务逻辑 | 允许 | **禁止**（联调只动协议边界） |
| 改 protocol 类型字段 | 允许 | 仅在"协议对齐审计"任务允许，且必须前后端同步改 |

### 0.2 联调允许触碰的文件范围

允许：
- 前端 `src/protocol/transport.ts`、`src/protocol/adapter.ts`、`src/protocol/dispatcher.ts`、`src/protocol/types.ts`（仅类型对齐时）。
- 前端 `src/app/App.tsx`、`src/pages/GamePage.tsx`（仅 Transport 装配处与连接生命周期 UI）。
- 前端 `src/store/uiStore.ts`（仅新增连接状态字段）。
- 前端 `vite.config.ts`、`.env`、`.env.development`。
- 后端 `app/main.py`（CORS / 中间件 / startup）。
- 后端 `app/api/websocket/*`（路由 / dispatcher / connection 调整）。
- 后端 `app/api/rest/*`（健康检查 / debug 接口）。
- 后端 `app/core/config.py`、`.env`。
- 联调期新增脚本：`scripts/dev-up.{sh,ps1}`、`scripts/integration-smoke.{ts,py}`。

禁止：
- 前端 `src/features/**` 业务功能实现。
- 前端 `src/mock/**` mock 数据（保留，但不在联调时被使用）。
- 前端 `src/components/**` 设计系统组件实现。
- 后端 `app/services/**` 业务逻辑。
- 后端 `app/game/**` 规则裁决。
- 后端 `app/llm/**` 模型抽象。
- 后端 `app/domain/**` 领域模型字段（除非协议对齐审计明确要求）。

### 0.3 联调架构边界图

```
浏览器                                                          后端进程
  │                                                                │
  │  npm run dev :5173                              uvicorn :8000  │
  │                                                                │
GamePage                                                       FastAPI app
  │                                                                │
  ├ WebSocketTransport ─── ws://localhost:8000/ws ─── /ws endpoint │
  │       │                                              │         │
  │       └ 入站 Envelope                                 │         │
  │       │  parse_incoming → InboundRouter             │         │
  │       │  → RoomService / ActionService / PhaseService          │
  │       │  → SettlementService（仅 resolve 期触发 MockLLMClient）│
  │       │                                              │         │
  │       └ 出站 Envelope ← OutboundDispatcher ← EventLog/Settlement│
  │                                                                │
adapter.dispatch → gameStore / uiStore → UI render                 │
```

### 0.4 联调期全局红线（每条任务提示词都内置）

1. 当前阶段是前后端联调，前端代码与后端代码均已大体写完。
2. 不要重写已有 UI、store、service、repository、domain 业务逻辑。
3. 允许启动 uvicorn 与 npm run dev（仅本机联调），但不要部署到任何远程环境。
4. 不要连接真实数据库、不要启动 Docker。
5. 不要调用真实 LLM，保持 `LLM_PROVIDER=mock`。
6. 行动期不调用 LLM 仍是架构红线；任何联调改动不得破坏这条边界。
7. 协议字段名（FactionId / GamePhase / EventKind / TreatyKind / 信封 v/id/t/ts/seq/p）前后端必须严格一致；如发现差异，前后端必须同步修复。
8. MVP 阶段不在联调中重点实现 prompt injection 防护、复杂鉴权、token 校验、限流策略升级。
9. 联调中如出现 bug，必须先分诊（前端 / 后端 / 协议 / 数据），再修最小范围。
10. 不要把联调代码（启动脚本、烟雾测试脚本）当成生产部署方案。

---

## 任务 1：协议对齐审计与差异修复

### 使用场景

前端 `src/protocol/types.ts` 与后端 `app/protocol/{envelope,incoming,outgoing,routing}.py` 已各自实现。联调第一步必须做一次严格类型对齐审计，确保信封字段、消息类型字符串、payload 字段名、枚举字面量一一对应。任何差异必须前后端同步修复。本任务不启动服务，只做静态比对。

### 可直接复制给 AI 编程工具的完整提示词

```
你是一名资深前后端协议对齐工程师。请为《外交风云》—— 人机混战 AI Diplomacy 项目执行一次严格的前后端协议类型对齐审计，并修复发现的所有差异。

【项目背景】
前端 React + TS + Vite 与后端 Python FastAPI + Pydantic v2 已分别实现协议层。前端在 src/protocol/{types,transport,adapter,dispatcher}.ts；后端在 app/protocol/{envelope,incoming,outgoing,routing,serialization}.py。联调前必须做一次类型对齐审计。

【联调期全局红线（强制遵守）】
1. 当前阶段是前后端联调，前端代码与后端代码均已大体写完。
2. 不要重写已有 UI、store、service、repository、domain 业务逻辑。
3. 允许启动 uvicorn 与 npm run dev（仅本机联调），但不要部署到任何远程环境。
4. 不要连接真实数据库、不要启动 Docker。
5. 不要调用真实 LLM，保持 LLM_PROVIDER=mock。
6. 行动期不调用 LLM 仍是架构红线；任何联调改动不得破坏这条边界。
7. 协议字段名前后端必须严格一致；如发现差异，前后端必须同步修复。
8. MVP 阶段不在联调中重点实现 prompt injection 防护、复杂鉴权、token 校验、限流策略升级。
9. 联调中如出现 bug，必须先分诊，再修最小范围。
10. 不要把联调代码当成生产部署方案。

【本任务允许做以下事情】

1. 通读以下文件，列出全部消息类型与字段：
   - 前端：src/protocol/types.ts、src/protocol/adapter.ts、src/protocol/dispatcher.ts。
   - 后端：app/protocol/envelope.py、app/protocol/incoming.py、app/protocol/outgoing.py、app/protocol/routing.py。
   - 双端枚举：前端 src/mock/types.ts 中 FactionId / GamePhase / ArbitratePhase / TreatyKind / RelationshipStatus / EventPriority / EventKind；后端 app/domain/enums.py 同名枚举。

2. 在 docs/PROTOCOL_AUDIT.md 输出一份对齐审计报告，结构如下：

   ## 1. 信封字段对齐
   - 表格列：字段名 / 前端类型 / 后端类型 / 是否一致 / 备注。

   ## 2. 入站消息类型对齐（C→S）
   - 表格列：消息类型字符串 t / 前端 payload 接口 / 后端 payload model / 字段差异 / 是否一致。
   - 必须覆盖：conn.auth、conn.ping、room.create、room.join、room.leave、room.select_faction、room.ready、action.speak、action.private、action.treaty、action.military、action.intel、action.lock、reconnect.request。

   ## 3. 出站消息类型对齐（S→C）
   - 表格列：消息类型字符串 t / 前端 payload 接口 / 后端 payload model / 字段差异 / 是否一致。
   - 必须覆盖：conn.auth.ok、conn.auth.fail、conn.pong、conn.kick、room.created、room.joined、room.player_join、room.player_leave、room.start、phase.change、turn.begin、action.broadcast、action.private、action.rejected、resolve.events、resolve.map_diff、resolve.stats_diff、ai.thinking、ai.speak、ai.reaction、reconnect.catchup、reconnect.snapshot、error.message。

   ## 4. 枚举字面量对齐
   - FactionId 八个：ironCrown / starlight / emerald / ashen / voidChurch / aurora / magma / darkTide。
   - GamePhase 四个：observe / action / resolve / arbitrate。
   - ArbitratePhase 三个：battle / epic / summary。
   - TreatyKind 四个：non_aggression / trade / alliance / ceasefire。
   - EventPriority 三个：P0 / P1 / P2。
   - EventKind 全集（13 项）。
   - RelationshipStatus 五个：hostile / wary / neutral / friendly / allied。

   ## 5. 差异清单
   - 列出每一处不一致：文件名 + 行号（可估算）+ 前端值 + 后端值 + 推荐修复方向（前端跟后端 / 后端跟前端 / 双方都改）。
   - 推荐方向原则：以后端 domain 层枚举为准；前端 mock/types.ts 与 protocol/types.ts 必要时跟进。如果差异由前端历史命名导致，且改前端成本低，则改前端。

   ## 6. 修复 PR 摘要（待执行）
   - 列出本任务实际修改的文件清单。

3. 实际修复差异：
   - 对每条差异，按推荐方向修改最小范围代码。
   - 修改后端：调整 app/protocol/*.py 或 app/domain/enums.py 字面量，并同步更新对应测试。
   - 修改前端：调整 src/protocol/types.ts 或 src/mock/types.ts 字面量，并同步更新对应消费方（如 adapter、dispatcher）。
   - 严禁在业务 service / UI 组件内绕过协议层做兼容（不要写"如果是旧字段名就转一下"的兼容代码）。

4. 验证：
   - 后端 `pytest -q app/tests/test_protocol.py` 通过。
   - 后端 `ruff check app/protocol app/domain` 通过。
   - 前端 `npx tsc --noEmit` 通过。
   - 前端 `npm run build` 通过。
   - 不要启动 uvicorn / npm run dev。

【禁止做的事】
- 不要为兼容差异在 service / store / UI 内写"双字段名"兼容代码。
- 不要新增协议字段（除非两端都明显缺少且联调必需）。
- 不要删除已有消息类型。
- 不要改动业务 service / repository / domain 业务字段语义。
- 不要启动 uvicorn / npm dev。
- 不要在审计文档中给出"无差异"以避免修复（必须如实列出哪怕是命名风格的微差）。
- 不要把 audit 文档写成 LLM 风格的鼓励性总结，必须是表格 + 差异清单。
- 不要在本任务中改 transport.ts 真实 WebSocket 实现（任务 3 负责）。

【验收标准】
1. docs/PROTOCOL_AUDIT.md 含 6 节，全部表格化。
2. 14 种入站 + 21 种出站消息类型全部列出。
3. 枚举对齐覆盖 FactionId / GamePhase / ArbitratePhase / TreatyKind / EventPriority / EventKind / RelationshipStatus。
4. 差异清单含文件 + 推荐修复方向。
5. 实际差异已按推荐方向修复，且修改文件列在 §6。
6. 后端 pytest 通过。
7. 后端 ruff 通过。
8. 前端 tsc --noEmit 通过。
9. 前端 npm run build 通过。
10. 未启动 uvicorn / npm dev。

请按以上规范完成本任务。完成后输出：
（1）audit 报告路径；
（2）差异数量统计；
（3）修复文件清单；
（4）验证命令输出摘要。
```

### 预期产物

- `docs/PROTOCOL_AUDIT.md`（六节审计报告 + 差异清单 + 修复摘要）。
- 同步修复的前后端协议文件（数量取决于实际差异）。
- 通过的 pytest + tsc 验证证据。

### 验收标准

1. 审计报告 6 节齐全。
2. 14 入站 + 21 出站消息类型表格化对齐。
3. 7 个枚举对齐。
4. 差异清单含推荐修复方向。
5. 已实际修复差异。
6. 后端 pytest 通过。
7. 后端 ruff 通过。
8. 前端 tsc --noEmit 通过。
9. 前端 npm run build 通过。
10. 未启动服务器。

### 禁止事项

- 禁止在 service / store / UI 内写兼容代码。
- 禁止新增 / 删除消息类型。
- 禁止改业务字段语义。
- 禁止启动服务器。
- 禁止用"无差异"敷衍。
- 禁止鼓励性总结。
- 禁止在本任务实现 WebSocketTransport。

---

## 任务 2：后端联调启动配置（CORS、环境变量、dev 启动脚本）

### 使用场景

协议对齐通过后，需要让后端真正接受来自前端 `http://localhost:5173` 的 WebSocket 连接：CORS、跨源、环境变量、健康检查、启动脚本。本任务允许启动 uvicorn 一次用于验证连通性，验证完成后退出。

### 可直接复制给 AI 编程工具的完整提示词

```
你是一名资深后端联调环境工程师。请为《外交风云》—— 人机混战 AI Diplomacy 后端配置联调期启动环境：CORS、环境变量、dev 启动脚本与健康检查路径。

【项目背景】
后端已实现 app/main.py + REST + WebSocket gateway，但默认未配置跨源策略。前端开发服务器为 Vite 的 http://localhost:5173，需要在 dev 环境允许其访问 ws://localhost:8000/ws 与 http://localhost:8000/debug/v1。

【联调期全局红线（强制遵守）】
1. 当前阶段是前后端联调，前端代码与后端代码均已大体写完。
2. 不要重写已有 UI、store、service、repository、domain 业务逻辑。
3. 允许启动 uvicorn 与 npm run dev（仅本机联调），但不要部署到任何远程环境。
4. 不要连接真实数据库、不要启动 Docker。
5. 不要调用真实 LLM，保持 LLM_PROVIDER=mock。
6. 行动期不调用 LLM 仍是架构红线；任何联调改动不得破坏这条边界。
7. 协议字段名前后端必须严格一致；如发现差异，前后端必须同步修复。
8. MVP 阶段不在联调中重点实现 prompt injection 防护、复杂鉴权、token 校验、限流策略升级。
9. 联调中如出现 bug，必须先分诊，再修最小范围。
10. 不要把联调代码当成生产部署方案。

【技术栈】
Python 3.11+ + FastAPI + uvicorn[standard]。CORS 使用 FastAPI 自带 starlette.middleware.cors.CORSMiddleware。

【本任务允许做以下事情】

1. 修改 app/main.py：
   - 引入 CORSMiddleware。
   - 仅在 settings.env == "dev" 时挂载 CORS，允许来源：
     - http://localhost:5173
     - http://127.0.0.1:5173
     - 通过 env 变量 EXTRA_CORS_ORIGINS（逗号分隔）追加自定义来源。
   - allow_credentials=True，allow_methods=["*"]，allow_headers=["*"]。
   - WebSocket 端点的跨源由 FastAPI 默认放行（不在 middleware 中拒绝 ws upgrade），但仍记录 Origin header 到日志中以便排查。
   - 不要在 prod 环境放开 allow_origins=["*"]。

2. 更新 app/core/config.py：
   - 增加字段 cors_extra_origins: str = ""（逗号分隔）。
   - 提供 helper allowed_cors_origins() -> list[str] 返回固定本机来源 + EXTRA_CORS_ORIGINS 解析结果。
   - 增加字段 ws_path: str = "/ws"、rest_prefix: str = "/debug/v1"，便于前端引用。
   - 提供 GET /debug/v1/runtime/config 返回 { ws_path, rest_prefix, env, llm_provider, server_time_ms }（仅 dev 环境暴露），供前端联调启动时握手验证。

3. 在 app/api/rest/health.py 补充：
   - GET /healthz 已有，扩展返回 { status, service, env, ws_path, llm_provider, version }。
   - GET /readyz 已有，扩展校验 repositories 工厂可用、Mock LLM 可调用一次 dry-run（仅在 enable_persistence=False 时跳过 db 校验）。

4. 在 .env.example 增加：
   ```
   ENV=dev
   LOG_LEVEL=INFO
   LLM_PROVIDER=mock
   ENABLE_PERSISTENCE=false
   EXTRA_CORS_ORIGINS=
   HOST=127.0.0.1
   PORT=8000
   WS_PATH=/ws
   REST_PREFIX=/debug/v1
   ```

5. 新增 scripts/backend-dev.{sh,ps1} 启动脚本（同时提供 bash 与 PowerShell 两版）：
   - 读取 .env。
   - 执行 `uvicorn app.main:app --host $HOST --port $PORT --reload --log-level info`。
   - 脚本开头打印 "Starting Diplomacy backend in dev mode (CORS allows http://localhost:5173)".
   - README 中说明：联调时执行 `bash scripts/backend-dev.sh` 或 `./scripts/backend-dev.ps1`，按 Ctrl-C 退出。

6. 在 README.md 增加一节"联调启动"，包含：
   - 后端启动命令。
   - 健康检查 URL：http://localhost:8000/healthz、/readyz、/debug/v1/runtime/config。
   - 强调"仅本机联调使用，未做鉴权、未做 TLS、未连接数据库"。
   - 强调"行动期不调用 LLM"。

7. 验证（允许启动 uvicorn 一次进行连通性确认，随后退出）：
   - 启动 uvicorn 后：
     - curl http://127.0.0.1:8000/healthz 返回 200 且 status=ok。
     - curl http://127.0.0.1:8000/debug/v1/runtime/config 返回 200 且字段齐全。
     - curl -i -H "Origin: http://localhost:5173" http://127.0.0.1:8000/healthz 响应头含 access-control-allow-origin。
   - 验证完成后 Ctrl-C 关闭进程。
   - pytest -q app/tests/test_health.py 通过。
   - ruff check app 通过。

【禁止做的事】
- 不要在 prod 环境放开 CORS 通配符。
- 不要新增鉴权 / JWT / 用户系统（MVP 不重点）。
- 不要把启动脚本部署到 systemd / Docker。
- 不要把 uvicorn --workers 调到多进程（联调单进程即可）。
- 不要在 startup 事件中预热真实 LLM。
- 不要在 startup 事件中尝试连接 PostgreSQL / Redis。
- 不要把 .env 提交到仓库（只更新 .env.example）。
- 不要在 health 接口里暴露 secret / api key。

【验收标准】
1. dev 环境 CORS 仅放行本机 + 配置的额外来源。
2. /healthz 与 /readyz 扩展字段齐全。
3. /debug/v1/runtime/config 返回 ws_path、rest_prefix、env、llm_provider、server_time_ms。
4. .env.example 字段齐全。
5. scripts/backend-dev.sh 与 .ps1 存在并可运行。
6. README 联调启动一节完整。
7. 启动 uvicorn 后 curl 三个端点全部通过。
8. CORS preflight 响应正确。
9. pytest 通过、ruff 通过。
10. 验证完成已退出进程；prod 配置不被影响。

请按以上规范完成本任务。完成后输出：
（1）启动脚本路径；
（2）curl 验证输出摘要；
（3）确认进程已退出；
（4）确认 LLM_PROVIDER=mock；
（5）确认未连接数据库。
```

### 预期产物

- `app/main.py`（CORS 中间件，仅 dev 启用）。
- `app/core/config.py`（cors_extra_origins、ws_path、rest_prefix、allowed_cors_origins helper）。
- `app/api/rest/health.py`（扩展 healthz/readyz 字段）。
- `app/api/rest/debug.py`（新增 GET /debug/v1/runtime/config）。
- `.env.example`（dev 环境变量）。
- `scripts/backend-dev.sh`、`scripts/backend-dev.ps1`。
- `README.md` 联调启动节。

### 验收标准

1. CORS 仅 dev 启用。
2. health 字段齐全。
3. runtime/config 字段齐全。
4. .env.example 齐全。
5. 启动脚本存在。
6. README 联调节完整。
7. curl 三端点通过。
8. CORS preflight 正确。
9. pytest + ruff 通过。
10. 验证后进程退出。

### 禁止事项

- 禁止 prod 通配符 CORS。
- 禁止新增鉴权。
- 禁止部署 / Docker。
- 禁止多 workers。
- 禁止预热真实 LLM。
- 禁止尝试连数据库。
- 禁止提交 .env。
- 禁止暴露 secret。

---

## 任务 3：前端 WebSocketTransport 实现（替换 MockTransport）

### 使用场景

前端 `src/protocol/transport.ts` 当前是 MockTransport。本任务实现真实 `WebSocketTransport`，复用同一 `Transport` 接口，让 `adapter.ts` / `dispatcher.ts` / `gameStore` / UI 不做任何修改即可切换。必须做：连接握手、seq 维护、自动重连指数退避、心跳、连接状态事件、消息缓冲、断线时缓存待发送队列。

### 可直接复制给 AI 编程工具的完整提示词

```
你是一名资深前端实时通信工程师。请为《外交风云》—— 人机混战 AI Diplomacy 前端实现 WebSocketTransport，替换原 MockTransport，但保留 MockTransport 以备调试。

【项目背景】
前端协议层位于 src/protocol/{types,transport,adapter,dispatcher}.ts。Transport 接口已定义。MockTransport 已工作，能驱动完整 mock 体验。本任务实现 WebSocketTransport，接口签名与 MockTransport 完全一致，使 GamePage 装配处只需一行切换。

【联调期全局红线（强制遵守）】
1. 当前阶段是前后端联调，前端代码与后端代码均已大体写完。
2. 不要重写已有 UI、store、service、repository、domain 业务逻辑。
3. 允许启动 uvicorn 与 npm run dev（仅本机联调），但不要部署到任何远程环境。
4. 不要连接真实数据库、不要启动 Docker。
5. 不要调用真实 LLM，保持 LLM_PROVIDER=mock。
6. 行动期不调用 LLM 仍是架构红线；任何联调改动不得破坏这条边界。
7. 协议字段名前后端必须严格一致；如发现差异，前后端必须同步修复。
8. MVP 阶段不在联调中重点实现 prompt injection 防护、复杂鉴权、token 校验、限流策略升级。
9. 联调中如出现 bug，必须先分诊，再修最小范围。
10. 不要把联调代码当成生产部署方案。

【技术栈】
TypeScript 严格模式 + 浏览器原生 WebSocket。本任务不引入 socket.io / reconnecting-websocket / ws 等第三方库；保持 src/protocol 零运行依赖。

【本任务允许做以下事情】

1. 在 src/protocol/transport.ts 中保留现有 MockTransport，新增 WebSocketTransport 实现：
   - 构造参数：
     - url: string（例如 ws://localhost:8000/ws）。
     - token?: string（MVP 占位，附加到 query 或 conn.auth payload）。
     - clientVersion: string（来自 package.json 或编译期常量）。
     - reconnect?: { enabled: boolean; baseDelayMs: number; maxDelayMs: number; maxAttempts: number }，默认 { true, 1000, 30000, Infinity }。
     - heartbeatIntervalMs?: number，默认 15000。
     - onStatusChange?: (status: TransportStatus) => void。
   - TransportStatus 类型：'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed' | 'error'。
   - 必须实现 Transport 接口：connect / disconnect / send / on / off（与 MockTransport 等价签名）。
   - 内部维护 outboundSeq（玩家发送的 envelope 自增 id 编号占位）与 lastInboundSeq（最近接收到的服务端 seq，断线重连用）。

2. 连接生命周期：
   - connect()：
     - 创建 WebSocket(url + 可选 ?token=...)。
     - onopen：发送 conn.auth 信封（payload: { token, client_version }），触发 status='open'。
     - onmessage：JSON.parse → 校验信封最小字段（v, id, t, ts）→ 若 incoming.seq 存在则更新 lastInboundSeq → 调 handler 链。
     - onerror：触发 status='error'。
     - onclose：若 reconnect.enabled 且未到 maxAttempts，进入 reconnecting；否则 status='closed'。
   - 心跳：每 heartbeatIntervalMs 发送 conn.ping；2 倍周期内未收到 conn.pong 视为断线，主动 close 触发 reconnect。
   - 自动重连：指数退避 baseDelayMs * 2^attempt，clamp 至 maxDelayMs；attempt 计数在成功连接后重置。
   - 重连成功后：
     - 若 lastInboundSeq > 0：发送 reconnect.request 信封（payload: { room_id?, player_id?, last_seq, session_token? }，由 adapter / store 提供 room_id 与 player_id 通过 setReconnectContext 注入）。
     - 否则按普通新连接走 conn.auth。

3. 发送队列：
   - send(envelope) 时若 status !== 'open'：放入 outboundQueue（FIFO，最大长度 200，超出丢弃最早，并 onStatusChange 抛出 warning）。
   - status 变为 'open' 后立即 flush 队列。
   - 每次 send 时若 envelope.id 缺失，自动用 outboundSeq 生成 msg_<base36>。
   - 每次 send 时若 envelope.ts 缺失，自动填充 Date.now()。

4. 提供工具方法：
   - setReconnectContext({ roomId, playerId, sessionToken? })：供 GamePage 装配后调用。
   - getStatus()：返回当前 TransportStatus。
   - getLastInboundSeq()。
   - getQueueDepth()。

5. 修改 src/protocol/transport.ts 顶部 export：
   - 导出 MockTransport 与 WebSocketTransport 两个类。
   - 导出 createTransport(config: TransportConfig)：根据 config.kind ('mock' | 'ws') 返回对应实现，参数集中归口。

6. 在 src/protocol/transport.ts 同模块定义 TransportConfig：
   - kind: 'mock' | 'ws'。
   - ws?: { url; token?; clientVersion; reconnect?; heartbeatIntervalMs? }。
   - mock?: { latencyMs?: number }。

7. 在 src/protocol/__tests__/transport.test.ts（若已有测试目录则放入，否则新建）：
   - 使用 vitest（项目已有 vite，请 ensure vitest 在 devDependencies；若无则改为 jest 风格，最少需要 happy-dom + ws 模拟）。
   - 模拟 WebSocket（用 fake-socket 或手写 mock），覆盖以下用例：
     - connect → 自动发送 conn.auth。
     - 收到带 seq 的消息后 lastInboundSeq 更新。
     - send 在 status='connecting' 时进入队列。
     - status 变 open 后队列 flush。
     - 模拟 close → reconnect 计数与延迟符合指数退避。
     - 心跳超时触发 close + reconnect。
     - setReconnectContext 后重连发送 reconnect.request。

8. 不修改 adapter.ts / dispatcher.ts / store / UI / 组件实现。

9. 不在本任务中切换 GamePage 默认 transport（任务 4 负责切换开关）。

【禁止做的事】
- 不要引入 socket.io / reconnecting-websocket / ws / @microsoft/signalr 等库。
- 不要改 adapter.ts、dispatcher.ts、gameStore.ts、uiStore.ts、任何 UI 组件。
- 不要在 transport 内做业务字段映射（adapter 层负责）。
- 不要在 transport 内实现 rate limit / debounce 玩家输入（CommandTerminal 已处理）。
- 不要把 token 写死。
- 不要在 reconnect 时丢失 outboundQueue 中已排队的 envelope。
- 不要让 disconnect() 之后还自动 reconnect（用户显式 disconnect 必须停止 reconnect 循环）。
- 不要在 onmessage 中直接调用 store action（仍走 adapter）。
- 不要打印 token 到 console。

【验收标准】
1. WebSocketTransport 与 MockTransport 接口签名一致。
2. createTransport 工厂可用，按 kind 切换。
3. 连接握手发送 conn.auth。
4. 心跳 15s 一次 conn.ping。
5. 心跳超时触发 reconnect。
6. reconnect 指数退避 + maxDelayMs clamp。
7. send 在 connecting 状态进入队列，open 后 flush。
8. setReconnectContext 后重连发送 reconnect.request 含 last_seq。
9. transport.test.ts 全部通过。
10. 不修改 adapter / dispatcher / store / UI。

请按以上规范完成本任务。完成后输出：
（1）新增 / 修改文件清单；
（2）transport.test.ts 通过证据；
（3）确认未改 adapter / store / UI；
（4）未在本任务切换 GamePage 默认 transport。
```

### 预期产物

- `src/protocol/transport.ts`（保留 MockTransport + 新增 WebSocketTransport + TransportConfig + createTransport）。
- `src/protocol/__tests__/transport.test.ts`（vitest 用例）。
- 必要的 devDependencies 调整（vitest / happy-dom / 手写 WebSocket mock）。

### 验收标准

1. 双 transport 接口一致。
2. createTransport 工厂可用。
3. 握手发送 conn.auth。
4. 心跳 15s。
5. 心跳超时 reconnect。
6. 指数退避 + clamp。
7. 队列 flush。
8. 重连发 reconnect.request 含 last_seq。
9. 测试通过。
10. 不动 adapter / store / UI。

### 禁止事项

- 禁止第三方 ws 库。
- 禁止改 adapter / store / UI。
- 禁止在 transport 做业务映射。
- 禁止 transport 内 rate limit。
- 禁止 token 写死。
- 禁止 reconnect 丢队列。
- 禁止 disconnect 后仍自动 reconnect。
- 禁止 onmessage 直接调 store。
- 禁止打印 token。

---

## 任务 4：前端 USE_WS 切换开关 + 连接状态 UI

### 使用场景

WebSocketTransport 就绪后，需要在 GamePage 装配处提供一个可切换的开关：默认仍走 mock，开启环境变量后切到 WS。同时需要一个轻量连接状态 UI，让玩家在 HUD 角落看到 connecting / open / reconnecting / closed 状态。本任务允许触碰 GamePage 装配代码与 uiStore 一个新字段。

### 可直接复制给 AI 编程工具的完整提示词

```
你是一名资深前端联调集成工程师。请为《外交风云》—— 人机混战 AI Diplomacy 前端在 GamePage 中接入 WebSocketTransport 切换开关，并新增连接状态 HUD 角标。

【项目背景】
前端 GamePage 当前在挂载时构造 MockTransport 并 attachAdapter。本任务接入新的 WebSocketTransport（任务 3 已实现），通过环境变量切换；同时新增连接状态 HUD 角标，让玩家与开发者看到 transport 状态。

【联调期全局红线（强制遵守）】
1. 当前阶段是前后端联调，前端代码与后端代码均已大体写完。
2. 不要重写已有 UI、store、service、repository、domain 业务逻辑。
3. 允许启动 uvicorn 与 npm run dev（仅本机联调），但不要部署到任何远程环境。
4. 不要连接真实数据库、不要启动 Docker。
5. 不要调用真实 LLM，保持 LLM_PROVIDER=mock。
6. 行动期不调用 LLM 仍是架构红线；任何联调改动不得破坏这条边界。
7. 协议字段名前后端必须严格一致；如发现差异，前后端必须同步修复。
8. MVP 阶段不在联调中重点实现 prompt injection 防护、复杂鉴权、token 校验、限流策略升级。
9. 联调中如出现 bug，必须先分诊，再修最小范围。
10. 不要把联调代码当成生产部署方案。

【技术栈】
React 19 + TypeScript 严格模式 + Vite + Tailwind + Zustand + Framer Motion。

【本任务允许做以下事情】

1. 新增环境变量：
   - 在 .env.development 与 .env.example 中加入：
     ```
     VITE_USE_WS=false
     VITE_WS_URL=ws://localhost:8000/ws
     VITE_WS_TOKEN=dev-mock-token
     VITE_BACKEND_REST_BASE=http://localhost:8000/debug/v1
     VITE_HEARTBEAT_MS=15000
     ```
   - 在 src/app/env.ts（新建）集中读取并 export typed config：
     ```
     export const ENV = {
       useWs: import.meta.env.VITE_USE_WS === 'true',
       wsUrl: import.meta.env.VITE_WS_URL ?? 'ws://localhost:8000/ws',
       wsToken: import.meta.env.VITE_WS_TOKEN ?? '',
       backendRestBase: import.meta.env.VITE_BACKEND_REST_BASE ?? 'http://localhost:8000/debug/v1',
       heartbeatMs: Number(import.meta.env.VITE_HEARTBEAT_MS ?? 15000),
       clientVersion: import.meta.env.VITE_APP_VERSION ?? '0.0.0-dev',
     } as const;
     ```

2. 修改 src/pages/GamePage.tsx 的 transport 装配处：
   - 通过 createTransport 工厂构造 transport，根据 ENV.useWs 选择 kind。
   - attachAdapter(transport, gameStore) 不变。
   - ActionDispatcher.setTransport(transport) 不变。
   - 在 transport 上挂 onStatusChange → uiStore.setConnectionStatus(status)。
   - 卸载时调用 transport.disconnect()。
   - 不在本任务里修改 gameLoop / aiResponder（如果它们因为前端原本 mock 体验存在，请保留但仅在 ENV.useWs=false 时启动）。

3. 在 src/store/uiStore.ts 新增字段（仅这一处 store 修改）：
   - connectionStatus: TransportStatus（默认 'idle'）。
   - setConnectionStatus(status: TransportStatus)。
   - 不修改其它字段。

4. 新增组件 src/components/ConnectionBadge.tsx：
   - 显示当前 connectionStatus，配色：
     - idle：暗灰。
     - connecting：青色脉冲。
     - open：绿色（淡）。
     - reconnecting：橙色脉冲。
     - closed：暗红。
     - error：红色 + 抖动。
   - 用 GlowPanel + 4px 圆点 + 状态文字（不强抢视觉焦点，整体尺寸 ≤ 120x28）。
   - 挂载位置：TopBar 右侧，位于设置按钮左侧。
   - hover 显示 tooltip：当前 lastInboundSeq / queueDepth / wsUrl（仅 dev 环境暴露）。
   - 不实现复杂 modal、不接入 reconnect 控制按钮（本任务不暴露手动重连按钮，自动重连即可）。

5. 修改 src/features/hud/TopBar.tsx：
   - 仅插入 <ConnectionBadge /> 到设置按钮左侧。
   - 不改其它布局 / 字体 / 颜色。

6. 在 README.md 联调启动节追加：
   - 前端启动命令：`npm run dev`。
   - 切到真实 WS：`VITE_USE_WS=true npm run dev`。
   - 强调"默认仍 mock，不影响纯前端调试"。

7. 验证：
   - tsc --noEmit 通过。
   - npm run build 通过。
   - 启动 npm run dev（仅一次）+ 后端任务 2 启动脚本，浏览器打开 http://localhost:5173/game：
     - 默认 VITE_USE_WS=false：仍 mock 体验，ConnectionBadge 显示 idle。
     - 设置 VITE_USE_WS=true 重启：ConnectionBadge 在握手后显示 open。
     - 故意停掉后端：ConnectionBadge 进入 reconnecting，重启后端后回 open。
   - 验证完成关闭 npm dev / uvicorn。

【禁止做的事】
- 不要改其它 UI 组件、其它 store 字段、其它 features 模块。
- 不要把 ConnectionBadge 做成 modal 或干扰主 HUD 视觉。
- 不要新增手动重连按钮（自动即可）。
- 不要把 token 渲染到可视 DOM（仅 tooltip 在 dev 环境暴露）。
- 不要在 ENV.useWs=true 时仍启动前端 mock gameLoop（避免双源数据冲突）。
- 不要破坏 mock 体验（VITE_USE_WS=false 时一切照旧）。
- 不要把 ENV.wsToken 写进 commit 历史。
- 不要在 ConnectionBadge 内调用 transport 实例（仅订阅 uiStore.connectionStatus）。

【验收标准】
1. .env.example / .env.development 配置完整。
2. src/app/env.ts 集中读取。
3. GamePage 通过 createTransport 装配，按 ENV.useWs 切换。
4. uiStore 新增 connectionStatus + setter（且只新增此字段）。
5. ConnectionBadge 五状态视觉差异化。
6. TopBar 右侧挂载 Badge，不破坏布局。
7. mock 体验默认行为不变。
8. WS 模式握手后 Badge=open；后端停掉 → reconnecting；后端重启 → open。
9. tsc --noEmit + npm run build 通过。
10. 不修改 features / 其它 store 字段 / 其它 UI 组件。

请按以上规范完成本任务。完成后输出：
（1）env / 装配 / Badge 文件清单；
（2）双模式验证截图思路；
（3）确认 ENV.useWs=false 时仍 mock；
（4）确认未改其它 store 字段。
```

### 预期产物

- `.env.development`、`.env.example`、`src/app/env.ts`。
- `src/pages/GamePage.tsx` 装配处更新。
- `src/store/uiStore.ts` 新增 connectionStatus 字段。
- `src/components/ConnectionBadge.tsx`。
- `src/features/hud/TopBar.tsx` 插入 Badge。
- `README.md` 联调启动节追加前端命令。

### 验收标准

1. env 配置完整。
2. env.ts 集中读取。
3. GamePage 工厂切换。
4. uiStore 仅新增 connectionStatus。
5. Badge 五状态。
6. TopBar 挂载。
7. mock 默认不变。
8. WS 模式握手 open / 断后 reconnecting / 重启 open。
9. tsc + build 通过。
10. 不动 features / 其它 store / 其它 UI。

### 禁止事项

- 禁止改其它 UI 组件 / store 字段。
- 禁止 Badge modal 干扰主 HUD。
- 禁止手动重连按钮。
- 禁止 token 渲染到可视 DOM。
- 禁止 WS 模式仍启动 mock gameLoop。
- 禁止破坏 mock 体验。
- 禁止 token commit。
- 禁止 Badge 内调 transport。

---

## 任务 5：双端联调启动脚本与健康冒烟脚本

### 使用场景

前后端启动命令已就绪，但需要一个一键启动 + 一键冒烟的开发体验：同时启动后端 + 前端、等待 readyz 通过、跑一次冒烟请求验证协议握手成功。本任务允许启动服务，但脚本必须支持优雅退出。

### 可直接复制给 AI 编程工具的完整提示词

```
你是一名资深开发体验工程师。请为《外交风云》—— 人机混战 AI Diplomacy 项目提供本机联调一键启动脚本与最小冒烟测试脚本。

【项目背景】
后端已有 scripts/backend-dev.sh / .ps1，前端已有 npm run dev。本任务整合两者，提供 scripts/dev-up.sh / .ps1 同时拉起后端 + 前端，并提供 scripts/integration-smoke.py 走通一次最小协议握手：创建房间 → 选择势力 → 提交一条 speech → 等待 action.broadcast → 推进 phase → 跑结算 → 校验 resolve.events。

【联调期全局红线（强制遵守）】
1. 当前阶段是前后端联调，前端代码与后端代码均已大体写完。
2. 不要重写已有 UI、store、service、repository、domain 业务逻辑。
3. 允许启动 uvicorn 与 npm run dev（仅本机联调），但不要部署到任何远程环境。
4. 不要连接真实数据库、不要启动 Docker。
5. 不要调用真实 LLM，保持 LLM_PROVIDER=mock。
6. 行动期不调用 LLM 仍是架构红线；任何联调改动不得破坏这条边界。
7. 协议字段名前后端必须严格一致；如发现差异，前后端必须同步修复。
8. MVP 阶段不在联调中重点实现 prompt injection 防护、复杂鉴权、token 校验、限流策略升级。
9. 联调中如出现 bug，必须先分诊，再修最小范围。
10. 不要把联调代码当成生产部署方案。

【技术栈】
- 启动脚本：bash + PowerShell。
- 冒烟脚本：Python 3.11 标准库 + websockets（已在后端开发依赖）；若不便引入 websockets，可改用 httpx + REST debug 接口走完同一流程。

【本任务允许做以下事情】

1. 新增 scripts/dev-up.sh（bash 版）：
   - 设置 trap，Ctrl-C 时优雅停掉前后端子进程。
   - 启动 uvicorn 后台（uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload &），记录 PID。
   - 轮询 GET http://127.0.0.1:8000/readyz，每 0.5s 一次，超时 20s。
   - 后端 ready 后启动 npm run dev --host=127.0.0.1（默认 5173）后台，记录 PID。
   - 打印两条访问 URL。
   - wait 阻塞直到 Ctrl-C。

2. 新增 scripts/dev-up.ps1（PowerShell 版）：
   - 用 Start-Job 启动 uvicorn 与 npm dev。
   - 用 Invoke-WebRequest 轮询 readyz。
   - 注册 finally 块在脚本退出时 Stop-Job 关闭子作业。

3. 新增 scripts/integration-smoke.py：
   - 通过 httpx + websockets 走完最小路径：
     1. GET http://127.0.0.1:8000/healthz：状态 200。
     2. POST /debug/v1/rooms 创建 solo 房间。
     3. POST /debug/v1/rooms/{room_id}/select-faction 选 ironCrown。
     4. POST /debug/v1/rooms/{room_id}/ready ready=true。
     5. POST /debug/v1/rooms/{room_id}/start 启动游戏（status=running）。
     6. POST /debug/v1/rooms/{room_id}/phase/advance：跳过 observe，进入 action。
     7. POST /debug/v1/rooms/{room_id}/actions/speak 发一条 speech。
     8. GET /debug/v1/rooms/{room_id}/events 校验返回含 speech / phase_change。
     9. POST /debug/v1/rooms/{room_id}/actions/lock + phase/advance：进入 resolve。
     10. POST /debug/v1/rooms/{room_id}/settlement/run：返回 SettlementOutboundBundle，校验 resolve_events / map_diff / stats_diff 字段齐全。
   - 同时尝试 WebSocket 连接 ws://127.0.0.1:8000/ws：
     - 发送 conn.auth 信封，期待 conn.auth.ok。
     - 发送 conn.ping，期待 conn.pong。
     - 关闭。
   - 任一步骤失败时退出码 1，打印失败步骤名 + 后端返回 body。
   - 所有步骤通过时退出码 0，打印 "INTEGRATION SMOKE PASSED" + 单次结算 LLM provider="mock" 确认。

4. 在 README.md 联调启动节追加：
   - bash 用户：`bash scripts/dev-up.sh`，Ctrl-C 退出。
   - PowerShell 用户：`./scripts/dev-up.ps1`。
   - 冒烟脚本：`python scripts/integration-smoke.py`（要求后端已启动）。
   - 标注"冒烟脚本只在本机联调时使用，未做并发 / 鉴权 / 多房间压测"。

5. 验证（允许启动一次完整链路）：
   - 跑 scripts/dev-up.sh → 看到后端 readyz + 前端 5173 都通。
   - 浏览器打开 http://localhost:5173，VITE_USE_WS=false 模式仍能正常进入。
   - 设置 VITE_USE_WS=true 重启前端，ConnectionBadge 显示 open。
   - 跑 python scripts/integration-smoke.py，退出码 0。
   - Ctrl-C 退出 dev-up，确认两个子进程都被关闭。

【禁止做的事】
- 不要把脚本写成持久 daemon / systemd unit。
- 不要在 dev-up 中尝试启动 Docker / 数据库。
- 不要在 smoke 脚本里 sleep 过长（每段 ≤ 10s，整体 ≤ 60s）。
- 不要在 smoke 脚本里跨越行动期红线（绝不在 action 期触发 settlement_service.run_turn_settlement，必须先推进到 resolve）。
- 不要修改 service / store / UI / 设计系统组件。
- 不要把脚本提交时带 absolute 个人路径（必须相对仓库根）。
- 不要在 smoke 脚本中真实调用 LLM。
- 不要在脚本里硬编码 token 之外的 secret。

【验收标准】
1. scripts/dev-up.sh 与 .ps1 都存在。
2. dev-up 启动顺序：后端 → readyz → 前端。
3. Ctrl-C 优雅关闭两个子进程。
4. scripts/integration-smoke.py 覆盖 healthz / REST 流程 / WebSocket 握手 / settlement。
5. smoke 退出码 0 时打印"INTEGRATION SMOKE PASSED"与 llm_provider=mock。
6. smoke 任一步骤失败明确打印步骤名 + body。
7. README 联调启动节命令完整。
8. dev-up 与 smoke 在本机一次跑通。
9. 不连数据库 / 不启动 Docker。
10. 不破坏行动期红线。

请按以上规范完成本任务。完成后输出：
（1）脚本路径；
（2）smoke 通过证据；
（3）确认 LLM provider=mock；
（4）Ctrl-C 后子进程已退出。
```

### 预期产物

- `scripts/dev-up.sh`、`scripts/dev-up.ps1`。
- `scripts/integration-smoke.py`。
- `README.md` 联调启动节追加。

### 验收标准

1. 双脚本存在。
2. 启动顺序正确。
3. Ctrl-C 优雅退出。
4. smoke 覆盖 REST + WS + settlement。
5. smoke 通过打印明确信息。
6. 失败打印步骤名 + body。
7. README 命令完整。
8. 本机跑通。
9. 不连 DB / 不启 Docker。
10. 不破坏行动期红线。

### 禁止事项

- 禁止持久 daemon / systemd。
- 禁止启动 Docker / DB。
- 禁止 smoke sleep 过长。
- 禁止跨越行动期红线。
- 禁止改业务代码。
- 禁止硬编码绝对路径。
- 禁止真实调用 LLM。
- 禁止硬编码额外 secret。

---

## 任务 6：端到端冒烟联调（浏览器 → 后端 → 浏览器）

### 使用场景

dev-up 与 smoke 脚本通过后，需要真实在浏览器走完整体验：进入 landing → 势力选择 → 进入游戏 → action 期输入演讲 → 看 EventStream 实时追加 → lock → 等待结算 → 看 BattleResultCard / EventStream 出现后端推送事件 → 看势力关系变化。本任务不修改任何业务代码，只在浏览器中做端到端验证 + 输出验证报告。

### 可直接复制给 AI 编程工具的完整提示词

```
你是一名资深端到端联调测试工程师。请为《外交风云》—— 人机混战 AI Diplomacy 项目执行一次完整的浏览器端到端冒烟联调，并输出验证报告。

【项目背景】
前后端协议已对齐、WebSocketTransport 已实现、dev-up 脚本可启动双端、smoke 脚本可走通最小协议。本任务进入真实浏览器，验证完整人类玩家体验在 WS 模式下不退化。

【联调期全局红线（强制遵守）】
1. 当前阶段是前后端联调，前端代码与后端代码均已大体写完。
2. 不要重写已有 UI、store、service、repository、domain 业务逻辑。
3. 允许启动 uvicorn 与 npm run dev（仅本机联调），但不要部署到任何远程环境。
4. 不要连接真实数据库、不要启动 Docker。
5. 不要调用真实 LLM，保持 LLM_PROVIDER=mock。
6. 行动期不调用 LLM 仍是架构红线；任何联调改动不得破坏这条边界。
7. 协议字段名前后端必须严格一致；如发现差异，前后端必须同步修复。
8. MVP 阶段不在联调中重点实现 prompt injection 防护、复杂鉴权、token 校验、限流策略升级。
9. 联调中如出现 bug，必须先分诊，再修最小范围。
10. 不要把联调代码当成生产部署方案。

【本任务允许做以下事情】

1. 启动联调环境：
   - 执行 scripts/dev-up.sh 或 .ps1。
   - 浏览器打开 http://localhost:5173，前端环境变量 VITE_USE_WS=true。

2. 按以下脚本走完体验，并在每步骤记录：
   - 浏览器 Network 面板看到的 WS frame（入站 + 出站 t 字段与 seq）。
   - 浏览器 Console 是否有 error / warning。
   - 后端 uvicorn 日志最后两行。

   步骤：
   1. Landing 页：点击"进入指挥系统"，跳转到 /faction-select。
   2. 势力选择：选 ironCrown，确认按钮可点击，点击进入 /game。
   3. /game 挂载时：观察 ConnectionBadge 在 1~2s 内变成 open；Network 出现 conn.auth → conn.auth.ok。
   4. 后端推送：观察首条 room.start + turn.begin + phase.change(observe)；前端 EventStream 出现 phase_change 事件。
   5. 等待 observe 期结束（15s）或手动按按钮触发 phase 推进（若 UI 提供 "进入行动" 按钮则点）。
   6. 进入 action：CommandTerminal 可输入；切换到演讲模式，输入"我提议建立北方非军事区"，回车发送。Network 出现 action.speak（出站）→ action.broadcast（入站）。
   7. 切换到密谈模式，目标 starlight，输入"和我结盟，铁冠帝国会很危险"，发送。Network 出现 action.private（出站）→ action.private 入站（仅参与方）+ meta event。
   8. 等待 action 期结束（90s）；或在 RelationsPanel 右键 ironCrown 触发 lock 后再 advance（视实现）。
   9. 进入 resolve：AIThinkingPanel 显示；后端 30s 后跑结算，前端收到 resolve.events / resolve.map_diff / resolve.stats_diff / ai.speak。
   10. EventStream 出现新事件；RelationsPanel 中至少一条关系值滑动；MapStage 出现至少一处 region 颜色脉冲（若有 region 变更）。
   11. 进入下一回合 observe；重复 1~2 个 turn。
   12. 第 3 个 turn 末进入 arbitrate.battle → epic → summary；EpochSummaryPage 浮起。
   13. 关闭浏览器、Ctrl-C 关闭 dev-up。

3. 输出 docs/INTEGRATION_SMOKE_REPORT.md：
   - 标题 + 测试日期 + 测试者占位。
   - 环境：后端 commit hash / 前端 commit hash（用 git rev-parse HEAD）。
   - 测试步骤逐条 ✅ / ⚠️ / ❌ 标记，失败步骤含截图思路 + 后端日志摘录 + 前端 Console error 摘录。
   - WS frame 序列摘要（按 t 字段统计入站 / 出站次数）。
   - 已知 issue 清单（若有），按"前端 / 后端 / 协议 / 数据"分类。
   - 不要"无 issue, 全部通过" + emoji 风总结；必须含具体观察。

4. 若发现明显 bug：
   - 在 GitHub Issues 风格的 docs/INTEGRATION_ISSUES.md 追加条目（仅追加，不修复）。
   - 条目格式：编号 + 标题 + 复现步骤 + 期望 / 实际 + 分诊倾向。
   - 修复留给任务 9。

5. 验证：
   - tsc --noEmit / npm run build / pytest -q 仍通过（确认本任务未引入代码改动）。
   - git status 应只看到 docs/INTEGRATION_SMOKE_REPORT.md 与 docs/INTEGRATION_ISSUES.md（若有）。

【禁止做的事】
- 不要在本任务修复发现的 bug（仅记录）。
- 不要修改任何 src/* 或 app/* 代码。
- 不要修改设计系统组件。
- 不要修改 service / repository。
- 不要修改 LLM provider。
- 不要在报告中省略 WS frame 序列。
- 不要用"全部通过 ✅"等模糊总结代替具体观察。
- 不要在报告里截图真实账号 / token。
- 不要把 INTEGRATION_ISSUES.md 写成无主清单（每条必须有"分诊倾向"字段）。

【验收标准】
1. dev-up 启动成功，前后端均跑通。
2. 浏览器完整走完 13 步。
3. ConnectionBadge 在 1~2s 内 open。
4. action.speak / action.private / phase.change / resolve.events / ai.speak 在 Network 面板出现。
5. EventStream / RelationsPanel / MapStage 对应后端事件给出可见反馈。
6. EpochSummaryPage 在 arbitrate.summary 浮起。
7. docs/INTEGRATION_SMOKE_REPORT.md 含逐步骤标记 + WS frame 统计 + Console / 后端日志摘录。
8. docs/INTEGRATION_ISSUES.md（若有）条目完整且含分诊倾向。
9. tsc / build / pytest 均通过（本任务未引入代码改动）。
10. git status 仅显示新增 docs 文件。

请按以上规范完成本任务。完成后输出：
（1）报告文件路径；
（2）13 步通过 / 部分通过 / 失败的统计；
（3）发现 issue 数量；
（4）确认未修改 src / app 业务代码。
```

### 预期产物

- `docs/INTEGRATION_SMOKE_REPORT.md`。
- `docs/INTEGRATION_ISSUES.md`（若发现问题）。
- 0 代码改动。

### 验收标准

1. dev-up 启动成功。
2. 浏览器走完 13 步。
3. ConnectionBadge 快速 open。
4. WS frame 类型齐全。
5. UI 反馈正确。
6. EpochSummaryPage 出现。
7. 报告完整。
8. issue 条目带分诊。
9. tsc / build / pytest 通过。
10. git status 仅 docs。

### 禁止事项

- 禁止修复 bug。
- 禁止改 src / app 代码。
- 禁止改设计系统组件。
- 禁止改 service / repo。
- 禁止改 LLM provider。
- 禁止省略 WS frame 序列。
- 禁止模糊总结。
- 禁止截图敏感信息。
- 禁止 issue 无主。

---

## 任务 7：阶段切换 + 多回合 + 结算事件渲染深度联调

### 使用场景

冒烟通过只能证明协议握手 OK。本任务深入验证多回合阶段切换是否被前端 PhaseStateMachine 正确接收：observe → action → resolve → arbitrate(battle/epic/summary) 顺序、AIThinkingPanel 进度、ResolveEventPlayer 逐条播放、PhaseTransitionOverlay 切换、Countdown 倒计时是否与后端 phase_started_at_ms / phase_duration_ms 对齐。

### 可直接复制给 AI 编程工具的完整提示词

```
你是一名资深节奏感联调工程师。请为《外交风云》—— 人机混战 AI Diplomacy 项目执行阶段切换 + 多回合 + 结算事件渲染的深度联调，并产出对齐报告。

【项目背景】
前端 PhaseStateMachine / Countdown / AIThinkingPanel / ResolveEventPlayer / PhaseTransitionOverlay 在 mock 模式下已能运转。本任务验证后端 phase.change / turn.begin / resolve.events / ai.thinking / ai.speak 推送时机能正确驱动这些组件，且时间对齐。

【联调期全局红线（强制遵守）】
1. 当前阶段是前后端联调，前端代码与后端代码均已大体写完。
2. 不要重写已有 UI、store、service、repository、domain 业务逻辑。
3. 允许启动 uvicorn 与 npm run dev（仅本机联调），但不要部署到任何远程环境。
4. 不要连接真实数据库、不要启动 Docker。
5. 不要调用真实 LLM，保持 LLM_PROVIDER=mock。
6. 行动期不调用 LLM 仍是架构红线；任何联调改动不得破坏这条边界。
7. 协议字段名前后端必须严格一致；如发现差异，前后端必须同步修复。
8. MVP 阶段不在联调中重点实现 prompt injection 防护、复杂鉴权、token 校验、限流策略升级。
9. 联调中如出现 bug，必须先分诊，再修最小范围。
10. 不要把联调代码当成生产部署方案。

【本任务允许做以下事情】

1. 启动 dev-up，浏览器进入 /game，VITE_USE_WS=true。

2. 验证项（每项需在 docs/INTEGRATION_PHASE_REPORT.md 中记录"通过 / 偏差 / 失败" + 数据）：

   2.1 阶段时长对齐
   - observe 15000ms / action 90000ms / resolve 30000ms / arbitrate.battle 20000ms / arbitrate.epic 60000ms / arbitrate.summary 15000ms。
   - 浏览器收到 phase.change 时记录 ts，下一个 phase.change 时记录差值，与上述常量对比。允许 ±500ms 抖动（uvicorn 调度 + WS 抖动）。

   2.2 Countdown 与后端时间对齐
   - 前端 Countdown 应根据 phase_started_at_ms + phase_duration_ms 计算剩余时间，而非用本地启动 setTimer。
   - 验证方式：phase.change 收到后立刻刷新页面（F5），重连成功后 Countdown 应继续显示剩余时间（而不是从头计时）。
   - 若刷新后 Countdown 重置：记录为偏差，分诊倾向"前端：未使用后端 phase_started_at_ms"。

   2.3 AIThinkingPanel 进度
   - resolve 期 AIThinkingPanel 中每个 AI 一根进度条。
   - 若后端推送 ai.thinking 事件：进度条应按事件 progress 字段更新。
   - 若后端未推送 ai.thinking：进度条由阶段时间百分比驱动（前端 fallback 行为）。
   - 记录后端实际是否推送 ai.thinking，前端 fallback 是否合理。

   2.4 ResolveEventPlayer 逐条播放
   - resolve 阶段结束后，后端推送 resolve.events 含多条事件。
   - 前端 ResolveEventPlayer 应逐条播放，6s 自动跳或用户点击下一事件。
   - 验证：当后端事件数 > 1 时前端是否真的逐条而非一次性堆叠。

   2.5 PhaseTransitionOverlay
   - 每次 phase.change 触发 0.6s 全屏过渡。
   - 高频切换（如 arbitrate.battle 20s → epic 60s → summary 15s）时是否出现叠加 / 闪烁。

   2.6 EpochSummary 浮起
   - 进入 arbitrate.summary 时 EpochSummaryPage overlay 应在 1s 内出现。
   - NextEpochButton 8s 自动倒计时是否生效。
   - 点击后是否回到 GamePage 并进入下一 epoch 的 observe。

   2.7 ai.speak / ai.reaction 时序
   - resolve 期推送的 ai.speak 应在 ResolveEventPlayer 播放间隙以 PublicSpeechBubble 出现。
   - ai.reaction 应在 MapStage 区域上方以 ReactionTag 浮出 1.5s 后消失。
   - 验证频率是否过低 / 过高。

   2.8 turn.begin 视觉
   - 每个 turn.begin 收到后，TopBar 显示新 epoch.turn，Countdown 重置为新 phase 时长。

   2.9 性能
   - 在 mapQuality=mid 下，多回合连续运行 5 分钟，FPS 监控保持 ≥ 45。
   - perfMonitor 自动降级是否被触发（若是，记录降级前 / 降级后状态）。

3. 输出 docs/INTEGRATION_PHASE_REPORT.md：
   - 表格列：验证项 / 期望 / 实测 / 偏差 / 分诊倾向。
   - 偏差超过 500ms 或视觉异常须记录截图思路 + 复现步骤。

4. 不修改任何代码，仅产出报告。
5. 在 docs/INTEGRATION_ISSUES.md 追加新发现的 issue（沿用任务 6 的格式）。

6. 验证：
   - 报告含 9 个验证项全部条目。
   - tsc / build / pytest 仍通过。
   - git status 仅 docs。

【禁止做的事】
- 不要修改 PhaseService / PhaseStateMachine 实现。
- 不要修改 Countdown 实现。
- 不要修改任何业务代码。
- 不要把"性能 ≥ 45 FPS"做成普通 console.log（必须用 perfMonitor 数据）。
- 不要为绕过偏差放宽 ±500ms 阈值。
- 不要把报告写成营销稿。
- 不要在 issue 条目中省略分诊倾向。
- 不要漏验"刷新后 Countdown 是否对齐"这一项。

【验收标准】
1. 9 个验证项全部记录。
2. 阶段时长偏差实测数据齐全。
3. 刷新后 Countdown 对齐结论明确。
4. AIThinkingPanel 进度来源明确（ai.thinking 或 fallback）。
5. ResolveEventPlayer 逐条播放验证。
6. PhaseTransitionOverlay 高频切换观察。
7. EpochSummary 浮起与 NextEpochButton 验证。
8. ai.speak / ai.reaction 时序与位置验证。
9. perfMonitor 数据记录。
10. 0 代码改动；git status 仅 docs。

请按以上规范完成本任务。完成后输出：
（1）报告路径；
（2）9 项验证统计（通过 / 偏差 / 失败）；
（3）新增 issue 数量；
（4）确认未修改业务代码。
```

### 预期产物

- `docs/INTEGRATION_PHASE_REPORT.md`。
- `docs/INTEGRATION_ISSUES.md` 追加（若有）。
- 0 代码改动。

### 验收标准

1. 9 项记录。
2. 时长数据齐全。
3. Countdown 刷新对齐结论。
4. AIThinking 来源明确。
5. Resolve 逐条验证。
6. 过渡高频观察。
7. EpochSummary 验证。
8. ai.speak / reaction 时序。
9. perfMonitor 数据。
10. 0 代码改动。

### 禁止事项

- 禁止改 PhaseService / PhaseStateMachine。
- 禁止改 Countdown。
- 禁止改业务代码。
- 禁止 console.log 代替 perfMonitor。
- 禁止放宽阈值。
- 禁止营销稿总结。
- 禁止 issue 无分诊。
- 禁止漏 Countdown 刷新对齐项。

---

## 任务 8：断线重连联调（catchup + snapshot 双路径）

### 使用场景

WebSocketTransport 已带指数退避重连，后端已实现 reconnect.request / catchup / snapshot 占位。本任务验证两条路径都能真实跑通：少量丢失 → catchup 增量补齐；大量丢失 → snapshot 全量恢复；前端 store / UI 在补齐过程中不闪烁、不重复事件、不错位 phase。

### 可直接复制给 AI 编程工具的完整提示词

```
你是一名资深断线重连联调工程师。请为《外交风云》—— 人机混战 AI Diplomacy 项目执行断线重连双路径联调（catchup + snapshot），并修复必要的小差异以保证两条路径都跑通。

【项目背景】
后端 InboundRouter 已实现 reconnect.request 处理：
- last_seq 与当前 seq 差值 ≤ 50 → 推送 reconnect.catchup（增量消息列表）。
- 差值 > 50 → 推送 reconnect.snapshot（全量快照）。
前端 WebSocketTransport 已能在重连时发 reconnect.request 含 lastInboundSeq；adapter 须能消费 catchup / snapshot 并应用到 store。本任务验证并修复双路径。

【联调期全局红线（强制遵守）】
1. 当前阶段是前后端联调，前端代码与后端代码均已大体写完。
2. 不要重写已有 UI、store、service、repository、domain 业务逻辑。
3. 允许启动 uvicorn 与 npm run dev（仅本机联调），但不要部署到任何远程环境。
4. 不要连接真实数据库、不要启动 Docker。
5. 不要调用真实 LLM，保持 LLM_PROVIDER=mock。
6. 行动期不调用 LLM 仍是架构红线；任何联调改动不得破坏这条边界。
7. 协议字段名前后端必须严格一致；如发现差异，前后端必须同步修复。
8. MVP 阶段不在联调中重点实现 prompt injection 防护、复杂鉴权、token 校验、限流策略升级。
9. 联调中如出现 bug，必须先分诊，再修最小范围。
10. 不要把联调代码当成生产部署方案。

【本任务允许做以下事情】

1. 短时断线场景（catchup）：
   - 启动 dev-up + 浏览器 WS 模式。
   - 进入 /game 后进入 action 期，发送 2 条 speech + 1 条 private。
   - 在浏览器 Application 面板将 WS 状态强制 close（或在 Network 面板停止 WS）。
   - 等待 3~5s（产生 < 50 条新事件），重新打开 WS（前端自动重连）。
   - 期望：
     - 前端发 reconnect.request 含 lastInboundSeq。
     - 后端推 reconnect.catchup 含丢失事件。
     - adapter 应用事件后 EventStream 无重复条目、无乱序、phase / countdown 不重置。
     - ConnectionBadge open。

2. 长时断线场景（snapshot）：
   - 关闭后端进程 2 分钟（>= 50 条事件期望积累的时间窗）。
   - 重新启动后端。
   - 前端自动重连后发 reconnect.request；后端发现 last_seq 缺口 > 50 推送 reconnect.snapshot。
   - 期望：
     - adapter 用 snapshot 覆盖 gameStore 关键字段（factions / regions / relationships / current_turn / events 末尾 N 条）。
     - UI 不出现"两次同样的演讲气泡"、"重复的 BattleResultCard"、"phase 跑回上一回合"。
     - Countdown 与新阶段对齐。

3. 验证并修复必要差异：
   - 在 src/protocol/adapter.ts 中确认 reconnect.catchup / reconnect.snapshot 的分支：
     - catchup：遍历 messages 按 seq 排序依次应用到 store。
     - snapshot：调用 gameStore._applySnapshot(full_state)（若不存在则在本任务里新增一个内部 action，仅供 adapter 使用，不暴露给 UI）。
   - 若发现 adapter 未实现这两个分支：实现最小版本，但保持原有其它路由不变。
   - 若发现 gameStore 缺少 _applySnapshot：仅新增此一个内部 action，覆盖 factions / regions / relationships / treaties / events 末尾 N 条 / current_turn / privateMessages 末尾 N 条；不修改其它 store 字段。
   - 不要在本任务中改后端业务逻辑；后端 reconnect 路径已存在。

4. 重复事件防护：
   - 在 adapter / store 写入 events 前用 event.id 去重（若 id 已在 events 列表则忽略）。
   - 若 store 未有去重机制：仅在本任务里给 events 写入添加 idempotent 检查，不动其它逻辑。

5. 输出 docs/INTEGRATION_RECONNECT_REPORT.md：
   - 表格记录两条路径各自的：
     - 触发方式 / 期望行为 / 实测结果 / WS frame 摘要 / 后端日志摘要。
   - 列出本任务实际修改的文件清单（应仅限 src/protocol/adapter.ts + src/store/gameStore.ts 中 _applySnapshot + 可能的 events 去重）。

6. 验证：
   - 双路径浏览器手工演练通过。
   - tsc --noEmit + npm run build 通过。
   - 后端 pytest -q 通过。
   - 前端原有体验（mock 模式 + WS 模式）不退化。

【禁止做的事】
- 不要在本任务大范围重构 store。
- 不要把 _applySnapshot 暴露给 UI 组件调用。
- 不要修改 service / repository / domain。
- 不要修改 EventStream / RelationsPanel / MapStage 业务实现。
- 不要在重连成功后清空所有事件历史（必须保留 snapshot 中包含的近期事件）。
- 不要把"刷新页面"等同于"重连"；本任务必须验证浏览器不刷新前提下的 WS reconnect。
- 不要因为短时重连不丢失就跳过 snapshot 路径；必须制造 > 50 缺口验证。
- 不要在 snapshot 应用时触发 UI 大动画（避免视觉错觉）。

【验收标准】
1. catchup 路径浏览器演练通过：事件无重复、phase 不重置、Countdown 不跳。
2. snapshot 路径浏览器演练通过：store 字段被覆盖、UI 不残留旧 phase。
3. adapter 含两个分支。
4. gameStore._applySnapshot 存在但不被 UI 直接调用。
5. events 去重生效（同 event.id 不重复写入）。
6. 报告含 WS frame + 后端日志摘要。
7. tsc + build + pytest 通过。
8. mock 模式仍正常。
9. WS 模式仍正常。
10. 修改文件仅限协议 / store 内部 action，未触碰 UI / service。

请按以上规范完成本任务。完成后输出：
（1）报告路径；
（2）双路径通过证据；
（3）修改文件清单；
（4）确认未触碰 service / UI 业务。
```

### 预期产物

- `docs/INTEGRATION_RECONNECT_REPORT.md`。
- `src/protocol/adapter.ts` 补 catchup / snapshot 分支（必要时）。
- `src/store/gameStore.ts` 新增 `_applySnapshot`（必要时）。
- events 去重逻辑（必要时）。

### 验收标准

1. catchup 通过。
2. snapshot 通过。
3. adapter 双分支。
4. _applySnapshot 仅 adapter 用。
5. 事件去重。
6. 报告含 frame + 日志。
7. tsc / build / pytest 通过。
8. mock 模式不退化。
9. WS 模式不退化。
10. 仅触动协议 / store 内部 action。

### 禁止事项

- 禁止大范围重构 store。
- 禁止 _applySnapshot 暴露给 UI。
- 禁止改 service / repo / domain。
- 禁止改 EventStream / Relations / Map 业务。
- 禁止清空事件历史。
- 禁止把刷新等同重连。
- 禁止跳过 snapshot 验证。
- 禁止 snapshot 应用触发大动画。

---

## 任务 9：错误路径联调（action.rejected / 异常 / 频率限制 / phase 错位）

### 使用场景

幸福路径已通，必须验证错误路径：玩家在非 action 期点发送、超过频率限制、目标势力非法、treaty target 超过 3、连接异常时 ActionDispatcher.send 行为、后端 5xx 时前端反馈。本任务确保 UI 收到 action.rejected 后正确显示 ErrorPanel / toast，不会卡死。

### 可直接复制给 AI 编程工具的完整提示词

```
你是一名资深错误路径联调工程师。请为《外交风云》—— 人机混战 AI Diplomacy 项目验证并修复错误路径联调缺陷，确保前端在所有可预期错误下不卡死、不静默、不破坏后续操作。

【项目背景】
后端已抛 InvalidPhaseError / RateLimitedError / InvalidActionError / FactionAlreadyTakenError / RoomNotFoundError / PlayerNotFoundError 等异常并通过 OutboundDispatcher 推送 action.rejected envelope（含 error_code + reason + request_id）。前端 adapter 应路由 action.rejected → uiStore.setLastError → ErrorPanel toast。

【联调期全局红线（强制遵守）】
1. 当前阶段是前后端联调，前端代码与后端代码均已大体写完。
2. 不要重写已有 UI、store、service、repository、domain 业务逻辑。
3. 允许启动 uvicorn 与 npm run dev（仅本机联调），但不要部署到任何远程环境。
4. 不要连接真实数据库、不要启动 Docker。
5. 不要调用真实 LLM，保持 LLM_PROVIDER=mock。
6. 行动期不调用 LLM 仍是架构红线；任何联调改动不得破坏这条边界。
7. 协议字段名前后端必须严格一致；如发现差异，前后端必须同步修复。
8. MVP 阶段不在联调中重点实现 prompt injection 防护、复杂鉴权、token 校验、限流策略升级。
9. 联调中如出现 bug，必须先分诊，再修最小范围。
10. 不要把联调代码当成生产部署方案。

【本任务允许做以下事情】

1. 错误场景矩阵（每一行都必须真实在浏览器或 smoke 脚本中触发并验证）：

   | # | 触发方式 | 期望 error_code | 期望 UI 行为 |
   |---|---------|----------------|--------------|
   | 1 | observe 期点击发送按钮 | InvalidPhase | ErrorPanel toast 3s 自动消失，输入框不清空，CommandTerminal 不卡死 |
   | 2 | action 期发送第 6 条 speech | RateLimited | toast 含"本回合发送已达上限"，发送按钮变灰直到下一回合 |
   | 3 | speech.targets 包含自身势力 | InvalidAction | toast，输入框保持 |
   | 4 | treaty.target_factions = []（前端应在客户端拦截，但仍发包测试后端容错） | InvalidAction | toast，无前端崩溃 |
   | 5 | treaty.target_factions = 4 个 | InvalidAction | toast |
   | 6 | military.source_region 不存在 | InvalidAction | toast |
   | 7 | 房间不存在（伪造 room_id） | RoomNotFound | toast |
   | 8 | 同一 player_id 重复 select_faction 至已被占用势力 | FactionAlreadyTaken | toast，选择面板不卡死 |
   | 9 | 后端突然 500（手动在 router 临时 raise 一个普通 Exception，测试完恢复） | internal | toast 含 "服务端异常，已自动重试"，前端不白屏 |
   | 10 | 后端 reject 一个携带 request_id 的发送 | 任意 | ActionDispatcher pending 队列正确清理（不卡 promise） |

2. 验证 ActionDispatcher 的 ack/reject 流程：
   - 如果 ActionDispatcher 内部对每个 send 维护 pending: Map<requestId, deferred>，必须确认 action.rejected 与 action.broadcast 都能正确 resolve / reject 对应 deferred。
   - 若发现 reject 后 pending 未清理：在 ActionDispatcher 内补最小修复（仅添加 reject 分支），不重构其它逻辑。

3. 验证 ErrorPanel 行为：
   - 多条 error 在 2s 内连发时是否堆叠（不应永久堆叠，最多保留 3 条）。
   - toast 内不显示堆栈 / 不显示内部 Python 异常类名（只显示 reason 字段或友好文案映射）。
   - 在 src/utils/errorMessages.ts 增加 error_code → 友好文案映射（中文），漏配的 error_code 显示原 reason。

4. 后端异常处理验证：
   - 检查 app/main.py 是否有全局 exception handler：捕获未注册的异常 → 5xx + error_code="internal" + reason 经清洗（无堆栈）→ 不在 prod 暴露内部。
   - 若发现未注册：在 app/main.py 仅添加最小 handler，不改 service / repository。

5. 输出 docs/INTEGRATION_ERROR_REPORT.md：
   - 10 行矩阵每一行：触发方式 / 实测 error_code / 实测 UI / 通过 / 偏差 / 修复点。
   - 列本任务实际修改文件清单（应只在 ActionDispatcher 补 reject 分支、ErrorPanel 友好文案映射、可能的全局 handler）。

6. 验证：
   - 10 行矩阵全部通过。
   - tsc / build / pytest 通过。
   - 后端 ruff 通过。
   - 模拟"突然 500"的临时改动需在验证后恢复（不留在仓库）。

【禁止做的事】
- 不要修改 ActionService / RoomService / PhaseService / SettlementService 内部业务逻辑。
- 不要在 ErrorPanel 中显示堆栈。
- 不要在 toast 中展示 token。
- 不要在前端做"幻象成功"（发包失败但 UI 显示已发送）。
- 不要为每个 error_code 写一段冗长解释（友好文案 ≤ 30 字）。
- 不要把"模拟 500"的临时 raise 提交到仓库。
- 不要把全局 exception handler 用来吞掉 DiplomacyError（DiplomacyError 仍按已有映射 400/404/409）。
- 不要在 ErrorPanel 中包含"Sentry 上报"等未规划功能。

【验收标准】
1. 10 行错误矩阵全部通过。
2. ActionDispatcher 在 action.rejected 时清理 pending。
3. ErrorPanel 多 toast 上限 3 条。
4. error_code → 友好文案映射齐全（含至少 7 种 code）。
5. 后端全局 exception handler 存在并清洗 5xx。
6. 模拟 500 临时改动已恢复。
7. 报告含 10 行结果 + 修复文件清单。
8. tsc / build / pytest / ruff 通过。
9. mock 模式不退化。
10. 未触碰 service / repository 业务实现。

请按以上规范完成本任务。完成后输出：
（1）报告路径；
（2）10 行矩阵通过率；
（3）修复文件清单；
（4）确认临时 500 改动已恢复；
（5）确认未触碰业务实现。
```

### 预期产物

- `docs/INTEGRATION_ERROR_REPORT.md`。
- `src/protocol/dispatcher.ts` ActionDispatcher pending reject 分支（必要时）。
- `src/utils/errorMessages.ts`（友好文案映射）。
- `src/components/ErrorPanel.tsx` 堆叠上限（必要时）。
- `app/main.py` 全局 exception handler（必要时）。

### 验收标准

1. 10 行矩阵通过。
2. pending 清理。
3. 堆叠 ≤ 3。
4. 映射 ≥ 7 种 code。
5. 全局 handler 清洗 5xx。
6. 临时 500 恢复。
7. 报告含修复清单。
8. tsc / build / pytest / ruff 通过。
9. mock 不退化。
10. 未碰业务。

### 禁止事项

- 禁止改业务 service。
- 禁止显示堆栈。
- 禁止展示 token。
- 禁止幻象成功。
- 禁止冗长文案。
- 禁止提交模拟 500。
- 禁止吞 DiplomacyError。
- 禁止规划外功能。

---

## 任务 10：联调缺陷分诊与 Runbook 文档

### 使用场景

任务 6 / 7 / 8 / 9 都会向 `docs/INTEGRATION_ISSUES.md` 追加缺陷。本任务对累积 issue 做一次分诊：按"前端 / 后端 / 协议 / 数据 / 性能 / 环境"分类，标注严重度（blocker / major / minor），输出 Runbook（联调常见问题速查），并对 blocker 级别提交最小修复 PR 描述（不实际修改代码，由后续任务执行）。

### 可直接复制给 AI 编程工具的完整提示词

```
你是一名资深联调质量与流程工程师。请为《外交风云》—— 人机混战 AI Diplomacy 项目对累积联调缺陷做分诊，输出 Runbook 与 blocker 修复路线图。

【项目背景】
联调阶段已产出：
- docs/PROTOCOL_AUDIT.md（任务 1）
- docs/INTEGRATION_SMOKE_REPORT.md（任务 6）
- docs/INTEGRATION_PHASE_REPORT.md（任务 7）
- docs/INTEGRATION_RECONNECT_REPORT.md（任务 8）
- docs/INTEGRATION_ERROR_REPORT.md（任务 9）
- docs/INTEGRATION_ISSUES.md（持续追加）

本任务对 issues 做收口：分诊、严重度、Runbook、blocker 修复路线。

【联调期全局红线（强制遵守）】
1. 当前阶段是前后端联调，前端代码与后端代码均已大体写完。
2. 不要重写已有 UI、store、service、repository、domain 业务逻辑。
3. 允许启动 uvicorn 与 npm run dev（仅本机联调），但不要部署到任何远程环境。
4. 不要连接真实数据库、不要启动 Docker。
5. 不要调用真实 LLM，保持 LLM_PROVIDER=mock。
6. 行动期不调用 LLM 仍是架构红线；任何联调改动不得破坏这条边界。
7. 协议字段名前后端必须严格一致；如发现差异，前后端必须同步修复。
8. MVP 阶段不在联调中重点实现 prompt injection 防护、复杂鉴权、token 校验、限流策略升级。
9. 联调中如出现 bug，必须先分诊，再修最小范围。
10. 不要把联调代码当成生产部署方案。

【本任务允许做以下事情】

1. 读取 docs/INTEGRATION_ISSUES.md（如果不存在或空，则跳过分诊，仅产出空 Runbook + 说明"当前无遗留 issue"）。

2. 对每条 issue 补字段：
   - 类别：frontend / backend / protocol / data / performance / environment。
   - 严重度：
     - blocker：阻断联调主流程（如 phase 不切换、玩家无法发言、连接无法建立）。
     - major：体验明显劣化（如 Countdown 偏差 > 2s、UI 错位、错误 toast 不显示）。
     - minor：可见但不阻断（如 reaction 标签位置偏移 4px、日志少一字段）。
   - 复现率：always / sometimes / once。
   - 推荐 owner（按类别）：frontend → 前端工程师；backend → 后端工程师；protocol → 双端同步。
   - 推荐 fix 范围：最小修改文件清单。

3. 在 docs/INTEGRATION_RUNBOOK.md 输出 Runbook，结构：

   ## 1. 启动顺序速查
   - dev-up.sh 启动顺序。
   - readyz / runtime/config 校验命令。
   - ConnectionBadge 状态语义表。

   ## 2. 常见症状 → 分诊起点
   - 症状：浏览器 Console 出现 "WebSocket connection failed"。
     - 起点：是否启动后端、CORS、防火墙、端口占用。
   - 症状：ConnectionBadge 长时间 reconnecting。
     - 起点：后端 uvicorn 是否 reload 卡死、心跳超时配置、token 是否缺失。
   - 症状：玩家发言后 UI 无反馈。
     - 起点：Network 面板查 action.speak 出站 / action.broadcast 入站；查后端是否 action.rejected；查前端 ActionDispatcher pending。
   - 症状：phase 永远停在 observe。
     - 起点：检查 PhaseService.maybe_advance_by_clock 是否被调度（联调期由 uvicorn loop 触发还是手动 advance？）；如果后端没有自动 phase 推进调度，记录已知架构限制并给出建议。
   - 症状：resolve 期 LLM 报错。
     - 起点：LLM_PROVIDER 是否=mock；MockLLMClient 是否返回合法 JSON；parser 是否走 fallback。
   - 症状：刷新页面后 EventStream 空白。
     - 起点：是否走 reconnect.snapshot；adapter snapshot 分支是否生效；store 是否被覆盖。

   ## 3. 后端自动 phase 推进的现状与建议
   - 当前 PhaseService 是纯逻辑状态机，由外部 tick 驱动；联调期需要由 WebSocket gateway 内的轻量后台任务调用 maybe_advance_by_clock，或由 dev 调试接口手动 advance。
   - 给出最小后续任务建议（非本任务实施）：在 gateway 启动时为每个 running 房间起一个 asyncio.Task 每 1s 调用 maybe_advance_by_clock；停止房间时取消。
   - 标注"此项是 blocker 级别，建议在下一轮联调任务实施"。

   ## 4. blocker 修复路线图
   - 列出全部 blocker issue 编号 + 推荐 fix 范围 + 估时（小时为单位粗略）。
   - 每条 blocker 必须指明：影响哪一条 Critical Path、不修能否走通 mock 模式、修复负责模块。

   ## 5. major / minor 处理建议
   - 列表 + 处理优先级（下一轮联调 / 后续优化 / 接受现状）。

   ## 6. 联调常用命令速查
   - 启停：dev-up、smoke、pytest -m integration、tsc --noEmit、npm run build。
   - 日志：uvicorn console、浏览器 Network、Console。
   - 状态：/healthz、/readyz、/debug/v1/runtime/config、/debug/v1/rooms/{id}。

   ## 7. 已知架构红线提醒
   - 行动期不调用 LLM。
   - MVP 不重点做 prompt injection 防护。
   - 内存仓储重启后数据丢失。
   - LLM_PROVIDER=mock 是默认且唯一支持的联调模式。
   - WebSocketTransport 不带鉴权（仅占位 token）。

4. 输出 docs/INTEGRATION_TRIAGE.md：把 INTEGRATION_ISSUES.md 中每条 issue 加上分诊字段后整理成表格（标题 / 类别 / 严重度 / 复现率 / 推荐 owner / 推荐 fix 范围 / 状态 open/closed）。

5. 不在本任务实施任何修复，仅做分诊与文档。

6. 验证：
   - docs/INTEGRATION_RUNBOOK.md 与 docs/INTEGRATION_TRIAGE.md 存在。
   - tsc / build / pytest 仍通过。
   - git status 仅显示 docs/。

【禁止做的事】
- 不要在本任务修改任何代码。
- 不要把所有 issue 都标 minor 以方便交付（必须如实评估）。
- 不要把"自动 phase 推进缺失"轻描淡写（必须明确为 blocker 级架构建议）。
- 不要在 Runbook 中混入营销文字。
- 不要在分诊中标 owner 为具体人员姓名（按"前端工程师 / 后端工程师 / 双端同步"匿名标注）。
- 不要忽略空 INTEGRATION_ISSUES.md 的情况（必须显式说明"当前无遗留 issue"）。
- 不要把红线变弱：行动期不调 LLM / 不连真实 DB / mock 默认必须再次强调。
- 不要在 Runbook 中提及部署、CI/CD、监控、Sentry 等超出 MVP 联调范围的内容。

【验收标准】
1. docs/INTEGRATION_RUNBOOK.md 含 7 节齐全。
2. 7 类症状 → 分诊起点。
3. 明确指出"自动 phase 推进缺失"是 blocker。
4. docs/INTEGRATION_TRIAGE.md 含所有 issue 的分诊字段。
5. blocker 修复路线图含影响 / 范围 / 估时。
6. major / minor 处理建议齐全。
7. 命令速查齐全。
8. 架构红线提醒齐全。
9. 0 代码改动。
10. git status 仅 docs/。

请按以上规范完成本任务。完成后输出：
（1）Runbook + Triage 路径；
（2）issue 总数 / blocker 数 / major 数 / minor 数；
（3）确认未修改任何代码；
（4）下一轮建议任务清单（≤ 5 条）。
```

### 预期产物

- `docs/INTEGRATION_RUNBOOK.md`。
- `docs/INTEGRATION_TRIAGE.md`。
- 0 代码改动。

### 验收标准

1. Runbook 7 节齐全。
2. 7 类症状分诊。
3. 自动 phase 推进列 blocker。
4. Triage 含所有 issue 分诊字段。
5. blocker 修复路线含影响 / 范围 / 估时。
6. major / minor 处理建议。
7. 命令速查齐全。
8. 架构红线提醒齐全。
9. 0 代码改动。
10. git status 仅 docs/。

### 禁止事项

- 禁止修改任何代码。
- 禁止标全 minor。
- 禁止淡化 phase 推进缺失。
- 禁止营销文字。
- 禁止真实人名 owner。
- 禁止忽略空 issue 场景。
- 禁止弱化红线。
- 禁止部署 / CI / Sentry 内容。

---

## 附录 A：10 条联调任务一览

| # | 任务 | 主要交付物 |
|---|------|----------|
| 1 | 协议对齐审计与差异修复 | docs/PROTOCOL_AUDIT.md + 同步修复前后端字段 |
| 2 | 后端联调启动配置 | CORS + .env + scripts/backend-dev + /runtime/config |
| 3 | 前端 WebSocketTransport 实现 | transport.ts 双实现 + createTransport + vitest |
| 4 | 前端 USE_WS 切换开关 + 状态 UI | env.ts + GamePage 装配 + ConnectionBadge |
| 5 | 双端联调启动脚本与冒烟脚本 | scripts/dev-up.{sh,ps1} + scripts/integration-smoke.py |
| 6 | 浏览器端到端冒烟联调 | docs/INTEGRATION_SMOKE_REPORT.md |
| 7 | 阶段切换 + 多回合 + 结算渲染深度联调 | docs/INTEGRATION_PHASE_REPORT.md |
| 8 | 断线重连联调（catchup + snapshot） | docs/INTEGRATION_RECONNECT_REPORT.md + adapter / store 最小修复 |
| 9 | 错误路径联调 | docs/INTEGRATION_ERROR_REPORT.md + dispatcher / ErrorPanel / handler 最小修复 |
| 10 | 联调缺陷分诊与 Runbook | docs/INTEGRATION_RUNBOOK.md + docs/INTEGRATION_TRIAGE.md |

> 使用建议：
> - 顺序提交 1 → 10，每条独立可复制给 AI 编程工具。
> - 任务 1 必须先做：协议未对齐前的所有联调都是浪费。
> - 任务 2、3、4、5 是基础设施；可按顺序连做。
> - 任务 6、7、8、9 是手工 + 自动化混合联调；每条结束后追加 INTEGRATION_ISSUES.md。
> - 任务 10 收口：把所有 issue 分诊、产出 Runbook、规划下一轮修复。
> - 所有任务严守红线：不真实调用 LLM、不连真实 DB、不部署、行动期不调模型、不重写业务逻辑。
