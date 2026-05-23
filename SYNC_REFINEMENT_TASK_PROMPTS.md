# 《外交风云》前后端同步完善任务型提示词库

> 项目：《外交风云》— 人机混战 AI Diplomacy
> 版本：v1.0
> 适用阶段：联调任务 1–5（协议对齐 / 后端启动 / WebSocketTransport / USE_WS 开关 / dev-up 脚本）已完成。
> 用途：把仍处于初始 / mock 状态的模块升级到真实可用形态。每条任务同时给「前端子提示词」与「后端子提示词」，可分别复制给两边的 AI 编程工具，但端到端契约必须严格一致。
> 注意：本文档强调「同步完善」——前端改动与后端改动通过共享协议契约（envelope / payload schema）耦合。任何一方变更必须先与对方对齐。

---

## 零、同步完善阶段总体说明（必读）

### 0.1 阶段定位

| 阶段 | 文档 | 目标 |
|------|------|------|
| 独立开发期 | BACKEND_TASK_PROMPTS.md / FRONTEND_TASK_PROMPTS.md | 各自完成主体实现 |
| 联调期 | INTEGRATION_TASK_PROMPTS.md（任务 1–10） | 协议握手、连接生命周期、双端拨号 |
| **同步完善期（本文档）** | SYNC_REFINEMENT_TASK_PROMPTS.md | 把 mock / 占位实现替换为真实形态，端到端打通 |

### 0.2 同步完善期允许的变化（与联调期的关键差异）

| 维度 | 联调期 | 同步完善期 |
|------|--------|-----------|
| 允许启动 uvicorn / npm dev | ✅ | ✅ |
| 允许真实 LLM 调用 | ❌（mock only） | **✅（任务 1 后允许，但仍由 LLM_PROVIDER 控制） |
| 允许 SQLite 持久化 | ❌ | **✅（任务 9 起允许）** |
| 真实 PostgreSQL / Redis | ❌ | ❌（仍不引入） |
| Docker | ❌ | ❌ |
| 修改 service / repository / domain | 仅最小 hotfix | **✅（本阶段重点）** |
| 修改 UI / store 业务字段 | ❌ | **✅（在契约对齐前提下）** |
| 修改协议字段 | 仅对齐时 | **✅（前后端同步改）** |

### 0.3 同步完善期红线（每条任务都内置）

1. 行动期（phase == "action"）后端**仍不调用 LLM**，这是架构红线。
2. 模型调用只在 resolve / arbitrate 阶段，由 SettlementService 统一调度。
3. 不引入 PostgreSQL / Redis / Docker，最多升级到 SQLite。
4. 不部署到任何远程环境，所有改动仍以本机联调为目标。
5. 任何协议字段变更必须前后端同步改、同步测试，且更新 docs/PROTOCOL_AUDIT.md。
6. 前后端契约破坏（添加 / 删除 / 改名字段）必须先在任务的"契约对齐"章节说明。
7. 真实 LLM provider 接入仍要保留 MockLLMClient 作为默认 fallback，可通过 env LLM_PROVIDER 切换。
8. MVP 不重点做 prompt injection 防护；只做基础字段校验与长度限制。
9. 不引入收费 API key 到代码仓库；通过 env 配置，.env 不入库。
10. 每条任务必须前后端联合验收（dev-up + 浏览器手工 + smoke 脚本），单端通过不算完成。

### 0.4 任务依赖关系

```
任务 1 (真实 LLM provider)
   ├─→ 任务 3 (AI 性格 / 记忆系统升级)
   └─→ 任务 5 (战斗与领土易手闭环)

任务 2 (自动 phase 推进)
   └─→ 所有其它任务的前置（没有自动推进就没有真实节奏）

任务 4 (MapStage 真实数据驱动)
   └─→ 任务 5 (战斗领土易手依赖真实地图)

任务 6 (回放真实落地)
   ← 依赖任务 1/3/5 已能产出真实事件

任务 7 (snapshot 真实化)
   ← 依赖任务 9 持久化（或保留全内存方案）

任务 8 (4v4 多人联调)
   ← 依赖任务 2 自动推进 + 任务 7 snapshot

任务 9 (SQLite 持久化)
   └─→ 让任务 7/8 跨进程可行

任务 10 (端到端总冒烟)
   ← 收口所有上面任务
```

建议执行顺序：**2 → 1 → 3 → 4 → 5 → 9 → 7 → 6 → 8 → 10**。

### 0.5 每条任务的统一格式

每条任务都给出：

1. **使用场景**：什么时候做这条任务。
2. **当前 mock / 初始状态描述**：明确"在改之前是什么样"。
3. **契约对齐（端到端时序图 + 字段约定）**：前后端共同遵守的接口。
4. **前端子提示词**：完整可复制给 AI 工具的前端任务。
5. **后端子提示词**：完整可复制给 AI 工具的后端任务。
6. **预期产物（前端 + 后端）**。
7. **验收标准（前端单端 + 后端单端 + 端到端联合）**。
8. **禁止事项**。

---

## 任务 1：真实 LLM provider 接入（OpenAI / Claude 兼容）+ 前端思考进度可视化

### 使用场景

后端 SettlementService 当前调用 MockLLMClient 返回 deterministic JSON；OpenAICompatibleClient / ClaudeCompatibleClient 仅占位抛 NotImplementedError。本任务真正实现两个 provider 客户端（最小可工作版本：connect / call_settlement_model / 超时 / 重试 / 错误 fallback），并通过 env 切换；同时前端在结算阶段消费后端 ai.thinking 事件，给出真实"模型思考中"进度可视化。

### 当前 mock / 初始状态

- 后端 `app/llm/openai_client.py` / `claude_client.py` 仅占位 NotImplementedError。
- 后端 `app/llm/factory.py` 在 provider="openai" / "claude" 时抛 NotImplementedError。
- 后端 SettlementService 仅触发一次 LLMClient 调用，未推送 ai.thinking 事件。
- 前端 AIThinkingPanel 进度条由阶段时间百分比驱动（fallback），无真实模型进度。

### 契约对齐（端到端时序）

```
玩家 action.lock → 全员 lock → PhaseService.maybe_advance_by_lock → phase=resolve
  ↓
SettlementService.run_turn_settlement(room_id, epoch, turn)
  ↓
SettlementService 在调用 LLMClient 前推送 ai.thinking { progress: 0.0, phase: "preparing" }
  ↓
SettlementService 调用 LLMClient（真实或 mock）
  ├─ 调用前推送 ai.thinking { progress: 0.3, phase: "calling_model" }
  ├─ 模型返回后推送 ai.thinking { progress: 0.7, phase: "parsing" }
  └─ rule_resolver 完成后推送 ai.thinking { progress: 1.0, phase: "done" }
  ↓
SettlementService 推送 resolve.events / resolve.map_diff / resolve.stats_diff / ai.speak
  ↓
PhaseService 切换到下一 phase
```

ai.thinking envelope 字段约定（**前后端必须严格一致**）：

```json
{
  "v": 1,
  "id": "msg_xxx",
  "t": "ai.thinking",
  "ts": 1716192000000,
  "seq": 142,
  "p": {
    "room_id": "room_xxx",
    "epoch": 3,
    "turn": 2,
    "progress": 0.7,
    "phase": "preparing | calling_model | parsing | resolving | done",
    "model": "mock | gpt-4o-mini | claude-3-5-sonnet | ...",
    "elapsed_ms": 1234
  }
}
```

LLM provider env：

```
LLM_PROVIDER=mock | openai | claude
OPENAI_API_KEY=...
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
CLAUDE_API_KEY=...
CLAUDE_BASE_URL=https://api.anthropic.com
CLAUDE_MODEL=claude-3-5-sonnet-20241022
LLM_TIMEOUT_S=20
LLM_MAX_RETRIES=2
```

### 前端子提示词

```
你是一名资深前端实时反馈工程师。请为《外交风云》—— 人机混战 AI Diplomacy 前端接入后端真实 ai.thinking 推送事件，把 AIThinkingPanel 进度条从 fallback 时间驱动升级为真实模型进度驱动。

【项目背景】
后端 SettlementService 将在结算阶段连续推送多条 ai.thinking 事件，含 progress(0~1)、phase("preparing"/"calling_model"/"parsing"/"resolving"/"done")、model 名称、elapsed_ms。前端 AIThinkingPanel 当前由阶段百分比 fallback 驱动。本任务接入真实事件，但保留 fallback 作为模型未推送时的降级。

【同步完善期红线（强制遵守）】
1. 行动期后端不调 LLM，本前端任务不破坏此红线。
2. 模型调用只在 resolve / arbitrate 阶段。
3. 不引入 PostgreSQL / Redis / Docker。
4. 不部署。
5. 协议字段变更必须前后端同步改并更新 docs/PROTOCOL_AUDIT.md。
6. 真实 LLM provider 由后端通过 env 控制，前端不感知 provider 名称除展示外。
7. MVP 不重点 prompt injection 防护。
8. 不引入 API key 到前端代码。
9. dev-up + 浏览器手工 + smoke 联合验收。
10. 不动 service / store 业务字段（仅按契约新增 ai.thinking 路由）。

【ai.thinking 协议契约（前后端严格一致）】
envelope.t = "ai.thinking"
payload = {
  room_id: string,
  epoch: number,
  turn: number,
  progress: number (0~1),
  phase: "preparing" | "calling_model" | "parsing" | "resolving" | "done",
  model: string,
  elapsed_ms: number
}

【本任务允许做以下事情】

1. 在 src/protocol/types.ts 中新增（或更新）AIThinkingPayload 类型：
   - 严格按上面字段定义，添加到 IncomingMessage union（按 t 字段分支）。
   - 不修改其它 payload。

2. 在 src/protocol/adapter.ts 增加 ai.thinking 路由：
   - 收到后调用 gameStore._applyAIThinking({ faction_id?, progress, phase, model, elapsed_ms, epoch, turn })。
   - 不要把 ai.thinking 写入 events 列表（不污染 EventStream）。
   - 不要把 progress 直接驱动 UI（走 store）。

3. 在 src/store/gameStore.ts 新增内部 action _applyAIThinking 与字段 aiThinkingState:
   - aiThinkingState: {
       active: boolean,
       progress: number,
       phase: string,
       model: string,
       elapsed_ms: number,
       last_update_at_ms: number,
       fallback: boolean
     }
   - 默认 { active: false, progress: 0, phase: "idle", model: "", elapsed_ms: 0, last_update_at_ms: 0, fallback: true }。
   - _applyAIThinking 设置 fallback=false 与上述字段。
   - 当 phase=resolve 开始时（在 _applyPhase 中检测）若 aiThinkingState.last_update_at_ms < phase_started_at_ms 则保持 fallback=true。

4. 修改 src/features/phaseSystem/AIThinkingPanel.tsx：
   - 订阅 gameStore.aiThinkingState。
   - 若 fallback=false：进度条数值 = aiThinkingState.progress；状态标签显示当前 phase（"准备" / "调用模型" / "解析" / "规则裁决" / "完成"）。
   - 若 fallback=true：保留原 fallback 行为（按阶段时间百分比驱动）。
   - 顶部小字显示 model 名称（mock / openai / claude / 具体模型名），右上角显示 elapsed_ms（格式 "1.2s"）。
   - 不修改原视觉风格（仍是 GlowPanel + 进度条 + ✓ 图标），仅替换数据来源。

5. 测试：
   - 在 src/store/__tests__/gameStore.aiThinking.test.ts 验证 _applyAIThinking 字段写入。
   - 在 src/protocol/__tests__/adapter.aiThinking.test.ts 模拟 ai.thinking envelope 注入并校验 store 状态。
   - 浏览器手工：dev-up + WS 模式，进入 resolve 阶段后 AIThinkingPanel 显示真实模型名 + progress 平滑增长 + 完成时 ✓。

【禁止做的事】
- 不要把 ai.thinking 写入 events 列表。
- 不要在 UI 组件内直接调用 transport.send。
- 不要把 progress 数值跳变（必须用 store 更新驱动，避免本地 setInterval 推进）。
- 不要在 AIThinkingPanel 显示 API key / token。
- 不要在 fallback=true 时显示真实模型名（应显示"思考中"或本地占位）。
- 不要把 ai.thinking 之外的字段塞进 aiThinkingState（保持 schema 严格）。
- 不要修改 PhaseStateMachine / Countdown 实现。
- 不要让 ai.thinking 触发 PhaseTransitionOverlay。

【验收标准】
1. AIThinkingPayload 类型对齐契约。
2. adapter 路由 ai.thinking 到 _applyAIThinking。
3. gameStore.aiThinkingState 字段齐全 + fallback 字段正确。
4. AIThinkingPanel 真实模式与 fallback 模式视觉一致，仅数据源不同。
5. 顶部显示 model 名称。
6. 右上角 elapsed_ms 格式正确。
7. ai.thinking 不污染 EventStream。
8. tsc --noEmit + npm run build 通过。
9. store / adapter 单元测试通过。
10. 浏览器手工：resolve 阶段进度条按后端真实推送平滑前进，完成时 ✓ 显现。
```

### 后端子提示词

```
你是一名资深后端 LLM 接入工程师。请为《外交风云》—— 人机混战 AI Diplomacy 后端真正实现 OpenAICompatibleClient 与 ClaudeCompatibleClient（最小可工作版本），并在 SettlementService 中插入 ai.thinking 进度推送，保持 MockLLMClient 作为默认 fallback。

【项目背景】
当前 app/llm/openai_client.py 与 claude_client.py 仅占位 NotImplementedError。SettlementService 在结算流水线中只调用 LLMClient 一次，未发送进度事件。本任务真实实现两个 provider 客户端 + 进度推送。

【同步完善期红线（强制遵守）】
1. 行动期不调 LLM 仍是红线。
2. 模型调用只在 resolve / arbitrate 阶段。
3. 不引入 PostgreSQL / Redis / Docker。
4. 不部署。
5. 协议字段变更必须前后端同步改并更新 docs/PROTOCOL_AUDIT.md。
6. 保留 MockLLMClient 默认；通过 LLM_PROVIDER env 切换。
7. MVP 不重点 prompt injection 防护。
8. API key 不入库，仅 env 读取。
9. dev-up + 浏览器手工 + smoke 联合验收。
10. 不破坏已有 SettlementService 主流程（aggregator → prompt → llm → parser → rule_resolver → persist → outbound）。

【ai.thinking 协议契约（前后端严格一致）】
（同前端子提示词）

【LLM provider env】
LLM_PROVIDER=mock | openai | claude
OPENAI_API_KEY / OPENAI_BASE_URL / OPENAI_MODEL
CLAUDE_API_KEY / CLAUDE_BASE_URL / CLAUDE_MODEL
LLM_TIMEOUT_S=20 / LLM_MAX_RETRIES=2

【本任务允许做以下事情】

1. 引入 httpx 为 dev/optional 依赖（pyproject.toml dependencies 中加 httpx>=0.27）。
   - 不引入 openai / anthropic SDK，使用 httpx 直接调 REST API。

2. 实现 app/llm/openai_client.py 的 OpenAICompatibleClient：
   - 构造：__init__(self, *, api_key: str, base_url: str, model: str, timeout_s: float = 20.0)
   - call_settlement_model(self, request: LLMRequest) -> LLMResponse:
     - POST {base_url}/chat/completions
     - body: { model, messages: [{role:"system", content: request.system}, {role:"user", content: request.user}], temperature: request.temperature, max_tokens: request.max_tokens, response_format: {"type": "json_object"} }
     - headers: Authorization: Bearer {api_key}
     - timeout: httpx.Timeout(timeout_s)
     - 成功：返回 LLMResponse(content=resp["choices"][0]["message"]["content"], model=model, prompt_tokens, completion_tokens, latency_ms=int(elapsed*1000), raw=resp)
     - 非 2xx 或网络错误：raise LLMProviderError(reason=...) （在 app/core/errors.py 新增 LLMProviderError）
   - name() -> "openai:{model}"

3. 实现 app/llm/claude_client.py 的 ClaudeCompatibleClient：
   - POST {base_url}/v1/messages
   - headers: x-api-key: {api_key}, anthropic-version: "2023-06-01"
   - body: { model, max_tokens, system: request.system, messages: [{role: "user", content: request.user}], temperature: request.temperature }
   - 解析 resp["content"][0]["text"]。
   - 错误处理同上。

4. 修改 app/llm/factory.py：
   - make_llm_client(provider, *, settings) 真实分支：
     - mock → MockLLMClient
     - openai → OpenAICompatibleClient(api_key=settings.openai_api_key, base_url=settings.openai_base_url, model=settings.openai_model, timeout_s=settings.llm_timeout_s)
     - claude → ClaudeCompatibleClient(同上)
   - 若 api_key 缺失：log warning 并自动降级到 mock；不抛错（保持开发可用）。

5. 修改 app/core/config.py 增加字段：
   - openai_api_key / openai_base_url / openai_model / claude_api_key / claude_base_url / claude_model / llm_timeout_s / llm_max_retries
   - .env.example 增加对应行（值为占位"sk-replace-me"等）。
   - 真实 key 不入库。

6. 修改 app/llm/retry.py 的 call_with_retry：
   - max_retries 从 settings.llm_max_retries 读取。
   - LLMProviderError 视为可重试。
   - 重试期间记录 attempt 编号。

7. 修改 app/services/settlement_service.py：
   - 在 run_turn_settlement 流水线的每个关键节点调用新增方法 _emit_thinking(progress, phase):
     - 0.0 "preparing"：刚开始
     - 0.3 "calling_model"：调用 LLM 前
     - 0.7 "parsing"：解析输出前
     - 0.9 "resolving"：rule_resolver 前
     - 1.0 "done"：流水线结束
   - _emit_thinking 通过 EventLogRepository.append 写入 GameEvent(kind=ai_thinking, visibility=public, payload={progress, phase, model, elapsed_ms}) 让 OutboundDispatcher 推送。
   - 不修改 SettlementResult 与已有 outbound bundle 结构。

8. 修改 app/protocol/outgoing.py：
   - 确认 AIThinkingPayload 含 progress / phase / model / elapsed_ms / epoch / turn / room_id。
   - 若已有 AIThinkingPayload 但字段不全：补齐字段。

9. 修改 app/api/websocket/dispatcher.py：
   - dispatch_resolve_bundle 或 dispatch_to_room 中识别 GameEvent.kind=ai_thinking 时包装为 ai.thinking envelope 而非 action.broadcast。
   - 或在 SettlementService 中直接构造 ai.thinking envelope 字段返回，由 dispatcher 转发。任选一种实现，但保证只发一次、不重复。

10. 测试：
    - app/tests/test_openai_client.py / test_claude_client.py：使用 httpx.MockTransport / pytest-httpx 模拟 200 / 401 / 500 / timeout 响应；不发出真实请求。
    - app/tests/test_settlement_thinking.py：验证 run_turn_settlement 期间至少产出 4 条 kind=ai_thinking 事件。
    - app/tests/test_llm_factory.py：LLM_PROVIDER=openai 但缺 api_key 自动降级到 mock。
    - LLM_PROVIDER=mock 时 OpenAICompatibleClient 与 ClaudeCompatibleClient 不被实例化。

11. 文档：在 README 联调启动节追加"切换真实 LLM"小节：
    - export LLM_PROVIDER=openai
    - 设置 .env 中 api_key / base_url / model
    - 重启后端
    - smoke 脚本仍可工作

【禁止做的事】
- 不要引入 openai / anthropic SDK 包。
- 不要在测试中发真实网络请求。
- 不要把 API key 写入代码 / 测试 / 提交日志。
- 不要在行动期触发 LLM 调用（settlement 之外的任何代码路径都不能 import 调用 LLMClient）。
- 不要让 SettlementService 等待 ai.thinking 推送完成才继续（推送是 fire-and-forget）。
- 不要把 ai.thinking 写入 SettlementResult 持久化。
- 不要破坏 MockLLMClient 已有 deterministic 行为。
- 不要在 SettlementService 内吞 LLMProviderError（retry + fallback parser 处理）。

【验收标准】
1. OpenAICompatibleClient 与 ClaudeCompatibleClient 真实可调（用 mock transport 测试通过）。
2. LLM_PROVIDER env 切换三种 provider 工作正常。
3. api_key 缺失自动降级到 mock。
4. SettlementService 推送 ≥ 4 条 ai.thinking 事件。
5. ai.thinking envelope 字段对齐前端契约。
6. .env.example 增加 LLM provider 配置。
7. pytest 全套通过；无真实网络请求。
8. ruff check app 通过。
9. settlement_service 改动不破坏已有 outbound bundle 结构。
10. 文档说明切换真实 LLM 步骤。
```

