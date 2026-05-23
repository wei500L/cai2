# 《外交风云》前端去 Mock × 后端真实联调任务型提示词库

> 项目：《外交风云》— 人机混战 AI Diplomacy
> 版本：v1.0
> 适用阶段：联调任务 1–10、同步完善任务 1–10、球体地图升级 1–8（部分可并行）已落地或在进行中；当前前端仍有 80+ 处对 `src/mock/**` 的依赖，且默认 `.env.development` 仍是 `VITE_USE_WS=false`，前端实际跑的是 MockTransport，与后端没有真正握手。
> 用途：每条任务给出**前端子提示词 + 后端子提示词**，分别复制给 AI 编程工具独立执行；端到端契约严格一致。
> 目标：把"前端 mock 数据驱动" → "前端协议契约驱动"。mock 仅保留为：① MockTransport 内部 fixture；② 单元 / e2e 测试 fixture；③ dev 调试 fallback。**生产路径不得再触 `src/mock/**`**。

---

## 零、总体说明（必读）

### 0.1 现状画像

| 维度 | 当前状态 |
|------|---------|
| 默认运行模式 | `.env.development` 写死 `VITE_USE_WS=false` → 走 MockTransport |
| mock 入口聚集 | `src/protocol/transport.ts` (MockTransport) + `src/app/RealtimeConnection.tsx` (startMockGameLoop) + `src/store/gameStore.ts` (createInitialState) |
| `@/mock/**` 导入位点 | 约 80 处，分布在 features / pages / store / protocol / effects / api 全层 |
| 数据 vs 类型混杂 | 多数 feature 同时从 `@/mock/types` 导入类型（GameEvent、FactionState、RelationshipStatus、EventKind、EventPriority），从 `@/mock/factions` 导入数据（FACTIONS、speechStyleDescriptions）；`src/protocol/types.ts` 自有一套类型，存在双轨 |
| 势力静态元数据 | 颜色 / 名称 / speech_style / 文明特征全写死在 `src/mock/factions.ts`，后端从未下发 |
| AI 行为 | `src/mock/aiResponder.ts` 通过定时器在前端模拟"AI 在思考 / 说话 / 反应"，与后端 `ai.thinking` / `ai.speak` / `ai.reaction` 真实事件并行存在 |
| EpochSummary 旁白 | `SYSTEM_NARRATION_TEMPLATES` 在 `AINarration.tsx` 中循环取字串，后端 arbitrate 阶段产物未消费 |
| Replay | `ReplayPage` 在 fetch 失败 / dev 时回落到 `replayFixtures`；fixture 与真实 ReplayDTO schema 差异未审计 |
| 球面 / 外交可视化 | `protocol/transport.ts` 通过 `createMockWorldGeometry` + `createMockDiplomaticVisuals` 在 mock 模式下伪造，球体地图升级期任务 2/4 把真实事件接上后这两个函数仍在生产路径上挂着 |
| 后端 fixture 漂移 | mock 数据用确定性种子，但与后端 `MapInitService` / `RoomService` 的初始状态字段已发散（FactionState 字段、ResourceMap 字段等） |

### 0.2 目标边界

**允许 `src/mock/**` 被以下范围引用：**

1. `src/protocol/transport.ts` 中 `MockTransport` 类的内部实现（**这是唯一允许调用 startMockGameLoop / triggerAIResponses / createMockWorldGeometry / createMockDiplomaticVisuals 的位置**）。
2. `src/**/__tests__/**` 单元测试 fixture。
3. `tests/**` / `playwright/**` e2e fixture。
4. `scripts/**` 开发期 fixture。

**禁止 `src/mock/**` 出现在以下范围：**

- `src/features/**`（业务 UI 不允许直接导入 mock，无论类型还是数据）。
- `src/pages/**`（页面不允许）。
- `src/store/**`（状态层不允许；初始状态由协议层填充）。
- `src/render/**`（渲染层不允许）。
- `src/effects/**`（特效不允许）。
- `src/components/**`（设计系统不允许）。
- `src/api/**`（REST 调用层不允许 fallback 到 mock）。
- `src/protocol/adapter.ts` / `dispatcher.ts` / `types.ts`（协议层只能向 store dispatch，不能预填 fixture）。

mock 数据继续保留在 `src/mock/**` 目录下；本任务库不删除任何 mock 文件，只切断对它的依赖路径。

### 0.3 文件触碰范围

允许新增：
- `src/types/`：从 `src/mock/types.ts` 抽出的纯类型文件（faction.ts / event.ts / relationship.ts / treaty.ts / phase.ts / replay.ts），不含任何 fixture。
- `src/store/factionMetaStore.ts`：势力静态元数据 store（颜色 / 名称 / speech_style）。
- `src/store/replayStore.ts`：replay 状态独立 store（可选，避免污染 gameStore）。
- `src/api/factionsMetaApi.ts`：REST fallback 拉势力元数据（当 ws 未就绪）。
- `src/components/DevModeBanner.tsx`：dev 期顶部条横幅，标识当前运行模式（real-ws / mock / replay-fixture）。
- 后端 `app/protocol/factions_meta_event.py`：新 `room.factions_meta` 事件 schema。
- 后端 `app/services/factions_meta_service.py`：势力元数据装配服务。
- 后端 `app/services/epoch_narration_service.py`：纪元旁白生成服务。
- 后端 `app/protocol/narration_events.py`：新增 `arbitrate.epic_narration` / `arbitrate.summary_narration` 事件 schema。
- 后端 `app/api/rest/replay.py`（如已有则补全）：`GET /debug/v1/rooms/{id}/replay` 返回完整 ReplayDTO。
- `.eslintrc` 或 `eslint.config.js` 新增 `no-restricted-imports` 规则块。
- `docs/MOCK_BOUNDARY_AUDIT.md`：mock 边界审计报告。

允许修改：
- `.env.development` / `.env.example`：默认 `VITE_USE_WS=true`。
- `src/app/env.ts`：新增 `allowMockFallback` 字段。
- `src/app/RealtimeConnection.tsx`：失败提示而非静默 fallback。
- `src/protocol/transport.ts`：MockTransport 仅在显式开启时被构造。
- `src/store/gameStore.ts`：移除 `createInitialState` 直接调用，提供 `bootstrapEmpty()` / `applySnapshot(payload)`。
- `src/features/**` 与 `src/pages/**`：所有 `from '@/mock/factions'` / `'@/mock/types'` 改为 `from '@/types/**'` 或 `from '@/store/factionMetaStore'`。
- `src/features/aiSpeech/useAIResponseScheduler.ts`：删除 mock 调用，只订阅协议事件。
- `src/features/epochSummary/AINarration.tsx`：消费后端 narration 事件。
- `src/pages/ReplayPage.tsx`：移除 `replayFixture` 默认。
- 后端 `app/services/settlement_service.py`：emit narration 事件。
- 后端 `app/services/room_service.py`：room.start 后立刻 emit `room.factions_meta`。

禁止：
- 禁止删除 `src/mock/**` 任何文件（保留作 MockTransport 与测试 fixture 源）。
- 禁止把 `src/mock/**` 移到 `src/__mocks__/`（vitest 自动 mock 行为副作用大）。
- 禁止 `VITE_USE_WS=true` 时 RealtimeConnection 自动 fallback 到 mock；必须用户在 UI 显式点"调试模式"才允许。
- 禁止后端为兼容前端 mock 字段名（旧 `factionId` vs 新 `faction_id`）写 alias；走协议审计统一字段名。
- 禁止把 `SYSTEM_NARRATION_TEMPLATES` 字串复制到后端（后端用 LLM 真实生成或自己的 fallback 模板）。
- 禁止 ESLint 规则只在某些目录生效；必须全 `src/**` 生效（白名单除外）。
- 禁止本任务库的修改触碰 `mapStore` / 球体地图（属于 GLOBE_MAP_TASK_PROMPTS.md 范围）。

### 0.4 红线（每条任务都内置）

1. 行动期不调用 LLM，narration / settlement 仅 resolve / arbitrate 阶段调度（架构红线）。
2. 协议字段前后端同步改、同步测试，更新 `docs/PROTOCOL_AUDIT.md`。
3. 不引入新依赖（如 swr / react-query / msw）；保持 native fetch + zustand。
4. 不部署到任何远程；本机 dev-up 验证。
5. LLM provider 保持 mock fallback，可通过 `LLM_PROVIDER` 切换；真实接入仍按同步完善任务 1 约束。
6. `MapStage2D` / `MapStageR3F` / `MapStageGlobe` 渲染器选择不受本任务影响（mapStore 不动）。
7. 不破坏 `MockTransport` 内部行为；它仍是 dev / 测试基石。
8. 不引入 PostgreSQL / Redis / Docker。
9. 每条任务必须前后端联合验收（dev-up + 浏览器手工 + smoke 脚本）。
10. 不在本任务库新增"假装真实"的中间层：要么真实事件驱动，要么显式 mock；不允许 hybrid。

### 0.5 任务依赖图

```
任务 1 (默认 USE_WS=true + dev 模式横幅)
   └─→ 任务 2 (类型解耦 mock/types → types/)
         └─→ 任务 3 (势力元数据后端下发)
               └─→ 任务 4 (gameStore 初始状态去 mock)
                     ├─→ 任务 5 (AI 行为完全后端驱动)
                     └─→ 任务 6 (EpochSummary 旁白真实化)
                           └─→ 任务 7 (Replay 真实化)
                                 └─→ 任务 8 (mock 边界 ESLint + 审计文档)
```

建议执行顺序：**1 → 2 → 3 → 4 → 5 → 6 → 7 → 8**（强串行）。

### 0.6 每条任务的统一格式

每条任务包含：

1. **使用场景**：什么时候做这条任务。
2. **当前 mock 状态描述**：在改之前是什么样、哪些文件。
3. **契约对齐**：端到端时序图 + 字段约定 + 协议 schema（如有变更）。
4. **前端子提示词**：完整可复制给 AI 工具的前端任务。
5. **后端子提示词**：完整可复制给 AI 工具的后端任务（部分任务后端无改动则只做协议确认）。
6. **预期产物**（前端 + 后端）。
7. **验收标准**（前端单端 + 后端单端 + 端到端联合）。
8. **禁止事项**。

---

## 任务 1：默认 USE_WS=true + Dev 模式横幅 + 失败诊断

### 使用场景

当前 `.env.development` 默认 `VITE_USE_WS=false`，开发者一启动就走 MockTransport，前后端从未真正握手；联调时还要手动改 env 切回。本任务把默认翻转为 `true`，并在 ws 连接失败时给出明确诊断而非静默 fallback；同时在页面顶部加 DevModeBanner 实时显示运行模式。

### 当前 mock 状态

- `.env.development` 写死 `VITE_USE_WS=false`。
- `src/app/RealtimeConnection.tsx` 第 112 / 124 / 137 / 155 / 162 行根据 `ENV.useWs` 决定构造 ws 还是 mock，且 mock 路径会自动启动 `startMockGameLoop`。
- 用户无任何 UI 提示当前是哪种模式，导致"为什么我改后端代码前端没反应"成为常见困扰。
- `src/app/env.ts` 没有 `allowMockFallback` 字段。

### 契约对齐

本任务不引入新协议事件。仅依赖既有 `conn.auth.ok` / `conn.auth.fail` / `error.message`。

```
启动顺序：
  app start → RealtimeConnection useEffect
    → if VITE_USE_WS=true and allowMockFallback=false:
         createTransport({ kind: 'ws' }) → 失败 → 显示 ConnectionErrorPanel
    → if VITE_USE_WS=true and allowMockFallback=true:
         createTransport({ kind: 'ws' }) → 失败 → 提示"已回退到 mock，仅供 dev 调试"
    → if VITE_USE_WS=false:
         createTransport({ kind: 'mock' }) → 顶部 DevModeBanner 显示"MOCK MODE"
```

---

### 前端子提示词