### 预期产物（前端 + 后端）

**前端**：
- `src/protocol/types.ts` AIThinkingPayload。
- `src/protocol/adapter.ts` ai.thinking 路由。
- `src/store/gameStore.ts` aiThinkingState + _applyAIThinking。
- `src/features/phaseSystem/AIThinkingPanel.tsx` 真实数据接入。
- 单元测试。

**后端**：
- `app/llm/openai_client.py` / `claude_client.py` 真实实现。
- `app/llm/factory.py` / `retry.py` 接入。
- `app/core/config.py` + `.env.example` LLM 配置。
- `app/services/settlement_service.py` _emit_thinking。
- `app/protocol/outgoing.py` AIThinkingPayload。
- `app/api/websocket/dispatcher.py` ai.thinking 包装。
- 单元 / 集成测试 + README 文档。

### 验收标准（端到端联合）

1. 前端单端：tsc + build + 单元测试通过。
2. 后端单端：pytest + ruff 通过。
3. dev-up 启动后浏览器 WS 模式进入 resolve 阶段，AIThinkingPanel 进度条由后端推送驱动。
4. LLM_PROVIDER=mock：流水线正常，模型名显示"mock"。
5. LLM_PROVIDER=openai 但 api_key 占位：后端 log warning，前端仍显示"mock"。
6. LLM_PROVIDER=openai 且 api_key 真实（手动测试）：后端真实调用，前端显示真实 model 名。
7. 中途断网：retry + fallback parser 仍能完成结算，前端 progress 不卡在中间。
8. ai.thinking 不污染 EventStream。
9. 协议契约前后端字段名一致。
10. docs/PROTOCOL_AUDIT.md 更新 AIThinkingPayload 条目。

### 禁止事项

- 禁止引入 openai / anthropic SDK 包。
- 禁止在 action 期调 LLM。
- 禁止把 API key 写入代码或前端可读位置。
- 禁止 ai.thinking 推送阻塞主流水线。
- 禁止在测试中真实请求外网。
- 禁止前端在 UI 显示 API key / token。
- 禁止破坏 mock 默认行为。
- 禁止 ai.thinking 写入 SettlementResult。

---

## 任务 2：后端自动 phase 推进 + 前端 Countdown 严格对齐

### 使用场景

当前 PhaseService 是纯逻辑状态机，由外部 tick 显式驱动。联调中 phase 永远停在 observe，需要手动调用 `/debug/v1/rooms/{id}/phase/advance` 才能推进。本任务在 WebSocket gateway 启动时为每个 running 房间起一个 asyncio 后台任务，每秒调用 `maybe_advance_by_clock`，自动驱动阶段切换。前端 Countdown 严格用 `phase_started_at_ms + phase_duration_ms` 计算剩余时间，不再用本地 setTimer。

### 当前 mock / 初始状态

- 后端 PhaseService 实现完整，但无后台调度。
- 后端 gateway 没有为房间起调度任务。
- 前端 Countdown 当前可能用本地 setInterval 倒数；刷新页面后从头计时（联调任务 7 已发现此偏差）。

### 契约对齐（端到端时序）

```
PhaseTickScheduler（后端，每个 running 房间一个 task）
  每 1000ms：
    elapsed = clock.now_ms() - current.phase_started_at_ms
    if elapsed >= phase_duration_ms:
      next_turn = phase_service.advance_phase(room_id)
      → 自动产生 phase_change 事件
      → OutboundDispatcher 推送 phase.change envelope 给房间所有玩家
  房间 finished：cancel task。

phase.change envelope 字段（前后端严格一致）：
{
  v, id, t="phase.change", ts, seq,
  p: {
    room_id, epoch, turn,
    phase: "observe"|"action"|"resolve"|"arbitrate",
    arbitrate_phase: "battle"|"epic"|"summary"|null,
    phase_started_at_ms: number,
    phase_duration_ms: number,
    server_time_ms: number       // 让前端校准本地时钟偏移
  }
}

前端 Countdown 算法：
  serverNowMs = lastServerTimeMs + (Date.now() - localReceivedAtMs)
  remainingMs = (phase_started_at_ms + phase_duration_ms) - serverNowMs
  显示 mm:ss(remainingMs)
  刷新页面后由 reconnect.snapshot 或 turn.begin 重新拿到 phase_started_at_ms → 继续显示剩余时间
```

### 前端子提示词

```
你是一名资深前端节奏感工程师。请为《外交风云》—— 人机混战 AI Diplomacy 前端的 Countdown 与阶段切换升级为「严格按后端时间戳算剩余」的实现，并维护本地时钟偏移补偿。

【项目背景】
后端 phase.change envelope 已含 phase_started_at_ms / phase_duration_ms / server_time_ms。前端当前可能用本地 setInterval 倒数；刷新后从头计时。本任务改用后端时间戳为唯一权威。

【同步完善期红线（强制遵守）】
1. 行动期后端不调 LLM。
2. 模型调用只在 resolve / arbitrate。
3. 不引入 PostgreSQL / Redis / Docker。
4. 不部署。
5. 协议字段变更前后端同步改并更新 docs/PROTOCOL_AUDIT.md。
6. 保留 mock 默认；本任务在 mock 与 WS 模式都必须工作。
7. MVP 不重点 prompt injection 防护。
8. 不引入 API key 到前端。
9. dev-up + 浏览器手工 + smoke 联合验收。
10. 不动 service / store 业务字段（仅按契约处理时间字段）。

【phase.change 协议契约】
p = {
  room_id, epoch, turn,
  phase, arbitrate_phase,
  phase_started_at_ms,
  phase_duration_ms,
  server_time_ms
}

【本任务允许做以下事情】

1. 在 src/store/gameStore.ts 中：
   - 确认 epoch: { phase_started_at_ms, phase_duration_ms } 已有；如缺则补齐。
   - 新增字段 serverClockOffsetMs: number（默认 0）。
   - 新增内部 action _applyServerClockSample(server_time_ms, received_at_ms):
     offset = server_time_ms - received_at_ms
     用 EMA 平滑：serverClockOffsetMs = serverClockOffsetMs * 0.7 + offset * 0.3（首次直接赋值）。
   - 修改 _applyPhase（adapter 调用入口）：
     - 写入 phase_started_at_ms / phase_duration_ms。
     - 调用 _applyServerClockSample(payload.server_time_ms, Date.now())。

2. 在 src/utils/serverClock.ts 新增工具：
   - getServerNowMs() -> number：return Date.now() + gameStore.getState().serverClockOffsetMs。
   - getRemainingMs(phase_started_at_ms, phase_duration_ms) -> number。

3. 重写 src/features/phaseSystem/Countdown.tsx：
   - 不再用本地 setInterval 启动倒计时。
   - 用 requestAnimationFrame 每帧读取 store 的 phase_started_at_ms / phase_duration_ms / serverClockOffsetMs，计算剩余 ms。
   - 显示 mm:ss 格式；< 10s 时心跳呼吸 + 红色脉冲。
   - 剩余 ≤ 0 时显示 "00:00"，不显示负数。
   - 刷新页面：重连后从 reconnect.snapshot 拿到 phase_started_at_ms → Countdown 显示剩余时间（不重置）。

4. 在 src/protocol/adapter.ts 中：
   - 收到 phase.change envelope 时：将 server_time_ms 透传到 _applyPhase。
   - 收到 turn.begin envelope 时：同样处理（payload 含 phase_started_at_ms / phase_duration_ms / server_time_ms，若后端尚未推送 turn.begin 带这些字段，则在任务 1 契约中已要求补齐——本任务前端先 tolerant 接收）。
   - 收到 conn.pong 时：更新 _applyServerClockSample（让心跳期间持续校准偏移）。

5. 测试：
   - src/utils/__tests__/serverClock.test.ts：验证 getRemainingMs 在不同 offset 下的计算。
   - src/store/__tests__/gameStore.clockOffset.test.ts：验证 EMA 收敛。
   - 浏览器手工：
     - dev-up + WS 模式，进入 action 期，记录 Countdown 显示剩余。
     - 刷新页面（F5），Countdown 应继续显示对应剩余时间（误差 ≤ 1s）。
     - 把本地系统时间调快 10s，刷新页面，Countdown 仍正确（验证 offset 补偿）。

【禁止做的事】
- 不要用本地 setInterval 推进 Countdown。
- 不要在 Countdown 内调 transport.send。
- 不要把 serverClockOffsetMs 暴露给 UI 直接显示（仅 dev 调试条可显示）。
- 不要在 server_time_ms 缺失时崩溃（fallback 用 Date.now()）。
- 不要修改 PhaseStateMachine / TopBar 视觉。
- 不要在每个 phase.change 重置 serverClockOffsetMs（用 EMA 平滑）。
- 不要在 Countdown 显示毫秒（mm:ss 即可）。
- 不要把 offset 写入 mock store 的初始状态（默认 0）。

【验收标准】
1. gameStore 含 serverClockOffsetMs 与 _applyServerClockSample。
2. utils/serverClock.ts 工具齐全。
3. Countdown 用 rAF + 服务端时间戳计算剩余。
4. 刷新后 Countdown 继续显示剩余（误差 ≤ 1s）。
5. 本地时间偏移 10s 不影响 Countdown 正确性。
6. < 10s 心跳脉冲存在。
7. mock 模式下 Countdown 仍工作（mock gameLoop 必须填 phase_started_at_ms / phase_duration_ms / server_time_ms）。
8. tsc + build + 单元测试通过。
9. 不修改 PhaseStateMachine / TopBar / 其它业务组件。
10. dev-overlay（按 D）可显示 serverClockOffsetMs（仅 dev）。
```

### 后端子提示词

```
你是一名资深后端实时调度工程师。请为《外交风云》—— 人机混战 AI Diplomacy 后端实现自动 phase 推进调度器，让每个 running 房间在 WebSocket gateway 启动时自动按 phase_duration_ms 推进阶段。

【项目背景】
当前 PhaseService 是纯逻辑状态机，无后台调度。联调中 phase 停在 observe 直到手动调 debug API。本任务在 gateway 中为每个 running 房间起 asyncio task，每 1000ms 调用 maybe_advance_by_clock。

【同步完善期红线（强制遵守）】
1. 行动期不调 LLM 仍是红线。
2. 模型调用只在 resolve / arbitrate。
3. 不引入 PostgreSQL / Redis / Docker。
4. 不部署。
5. 协议字段变更前后端同步改并更新 docs/PROTOCOL_AUDIT.md。
6. mock 默认 LLM provider。
7. MVP 不重点 prompt injection 防护。
8. 不引入 API key。
9. dev-up + 浏览器手工 + smoke 联合验收。
10. 不破坏 PhaseService 已有 transition 表与逻辑。

【phase.change 协议契约】
（同前端子提示词；必须含 server_time_ms 字段）

【本任务允许做以下事情】

1. 新建 app/services/phase_scheduler.py：
   - class PhaseScheduler:
     - __init__(self, *, phase_service, settlement_service, repos, clock, tick_interval_s: float = 1.0)
     - _tasks: dict[str, asyncio.Task]
     - async def start_room(self, room_id: str): 创建 asyncio.create_task(self._room_loop(room_id))，存入 _tasks。
     - async def stop_room(self, room_id: str): cancel 对应 task。
     - async def shutdown(self): cancel 所有 task。
     - async def _room_loop(self, room_id):
       - try:
         while True:
           await asyncio.sleep(self.tick_interval_s)
           room = await repos.rooms.get(room_id)
           if room is None or room.status != "running":
             break
           current = await repos.state.get_current_turn(room_id)
           prev_phase = current.phase
           new_turn = await phase_service.maybe_advance_by_clock(room_id)
           if new_turn.phase != prev_phase or new_turn.arbitrate_phase != current.arbitrate_phase:
             # 阶段切换发生
             if new_turn.phase == "resolve":
               # 异步触发 settlement，不阻塞 loop
               asyncio.create_task(settlement_service.run_turn_settlement(room_id, new_turn.epoch, new_turn.turn))
       - except asyncio.CancelledError: pass
     - 写日志 info / debug 标注 room_id + 阶段切换。

2. 修改 app/api/websocket/gateway.py 与 app/main.py：
   - 在 FastAPI startup 事件中实例化 PhaseScheduler 单例（注入到 app.state）。
   - 在 RoomService.start_game 成功后调用 PhaseScheduler.start_room(room_id)（通过依赖注入或全局获取）。
   - 在 RoomService.leave_room 导致 room.status = aborted 或 finished 时调用 PhaseScheduler.stop_room。
   - shutdown 事件调用 PhaseScheduler.shutdown()。

3. 修改 app/protocol/outgoing.py 的 PhaseChangePayload：
   - 增加字段 server_time_ms: int。
   - TurnBeginPayload 同样增加 server_time_ms。

4. 修改 app/api/websocket/dispatcher.py 的 dispatch_phase_change：
   - 包装 envelope 时填充 server_time_ms = clock.now_ms()。

5. 修改 app/services/phase_service.py 的 begin_turn / advance_phase：
   - 写入 phase_started_at_ms 时不变；但生成 phase_change GameEvent payload 中加 server_time_ms = clock.now_ms()。
   - 修改 _emit_phase_change 工具（如有，否则新增）：构造 payload 时统一加 server_time_ms。

6. 修改 app/api/websocket/connection.py：
   - conn.pong 响应时增加 server_time_ms = clock.now_ms() 字段（让前端在心跳中持续校准时钟）。
   - 同步修改 ConnPongPayload schema。

7. 测试：
   - app/tests/test_phase_scheduler.py：
     - 使用 FrozenClock，启动 PhaseScheduler.start_room 后手动 advance clock，验证调度循环触发 maybe_advance_by_clock。
     - 房间 finished 后 task 自动退出。
     - shutdown 取消所有 task。
   - app/tests/test_settlement_triggered_by_scheduler.py：
     - 模拟 phase 切到 resolve，验证 settlement_service.run_turn_settlement 被异步调用。
   - 浏览器手工：dev-up 启动后房间进入 running 状态，无需手动 advance phase 也能在约 15s 后从 observe → action。

8. 在 README 联调启动节追加："后端自动按阶段时长推进，无需手动 advance"。

【禁止做的事】
- 不要用 background thread / multiprocessing；只用 asyncio。
- 不要让调度 loop 阻塞 settlement（settlement 必须 asyncio.create_task fire-and-forget）。
- 不要把调度逻辑写进 PhaseService（保持 PhaseService 纯逻辑）。
- 不要让调度 loop 在房间不存在时崩溃（None check）。
- 不要让 maybe_advance_by_clock 一次跨多个阶段（PhaseService 原约束保持）。
- 不要在调度 loop 内执行业务规则（仅 maybe_advance_by_clock + 触发 settlement）。
- 不要在 settlement 执行期间阻塞下一 tick。
- 不要把 task 引用泄漏（必须 cancel + await）。

【验收标准】
1. PhaseScheduler 类完整。
2. RoomService.start_game / leave_room 集成调度生命周期。
3. PhaseChangePayload / TurnBeginPayload / ConnPongPayload 包含 server_time_ms。
4. maybe_advance_by_clock 自动按时长推进；observe 15s → action 90s → resolve 30s。
5. 进入 resolve 自动触发 settlement_service.run_turn_settlement。
6. 房间 finished 后 task 自动退出。
7. uvicorn shutdown 取消所有调度 task 不报错。
8. pytest 全套通过；scheduler 测试用 FrozenClock。
9. ruff check 通过。
10. dev-up 启动后浏览器 WS 模式无需手动 advance 也能完整走完一回合。
```

### 预期产物（前端 + 后端）

**前端**：
- `src/store/gameStore.ts` serverClockOffsetMs + _applyServerClockSample。
- `src/utils/serverClock.ts`。
- `src/features/phaseSystem/Countdown.tsx` 重写为 rAF + 服务端时间。
- `src/protocol/adapter.ts` 处理 server_time_ms。
- 单元测试。

**后端**：
- `app/services/phase_scheduler.py`。
- `app/main.py` startup / shutdown 钩子。
- `app/services/room_service.py` 集成调度生命周期。
- `app/protocol/outgoing.py` PhaseChangePayload / TurnBeginPayload / ConnPongPayload 加 server_time_ms。
- `app/api/websocket/dispatcher.py` / `connection.py` 填充 server_time_ms。
- 单元测试 + README。

### 验收标准（端到端联合）

1. dev-up 启动后房间进入 running，无需手动 advance 也按 15s/90s/30s 推进。
2. 第三回合末自动进入 arbitrate.battle → epic → summary。
3. 进入 resolve 自动触发 settlement 并推送 ai.thinking。
4. 前端 Countdown 与后端 phase_duration_ms 严格对齐（误差 ≤ 1s）。
5. 刷新页面后 Countdown 继续显示正确剩余时间。
6. 本地系统时间偏移不影响 Countdown 正确性。
7. uvicorn 重启后房间数据丢失（内存仓储），但启动后无 task 残留。
8. pytest 全套通过；前端 tsc + build 通过。
9. mock 模式（前端 USE_WS=false）下 Countdown 仍工作。
10. docs/PROTOCOL_AUDIT.md 更新 server_time_ms 字段条目。

### 禁止事项

- 禁止用 thread / multiprocessing 调度。
- 禁止 settlement 阻塞调度 loop。
- 禁止调度逻辑写进 PhaseService。
- 禁止 task 引用泄漏。
- 禁止 Countdown 用本地 setInterval。
- 禁止把 serverClockOffsetMs 暴露给业务 UI。
- 禁止破坏 mock 默认行为。
- 禁止破坏已有 PhaseService transition 表。

---

## 任务 3：AI 性格 / 记忆系统升级（personality + diary + memory_depth）

### 使用场景

当前 SettlementService 调用 LLM 时 prompt 仅含本回合行动 + 当前状态 + 八势力性格简要。AI 不带"记忆"——每次结算都从零开始。前端 RelationsPanel 也不显示 AI 内心动机线索。本任务为每个 AI 势力实现 diary（按 memory_depth 截断的历史事件摘要），在 settlement prompt 中注入；同时把模型输出的 internal_thought 字段持久化到 diary，前端 RelationsPanel hover AI 势力时显示"AI 最近想法"线索（仅游戏结束后揭示）。

### 当前 mock / 初始状态

- 后端 PromptBuilder 不含 diary 字段。
- 后端 SettlementModelOutput 没有 internal_thought 字段。
- 没有 diary 仓储。
- 前端 RelationsPanel hover 时只显示四维 mini-bar 与说话风格，无 AI 想法线索。

### 契约对齐（端到端）

```
后端 diary 内部模型（不直接走协议；仅在 replay / ai.speak 中可见部分被前端使用）：
DiaryEntry {
  faction_id: FactionId,
  epoch: int,
  turn: int,
  internal_thought: str,   # AI 的真实想法（游戏中不可见）
  emotion: str,
  triggers: list[str],     # 引发本条想法的事件 id 或 actor faction
  created_at_ms: int
}

ai.speak envelope 中 payload.event 字段 GameEvent.payload 增加可选字段：
  internal_thought: string | null  // 默认 null；仅在 viewer == actor_faction 或 viewer 是房主调试模式下保留；其它情况后端在 dispatcher 中剥离

新增协议消息（可选）：
  S→C  replay.ai_diary_reveal  在游戏结束后或 epoch summary 时推送 AI 的完整 diary，供前端 ReplayPage 使用。

字段：
  p: {
    room_id, faction_id, entries: list[DiaryEntry]
  }
```

### 前端子提示词

```
你是一名资深前端叙事 UX 工程师。请为《外交风云》—— 人机混战 AI Diplomacy 前端在 RelationsPanel 与 ReplayPage 中接入 AI 内心独白（diary）展示，并在游戏结束前严格不泄漏。

【项目背景】
后端将通过 replay.ai_diary_reveal envelope 在游戏结束时一次性推送每个 AI 势力的完整 diary。RelationsPanel 在游戏进行中不显示 internal_thought（保持迷雾），仅在游戏结束（room.status=finished）后才在 hover 详情中显示一行"最近想法"。ReplayPage 中的 AIInnerThoughtPanel 接入完整 diary 数据。

【同步完善期红线（强制遵守）】
1. 行动期后端不调 LLM。
2. 模型调用只在 resolve / arbitrate。
3. 不引入 PostgreSQL / Redis / Docker。
4. 不部署。
5. 协议字段变更前后端同步并更新 docs/PROTOCOL_AUDIT.md。
6. mock 默认。
7. MVP 不重点 prompt injection 防护。
8. 不引入 API key。
9. dev-up + 浏览器手工 + smoke 联合验收。
10. 游戏进行中绝不能泄漏 AI internal_thought（前端 store / DOM / Network 都不能出现）。

【协议契约】
replay.ai_diary_reveal envelope:
p = { room_id, faction_id, entries: list[{ epoch, turn, internal_thought, emotion, triggers: list[string], created_at_ms }] }

ai.speak envelope 中 payload.event.payload.internal_thought：
  - 默认 null。
  - 仅当 viewer 自身势力 == actor_faction（即"AI 自己看自己"，无意义场景）或 room.status=finished 时后端保留。
  - 前端不依赖此字段；如果出现则忽略（防御性）。

【本任务允许做以下事情】

1. 在 src/protocol/types.ts 新增：
   - DiaryEntry 接口。
   - ReplayAIDiaryRevealPayload。
   - 加入 IncomingMessage union。

2. 在 src/protocol/adapter.ts 增加 replay.ai_diary_reveal 路由：
   - 调用 gameStore._applyAIDiaries({ faction_id, entries })。

3. 在 src/store/gameStore.ts 新增字段与 action：
   - aiDiaries: Record<FactionId, DiaryEntry[]>（默认 {}）。
   - _applyAIDiaries({ faction_id, entries }): 写入。
   - selector hasDiariesRevealed(): boolean = room.status === "finished" || Object.keys(aiDiaries).length > 0。

4. 修改 src/features/relationsPanel/FactionRowDetail.tsx：
   - 在 hover 展开内容底部新增"最近想法"区域：
     - 若 hasDiariesRevealed() && aiDiaries[factionId] 存在：显示该势力最新 1 条 diary entry（epoch.turn + emotion + internal_thought 截断 80 字符）。
     - 否则显示占位文案"此势力的想法仍是迷雾"，浅灰色斜体，不占据过多视觉空间。
   - 视觉保持原 GlowPanel 风格，颜色暗紫色。

5. 修改 src/features/replay/AIInnerThoughtPanel.tsx：
   - 优先消费 gameStore.aiDiaries[currentFocusFaction]；如为空则保留原 mock 模板生成。
   - 按 timeline 时间轴节点过滤显示对应 epoch.turn 的 diary entry。
   - 打字机效果显示 internal_thought 全文（不截断）。

6. 防御性处理：
   - 若收到的 ai.speak event.payload.internal_thought 不为 null 且 room.status !== "finished"：在 adapter 中剥离该字段后再写入 store（防御后端 bug）。
   - 在 dev 模式 console.warn 标注"可疑泄漏字段"。

7. 测试：
   - src/protocol/__tests__/adapter.diary.test.ts：模拟 replay.ai_diary_reveal envelope 注入 → store 字段写入。
   - 游戏进行中 RelationsPanel hover：占位文案显示，store 中 aiDiaries 为空。
   - 游戏结束后 hover：显示真实 internal_thought 摘要。
   - ReplayPage 中 AIInnerThoughtPanel 按时间轴切换。
   - 防御性剥离测试：模拟带 internal_thought 的 ai.speak 在 status=running 时被剥离。

【禁止做的事】
- 不要在游戏运行中以任何方式渲染 internal_thought。
- 不要把 aiDiaries 暴露到 EventStream / MapStage。
- 不要在 console.log 中打印 diary 内容（除了防御性 console.warn 标识"剥离"事件）。
- 不要修改 PublicSpeechBubble / PrivateMessageDrawer（这些是公开 / 密谈，不是 internal_thought）。
- 不要破坏 mock 模式的 AIInnerThoughtPanel 模板 fallback。
- 不要把 diary 写入 events 列表。
- 不要在 hover 详情中显示完整 diary（仅 1 条最新摘要）。
- 不要在 RelationsPanel 中显示 diary 触发的事件 id（不暴露内部 id）。

【验收标准】
1. ReplayAIDiaryRevealPayload 类型定义齐全。
2. adapter 路由 replay.ai_diary_reveal。
3. gameStore.aiDiaries 字段 + _applyAIDiaries。
4. RelationsPanel 游戏中显示占位；结束后显示真实摘要。
5. ReplayPage AIInnerThoughtPanel 接入真实 diary。
6. 防御性剥离生效。
7. tsc + build + 单元测试通过。
8. mock 模式不退化。
9. 游戏中 Network 面板与 store 中 aiDiaries 为空。
10. docs/PROTOCOL_AUDIT.md 更新条目。
```

### 后端子提示词

```
你是一名资深 AI 性格与记忆系统工程师。请为《外交风云》—— 人机混战 AI Diplomacy 后端实现 AI 势力 diary（内心独白记忆）系统，把模型 internal_thought 输出写入 diary 仓储，按 personality.memory_depth 截断历史注入下一回合 settlement prompt，并在游戏结束时通过 replay.ai_diary_reveal envelope 推送给前端。

【项目背景】
当前 SettlementService 每次结算独立，无历史记忆。FACTION_META 中已有 memory_depth 字段（铁冠帝国=3、星辉联邦=999、灰烬部族=2、暗潮商会=999 等）。本任务让 AI 真正"记仇"。

【同步完善期红线（强制遵守）】
1. 行动期不调 LLM。
2. 模型调用只在 resolve / arbitrate。
3. 不引入 PostgreSQL / Redis / Docker。
4. 不部署。
5. 协议字段变更前后端同步并更新 docs/PROTOCOL_AUDIT.md。
6. mock 默认 LLM provider。
7. MVP 不重点 prompt injection 防护。
8. 不引入 API key。
9. dev-up + 浏览器手工 + smoke 联合验收。
10. internal_thought 在游戏运行中不能推送给非 actor_faction 观察者。

【协议契约】
（同前端子提示词）

【本任务允许做以下事情】

1. 在 app/domain/models.py 新增 DiaryEntry(BaseModel):
   - faction_id, epoch, turn, internal_thought (str), emotion (str), triggers (list[str]), created_at_ms (int)
   - model_config = ConfigDict(strict=True)
   - internal_thought 长度 ≤ 600 字符。

2. 在 app/repositories/base.py 新增 DiaryRepository Protocol:
   - async def append(entry: DiaryEntry, *, room_id: str) -> None
   - async def list_recent(room_id: str, faction_id: FactionId, *, max_entries: int) -> list[DiaryEntry]
   - async def list_all_by_room(room_id: str) -> dict[FactionId, list[DiaryEntry]]

3. 在 app/repositories/memory.py 新增 MemoryDiaryRepository 实现：
   - 内部 dict[(room_id, faction_id), list[DiaryEntry]] + asyncio.Lock。
   - 按 created_at_ms 排序。
   - 返回 deep copy。

4. 更新 app/repositories/factory.py：Repositories 容器增加 diaries: DiaryRepository。

5. 修改 app/llm/output_schema.py 的 AISpeechItem：
   - 新增可选字段 internal_thought: str | None = None。

6. 修改 app/llm/output_schema.py 的 SettlementModelOutput：
   - 不变（diary 通过 ai_speeches 中带的 internal_thought 派生）。

7. 修改 app/llm/prompt_builder.py 的 SYSTEM_PROMPT_TEMPLATE：
   - 增加段落："对于每条 ai_speeches，请同时输出 internal_thought 字段（不超过 600 字符），代表该势力本回合的真实想法（与公开发言可以不一致；可以包含欺骗、记仇、计算等内心活动）。internal_thought 不会被其他势力看到。"
   - 增加段落：当 user prompt 含 "## 八势力近期内心独白" 时，AI 必须考虑这些记忆做决策。

8. 修改 app/game/settlement_aggregator.py 的 SettlementInput：
   - 新增字段 faction_recent_diaries: dict[FactionId, list[DiaryEntry]]。
   - aggregate 中按 FACTION_META[fid].personality["memory_depth"] 调用 DiaryRepository.list_recent(room_id, fid, max_entries=depth)。

9. 修改 app/llm/prompt_builder.py 的 build_settlement_prompt：
   - user 部分增加 "## 八势力近期内心独白（仅给模型，不对外）" 章节，遍历 faction_recent_diaries 输出每势力近 N 条 internal_thought 摘要。

10. 修改 app/services/settlement_service.py 的 run_turn_settlement：
    - 在 rule_resolver 完成后，从 model_output.ai_speeches 中提取每条 internal_thought：
      - 构造 DiaryEntry：faction_id=item.faction_id, epoch, turn, internal_thought=item.internal_thought or "（无内心独白）", emotion="（未知）"（若 model_output 不含 emotion 字段则占位）, triggers=[]（MVP 不计算）。
      - 调 repos.diaries.append(entry, room_id=room_id)。
    - 不修改 SettlementResult。

11. 修改 app/api/websocket/dispatcher.py：
    - 在 dispatch_to_room 包装 ai.speak / action.broadcast envelope 时，从 event.payload 剥离 internal_thought 字段（除非 viewer.faction_id == event.actor_faction，但 MVP 简化为始终剥离运行期）。
    - 添加 helper _strip_internal_for_runtime(event_payload: dict) -> dict。

12. 修改 app/services/replay_service.py：
    - build_replay 中 ai_internal_thoughts 字段从 repos.diaries.list_all_by_room(room_id) 真实读取，而非模板生成。
    - 字段格式：list[{ faction_id, epoch, turn, text: internal_thought }]。

13. 在 app/api/websocket/router.py 新增触发 replay.ai_diary_reveal 的时机：
    - PhaseScheduler 在 advance_phase 进入 status=finished 时（最后一次 arbitrate.summary 结束），调用 OutboundDispatcher.dispatch_diary_reveal(room_id) 把每个 AI 势力的 diary 推给房间所有玩家。
    - dispatch_diary_reveal 内部：for fid in 8 factions: 发送一条 replay.ai_diary_reveal envelope，payload={room_id, faction_id, entries}。

14. 修改 app/protocol/outgoing.py：
    - 新增 ReplayAIDiaryRevealPayload(room_id, faction_id, entries: list[dict])。
    - 加入 OUTGOING_PAYLOAD_TYPES 路由表。

15. 测试：
    - app/tests/test_diary_repository.py：append + list_recent 截断 + deep copy。
    - app/tests/test_aggregator_with_diary.py：memory_depth=3 时只注入近 3 条；memory_depth=999 时注入全部。
    - app/tests/test_settlement_writes_diary.py：run_turn_settlement 后 diaries 有写入。
    - app/tests/test_dispatcher_strips_internal.py：派发 envelope 时 internal_thought 被剥离。
    - app/tests/test_diary_reveal_on_finish.py：房间进入 finished 时推送 8 条 replay.ai_diary_reveal。

【禁止做的事】
- 不要把 diary 持久化到 PostgreSQL（MVP 仍内存）。
- 不要在每次 ai.speak 推送时带 internal_thought 给观察者（违反信息隔离）。
- 不要让 internal_thought 成为前端的"作弊查看器"——必须在 dispatcher 层剥离。
- 不要在 mock LLM client 中始终输出空 internal_thought（让 mock 也产出占位文本，便于联调验证 diary 链路）。
- 不要把 diary 写入 EventLog（与 events 解耦）。
- 不要让 memory_depth=999 导致 prompt 爆炸（增加 hard cap=80 条以防极端情况）。
- 不要在 build_settlement_prompt 中暴露 diary 给非对应势力（每势力的 diary 仅出现在该势力相关的 prompt 段落）。
- 不要把 ReplayAIDiaryRevealPayload 在游戏未结束时推送。

【验收标准】
1. DiaryEntry / DiaryRepository / MemoryDiaryRepository 完整。
2. Repositories 容器增加 diaries。
3. SettlementModelOutput 的 AISpeechItem 含可选 internal_thought。
4. PromptBuilder system 含 internal_thought 输出要求；user 含八势力近期内心独白章节。
5. SettlementInput 含 faction_recent_diaries，aggregate 按 memory_depth 截断。
6. SettlementService.run_turn_settlement 后 diaries 有写入。
7. Dispatcher 在运行期推送 envelope 时剥离 internal_thought。
8. PhaseScheduler 在 finished 时触发 dispatch_diary_reveal。
9. ReplayAIDiaryRevealPayload 与前端契约一致。
10. pytest 全套通过，覆盖 5 个测试文件。
```

### 预期产物（前端 + 后端）

**前端**：
- `src/protocol/types.ts` DiaryEntry + ReplayAIDiaryRevealPayload。
- `src/protocol/adapter.ts` 路由 + 防御性剥离。
- `src/store/gameStore.ts` aiDiaries + _applyAIDiaries。
- `src/features/relationsPanel/FactionRowDetail.tsx` 占位 + 揭示。
- `src/features/replay/AIInnerThoughtPanel.tsx` 真实数据。
- 单元测试。

**后端**：
- `app/domain/models.py` DiaryEntry。
- `app/repositories/base.py` / `memory.py` / `factory.py` DiaryRepository。
- `app/llm/output_schema.py` AISpeechItem.internal_thought。
- `app/llm/prompt_builder.py` system + user diary 段落。
- `app/game/settlement_aggregator.py` faction_recent_diaries。
- `app/services/settlement_service.py` 写入 diary。
- `app/api/websocket/dispatcher.py` 剥离 internal_thought + dispatch_diary_reveal。
- `app/services/phase_scheduler.py` / `room_service.py` finished 触发。
- `app/services/replay_service.py` 真实 diary 读取。
- `app/protocol/outgoing.py` ReplayAIDiaryRevealPayload。
- 5 个测试文件。

### 验收标准（端到端联合）

1. dev-up 启动 WS 模式，跑完一局：mock LLM 也能产出 internal_thought 占位（验证 diary 链路）。
2. memory_depth=3 的势力 prompt 只含近 3 条独白；999 的含全部（≤ hard cap）。
3. 游戏运行中前端 Network 面板与 store 中无 internal_thought 字段。
4. 游戏 finished 时前端收到 8 条 replay.ai_diary_reveal。
5. RelationsPanel 在 finished 后 hover 显示"最近想法"摘要。
6. ReplayPage AIInnerThoughtPanel 按时间轴显示真实 diary。
7. pytest 全套通过；前端 tsc + build + 单元测试通过。
8. mock 模式（USE_WS=false）下 ReplayPage 仍能显示模板独白（fallback）。
9. ruff + tsc 通过。
10. docs/PROTOCOL_AUDIT.md 更新两条字段。

### 禁止事项

- 禁止持久化 diary 到 PostgreSQL。
- 禁止运行期 envelope 带 internal_thought 给观察者。
- 禁止 internal_thought 写入 EventLog。
- 禁止 prompt 爆炸（hard cap=80）。
- 禁止跨势力泄漏 diary。
- 禁止游戏未结束推送 replay.ai_diary_reveal。
- 禁止 mock LLM 始终输出空 internal_thought（mock 也要产出占位）。
- 禁止前端在游戏中显示 internal_thought。

---

## 任务 4：MapStage 真实数据驱动（R3F 粒子地图 + 真实邻接）

### 使用场景

当前 MapStage 是 2D 占位圆盘 + 64 region 简化布局；邻接由 lat_lng 距离 < 30° 粗算。本任务在前端把 MapStage 升级为 R3F + 简化 SDF + GPU instanced 粒子（高质量档），并接入后端真实邻接图；后端则精确化 region 邻接计算（按 region.center_lat_lng 大圆距离 + 显式 neighbors 字段），并通过 turn.begin / reconnect.snapshot 推送给前端。

### 当前 mock / 初始状态

- 前端 MapStage 是 canvas2D 圆盘 + 占位区域；no R3F。
- 后端 MapRegion 没有 neighbors 字段；可见性服务的 adjacent_factions 用经纬度距离粗估。
- region.center_lat_lng 在 initializer 中虽 deterministic 但未保证视觉合理（势力可能非连续区块）。

### 契约对齐（端到端）

```
MapRegion 字段扩展（前后端严格一致）：
{
  id, owner, resource_value, development_level, terrain,
  center_lat_lng: [lat, lng],
  min_garrison, supply_lines,
  neighbors: list[string]   // 邻接 region id 列表（≤ 6 个），由后端在 initializer 中预计算
}

turn.begin / reconnect.snapshot payload 中的 regions 字段必须包含 neighbors。

resolve.map_diff payload 中 changes 字段扩展：
{
  region_id, prev_owner, new_owner, transition: "conquest"|"cede"|"negotiated"|"abandoned",
  animation_params: { direction, speed, particles }
}

border_updates 字段扩展：
{ between: [factionA, factionB], tension: 0~1, visual_state: "calm"|"tense"|"hostile_sparking"|"war_frontline" }
```