```
你是一名资深前端连接生命周期工程师。请翻转默认运行模式为"真实 ws"，并实现 dev 模式横幅 + 失败诊断。

【项目背景】
前端默认 VITE_USE_WS=false 已影响联调质量。本任务把默认切到真实 ws，让"不联调就跑不起来"成为常态，并在 UI 中显式标识运行模式。

【去 mock 联调期红线（强制遵守）】
1. 行动期不调用 LLM，narration / settlement 仅 resolve / arbitrate 阶段调度。
2. 协议字段前后端同步改、同步测试，更新 docs/PROTOCOL_AUDIT.md。
3. 不引入新依赖（swr / react-query / msw）。
4. 不部署到任何远程。
5. LLM provider 保持 mock fallback。
6. mapStore / 球体地图渲染器选择不动。
7. MockTransport 内部行为不破坏。
8. 不引入 PostgreSQL / Redis / Docker。
9. 每条任务必须前后端联合验收。
10. 不引入"假装真实"的中间层。

【技术栈】
React 19 / TS / Vite / Zustand。

【本任务允许做以下事情】

1. 修改 .env.development：
   - `VITE_USE_WS=true`（翻转）
   - 新增 `VITE_ALLOW_MOCK_FALLBACK=false`（默认禁止自动 fallback）

2. 修改 .env.example 同步上述两个字段，注释说明含义。

3. 修改 src/app/env.ts：
   - 新增 `allowMockFallback: import.meta.env.VITE_ALLOW_MOCK_FALLBACK === 'true'`。
   - 保留其它字段不动。

4. 新建 src/components/DevModeBanner.tsx：
   - 顶部 fixed 横条，高 24px。
   - 三种状态：
     - REAL_WS_CONNECTED：绿色，文案"REAL WS · ws://...:8000/ws · seq=N"。
     - REAL_WS_DISCONNECTED：红色，文案"REAL WS · DISCONNECTED · 上次心跳 Ns ago"。
     - MOCK_MODE：橙色闪烁，文案"MOCK MODE · 该模式仅供 dev 调试 · 后端事件不会响应"。
   - 读 ENV.useWs / uiStore.connectionStatus / uiStore.lastHeartbeatTs 决定显示。
   - 仅当 ENV.useWs=false 或连接失败时强制显示；real-ws 已连接时自动 5s 后折叠为右上角 8px 圆点。

5. 修改 src/app/RealtimeConnection.tsx：
   - 顶部插入 <DevModeBanner />（pages 之外的 layout 槽位）。
   - 重写连接装配逻辑：
     ```
     if (ENV.useWs) {
       transport = createTransport({ kind: 'ws', ... })
       transport.onStatusChange((s) => {
         if (s === 'error' || s === 'closed') {
           if (ENV.allowMockFallback) {
             // 显式 toast：已回退到 mock
             showMockFallbackToast()
             transport = createTransport({ kind: 'mock' })
             startMockGameLoop(transport)
           } else {
             // 不静默 fallback，显示 ConnectionErrorPanel + 重试按钮
             setUiState('CONNECTION_ERROR')
           }
         }
       })
     } else {
       // 显式 mock 模式（开发者主动选择）
       transport = createTransport({ kind: 'mock' })
       startMockGameLoop(transport)
     }
     ```
   - 删除"VITE_USE_WS=true 也 fallback 到 mock"的隐式逻辑。

6. 新建 src/components/ConnectionErrorPanel.tsx：
   - 全屏遮罩 + 卡片：
     - 标题"无法连接到后端"
     - 详情：ws url / 错误码 / 上次尝试时间。
     - 按钮 1："重试连接"。
     - 按钮 2："切换到 MOCK 调试模式（仅前端验证）" → 写 sessionStorage 后 reload。
   - 不允许"自动重试 N 次后切 mock"行为。

7. 修改 src/app/connectionDebug.ts：
   - 新增 `mockEventEmittedCount` 计数，每次 MockTransport 主动发事件时 +1。
   - DevModeBanner 在 MOCK_MODE 下显示这个计数。

8. 单元测试：
   - src/app/__tests__/RealtimeConnection.envMode.test.tsx：覆盖 4 种组合（useWs × allowMockFallback）。
   - src/components/__tests__/DevModeBanner.test.tsx：3 种状态渲染。

9. 验证：
   - npx tsc --noEmit / npm run lint / npm run test 全绿。
   - npm run dev（VITE_USE_WS=true，后端未启动）→ 看到 ConnectionErrorPanel，不自动 fallback。
   - 后端启动后点"重试连接"→ DevModeBanner 转绿。
   - VITE_USE_WS=false → 顶部橙色 MOCK MODE 闪烁。
   - VITE_USE_WS=true VITE_ALLOW_MOCK_FALLBACK=true → 后端未启动时显示 toast "已回退到 mock"。

【禁止做的事】
- 不要在 RealtimeConnection 隐式 fallback 到 mock（必须显式 allowMockFallback=true 或用户主动点）。
- 不要让 DevModeBanner 影响 GamePage 布局（用 fixed + 主区域 padding-top）。
- 不要把 connectionStatus 写到 gameStore（保持 uiStore）。
- 不要引入 toast 库（用 src/components/Toast.tsx 简单实现，或纯 DOM）。
- 不要修改 transport.ts 内部实现（MockTransport 行为不变）。
- 不要让 sessionStorage 切 mock 跨页面持久（reload 后失效）。
- 不要把横幅样式做花哨；保持极简、紧凑、不抢注意力。
- 不要在 prod build 中显示 MOCK MODE 横幅（process.env.NODE_ENV!=='production' 才挂）。

【验收标准】
1. .env.development / .env.example 默认 useWs=true。
2. env.ts 含 allowMockFallback。
3. DevModeBanner 3 种状态正确。
4. ConnectionErrorPanel 提供重试 / 显式切 mock 双按钮。
5. RealtimeConnection 删除隐式 fallback。
6. mockEventEmittedCount 在 dev 期显示。
7. tsc / lint / test 全绿。
8. 4 种 env 组合手工验证通过。
9. prod build 横幅不出现。

完成后输出：
（1）修改 / 新增文件清单；
（2）4 种 env 组合截图描述；
（3）验证摘要。
```

### 后端子提示词

```
你是一名资深后端联调工程师。本任务后端**仅需确保 ws 端口对接 + 健康检查**，便于前端默认 useWs=true 时能立刻连上。

【项目背景】
联调任务 2 已经配置 CORS + 启动脚本，本任务只做一次回归校验 + dev 启动条目调整。

【去 mock 联调期红线】（略，同前端）

【本任务允许做以下事情】

1. 校验 app/main.py 与 app/api/websocket/gateway.py：
   - GET /healthz 返回 200 含 { ok: true, ts, version, mode: 'dev'|'prod' }。
   - WS /ws 接受连接，握手内 1s 内回 conn.auth.ok（无 token 校验 dev 模式）。

2. 修改 scripts/dev-up.{sh,ps1}：
   - 启动 uvicorn 后等待 /healthz 200 再启动 vite。
   - 输出 banner："Backend ready · Frontend will use REAL WS"。

3. 修改 app/core/config.py：
   - 新增 `dev_banner_enabled: bool = True`。
   - 在 startup log 中明确打印 "DEV MODE · LLM_PROVIDER=mock · MOCK NARRATION FALLBACK ENABLED"。

4. 修改 app/api/rest/debug.py：
   - 新增 GET /debug/v1/connection-info → { ws_url, allow_token_skip, server_time }。
   - 前端 ConnectionErrorPanel 用此 endpoint 显示诊断信息。

5. 测试：
   - app/tests/test_health.py：/healthz schema。
   - app/tests/test_connection_info.py：dev 期可读，prod env 应 403。

6. 验证：
   - dev-up 后 curl http://localhost:8000/healthz 通过。
   - pytest 通过；ruff 通过。

【禁止做的事】
- 不要在 dev 期开启 token 严格校验（联调期已豁免）。
- 不要让 /debug/v1/connection-info 暴露在 prod。
- 不要修改 ws gateway 协议握手字段。
- 不要新增持久化或 LLM 调用。

【验收标准】
1. /healthz / /debug/v1/connection-info 就绪。
2. dev-up 脚本先等 backend 再起 vite。
3. config 含 dev_banner 设置。
4. 测试通过。

完成后输出：
（1）修改 / 新增文件清单；
（2）健康检查 curl 输出；
（3）pytest 摘要。
```

### 预期产物

- 前端：.env 翻转 / DevModeBanner / ConnectionErrorPanel / RealtimeConnection 重写 / 测试。
- 后端：/healthz schema 校验 / /debug/v1/connection-info / dev-up 串行启动 / 测试。

### 验收标准（端到端联合）

1. `scripts/dev-up.sh` 启动：先 backend 就绪再 vite，前端默认连上真实 ws，banner 5s 后折叠为圆点。
2. 关闭 backend，前端在下次心跳超时显示 ConnectionErrorPanel；不静默 fallback。
3. VITE_USE_WS=false 单端启动前端，顶部橙色 MOCK MODE 横幅持续闪烁，mockEventEmittedCount 递增。
4. prod build 不出现任何横幅。

### 禁止事项

- 禁止隐式 fallback。
- 禁止 prod 显示横幅。
- 禁止自动重试 N 次后切 mock。
- 禁止跨页持久化 mock 选择。

---

## 任务 2：类型解耦 `mock/types` → `src/types/`

### 使用场景

约 50+ 处业务代码 `import type { ... } from '@/mock/types'` 或 `'@/mock/factions'`。即便这些是类型导入（运行时无副作用），也使得 mock 模块成为类型源 — 一旦 mock 与协议字段漂移就全前端编译失败。本任务把所有"被业务消费的类型"抽到 `src/types/`，mock 仅保留 fixture 数据，类型反向引用 `src/types/`。

### 当前 mock 状态

- `src/mock/types.ts` 包含 GameEvent / FactionState / Relationship / TreatyKind / RelationshipStatus / EventKind / EventPriority / MapRegion / ArbitratePhase / Epoch / GamePhase / PrivateMessage / BattleEvent / FactionId 等。
- `src/mock/factions.ts` 导出 FactionMeta / FactionId / speechStyleDescriptions / FACTIONS / factionById。
- `src/protocol/types.ts` 自己有 Envelope / IncomingMessage / OutgoingMessage / 各种 payload 类型。
- 两套类型在字段名 / 枚举值上可能漂移（PROTOCOL_AUDIT.md 应有记录）。

### 契约对齐

本任务**不变更后端协议**；仅前端做类型搬迁。完成后所有 feature / pages / store / render 不再 `import from '@/mock/**'`（除 MockTransport 与测试外）。

```
新建：
  src/types/
    faction.ts        FactionId / FactionMeta / speech_style 枚举
    event.ts          GameEvent / EventKind / EventPriority
    phase.ts          GamePhase / ArbitratePhase / Epoch
    treaty.ts         TreatyKind / Relationship / RelationshipStatus
    map.ts            MapRegion
    speech.ts         PrivateMessage / SpeechMode
    battle.ts         BattleEvent
    replay.ts         AIInnerThought / FactionCurve / KeyMoment / ReplayTimelineNode
    index.ts          re-export
```

`src/mock/types.ts` 改为 `export type * from '@/types'`（保持向后兼容）。后续任务 8 用 ESLint 禁掉 `@/mock/types` 的业务导入。

---

### 前端子提示词