### 前端子提示词

```
你是一名资深前端 R3F 图形工程师。请为《外交风云》—— 人机混战 AI Diplomacy 前端把 MapStage 升级为 R3F + 简化 SDF + GPU instanced 粒子的真实数据驱动地图，沿用后端推送的 regions / neighbors / border_updates 字段。

【项目背景】
当前 MapStage 是 canvas2D 圆盘占位。R3F 实现在 mapQuality=high 时启用，mid/low 仍可保留 canvas2D。后端将通过 turn.begin 与 reconnect.snapshot 推送 regions[].neighbors，前端不再做距离粗算。

【同步完善期红线（强制遵守）】
1. 行动期后端不调 LLM。
2. 模型调用只在 resolve / arbitrate。
3. 不引入 PostgreSQL / Redis / Docker。
4. 不部署。
5. 协议字段变更前后端同步并更新 docs/PROTOCOL_AUDIT.md。
6. mock 默认。
7. MVP 不重点 prompt injection 防护。
8. 不引入 API key。
9. dev-up + 浏览器手工 + smoke 联合验收。
10. 不破坏 HUD 五区比例与设计系统组件。

【MapRegion 协议契约】
（同上）

【本任务允许做以下事情】

1. 在 src/mock/types.ts 与 src/protocol/types.ts 同步扩展 MapRegion：
   - 增加 neighbors: string[]（默认 []）。
   - 修改 mock/initialState.ts 的 createInitialState：基于 center_lat_lng 调 buildNeighbors（近邻取 4~6 个）。

2. 在 src/render/MapStageR3F.tsx 实现真实 R3F 实现：
   - 使用 @react-three/fiber 与 @react-three/drei（若未安装请加入 devDependencies）。
   - 球体 IcosahedronGeometry detail=4，半径=容器最短边*0.42。
   - 64 region：用 instancedMesh + per-instance attribute(color, strength) 实现填色。
   - 区域边界：基于 regions[].neighbors 构造边界三角形数组；用 Line2 + 发光 shader 绘制。
   - 城市光点：每 region 按 development_level 绘制 1~5 个 instanced points。
   - 贸易弧线 / 密谈射线 / 战争火花：保留原 effects/ 模块挂载点不变。
   - GPU 粒子：使用 InstancedMesh basic + custom vertex shader（fbm 噪声 + 时间动画），粒子上限按 uiStore.mapQuality：low ≤ 2000 / mid ≤ 4000 / high ≤ 8000。
   - shader 严格控制：禁止复杂 SDF / raymarching，最多 fbm + 简单发光 + alpha 衰减。

3. 修改 src/features/hud/MapStage.tsx：
   - 根据 uiStore.mapQuality：
     - high → 渲染 <MapStageR3F />
     - mid / low → 渲染原 canvas2D 实现 <MapStage2D />（保留）
   - 提供 quality 切换按钮（已在 SettingsPanel 中存在则不重复加）。

4. 在 src/store/gameStore.ts 中：
   - 修改 _applyMapDiff 接受 border_updates 字段，写入 borderTensionMap: Record<string, BorderTension>（key="factionA:factionB" sorted），含 tension + visual_state。
   - 修改 _applyTurnBegin / _applySnapshot 接受 regions[].neighbors 并写入 regions。

5. 修改 src/protocol/adapter.ts：
   - resolve.map_diff 包装 border_updates 透传到 _applyMapDiff。
   - turn.begin / reconnect.snapshot 中 regions 字段透传 neighbors。

6. R3F 与 store 解耦：
   - MapStageR3F 内部使用 useRef + useFrame 直接读 gameStore.getState()，不依赖 React re-render。
   - 仅 store 字段 invalidate 触发 useEffect 时重建 instanced 数据（约束在 region.owner / development_level / neighbors 变化时）。

7. 性能：
   - useFrame 中跳帧策略：粒子动画每 2 帧更新一次（high）/ 每 3 帧（mid）。
   - perfMonitor 检测 < 30fps 自动降级 mapQuality 一级。

8. 测试：
   - src/store/__tests__/gameStore.borderTension.test.ts 验证 _applyMapDiff 写入 borderTensionMap。
   - src/render/__tests__/buildNeighbors.test.ts 验证 mock buildNeighbors 输出（4~6 邻居，邻居与本节点 lat_lng 距离最近）。
   - 浏览器手工：dev-up + WS 模式：
     - 高质量档显示 R3F 球体 + 粒子 + 发光边界。
     - 战争发生时 border_updates 触发对应边界视觉状态切换。
     - 切到 low 档显示 canvas2D 实现。
     - FPS 保持 ≥ 45（mid）/ ≥ 60（high RTX）。

【禁止做的事】
- 不要写复杂 SDF 距离场 shader。
- 不要把粒子上限超过 8000（high）。
- 不要把 R3F 实现强制替换 canvas2D（mid/low 必须保留 canvas2D 路径）。
- 不要在 React state 中存粒子位置（必须 GPU）。
- 不要破坏 HUD 五区比例。
- 不要在 R3F 实现中调 transport.send。
- 不要在 R3F 内部读 events 列表全量（仅订阅 borderTensionMap / regions）。
- 不要把 mapQuality 默认值改成 high（默认 mid，避免低端设备崩溃）。

【验收标准】
1. MapRegion.neighbors 字段加入 protocol/types.ts 与 mock/types.ts。
2. mock buildNeighbors 输出每 region 4~6 邻居。
3. MapStageR3F 在 high 档启用，渲染球体 + 粒子 + 发光边界。
4. canvas2D 在 mid/low 档保留可用。
5. borderTensionMap 写入正确，visual_state 切换。
6. perfMonitor 自动降级生效。
7. tsc + build + 单元测试通过。
8. 浏览器手工：四种 quality（low/mid/high）下视觉差异显著，FPS 达标。
9. R3F 不与 store 整屏 re-render 耦合。
10. mock 模式下 high 档也能渲染（不依赖 WS）。
```

### 后端子提示词

```
你是一名资深后端地图工程师。请为《外交风云》—— 人机混战 AI Diplomacy 后端为 MapRegion 增加显式 neighbors 字段（在 initializer 中预计算），并升级 visibility 服务用 neighbors 代替距离粗算；同时让 resolve.map_diff 携带 border_updates 字段反映边境紧张度。

【项目背景】
当前 MapRegion 无 neighbors；adjacent_factions 用距离 < 30° 粗算。本任务让邻接精确化，并把边境紧张度从 relationships.value 派生写入 border_updates。

【同步完善期红线（强制遵守）】
1. 行动期不调 LLM。
2. 模型调用只在 resolve / arbitrate。
3. 不引入 PostgreSQL / Redis / Docker。
4. 不部署。
5. 协议字段变更前后端同步并更新 docs/PROTOCOL_AUDIT.md。
6. mock 默认 LLM provider。
7. MVP 不重点 prompt injection 防护。
8. 不引入 API key。
9. dev-up + 浏览器手工 + smoke 联合验收。
10. 不破坏已有 game_state 仓储 schema。

【MapRegion 协议契约】
neighbors: list[FactionId? no, region_id: str]（注意是 region_id，非 faction_id），≤ 6 个。

【本任务允许做以下事情】

1. 修改 app/domain/models.py 的 MapRegion：
   - 新增字段 neighbors: list[str] = []。
   - 约束 len(neighbors) ≤ 8。

2. 修改 app/game/map_init.py 的 build_initial_regions：
   - 先按原逻辑生成 64 region。
   - 再计算每 region 的 6 个最近邻（按 center_lat_lng 大圆距离）写入 neighbors。
   - 大圆距离用 haversine 公式：
     d = 2 * asin(sqrt(sin²((lat2-lat1)/2) + cos(lat1)*cos(lat2)*sin²((lng2-lng1)/2)))
   - 对每 region 按距离排序选前 6 个非自身 region 写入 neighbors。

3. 在 app/game/visibility.py 中：
   - 修改 adjacent_factions(region_id, regions)：
     - 先按 region_id 找到对应 MapRegion。
     - 用 region.neighbors 直接查 owner 集合（去重）。
     - 移除原 lat_lng 距离粗算路径，但保留 fallback：若 neighbors 为空（旧数据兼容）回退距离粗算并 log warning。

4. 修改 app/services/settlement_service.py 中 _build_map_diff：
   - 计算 border_updates：
     - 遍历所有相邻势力对（A, B）（A != B 且存在至少一对 region 邻接）。
     - tension = max(0, min(1, abs(rel.value) / 100))（若 rel.status 是 hostile / wary）。
     - visual_state:
       - hostile 且活跃战争中 → "war_frontline"
       - hostile → "hostile_sparking"
       - wary → "tense"
       - 其它 → "calm"
     - 写入 border_updates: list[{between, tension, visual_state}]。
   - 写入 ResolveMapDiff payload。

5. 修改 app/protocol/outgoing.py 的 ResolveMapDiffPayload：
   - changes: list[dict] 字段中允许 animation_params: dict。
   - 增加字段 border_updates: list[dict]（默认 []）。

6. 修改 app/api/websocket/dispatcher.py 的 dispatch_resolve_bundle：
   - 把 settlement_service 返回的 bundle.resolve_map_diff 含 border_updates 透传到 envelope。

7. 修改 app/services/room_service.py 的 start_game：
   - 调用 initializer 生成 regions 已含 neighbors（来自任务 4 修改的 build_initial_regions）。

8. 修改 reconnect snapshot payload 构造（在 router.py 或 connection.py 中）：
   - regions 字段必须含 neighbors（来自仓储 regions snapshot）。

9. 在 app/protocol/audit_helpers.py（或类似新模块）提供 ensure_region_has_neighbors(region) 校验工具，用于测试期间断言。

10. 测试：
    - app/tests/test_map_neighbors.py：build_initial_regions 后每 region.neighbors 长度 4~6（边缘可能 4，内部 6）。
    - app/tests/test_visibility_with_neighbors.py：adjacent_factions 用 neighbors 返回正确 owner 集合。
    - app/tests/test_settlement_border_updates.py：resolve_map_diff.border_updates 字段齐全。
    - app/tests/test_reconnect_snapshot_neighbors.py：snapshot 中 regions 含 neighbors。

【禁止做的事】
- 不要破坏已有 64 region deterministic 同 seed 一致性（haversine 计算必须 deterministic）。
- 不要让 neighbors 出现自身。
- 不要让 neighbors 出现 owner=None 的 region（如有）。
- 不要让 border_updates 包含 A==B 的对。
- 不要在 visibility.py 中移除 fallback（兼容旧 snapshot）。
- 不要把 neighbors 写入 EventLog。
- 不要把 border_updates 写入持久化的 SettlementResult（仅 outbound bundle 字段）。
- 不要在 settlement_service 中重新计算 neighbors（仅读取 regions）。

【验收标准】
1. MapRegion.neighbors 字段加入 domain model。
2. build_initial_regions 输出每 region 含 4~6 个 neighbors。
3. adjacent_factions 用 neighbors 路径优先，fallback 距离。
4. resolve.map_diff payload 含 border_updates。
5. snapshot regions 含 neighbors。
6. 4 个测试文件通过。
7. ruff + pytest 全套通过。
8. deterministic 同 seed 两次 initializer 输出一致（含 neighbors）。
9. ResolveMapDiffPayload schema 更新。
10. docs/PROTOCOL_AUDIT.md 更新 neighbors / border_updates 字段。
```

### 预期产物（前端 + 后端）

**前端**：
- `src/mock/types.ts` / `src/protocol/types.ts` MapRegion.neighbors。
- `src/mock/initialState.ts` buildNeighbors。
- `src/render/MapStageR3F.tsx`（R3F 实现）。
- `src/features/hud/MapStage.tsx` 按 quality 切换。
- `src/store/gameStore.ts` borderTensionMap + _applyMapDiff 更新。
- 单元测试。

**后端**：
- `app/domain/models.py` MapRegion.neighbors。
- `app/game/map_init.py` haversine + neighbors。
- `app/game/visibility.py` 优先 neighbors。
- `app/services/settlement_service.py` border_updates 生成。
- `app/protocol/outgoing.py` ResolveMapDiffPayload + border_updates。
- `app/api/websocket/dispatcher.py` / `router.py` snapshot regions 含 neighbors。
- 4 个测试文件。

### 验收标准（端到端联合）

1. dev-up WS 模式：高质量档 R3F 球体显示，邻接边界精确。
2. 战争发生时对应边界 visual_state="war_frontline"。
3. mid/low 档 canvas2D 工作正常。
4. FPS 达标（high RTX≥60，mid≥45，low≥30）。
5. reconnect 后 regions 含 neighbors，前端不重新计算。
6. pytest + tsc + build + 单元测试通过。
7. 同 seed deterministic。
8. mock 模式高档也能渲染。
9. perfMonitor 自动降级生效。
10. docs/PROTOCOL_AUDIT.md 更新。

### 禁止事项

- 禁止复杂 SDF / raymarching。
- 禁止粒子 > 8000。
- 禁止替换 canvas2D（mid/low 保留）。
- 禁止 React state 存粒子位置。
- 禁止破坏 HUD 比例。
- 禁止 R3F 调 transport。
- 禁止 neighbors 自包含 / 空 owner。
- 禁止 border_updates 持久化。

---

## 任务 5：战斗与领土易手完整闭环

### 使用场景

当前 RuleResolver 战斗公式已实现简化版；但领土易手在 settlement_service 中只是 stub，前端 BattleResultCard 无真实 atk_loss / def_loss / territory_captured 字段；地图不应用 region.owner 变更动画。本任务把"军令 → 战斗判定 → 领土易手 → 地图变更 → 前端动画"完整打通。

### 当前 mock / 初始状态

- 后端 RuleResolver 输出 BattleResultRecord，但 settlement_service 未把 territory_captured=True 的 region 写入 GameStateRepository.save_regions。
- 后端 resolve.map_diff 字段虽存在但 changes 列表常为空。
- 前端 BattleResultCard 接收 mock 字段；MapStage 收到 region.owner 变更没有"领土流入"动画。

### 契约对齐（端到端）

```
resolve.events payload 中可包含 kind="battle" 事件：
{
  id, kind: "battle", actor_faction: attacker, target_faction: defender,
  payload: {
    region_id, atk_loss, def_loss, territory_captured: bool,
    morale_shift: number, narrative: string,
    attacker_remaining_troops: number,
    defender_remaining_troops: number
  }
}

resolve.map_diff.changes 中每条 region 变更：
{
  region_id, prev_owner, new_owner,
  transition: "conquest" | "cede" | "negotiated" | "abandoned",
  animation_params: { direction: "south_to_north"|"north_to_south"|..., speed: number, particles: "aggressive"|"neutral" }
}
```

### 前端子提示词

```
你是一名资深前端战斗动画工程师。请为《外交风云》—— 人机混战 AI Diplomacy 前端把 BattleResultCard 与 MapStage 升级为消费后端真实战斗与领土易手字段，触发 ScreenShake、BorderSparkBoost、领土颜色流入动画。

【项目背景】
后端 resolve.events 含 kind="battle" 完整字段；resolve.map_diff.changes 含真实 region owner 变更与 animation_params。前端任务 13（战争动画）已实现基础骨架；本任务接入真实数据。

【同步完善期红线（强制遵守）】
1. 行动期后端不调 LLM。
2. 模型调用只在 resolve / arbitrate。
3. 不引入 PostgreSQL / Redis / Docker。
4. 不部署。
5. 协议字段变更前后端同步并更新 docs/PROTOCOL_AUDIT.md。
6. mock 默认。
7. MVP 不重点 prompt injection 防护。
8. 不引入 API key。
9. dev-up + 浏览器手工 + smoke 联合验收。
10. 不破坏已有 EffectsLayer / war effects 实现。

【契约约定】
（同上）

【本任务允许做以下事情】

1. 在 src/mock/types.ts 与 src/protocol/types.ts 中扩展：
   - BattleEvent payload 字段：region_id / atk_loss / def_loss / territory_captured / morale_shift / narrative / attacker_remaining_troops / defender_remaining_troops。
   - RegionChange 字段：region_id / prev_owner / new_owner / transition / animation_params。

2. 修改 src/store/gameStore.ts：
   - _applyMapDiff 处理 changes 列表：对每条 change：
     - updateRegionOwner(region_id, new_owner)。
     - pushEvent kind=battle（若来自 battle event）。
     - 写入 regionTransitionLog: list（保留最近 20 条，供动画系统消费）。

3. 修改 src/effects/war/BattleResultCard.tsx：
   - props 接受真实字段（region_id / atk_loss / def_loss / territory_captured / morale_shift / narrative / attacker_remaining_troops / defender_remaining_troops）。
   - ScrollNumber 滚动 atk_loss / def_loss / 双方剩余兵力。
   - territory_captured=true 时显示"领土易主"红色高亮 + 一行 narrative。
   - 卡片背景半透明黑 + 双方 Glow 描边对撞。

4. 修改 src/effects/war/useEffectsBus.ts（或对应触发逻辑）：
   - 监听 events 末尾追加 kind=battle 时：
     - 触发 ScreenShake 重 → 中 → 轻（共 1.5s）。
     - 触发 BorderSparkBoost 闪烁 800ms。
     - territory_captured=true 时额外触发 RegionInflowAnimation（见 5）。

5. 新建 src/effects/war/RegionInflowAnimation.tsx：
   - props: { region_id, new_owner, animation_params }。
   - 视觉：从 animation_params.direction 方向，new_owner 的 Glow 色"液体流入"目标 region 1.2s。
   - 在 MapStageR3F 中作为 instanced overlay 实现（low/mid 档退化为 CSS 渐变填充）。
   - 完成后通过 useEffectsBus 标记 done，自动清理。

6. 修改 src/render/MapStageR3F.tsx 与 MapStage2D.tsx：
   - 订阅 gameStore.regions 变化；region.owner 变更时 instance attribute color 平滑过渡（0.8s），同时调 useEffectsBus 触发 RegionInflowAnimation。
   - 避免颜色"瞬变"。

7. 测试：
   - src/store/__tests__/gameStore.regionChange.test.ts 验证 updateRegionOwner + regionTransitionLog。
   - src/effects/__tests__/useEffectsBus.battle.test.ts 模拟 battle event 触发 ScreenShake + Boost。
   - 浏览器手工：
     - dev-up WS 模式跑完一回合，至少触发一次 battle（mock LLM 输出含 territory_captured=true）。
     - BattleResultCard 显示真实数字 + 双方对撞。
     - 地图对应 region 颜色 1.2s 内流入新 owner 颜色。
     - 整体 60fps（high）/ 45fps（mid）。

【禁止做的事】
- 不要把战斗判定写在前端（仅渲染后端推送）。
- 不要 ScreenShake > 8px。
- 不要锁住玩家输入（CommandTerminal 仍可用，除非阶段限制）。
- 不要破坏任务 11 / 12 / 13 已实现 effects。
- 不要把 BattleResultCard 做成普通 toast。
- 不要省略 ScrollNumber 战损动画。
- 不要让 region 颜色瞬变（必须平滑过渡）。
- 不要在 R3F 内 React state 存颜色（instance attribute）。

【验收标准】
1. BattleEvent / RegionChange 字段类型对齐契约。
2. gameStore._applyMapDiff 处理 changes + regionTransitionLog。
3. BattleResultCard 显示真实字段。
4. useEffectsBus 触发 ScreenShake + Boost + RegionInflowAnimation。
5. region 颜色平滑过渡（0.8s）。
6. low/mid 档 CSS 渐变 fallback。
7. ScreenShake ≤ 8px。
8. tsc + build + 单元测试通过。
9. 浏览器手工战斗触发完整闭环。
10. 60/45/30 fps 按 quality 达标。
```

### 后端子提示词

```
你是一名资深后端战斗与领土工程师。请为《外交风云》—— 人机混战 AI Diplomacy 后端把战斗判定到领土易手的链路完整打通，让 RuleResolver 输出 → SettlementService 应用 → GameStateRepository 持久化 → resolve.map_diff outbound 字段全链路一致。

【项目背景】
RuleResolver 已输出 BattleResultRecord，但 SettlementService 未真正应用 territory_captured 到 regions；resolve.map_diff.changes 常为空。本任务把闭环打通。

【同步完善期红线（强制遵守）】
1. 行动期不调 LLM。
2. 模型调用只在 resolve / arbitrate。
3. 不引入 PostgreSQL / Redis / Docker。
4. 不部署。
5. 协议字段变更前后端同步并更新 docs/PROTOCOL_AUDIT.md。
6. mock 默认。
7. MVP 不重点 prompt injection 防护。
8. 不引入 API key。
9. dev-up + 浏览器手工 + smoke 联合验收。
10. 不破坏 RuleResolver 已有公式（战损 / 地形 / 多线惩罚）。

【契约约定】
（同前端子提示词）

【本任务允许做以下事情】

1. 修改 app/game/rule_resolver.py：
   - BattleResultRecord 增加字段 attacker_remaining_troops / defender_remaining_troops。
   - _compute_battle 计算后填充。
   - apply_map_changes(input, model_output, battle_results) 真实实现：
     - 遍历 battle_results：territory_captured=true 时 emit RegionChange(region_id, prev_owner, new_owner=attacker, transition="conquest", animation_params=_derive_animation_params(attacker_lat_lng, defender_lat_lng))。
     - 模型 map_change_suggestions（非战斗类）只接受 attacker.military_in_region > defender.military_in_region * 1.2 的情形，转为 transition="negotiated"。
   - _derive_animation_params：基于两势力 capital region 经纬度判断 direction（south_to_north/north_to_south/east_to_west/west_to_east），speed=1.0~1.5，particles="aggressive" if conquest else "neutral"。

2. 修改 app/services/settlement_service.py 的 run_turn_settlement：
   - 在 rule_resolver.resolve 返回 SettlementResult 后：
     - 应用 region_changes 到 GameStateRepository：
       - 拿 current regions，按 region_changes 修改 owner，并 reset development_level=0.3、resistance=0.5（新占领惩罚，对应设计文档"新占领区惩罚"）。
       - save_regions(room_id, regions)。
     - 把 region_changes 透传到 _build_map_diff。
   - _build_map_diff 输出 changes 字段含 region_id / prev_owner / new_owner / transition / animation_params。
   - _build_resolve_events 输出 kind=battle 事件，payload 含 attacker_remaining_troops / defender_remaining_troops。

3. 修改 app/protocol/outgoing.py 的 ResolveMapDiffPayload.changes：
   - 字段约束（schema 内不强制结构，但文档化）：每条 dict 必须含 region_id / prev_owner / new_owner / transition / animation_params。

4. 修改 app/domain/models.py 的 MapRegion：
   - 增加可选字段 resistance: float = 0.0（新占领惩罚字段；MVP 仅记录，不参与公式）。
   - 增加可选字段 captured_at_turn: int | None = None。

5. 测试：
   - app/tests/test_rule_resolver_battle.py：扩展验证 attacker_remaining_troops / defender_remaining_troops。
   - app/tests/test_settlement_applies_region_changes.py：验证 territory_captured=true 后 GameStateRepository.regions 中 owner 已变更，development_level=0.3，captured_at_turn=current.turn。
   - app/tests/test_resolve_map_diff_changes.py：bundle.resolve_map_diff.changes 含完整字段。
   - app/tests/test_animation_params.py：_derive_animation_params 在不同方位返回合理 direction。

【禁止做的事】
- 不要让 territory_captured=true 直接消除被攻击势力（应保留其它 region，灭国条件由后端规则单独判断，本任务不实现灭国判断）。
- 不要在 RuleResolver 内调 GameStateRepository（仅返回 SettlementResult）。
- 不要让模型 map_change_suggestions 绕过兵力检查直接修改 owner。
- 不要在 settlement_service 应用 region_changes 时跳过 development_level reset。
- 不要在 BattleResultRecord 中省略 attacker_remaining_troops / defender_remaining_troops。
- 不要让 animation_params 的 direction 字段返回非法值。
- 不要破坏已有战损公式。
- 不要把 region_changes 写入 EventLog 而忘了写 GameStateRepository。

【验收标准】
1. RuleResolver.BattleResultRecord 含 attacker/defender remaining troops。
2. _compute_battle 正确填充剩余兵力。
3. apply_map_changes 输出 RegionChange 列表（含 animation_params）。
4. SettlementService 真实写入 GameStateRepository.regions（new_owner + reset development）。
5. _build_map_diff.changes 字段齐全。
6. _build_resolve_events kind=battle payload 齐全。
7. resistance / captured_at_turn 字段加入 MapRegion。
8. 4 个测试文件通过。
9. ruff + pytest 全套通过。
10. mock LLM 输出含 territory_captured=true 的样本时端到端流水线完整。
```

### 预期产物（前端 + 后端）

**前端**：
- `src/protocol/types.ts` / `src/mock/types.ts` BattleEvent + RegionChange 扩展。
- `src/store/gameStore.ts` _applyMapDiff + regionTransitionLog。
- `src/effects/war/BattleResultCard.tsx` 真实字段。
- `src/effects/war/RegionInflowAnimation.tsx`（新）。
- `src/effects/war/useEffectsBus.ts` 触发逻辑。
- `src/render/MapStageR3F.tsx` / `MapStage2D.tsx` 颜色平滑过渡。
- 单元测试。

**后端**：
- `app/game/rule_resolver.py` BattleResultRecord + apply_map_changes + _derive_animation_params。
- `app/services/settlement_service.py` 应用 region_changes。
- `app/domain/models.py` MapRegion.resistance / captured_at_turn。
- `app/protocol/outgoing.py` ResolveMapDiffPayload 字段文档化。
- 4 个测试文件。

### 验收标准（端到端联合）

1. 浏览器 WS 模式跑完一回合至少触发一次 battle。
2. BattleResultCard 显示真实战损 + 双方剩余兵力。
3. territory_captured=true 时地图对应 region 颜色 1.2s 流入新 owner。
4. 后端 GameStateRepository.regions 中 owner 真实变更。
5. 下一回合 turn.begin / snapshot 中 region.owner 反映新归属。
6. development_level=0.3 reset 生效（验证 settlement 中 economy 计算受影响）。
7. pytest + tsc + build 通过。
8. mock 模式下注入 fake settlement output 含 territory_captured 时同样工作。
9. ScreenShake ≤ 8px。
10. docs/PROTOCOL_AUDIT.md 更新 BattleEvent / RegionChange 字段。

### 禁止事项

- 禁止前端战斗判定。
- 禁止 RuleResolver 调仓储。
- 禁止模型绕过兵力检查改 owner。
- 禁止跳过 development reset。
- 禁止 ScreenShake > 8px。
- 禁止破坏战损公式。
- 禁止把 region_changes 漏写 GameStateRepository。
- 禁止 animation_params direction 非法值。

---

## 任务 6：回放系统真实落地（ReplayService + ReplayPage）

### 使用场景

后端 ReplayService 已存在但很多字段是占位（如 ai_internal_thoughts 用模板生成）。前端 ReplayPage 当前从 mock fixtures 加载。本任务把后端 ReplayService 升级为真实数据驱动（消费 EventLog / MessageLog / DiaryRepository / SettlementRepository / GameStateRepository），前端 ReplayPage 改为通过 REST `/debug/v1/rooms/{room_id}/replay` 拉取真实 ReplayDTO；游戏结束时自动跳转。

### 当前 mock / 初始状态

- 后端 ReplayService.build_replay 部分字段 hardcode 或模板生成。
- 前端 ReplayPage 默认从 src/mock/replayFixtures.ts 加载。
- 游戏结束后没有自动跳转 /replay。

### 契约对齐（端到端）

```
REST GET /debug/v1/rooms/{room_id}/replay → ReplayDTO（已在后端 outgoing 不算 envelope，REST 直接返回 JSON）。

新增 outbound envelope：
  S→C  room.finished  房间结束通知
  p: {
    room_id, winner: FactionId | null, final_narration: string,
    replay_available: bool
  }

前端收到 room.finished 后：
  uiStore.setGameFinished(payload)
  3s 后自动跳转 /replay?room=<room_id>（或显示按钮供玩家点击）

ReplayDTO 字段（沿用任务 19 定义）：
  room_id, generated_at_ms, mode, total_epochs, total_turns,
  timeline, public_events, private_messages,
  ai_internal_thoughts, faction_curves, relationship_snapshots,
  key_moments, famous_quotes, betrayal_events, deception_stats,
  final_factions, winner, final_narration
```

### 前端子提示词

```
你是一名资深前端复盘体验工程师。请为《外交风云》—— 人机混战 AI Diplomacy 前端把 ReplayPage 从 mock fixtures 升级为通过 REST 拉取真实 ReplayDTO，并在游戏结束时自动跳转。

【项目背景】
后端将通过 REST `/debug/v1/rooms/{room_id}/replay` 返回完整 ReplayDTO。游戏结束时后端推送 room.finished envelope。前端 ReplayPage 当前消费 mock fixtures。

【同步完善期红线（强制遵守）】
1. 行动期后端不调 LLM。
2. 模型调用只在 resolve / arbitrate。
3. 不引入 PostgreSQL / Redis / Docker。
4. 不部署。
5. 协议字段变更前后端同步并更新 docs/PROTOCOL_AUDIT.md。
6. mock 默认。
7. MVP 不重点 prompt injection 防护。
8. 不引入 API key。
9. dev-up + 浏览器手工 + smoke 联合验收。
10. 不破坏 ReplayPage 视觉与组件结构。

【协议契约】
room.finished envelope:
p = { room_id, winner: FactionId | null, final_narration: string, replay_available: bool }

REST GET /debug/v1/rooms/{room_id}/replay 返回 ReplayDTO JSON。

【本任务允许做以下事情】

1. 在 src/protocol/types.ts 新增 RoomFinishedPayload + 加入 IncomingMessage union。

2. 在 src/protocol/adapter.ts 增加 room.finished 路由：
   - 调 gameStore._applyRoomFinished({ winner, final_narration, replay_available })。
   - 同步调 uiStore.setGameFinishedBanner({ winner, final_narration }) 显示横幅。

3. 在 src/store/gameStore.ts 新增字段：
   - winner: FactionId | null
   - finalNarration: string
   - 修改 _applyRoomFinished。

4. 在 src/store/uiStore.ts 新增 setGameFinishedBanner / 倒计时跳转字段。

5. 新建 src/api/replayApi.ts：
   - export async function fetchReplay(roomId: string): Promise<ReplayDTO>。
   - 用 fetch(ENV.backendRestBase + '/rooms/' + roomId + '/replay')，超时 10s。
   - 失败时返回 mock fixtures（fallback）。

6. 修改 src/pages/ReplayPage.tsx：
   - 路由参数从 useSearchParams 拿 room=...，若有则 fetchReplay(roomId)。
   - loading 状态显示 LoadingHologram。
   - 加载完成后填充原有组件（ReplayTimeline / PrivateMessageLog / AIInnerThoughtPanel / FactionCurves / RelationshipNetwork / KeyMoments / ShareBar / ReplayControls）。
   - 加载失败显示 ErrorPanel + 一个"使用 mock 数据回退"按钮。

7. 修改 src/app/routes.tsx（或 GamePage）：
   - 监听 gameStore.winner / status==="finished"。
   - 显示 3s 倒计时 banner "纪元终结，复盘即将开启..."。
   - 倒计时结束跳转 /replay?room=<room_id>。
   - 也允许玩家点击立即跳转。

8. 测试：
   - src/protocol/__tests__/adapter.roomFinished.test.ts。
   - src/api/__tests__/replayApi.test.ts（用 msw 或 fetch mock）。
   - 浏览器手工：跑完整局后看见结束 banner + 3s 跳转 /replay；ReplayPage 显示真实数据。

【禁止做的事】
- 不要在 ReplayPage 内调 transport.send（仅 REST 拉取）。
- 不要把 fetchReplay 失败处理成静默白屏。
- 不要在 banner 中显示堆栈错误。
- 不要在 ReplayPage 启动 mock gameLoop。
- 不要破坏 ReplayPage 原视觉风格。
- 不要把 replay 数据写入 gameStore（保持 replay 独立 store 或 page-level state）。
- 不要在 banner 中暴露 token。
- 不要把跳转时长改为 0（玩家需要看 narration）。

【验收标准】
1. RoomFinishedPayload 类型定义齐全。
2. adapter 路由 + gameStore 字段写入。
3. fetchReplay 实现 + fallback。
4. ReplayPage 真实数据驱动。
5. 游戏结束 3s banner + 跳转。
6. ErrorPanel + fallback 按钮可用。
7. tsc + build + 单元测试通过。
8. 浏览器手工跑完整局复盘可见。
9. mock 模式（USE_WS=false）下 fallback 工作。
10. docs/PROTOCOL_AUDIT.md 更新 room.finished 字段。
```

### 后端子提示词

```
你是一名资深后端复盘数据工程师。请为《外交风云》—— 人机混战 AI Diplomacy 后端升级 ReplayService.build_replay 为真实数据驱动，并在游戏结束时推送 room.finished envelope。

【项目背景】
当前 ReplayService.build_replay 部分字段占位（如 ai_internal_thoughts 用模板）。本任务接入任务 3 实现的 DiaryRepository、EventLog、MessageLog、SettlementRepository。

【同步完善期红线（强制遵守）】
1. 行动期不调 LLM。
2. 模型调用只在 resolve / arbitrate。
3. 不引入 PostgreSQL / Redis / Docker。
4. 不部署。
5. 协议字段变更前后端同步并更新 docs/PROTOCOL_AUDIT.md。
6. mock 默认。
7. MVP 不重点 prompt injection 防护。
8. 不引入 API key。
9. dev-up + 浏览器手工 + smoke 联合验收。
10. 不修改 ReplayDTO 已有字段结构（仅填充更真实数据）。

【契约约定】
room.finished envelope:
p = { room_id, winner: FactionId | null, final_narration: string, replay_available: bool }

【本任务允许做以下事情】

1. 修改 app/services/replay_service.py 的 build_replay：
   - ai_internal_thoughts: 从 repos.diaries.list_all_by_room(room_id) 真实读取，按 {faction_id, epoch, turn, text} 排序输出。
   - faction_curves: 真实从 SettlementResult 累积 total_power 历史（每 epoch.turn 末取一次）。
   - relationship_snapshots: 每 epoch 末从 EventLog 中 last phase=arbitrate.summary 时刻的 relationships state（如果没保存则从 GameStateRepository 取最后一份）。
   - key_moments: priority=P0 事件全集。
   - famous_quotes: 从 MessageLog 取 culture_impact.delta ≥ 8 对应玩家发言（join SettlementResult.culture_impacts）。
   - betrayal_events: kind in (betrayal, declare_war) 的事件。
   - deception_stats: 简化计算（任务 19 占位 OK）。
   - final_factions: GameStateRepository.get_factions(room_id)。
   - winner: 计算 total_power 最高的 faction（若有 eliminated 则按设计文档判断军事 / 经济 / 外交 / 文化 / 生存胜利）。
   - final_narration: 从 SettlementResult.narrative_events 中最后一条 kind=narration 取出，或用模板"纪元 X 终结。{winner_name} 以 {advantage} 胜出。"。

2. 在 app/services/phase_scheduler.py（任务 2）的 advance_phase 进入 status=finished 时：
   - 调 replay_service.build_replay 一次（让 ReplayRepository 写入）。
   - 调 OutboundDispatcher.dispatch_room_finished(room_id, replay_dto)。
   - 调 OutboundDispatcher.dispatch_diary_reveal(room_id)（任务 3 已实现）。

3. 新增 app/api/websocket/dispatcher.py 的 dispatch_room_finished：
   - 构造 RoomFinishedPayload(room_id, winner, final_narration, replay_available=True)。
   - 包装为 envelope t="room.finished" 推送给房间所有玩家。

4. 修改 app/protocol/outgoing.py：
   - 新增 RoomFinishedPayload(BaseModel)。
   - 加入 OUTGOING_PAYLOAD_TYPES 路由表。

5. 修改 app/api/rest/debug.py 的 GET /debug/v1/rooms/{room_id}/replay：
   - 调 replay_service.build_replay(room_id) 返回 ReplayDTO.model_dump()。
   - room.status != finished 时仍允许返回（当作"中途快照"，但 final_narration 字段含"游戏尚未结束"）。

6. 测试：
   - app/tests/test_replay_real_data.py：跑完整局后 build_replay 各字段非空且来自真实 EventLog/Diary/SettlementResult。
   - app/tests/test_room_finished_dispatch.py：finished 时 dispatch_room_finished 被调用。
   - app/tests/test_replay_rest_endpoint.py：REST 返回完整 ReplayDTO。

【禁止做的事】
- 不要在 build_replay 中修改 EventLog / MessageLog（仅读）。
- 不要在 room.status != finished 时返回 final_narration="游戏已结束"（如实标注）。
- 不要让 deception_stats 输出虚假数字（占位即可，但加注释"MVP 简化"）。
- 不要把 ReplayDTO 在游戏中频繁推送（仅 finished 后一次 / REST 主动拉取）。
- 不要让 dispatch_room_finished 在 finished 检测前误触发（必须 status 真正变 finished 后调用）。
- 不要在 ReplayDTO 中泄漏 token / api_key。
- 不要把 ai_internal_thoughts 在 status != finished 时通过 REST 暴露（应在 REST handler 中 status 检查；如果 != finished 则把 ai_internal_thoughts 字段置空 list）。
- 不要破坏已有 ReplayDTO 字段结构。

【验收标准】
1. ReplayService.build_replay 各字段真实数据驱动。
2. PhaseScheduler 在 finished 时调 build_replay + dispatch_room_finished + dispatch_diary_reveal。
3. RoomFinishedPayload 字段对齐前端契约。
4. REST endpoint 返回完整 ReplayDTO。
5. room.status != finished 时 ai_internal_thoughts 置空。
6. 3 个测试文件通过。
7. ruff + pytest 全套通过。
8. mock LLM 跑完一局 build_replay 数据合理。
9. winner 计算覆盖军事/经济/外交/文化/生存 5 种胜利条件。
10. docs/PROTOCOL_AUDIT.md 更新 room.finished 字段。
```