```
你是一名资深 TypeScript 类型架构师。请把业务消费的类型从 src/mock/** 抽到 src/types/，让 mock 仅持有 fixture。

【项目背景】
src/mock/types.ts 与 src/mock/factions.ts 当前同时承担"类型定义"和"种子数据"两个角色。本任务做关注点分离：types 抽到 src/types/，mock 仅保留数据。

【去 mock 联调期红线】（略，同任务 1）

【本任务允许做以下事情】

1. 新建 src/types/ 目录及以下文件，从 src/mock/types.ts 与 src/mock/factions.ts 整体抽出类型：
   - faction.ts: FactionId、FactionMeta（去除 default-value 部分，仅保留 type）、SpeechStyle 枚举、FACTION_IDS 常量数组（只读 readonly tuple）。
   - event.ts: GameEvent、EventKind、EventPriority、EventActor。
   - phase.ts: GamePhase、ArbitratePhase、Epoch、Turn。
   - treaty.ts: TreatyKind、Relationship、RelationshipStatus、TreatyState。
   - map.ts: MapRegion、RegionEntry、RegionTerrain（与协议 RegionEntry 字段对齐）。
   - speech.ts: PrivateMessage、SpeechMode、Tone。
   - battle.ts: BattleEvent、BattleOutcome。
   - replay.ts: AIInnerThought、FactionCurve、KeyMoment、ReplayTimelineNode、ReplayDTO。
   - index.ts: 统一 re-export，所有类型从此入口获取。
   - 严格规则：所有类型必须与 src/protocol/types.ts 已有字段对齐；若不一致，在 docs/PROTOCOL_AUDIT.md 追加一条差异并按"以协议为准"修正。

2. 修改 src/mock/types.ts：
   - 头部加 `// @deprecated — re-export only, do not add new types here. New code import from '@/types'.`
   - 内容改为 `export type * from '@/types'`（保留向后兼容，运行时无副作用）。

3. 修改 src/mock/factions.ts：
   - 类型 FactionMeta / FactionId 改为 `import type { FactionMeta, FactionId } from '@/types/faction'` 后 re-export。
   - FACTIONS 数据常量保留；speechStyleDescriptions 数据常量保留。
   - 文件顶部加 `// @deprecated — data fixtures only. Type imports must use '@/types/faction'.`