### 预期产物（前端 + 后端）

**前端**：
- `src/protocol/types.ts` RoomFinishedPayload。
- `src/protocol/adapter.ts` 路由。
- `src/store/gameStore.ts` winner / finalNarration。
- `src/api/replayApi.ts` fetchReplay。
- `src/pages/ReplayPage.tsx` 真实数据驱动。
- `src/app/routes.tsx`（或 GamePage）跳转逻辑。
- 单元测试。

**后端**：
- `app/services/replay_service.py` 真实数据驱动。
- `app/api/websocket/dispatcher.py` dispatch_room_finished。
- `app/protocol/outgoing.py` RoomFinishedPayload。
- `app/api/rest/debug.py` replay endpoint 更新。
- `app/services/phase_scheduler.py` finished 时触发。
- 3 个测试文件。

### 验收标准（端到端联合）

1. dev-up WS 模式跑完整局，游戏结束时前端显示结束 banner。
2. 3s 后自动跳 /replay。
3. ReplayPage 显示真实 timeline / 密谈 / 内心独白 / 曲线。
4. winner 字段正确。
5. REST 端点返回完整 ReplayDTO。
6. mock 模式下 fallback 工作。
7. pytest + tsc + build 通过。
8. 游戏未结束时 ai_internal_thoughts 字段为空。
9. PhaseScheduler 进入 finished 时一次性触发 3 个推送（room.finished + diary_reveal）。
10. docs/PROTOCOL_AUDIT.md 更新。

### 禁止事项

- 禁止 build_replay 修改 EventLog。
- 禁止 deception_stats 输出虚假数字。
- 禁止频繁推送 ReplayDTO。
- 禁止 finished 前误触发 room.finished。
- 禁止 ReplayDTO 泄漏 secret。
- 禁止运行期暴露 ai_internal_thoughts via REST。
- 禁止破坏 ReplayDTO 已有结构。
- 禁止 ReplayPage 调 transport.send。

---

## 任务 7：断线重连 snapshot 真实化（含完整 game state）

### 使用场景

联调任务 8 已让 catchup / snapshot 双路径走通最小版本，但 snapshot 只覆盖少量字段。本任务把 snapshot 升级为完整 game state（factions / regions(含 neighbors) / relationships / treaties / current_turn / events 末尾 N 条 / messages 末尾 N 条 / aiThinkingState / borderTensionMap），让重连后前端 UI 完整还原；并补偿断线期间错过的关键事件叙述。

### 当前 mock / 初始状态

- 后端 snapshot 在 router._build_reconnect_payload 中字段有限。
- 前端 _applySnapshot 只覆盖少量字段，导致刷新后 BorderTension / aiThinkingState 丢失。

### 契约对齐（端到端）

```
reconnect.snapshot payload:
{
  room_id, seq, server_time_ms,
  full_state: {
    room: { id, status, mode, max_players, players },
    current_turn: EpochTurn,
    factions: FactionState[],
    regions: MapRegion[] (含 neighbors),
    relationships: Relationship[],
    treaties: Treaty[],
    recent_events: GameEvent[] (近 100 条),
    recent_messages: MessageRecord[] (近 50 条),
    ai_thinking_state: { progress, phase, model, elapsed_ms } | null,
    border_tension: list[{ between, tension, visual_state }],
    winner: FactionId | null,
    final_narration: string | null
  }
}

reconnect.catchup payload:
{
  room_id, from_seq, to_seq, server_time_ms,
  messages: list[envelope dict]   # 按 seq 排序的丢失消息
}
```

### 前端子提示词

```
你是一名资深前端断线恢复工程师。请为《外交风云》—— 人机混战 AI Diplomacy 前端把 _applySnapshot 升级为覆盖完整 game state，确保重连后 UI 完整还原。

【项目背景】
后端 reconnect.snapshot 将携带完整 game state。前端 _applySnapshot 当前只覆盖少量字段，导致刷新后 BorderTension / aiThinkingState / regions.neighbors 丢失。

【同步完善期红线（强制遵守）】
1. 行动期后端不调 LLM。
2. 模型调用只在 resolve / arbitrate。
3. 不引入 PostgreSQL / Redis / Docker。
4. 不部署。
5. 协议字段变更前后端同步并更新 docs/PROTOCOL_AUDIT.md。
6. mock 默认。
7. MVP 不重点 prompt injection 防护。
8. 不引入 API key。
9. dev-up + 浏览器手工 + smoke 联合验收。
10. 不修改业务组件，仅强化 store / adapter 重连路径。

【契约约定】
（同上）

【本任务允许做以下事情】

1. 在 src/protocol/types.ts 完善 ReconnectSnapshotPayload：
   - full_state 含 room / current_turn / factions / regions / relationships / treaties / recent_events / recent_messages / ai_thinking_state / border_tension / winner / final_narration。

2. 修改 src/store/gameStore.ts 的 _applySnapshot：
   - 覆盖以下字段（保留其它 UI 状态）：
     - epoch / current_turn / phase / arbitrate_phase / phase_started_at_ms / phase_duration_ms。
     - factions / regions / relationships / treaties。
     - events: 替换为 full_state.recent_events（按 id 去重 + 排序）。
     - privateMessages: 替换为 full_state.recent_messages 中 kind=private 的部分。
     - aiThinkingState: 写入 full_state.ai_thinking_state（若有），并标记 fallback=false。
     - borderTensionMap: 写入 full_state.border_tension。
     - winner / finalNarration。
   - 调 _applyServerClockSample(full_state.server_time_ms, Date.now())。

3. 修改 src/protocol/adapter.ts 的 reconnect.catchup 分支：
   - messages 按 seq 排序后逐条调 dispatch（透传给现有路由，复用现有逻辑）。
   - 校验 from_seq → to_seq 连续；缺口大于阈值改为发起 reconnect.request 要求 snapshot（前端 fallback）。

4. 修改 src/protocol/transport.ts 的 WebSocketTransport：
   - 重连成功后发 reconnect.request：附加 last_seq + room_id + player_id（来自 setReconnectContext）。
   - 若 1s 内未收到 reconnect.catchup 或 reconnect.snapshot：再次发起一次。
   - 最多重试 3 次后切到 error 状态显示给 UI（uiStore.setConnectionStatus）。

5. 修改 src/store/uiStore.ts：
   - 新增 lastSyncAt: number = 0；snapshot 应用后更新。
   - 新增 connectionFailureReason: string | null；超过 3 次失败时设置。

6. 修改 src/components/ConnectionBadge.tsx：
   - hover tooltip 增加显示 lastSyncAt / connectionFailureReason / lastInboundSeq。
   - 状态 error 时 Badge 显示故障原因。

7. 测试：
   - src/store/__tests__/gameStore.applySnapshot.test.ts 验证全字段覆盖。
   - src/protocol/__tests__/adapter.catchup.test.ts 验证按 seq 排序应用 + 缺口检测。
   - 浏览器手工：
     - 短时断网 → catchup 恢复，UI 无闪烁。
     - 长时断网（停后端 2 分钟）→ snapshot 全量恢复，刷新后 borderTension / aiThinkingState 都正确。
     - 故意发送错误 last_seq → 后端返回 snapshot 时前端覆盖正常。
     - 重试 3 次后 Badge=error 显示故障。

【禁止做的事】
- 不要在 _applySnapshot 中重置 UI store 字段（如 leftPanelOpen / mapQuality）。
- 不要在 catchup 应用过程中触发大动画（避免视觉错觉）。
- 不要在 snapshot 应用时清空 events 历史（要替换为 recent_events，保留 ID 去重）。
- 不要把 _applySnapshot 暴露给 UI 组件直接调用。
- 不要忽略 catchup 中 from_seq → to_seq 缺口。
- 不要让 reconnect.request 重试无限循环。
- 不要把 connectionFailureReason 写到 Console error（用 console.warn 即可）。
- 不要让 _applySnapshot 写入 aiDiaries（diary 由 replay.ai_diary_reveal 独立路径）。

【验收标准】
1. ReconnectSnapshotPayload 类型完整。
2. _applySnapshot 覆盖全部 game state 字段。
3. _applyServerClockSample 在 snapshot 时调用。
4. catchup 按 seq 排序应用 + 缺口检测。
5. transport 重连重试 3 次后切 error。
6. lastSyncAt / connectionFailureReason 字段加入 uiStore。
7. ConnectionBadge tooltip 增强。
8. tsc + build + 单元测试通过。
9. 浏览器手工：刷新 / 断网 / 长断 三场景 UI 完整恢复。
10. docs/PROTOCOL_AUDIT.md 更新 ReconnectSnapshotPayload 字段。
```

### 后端子提示词

```
你是一名资深后端会话恢复工程师。请为《外交风云》—— 人机混战 AI Diplomacy 后端把 reconnect.snapshot 升级为完整 game state，让前端重连后 UI 完整还原。

【项目背景】
当前 _build_reconnect_payload 在 router.py 中只取部分字段。本任务扩充 snapshot 含 factions / regions(含 neighbors) / relationships / treaties / recent_events / recent_messages / ai_thinking_state / border_tension / winner / final_narration。

【同步完善期红线（强制遵守）】
1. 行动期不调 LLM。
2. 模型调用只在 resolve / arbitrate。
3. 不引入 PostgreSQL / Redis / Docker。
4. 不部署。
5. 协议字段变更前后端同步并更新 docs/PROTOCOL_AUDIT.md。
6. mock 默认。
7. MVP 不重点 prompt injection 防护。
8. 不引入 API key。
9. dev-up + 浏览器手工 + smoke 联合验收。
10. 不破坏 EventLog 的 seq 单调递增约束。

【契约约定】
（同前端子提示词）

【本任务允许做以下事情】

1. 修改 app/api/websocket/router.py 的 _build_reconnect_payload：
   - 参数 (room_id, player_id, last_seq) → 返回 envelope。
   - 拉取仓储：
     - room = await repos.rooms.get(room_id)
     - current_turn = await repos.state.get_current_turn(room_id)
     - factions = await repos.state.get_factions(room_id)
     - regions = await repos.state.get_regions(room_id)
     - relationships = await repos.state.get_relationships(room_id)
     - treaties = await repos.state.get_treaties(room_id)
     - recent_events = await repos.events.list_all(room_id)[-100:]
     - recent_messages = await repos.messages.list_by_turn(room_id, current.epoch, current.turn)（合并近 50 条）
     - ai_thinking_state: 从仓储或最近 ai.thinking 事件中提取（若需要可在 GameStateRepository 增加 last_ai_thinking 字段，但 MVP 可从 events 中找 kind=ai_thinking 最新一条）
     - border_tension: 从最近一条 SettlementResult 中提取（或重新计算 _build_map_diff 的 border_updates，复用 settlement_service 工具函数）
     - winner / final_narration: 来自最后一份 SettlementResult 或 room.metadata。

2. 计算缺口：
   - current_seq = repos.events.next_seq(room_id) - 1
   - gap = current_seq - last_seq
   - if gap <= 50:
     - messages = await repos.events.list_visible_to_faction(room_id, player.faction_id, since_seq=last_seq+1)
     - 包装为 reconnect.catchup envelope 带 from_seq / to_seq。
   - else:
     - 构造 reconnect.snapshot envelope 带完整 full_state。
   - 阈值 50 通过 config 暴露 RECONNECT_CATCHUP_MAX。

3. 修改 app/repositories/base.py / memory.py：
   - EventLogRepository 增加 list_visible_to_faction(room_id, faction_id, *, since_seq: int = 0)。
   - 内部维护 seq 索引以便按 seq 切片。

4. 修改 app/protocol/outgoing.py：
   - ReconnectSnapshotPayload.full_state 字段文档化（描述所有子字段）。
   - ReconnectCatchupPayload 增加 from_seq / to_seq。

5. 修改 app/api/websocket/dispatcher.py：
   - dispatch_to_player 增加专用 dispatch_reconnect_snapshot / dispatch_reconnect_catchup helper，避免在 router 拼装 envelope。

6. 修改 app/services/settlement_service.py：
   - 暴露 helper compute_border_tension(regions, relationships) -> list[dict]，供 router._build_reconnect_payload 复用。

7. 测试：
   - app/tests/test_reconnect_snapshot_full.py：验证 snapshot full_state 字段齐全且与仓储一致。
   - app/tests/test_reconnect_catchup_seq_continuous.py：last_seq=N，after 30 events，catchup 返回 30 条且 from_seq=N+1 to_seq=N+30。
   - app/tests/test_reconnect_threshold.py：gap=51 时返回 snapshot 而非 catchup。
   - app/tests/test_border_tension_helper.py：compute_border_tension 输出与 settlement_service 一致。

【禁止做的事】
- 不要把 snapshot 通过 catchup 路径推送（必须分清）。
- 不要让 catchup 包含 viewer 不可见的事件。
- 不要在 reconnect 路径中触发 settlement。
- 不要让 snapshot 包含 internal_thought 字段（即便 viewer 是 actor，运行期一律剥离）。
- 不要在 snapshot 写入 token / session secret。
- 不要让 _build_reconnect_payload 阻塞 ConnectionManager（必须 async 不卡）。
- 不要让 RECONNECT_CATCHUP_MAX 阈值小于 10（避免过度走 snapshot）。
- 不要破坏已有 EventLog seq 单调递增约束。

【验收标准】
1. _build_reconnect_payload 拉取完整 game state。
2. EventLog 增加 since_seq 切片能力。
3. 阈值控制 catchup vs snapshot 分支。
4. compute_border_tension helper 可复用。
5. ReconnectSnapshotPayload / CatchupPayload schema 字段齐全。
6. 4 个测试文件通过。
7. ruff + pytest 全套通过。
8. snapshot 不包含 internal_thought。
9. dispatch_reconnect_snapshot / catchup helper 解耦。
10. docs/PROTOCOL_AUDIT.md 更新。
```

### 预期产物（前端 + 后端）

**前端**：
- `src/protocol/types.ts` ReconnectSnapshotPayload 完善。
- `src/store/gameStore.ts` _applySnapshot 全字段。
- `src/protocol/adapter.ts` catchup seq 检查。
- `src/protocol/transport.ts` 重连重试 3 次。
- `src/store/uiStore.ts` lastSyncAt / connectionFailureReason。
- `src/components/ConnectionBadge.tsx` tooltip 增强。
- 单元测试。

**后端**：
- `app/api/websocket/router.py` _build_reconnect_payload 扩充。
- `app/repositories/base.py` / `memory.py` EventLog since_seq。
- `app/api/websocket/dispatcher.py` reconnect helpers。
- `app/services/settlement_service.py` compute_border_tension。
- `app/protocol/outgoing.py` schema 更新。
- 4 个测试文件。

### 验收标准（端到端联合）

1. 短时断网 → catchup 恢复，UI 无闪烁，phase 不重置。
2. 长时断网 → snapshot 全量恢复，含 borderTension / aiThinkingState / regions.neighbors。
3. 刷新页面 → Countdown 继续显示剩余，BorderTension 还原。
4. 阈值 50 切换正确。
5. snapshot 不含 internal_thought。
6. mock 模式不退化。
7. pytest + tsc + build + 单元测试通过。
8. 浏览器三场景手工验证通过。
9. ConnectionBadge tooltip 显示 lastSyncAt。
10. docs/PROTOCOL_AUDIT.md 更新。

### 禁止事项

- 禁止 snapshot 通过 catchup 推送。
- 禁止 catchup 含 viewer 不可见事件。
- 禁止 reconnect 路径触发 settlement。
- 禁止 snapshot 含 internal_thought。
- 禁止 reconnect.request 无限重试。
- 禁止 _applySnapshot 重置 UI store 业务字段。
- 禁止 catchup 应用触发大动画。
- 禁止 RECONNECT_CATCHUP_MAX < 10。

---

## 任务 8：多人 4v4 房间联调

### 使用场景

当前 dev-up 仅验证 solo 模式（1 真人 + 7 AI）。本任务把 multi 模式（4 真人 + 4 AI）完整跑通：多个浏览器窗口加入同一房间、各自选择不同势力、ready、start、广播事件按 visibility 精确过滤、密谈仅参与方可见、玩家断线 AI 临时托管、玩家回归。

### 当前 mock / 初始状态

- 后端 RoomService 已支持 mode="multi_4v4"，但 ConnectionManager 的 player → room 映射在多连接下未严格测试。
- 后端 dispatcher 的 visibility 过滤（密谈仅参与方）需要验证。
- 前端 ConnectionBadge 不显示其它玩家状态；房间内玩家列表 UI 缺失。
- AI 临时托管在断线场景未实现。

### 契约对齐（端到端）

```
新增 outbound envelope：
  S→C  room.snapshot  房间状态快照（不同于 reconnect.snapshot；用于房间内玩家变化广播）
  p: {
    room_id, mode, status,
    players: list[{ player_id, display_name, faction_id, connected, ready, ai_takeover: bool }],
    ai_factions: list[FactionId]
  }

  S→C  room.player_takeover  玩家被 AI 接管
  p: { room_id, player_id, faction_id, reason: "disconnected_30s"|"manual_leave" }

  S→C  room.player_resume    玩家从断线恢复回归
  p: { room_id, player_id, faction_id }
```

### 前端子提示词

```
你是一名资深前端多人房间体验工程师。请为《外交风云》—— 人机混战 AI Diplomacy 前端在势力选择页与 GamePage 中接入多人房间状态：玩家列表、ready 状态、断线接管标记、回归通知。

【项目背景】
后端 multi 模式已支持 4 真人 + 4 AI。本任务前端添加房间内玩家可视化与断线接管标记。

【同步完善期红线（强制遵守）】
1. 行动期后端不调 LLM。
2. 模型调用只在 resolve / arbitrate。
3. 不引入 PostgreSQL / Redis / Docker。
4. 不部署。
5. 协议字段变更前后端同步并更新 docs/PROTOCOL_AUDIT.md。
6. mock 默认。
7. MVP 不重点 prompt injection 防护。
8. 不引入 API key。
9. dev-up + 浏览器手工 + smoke 联合验收。
10. 不破坏既有 RelationsPanel / FactionRow 结构。

【契约约定】
（同上）

【本任务允许做以下事情】

1. 在 src/protocol/types.ts 新增：
   - RoomSnapshotPayload / RoomPlayerTakeoverPayload / RoomPlayerResumePayload。
   - 加入 IncomingMessage union。

2. 在 src/protocol/adapter.ts 增加三个路由。

3. 修改 src/store/gameStore.ts：
   - 新增字段 roomPlayers: list[{ player_id, display_name, faction_id, connected, ready, ai_takeover }]。
   - _applyRoomSnapshot(payload) / _applyPlayerTakeover(payload) / _applyPlayerResume(payload)。

4. 修改 src/pages/FactionSelectPage.tsx：
   - 添加"房间内其它玩家"区块：显示 roomPlayers 的 display_name + 已选势力 + ready 状态。
   - 玩家选择势力变更时本地立即反映，后端 broadcast 后再校准。

5. 新建 src/features/relationsPanel/PlayerTakeoverIndicator.tsx：
   - 在 RelationsPanel 的 FactionRow 中，若该势力 ai_takeover=true 显示"AI 托管中"徽章（橙色脉冲）。
   - 玩家回归时（room.player_resume）徽章淡出。

6. 修改 src/features/hud/TopBar.tsx：
   - 增加房间玩家头像组（最多 4 个真人），各玩家根据 connected 显示状态点。
   - hover 显示 display_name + ready + ai_takeover。

7. 测试：
   - src/store/__tests__/gameStore.roomPlayers.test.ts。
   - 浏览器手工：开两个浏览器窗口加入同一房间（手工通过 /debug/v1/rooms/{id}/join 复用 room_id）：
     - 双方都看到对方在房间内。
     - 选择不同势力后双方实时同步。
     - 一方关闭窗口 → 另一方在 30s 后看到对应 faction 显示 AI 托管徽章。
     - 关闭窗口的玩家重连 → 徽章淡出。

【禁止做的事】
- 不要让玩家列表暴露 token / session_id。
- 不要把 roomPlayers 写入 events 列表。
- 不要让 PlayerTakeoverIndicator 闪烁影响 FactionRow 主信息。
- 不要在 FactionSelectPage 显示其它玩家的密谈对象。
- 不要让玩家头像组挤占 ConnectionBadge / 设置按钮位置。
- 不要在 mock 模式下假造其它玩家（mock 仍 1 玩家）。
- 不要破坏既有 RelationsPanel 排序逻辑。
- 不要让 _applyRoomSnapshot 重置 EventStream / RelationsPanel 滚动位置。

【验收标准】
1. RoomSnapshotPayload / TakeoverPayload / ResumePayload 类型定义齐全。
2. adapter 三个路由正确。
3. gameStore.roomPlayers 字段写入。
4. FactionSelectPage 显示其它玩家。
5. RelationsPanel 显示 AI 托管徽章。
6. TopBar 玩家头像组。
7. tsc + build + 单元测试通过。
8. 双窗口手工测试通过。
9. AI 托管 / 回归切换流畅。
10. docs/PROTOCOL_AUDIT.md 更新三类 payload。
```

### 后端子提示词

```
你是一名资深后端多人房间工程师。请为《外交风云》—— 人机混战 AI Diplomacy 后端打通 multi 4v4 房间的多连接广播、密谈可见性过滤、断线 AI 临时托管、玩家回归恢复。

【项目背景】
RoomService 已支持 mode="multi_4v4"，但 ConnectionManager 多连接管理、密谈精确过滤、断线托管未严格联调。本任务把这些场景跑通。

【同步完善期红线（强制遵守）】
1. 行动期不调 LLM。
2. 模型调用只在 resolve / arbitrate。
3. 不引入 PostgreSQL / Redis / Docker。
4. 不部署。
5. 协议字段变更前后端同步并更新 docs/PROTOCOL_AUDIT.md。
6. mock 默认。
7. MVP 不重点 prompt injection 防护。
8. 不引入 API key。
9. dev-up + 浏览器手工 + smoke 联合验收。
10. 不破坏 RoomService 已有 select_faction / ready / start_game 逻辑。

【契约约定】
（同前端子提示词）

【本任务允许做以下事情】

1. 修改 app/api/websocket/dispatcher.py：
   - dispatch_to_room(room_id, envelope_dict, *, visibility_filter) 强化：
     - visibility_filter 现在接收 (envelope, player_session) → bool。
     - 默认 visibility_filter：根据 envelope.t / envelope.p 中 visibility scope 判断：
       - public → 全部 subscribers。
       - faction_pair → 仅 player.faction_id ∈ envelope.p.payload.pair。
       - faction_set → 仅 player.faction_id ∈ envelope.p.payload.set。
       - self → 仅 player.player_id == envelope.p.payload.actor_player_id。
     - 严格保证密谈仅推送给参与方。

2. 在 app/api/websocket/dispatcher.py 新增 dispatch_room_snapshot helper：
   - 构造 RoomSnapshotPayload(room_id, mode, status, players, ai_factions)。
   - 在以下时机调用：
     - join_room 成功后。
     - select_faction 成功后。
     - set_ready 切换后。
     - leave_room / disconnect 后。
     - reconnect resume 后。

3. 修改 app/services/room_service.py：
   - join_room / select_faction / set_ready / leave_room 各方法返回的 GameRoom 由 InboundRouter 在调用后触发 dispatch_room_snapshot。
   - 不在 RoomService 内直接调 dispatcher（保持解耦）。

4. 新增 app/services/takeover_service.py：
   - TakeoverService:
     - __init__(self, repos, clock, *, takeover_after_s=30, permanent_after_s=300)
     - async def on_disconnect(self, room_id, player_id): 起 asyncio.Task：
       - sleep(takeover_after_s)
       - check player.connected：仍 False → 标记 player.ai_takeover=True，写仓储，触发 dispatch_player_takeover。
       - sleep(permanent_after_s - takeover_after_s)
       - 仍 False → 把玩家标记 connected=False 永久托管（保留位置不踢出）。
     - async def on_reconnect(self, room_id, player_id): cancel 上述 task，清除 ai_takeover 标记，触发 dispatch_player_resume。

5. 修改 app/api/websocket/connection.py：
   - register / unregister 时通知 TakeoverService.on_disconnect / on_reconnect。
   - 玩家 disconnect 后保留 session 记录 30s 用于快速重连。

6. 修改 app/domain/models.py 的 Player：
   - 新增 ai_takeover: bool = False。
   - 新增 disconnected_at_ms: int | None = None。

7. 修改 app/protocol/outgoing.py：
   - 新增 RoomSnapshotPayload / RoomPlayerTakeoverPayload / RoomPlayerResumePayload。
   - 加入 OUTGOING_PAYLOAD_TYPES。

8. 修改 app/services/ai_output_service.py：
   - 当 player.ai_takeover=True 时，该 faction 的回合行为完全由 AI 模板生成（结算阶段已自动覆盖；本任务无需新增逻辑，但要确保不会因玩家断线导致 phase 永远停在 action 等待 lock）。
   - PhaseService.maybe_advance_by_lock 在判断"全员 lock"时，ai_takeover=True 的玩家视为自动 lock。

9. 测试：
   - app/tests/test_dispatcher_visibility.py：模拟 4 player + 4 faction，验证密谈仅推送给参与方。
   - app/tests/test_takeover_service.py：on_disconnect → 30s 后 ai_takeover=True；on_reconnect cancel task。
   - app/tests/test_room_snapshot_dispatch.py：join / select / ready / leave 触发 room.snapshot。
   - app/tests/test_phase_advance_with_takeover.py：托管玩家视为自动 lock，phase 仍能推进。

【禁止做的事】
- 不要在 dispatcher 中暴露非参与方的密谈内容。
- 不要把 ai_takeover 写入 EventLog（属于房间元数据）。
- 不要让 TakeoverService 阻塞 PhaseScheduler。
- 不要在 takeover 后清除玩家 select_faction（保留供回归恢复）。
- 不要让 ConnectionManager 在 disconnect 后立即删除 player_id（保留 5min）。
- 不要把玩家 token / session_token 写入 RoomSnapshotPayload。
- 不要让 TakeoverService 用 multiprocessing / thread（仅 asyncio）。
- 不要在 takeover 后让 RuleResolver 区别对待该 faction（统一按 AI 性格生成）。

【验收标准】
1. dispatch_to_room 严格按 visibility scope 过滤。
2. RoomSnapshotPayload / TakeoverPayload / ResumePayload 类型完整。
3. RoomService 各方法触发 room.snapshot。
4. TakeoverService 30s 后切换 ai_takeover，回归 cancel task。
5. Player.ai_takeover / disconnected_at_ms 字段加入。
6. PhaseService.maybe_advance_by_lock 视托管玩家为 lock。
7. 4 个测试文件通过。
8. ruff + pytest 全套通过。
9. ConnectionManager 保留 5min 会话缓冲。
10. docs/PROTOCOL_AUDIT.md 更新三类 payload。
```

### 预期产物（前端 + 后端）

**前端**：
- `src/protocol/types.ts` 三类 payload。
- `src/protocol/adapter.ts` 路由。
- `src/store/gameStore.ts` roomPlayers + 三 action。
- `src/pages/FactionSelectPage.tsx` 玩家列表。
- `src/features/relationsPanel/PlayerTakeoverIndicator.tsx`。
- `src/features/hud/TopBar.tsx` 玩家头像组。
- 单元测试。

**后端**：
- `app/api/websocket/dispatcher.py` visibility 过滤 + dispatch_room_snapshot。
- `app/services/takeover_service.py`。
- `app/api/websocket/connection.py` 会话缓冲。
- `app/domain/models.py` Player.ai_takeover。
- `app/protocol/outgoing.py` 三类 payload。
- `app/services/phase_service.py` 托管玩家视为 lock。
- 4 个测试文件。

### 验收标准（端到端联合）

1. 双浏览器加入同一房间，势力选择实时同步。
2. 密谈仅参与方在 Network 收到入站事件。
3. 玩家关闭窗口 → 30s 后另一玩家看到 AI 托管徽章。
4. 关闭的玩家重连 → 徽章淡出。
5. 全员 ready 后 start_game 推进；托管玩家不阻塞 lock 推进。
6. mock 模式不受影响（mock 仍 solo）。
7. pytest + tsc + build 通过。
8. ConnectionBadge 显示其它玩家状态。
9. RoomSnapshot 推送频率不爆炸（每次状态变更 1 次）。
10. docs/PROTOCOL_AUDIT.md 更新。

### 禁止事项

- 禁止密谈泄漏给非参与方。
- 禁止 ai_takeover 写入 EventLog。
- 禁止 TakeoverService 用 thread。
- 禁止 takeover 后清 select_faction。
- 禁止 RoomSnapshot 含 token。
- 禁止 PhaseScheduler 被 takeover 阻塞。
- 禁止 connection 立即删除 player_id。
- 禁止 RuleResolver 区别对待托管 faction。

---

## 任务 9：SQLite 持久化最小落地

### 使用场景

当前所有仓储仍是内存实现，uvicorn 重启后房间数据丢失。本任务把 RoomRepository / PlayerRepository / GameStateRepository / ActionLogRepository / MessageLogRepository / EventLogRepository / SettlementRepository / ReplayRepository / DiaryRepository 升级为 SQLite 实现（aiosqlite），保留内存实现，通过 env PERSISTENCE_BACKEND 切换。仍不引入 PostgreSQL / Redis / Docker。

### 当前 mock / 初始状态

- 后端 factory 在 env="postgres" 抛 NotImplementedError。
- 内存仓储数据 uvicorn 重启即丢。

### 契约对齐（端到端）

```
env：
  PERSISTENCE_BACKEND=memory | sqlite
  SQLITE_PATH=./.data/diplomacy.db

SQLite schema 沿用 docs/PERSISTENCE_PLAN.md 表结构（rooms/players/factions_state/regions/relationships/actions_log/messages_log/events_log/settlement_results/replays/turns/diaries），所有大字段 jsonb 用 TEXT 存储 JSON 字符串。

仓储接口签名不变；只是新增 SqliteXxxRepository 实现。

前端不感知 SQLite；通过 reconnect.snapshot 跨进程恢复（任务 7 已支持完整 snapshot）。
```

### 前端子提示词

```
你是一名资深前端持久化兼容工程师。请为《外交风云》—— 人机混战 AI Diplomacy 前端补足跨后端进程重启的会话保留体验：sessionToken 持久化、reconnect 自动恢复、UI 提示。

【项目背景】
后端将引入 SQLite 持久化，重启后房间数据保留。前端需要在 localStorage 持久化 sessionToken + room_id + player_id，重连时自动恢复。

【同步完善期红线（强制遵守）】
1. 行动期后端不调 LLM。
2. 模型调用只在 resolve / arbitrate。
3. 不引入 PostgreSQL / Redis / Docker。
4. 不部署。
5. 协议字段变更前后端同步并更新 docs/PROTOCOL_AUDIT.md。
6. mock 默认。
7. MVP 不重点 prompt injection 防护。
8. 不引入 API key。
9. dev-up + 浏览器手工 + smoke 联合验收。
10. 不在前端做后端持久化判断（前端只做本地会话保留）。

【契约约定】
sessionToken 由后端在 conn.auth.ok 中返回；前端写入 localStorage["diplomacy.session"]：
{ sessionToken, roomId, playerId, savedAt }

重连时 transport.setReconnectContext 用此数据。

【本任务允许做以下事情】

1. 在 src/utils/sessionStorage.ts 新增：
   - export function saveSession(data: SessionData): void
   - export function loadSession(): SessionData | null
   - export function clearSession(): void
   - SessionData = { sessionToken, roomId, playerId, savedAt }
   - 失败 try/catch（隐私模式 localStorage 不可用时不崩溃）。

2. 修改 src/protocol/adapter.ts：
   - conn.auth.ok 路由中调 saveSession。
   - conn.auth.fail 调 clearSession。

3. 修改 src/pages/GamePage.tsx 装配：
   - 挂载时调 loadSession()：
     - 若有：transport.setReconnectContext({ roomId, playerId, sessionToken })。
     - 显示一个轻量"恢复上次会话"banner（GlowPanel + "继续上一局"按钮 + "开始新一局"按钮）。
     - 玩家点击"开始新一局"时 clearSession + 跳 LandingPage。
     - 玩家点击"继续上一局"时连接后等待 reconnect.snapshot 恢复。
   - 不修改 ActionDispatcher 行为。

4. 修改 src/store/gameStore.ts：
   - 在 _applyRoomFinished 后调 clearSession（局结束清理）。

5. 测试：
   - src/utils/__tests__/sessionStorage.test.ts。
   - 浏览器手工：
     - 跑半局后 Ctrl-C 关闭后端。
     - 关闭浏览器。
     - 重新启动后端（SQLite 数据保留）。
     - 重新打开浏览器，看到"恢复上次会话"banner。
     - 点击恢复 → 进入 /game，UI 由 snapshot 还原。
     - 点击"开始新一局" → 进入 Landing。

【禁止做的事】
- 不要把 sessionToken 写入 sessionStorage / cookie / IndexedDB（仅 localStorage）。
- 不要把 sessionToken 渲染到 DOM。
- 不要在 mock 模式下保存 session（mock 模式应 clearSession）。
- 不要在 banner 中显示 token 内容。
- 不要让 loadSession 在隐私模式崩溃（catch 静默返回 null）。
- 不要在 conn.auth.ok 之前调 saveSession。
- 不要在每次 phase.change 都 saveSession（仅 conn.auth.ok 一次）。
- 不要在 ReplayPage 调 loadSession。

【验收标准】
1. sessionStorage 工具齐全。
2. conn.auth.ok 保存；conn.auth.fail / room.finished 清理。
3. GamePage 挂载时检测并显示恢复 banner。
4. transport.setReconnectContext 接入会话数据。
5. 隐私模式无崩溃。
6. mock 模式不保存会话。
7. tsc + build + 单元测试通过。
8. 浏览器手工：跨进程重启后会话可恢复。
9. UI banner 风格统一 GlowPanel。
10. 不在 DOM 暴露 token。
```

### 后端子提示词

```
你是一名资深后端持久化工程师。请为《外交风云》—— 人机混战 AI Diplomacy 后端实现 SQLite 持久化最小落地，沿用 docs/PERSISTENCE_PLAN.md 表结构，通过 aiosqlite 提供仓储实现。

【项目背景】
当前内存仓储重启即丢。引入 SQLite 让数据在本机进程重启后保留；仍不引入 PostgreSQL / Redis / Docker。

【同步完善期红线（强制遵守）】
1. 行动期不调 LLM。
2. 模型调用只在 resolve / arbitrate。
3. 不引入 PostgreSQL / Redis / Docker。
4. 不部署。
5. 协议字段变更前后端同步并更新 docs/PROTOCOL_AUDIT.md。
6. mock 默认。
7. MVP 不重点 prompt injection 防护。
8. 不引入 API key。
9. dev-up + 浏览器手工 + smoke 联合验收。
10. 不破坏内存仓储接口（仓储 Protocol 不变）。

【契约约定】
（同上）

【本任务允许做以下事情】

1. 在 pyproject.toml 增加 dependencies：aiosqlite>=0.20。

2. 在 .env.example 增加：
   - PERSISTENCE_BACKEND=memory
   - SQLITE_PATH=./.data/diplomacy.db

3. 修改 app/core/config.py：
   - 增加 persistence_backend / sqlite_path 字段。

4. 新建 app/repositories/sqlite/ 目录：
   - schema.py：CREATE TABLE 语句字符串集合（沿用 PERSISTENCE_PLAN.md 表结构；jsonb → TEXT 存 JSON 字符串）。
   - connection.py：SqliteConnectionPool（封装 aiosqlite.connect + WAL 模式）。
   - rooms.py / players.py / state.py / actions.py / messages.py / events.py / settlements.py / replays.py / diaries.py：分别实现对应 Repository Protocol。
   - 每个实现：
     - upsert 用 INSERT OR REPLACE。
     - list 返回按 created_at 排序。
     - jsonb 字段 json.loads / json.dumps。
     - deep copy 不需要（每次都从 DB 读重建）。
   - 公共 row → model 转换工具放 schema.py。

5. 新建 app/repositories/sqlite/migrate.py：
   - async def ensure_schema(conn): 顺序执行 schema 语句（已存在则跳过 IF NOT EXISTS）。
   - 在 SqliteConnectionPool 启动时调用。

6. 修改 app/repositories/factory.py：
   - make_repositories("sqlite", *, settings) 返回 Repositories 容器，使用 SqliteXxxRepository 实例（共享 pool）。
   - make_repositories("memory") 不变。
   - make_repositories("postgres") 仍抛 NotImplementedError。

7. 修改 app/main.py：
   - startup 事件：根据 settings.persistence_backend 构造 repositories；若 sqlite 则确保 schema 已建立。
   - shutdown 事件：close pool。

8. 修改 app/api/rest/deps.py：
   - get_repositories 返回 app.state.repositories。

9. 修改 conn.auth.ok 流程（router.py / connection.py）：
   - 生成 sessionToken（uuid4），与 player 绑定，写入 Player.session_token 字段（domain.models 增加该字段）。
   - 推送 ConnAuthOkPayload 含 sessionToken。
   - 重连时 conn.auth payload 含 token，校验 token 匹配 player.session_token，否则 conn.auth.fail。
   - MVP 不做 token 过期与轮换。

10. seq / id 跨重启：
    - EventLog seq 用 SQLite AUTOINCREMENT；启动时按 room_id 取 MAX(seq) 续号。
    - room_id / player_id / msg_id 用 UUID。

11. 测试：
    - app/tests/test_sqlite_repos.py（使用 tmp_path 临时 db）：每个仓储 CRUD + deep semantics。
    - app/tests/test_persistence_switch.py：PERSISTENCE_BACKEND=sqlite vs memory 同一接口调用结果等价。
    - app/tests/test_session_token.py：conn.auth 含错误 token 返回 conn.auth.fail。
    - app/tests/test_seq_continuity_after_restart.py：构造 sqlite pool，关闭再打开，EventLog.next_seq 续号。

12. 修改 README 联调启动节追加："切换 SQLite 持久化"小节：
    - export PERSISTENCE_BACKEND=sqlite
    - mkdir -p .data
    - 重启后端
    - 数据在 .data/diplomacy.db 中持久化

【禁止做的事】
- 不要引入 SQLAlchemy / Alembic。
- 不要把 SQLite 当生产数据库（README 明确"仅本机联调"）。
- 不要在每次请求 connect/close（用 pool）。
- 不要让 schema migration 删表（仅 CREATE IF NOT EXISTS）。
- 不要把 secret / api key 写入 db。
- 不要在 SQLite 启用 in-memory 模式（必须文件）。
- 不要破坏已有内存仓储测试（mode=memory 时仍走内存）。
- 不要让 seq 在跨房间共享（必须按 room_id 隔离）。

【验收标准】
1. aiosqlite 依赖添加。
2. .env.example 增加 PERSISTENCE_BACKEND / SQLITE_PATH。
3. SqliteXxxRepository 9 个仓储实现。
4. ensure_schema 启动时建表。
5. factory 切换工作。
6. session_token 流程正确。
7. EventLog seq 跨重启续号。
8. 4 个测试文件通过。
9. ruff + pytest 全套通过；内存仓储测试不退化。
10. 重启后端数据保留；docs/PROTOCOL_AUDIT.md 不变（无协议字段变化）。
```