4. 批量替换业务代码中的导入：
   - 用 grep / sed 全量替换：
     `from '@/mock/types'` → `from '@/types'`
     `from '@/mock/factions'`（仅 type-only 部分）→ `from '@/types/faction'`
     `factionById`、`FACTIONS`、`speechStyleDescriptions`（数据）→ 暂不动，任务 3 再处理。
   - 涉及文件（约 40 处，按搜索结果列）：
     features/aiSpeech/* / features/commandTerminal/* / features/epochSummary/* / features/eventStream/* / features/factionSelect/* / features/hud/* / features/phaseSystem/* / features/relationsPanel/* / features/replay/* / store/* / render/* / effects/* / api/* / pages/*
   - 每个文件做完后跑 `npx tsc --noEmit` 校验通过再进下一个。

5. 协议字段对齐：
   - 若 src/types/event.ts 的 EventKind 字串与 src/protocol/types.ts 的 EventKind 字串不一致：
     - 优先以 protocol 为准。
     - 在 PROTOCOL_AUDIT.md "类型抽离差异表"段落追加差异。
   - FactionId 八个字符串必须与后端 app/domain/enums.py 一致：ironCrown / starlight / emerald / ashen / voidChurch / aurora / magma / darkTide。

6. 单元测试：
   - 不新增测试（现有用例若仍 import @/mock/types 应同步替换并保证全绿）。
   - 新建 src/types/__tests__/typeCompatibility.test.ts：
     - 用 `satisfies` 断言验证 src/types/event.ts 的 GameEvent 与 src/protocol/types.ts 的事件 union 字段同形。
     - FactionId 数组覆盖 8 个 id。

7. ESLint 局部规则（任务 8 会全局加，本任务先打底）：
   - 在 eslint.config.js 加 warning 级别：
     no-restricted-imports: src/mock/types 与 src/mock/factions 的 type-only 导入 → warning（业务文件）。

8. 验证：
   - npx tsc --noEmit 0 错误。
   - npm run lint 0 错误（warning 允许）。
   - npm run test 全绿。
   - 业务代码不再有 `from '@/mock/types'` 的 type 导入（grep 校验为 0 行）。

【禁止做的事】
- 不要删除 src/mock/types.ts / src/mock/factions.ts（保留 re-export）。
- 不要在 src/types/ 中放任何 const / fixture（纯 type / interface / enum / readonly array of literals）。
- 不要变更 FactionId / EventKind / GamePhase 等字面量值（与后端 enums.py 必须一致）。
- 不要在本任务处理数据导入（FACTIONS / factionById / speechStyleDescriptions 留给任务 3）。
- 不要把 ReplayDTO 内的字段重新设计（按当前 src/api/replayApi.ts 实际形态）。
- 不要把 MapRegion 与 RegionEntry 合并成一个类型（前者是 2D 平面字段，后者是球面字段，任务库范围之外）。
- 不要为兼容写 `type FactionId = string` 这种宽化类型。
- 不要把 mock fixture 类型（如 AI_SPEECH_TEMPLATES 的 entry type）抽到 src/types。

【验收标准】
1. src/types/ 目录 9 个文件齐全。
2. 业务代码 grep `from '@/mock/types'` 行数 == 0。
3. mock/types.ts、mock/factions.ts 顶部含 @deprecated 注释。
4. typeCompatibility 测试存在并通过。
5. PROTOCOL_AUDIT.md "类型抽离差异表"段落齐全。
6. tsc / lint / test 全绿。

完成后输出：
（1）新建 / 修改文件清单（精确到每个 feature 子目录）；
（2）grep 行数 before/after 对照；
（3）类型差异修正记录；
（4）验证摘要。
```

### 后端子提示词

```
你是一名资深后端协议工程师。本任务后端**仅做协议字段值对齐审计**，确保 enums.py 中字面量与前端 src/types/ 抽离结果一致。

【项目背景】
前端类型从 mock 抽到 src/types/。后端应同步审计 enums.py 与 protocol/incoming.py / outgoing.py 中字面量是否一致；不一致以后端为准前端跟进，或在审计文档列差异。

【去 mock 联调期红线】（略）

【本任务允许做以下事情】

1. 审计 app/domain/enums.py：
   - 列出 FactionId / GamePhase / ArbitratePhase / TreatyKind / RelationshipStatus / EventPriority / EventKind 所有字面量。

2. 审计 app/protocol/outgoing.py / incoming.py：
   - 列出 EventKind 全集 (≥13)、PhaseChangePayload 的 phase 字面量。

3. 修改 docs/PROTOCOL_AUDIT.md：
   - 新增段落 "v1.0-mock-to-real 类型抽离"
   - 表格列出：枚举名 / 后端字面量 / 前端 src/types 字面量 / 是否一致 / 修复方向。
   - 若发现差异：以后端为准，标记前端需修改的字符串。

4. 若 enums.py 与 outgoing/incoming.py 自身有差异（罕见但需校验），按 enums.py 为准修复 outgoing/incoming，并同步 pytest。

5. 测试：
   - app/tests/test_enums_consistency.py：assert FactionId/GamePhase 等字面量集合不变（防止误删）。
   - 若调整了 outgoing.py：补 1-2 条往返用例。

6. 验证：
   - pytest 通过。
   - ruff 通过。
   - 不启动 uvicorn。

【禁止做的事】
- 不要为兼容前端 mock 字段名修改后端字面量。
- 不要新增字面量。
- 不要删除字面量。
- 不要 alias 字面量。

【验收标准】
1. PROTOCOL_AUDIT.md 新增段落完整。
2. enums 一致性测试存在。
3. pytest / ruff 通过。

完成后输出：
（1）审计差异清单；
（2）pytest 摘要。
```

### 预期产物

- 前端：src/types/ 9 个文件 / mock/types.ts mock/factions.ts deprecated 注释 / 40+ 文件 import 替换 / typeCompatibility 测试 / ESLint warning。
- 后端：PROTOCOL_AUDIT.md 新段 / enums 一致性测试。

### 验收标准（端到端联合）

1. 业务代码 0 行 `from '@/mock/types'`。
2. 前端 tsc 0 错。
3. 后端 pytest 通过 + enums 一致。
4. PROTOCOL_AUDIT.md 含本任务差异表。

### 禁止事项

- 禁止删除 mock/types.ts / mock/factions.ts。
- 禁止 fixture 入 src/types/。
- 禁止后端为兼容 mock 改字面量。

---

## 任务 3：势力静态元数据后端下发（room.factions_meta）

### 使用场景

`FACTIONS` 常量 / `factionById()` / `speechStyleDescriptions` 三个数据源被全前端硬编码消费（颜色、名称、speech_style、文明特征）。这意味着：① 后端无法控制势力配置；② 多房间无法用不同势力套；③ 任何新增势力需前端发版。本任务把这三块抽成后端 `room.factions_meta` 事件，前端用 `factionMetaStore` 持有；所有 feature 改读 store。

### 当前 mock 状态

- `src/mock/factions.ts` 写死 8 个势力的完整 metadata，约 100 行常量。
- 业务代码大量 `import { factionById } from '@/mock/factions'`（约 30 处）。
- 后端 `app/domain/enums.py` 只有 FactionId 字面量，无名称 / 颜色 / speech_style。

### 契约对齐

```
S → C   room.factions_meta   （新增，房间 start 时下发一次；reconnect.catchup 复发）
        payload:
          factions: [{
            id: FactionId
            name: string                   '铁冠帝国' / 'Iron Crown'
            short_name: string             '铁冠'
            primary_color: '#hex'
            glow_color: '#hex'
            shadow_color: '#hex'
            speech_style: 'noble'|'cautious'|'pragmatic'|...
            speech_style_label: string     用于 UI 显示
            speech_style_description: string  i18n 默认 zh-CN
            civilization_traits: string[]  ['崇尚秩序', '军事文化', ...]
            ai_archetype: string           AI 性格描述
            capital_hex_id?: string        来自 world_geometry（任务 2 of GLOBE_MAP）
          }]
          schema_version: '1.0'
```

前端 factionMetaStore 持有 `Record<FactionId, FactionMeta>`；提供 `useFactionMeta(id)` hook 替代 `factionById(id)`。

---

### 前端子提示词

```
你是一名资深前端架构师。请把势力静态元数据从 mock 切换到后端下发 + zustand store。

【项目背景】
src/mock/factions.ts 当前是前端唯一的势力 metadata 源。本任务把 metadata 来源切换为后端 room.factions_meta 事件，前端用新的 factionMetaStore 持有。

【去 mock 联调期红线】（略）

【本任务允许做以下事情】

1. 新建 src/store/factionMetaStore.ts：
   - state:
     - byId: Partial<Record<FactionId, FactionMeta>>
     - schemaVersion: string | null
     - loadedAt: number | null
     - source: 'ws' | 'rest' | 'mock' | 'pending'
   - actions:
     - applyFactionsMeta(payload)：写入 byId，source='ws'。
     - applyFromRest(meta)：写入 byId，source='rest'。
     - applyFromMock(meta)：仅 dev mode 使用（任务 1 的 MOCK 模式），source='mock'。
     - reset(): 清空。
   - 不持久化 localStorage（每次连接重新拉取，避免脏数据）。
   - 提供 selector hook：
     - useFactionMeta(id): FactionMeta | null
     - useAllFactionMeta(): FactionMeta[]（按预设顺序）
     - useFactionPrimary(id): string

2. 新建 src/api/factionsMetaApi.ts：
   - export async function fetchFactionsMeta(roomId: string, signal?: AbortSignal): Promise<FactionMeta[]>
   - GET ${ENV.backendRestBase}/rooms/${roomId}/factions_meta
   - 用于 dev 工具或 ws 未就绪时回退到一次性拉取。
   - 不允许 fallback 到 mock。

3. 修改 src/protocol/dispatcher.ts：
   - 新增 case 'room.factions_meta' → factionMetaStore.applyFactionsMeta(payload)。
   - reconnect.catchup 含 factions_meta 时也走同一 handler。

4. 修改 src/protocol/types.ts：
   - 新增 RoomFactionsMetaMessage 与 FactionMetaPayload 接口（与契约对齐）。

5. 修改 src/app/RealtimeConnection.tsx：
   - 进入房间后若 factionMetaStore.source==='pending' 持续 3s 仍未收到，调用 fetchFactionsMeta(roomId) 兜底。
   - MOCK MODE 下，启动时 factionMetaStore.applyFromMock(FACTIONS)（这是允许的 mock 唯一出口）。

6. 替换业务代码（约 30 处）：
   - 将 `import { factionById } from '@/mock/factions'` 替换为 `import { useFactionMeta } from '@/store/factionMetaStore'`。
   - 将 `factionById(id)` 调用替换为：
     - React 组件内：`const meta = useFactionMeta(id)`
     - 工具函数 / store 内：通过 `factionMetaStore.getState().byId[id]`
   - 将 `import { FACTIONS } from '@/mock/factions'` 替换为 `useAllFactionMeta()`。
   - 将 `import { speechStyleDescriptions } from '@/mock/factions'` 替换为 `meta.speech_style_description`（每个势力自带）。
   - 涉及 features/aiSpeech / commandTerminal / epochSummary / eventStream / factionSelect / relationsPanel / replay 等子目录。

7. 防御性 fallback：
   - 当 useFactionMeta(id) 返回 null 时，组件应渲染骨架占位（灰色块 + faction id 文本），而非崩溃。
   - 新建 src/components/FactionMetaPlaceholder.tsx。

8. 修改 src/mock/factions.ts：
   - 顶部加 `// @deprecated — only allowed in MockTransport + tests + dev MOCK MODE fallback`。
   - 增加 `factionMetaFixtures: FactionMeta[]` 命名导出（替代 FACTIONS 在 mock 内部消费的位置），FACTIONS 改为别名以保持兼容。

9. MockTransport 接入：
   - 修改 src/protocol/transport.ts MockTransport：connect 后立刻发一条 mock 的 room.factions_meta（基于 factionMetaFixtures），让 mock 模式行为与真实模式一致。

10. 单元测试：
    - src/store/__tests__/factionMetaStore.test.ts：apply / reset / source 状态机。
    - src/api/__tests__/factionsMetaApi.test.ts：fetch 成功 / 失败 / abort。
    - src/components/__tests__/FactionMetaPlaceholder.test.tsx。

11. 视觉回归：
    - 进入房间 → 0..200ms 期间所有势力卡片显示 Placeholder，收到事件后填充。

12. 验证：
    - tsc / lint / test 全绿。
    - 真实 ws 模式：进入房间，收到 room.factions_meta，所有 UI 正确显示势力名 / 色 / speech_style。
    - MOCK 模式：MockTransport 模拟下发同 schema，行为一致。
    - 关闭 ws 后启动：3s 后调 REST fetchFactionsMeta 兜底；REST 失败显示 ConnectionErrorPanel（不 fallback mock）。

【禁止做的事】
- 不要在业务代码继续保留 `factionById(id)` 调用（全部替换为 store）。
- 不要把势力 metadata 写到 gameStore（独立 store，避免高频污染）。
- 不要在 factionMetaStore 调用 fetch（fetch 由 RealtimeConnection 兜底）。
- 不要让 FactionMetaPlaceholder 持久显示（5s 仍无数据则升级为错误状态）。
- 不要把 speech_style_description 写死英文（i18n 由后端给 zh-CN 默认）。
- 不要让 MOCK 模式与 REAL 模式走不同的字段名（mock fixture 必须与协议 schema 完全一致）。
- 不要让 factionMetaStore 持久化到 localStorage（每次连接重拉）。

【验收标准】
1. factionMetaStore 与 selector hook 就绪。
2. 业务代码 `factionById` / `FACTIONS` / `speechStyleDescriptions` 引用清零。
3. 协议路由 / 类型补齐。
4. Placeholder 组件就绪。
5. MockTransport 行为一致。
6. tsc / lint / test 全绿。
7. 真实 ws 模式正常显示。

完成后输出：
（1）修改 / 新增文件清单；
（2）业务代码 factionById 引用 before/after 数；
（3）首次连接 metadata 到达时延截图描述；
（4）验证摘要。
```

### 后端子提示词

```
你是一名资深后端服务工程师。请实现 room.factions_meta 事件，把势力静态元数据从后端 source-of-truth 下发。

【项目背景】
前端 src/mock/factions.ts 当前是势力静态 metadata 唯一来源。本任务让后端成为 source of truth：在 enums + domain 层定义完整 FactionMeta，并在 room.start 后立刻 emit room.factions_meta；reconnect.catchup 复发。

【去 mock 联调期红线】（略）

【本任务允许做以下事情】

1. 新建 app/domain/faction_meta.py：
   - FactionMeta dataclass / pydantic model：
     id / name / short_name / primary_color / glow_color / shadow_color / speech_style / speech_style_label / speech_style_description / civilization_traits: list[str] / ai_archetype / capital_hex_id: Optional[str]。
   - 严格约束：所有 8 个 FactionId 必须出现。

2. 新建 app/data/factions_default.py：
   - 8 个势力的默认 FactionMeta 配置，照搬 DESIGN.md "新伊甸纪元 — 势力配色 / 性格" 段落 + 文明特征。
   - 数据来源是 DESIGN.md 中的：
     铁冠帝国 Primary #8B1A1A / Glow #FF3333 / Shadow #2D0A0A
     星辉联邦 Primary #1A5F8B / Glow #33AAFF / Shadow #0A1A2D
     翡翠王庭 Primary #1A8B3D / Glow #33FF77 / Shadow #0A2D15
     灰烬部族 Primary #8B5A1A / Glow #FF9933 / Shadow #2D1E0A
     虚空教廷 Primary #5A1A8B / Glow #9933FF / Shadow #1E0A2D
     极光共和 Primary #1A8B8B / Glow #33FFFF / Shadow #0A2D2D
     熔岩议会 Primary #8B3A1A / Glow #FF6633 / Shadow #2D120A
     第 8 个（暗潮商会 darkTide）按既有 mock/factions.ts 配色补齐。
   - speech_style：noble / cautious / pragmatic / fervent / mystic / scholarly / aggressive / shadowy 八种各对应一个势力。
   - civilization_traits：3-4 条短语。
   - ai_archetype：一句话性格描述。

3. 新建 app/services/factions_meta_service.py：
   - get_factions_meta(room_id) -> list[FactionMeta]
   - 当前仅返回 default，未来可扩展按 room 配置覆盖。
   - 注入 capital_hex_id（如 world_geometry 已生成）。

4. 修改 app/protocol/outgoing.py：
   - 新增 RoomFactionsMetaEvent / RoomFactionsMetaPayload。
   - schema_version 字段（默认 '1.0'）。
   - 注册 routing.py。

5. 修改 app/services/room_service.py：
   - start_room 完成时，调用 factions_meta_service + outbound_dispatcher.emit room.factions_meta。
   - reconnect.catchup 流程中也包含 factions_meta（在 snapshot 之前）。

6. 修改 app/api/rest/rooms.py（如已有则补；否则新增 app/api/rest/factions.py）：
   - GET /debug/v1/rooms/{room_id}/factions_meta → 返回当前房间 FactionMeta list。
   - 用于前端 ws 未就绪时兜底拉取。

7. 测试：
   - app/tests/test_factions_meta_service.py：默认 8 个、capital_hex_id 注入、override 占位。
   - app/tests/test_protocol.py：RoomFactionsMetaEvent 往返。
   - app/tests/test_room_service.py：start_room 后下发 + reconnect.catchup 复发。
   - app/tests/test_rest_factions.py：REST endpoint。

8. PROTOCOL_AUDIT.md 更新 "v1.0-mock-to-real" 段：新增 room.factions_meta 事件 + payload 字段清单。

9. 验证：
   - pytest 通过。
   - ruff 通过。

【禁止做的事】
- 不要把 FactionMeta 写到 enums.py（enums 仅字面量）。
- 不要让 factions_meta 内含敏感字段（hash / secret）。
- 不要在 action 期 emit factions_meta（仅 room.start / reconnect）。
- 不要在 settlement 期变更 metadata（静态）。
- 不要为兼容前端 mock 字段命名改 schema（如 mock 是 camelCase 而后端是 snake_case，按后端为准；前端 src/types/faction.ts 调整）。

【验收标准】
1. FactionMeta domain 完整。
2. 8 个默认配置齐全且色板正确。
3. RoomFactionsMetaEvent 注册。
4. room.start + reconnect 下发。
5. REST endpoint 就绪。
6. ≥6 条单测全绿。
7. ruff 通过。
8. PROTOCOL_AUDIT.md 更新。

完成后输出：
（1）修改 / 新增文件清单；
（2）8 势力配置表；
（3）pytest 摘要。
```

### 预期产物

- 前端：factionMetaStore / factionsMetaApi / 协议路由与类型 / 30 处业务替换 / Placeholder / MockTransport 行为更新 / 测试。
- 后端：FactionMeta domain / factions_default 数据 / factions_meta_service / RoomFactionsMetaEvent / room_service 集成 / REST endpoint / 测试。

### 验收标准（端到端联合）

1. dev-up 后进入房间，0-300ms 内前端收到 room.factions_meta；所有势力卡片填充。
2. 关闭 ws 启动：3s 后 REST 兜底拉到，UI 仍正常。
3. MOCK 模式：MockTransport 模拟下发，行为一致。
4. 业务代码 `factionById` 引用 0。
5. 颜色 / 名称 / speech_style 与 DESIGN.md 一致。

### 禁止事项

- 禁止业务代码继续直接 import factionById。
- 禁止 metadata 写 gameStore。
- 禁止 mock fallback。
- 禁止 action 期 emit。

---

## 任务 4：gameStore 初始状态去 mock（bootstrap empty + snapshot 驱动）

### 使用场景

`src/store/gameStore.ts` 第 1045 / 1070 行 `createInitialState()` / `createInitialState(seed)` 从 `@/mock/initialState` 构造完整 8 势力初始状态。意味着：① 前端启动就有 mock 数据"假装在玩"；② 真实 snapshot 到来时需要 merge 而非 replace，容易污染；③ 玩家进入空房间也会看到 mock 数据。本任务让 gameStore 启动为"空状态"，等待 `room.snapshot` / `room.started` 真实事件填充。

### 当前 mock 状态

- `src/store/gameStore.ts` 顶部 `import { createInitialState } from '@/mock/initialState'`。
- `const initialState = createInitialState()` 在模块作用域执行，副作用立刻产生 mock 状态。
- `resetGameState(seed)` action 调用 `createInitialState(seed)`。
- `src/mock/initialState.ts` 又依赖 `gameState.ts`（PHASE_DURATIONS / TURNS_PER_EPOCH / MAX_EPOCHS）— 这些应该来自后端配置。

### 契约对齐

```
S → C   room.snapshot   （已存在或扩展）
        payload:
          room_id / players / current_epoch / current_turn / current_phase / phase_started_at
          factions: FactionState[]
          relationships: Relationship[]
          treaties: Treaty[]
          regions: RegionEntry[]
          events_window: GameEvent[]   最近 50 条事件
          settings: {
            phase_durations: Record<GamePhase, int>   毫秒
            turns_per_epoch: int
            max_epochs: int
          }

新增前端 gameStore action:
  bootstrapEmpty(): 清空所有切片到 sentinel 空状态
  applySnapshot(payload): 替换式应用
  resetForDev(): 仅 dev 模式可用，调用 mock fixtures
```

---

### 前端子提示词

```
你是一名资深前端状态管理工程师。请重构 gameStore 让其启动为"空状态"，由协议事件驱动数据填充。

【项目背景】
当前 gameStore 启动即 createInitialState() 产生完整 mock。本任务把 store 改为 bootstrap empty + applySnapshot 驱动。

【去 mock 联调期红线】（略）

【本任务允许做以下事情】

1. 新建 src/store/gameStoreEmpty.ts：
   - 导出 createEmptyState(): GameState
     - factions: []
     - relationships: []
     - treaties: []
     - regions: []
     - eventsWindow: []
     - currentEpoch: 0
     - currentTurn: 0
     - currentPhase: 'observe'
     - phaseStartedAt: 0
     - settings: { phase_durations: {}, turns_per_epoch: 0, max_epochs: 0 }
     - status: 'not_started'  // 新增字段
   - 类型与 src/types/ 对齐。

2. 修改 src/store/gameStore.ts：
   - 移除 `import { createInitialState } from '@/mock/initialState'`。
   - 移除 `import { MAX_EPOCHS, TURNS_PER_EPOCH, getPhaseDurationMs } from '@/mock/gameState'`（这些常量改从 state.settings 读）。
   - 初始 state = createEmptyState()。
   - 新增 actions:
     - bootstrapEmpty(): set createEmptyState()
     - applySnapshot(payload: RoomSnapshotPayload): 替换式应用，status 设为 'snapshot_applied'
     - applyRoomStarted(payload: RoomStartedPayload): 同上 + status='in_progress'
   - resetGameState(seed?) 改为：
     - 在 dev mode（`import.meta.env.DEV`）调用 createInitialState(seed) 仍可用（保留 mock 兼容）。
     - 在 prod build 中 throw "resetGameState is not allowed in production"。
   - 所有 selector / hook 需处理 factions=[] 空数组（任务 3 的 Placeholder 复用思想）。

3. 修改 src/protocol/dispatcher.ts：
   - 'room.snapshot' → gameStore.applySnapshot(payload)。
   - 'room.started' → gameStore.applyRoomStarted(payload)。
   - 'reconnect.snapshot' → applySnapshot（相同 handler，避免重复代码）。
   - 'room.world_geometry'（任务 2 of GLOBE_MAP）→ gameStore.applyWorldGeometry（已实现，本任务不动）。

4. 修改 src/protocol/types.ts：
   - 新增 / 完善 RoomSnapshotPayload / RoomStartedPayload。
   - phase_durations / turns_per_epoch / max_epochs 字段。

5. 修改 src/pages/GamePage.tsx：
   - mount 时 if `gameStore.status==='not_started'` 显示 LoadingHologram + 文案"等待房间初始化..."。
   - 收到 snapshot 后切换正常 UI。

6. 修改 src/features/phaseSystem/PhaseStateMachine.ts：
   - 不再从 `@/mock/gameState` 取 phase_durations，改为 gameStore.settings.phase_durations。

7. 删除 `src/mock/initialState.ts` 与 `src/mock/gameState.ts` 在生产代码的所有 import：
   - grep 校验：features / pages / store / render / effects / api 中无导入。
   - MockTransport 仍可保留导入（mock 内部）。

8. MockTransport 联动：
   - 修改 src/protocol/transport.ts MockTransport：connect 后按顺序模拟 emit：
     1. conn.auth.ok
     2. room.factions_meta（任务 3 已加）
     3. room.snapshot（基于 createInitialState fixture 构造）
     4. room.started
     5. turn.begin
   - 与真实后端 emit 顺序一致。

9. 单元测试：
   - src/store/__tests__/gameStore.bootstrap.test.ts：
     - 初始 state 为空。
     - applySnapshot 替换式（不 merge）。
     - applyRoomStarted 切 status。
     - dev / prod 下 resetGameState 行为不同。
   - src/protocol/__tests__/dispatcher.snapshot.test.ts：
     - snapshot / room.started / reconnect.snapshot 路由正确。

10. 验证：
    - tsc / lint / test 全绿。
    - dev：先进入 GamePage → LoadingHologram 显示 → 收到 snapshot → UI 正常。
    - MockTransport 模式行为一致。
    - 生产 build 调用 resetGameState 抛错。

【禁止做的事】
- 不要让 gameStore 初始化时携带任何势力数据。
- 不要在生产代码继续 import createInitialState。
- 不要在 applySnapshot 中 merge（必须替换式）。
- 不要让 status 字段被业务逻辑滥用（仅 UI 判断"未就绪"）。
- 不要修改 mapStore / uiStore（本任务范围之外）。
- 不要让 MockTransport 与 RealTransport emit 顺序不同。
- 不要让 LoadingHologram 持续超 10s 而不报错（10s 未收 snapshot 转 ConnectionErrorPanel）。

【验收标准】
1. createEmptyState 就绪。
2. gameStore 启动空状态。
3. applySnapshot / applyRoomStarted 就绪。
4. 生产代码 0 行 import @/mock/initialState 与 @/mock/gameState。
5. MockTransport emit 顺序与真实一致。
6. GamePage 等待 UI 就绪。
7. 10s 超时降级。
8. tsc / lint / test 全绿。

完成后输出：
（1）修改 / 新增文件清单；
（2）grep before/after 行数；
（3）首次 snapshot 到达时延截图描述；
（4）验证摘要。
```

### 后端子提示词

```
你是一名资深后端服务工程师。请确保 room.snapshot 含 settings（phase_durations / turns_per_epoch / max_epochs）字段，使前端无需从 mock 读这些常量。

【项目背景】
前端 PhaseStateMachine 与 gameStore 当前从 mock/gameState.ts 读 phase 时长等常量。后端应在 room.snapshot 携带这些设置。

【去 mock 联调期红线】（略）

【本任务允许做以下事情】

1. 修改 app/protocol/outgoing.py：
   - RoomSnapshotPayload 新增 settings:
     class RoomSettingsPayload:
       phase_durations: dict[GamePhase, int]   毫秒
       turns_per_epoch: int
       max_epochs: int
   - schema_version: '1.0'

2. 修改 app/services/room_service.py：
   - build_snapshot(room) 携带 settings（从 app/core/config.py 读取）。

3. 修改 app/core/config.py：
   - 新增 RoomSettings 配置类：
     phase_durations: dict (observe=10000, action=60000, resolve=8000, arbitrate=12000)
     turns_per_epoch: 20
     max_epochs: 5
   - 通过 env 可覆盖。

4. 修改 app/api/websocket/dispatcher.py：
   - reconnect.snapshot 也走相同 build_snapshot，settings 齐全。

5. 测试：
   - app/tests/test_room_snapshot_settings.py：snapshot 含 settings 三字段。
   - app/tests/test_protocol.py：RoomSnapshotPayload 往返。

6. PROTOCOL_AUDIT.md 更新。

7. 验证：
   - pytest / ruff 通过。

【禁止做的事】
- 不要把 settings 散落在多个事件（仅 snapshot 携带）。
- 不要让 phase_durations 在 action 期变化（房间内固定）。
- 不要把 turns_per_epoch 设为 0（边界校验）。

【验收标准】
1. RoomSettingsPayload 完整。
2. snapshot 携带 settings。
3. reconnect 一致。
4. config 可 env 覆盖。
5. 测试通过。

完成后输出：
（1）修改 / 新增文件清单；
（2）默认 settings 值表；
（3）pytest 摘要。
```

### 预期产物

- 前端：gameStoreEmpty / gameStore 重构 / dispatcher 路由完善 / GamePage 等待 UI / phase_durations 来源切换 / MockTransport emit 顺序 / 测试。
- 后端：RoomSettingsPayload / build_snapshot 集成 / config / 测试。

### 验收标准（端到端联合）

1. dev-up 后进入 GamePage：先 LoadingHologram，收到 snapshot 后正常 UI。
2. 后端断开 10s 后超时 → ConnectionErrorPanel。
3. snapshot 含 phase_durations / turns_per_epoch / max_epochs。
4. PhaseStateMachine 读 store 的 settings 而非 mock 常量。
5. MOCK 模式行为一致。

### 禁止事项

- 禁止 gameStore 自带 mock 数据。
- 禁止 merge 式 applySnapshot。
- 禁止 prod 调用 createInitialState。

---

## 任务 5：AI 行为完全后端驱动（删除前端 triggerAIResponses）

### 使用场景

`src/mock/aiResponder.ts` 通过 setTimeout 在前端模拟 "AI 正在思考 / 说话 / 反应"；`src/features/aiSpeech/useAIResponseScheduler.ts` 在玩家发完言后调用 `triggerAIResponses(...)`。这套机制在 mock 期合理，但当 `VITE_USE_WS=true` 时，**它与后端真实 ai.thinking / ai.speak / ai.reaction 并行运行，造成双 AI 响应叠加**。本任务把生产路径切干净：useAIResponseScheduler 只订阅协议事件；triggerAIResponses 仅 MockTransport 内部用。

### 当前 mock 状态

- `useAIResponseScheduler.ts` 在玩家 speak/private 后调用 `triggerAIResponses(...)`，无论 useWs 真假。
- `RealtimeConnection.tsx` 还有 `startMockGameLoop` 直接驱动节奏（任务 4 已处理 snapshot 部分，但 AI 节奏分支独立）。
- 后端 SettlementService（同步完善任务 1+3 后）已能在 resolve 阶段 emit ai.thinking / ai.speak / ai.reaction。

### 契约对齐

```
后端在 resolve 阶段（玩家发言后下一个 resolve）emit：
  ai.thinking { faction_id, intent_tag, eta_ms }
  ai.speak { faction_id, kind, text, mentioned_factions, tone }
  ai.reaction { faction_id, target_event_id, reaction_kind, intensity }

前端 useAIResponseScheduler 仅订阅这些事件并触发 UI 动画（思考气泡 / 浮窗 / 标签）；
不再产生 setTimeout 模拟。
```

---

### 前端子提示词

```
你是一名资深前端事件调度工程师。请把"AI 在思考/说话/反应"完全切到协议事件驱动。

【项目背景】
useAIResponseScheduler 当前同时被 setTimeout（mock）与 ws 事件（真实）驱动，造成双响应。本任务删除前端模拟，只保留事件订阅。

【去 mock 联调期红线】（略）

【本任务允许做以下事情】

1. 重构 src/features/aiSpeech/useAIResponseScheduler.ts：
   - 删除 `import { clearAIResponseTimers, triggerAIResponses } from '@/mock/aiResponder'`。
   - useEffect 仅订阅 gameStore.events.lastAIThinking / lastAISpeak / lastAIReaction（这些 selector 由 dispatcher 写入）。
   - 不再启动任何 setTimeout 模拟 AI 响应。

2. 修改 src/protocol/dispatcher.ts：
   - 'ai.thinking' / 'ai.speak' / 'ai.reaction' 路由分别 dispatch 到 gameStore。
   - gameStore 新增切片：
     - aiThinkingByFaction: Map<FactionId, AIThinkingState>
     - aiSpeakQueue: AISpeakEvent[]（ring buffer 50）
     - aiReactionByEvent: Map<eventId, AIReaction[]>
   - 各动画组件改读这些切片。

3. 修改 src/features/aiSpeech/PublicSpeechBubble.tsx：
   - 读 aiSpeakQueue 显示最近 N 条 public 演讲。
   - 不再调用 triggerAIResponses。

4. 修改 src/features/aiSpeech/PrivateMessageDrawer.tsx：
   - 读 aiSpeakQueue.filter(kind==='private') 显示密谈。

5. 修改 src/features/aiSpeech/ReactionTag.tsx：
   - 读 aiReactionByEvent[eventId] 显示反应。

6. 修改 src/features/aiSpeech/NarrationBanner.tsx：
   - 读 aiSpeakQueue.filter(kind==='narration') 显示旁白。

7. 修改 src/app/RealtimeConnection.tsx：
   - 删除 `startMockGameLoop` 在 useWs=true 分支的调用。
   - useWs=false（MOCK MODE）下仍调用 startMockGameLoop（任务 1 已实现）。

8. MockTransport 内部：
   - src/mock/aiResponder.ts / src/mock/gameLoop.ts 保留实现，但仅 MockTransport.connect() / handleClientSpeech() 内部调用。
   - MockTransport 在收到 client action.speak / action.private 后内部触发 triggerAIResponses，并通过 emit ai.thinking / ai.speak / ai.reaction 反向推到 dispatcher（与真实后端一致）。
   - 不再让 useAIResponseScheduler 直接接触 mock 函数。

9. 单元测试：
   - src/features/aiSpeech/__tests__/useAIResponseScheduler.event-driven.test.ts：
     - 发 ai.thinking 事件 → thinking 状态进入。
     - 发 ai.speak 事件 → queue 增加。
     - 不再有 setTimeout 调用（vi.useFakeTimers + 断言）。
   - src/mock/__tests__/MockTransport.aiResponse.test.ts：
     - 模拟客户端发 action.speak → MockTransport 内部 N 秒后 emit ai.thinking + ai.speak。
     - emit 顺序与字段与真实后端契约一致。

10. 视觉回归：
    - 真实 ws + MOCK 双模式下，AI 响应动画表现一致（思考 → 说话 → 反应 序列）。

11. 验证：
    - tsc / lint / test 全绿。
    - 真实 ws：玩家发言 → 后端 ai.thinking → 思考气泡 → ai.speak → bubble → ai.reaction → tag。
    - MOCK：同序列由 MockTransport 内部触发。
    - 不存在"前端定时器 + 后端事件"双轨。

【禁止做的事】
- 不要在 useAIResponseScheduler 保留任何 setTimeout / setInterval。
- 不要让 useAIResponseScheduler import @/mock/**。
- 不要让 MockTransport 通过修改 store 直接驱动 UI（必须走 dispatcher 与真实一致）。
- 不要修改 useEffectsBus（特效层不动）。
- 不要把 aiSpeakQueue 改为持久化。
- 不要在 prod build 中允许 import startMockGameLoop（vite tree-shake 应能去除，加 console.warn 检测）。
- 不要让 reaction tag 出现在玩家自己的事件上（仅其它势力对玩家事件的 reaction）。

【验收标准】
1. useAIResponseScheduler 0 个 setTimeout。
2. useAIResponseScheduler 不 import @/mock/**。
3. dispatcher 路由 ai.thinking / ai.speak / ai.reaction 完整。
4. gameStore 切片就绪。
5. PublicSpeechBubble / PrivateMessageDrawer / ReactionTag / NarrationBanner 全改读 store。
6. RealtimeConnection 在 useWs=true 不调 startMockGameLoop。
7. MockTransport 模拟事件序列与真实一致。
8. tsc / lint / test 全绿。
9. 视觉回归：双模式行为一致。

完成后输出：
（1）修改 / 新增文件清单；
（2）setTimeout 引用 before/after grep；
（3）视觉回归对照说明；
（4）验证摘要。
```

### 后端子提示词

```
你是一名资深后端 LLM 调度工程师。请确认 ai.thinking / ai.speak / ai.reaction 三事件在所有场景下完整 emit。

【项目背景】
同步完善任务 1 / 3 已实现 LLM provider + ai 性格。本任务做回归校验：所有玩家发言场景、所有 AI 反应场景，后端都能 emit 完整三事件，前端从此完全依赖事件驱动。

【去 mock 联调期红线】（略）

【本任务允许做以下事情】

1. 审计 app/services/settlement_service.py：
   - 列出所有 emit ai.thinking / ai.speak / ai.reaction 的位置。
   - 校验：每次 LLM 调用前必先 emit ai.thinking，调用完成后 emit ai.speak / reaction。
   - 校验：reaction 必有 target_event_id；speak 必有 kind ∈ {public, private, narration}。

2. 补齐缺失场景：
   - 玩家公开演讲 → 触发 N-1 个其它势力 reaction（resolve 期）。
   - 玩家密谈 → 触发对方 1 个 reaction（resolve 期）。
   - 玩家条约 → 触发相关势力的 ai.speak（评论）。
   - 玩家宣战 → 触发被宣战方 ai.speak（声明） + 第三方 ai.reaction。

3. 修改 app/protocol/outgoing.py：
   - 校验 AIThinkingPayload / AISpeakPayload / AIReactionPayload 字段齐全。
   - 任何漂移补全。

4. 测试：
   - app/tests/test_ai_event_emission.py：
     - 公开演讲场景：emit ai.thinking ×N + ai.speak ×N + ai.reaction ×N（其中 N=6 其它势力）。
     - 密谈：1 个 thinking + 1 个 speak（反方）。
     - 条约：相关势力数 thinking + speak。
     - 宣战：被宣战方 1 + 第三方 reaction。
   - emit 顺序：thinking → speak → reaction（不可乱序）。

5. PROTOCOL_AUDIT.md 更新："AI 事件场景完整性"段落。

6. 验证：
   - LLM_PROVIDER=mock 全跑通。
   - pytest / ruff 通过。

【禁止做的事】
- 不要在 action 阶段 emit ai.* 事件（仅 resolve）。
- 不要让 reaction 没有 target_event_id。
- 不要让 mock LLM 输出空字符串（占位文案需有）。
- 不要让 ai.thinking 在 ai.speak 之后 emit。

【验收标准】
1. 4 种场景 emit 完整。
2. 字段齐全。
3. emit 顺序正确。
4. 测试通过。
5. ruff 通过。

完成后输出：
（1）修改 / 新增文件清单；
（2）4 种场景 emit 序列表；
（3）pytest 摘要。
```

### 预期产物

- 前端：useAIResponseScheduler 重构 / dispatcher 路由 / gameStore 切片 / 4 个动画组件改读 store / MockTransport 行为统一 / 测试。
- 后端：ai 事件场景完整性补齐 / 测试。

### 验收标准（端到端联合）

1. 真实 ws 模式：玩家公开演讲后，6 个其它势力依次出现"思考 → 演讲 → 反应"。
2. MOCK 模式同序列由 MockTransport 内部驱动。
3. 不存在双轨触发（前端 setTimeout 0 行）。
4. 密谈 / 条约 / 宣战场景 AI 响应正确。
5. PROTOCOL_AUDIT 更新。

### 禁止事项

- 禁止前端定时器模拟 AI。
- 禁止 useAIResponseScheduler 导入 mock。
- 禁止 action 期 emit ai 事件。
- 禁止 reaction 无 target_event_id。

---

## 任务 6：EpochSummary 旁白真实化（删除前端 SYSTEM_NARRATION_TEMPLATES）

### 使用场景

`src/features/epochSummary/AINarration.tsx` 当前用 `SYSTEM_NARRATION_TEMPLATES.epoch_summary` 随机取模板字串显示纪元总结旁白；KeyBetrayals / KeyWars / MajorEvents / RankingDelta 等组件也用 mock 数据装饰。本任务把这些改为消费后端 `arbitrate.epic_narration` / `arbitrate.summary_narration` 事件。

### 当前 mock 状态

- `src/features/epochSummary/AINarration.tsx` 第 4 行 import + 37 行使用模板。
- `src/mock/aiTemplates.ts` 含 epoch_summary / private_message / public_speech 三组模板。
- 后端 arbitrate 阶段已存在但未 emit 专门的"epoch 旁白"事件（按 SYNC_REFINEMENT 任务 3 估计已部分覆盖，需校验）。
- KeyBetrayals / KeyWars 等组件从 gameStore.events 派生显示，但叙事 hint 字段缺失。

### 契约对齐

```
S → C   arbitrate.epic_narration   （新增）
        payload:
          epoch: int
          narrative: string    多段 markdown / 200-600 字
          tone: 'triumph'|'tragic'|'neutral'|'ominous'|'comic'
          key_events: [{event_id, salience: 0..1, summary_line: string}]
          source: 'llm'|'template_fallback'

S → C   arbitrate.summary_narration   （新增，与 epic 区分：epic 是故事化长文，summary 是结构化简报）
        payload:
          epoch: int
          headline: string         一句话标题
          rankings: [{faction_id, score, delta}]
          highlights: [{kind:'war'|'betrayal'|'major_event'|'speech', text, faction_ids:[]}]
          source: 'llm'|'template_fallback'

前端 epochSummaryStore（新增）持有上述两份 payload。
```

---

### 前端子提示词

```
你是一名资深前端叙事 / 状态工程师。请把 EpochSummary 全部组件改为消费后端旁白事件。

【项目背景】
AINarration 当前从前端模板池随机取字串，与真实游戏内容无关。本任务接入后端 arbitrate.epic_narration / arbitrate.summary_narration。

【去 mock 联调期红线】（略）

【本任务允许做以下事情】

1. 新建 src/store/epochSummaryStore.ts：
   - state:
     - byEpoch: Map<int, { epic: EpicNarrationPayload | null, summary: SummaryNarrationPayload | null }>
     - latestEpoch: int | null
   - actions:
     - applyEpic(payload)
     - applySummary(payload)
     - reset()
   - selector: useEpochNarration(epoch) → { epic, summary }

2. 修改 src/protocol/dispatcher.ts：
   - 'arbitrate.epic_narration' → epochSummaryStore.applyEpic
   - 'arbitrate.summary_narration' → epochSummaryStore.applySummary

3. 修改 src/features/epochSummary/AINarration.tsx：
   - 删除 `import { SYSTEM_NARRATION_TEMPLATES } from '@/mock/aiTemplates'`。
   - 改读 `useEpochNarration(currentEpoch).epic.narrative` 渲染（支持 markdown 渐进显示）。
   - 若 narrative 缺失：显示骨架 + "正在生成纪元旁白..."（用 ai.thinking 事件状态）。
   - 若 source==='template_fallback'：右下角细小标记 "FALLBACK"。

4. 修改 src/features/epochSummary/KeyBetrayals.tsx / KeyWars.tsx / MajorEvents.tsx / RankingDelta.tsx：
   - 不再从 mock 取数据；改读 epochSummaryStore.summary.highlights / rankings。
   - 保留组件视觉骨架；只换数据源。

5. 修改 src/features/epochSummary/EpochSummaryPanel.tsx（如已存在）：
   - mount 时若 byEpoch.get(currentEpoch) 缺失，显示 LoadingHologram。
   - 5s 仍无：显示"旁白生成超时，请刷新"。

6. 类型：
   - src/types/replay.ts 已含 narrative 相关类型（任务 2），补全 EpicNarrationPayload / SummaryNarrationPayload。

7. MockTransport 联动：
   - MockTransport.advanceEpoch() 完成时，模拟 emit arbitrate.epic_narration + arbitrate.summary_narration，narrative 从 SYSTEM_NARRATION_TEMPLATES 取，附 source='template_fallback'。
   - 使前端在 MOCK 模式 EpochSummary 仍能展示。

8. 单元测试：
   - epochSummaryStore 状态机。
   - AINarration 在 narrative 缺失 / 正常 / fallback 三态渲染。
   - dispatcher 路由。

9. 验证：
   - tsc / lint / test 全绿。
   - 真实 ws + arbitrate 结束：UI 显示后端 narrative（带 source='llm'）。
   - MOCK：UI 显示模板旁白（带 source='template_fallback' 标记）。

【禁止做的事】
- 不要让 AINarration 继续 import @/mock/aiTemplates。
- 不要让 KeyBetrayals 等组件从 gameStore.events 自行派生 narrative（必须 store 现成数据）。
- 不要在 epochSummaryStore 持久化。
- 不要让 narrative 渐进显示速度受用户输入影响（统一 30 字符/秒）。
- 不要把 markdown 渲染做花哨（用 react-markdown 或自实现，但仅支持 heading/bold/italic）。
- 不要让 FALLBACK 标记影响主区域布局。

【验收标准】
1. epochSummaryStore 就绪。
2. AINarration / KeyBetrayals / KeyWars / MajorEvents / RankingDelta 全改读 store。
3. 模板 import 在 features 中清零。
4. fallback 标记可见。
5. MockTransport 模拟事件可用。
6. tsc / lint / test 全绿。

完成后输出：
（1）修改 / 新增文件清单；
（2）mock import before/after；
（3）三态渲染说明；
（4）验证摘要。
```

### 后端子提示词

```
你是一名资深后端 LLM 叙事工程师。请实现 epoch 结束时的 epic_narration + summary_narration 两条 arbitrate 事件。

【项目背景】
前端 EpochSummary 当前用前端模板池。本任务后端在 arbitrate 阶段调用 LLM 生成"故事化长文 + 结构化简报"两份内容下发。

【去 mock 联调期红线】（略，LLM 调用仅 arbitrate 期）

【本任务允许做以下事情】

1. 新建 app/services/epoch_narration_service.py：
   - generate_epic_narration(epoch_state, llm) -> EpicNarrationPayload
     - prompt: 输入本纪元关键事件、势力排名变化、重大背叛 / 战争。
     - 输出: 200-600 字中文叙事 + tone + key_events 列表。
     - 失败 fallback: 从 app/data/narration_templates.py 取模板，source='template_fallback'。
   - generate_summary_narration(epoch_state, llm) -> SummaryNarrationPayload
     - prompt: 输入相同但要求结构化 JSON。
     - 输出: headline + rankings + highlights。
     - 失败 fallback: 同上。

2. 新建 app/data/narration_templates.py：
   - 中文模板池，5-10 条 epoch_summary / headline / highlight 模板。
   - 用 {faction_name} / {epoch} 占位符。

3. 新建 app/protocol/narration_events.py：
   - EpicNarrationEvent / SummaryNarrationEvent。
   - Payload 与契约对齐。
   - 注册 routing.py。

4. 修改 app/services/settlement_service.py / arbitrate_service.py（如有独立 service）：
   - arbitrate 阶段末尾调用 epoch_narration_service。
   - emit epic_narration → summary_narration（先 epic 后 summary，前端体验：先看故事，再看简报）。

5. 修改 app/llm/prompt_builder.py：
   - 新增 build_epic_narration_prompt / build_summary_narration_prompt。
   - 严格 schema 输出（summary 的 JSON 用 pydantic 校验）。

6. 修改 app/llm/mock_client.py：
   - call_epic_narration / call_summary_narration → 取模板组合 deterministic 输出。

7. 修改 app/llm/real_client.py：
   - 同步实现 real 调用 + 超时 + 重试 + fallback。

8. 测试：
   - test_epoch_narration_service.py：
     - mock 输出 deterministic。
     - LLM 失败 fallback 模板。
     - epic narrative 长度 ≥200 字符。
     - summary highlights 至少包含战争 / 演讲 各 1。
   - test_protocol.py：两事件往返。
   - test_arbitrate_service.py：emit 顺序与字段。

9. PROTOCOL_AUDIT.md 更新。

10. 验证：
    - LLM_PROVIDER=mock 全跑通。
    - pytest / ruff 通过。

【禁止做的事】
- 不要在 resolve 期 emit 这两个事件（仅 arbitrate）。
- 不要让 LLM 输出超 1000 字符（token 控制）。
- 不要让 fallback 模板与前端模板池字串一致（必须独立维护避免双重耦合）。
- 不要让 summary 的 JSON 携带 narrative 长字段（保持结构化简短）。
- 不要让 source 字段缺失。

【验收标准】
1. epoch_narration_service 完成。
2. 模板池 ≥10 条。
3. 两事件协议 + 路由。
4. arbitrate 集成。
5. mock / real 双 provider。
6. ≥8 条单测全绿。
7. PROTOCOL_AUDIT.md 更新。

完成后输出：
（1）修改 / 新增文件清单；
（2）mock 与真实 LLM 输出示例对照；
（3）pytest 摘要。
```

### 预期产物

- 前端：epochSummaryStore / 5 个 EpochSummary 组件改造 / dispatcher 路由 / MockTransport 联动 / 测试。
- 后端：epoch_narration_service / 模板池 / 协议事件 / arbitrate 集成 / LLM provider 扩展 / 测试。

### 验收标准（端到端联合）

1. 一个 epoch 结束：EpochSummary 显示后端 narrative（source='llm'）。
2. LLM 失败：UI 显示模板 fallback + 角标。
3. MOCK 模式 EpochSummary 仍正常。
4. AINarration 不再 import mock。
5. PROTOCOL_AUDIT 更新。

### 禁止事项

- 禁止前端继续 import 模板。
- 禁止 resolve 期 emit 这俩事件。
- 禁止 mock / real fallback 模板字串相同。

---

## 任务 7：Replay 真实化（删除 replayFixture 默认）

### 使用场景

`src/pages/ReplayPage.tsx` 第 18 行 `import { replayFixture } from '@/mock/replayFixtures'` 用作 fetch 失败 fallback；同时 `src/api/replayApi.ts` 也部分依赖 mock。本任务让 replayApi 失败时显式报错 + 重试，不静默走 fixture；fixture 仅在 MOCK 模式下显式使用。

### 当前 mock 状态

- `ReplayPage.tsx` 18 / 166 行：fetch 失败显示 ErrorPanel，但页面"骨架"可能仍用 fixture 数据混入（按代码 review 确认）。
- `src/api/replayApi.ts`：fetch /rooms/{id}/replay 已存在，但失败路径或测试路径可能 fallback。
- 后端 REST endpoint 状态未知，需校验。

### 契约对齐

```
GET /debug/v1/rooms/{room_id}/replay
  200: ReplayDTO (与 src/types/replay.ts 对齐)
  404: { error: 'room_not_found' }
  500: { error, message }

ReplayDTO:
  room_id / total_turns / start_ts / end_ts
  timeline: ReplayTimelineNode[]
  factions: FactionMeta[]
  key_moments: KeyMoment[]
  faction_curves: FactionCurve[]
  ai_inner_thoughts: AIInnerThought[]
```

---

### 前端子提示词

```
你是一名资深前端 API / 错误处理工程师。请删除 ReplayPage 的 fixture fallback，改为显式错误 + 重试。

【项目背景】
当前 replay 失败时 UI 行为模糊。本任务让"成功显示真实 replay；失败显示明确错误"。

【去 mock 联调期红线】（略）

【本任务允许做以下事情】

1. 重构 src/api/replayApi.ts：
   - fetchReplay(roomId, signal):
     - 仅 fetch；不 fallback mock。
     - 错误返回 typed Result：{ ok: true, data } | { ok: false, code: 'NOT_FOUND'|'NETWORK'|'PARSE'|'TIMEOUT', message }。
   - 删除 normalizeReplayDto 中任何 fixture merge 逻辑。
   - 单元测试覆盖 4 种错误码。

2. 修改 src/pages/ReplayPage.tsx：
   - 删除 `import { replayFixture } from '@/mock/replayFixtures'` 与默认值。
   - 状态机:
     - 'loading' → LoadingHologram
     - 'success' → ReplayStage 正常渲染
     - 'error' → ErrorPanel 带 retry button
     - 'mock' → MOCK MODE 横幅 + fixture（仅 ENV.useWs===false）
   - retry 调 fetchReplay 重试，最多 3 次后停止自动重试，必须用户手动触发。

3. 新建 src/store/replayStore.ts（可选）：
   - state: roomId / status / data / errorCode / errorMessage / lastFetchedAt
   - actions: load / retry / reset / loadMockFixture
   - selector: useReplay()
   - 不持久化。

4. MockTransport 联动 / MOCK 模式：
   - 当 ENV.useWs===false 进入 ReplayPage：
     - 直接 replayStore.loadMockFixture(replayFixture)。
     - UI 顶部 MOCK MODE 横幅持续显示。
   - 真实 ws 模式下严禁触碰 replayFixture。

5. 修改 src/features/replay/ReplayStage.tsx / AIInnerThoughtPanel.tsx / FactionCurves.tsx / KeyMoments.tsx：
   - 改读 replayStore.data（如已用 replayStore 则保持）。
   - 不再 import @/mock/replay 的数据导出（类型导入已在任务 2 抽到 src/types/replay.ts）。

6. 单元测试：
   - replayApi 4 种错误码测试。
   - ReplayPage 状态机：loading / success / error / mock 切换。
   - ErrorPanel retry 行为。

7. 验证：
   - tsc / lint / test 全绿。
   - 真实 ws + 房间存在：ReplayPage 加载 → 显示真实 timeline。
   - 真实 ws + 房间不存在：ErrorPanel + "重试"按钮。
   - MOCK 模式：fixture 直接显示 + 横幅。

【禁止做的事】
- 不要让 fetchReplay 在失败时返回 fixture。
- 不要让 ReplayPage 在 useWs=true 时静默 loadMockFixture。
- 不要让 retry 自动循环超 3 次。
- 不要修改 ReplayStage 视觉骨架（仅换数据源）。
- 不要把 replayStore 持久化。

【验收标准】
1. replayApi typed Result + 4 错误码。
2. ReplayPage 状态机 4 态。
3. 严禁真实模式触 fixture。
4. retry 行为正确。
5. tsc / lint / test 全绿。

完成后输出：
（1）修改 / 新增文件清单；
（2）4 错误码 / 4 状态截图描述；
（3）验证摘要。
```

### 后端子提示词

```
你是一名资深后端 REST 工程师。请实现 / 校验 /rooms/{room_id}/replay 完整 endpoint，返回符合契约的 ReplayDTO。

【项目背景】
前端 replayApi 严格要求成功 → ReplayDTO；失败 → 明确错误码。本任务校验后端 endpoint 完整性。

【去 mock 联调期红线】（略）

【本任务允许做以下事情】

1. 校验或新增 app/api/rest/replay.py：
   - GET /debug/v1/rooms/{room_id}/replay
   - 返回 ReplayDTO (room_id / total_turns / start_ts / end_ts / timeline / factions / key_moments / faction_curves / ai_inner_thoughts)。
   - 房间不存在 → 404 { error: 'room_not_found' }。
   - 房间未结束 → 200 但 timeline 为部分（in_progress=true）。

2. 新建 app/services/replay_service.py（如不存在）：
   - build_replay_dto(room) -> ReplayDTO
   - 从 EventLog + FactionState 历史 + AI Diary 装配。

3. 协议字段：
   - ReplayDTO pydantic model 完整 schema。
   - 与前端 src/types/replay.ts 对齐。

4. 测试：
   - test_replay_api.py：
     - 房间存在 → 200 + 字段齐全。
     - 房间不存在 → 404。
     - 房间空 timeline → 200 + timeline=[]。
   - test_replay_service.py：
     - build_replay_dto 单元。

5. PROTOCOL_AUDIT.md 更新。

6. 验证：
   - pytest / ruff 通过。

【禁止做的事】
- 不要让 endpoint 在 prod 公开（本期仍在 /debug/v1 下）。
- 不要让 timeline 含未脱敏数据。
- 不要把 AI 私密 thoughts 暴露在 in_progress 房间。

【验收标准】
1. endpoint 就绪。
2. ReplayDTO schema 完整。
3. 4 测试通过。
4. PROTOCOL_AUDIT 更新。

完成后输出：
（1）修改 / 新增文件清单；
（2）curl 示例输出；
（3）pytest 摘要。
```

### 预期产物

- 前端：replayApi 重构 / ReplayPage 状态机 / replayStore / 4 子组件改造 / 测试。
- 后端：replay endpoint / replay_service / ReplayDTO schema / 测试。

### 验收标准（端到端联合）

1. 真实房间 replay 加载正确。
2. 不存在房间 ErrorPanel 显示 retry。
3. MOCK 模式 fixture 仍可用。
4. 自动重试 ≤3 次。
5. 后端 endpoint 在 dev 可访问。

### 禁止事项

- 禁止 fetch fallback fixture。
- 禁止真实模式触 fixture。
- 禁止 prod 暴露 endpoint。

---

## 任务 8：Mock 边界 ESLint 强制 + 审计文档收口

### 使用场景

前 7 任务把 mock 依赖逐步切断，但人会回退。本任务用 `no-restricted-imports` ESLint 规则强制：业务代码 `src/{features,pages,store,render,effects,api,components}/**` 不得 `import from '@/mock/**'`；只有 `src/protocol/transport.ts`（MockTransport 实现）、`src/**/__tests__/**`、`scripts/**` 可豁免。并输出 `docs/MOCK_BOUNDARY_AUDIT.md` 审计报告，列出当前真实状态。

### 当前 mock 状态

- 任务 1-7 完成后，业务代码 mock 导入应已 0。
- 但 ESLint 未强制，新代码可能回退。

### 契约对齐

不变更协议。仅 ESLint + 文档。

---

### 前端子提示词

```
你是一名资深前端工程效能 / 代码规范工程师。请用 ESLint 强制 mock 边界并输出审计文档。

【项目背景】
前 7 任务把 mock 切断。本任务用规则锁死边界。

【去 mock 联调期红线】（略）

【本任务允许做以下事情】

1. 修改 eslint.config.js：
   - 新增规则块，对 `src/features/**`、`src/pages/**`、`src/store/**`、`src/render/**`、`src/effects/**`、`src/api/**`、`src/components/**` 生效：
     ```js
     {
       files: ['src/features/**', 'src/pages/**', 'src/store/**', 'src/render/**', 'src/effects/**', 'src/api/**', 'src/components/**'],
       rules: {
         'no-restricted-imports': ['error', {
           patterns: [
             { group: ['@/mock/*', '@/mock/**'], message: 'Business code must not import from src/mock. Use src/types or src/store/*MetaStore. MockTransport is the only allowed consumer.' }
           ]
         }]
       }
     }
     ```
   - 对 `src/protocol/transport.ts`：明确允许（不出现在受限规则匹配中，或 inline disable）。
   - 对 `**/__tests__/**` / `scripts/**`：明确允许（不出现在 files 列表）。
   - 对 `src/protocol/adapter.ts`、`dispatcher.ts`、`types.ts`：同业务代码受限。

2. 修复任何新发现的违规：
   - 跑 `npm run lint` 列出违规清单。
   - 修复每条：可能是任务 1-7 漏改的 case。
   - 修复后再跑直到 0 违规。

3. 新建 docs/MOCK_BOUNDARY_AUDIT.md：
   - 段落 1：边界定义（允许 / 禁止区域）。
   - 段落 2：当前 `src/mock/**` 文件清单 + 每个文件被允许导入它的位置清单。
   - 段落 3：ESLint 规则原文 + 启用文件 glob。
   - 段落 4：CI 中如何强制（`npm run lint` 失败即阻断）。
   - 段落 5：未来如何新增 mock 文件（流程：先讨论 → MockTransport / 测试场景明确 → 实现 → 边界审计文档更新）。
   - 段落 6：例外清单（如 src/protocol/transport.ts 第 N 行 imports @/mock/aiResponder 是合规的，列出原因）。

4. 修改 package.json：
   - 新增 script: `"lint:strict": "eslint . --max-warnings 0"`
   - CI 用 lint:strict。

5. 修改 .github/workflows/*.yml（如存在）：
   - lint job 调 lint:strict。
   - 如无 CI 配置，跳过此条。

6. 修改 src/mock/index.ts（新建或修改）：
   - 在文件顶部加 banner 注释：
     ```
     /**
      * src/mock/** is internal to MockTransport (src/protocol/transport.ts)
      * and test fixtures (src/**/__tests__/, tests/, playwright/).
      *
      * Business code (features, pages, store, render, effects, api, components)
      * MUST NOT import from this directory. See docs/MOCK_BOUNDARY_AUDIT.md.
      */
     ```

7. 单元测试：
   - 不新增（lint 已是断言）。
   - 但写一段 README 段落说明"如何在 dev 期临时违规"（inline eslint-disable-next-line 不允许；必须修代码）。

8. 验证：
   - npm run lint:strict 0 错。
   - npm run test 全绿。
   - 故意 import @/mock/types 到一个 feature 文件 → lint 报错。

【禁止做的事】
- 不要用 inline eslint-disable 绕过违规（必须修代码）。
- 不要在 ESLint files 中过度排除（保持业务区域全覆盖）。
- 不要把规则降为 warning（必须 error）。
- 不要在 src/mock/** 内的 mock 文件被禁止互相 import（mock 内部互联是允许的）。
- 不要把 lint:strict 设置为 npm test 的副作用（保持独立 script）。

【验收标准】
1. eslint.config.js 含规则。
2. lint:strict script 存在。
3. MOCK_BOUNDARY_AUDIT.md 6 段齐全。
4. lint 0 错。
5. 故意违规可被检出。
6. src/mock/index.ts banner 注释存在。

完成后输出：
（1）修改 / 新增文件清单；
（2）lint 违规修复清单（任务 1-7 漏改的 case）；
（3）MOCK_BOUNDARY_AUDIT.md 第 6 段例外清单原文；
（4）验证摘要。
```

### 后端子提示词

```
你是一名资深后端工程效能 / 代码规范工程师。请用 ruff 配置 + 文档把"后端不依赖前端 mock"边界明文化。

【项目背景】
后端正常不会引用前端 mock，但 dev script / test fixture 可能写脏。本任务把约束写到 ruff config + 审计文档。

【去 mock 联调期红线】（略）

【本任务允许做以下事情】

1. 修改 pyproject.toml ruff config：
   - tool.ruff.lint.flake8-tidy-imports.banned-api 或 tool.ruff.lint.flake8-import-restrictions 强制：
     - app/ 下不得 import 任何包含 "mock" / "fixture" 字串路径的模块（除 app/tests/**）。
   - 如 ruff 不直接支持，则用 isort / 自定义 pre-commit hook。

2. 修改 docs/MOCK_BOUNDARY_AUDIT.md（与前端共享）：
   - 段落 7：后端边界说明 + ruff / pre-commit 配置。
   - 段落 8：MockLLMClient 是允许的，它是 LLM provider 抽象的具体实现，不属于 fixture 范畴。

3. 测试：
   - app/tests/test_no_mock_in_app.py：
     - grep app/ 下 .py 文件，断言除 app/tests/** 外无 `import.*mock` 行。

4. 验证：
   - ruff check 通过。
   - pytest 通过。

【禁止做的事】
- 不要把 MockLLMClient 标记为禁止。
- 不要把 app/tests 加入受限范围。
- 不要让规则降为 warning。

【验收标准】
1. ruff / pre-commit 配置。
2. 文档段 7-8。
3. test_no_mock_in_app 通过。
4. ruff / pytest 通过。

完成后输出：
（1）修改 / 新增文件清单；
（2）违规清单（若有）；
（3）pytest 摘要。
```