### 预期产物（前端 + 后端）

**前端**：
- `src/utils/sessionStorage.ts`。
- `src/protocol/adapter.ts` 保存 / 清理 session。
- `src/pages/GamePage.tsx` 恢复 banner。
- 单元测试。

**后端**：
- `pyproject.toml` aiosqlite。
- `app/core/config.py` env。
- `app/repositories/sqlite/` 完整目录。
- `app/repositories/factory.py` 切换。
- `app/main.py` startup/shutdown。
- `app/domain/models.py` Player.session_token。
- `app/api/websocket/{router,connection}.py` session token 流程。
- 4 个测试文件 + README。

### 验收标准（端到端联合）

1. PERSISTENCE_BACKEND=memory 时全套行为与之前一致。
2. PERSISTENCE_BACKEND=sqlite 时重启后端数据保留。
3. 前端跨重启可恢复会话（banner + reconnect.snapshot）。
4. EventLog seq 跨重启续号。
5. session_token 校验正确。
6. mock LLM 跑完整局后重启 + 恢复可继续 ReplayPage。
7. pytest + tsc + build 通过。
8. ruff 通过。
9. PostgreSQL / Redis / Docker 不引入。
10. 内存仓储测试不退化。

### 禁止事项

- 禁止引入 SQLAlchemy / Alembic。
- 禁止 SQLite 当生产 DB。
- 禁止每请求 connect/close。
- 禁止 migration 删表。
- 禁止 secret 入库。
- 禁止 SQLite in-memory。
- 禁止破坏内存仓储测试。
- 禁止 seq 跨房间共享。

---

## 任务 10：端到端总冒烟（覆盖所有完善任务）

### 使用场景

任务 1-9 都完成后，需要一份覆盖所有真实路径的总冒烟脚本 + 浏览器手工剧本 + 报告。本任务把 integration-smoke.py 升级为 full-pipeline-smoke.py，串起：自动 phase 推进、真实 LLM（mock provider）、diary 注入、自动战斗 + 领土易手、断线重连完整 snapshot、SQLite 跨重启、4v4 多人、room.finished 跳转 ReplayPage。

### 当前 mock / 初始状态

- scripts/integration-smoke.py 只覆盖最小协议握手。
- 没有跨重启验证。
- 没有 4v4 多连接验证。
- 没有 settlement 真实数据校验。

### 前端子提示词

```
你是一名资深前端端到端联调工程师。请为《外交风云》—— 人机混战 AI Diplomacy 项目编写完整端到端浏览器手工剧本与 vitest 覆盖任务 1-9 完善内容的关键路径。

【项目背景】
任务 1-9 完成后需要一份完整端到端验证。前端侧编写浏览器手工剧本 + 自动化 vitest 关键路径，覆盖：ai.thinking 进度、Countdown 严格对齐、AI diary 揭示、R3F 地图、战斗领土流入、ReplayPage 真实数据、断线恢复、SQLite 跨重启会话恢复、4v4 多窗口。

【同步完善期红线（强制遵守）】
1. 行动期后端不调 LLM。
2. 模型调用只在 resolve / arbitrate。
3. 不引入 PostgreSQL / Redis / Docker。
4. 不部署。
5. 协议字段变更前后端同步并更新 docs/PROTOCOL_AUDIT.md。
6. mock 默认。
7. MVP 不重点 prompt injection 防护。
8. 不引入 API key。
9. dev-up + 浏览器手工 + smoke 联合验收。
10. 本任务不修改任何业务代码，仅产出剧本 + 自动化测试。

【本任务允许做以下事情】

1. 新建 docs/E2E_SCENARIO_SCRIPT.md，分章节：

   ## 场景 A：单人 1v7 完整一局
   - 步骤 1~20 详细列出（含期望 UI 反馈 + 期望 Network frame）。

   ## 场景 B：刷新页面恢复
   - 在 action 期刷新，验证 Countdown 继续 / events / regions / aiThinkingState 恢复。

   ## 场景 C：长时断网恢复
   - 关闭后端 2 分钟再恢复，验证 snapshot 全量恢复。

   ## 场景 D：跨进程重启
   - SQLite 模式下 Ctrl-C 后端 + 关闭浏览器 → 重启 → 恢复 banner → 继续完整一局到结束。

   ## 场景 E：多人 4v4 双窗口
   - 双浏览器加入同一房间 → 选不同势力 → ready → start → 各自发言 → 一方断线 → 另一方看到托管徽章 → 重连 → 徽章消失。

   ## 场景 F：游戏结束 → ReplayPage
   - 完成 8 epoch → room.finished → 3s banner → 跳转 ReplayPage → 真实数据。

2. 新建 src/__tests__/e2e/criticalPath.test.tsx（vitest + @testing-library/react + jsdom）：
   - 使用 MockTransport 注入完整协议消息序列。
   - 验证以下路径：
     - ai.thinking 5 次推送驱动 AIThinkingPanel 进度。
     - phase.change 含 server_time_ms 后 Countdown 严格对齐。
     - reconnect.snapshot 应用后 borderTensionMap 还原。
     - room.finished 后 banner + 3s 倒计时跳转。
     - room.player_takeover 触发 PlayerTakeoverIndicator。

3. 在 docs/E2E_SCENARIO_SCRIPT.md 末尾增加"验收清单"：
   - 每个场景必须 ✅ 通过才视为完成。
   - 任何场景失败记录到 docs/INTEGRATION_ISSUES.md。

4. 验证：
   - vitest 通过。
   - tsc + build 通过。
   - 浏览器手工：六个场景全部通过。

【禁止做的事】
- 不要修改业务代码。
- 不要修改设计系统组件。
- 不要在 vitest 中调真实 WebSocket / 真实 LLM。
- 不要把 E2E_SCENARIO_SCRIPT.md 写成营销稿（必须有期望 UI + Network frame）。
- 不要省略任何场景。
- 不要忽略失败场景（必须写入 INTEGRATION_ISSUES）。
- 不要在 vitest 中使用真实 WebSocket（用 MockTransport）。
- 不要在场景 D 中跳过"关闭浏览器"步骤。

【验收标准】
1. docs/E2E_SCENARIO_SCRIPT.md 含六个场景 + 验收清单。
2. src/__tests__/e2e/criticalPath.test.tsx 覆盖 5 个关键路径。
3. vitest 通过。
4. tsc + build 通过。
5. 浏览器手工六场景通过。
6. 失败场景写入 INTEGRATION_ISSUES.md。
7. 不修改业务代码。
8. 不修改设计系统组件。
9. 不在自动化中真实联网。
10. 场景 D（SQLite 跨重启）明确通过。
```

### 后端子提示词

```
你是一名资深后端端到端冒烟工程师。请为《外交风云》—— 人机混战 AI Diplomacy 项目升级 scripts/integration-smoke.py 为 full-pipeline-smoke.py，覆盖任务 1-9 完善内容的关键路径。

【项目背景】
当前 integration-smoke.py 只覆盖最小协议握手。本任务升级为完整流水线验证：自动 phase 推进 / ai.thinking / diary 注入 / 战斗领土易手 / SQLite 跨重启 / room.finished。

【同步完善期红线（强制遵守）】
1. 行动期不调 LLM。
2. 模型调用只在 resolve / arbitrate。
3. 不引入 PostgreSQL / Redis / Docker。
4. 不部署。
5. 协议字段变更前后端同步并更新 docs/PROTOCOL_AUDIT.md。
6. mock 默认。
7. MVP 不重点 prompt injection 防护。
8. 不引入 API key。
9. dev-up + 浏览器手工 + smoke 联合验收。
10. 本任务不修改业务代码，仅产出脚本 + pytest integration 用例。

【本任务允许做以下事情】

1. 新建 scripts/full-pipeline-smoke.py：
   - 用 httpx + websockets 通过 dev-up 启动的后端，跑完整 1v7 一局。
   - 步骤：
     1. wait /readyz。
     2. POST /debug/v1/rooms 创建 solo 房间 seed=42。
     3. POST /select-faction 选 ironCrown。
     4. POST /ready true。
     5. POST /start。
     6. 等待 PhaseScheduler 自动 advance：observe → action（无需手动 advance）。
     7. 发送 3 条 speech + 2 条 private + 1 条 treaty + 1 条 military + 1 条 intel。
     8. POST /actions/lock。
     9. 等待自动进入 resolve，订阅 WebSocket 收 ai.thinking 5 条（progress 单调递增）。
     10. 等待 resolve.events + resolve.map_diff + resolve.stats_diff。
     11. 检查 GET /debug/v1/rooms/{id} 中 factions / regions / relationships 已更新。
     12. 重复 turn 1~3，每 3 turn 一个 arbitrate（battle/epic/summary）。
     13. 走完 8 epoch（约 12~15 分钟，本机加速时可设 phase 时长缩短 env，详见下）。
     14. 收到 room.finished。
     15. GET /debug/v1/rooms/{id}/replay 返回完整 ReplayDTO。
     16. 校验 ReplayDTO 字段（含 ai_internal_thoughts 非空、faction_curves 含 N 个点、winner 非空）。
   - 任一步骤失败退出码 1。

2. 加速 env：DEV_FAST_PHASE=true 时 PhaseScheduler 用 1/10 时长（observe 1.5s / action 9s / resolve 3s ...），仅用于 smoke 加速。后端在 app/core/config.py 增加此 env，PhaseService 读取后乘以 0.1。

3. 跨重启验证：
   - 新建 scripts/cross-restart-smoke.py：
     - PERSISTENCE_BACKEND=sqlite + DEV_FAST_PHASE=true。
     - 跑 3 个 turn 后 Ctrl-C 后端（脚本通过 SIGTERM 后端 pid）。
     - 重启后端。
     - 通过同一 room_id + session_token 调 conn.auth → 验证 reconnect.snapshot 返回 完整 full_state。
     - 继续跑完剩余 turn 直到 finished。
   - 用 .data/diplomacy.db 文件保留检查。

4. 4v4 多连接 smoke（可选）：
   - 新建 scripts/multi-room-smoke.py：用 4 个 websockets 客户端并发加入同一房间，各选不同势力 + ready + start，验证密谈仅参与方 + 自动 phase 推进 + 一方断线触发 takeover。

5. 在 app/tests/integration/ 新建 pytest -m integration 标签的 e2e 测试：
   - test_full_pipeline.py：用 FastAPI TestClient + WebSocket TestClient（不启动真实 uvicorn）跑完一局。
   - test_cross_restart.py：用 tmp_path SQLite 模拟 db 重连。
   - test_4v4_visibility.py：4 个并发连接验证密谈隔离。

6. 在 README 联调启动节追加："full-pipeline / cross-restart / multi-room 三个 smoke 脚本使用方法"。

7. 输出 docs/E2E_BACKEND_REPORT.md：
   - 包含三个脚本执行日志摘要 + 任一失败的复现命令。

【禁止做的事】
- 不要修改业务代码 / RuleResolver / SettlementService。
- 不要在脚本中真实调外网 LLM。
- 不要让 DEV_FAST_PHASE 在 prod 生效（仅 env=dev 允许）。
- 不要让 smoke 脚本依赖 INTEGRATION_RUNBOOK.md 之外的人工步骤。
- 不要让 multi-room-smoke 在脚本中创建真实操作系统 user / process。
- 不要把 smoke 脚本输出 token / api_key 到日志。
- 不要在脚本里 sleep 总和 > 5 分钟（即便不开 fast，整体 ≤ 5min；fast 模式 ≤ 60s）。
- 不要让 pytest -m integration 用例阻塞 unit 测试默认运行（默认仅跑 unit，integration 需显式 -m）。

【验收标准】
1. scripts/full-pipeline-smoke.py 完整通过（fast 模式 ≤ 60s）。
2. scripts/cross-restart-smoke.py 跨重启恢复完整。
3. scripts/multi-room-smoke.py 4v4 密谈隔离正确。
4. pytest -m integration 全套通过。
5. DEV_FAST_PHASE env 仅在 dev 生效。
6. ReplayDTO 校验通过。
7. ai.thinking 5 条 progress 单调递增。
8. README 三个脚本使用方法齐全。
9. docs/E2E_BACKEND_REPORT.md 含执行日志摘要。
10. ruff + pytest 全套通过。
```

### 预期产物（前端 + 后端）

**前端**：
- `docs/E2E_SCENARIO_SCRIPT.md`（六场景）。
- `src/__tests__/e2e/criticalPath.test.tsx`。

**后端**：
- `scripts/full-pipeline-smoke.py`。
- `scripts/cross-restart-smoke.py`。
- `scripts/multi-room-smoke.py`。
- `app/tests/integration/test_full_pipeline.py` / `test_cross_restart.py` / `test_4v4_visibility.py`。
- `app/core/config.py` DEV_FAST_PHASE。
- `app/services/phase_service.py` 时长 0.1 系数（dev only）。
- `docs/E2E_BACKEND_REPORT.md`。
- README 三脚本说明。

### 验收标准（端到端联合）

1. full-pipeline-smoke 通过（fast 模式 ≤ 60s）。
2. cross-restart-smoke 通过：3 turn 后重启继续到 finished。
3. multi-room-smoke 通过：密谈隔离正确，托管触发。
4. 浏览器六场景全部通过。
5. vitest 关键路径通过。
6. pytest -m integration 通过。
7. ReplayPage 显示真实数据（含 ai_internal_thoughts / faction_curves / winner）。
8. SQLite 跨重启会话恢复完整。
9. ai.thinking 5 条 progress 单调递增。
10. 无任何业务代码修改。

### 禁止事项

- 禁止修改业务代码。
- 禁止真实联网 LLM。
- 禁止 DEV_FAST_PHASE 在 prod 生效。
- 禁止 smoke 依赖人工步骤（除明确的 Ctrl-C / 关闭浏览器）。
- 禁止 multi-room 创建系统 user。
- 禁止脚本日志输出 token。
- 禁止 sleep 总和 > 5min。
- 禁止 pytest -m integration 阻塞默认 unit run。

---

## 附录 A：10 条同步完善任务一览

| # | 任务 | 主要变化 | 协议字段新增 |
|---|------|---------|-------------|
| 1 | 真实 LLM provider + ai.thinking 可视化 | OpenAI / Claude 接入；mock 仍默认；前端进度可视化 | ai.thinking 完整字段 |
| 2 | 后端自动 phase 推进 + Countdown 严格对齐 | PhaseScheduler；server_time_ms；前端 rAF + offset | server_time_ms |
| 3 | AI 性格 / 记忆系统升级 | DiaryRepository + memory_depth 注入 prompt + replay.ai_diary_reveal | DiaryEntry / ReplayAIDiaryRevealPayload |
| 4 | MapStage 真实数据驱动 + R3F | MapRegion.neighbors / border_updates；R3F 高质量档 | neighbors / border_updates |
| 5 | 战斗与领土易手完整闭环 | RuleResolver → GameStateRepository → resolve.map_diff.changes | BattleEvent / RegionChange 字段 |
| 6 | 回放系统真实落地 | ReplayService 真实数据 + room.finished 跳转 | room.finished |
| 7 | 断线重连 snapshot 真实化 | full_state 完整字段 + EventLog since_seq | ReconnectSnapshotPayload 扩充 |
| 8 | 多人 4v4 房间联调 | 多连接广播 + TakeoverService | room.snapshot / takeover / resume |
| 9 | SQLite 持久化最小落地 | aiosqlite + session_token + 跨重启 | 无（前端 sessionStorage） |
| 10 | 端到端总冒烟 | full-pipeline / cross-restart / multi-room 三脚本 + 六场景 | 无 |

### 推荐执行顺序

**2 → 1 → 3 → 4 → 5 → 9 → 7 → 6 → 8 → 10**

理由：
- 任务 2（自动 phase 推进）是其它一切真实节奏的前置。
- 任务 1（真实 LLM）让结算阶段有真实输出可观察。
- 任务 3（diary）依赖 1 已通。
- 任务 4-5（地图 + 战斗）独立可做，但 5 依赖 4 的 neighbors。
- 任务 9（SQLite）让任务 7 跨进程 snapshot 有意义。
- 任务 7（snapshot）和 8（4v4）都依赖 9。
- 任务 6（Replay）依赖 1/3/5 已能产真实数据。
- 任务 10（总冒烟）收口。

### 每条任务的统一交付节奏

1. 读"当前 mock / 初始状态"+"契约对齐"章节 → 明确范围。
2. 给前端 AI 工具复制"前端子提示词"。
3. 给后端 AI 工具复制"后端子提示词"。
4. 双端完成后跑 dev-up + 浏览器手工 + smoke。
5. 验收清单全部 ✅ 才视为完成；否则写入 docs/INTEGRATION_ISSUES.md。
6. 完成后更新 docs/PROTOCOL_AUDIT.md 中新增字段条目。

### 全程红线提醒

- 行动期不调 LLM（任务 1-10 均不破坏）。
- 模型只在 resolve / arbitrate 阶段调（任务 1 接入真实 provider 后仍如此）。
- 不引入 PostgreSQL / Redis / Docker（任务 9 仅 SQLite）。
- 不部署。
- MVP 不重点 prompt injection 防护。
- 协议字段变更必须前后端同步改并更新 PROTOCOL_AUDIT.md。
- 每条任务都要双端验收，不接受单端通过。

---

> 本文档共 10 条任务，覆盖前端 + 后端同步完善。完成后《外交风云》即可从 mock / 占位状态升级到完整 AAA 科幻战略游戏端到端体验，仍保持 MVP 范围（不连真实 Postgres / 不部署 / 不引入复杂安全 / mock LLM 默认可用）。