### 预期产物

- 前端：eslint.config.js 规则 / lint:strict script / MOCK_BOUNDARY_AUDIT.md / src/mock/index.ts banner。
- 后端：ruff config / docs 后端段 / test_no_mock_in_app。

### 验收标准（端到端联合）

1. `npm run lint:strict` 0 错。
2. `ruff check` 0 错。
3. 故意违规可被检出。
4. MOCK_BOUNDARY_AUDIT.md 8 段齐全。
5. CI（如配置）阻断违规 PR。

### 禁止事项

- 禁止 inline disable 绕过。
- 禁止 warning 降级。
- 禁止把 MockLLMClient 标禁。

---

## 附录 A：8 条任务一览

| # | 任务标题 | 前端关键产物 | 后端关键产物 | 依赖 |
|---|---------|------------|------------|------|
| 1 | 默认 USE_WS=true + DevModeBanner | .env 翻转 / DevModeBanner / ConnectionErrorPanel / RealtimeConnection 重写 | /healthz schema / /connection-info / dev-up 串行启动 | — |
| 2 | 类型解耦 mock/types → src/types/ | src/types/ 9 文件 / 40+ import 替换 / typeCompatibility | enums 一致性测试 / PROTOCOL_AUDIT 段 | 1 |
| 3 | 势力元数据后端下发 | factionMetaStore / factionsMetaApi / 30 处替换 / Placeholder | RoomFactionsMetaEvent / factions_meta_service / REST endpoint | 2 |
| 4 | gameStore 初始状态去 mock | gameStoreEmpty / applySnapshot / GamePage 等待 UI | RoomSettingsPayload / build_snapshot | 3 |
| 5 | AI 行为完全后端驱动 | useAIResponseScheduler 重构 / aiSpeakQueue / MockTransport 行为统一 | ai.* 事件场景完整性 | 4 |
| 6 | EpochSummary 旁白真实化 | epochSummaryStore / 5 组件改造 / dispatcher 路由 | epoch_narration_service / EpicNarrationEvent / SummaryNarrationEvent | 5 |
| 7 | Replay 真实化 | replayApi typed Result / ReplayPage 4 状态 / replayStore | replay endpoint / replay_service | 6 |
| 8 | mock 边界 ESLint 收口 | eslint 规则 / lint:strict / MOCK_BOUNDARY_AUDIT.md | ruff 配置 / test_no_mock_in_app | 7 |

## 附录 B：新增协议事件一览

| 事件 t | 方向 | 引入任务 | 说明 |
|--------|------|---------|------|
| room.factions_meta | S→C | 3 | 房间 start + reconnect 下发势力静态元数据 |
| room.snapshot (扩展) | S→C | 4 | 新增 settings(phase_durations / turns_per_epoch / max_epochs) |
| arbitrate.epic_narration | S→C | 6 | 纪元结束的故事化叙事 |
| arbitrate.summary_narration | S→C | 6 | 纪元结束的结构化简报 |

## 附录 C：新增前端 store / api 一览

| 名称 | 路径 | 引入任务 |
|------|------|---------|
| factionMetaStore | src/store/factionMetaStore.ts | 3 |
| factionsMetaApi | src/api/factionsMetaApi.ts | 3 |
| gameStoreEmpty | src/store/gameStoreEmpty.ts | 4 |
| epochSummaryStore | src/store/epochSummaryStore.ts | 6 |
| replayStore (可选) | src/store/replayStore.ts | 7 |
| DevModeBanner | src/components/DevModeBanner.tsx | 1 |
| ConnectionErrorPanel | src/components/ConnectionErrorPanel.tsx | 1 |
| FactionMetaPlaceholder | src/components/FactionMetaPlaceholder.tsx | 3 |

## 附录 D：新增后端模块一览

| 模块 | 路径 | 引入任务 |
|------|------|---------|
| FactionMeta domain | app/domain/faction_meta.py | 3 |
| 默认势力数据 | app/data/factions_default.py | 3 |
| 势力元数据 service | app/services/factions_meta_service.py | 3 |
| Room settings | app/core/config.py (RoomSettings 段) | 4 |
| Epoch narration service | app/services/epoch_narration_service.py | 6 |
| Narration 模板池 | app/data/narration_templates.py | 6 |
| Narration 事件 | app/protocol/narration_events.py | 6 |
| Replay service | app/services/replay_service.py | 7 |
| Replay REST | app/api/rest/replay.py | 7 |
| Connection info REST | app/api/rest/debug.py (新 endpoint) | 1 |

## 附录 E：执行顺序建议

强串行：**1 → 2 → 3 → 4 → 5 → 6 → 7 → 8**。

每条任务完成后：
1. 前后端各自单端验收（pytest / vitest / ruff / tsc / lint 全绿）。
2. dev-up 联调一次。
3. 用 `scripts/integration-smoke.{ts,py}` 跑端到端 smoke（覆盖该任务新增事件 / endpoint）。
4. 更新 docs/PROTOCOL_AUDIT.md / docs/MOCK_BOUNDARY_AUDIT.md。
5. 仅当上述四项全绿才进入下一任务。

## 附录 F：与既有文档关系

| 文档 | 关系 |
|------|------|
| INTEGRATION_TASK_PROMPTS.md | 已完成；本文档默认其交付物已就位（CORS / dev-up / WebSocketTransport / 协议握手）。 |
| SYNC_REFINEMENT_TASK_PROMPTS.md | 已完成；本文档假设 LLM provider + 自动 phase 推进 + 4v4 联调 + 持久化已可用。 |
| GLOBE_MAP_TASK_PROMPTS.md | 球体地图升级，与本文档可**部分并行**：任务 3 的 capital_hex_id 字段依赖 GLOBE_MAP 任务 2 的 world_geometry；任务 4 / 6 / 7 与 GLOBE_MAP 互不阻塞。建议先完成本文档任务 1-3 再开始 GLOBE_MAP，或两组团队并行（各自分支）。 |

---

> 文档结束。每条任务的前端 / 后端子提示词可单独复制给 AI 编程工具执行；端到端契约以本文档 §0 与各任务"契约对齐"段为准；与既有协议冲突时以 docs/PROTOCOL_AUDIT.md 最新版为准。
