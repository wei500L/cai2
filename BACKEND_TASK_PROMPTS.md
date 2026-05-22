# 《外交风云》后端任务型提示词库

> 项目：《外交风云》— 人机混战 AI Diplomacy
> 版本：v1.0
> 用途：将下列任意一条任务提示词整段复制粘贴给 Cursor / Claude Code / Windsurf / Augment / Copilot Agent 等 AI 编程工具即可独立执行，不依赖上下文，不依赖上一阶段。
> 每条提示词都已内置项目背景、技术栈、视觉与协议规范、允许范围、禁止事项、产物清单、验收标准。
> 适配对象：后端工程师 / 后端 AI 编程代理 / 与前端 mock 体验并行开发的后端服务实现者。

---

## 零、后端总体架构说明（必读）

在执行任何一条任务前，请先理解以下后端总体架构与开发策略。所有任务都基于这套架构。

### 0.1 后端分层架构

```
┌─────────────────────────────────────────────────────────────┐
│ API Layer                                                   │
│  ├── WebSocket Gateway      仅收发协议消息，不写业务逻辑     │
│  └── REST Debug Endpoints   开发期调试用，调用 Service       │
├─────────────────────────────────────────────────────────────┤
│ Protocol Layer                                              │
│  ├── Envelope (v/id/t/ts/seq/p)                             │
│  ├── Incoming / Outgoing Schemas (Pydantic)                 │
│  └── JSON ↔ MessagePack Adapter (占位)                      │
├─────────────────────────────────────────────────────────────┤
│ Service Layer                                               │
│  ├── RoomService             房间 / 玩家 / 势力选择          │
│  ├── ActionService           行动期消息记录                  │
│  ├── PhaseService            回合阶段状态机                  │
│  ├── SettlementService       结算阶段聚合 + 模型裁决 + 规则  │
│  ├── AIOutputService         AI 势力发言与反应生成            │
│  └── ReplayService           回放与赛后复盘 DTO              │
├─────────────────────────────────────────────────────────────┤
│ Domain Layer                                                │
│  ├── GameRoom / Player / Faction / FactionState              │
│  ├── EpochTurn / GamePhase / Relationship / Treaty           │
│  ├── GameAction / SpeechAction / TreatyAction / ...          │
│  ├── GameEvent / BattleEvent / SettlementResult              │
│  └── MapRegion / ResourceState / VisibilityScope             │
├─────────────────────────────────────────────────────────────┤
│ Repository Layer                                            │
│  ├── In-Memory Implementations (MVP 默认)                    │
│  └── PostgreSQL / Redis Placeholder (未来替换)              │
├─────────────────────────────────────────────────────────────┤
│ LLM Layer                                                   │
│  ├── LLMClient interface                                    │
│  ├── MockLLMClient (默认)                                   │
│  ├── OpenAICompatibleClient / ClaudeCompatibleClient (占位) │
│  ├── PromptBuilder (settlement 专用)                         │
│  └── ModelOutputParser + Validator                           │
├─────────────────────────────────────────────────────────────┤
│ Rule Resolver                                               │
│  └── 把模型建议转成后端权威结算 (relationships / map / stats)│
└─────────────────────────────────────────────────────────────┘
```

### 0.2 结算阶段模型调用流程（核心架构决策）

```
1. 玩家在行动期 (action) 提交消息或行动。
2. 后端只做基础校验并写入 action_log / message_log。
3. 后端立即返回轻量 ACK，不阻塞。
4. 后端根据 visibility 规则生成轻量广播事件给可见玩家。
5. 行动期结束，进入博弈期 / 结算期。
6. SettlementAggregator 汇总本回合行动、消息、密谈、条约、军令、当前状态。
7. PromptBuilder 构造结算 prompt。
8. LLMClient 在结算阶段（且仅在此时）调用模型。
9. ModelOutputParser 校验模型 JSON 输出（schema + 容错）。
10. RuleResolver 根据模型建议 + 后端规则生成最终权威结算。
11. 后端生成 resolve.events / resolve.map_diff / resolve.stats_diff。
12. 通过 WebSocket 推送给前端播放动画。
```

**严格规则：游戏过程中不实时调用 LLM。模型只在结算阶段调用。**

### 0.3 与前端的并行开发约定

- 前端先用 mock data 驱动完整体验（FRONTEND_TASK_PROMPTS.md 中任务 1~18）。
- 后端独立开发，不依赖前端文件存在与否。
- 协议消息类型与前端 `src/protocol/types.ts` 保持兼容（FactionId 命名、GamePhase 命名、GameEvent 字段、Envelope 信封）。
- 最后通过 WebSocket transport 替换前端 MockTransport，实现联调。

### 0.4 八大势力 ID 命名（前后端统一）

```
ironCrown   铁冠帝国
starlight   星辉联邦
emerald     翡翠王庭
ashen       灰烬部族
voidChurch  虚空教廷
aurora      极光共和
magma       熔岩议会
darkTide    暗潮商会
```

### 0.5 GamePhase 命名（前后端统一）

```
observe    态势感知期 (15s)
action     行动期 (90s)
resolve    博弈期 + 结算期合并阶段 (30s)
arbitrate  裁决阶段，三个子阶段：battle (20s) → epic (60s) → summary (15s)
```

### 0.6 默认技术栈

- Python 3.11+
- FastAPI (含 fastapi-websocket)
- Pydantic v2 (严格模式 + ConfigDict)
- asyncio
- pytest + pytest-asyncio
- ruff (lint + format)
- mypy (可选，严格模式)
- LLM SDK 仅通过抽象接口封装（不直接绑定 openai / anthropic 包）
- 持久化：MVP 用 in-memory，未来切换 PostgreSQL + Redis
- 序列化：MVP 用 JSON，预留 msgpack adapter

### 0.7 所有任务共用的强制规则

每条任务提示词内部都已写入以下 15 条共用规则，AI 编程工具必须严格遵守：

1. 这是《外交风云》AI Diplomacy 后端。
2. 前端会并行开发，最终通过协议接入。
3. 当前任务只做后端，不写前端。
4. 不启动开发服务器（uvicorn / docker / 数据库服务一律不启动）。
5. 不调用真实 LLM。
6. 不连接真实数据库。
7. 不启动 Docker。
8. 游戏过程中（行动期）只记录玩家消息和行动。
9. 只有结算阶段（resolve / arbitrate）才允许通过抽象 LLM client 调用模型。
10. MVP 阶段不要重点实现 prompt injection 防护。
11. 所有模块要可测试。
12. 业务逻辑不要写在 API 路由或 WebSocket handler 里。
13. mock / in-memory 实现必须可以未来替换。
14. 代码结构必须清晰，避免单文件巨石。
15. 输出时先说明计划，再列出修改文件，最后说明验证方式。

---

## 任务 1：初始化后端工程骨架

### 使用场景

项目从零开始，需要建立一份干净的 Python + FastAPI + Pydantic 后端工程骨架，预留好后续 21 项后端任务全部需要使用的目录与分层。后续所有任务都依赖这套骨架，因此本任务必须做到结构清晰、命名规范、可扩展、可测试，并且严格不启动开发服务器。

### 可直接复制给 AI 编程工具的完整提示词

```
你是一名资深 Python 后端架构师。请为《外交风云》—— 人机混战 AI Diplomacy 项目初始化一份 Python 3.11+ FastAPI + Pydantic v2 + asyncio + pytest 的后端工程骨架。

【项目背景】
《外交风云》是一款以自然语言为唯一核心操作方式的实时战略外交模拟器。前端已并行开发，使用 React + TS + Vite + Tailwind + Zustand，通过 mock 数据驱动完整体验，未来通过 WebSocket 协议层接入后端。本任务只搭后端骨架，不写任何前端，不连接前端。

【共用规则（强制遵守）】
1. 这是《外交风云》AI Diplomacy 后端。
2. 前端会并行开发，最终通过协议接入。
3. 当前任务只做后端，不写前端。
4. 不启动开发服务器（不要执行 uvicorn / docker / 数据库服务）。
5. 不调用真实 LLM。
6. 不连接真实数据库。
7. 不启动 Docker。
8. 游戏过程中只记录玩家消息和行动。
9. 只有结算阶段才允许通过抽象 LLM client 调用模型。
10. MVP 阶段不要重点实现 prompt injection 防护。
11. 所有模块要可测试。
12. 业务逻辑不要写在 API 路由或 WebSocket handler 里。
13. mock / in-memory 实现必须可以未来替换。
14. 代码结构必须清晰，避免单文件巨石。
15. 输出时先说明计划，再列出修改文件，最后说明验证方式。

【技术栈（强制）】
- Python 3.11+
- FastAPI（含 fastapi 自带 WebSocket 支持，不引入额外 ws 库）
- Pydantic v2（model_config = ConfigDict(strict=True)）
- asyncio
- pytest + pytest-asyncio
- ruff（lint + format）
- 包管理使用 uv 或 pip + pyproject.toml，二选一即可，推荐 pyproject.toml + pip
- 不引入 SQLAlchemy / Alembic / Redis 客户端 / openai / anthropic 等任何运行依赖；保留占位类型签名即可

【八大势力 ID（与前端统一）】
ironCrown / starlight / emerald / ashen / voidChurch / aurora / magma / darkTide

【GamePhase 命名（与前端统一）】
observe / action / resolve / arbitrate（arbitrate 包含子阶段 battle / epic / summary）

【本任务允许做以下事情】

1. 创建 `pyproject.toml`：
   - name: diplomacy-backend
   - dependencies: fastapi, pydantic>=2, uvicorn[standard]（仅作为开发期可选，不启动），python-multipart
   - dev-dependencies: pytest, pytest-asyncio, ruff, httpx（用于 TestClient）
   - 配置 ruff: line-length=100, target-version="py311", select 常规规则
   - 配置 pytest: testpaths=["app/tests"]

2. 创建以下目录结构（必须严格一致，空目录请放置 `__init__.py`）：

```
app/
  __init__.py
  main.py                        # FastAPI 应用入口（仅装配，不启动）
  api/
    __init__.py
    rest/
      __init__.py
      health.py                  # 健康检查路由占位
      debug.py                   # 调试接口占位（任务 18 填充）
    websocket/
      __init__.py
      gateway.py                 # WebSocket gateway 占位（任务 17 填充）
  core/
    __init__.py
    config.py                    # 配置加载（pydantic-settings 风格手写）
    logging.py                   # 结构化日志占位
    errors.py                    # 后端统一错误类型
    ids.py                       # UUID/seq 生成工具
    clock.py                     # 可测试的时间源
  domain/
    __init__.py
    factions.py                  # 八势力常量与枚举（任务 2 填充完整）
    enums.py                     # GamePhase / ArbitratePhase / RelationshipStatus 等
    models.py                    # Pydantic 领域模型（任务 2 填充）
  protocol/
    __init__.py
    envelope.py                  # 信封定义（任务 3 填充）
    incoming.py                  # 客户端→服务端消息（任务 3 填充）
    outgoing.py                  # 服务端→客户端消息（任务 3 填充）
    serialization.py             # JSON / msgpack 适配占位
  repositories/
    __init__.py
    base.py                      # 仓储接口（任务 4 填充）
    memory.py                    # 内存实现（任务 4 填充）
  services/
    __init__.py
    room_service.py              # 任务 5 填充
    action_service.py            # 任务 7 填充
    phase_service.py             # 任务 9 填充
    settlement_service.py        # 任务 15 填充
    ai_output_service.py         # 任务 16 填充
    replay_service.py            # 任务 19 填充
  game/
    __init__.py
    initializer.py               # 初始游戏状态生成（任务 6 填充）
    visibility.py                # 可见性与广播事件（任务 8 填充）
    rule_resolver.py             # 规则裁决（任务 14 填充）
    settlement_aggregator.py     # 结算输入聚合（任务 10 填充）
  llm/
    __init__.py
    client.py                    # LLMClient 抽象（任务 12 填充）
    prompt_builder.py            # settlement prompt builder（任务 11 填充）
    output_schema.py             # 模型输出 schema（任务 13 填充）
    output_parser.py             # 模型输出解析（任务 13 填充）
  tests/
    __init__.py
    conftest.py                  # 共享 fixtures（任务 21 填充）
    test_health.py               # 健康检查测试
.env.example
README.md
ruff.toml                        # 可选；也可以放在 pyproject.toml 内
```

3. `app/main.py`：
   - 创建 `app = FastAPI(title="Diplomacy Backend", version="0.1.0")`。
   - include `api/rest/health.py` 的 router。
   - 不在 `__main__` 启动 uvicorn；保留 `if __name__ == "__main__": pass` 占位。

4. `app/api/rest/health.py`：
   - 暴露 `GET /healthz` 返回 `{"status": "ok", "service": "diplomacy-backend"}`。
   - 暴露 `GET /readyz` 返回 `{"ready": True}`。

5. `app/core/config.py`：
   - 定义 `Settings(BaseModel)`：含 `env: Literal["dev","test","prod"] = "dev"`, `log_level: str = "INFO"`, `llm_provider: Literal["mock","openai","claude"] = "mock"`, `enable_persistence: bool = False`。
   - 提供 `get_settings()` 单例，从环境变量读取（手写 os.getenv 即可，不引入 pydantic-settings）。

6. `app/core/clock.py`：
   - 提供 `Clock` 协议（now_ms() -> int）。
   - 提供 `SystemClock` 默认实现。
   - 提供 `FrozenClock` 测试实现（可手动 advance）。

7. `app/core/ids.py`：
   - `new_message_id() -> str`（msg_xxx UUID4 短串）。
   - `new_room_id() -> str`（room_xxx）。
   - `new_player_id() -> str`（p_xxx）。
   - `SequenceGen` 类按 room 维度递增 seq。

8. `app/core/errors.py`：
   - `DiplomacyError(Exception)` 基类。
   - `RoomNotFoundError`, `PlayerNotFoundError`, `InvalidPhaseError`, `InvalidActionError`, `RateLimitedError`, `FactionAlreadyTakenError` 等占位子类。

9. `.env.example`：
   ```
   ENV=dev
   LOG_LEVEL=INFO
   LLM_PROVIDER=mock
   ENABLE_PERSISTENCE=false
   ```

10. `README.md` 顶部添加：
    - 项目简介一段。
    - "本后端 MVP 不启动开发服务器；通过 pytest 运行测试验证"。
    - "前端独立开发，通过 WebSocket 协议接入"。
    - 目录结构说明。

11. `app/tests/test_health.py`：
    - 使用 `TestClient(app)` 验证 `/healthz` 返回 200 与 ok 字段。

【禁止做的事】
- 不要实现游戏房间、玩家管理、回合循环、结算等任何业务逻辑（这些是后续任务）。
- 不要连接真实数据库、Redis、Docker。
- 不要调用真实 LLM。
- 不要启动 uvicorn / fastapi dev / docker compose。
- 不要写前端代码 / 修改前端文件。
- 不要安装 SQLAlchemy / Alembic / redis / openai / anthropic 等运行依赖。
- 不要在本任务中实现协议消息（任务 3 负责）。
- 不要省略目录与 __init__.py，必须建立完整骨架。

【验收标准】
1. `python -c "from app.main import app; print(app.title)"` 能成功打印 `Diplomacy Backend`，不报错。
2. `pytest -q` 通过 `test_health.py`，不启动 uvicorn。
3. `ruff check app` 无错误。
4. 完整目录结构存在且每个目录含 `__init__.py`。
5. `app/main.py` 不在 import 时启动任何后台任务、不连接数据库、不调用 LLM。
6. `.env.example` 存在且字段齐全。
7. `app/core/config.py::get_settings()` 可正常返回 Settings 实例。
8. `app/core/clock.py` 同时提供 SystemClock 与 FrozenClock 两种实现。
9. `app/core/errors.py` 包含统一异常基类与至少 5 个占位子类。
10. README 顶部包含"不启动服务器、前后端隔离、protocol 接入"说明。

请按以上规范完成本任务。完成后输出：
（1）实施计划（步骤列表）；
（2）创建/修改的文件清单；
（3）`pytest -q` 与 `ruff check app` 的预期验证命令；
（4）不要执行 uvicorn / docker / fastapi dev。
```

### 预期产物

- `pyproject.toml` 与 `ruff.toml`（或合并到 pyproject）。
- 完整目录树 `app/{main,api,core,domain,protocol,repositories,services,game,llm,tests}` 与全部 `__init__.py`。
- `app/main.py`、`app/api/rest/health.py`、`app/core/{config,clock,ids,errors,logging}.py`。
- `.env.example`、`README.md`。
- `app/tests/test_health.py` 单测。

### 验收标准

1. `python -c "from app.main import app"` 不报错。
2. `pytest -q` 通过 health 测试。
3. `ruff check app` 通过。
4. 完整目录与 `__init__.py` 存在。
5. 不启动 uvicorn / docker。
6. `.env.example` 字段齐全。
7. `get_settings()` 可用。
8. Clock 双实现可用。
9. errors 模块提供基类与子类。
10. README 顶部含前后端隔离说明。

### 禁止事项

- 禁止实现任何游戏业务逻辑。
- 禁止启动开发服务器 / Docker / 数据库。
- 禁止调用真实 LLM。
- 禁止写前端 / 修改前端文件。
- 禁止安装运行期 SQLAlchemy / Redis / openai / anthropic。
- 禁止在本任务中实现协议消息（任务 3 负责）。
- 禁止省略目录或 `__init__.py`。

---

## 任务 2：建立领域模型 domain models

### 使用场景

工程骨架就绪后，需要先建立后端权威的领域模型（domain models）。所有 service / protocol / repository / llm / rule resolver 都将引用这些模型。本任务不写业务逻辑，只产出严格类型的 Pydantic v2 数据结构与枚举。

### 可直接复制给 AI 编程工具的完整提示词

```
你是一名资深领域驱动设计工程师。请为《外交风云》—— 人机混战 AI Diplomacy 后端建立一套严格类型的领域模型（domain models），覆盖游戏房间、玩家、势力、势力状态、回合阶段、关系、条约、行动、消息、事件、战斗、地图区域、可见性范围与结算结果。

【项目背景】
这是后端权威模型，前端会通过协议消息接收 DTO，但后端内部以这些模型为唯一真实数据来源。前端 mock/types.ts 已经定义了对应类型（FactionId / GamePhase / GameEvent / MapRegion / Relationship / TreatyKind 等），本任务保持命名兼容，使前端协议层未来可以零成本对齐。

【共用规则（强制遵守）】
1. 这是《外交风云》AI Diplomacy 后端。
2. 前端会并行开发，最终通过协议接入。
3. 当前任务只做后端，不写前端。
4. 不启动开发服务器。
5. 不调用真实 LLM。
6. 不连接真实数据库。
7. 不启动 Docker。
8. 游戏过程中只记录玩家消息和行动。
9. 只有结算阶段才允许通过抽象 LLM client 调用模型。
10. MVP 阶段不要重点实现 prompt injection 防护。
11. 所有模块要可测试。
12. 业务逻辑不要写在 API 路由或 WebSocket handler 里。
13. mock / in-memory 实现必须可以未来替换。
14. 代码结构必须清晰，避免单文件巨石。
15. 输出时先说明计划，再列出修改文件，最后说明验证方式。

【技术栈】
Python 3.11+ + Pydantic v2（严格模式，使用 `model_config = ConfigDict(strict=True, frozen=False, validate_assignment=True)`）。

【八大势力 ID（强制，与前端命名一致）】
ironCrown / starlight / emerald / ashen / voidChurch / aurora / magma / darkTide

【GamePhase（强制）】
observe / action / resolve / arbitrate

【ArbitratePhase（强制）】
battle / epic / summary

【RelationshipStatus（强制）】
hostile / wary / neutral / friendly / allied

【TreatyKind（强制）】
non_aggression / trade / alliance / ceasefire

【EventPriority（强制）】
P0 / P1 / P2

【EventKind（强制）】
speech / private / declare_war / alliance / trade / betrayal / battle / economy / intel / phase_change / ai_thinking / ai_reaction / narration

【VisibilityScope（强制）】
public / faction_pair / faction_set / self

【本任务允许做以下事情】

1. 在 `app/domain/enums.py` 中定义全部枚举：
   - `FactionId(StrEnum)` 含八个值。
   - `GamePhase(StrEnum)` 四个值。
   - `ArbitratePhase(StrEnum)` 三个值。
   - `RelationshipStatus(StrEnum)`。
   - `TreatyKind(StrEnum)`。
   - `EventPriority(StrEnum)`。
   - `EventKind(StrEnum)`。
   - `VisibilityScope(StrEnum)`。
   - `TerrainKind(StrEnum)`：mountain / plains / river / fortress / desert。
   - `FactionStatusKind(StrEnum)`：thriving / stable / declining / critical / eliminated。
   - `PlayerKind(StrEnum)`：human / ai。
   - `RoomStatus(StrEnum)`：lobby / starting / running / finished / aborted。

2. 在 `app/domain/factions.py` 中定义：
   - `FactionMeta(BaseModel)`：id / name / primary_color / glow_color / shadow_color / civilization / archetype / advantage / speech_style / trigger_words: list[str] / personality: dict[str, float]（aggression、trust_base、memory_depth、deception、alliance_tendency、emotional_volatility、honor_code）。
   - 常量 `FACTION_META: dict[FactionId, FactionMeta]` 完整填充八势力（数据按设计文档"势力色彩规范"与"AI性格参数矩阵"对齐）。
   - 工具函数：`get_faction_meta(fid)`、`all_faction_ids()`。

3. 在 `app/domain/models.py` 中定义全部领域模型（全部 Pydantic v2 BaseModel，含 `model_config = ConfigDict(strict=True)`）：

   - `Player`：id / display_name / kind: PlayerKind / faction_id: FactionId | None / connected: bool / joined_at_ms: int。
   - `FactionState`：id: FactionId / military: float / economy: float / diplomacy: float / culture: float / morale: float / total_power: float / status: FactionStatusKind / eliminated_at_turn: int | None。
   - `Relationship`：from_faction: FactionId / to_faction: FactionId / value: float（-100~100）/ status: RelationshipStatus / treaties: list[TreatyKind] / last_changed_turn: int。
   - `Treaty`：id / kind: TreatyKind / parties: list[FactionId] / started_epoch: int / started_turn: int / ends_epoch: int | None / ends_turn: int | None / active: bool / metadata: dict[str, Any]。
   - `MapRegion`：id / owner: FactionId | None / resource_value: float / development_level: float / terrain: TerrainKind / center_lat_lng: tuple[float, float] / min_garrison: int / supply_lines: int。
   - `ResourceState`：faction_id / gdp / region_income / trade_income / maintenance_cost / war_cost / net_income。
   - `EpochTurn`：epoch: int / turn: int / phase: GamePhase / arbitrate_phase: ArbitratePhase | None / phase_started_at_ms: int / phase_duration_ms: int。
   - `MessageVisibility`：scope: VisibilityScope / faction_ids: list[FactionId]（按 scope 解析参与方）。
   - `GameActionBase`（抽象 BaseModel）：id / room_id / epoch / turn / phase: GamePhase / actor_player_id / actor_faction: FactionId / created_at_ms: int / visibility: MessageVisibility。
   - `SpeechAction(GameActionBase)`：mode: Literal["speech"] / content: str（≤400 字符）/ targets: list[FactionId]。
   - `PrivateMessageAction(GameActionBase)`：mode: Literal["private"] / content: str / target_faction: FactionId。
   - `TreatyAction(GameActionBase)`：mode: Literal["treaty"] / treaty_kind: TreatyKind / target_factions: list[FactionId]（1~3）/ proposal_text: str。
   - `MilitaryAction(GameActionBase)`：mode: Literal["military"] / source_region: str / target_region: str / movement: Literal["move","attack","defend"] / orders_text: str / troops: int | None。
   - `IntelAction(GameActionBase)`：mode: Literal["intel"] / target_faction: FactionId / intel_kind: Literal["spy","interrogate","intercept"] / brief: str。
   - `LockAction(GameActionBase)`：mode: Literal["lock"]。
   - `GameAction = Annotated[Union[...], Field(discriminator="mode")]`：discriminated union 包含上述六种。
   - `GameEvent`：id / room_id / epoch / turn / phase: GamePhase / created_at_ms / priority: EventPriority / kind: EventKind / actor_faction: FactionId | None / target_faction: FactionId | None / payload: dict[str, Any] / narration: str / visibility: MessageVisibility。
   - `BattleEvent(GameEvent)`：扩展字段 attacker / defender / region_id / atk_loss / def_loss / territory_captured: bool / morale_shift: float。
   - `SettlementResult`：room_id / epoch / turn / generated_at_ms / relationship_deltas: list[RelationshipDelta] / treaty_decisions / battle_results / region_changes / faction_stat_changes / narration_events / ai_speeches。
   - `RelationshipDelta`：from_faction / to_faction / delta: float / reason: str。
   - `TreatyDecision`：treaty_id / accepted: bool / reason: str / counter_proposal: str | None。
   - `RegionChange`：region_id / prev_owner / new_owner / transition: Literal["conquest","cede","negotiated","abandoned"]。
   - `FactionStatChange`：faction_id / military_delta / economy_delta / diplomacy_delta / culture_delta / morale_delta。
   - `AISpeechItem`：faction_id / kind: Literal["public","private","reaction","narration"] / content: str / target_faction: FactionId | None。
   - `GameRoom`：id / status: RoomStatus / created_at_ms / mode: Literal["solo_1v7","multi_4v4"] / max_players: int / players: list[Player] / ai_factions: list[FactionId] / current: EpochTurn / seed: int。

4. 在 `app/domain/__init__.py` 中聚合 re-export 所有主要类型，便于 service 层 import。

5. 在 `app/tests/test_domain_models.py` 中编写测试：
   - 验证八势力枚举完整。
   - 验证 GameAction discriminated union 在 mode 字段下正确路由。
   - 验证 SpeechAction.content > 400 字符触发 ValidationError。
   - 验证 Relationship.value 超出 [-100, 100] 触发 ValidationError。
   - 验证 FactionState.morale 在 [0.3, 1.8] 范围内（用 Pydantic Field constraints）。
   - 验证 MapRegion.development_level 在 [0, 1.5] 范围内。
   - 验证 GameEvent.payload 接受任意 dict。
   - 验证 SettlementResult 可由空字段构造（None / 空列表）。

【禁止做的事】
- 不要把模型直接做成数据库 ORM（不引入 SQLAlchemy）。
- 不要调用 LLM。
- 不要写 WebSocket 路由。
- 不要实现完整规则结算（任务 14 负责）。
- 不要把势力色彩硬编码到模型外部，必须集中在 FACTION_META。
- 不要使用 Pydantic v1 风格 BaseModel.Config（必须 model_config = ConfigDict(...)）。
- 不要省略 discriminator union。
- 不要写前端代码。
- 不要省略 enums.py 与 factions.py。

【验收标准】
1. `python -c "from app.domain import FactionId; print(list(FactionId))"` 输出八个值且与前端命名一致。
2. `FACTION_META` 含八个完整条目，每个含 personality 七个字段。
3. `GameAction` discriminated union 在 `mode=speech` 时解析为 SpeechAction，`mode=private` 为 PrivateMessageAction，依此类推。
4. `SpeechAction(content="x"*401)` 抛出 ValidationError。
5. `Relationship(value=200)` 抛出 ValidationError。
6. `FactionState.morale` 超出 [0.3, 1.8] 抛出 ValidationError。
7. `MapRegion.development_level` 超出 [0, 1.5] 抛出 ValidationError。
8. `pytest -q app/tests/test_domain_models.py` 全部通过。
9. `ruff check app/domain` 通过。
10. 模型不依赖任何 ORM / Redis / WebSocket / LLM 模块。

请按以上规范完成本任务。完成后输出：
（1）实施计划；
（2）创建/修改文件清单；
（3）测试命令 `pytest -q app/tests/test_domain_models.py`；
（4）不要启动 uvicorn / docker。
```

### 预期产物

- `app/domain/enums.py`（12 个枚举）。
- `app/domain/factions.py`（FactionMeta + FACTION_META + 工具函数）。
- `app/domain/models.py`（领域 BaseModel 全集 + discriminated union）。
- `app/domain/__init__.py`（聚合 re-export）。
- `app/tests/test_domain_models.py`（单元测试）。

### 验收标准

1. 八势力 ID 与前端命名一致。
2. FACTION_META 含完整 personality。
3. GameAction discriminator 工作正常。
4. 字段约束（content ≤ 400 / value [-100,100] / morale [0.3,1.8] / development_level [0,1.5]）有效。
5. 单元测试全部通过。
6. ruff 通过。
7. 不依赖 ORM / Redis / WebSocket / LLM。
8. SettlementResult 可被空字段构造。
9. 所有模型 Pydantic v2 风格。
10. 模型可被未来 service / protocol 复用，不需重写。

### 禁止事项

- 禁止把模型直接当作数据库 ORM。
- 禁止调用 LLM。
- 禁止写 WebSocket 路由。
- 禁止实现完整规则结算。
- 禁止硬编码势力色彩到模型之外。
- 禁止使用 Pydantic v1 风格。
- 禁止省略 discriminator union。
- 禁止写前端代码。

---

## 任务 3：建立前后端协议类型 protocol schemas

### 使用场景

领域模型就绪后，需要建立前后端通信的协议层。本任务定义信封、所有 incoming / outgoing 消息类型与 payload schemas，与前端 `src/protocol/types.ts` 命名兼容。本任务不启动 WebSocket，只产出 Pydantic 类型与序列化适配占位。

### 可直接复制给 AI 编程工具的完整提示词

```
你是一名资深通信协议设计工程师。请为《外交风云》—— 人机混战 AI Diplomacy 后端建立完整的前后端协议层（Pydantic v2 schemas），覆盖连接生命周期、房间管理、游戏核心循环、AI 相关、断线重连与错误消息。

【项目背景】
前端已在 `src/protocol/types.ts` 中定义 Envelope `{ v, id, t, ts, seq, p }` 与全部消息类型。后端协议层必须与前端保持兼容（命名、字段、可序列化为 JSON）。本任务只定义类型与序列化适配占位，不启动 WebSocket，不实现路由。

【共用规则（强制遵守）】
1. 这是《外交风云》AI Diplomacy 后端。
2. 前端会并行开发，最终通过协议接入。
3. 当前任务只做后端，不写前端。
4. 不启动开发服务器。
5. 不调用真实 LLM。
6. 不连接真实数据库。
7. 不启动 Docker。
8. 游戏过程中只记录玩家消息和行动。
9. 只有结算阶段才允许通过抽象 LLM client 调用模型。
10. MVP 阶段不要重点实现 prompt injection 防护。
11. 所有模块要可测试。
12. 业务逻辑不要写在 API 路由或 WebSocket handler 里。
13. mock / in-memory 实现必须可以未来替换。
14. 代码结构必须清晰，避免单文件巨石。
15. 输出时先说明计划，再列出修改文件，最后说明验证方式。

【技术栈】
Python 3.11+ + Pydantic v2 严格模式。本任务允许 import `app.domain.*`，禁止 import service / repository / llm 层。

【信封格式（与前端严格一致）】
```
{
  "v": 1,
  "id": "msg_xxx",
  "t": "action.speak",
  "ts": 1716192000000,
  "seq": 142,
  "p": { ... }
}
```

【消息类型完整目录（必须全部实现，命名严格一致）】

入站（C→S）：
- conn.auth
- conn.ping
- room.create
- room.join
- room.leave
- room.select_faction
- room.ready
- action.speak
- action.private
- action.treaty
- action.military
- action.intel
- action.lock
- reconnect.request

出站（S→C）：
- conn.auth.ok
- conn.auth.fail
- conn.pong
- conn.kick
- room.created
- room.joined
- room.player_join
- room.player_leave
- room.start
- phase.change
- turn.begin
- action.broadcast
- action.private (broadcast 给相关方)
- action.rejected
- resolve.events
- resolve.map_diff
- resolve.stats_diff
- ai.thinking
- ai.speak
- ai.reaction
- reconnect.catchup
- reconnect.snapshot
- error.message

【本任务允许做以下事情】

1. 在 `app/protocol/envelope.py` 定义：
   - `Envelope[T: BaseModel](BaseModel)`：v: int = 1 / id: str / t: str / ts: int / seq: int | None = None / p: T。
   - `make_envelope(t, payload, *, clock, seq=None, msg_id=None)` 工具函数。
   - `parse_envelope(raw: dict, payload_model: Type[BaseModel]) -> Envelope`：负责按 `t` 字段路由解析（路由表见下）。

2. 在 `app/protocol/incoming.py` 定义所有入站 payload：
   - `ConnAuthPayload`：token: str / client_version: str。
   - `ConnPingPayload`：client_ts: int。
   - `RoomCreatePayload`：mode: Literal["solo_1v7","multi_4v4"] / display_name: str / seed: int | None。
   - `RoomJoinPayload`：room_id: str / display_name: str。
   - `RoomLeavePayload`：room_id: str。
   - `RoomSelectFactionPayload`：room_id / faction_id: FactionId。
   - `RoomReadyPayload`：room_id / ready: bool。
   - `ActionSpeakPayload`：room_id / mode: Literal["speech"] / content: str / targets: list[FactionId] / metadata: dict[str, Any] | None。
   - `ActionPrivatePayload`：room_id / target_faction / content / metadata。
   - `ActionTreatyPayload`：room_id / treaty_kind: TreatyKind / target_factions: list[FactionId] / proposal_text: str。
   - `ActionMilitaryPayload`：room_id / source_region / target_region / movement / orders_text / troops。
   - `ActionIntelPayload`：room_id / target_faction / intel_kind / brief。
   - `ActionLockPayload`：room_id。
   - `ReconnectRequestPayload`：room_id / player_id / last_seq: int / session_token: str。

   - 提供 `IncomingMessage = Annotated[Union[...], Field(discriminator="t")]` 形式的解析器（实际上 Envelope 内的 t 字段决定 payload 类型，本任务用 `parse_envelope` 路由表实现，不依赖 union discriminator）。

3. 在 `app/protocol/outgoing.py` 定义所有出站 payload：
   - `ConnAuthOkPayload`：player_id / display_name / server_time_ms。
   - `ConnAuthFailPayload`：reason: str。
   - `ConnPongPayload`：server_ts: int。
   - `ConnKickPayload`：reason: str。
   - `RoomCreatedPayload`：room_id / mode。
   - `RoomJoinedPayload`：room_id / room_snapshot: dict[str, Any]（房间快照 DTO）。
   - `RoomPlayerJoinPayload`：room_id / player_id / display_name / faction_id: FactionId | None。
   - `RoomPlayerLeavePayload`：room_id / player_id。
   - `RoomStartPayload`：room_id / initial_state: dict[str, Any]。
   - `PhaseChangePayload`：room_id / epoch / turn / phase: GamePhase / arbitrate_phase: ArbitratePhase | None / phase_duration_ms: int / phase_started_at_ms: int。
   - `TurnBeginPayload`：room_id / epoch / turn / visible_snapshot: dict[str, Any]。
   - `ActionBroadcastPayload`：room_id / event: dict[str, Any]（含 GameEvent DTO）。
   - `ActionRejectedPayload`：room_id / request_id / reason: str / error_code: str。
   - `ResolveEventsPayload`：room_id / epoch / turn / events: list[dict[str, Any]]。
   - `ResolveMapDiffPayload`：room_id / epoch / turn / changes: list[dict[str, Any]] / border_updates: list[dict[str, Any]]。
   - `ResolveStatsDiffPayload`：room_id / epoch / turn / faction_stats: list[dict[str, Any]] / relationship_changes: list[dict[str, Any]]。
   - `AIThinkingPayload`：room_id / faction_id / progress: float（0~1）。
   - `AISpeakPayload`：room_id / event: dict[str, Any]。
   - `AIReactionPayload`：room_id / faction_id / reaction: str / target_faction: FactionId | None。
   - `ReconnectCatchupPayload`：room_id / from_seq / messages: list[dict[str, Any]]。
   - `ReconnectSnapshotPayload`：room_id / full_state: dict[str, Any] / seq: int。
   - `ErrorMessagePayload`：reason: str / error_code: str / request_id: str | None。

4. 在 `app/protocol/serialization.py`：
   - 提供 `serialize_json(envelope: Envelope) -> bytes`：使用 `envelope.model_dump_json().encode()`。
   - 提供 `deserialize_json(raw: bytes, payload_model: Type[BaseModel]) -> Envelope`。
   - 占位 `serialize_msgpack(envelope) -> bytes`（仅 stub：raise NotImplementedError("msgpack adapter pending")）。
   - 占位 `deserialize_msgpack(raw, payload_model) -> Envelope`（同上 stub）。

5. 在 `app/protocol/routing.py`：
   - 定义入站路由表 `INCOMING_PAYLOAD_TYPES: dict[str, Type[BaseModel]]`，把字符串类型名（如 `"action.speak"`）映射到 payload model（如 `ActionSpeakPayload`）。
   - 定义出站路由表 `OUTGOING_PAYLOAD_TYPES: dict[str, Type[BaseModel]]` 同理。
   - 提供 `parse_incoming(raw: dict) -> Envelope`：读取 raw["t"]，查表，构造 Envelope[payload_model]。

6. 在 `app/protocol/__init__.py` 聚合 re-export 信封、payload 类型与序列化函数。

7. 在 `app/tests/test_protocol.py` 编写测试：
   - 构造 `Envelope` 并 `serialize_json` → `deserialize_json` 往返一致。
   - 入站 `parse_incoming({"v":1,"id":"msg_x","t":"action.speak","ts":1,"p":{...}})` 返回 `Envelope[ActionSpeakPayload]`。
   - 入站缺失必填字段触发 ValidationError。
   - 入站未知 `t` 触发 KeyError 或 ProtocolError（定义在 errors.py）。
   - 出站 `make_envelope("phase.change", PhaseChangePayload(...))` 字段齐全。
   - `serialize_msgpack` 抛 NotImplementedError。

【禁止做的事】
- 不要启动 WebSocket 服务（任务 17 负责）。
- 不要接真实前端。
- 不要写复杂鉴权 / JWT 解析（只接受 token 字段占位）。
- 不要把协议消息散落在业务代码里，必须集中在 protocol 目录。
- 不要引入运行期 msgpack 依赖，仅保留 stub。
- 不要把 payload 直接写成 domain models（应是 DTO，但允许内部字段类型来自 domain enums / FactionId 等）。
- 不要在 protocol 中写业务逻辑（如校验势力是否已被选择）。

【验收标准】
1. `Envelope` 与全部 payload 类型可通过 Pydantic v2 严格校验。
2. `parse_incoming` 在 14 种入站类型上路由正确。
3. `make_envelope` 自动填充 v=1 / ts / id / seq（id/seq 可由调用方传入或自动生成）。
4. `serialize_json` / `deserialize_json` 往返字节级稳定。
5. `serialize_msgpack` / `deserialize_msgpack` 仅占位抛 NotImplementedError。
6. 全部出站消息类型均有 payload model 定义。
7. `pytest -q app/tests/test_protocol.py` 通过。
8. `ruff check app/protocol` 通过。
9. protocol 模块不依赖 service / repository / llm。
10. 命名严格与前端 `src/protocol/types.ts` 兼容（FactionId / GamePhase / TreatyKind / EventKind / ArbitratePhase）。

请按以上规范完成本任务。完成后输出：
（1）实施计划；
（2）创建/修改文件清单；
（3）`pytest -q app/tests/test_protocol.py` 验证；
（4）不要启动 uvicorn / docker。
```

### 预期产物

- `app/protocol/envelope.py`（Envelope + make_envelope + parse_envelope）。
- `app/protocol/incoming.py`（14 种入站 payload）。
- `app/protocol/outgoing.py`（20+ 种出站 payload）。
- `app/protocol/serialization.py`（JSON 实现 + msgpack stub）。
- `app/protocol/routing.py`（入站 / 出站路由表 + parse_incoming）。
- `app/protocol/__init__.py`。
- `app/tests/test_protocol.py`。

### 验收标准

1. Envelope 与全部 payload 类型可严格校验。
2. parse_incoming 路由 14 种入站类型正确。
3. make_envelope 字段自动填充。
4. JSON 往返一致。
5. msgpack stub 抛 NotImplementedError。
6. 出站类型全部齐全。
7. 测试通过。
8. ruff 通过。
9. 不依赖 service / repository / llm。
10. 命名与前端 protocol/types.ts 兼容。

### 禁止事项

- 禁止启动 WebSocket 服务。
- 禁止接真实前端。
- 禁止实现复杂鉴权。
- 禁止把协议消息散落进业务代码。
- 禁止引入运行期 msgpack 依赖。
- 禁止把 payload 直接当 domain model。
- 禁止在 protocol 中写业务逻辑。

---

## 任务 4：实现内存仓储 repositories

### 使用场景

领域与协议就绪后，需要数据访问层。MVP 阶段只用内存仓储以保证后端可独立开发、单元测试、不连接数据库。同时通过 Protocol / 抽象基类约束接口，使未来替换 PostgreSQL / Redis 仅是新增实现，不动业务层。

### 可直接复制给 AI 编程工具的完整提示词

```
你是一名资深后端数据访问层工程师。请为《外交风云》—— 人机混战 AI Diplomacy 后端实现一套内存仓储（in-memory repositories），覆盖房间、玩家、游戏状态、行动日志、消息日志、事件日志、结算结果与回放数据。所有仓储均通过抽象接口约束，未来可替换为 PostgreSQL / Redis 实现。

【项目背景】
MVP 阶段不连数据库。后端必须能独立开发与测试。仓储是 service 层与持久化的边界。本任务只实现内存版本，并预留 Postgres / Redis 占位类（仅签名，不实现）。

【共用规则（强制遵守）】
1. 这是《外交风云》AI Diplomacy 后端。
2. 前端会并行开发，最终通过协议接入。
3. 当前任务只做后端，不写前端。
4. 不启动开发服务器。
5. 不调用真实 LLM。
6. 不连接真实数据库。
7. 不启动 Docker。
8. 游戏过程中只记录玩家消息和行动。
9. 只有结算阶段才允许通过抽象 LLM client 调用模型。
10. MVP 阶段不要重点实现 prompt injection 防护。
11. 所有模块要可测试。
12. 业务逻辑不要写在 API 路由或 WebSocket handler 里。
13. mock / in-memory 实现必须可以未来替换。
14. 代码结构必须清晰，避免单文件巨石。
15. 输出时先说明计划，再列出修改文件，最后说明验证方式。

【技术栈】
Python 3.11+ + asyncio。可使用 `typing.Protocol` 或 `abc.ABC` 定义接口，推荐 `Protocol`。

【本任务允许做以下事情】

1. 在 `app/repositories/base.py` 定义抽象接口（Protocol 风格）：

   - `RoomRepository(Protocol)`:
     - `async def create(room: GameRoom) -> GameRoom`
     - `async def get(room_id: str) -> GameRoom | None`
     - `async def update(room: GameRoom) -> None`
     - `async def list_active() -> list[GameRoom]`
     - `async def delete(room_id: str) -> None`

   - `PlayerRepository(Protocol)`:
     - `async def upsert(player: Player) -> None`
     - `async def get(player_id: str) -> Player | None`
     - `async def list_by_room(room_id: str) -> list[Player]`

   - `GameStateRepository(Protocol)`:
     - `async def save_factions(room_id: str, factions: list[FactionState]) -> None`
     - `async def get_factions(room_id: str) -> list[FactionState]`
     - `async def save_regions(room_id: str, regions: list[MapRegion]) -> None`
     - `async def get_regions(room_id: str) -> list[MapRegion]`
     - `async def save_relationships(room_id: str, rels: list[Relationship]) -> None`
     - `async def get_relationships(room_id: str) -> list[Relationship]`
     - `async def save_treaties(room_id: str, treaties: list[Treaty]) -> None`
     - `async def get_treaties(room_id: str) -> list[Treaty]`
     - `async def save_current_turn(room_id: str, turn: EpochTurn) -> None`
     - `async def get_current_turn(room_id: str) -> EpochTurn | None`

   - `ActionLogRepository(Protocol)`:
     - `async def append(action: GameAction) -> None`
     - `async def list_by_turn(room_id, epoch, turn) -> list[GameAction]`
     - `async def list_by_player(room_id, player_id) -> list[GameAction]`
     - `async def count_by_player_turn(room_id, player_id, epoch, turn, mode: str | None) -> int`

   - `MessageLogRepository(Protocol)`：
     - 与 ActionLogRepository 类似，但记录所有 speech / private / treaty 的可读消息文本（与 actions 解耦：actions 是行动指令，messages 是语言行为）。
     - `async def append_message(message: MessageRecord) -> None`
     - `async def list_by_turn(...)`、`list_private_between(room_id, factions)`、`list_public(room_id, epoch?, turn?)`。
     - `MessageRecord` 定义在 base.py：id / room_id / epoch / turn / phase / from_faction / to_factions / visibility / content / created_at_ms。

   - `EventLogRepository(Protocol)`:
     - `async def append(event: GameEvent) -> None`
     - `async def list_by_turn(room_id, epoch, turn) -> list[GameEvent]`
     - `async def list_visible_to_faction(room_id, faction_id, since_ms=0) -> list[GameEvent]`
     - `async def list_all(room_id) -> list[GameEvent]`

   - `SettlementRepository(Protocol)`:
     - `async def save(result: SettlementResult) -> None`
     - `async def get(room_id, epoch, turn) -> SettlementResult | None`
     - `async def list_by_room(room_id) -> list[SettlementResult]`

   - `ReplayRepository(Protocol)`:
     - `async def save_replay(room_id: str, replay_dto: dict[str, Any]) -> None`
     - `async def get_replay(room_id: str) -> dict[str, Any] | None`

2. 在 `app/repositories/memory.py` 实现内存版本：
   - 所有仓储类继承 `object`，实现对应 Protocol。
   - 内部使用 `dict[str, ...]` 或 `defaultdict(list)`。
   - 必须线程安全：使用 `asyncio.Lock()` 包裹写操作。
   - 复制对象出入：所有 get/list 返回 `model_copy(deep=True)` 防止外部修改内部状态。
   - 所有方法 `async def`，便于未来替换异步数据库实现。
   - 构造函数允许传入 `Clock` 用于时间戳填充（如有需要）。

3. 在 `app/repositories/postgres_placeholder.py` 仅写占位类签名：
   - 类名 `PostgresRoomRepository / PostgresPlayerRepository / ...`
   - 每个方法 `raise NotImplementedError("postgres adapter pending")`。
   - 顶部 docstring 注明"未来迁移目标：PostgreSQL + asyncpg / SQLAlchemy 2.x async"。

4. 在 `app/repositories/redis_placeholder.py` 仅写占位：
   - `RedisPubSub`：`async def publish(channel, msg)`、`async def subscribe(channel)`、`async def unsubscribe(channel)`，全部抛 NotImplementedError。
   - 顶部注明"未来用于跨进程房间事件广播"。

5. 在 `app/repositories/factory.py`：
   - `def make_repositories(env: Literal["memory","postgres"]) -> Repositories` 工厂。
   - `Repositories(BaseModel)` dataclass 风格容器，包含 `rooms / players / state / actions / messages / events / settlements / replays`。
   - MVP 阶段仅返回内存实现。Postgres 分支 raise NotImplementedError。

6. 在 `app/tests/test_repositories_memory.py` 编写测试：
   - 房间 CRUD。
   - 玩家 upsert + list_by_room。
   - 行动 append + list_by_turn + count_by_player_turn。
   - 消息 append_message + list_private_between。
   - 事件 append + list_visible_to_faction（按 MessageVisibility 过滤）。
   - 结算 save + get + list_by_room。
   - 回放 save_replay + get_replay。
   - 验证返回对象是 deep copy（外部修改返回值不影响内部）。
   - 并发写入测试（asyncio.gather 多个 append）。

【禁止做的事】
- 不要连接真实 PostgreSQL / Redis。
- 不要引入 SQLAlchemy / asyncpg / redis 依赖。
- 不要写 ORM 模型。
- 不要把仓储逻辑写进 API 路由。
- 不要返回内部对象引用（必须 deep copy）。
- 不要省略 asyncio.Lock。
- 不要把业务规则放进仓储（仅 CRUD，不做校验）。
- 不要省略占位类。

【验收标准】
1. 八种 Protocol 接口齐全。
2. 内存实现全部异步且线程安全（含 asyncio.Lock）。
3. 所有 get/list 返回 deep copy。
4. Postgres / Redis 占位类抛 NotImplementedError。
5. `make_repositories("memory")` 返回完整 Repositories 容器。
6. `make_repositories("postgres")` 抛 NotImplementedError 提示"待接入"。
7. `pytest -q app/tests/test_repositories_memory.py` 全部通过。
8. `ruff check app/repositories` 通过。
9. 仓储模块不依赖 service / protocol / llm。
10. 并发写入测试不出现 race（统计计数正确）。

请按以上规范完成本任务。完成后输出：
（1）实施计划；
（2）创建/修改文件清单；
（3）`pytest -q app/tests/test_repositories_memory.py` 验证；
（4）不要启动 uvicorn / docker / postgres / redis。
```

### 预期产物

- `app/repositories/base.py`（八种 Protocol 接口 + MessageRecord）。
- `app/repositories/memory.py`（内存实现）。
- `app/repositories/postgres_placeholder.py`、`redis_placeholder.py`。
- `app/repositories/factory.py`（make_repositories + Repositories 容器）。
- `app/tests/test_repositories_memory.py`。

### 验收标准

1. 八种仓储 Protocol 齐全。
2. 内存实现线程安全。
3. deep copy 防止外部修改。
4. Postgres/Redis 占位抛 NotImplementedError。
5. factory 工作正常。
6. 测试通过。
7. ruff 通过。
8. 不依赖 service / protocol / llm。
9. 并发安全。
10. 业务规则未渗透到仓储层。

### 禁止事项

- 禁止连接真实数据库 / Redis。
- 禁止引入 SQLAlchemy / asyncpg / redis 依赖。
- 禁止写 ORM。
- 禁止把仓储逻辑写进 API 路由。
- 禁止返回内部引用。
- 禁止省略锁。
- 禁止把业务规则写进仓储。

---

## 任务 5：实现房间与玩家服务 room service

### 使用场景

仓储就绪后，需要房间与玩家服务：创建房间、加入房间、选择势力、准备、开始游戏。RoomService 是 API 与 domain 之间的协调者。本任务只做服务层逻辑，不启动 WebSocket，不做匹配系统。

### 可直接复制给 AI 编程工具的完整提示词

```
你是一名资深后端服务工程师。请为《外交风云》—— 人机混战 AI Diplomacy 后端实现房间与玩家服务（RoomService），覆盖创建房间、加入房间、离开房间、选择势力、准备、开始游戏。

【项目背景】
游戏支持两种模式：solo_1v7（单人 1v3 简化或 1v7）与 multi_4v4（4 真人 + 4 AI）。本服务负责房间生命周期与玩家管理，是后端的入口服务。后续任务的 phase / action / settlement 都依赖房间已存在。

【共用规则（强制遵守）】
1. 这是《外交风云》AI Diplomacy 后端。
2. 前端会并行开发，最终通过协议接入。
3. 当前任务只做后端，不写前端。
4. 不启动开发服务器。
5. 不调用真实 LLM。
6. 不连接真实数据库。
7. 不启动 Docker。
8. 游戏过程中只记录玩家消息和行动。
9. 只有结算阶段才允许通过抽象 LLM client 调用模型。
10. MVP 阶段不要重点实现 prompt injection 防护。
11. 所有模块要可测试。
12. 业务逻辑不要写在 API 路由或 WebSocket handler 里。
13. mock / in-memory 实现必须可以未来替换。
14. 代码结构必须清晰，避免单文件巨石。
15. 输出时先说明计划，再列出修改方式，最后说明验证方式。

【技术栈】
Python 3.11+ + asyncio + Pydantic v2。本任务可 import `app.domain.*`、`app.repositories.*`、`app.core.*`，禁止 import `app.api.*` / `app.protocol.*` / `app.llm.*` / `app.game.*`（除明确允许的 `app.game.initializer`，但本任务只需占位调用）。

【本任务允许做以下事情】

1. 在 `app/services/room_service.py` 实现 `RoomService`：
   - 构造函数：`__init__(self, repos: Repositories, clock: Clock, *, max_solo_players=1, max_multi_players=4, total_factions=8)`。
   - 方法（全部 `async def` 并使用仓储抽象接口）：

   - `async def create_room(*, mode, host_display_name, seed: int | None = None) -> tuple[GameRoom, Player]`：
     - 生成 room_id / player_id。
     - 计算 max_players（solo=1，multi=4）。
     - 创建 GameRoom(status=lobby, mode, max_players, players=[host], ai_factions=[], current=EpochTurn(epoch=0, turn=0, phase=observe, ...), seed=seed or random）。
     - 持久化 room 与 host。
     - 返回 (room, host_player)。

   - `async def join_room(*, room_id, display_name) -> tuple[GameRoom, Player]`：
     - 校验房间存在 / 状态为 lobby / 未满。
     - 已满抛 RoomFullError；非 lobby 抛 InvalidPhaseError。
     - 生成 player_id，写入房间 players 列表。
     - 返回 (room, player)。

   - `async def leave_room(*, room_id, player_id) -> GameRoom`：
     - 校验房间存在 / 玩家存在。
     - 若房间状态 == running：标记玩家 connected=False，但不踢出（断线托管由任务 17 处理）。
     - 若房间状态 == lobby：从 players 移除；若主机离开且仍有其他玩家，转让主机；若空则 status=aborted。

   - `async def select_faction(*, room_id, player_id, faction_id: FactionId) -> GameRoom`：
     - 校验房间存在 / status=lobby / 玩家存在 / 势力未被其他人选择。
     - 已被选择抛 FactionAlreadyTakenError。
     - 玩家原有势力释放。
     - 写入 player.faction_id。

   - `async def set_ready(*, room_id, player_id, ready: bool) -> GameRoom`：
     - 校验房间 lobby / 玩家存在。
     - 玩家必须已 select_faction 才能 ready=True。
     - 写入 player.metadata 或新增 ready 字段（请扩展 Player 模型，加 `ready: bool = False`，并回头同步更新 domain/models.py 与测试）。

   - `async def start_game(*, room_id, requester_player_id) -> GameRoom`：
     - 仅主机可触发。
     - 校验 lobby / 玩家数量达标 / 所有真人玩家 ready。
     - 调用 `_assign_ai_factions(room)`：未被真人选择的势力分配给 AI（solo 模式 1 真人 + 7 AI；multi 模式 4 真人 + 4 AI；保证 8 个 FactionId 全部覆盖）。
     - status → starting。
     - 持久化。
     - 调用 `app.game.initializer.initialize_game_state(room)` 的占位 stub（本任务定义占位即可：`def initialize_game_state(room: GameRoom) -> InitialGameState: raise NotImplementedError("delivered in task 6")`）。
     - 不在本任务内推进 phase（任务 9 状态机负责）。
     - 返回 room（status=starting）。

   - `async def list_active_rooms() -> list[GameRoom]`。
   - `async def get_room(room_id) -> GameRoom`。

2. 在 `app/core/errors.py` 补充 `RoomFullError / FactionAlreadyTakenError / NotRoomHostError / NotAllPlayersReadyError`。

3. 在 `app/domain/models.py` 补充 `Player.ready: bool = False`。

4. 在 `app/game/initializer.py` 仅放占位函数 `initialize_game_state(room: GameRoom)` 抛 NotImplementedError（任务 6 真正实现）。

5. 在 `app/tests/test_room_service.py` 编写测试：
   - 创建房间（solo + multi 两种 mode）。
   - 加入房间至上限后再加入抛 RoomFullError。
   - 选择势力，重复选择同势力抛 FactionAlreadyTakenError。
   - 玩家切换势力会释放旧势力。
   - 未选择势力直接 ready=True 抛错。
   - set_ready True/False 切换。
   - 非主机调用 start_game 抛 NotRoomHostError。
   - 真人未全部 ready 调用 start_game 抛 NotAllPlayersReadyError。
   - 所有真人 ready 后 start_game 成功且 ai_factions 补齐到 8。
   - leave_room：lobby 状态下离开释放势力；running 状态下保留位置标记 connected=False（running 状态可由测试 fixture 直接构造）。

【禁止做的事】
- 不要写真实匹配系统（无 ELO / 排队 / 区域），房间靠 room_id 直接加入。
- 不要连接真实 WebSocket。
- 不要启动服务。
- 不要调用 LLM。
- 不要在 RoomService 中初始化完整 game state（任务 6 负责，本任务仅占位调用）。
- 不要把校验逻辑写进仓储。
- 不要让 RoomService 直接操作 EventLog（事件由 phase / action 服务负责）。
- 不要省略 AI 势力补位逻辑。

【验收标准】
1. 八个方法签名与功能与上述描述一致。
2. 创建房间 / 加入 / 离开 / 选择势力 / 准备 / 开始全部走仓储接口。
3. start_game 后房间状态 = starting，ai_factions 补齐至 8 个 FactionId（与人类玩家不重复）。
4. solo 模式 1 真人 + 7 AI；multi 模式 4 真人 + 4 AI。
5. 非主机调用 start_game 抛 NotRoomHostError。
6. 未全 ready 抛 NotAllPlayersReadyError。
7. 势力重复抛 FactionAlreadyTakenError。
8. 房间满抛 RoomFullError。
9. `pytest -q app/tests/test_room_service.py` 全部通过。
10. RoomService 不依赖 app.api / app.protocol / app.llm。

请按以上规范完成本任务。完成后输出：
（1）实施计划；
（2）创建/修改文件清单；
（3）`pytest -q app/tests/test_room_service.py` 验证；
（4）不要启动 uvicorn / docker。
```

### 预期产物

- `app/services/room_service.py`。
- `app/core/errors.py` 补充错误类型。
- `app/domain/models.py` 补充 `Player.ready`。
- `app/game/initializer.py` 占位 stub。
- `app/tests/test_room_service.py`。

### 验收标准

1. 八方法签名一致。
2. 全部走仓储接口。
3. AI 势力补位到 8。
4. solo / multi 玩家数限制。
5. 主机权限校验。
6. ready 校验。
7. 势力重复校验。
8. 房间满校验。
9. 测试通过。
10. 不依赖 api / protocol / llm。

### 禁止事项

- 禁止真实匹配系统。
- 禁止接 WebSocket。
- 禁止启动服务。
- 禁止调用 LLM。
- 禁止在 RoomService 内做完整游戏初始化（任务 6 负责）。
- 禁止把校验写进仓储。
- 禁止 RoomService 直接操作 EventLog。
- 禁止省略 AI 补位。

---

## 任务 6：实现游戏状态初始化 game state initializer

### 使用场景

房间 start_game 后需要一份初始游戏状态：八势力初始指标、初始地图区域、初始关系矩阵、初始资源、初始 EpochTurn。这是后续行动 / 结算 / 复盘的起点。初始化必须 deterministic（同 seed 同结果），便于测试与调试。

### 可直接复制给 AI 编程工具的完整提示词

```
你是一名资深游戏初始化工程师。请为《外交风云》—— 人机混战 AI Diplomacy 后端实现游戏状态初始化器，根据房间设置（seed / mode / 八势力分配）生成完整初始游戏状态。

【项目背景】
游戏由 5~8 个纪元构成，每纪元 3 回合。初始状态需要包含：八势力 FactionState、64 个 MapRegion（每势力初始 8 个区域）、初始 56 条关系（C(8,2)*2 方向 = 56 条，含两两关系正反方向）、初始 EpochTurn=Epoch 1 Turn 1 Phase observe、初始资源与发展度。

【共用规则（强制遵守）】
1. 这是《外交风云》AI Diplomacy 后端。
2. 前端会并行开发，最终通过协议接入。
3. 当前任务只做后端，不写前端。
4. 不启动开发服务器。
5. 不调用真实 LLM。
6. 不连接真实数据库。
7. 不启动 Docker。
8. 游戏过程中只记录玩家消息和行动。
9. 只有结算阶段才允许通过抽象 LLM client 调用模型。
10. MVP 阶段不要重点实现 prompt injection 防护。
11. 所有模块要可测试。
12. 业务逻辑不要写在 API 路由或 WebSocket handler 里。
13. mock / in-memory 实现必须可以未来替换。
14. 代码结构必须清晰，避免单文件巨石。
15. 输出时先说明计划，再列出修改文件，最后说明验证方式。

【技术栈】
Python 3.11+ + Pydantic v2 + 标准库 random（使用 `random.Random(seed)` 而非全局 random，保证 deterministic）。

【八势力初始指标（强制基线，可在 ±5% 之内 deterministic 抖动）】
- military: 100（铁冠帝国 +20% → 120；灰烬部族 +0 但 morale 上限 +0.3 单独体现；极光共和防御加成在战斗时体现，初始仍 100）。
- economy: 100（翡翠王庭 +30% 在贸易收益中体现，初始 100；熔岩议会 +25% 资源产出在 region.resource_value 中体现，初始 100）。
- diplomacy: 50。
- culture: 30（虚空教廷 +40% 在文化结算中体现）。
- morale: 1.0（灰烬部族 1.3）。
- total_power = military * 0.35 + economy * 0.25 + diplomacy * 0.25 + culture * 0.15。
- status: stable。

【八势力初始关系（强制基线）】
- 默认 neutral，value=0。
- 灰烬部族 ↔ 铁冠帝国：hostile，value=-50（兵戎相见）。
- 星辉联邦 ↔ 极光共和：friendly，value=+40（科技合作）。
- 翡翠王庭 ↔ 暗潮商会：friendly，value=+25（商贸联通）。
- 虚空教廷 ↔ 灰烬部族：wary，value=-15。
- 其余初始 neutral，value 在 [-5, +5] deterministic 抖动。

【64 个地图区域分布（强制规则）】
- region_id 形如 `region_00 ~ region_63`。
- 每势力初始拥有 8 个 region。
- terrain 多样化：每势力 8 个 region 中至少 1 mountain、1 plains、1 fortress、1 river，剩余在 desert / plains 中分布。
- resource_value: 20~80 deterministic 抖动；熔岩议会的 region 在 +25% 范围。
- development_level: 0.5~1.0 deterministic 抖动。
- center_lat_lng: 在 [-60, 60] × [-180, 180] 上 deterministic 撒点（按势力分区，前端可视化容易识别）。
- min_garrison: 10。
- supply_lines: 1~3 deterministic 随机。

【本任务允许做以下事情】

1. 在 `app/game/initializer.py` 实现 `initialize_game_state(room: GameRoom, *, clock: Clock) -> InitialGameState`：
   - 用 `random.Random(room.seed)` 构造 deterministic RNG。
   - 生成 8 个 FactionState（按上面规则）。
   - 生成 64 个 MapRegion（按规则）。
   - 生成 56 条 Relationship（双向，含 status）。
   - 初始无 Treaty。
   - 初始 EpochTurn(epoch=1, turn=1, phase=observe, arbitrate_phase=None, phase_started_at_ms=clock.now_ms(), phase_duration_ms=15000)。
   - 返回 `InitialGameState(BaseModel)`：factions / regions / relationships / treaties / current_turn。

2. 在 `app/domain/models.py` 补充 `InitialGameState`（如未存在）。

3. 在 `app/game/factions_init.py` 抽出八势力初始指标常量函数 `build_initial_faction_state(faction_id, rng) -> FactionState`。

4. 在 `app/game/relationships_init.py` 抽出初始关系矩阵函数 `build_initial_relationships(rng) -> list[Relationship]`。

5. 在 `app/game/map_init.py` 抽出地图初始化函数 `build_initial_regions(faction_ids: list[FactionId], rng) -> list[MapRegion]`。

6. 在 `app/services/room_service.py::start_game` 调用 `initialize_game_state(room, clock=self.clock)`，把返回的 InitialGameState 通过 GameStateRepository 写入仓储；将房间 status 从 starting 切换为 running，current_turn=Epoch1/Turn1/observe。

7. 在 `app/tests/test_initializer.py` 编写测试：
   - 同 seed 两次调用 `initialize_game_state` 结果完全一致（factions / regions / relationships 三者 model_dump 相等）。
   - 不同 seed 结果不同。
   - 八势力初始指标符合规则（铁冠 military=120 ±5%，灰烬 morale=1.3 ±0.05，等）。
   - 64 个 region 分配正确，每势力 8 个。
   - 每势力 terrain 多样化（含 mountain/plains/fortress/river）。
   - 关系矩阵 56 条，含强制基线项。
   - status 与 value 对齐：value<=-60 ⇒ hostile，等等。
   - total_power 计算与公式一致。

【禁止做的事】
- 不要做复杂地图算法（无 Voronoi / 真实大陆分布）。
- 不要接前端 / WebSocket。
- 不要启动服务。
- 不要调用 LLM。
- 不要使用全局 random，必须 `random.Random(seed)`。
- 不要把初始化逻辑塞进 RoomService（必须在 game/initializer 中）。
- 不要省略 deterministic 测试。
- 不要把 64 个 region 写死，必须按 seed 生成。
- 不要在初始化中创建 GameEvent / 消息（只产生状态快照）。

【验收标准】
1. `initialize_game_state(room, clock=clock)` 返回完整 InitialGameState。
2. 同 seed 两次结果完全一致。
3. 八势力初始指标符合规则。
4. 64 个 region，每势力 8 个，terrain 多样化。
5. 56 条关系矩阵 + 强制基线项正确。
6. EpochTurn 初始为 Epoch1/Turn1/observe，phase_duration_ms=15000。
7. RoomService.start_game 集成后 status=running。
8. `pytest -q app/tests/test_initializer.py` 全部通过。
9. `ruff check app/game` 通过。
10. initializer 模块不依赖 protocol / llm / api。

请按以上规范完成本任务。完成后输出：
（1）实施计划；
（2）创建/修改文件清单；
（3）`pytest -q app/tests/test_initializer.py` 验证；
（4）不要启动 uvicorn / docker。
```

### 预期产物

- `app/game/initializer.py`（initialize_game_state）。
- `app/game/factions_init.py`、`relationships_init.py`、`map_init.py`。
- `app/domain/models.py` 补充 InitialGameState。
- `app/services/room_service.py` 集成 start_game → running。
- `app/tests/test_initializer.py`。

### 验收标准

1. initialize_game_state 完整。
2. deterministic 同 seed 相等。
3. 八势力初始指标。
4. 64 个 region。
5. 56 条关系。
6. EpochTurn 初始正确。
7. start_game 后 running。
8. 测试通过。
9. ruff 通过。
10. 不依赖 protocol / llm / api。

### 禁止事项

- 禁止复杂地图算法。
- 禁止接前端 / WebSocket。
- 禁止启动服务。
- 禁止调用 LLM。
- 禁止全局 random。
- 禁止把初始化塞进 RoomService。
- 禁止 64 region 写死。
- 禁止在初始化中创建事件。

---

## 任务 7：实现行动记录 action recording service

### 使用场景

游戏进入 action 阶段后，玩家通过协议消息提交演讲、密谈、条约、军令、情报、锁定。本任务实现 ActionService：行动期只做基础校验 + 写入 action_log / message_log + 返回轻量 ACK，**不调用 LLM**，不阻塞玩家体验。这是本项目最核心的"先记录后判断"架构决策的落地。

### 可直接复制给 AI 编程工具的完整提示词

```
你是一名资深后端服务工程师。请为《外交风云》—— 人机混战 AI Diplomacy 后端实现行动记录服务（ActionService），覆盖玩家在行动期的全部语言行为与指令的记录。

【项目背景】
这是本项目后端核心任务之一。架构决策：行动期不调用 LLM 做深度判断，只记录玩家消息和行动；模型判断推迟到结算阶段。原因是实时调用模型会破坏行动期流畅体验，玩家需要快速决策与连续输入。

【共用规则（强制遵守）】
1. 这是《外交风云》AI Diplomacy 后端。
2. 前端会并行开发，最终通过协议接入。
3. 当前任务只做后端，不写前端。
4. 不启动开发服务器。
5. 不调用真实 LLM。
6. 不连接真实数据库。
7. 不启动 Docker。
8. 游戏过程中只记录玩家消息和行动。
9. 只有结算阶段才允许通过抽象 LLM client 调用模型。
10. MVP 阶段不要重点实现 prompt injection 防护。
11. 所有模块要可测试。
12. 业务逻辑不要写在 API 路由或 WebSocket handler 里。
13. mock / in-memory 实现必须可以未来替换。
14. 代码结构必须清晰，避免单文件巨石。
15. 输出时先说明计划，再列出修改文件，最后说明验证方式。

【技术栈】
Python 3.11+ + asyncio + Pydantic v2。

【行动期频率限制（强制）】
- 演讲（speech）：每玩家每回合 ≤ 5。
- 密谈（private）：每玩家每回合 ≤ 5（与演讲合并算）→ 改为：speech+private 合计 ≤ 5。
- 条约（treaty）：每玩家每回合 ≤ 3。
- 军令（military）：每玩家每回合 ≤ 3。
- 情报（intel）：每玩家每回合 ≤ 1。
- 锁定（lock）：每回合 ≤ 1。

【基础字段校验（强制）】
- content: 1~400 字符，去除前后空白后非空。
- targets: 不可包含 actor 自身势力。
- target_faction: 不可为 actor 自身势力。
- speech.targets：允许 ["*"] 表示全体；非"*"时全部必须是有效 FactionId。
- treaty.target_factions：1~3 个，全部存在。
- military: source_region / target_region 必须存在；movement ∈ move/attack/defend；troops > 0 或 None。
- intel: target_faction 必须存在；intel_kind ∈ spy/interrogate/intercept。
- phase 必须为 action，否则抛 InvalidPhaseError（lock 在 action 与 resolve 之间过渡时允许，由 phase service 控制，本任务统一只允许 action）。

【可见性规则（强制，与任务 8 衔接）】
- speech：VisibilityScope=public。
- private：VisibilityScope=faction_pair（actor + target_faction）。
- treaty：VisibilityScope=faction_set（actor + target_factions）。
- military：VisibilityScope=self（先记录，结算后由可见性规则生成模糊事件）。
- intel：VisibilityScope=self。
- lock：VisibilityScope=self。

【本任务允许做以下事情】

1. 在 `app/services/action_service.py` 实现 `ActionService`：
   - 构造函数 `__init__(self, repos, clock, *, max_speech_private_per_turn=5, max_treaty=3, max_military=3, max_intel=1)`。
   - 方法（全部 async）：

   - `async def record_speech(*, room_id, player_id, content, targets, request_id) -> ActionAck`
   - `async def record_private_message(*, room_id, player_id, target_faction, content, request_id) -> ActionAck`
   - `async def record_treaty_request(*, room_id, player_id, treaty_kind, target_factions, proposal_text, request_id) -> ActionAck`
   - `async def record_military_order(*, room_id, player_id, source_region, target_region, movement, orders_text, troops, request_id) -> ActionAck`
   - `async def record_intel_action(*, room_id, player_id, target_faction, intel_kind, brief, request_id) -> ActionAck`
   - `async def record_lock_action(*, room_id, player_id, request_id) -> ActionAck`

   每个方法的实现步骤：
   1. 通过 RoomRepository.get(room_id) 取房间；不存在抛 RoomNotFoundError。
   2. 通过 PlayerRepository.get(player_id) 取玩家；不存在抛 PlayerNotFoundError；不属于该房间抛 InvalidActionError。
   3. 校验 room.status == running，否则抛 InvalidPhaseError。
   4. 校验 room.current.phase == action，否则抛 InvalidPhaseError。
   5. 调用 ActionLogRepository.count_by_player_turn 检查频率限制；超出抛 RateLimitedError。
   6. 校验 content / targets / target_faction / treaty / military / intel 字段（按上述基础校验规则）。
   7. 构造对应 GameActionBase 子类对象，filling id / room_id / epoch / turn / phase / actor_player_id / actor_faction（=player.faction_id）/ created_at_ms / visibility。
   8. ActionLogRepository.append(action)。
   9. 若为 speech / private / treaty：同步生成 MessageRecord 并 MessageLogRepository.append_message。
   10. 返回 `ActionAck(request_id, accepted=True, action_id=action.id, server_ts=clock.now_ms(), seq=repos.events.next_seq(room_id))`。

   定义 `ActionAck(BaseModel)`：request_id / accepted: bool / action_id: str | None / reason: str | None / server_ts: int / seq: int。

2. 在 `app/core/errors.py` 补充：`RateLimitedError / InvalidActionError`（若尚未存在）。

3. 在 `app/services/action_service.py` 内部使用一个本地 `_validate_*(action)` 工具集，集中字段校验，便于测试与扩展。

4. 在 `app/tests/test_action_service.py` 编写测试：
   - phase != action 时所有 record_* 抛 InvalidPhaseError。
   - speech content > 400 抛 ValidationError 或 InvalidActionError（任选一致即可）。
   - speech.targets 含 actor 自身势力抛 InvalidActionError。
   - private target_faction 等于 actor 抛 InvalidActionError。
   - treaty.target_factions 长度 0 或 4 抛 InvalidActionError。
   - speech+private 合计第 6 次抛 RateLimitedError。
   - treaty 第 4 次抛 RateLimitedError。
   - intel 第 2 次抛 RateLimitedError。
   - 正常调用后 ActionLogRepository.list_by_turn 返回该 action。
   - speech / private / treaty 同步写入 MessageLogRepository（list_by_turn 包含对应 MessageRecord）。
   - **核心约束**：本任务测试中不可 import `app.llm.*`；ActionService 在所有方法中绝不调用 LLMClient。

【禁止做的事】
- 不要在 ActionService 中实时调用 LLM。
- 不要做复杂语义解析（不分析"是否威胁"、"是否欺骗"）。
- 不要把行动直接结算（不修改 FactionState / Relationship / MapRegion）。
- 不要写前端。
- 不要启动服务。
- 不要把"宣战"识别成 declare_war 事件直接写入 EventLog（结算阶段才生成 event）。
- 不要在 ActionService 写广播事件（任务 8 由可见性服务生成 outbound events）。
- 不要忽略 visibility scope 字段。
- 不要把 ActionService 设计成只能在 WebSocket 内调用（必须可在 REST 调试接口与单元测试中直接调用）。
- 不要把频率限制写进仓储；必须在 service 层使用仓储 count 接口。

【验收标准】
1. 六个 record_* 方法全部实现。
2. 行动期内每条 action 写入 ActionLogRepository，speech/private/treaty 同步写入 MessageLogRepository。
3. phase != action 抛 InvalidPhaseError。
4. 字段校验全部覆盖（content 长度 / targets 含自身 / treaty 长度 / movement 枚举等）。
5. 频率限制按规则生效。
6. ActionAck 字段齐全（含 server_ts 与 seq）。
7. `pytest -q app/tests/test_action_service.py` 全部通过。
8. 任何路径都不 import `app.llm`。
9. ActionService 不修改 FactionState / Relationship / MapRegion。
10. `ruff check app/services/action_service.py` 通过。

请按以上规范完成本任务。完成后输出：
（1）实施计划；
（2）创建/修改文件清单；
（3）`pytest -q app/tests/test_action_service.py` 验证；
（4）不要启动 uvicorn / docker；
（5）明确确认"行动期不调用 LLM"。
```

### 预期产物

- `app/services/action_service.py`（六个 record_* 方法 + ActionAck）。
- `app/core/errors.py` 补充错误。
- `app/tests/test_action_service.py`。

### 验收标准

1. 六方法实现完整。
2. 行动写入双仓储。
3. phase 校验。
4. 字段校验全覆盖。
5. 频率限制正确。
6. ActionAck 完整。
7. 测试通过。
8. 不 import llm。
9. 不修改 FactionState / Relationship / MapRegion。
10. ruff 通过。

### 禁止事项

- 禁止行动期调用 LLM。
- 禁止复杂语义解析。
- 禁止直接结算。
- 禁止写前端 / 启动服务。
- 禁止在 action 中写 declare_war 等事件。
- 禁止在 ActionService 内生成广播事件。
- 禁止忽略 visibility scope。
- 禁止把 service 设计成仅 WebSocket 可用。
- 禁止把频率限制写进仓储。

---

## 任务 8：实现消息可见性与广播事件生成

### 使用场景

ActionService 只写日志，但前端需要事件流。本任务实现可见性服务：根据玩家行动生成对应可见性的 outbound GameEvent；不同玩家收到不同事件列表（公开演讲所有人可见、密谈仅双方可见、第三方只看到 meta 事件、军令按迷雾规则模糊化等）。

### 可直接复制给 AI 编程工具的完整提示词

```
你是一名资深可见性与广播工程师。请为《外交风云》—— 人机混战 AI Diplomacy 后端实现消息可见性与广播事件生成模块（VisibilityService）。

【项目背景】
信息隔离是反作弊与游戏体验的核心：
- 公开演讲：所有势力可见。
- 密谈：仅当事方可见；第三方只能看到 meta 事件"A 与 B 正在密谈"。
- 军令：按迷雾规则；邻国可见模糊版本（方向 + 规模档位），无关方不可见。
- 条约请求：相关方可见全文；其它势力可见 meta 事件"X 与 Y 在协商条约"。
- 情报：仅 actor 自身可见 + 任务 15 结算后可能生成模糊曝光事件。
- 系统事件（phase_change / narration / battle 等）：所有人可见。

【共用规则（强制遵守）】
1. 这是《外交风云》AI Diplomacy 后端。
2. 前端会并行开发，最终通过协议接入。
3. 当前任务只做后端，不写前端。
4. 不启动开发服务器。
5. 不调用真实 LLM。
6. 不连接真实数据库。
7. 不启动 Docker。
8. 游戏过程中只记录玩家消息和行动。
9. 只有结算阶段才允许通过抽象 LLM client 调用模型。
10. MVP 阶段不要重点实现 prompt injection 防护。
11. 所有模块要可测试。
12. 业务逻辑不要写在 API 路由或 WebSocket handler 里。
13. mock / in-memory 实现必须可以未来替换。
14. 代码结构必须清晰，避免单文件巨石。
15. 输出时先说明计划，再列出修改文件，最后说明验证方式。

【技术栈】
Python 3.11+ + asyncio + Pydantic v2。

【本任务允许做以下事情】

1. 在 `app/game/visibility.py` 实现：

   - `def derive_events_from_action(action: GameAction, *, faction_pair_known: bool = True) -> list[GameEvent]`：
     - speech → 一条 EventKind=speech，priority=P2，visibility=public，narration 模板"{actor_faction} 发表公开声明"。
     - private → 一条 EventKind=private（仅双方可见，scope=faction_pair）+ 一条 EventKind=intel meta（其他第三方看到"X 与 Y 正在密谈"，scope=public），priority=P1。
     - treaty → 一条 EventKind=trade/alliance/non_aggression（按 treaty_kind 分类）scope=faction_set，narration 模板含 treaty_kind；另一条公开 meta 事件。
     - military → 一条 actor self 详细事件 + 邻国（其 region 与 source/target 相邻或 owner 相邻势力）模糊事件（仅含方向 + 规模档位）。
     - intel → 一条 actor self 事件；不生成公开广播；可在结算阶段生成曝光事件（本任务不处理）。
     - lock → 不生成 outbound 事件。

   - `def build_outbound_events_for_player(events: list[GameEvent], *, viewer_faction: FactionId | None) -> list[GameEvent]`：
     - 输入：本回合（或自上次 seq 以来）的 events 列表 + 观察者势力。
     - 输出：仅观察者可见的 events 子集。
     - 规则：
       - scope=public：全部可见。
       - scope=faction_pair：仅当 viewer_faction in event.payload["pair"]。
       - scope=faction_set：仅当 viewer_faction in event.payload["set"]。
       - scope=self：仅当 viewer_faction == event.actor_faction。
       - viewer_faction is None：仅 scope=public。

   - `def adjacent_factions(region_id: str, regions: list[MapRegion]) -> set[FactionId]`：返回 region 邻接 region 的 owner 集合（用 center_lat_lng 距离阈值近似邻接，本任务取距离 < 30° 为邻接）。

   - `def fuzz_military_event(action: MilitaryAction, regions, viewer_faction) -> GameEvent | None`：邻国可见的模糊版本，含 direction（north/south/east/west 由 source→target lat_lng 推断）与 scale（small/medium/large 由 troops 推断：troops<30 small，30~80 medium，>80 large）。

2. 在 `app/services/action_service.py` 调用流程扩展（请新增 `_emit_outbound_events(action)` 方法）：
   - 在每个 record_* 返回前，调用 `derive_events_from_action(action)` 取得 events，然后 EventLogRepository.append 每条 event。
   - 不在 ActionService 中直接广播给 WebSocket，仅写入 EventLogRepository。后续任务 17 的 gateway 通过 `EventLogRepository.list_visible_to_faction` 拉取并推送。

3. 在 `app/tests/test_visibility.py` 编写测试：
   - speech → public 事件；所有 viewer 可见。
   - private A→B：A 与 B 收到完整事件；C/D/E/... 仅收到 meta 事件。
   - treaty A→[B,C]：A/B/C 可见全文；D/E/... 仅 meta。
   - military A 攻 region_X：邻国 owner Y 收到模糊事件含 direction 与 scale 档；远国 Z 不收到。
   - intel A：仅 A 可见，其他人 0 事件。
   - lock：所有人 0 outbound 事件。
   - adjacent_factions 距离阈值正确。
   - fuzz_military_event scale 档位分界正确。

【禁止做的事】
- 不要实现复杂反作弊（不做行为指纹、IP 风控）。
- 不要调用 LLM。
- 不要启动 WebSocket（任务 17 负责）。
- 不要把可见性逻辑写在前端。
- 不要让 ActionService 直接推送事件给玩家（仅写仓储）。
- 不要在 visibility.py 里写 LLM prompt。
- 不要在 visibility 中修改 FactionState / Relationship。
- 不要让"邻接"判断变成依赖外部图算法库；本任务使用经度纬度距离近似。

【验收标准】
1. derive_events_from_action 覆盖五种 mode + lock。
2. build_outbound_events_for_player 按 scope 过滤正确。
3. private 行为生成主事件 + meta 事件两条。
4. treaty 同理。
5. military 邻国模糊事件含 direction + scale。
6. ActionService 写入 EventLogRepository 正确数量的事件。
7. EventLogRepository.list_visible_to_faction(viewer) 返回过滤后子集与 build_outbound_events_for_player 一致。
8. `pytest -q app/tests/test_visibility.py` 全部通过。
9. visibility.py 不依赖 protocol / llm / api。
10. ActionService 不在外部直接接 WebSocket。

请按以上规范完成本任务。完成后输出：
（1）实施计划；
（2）创建/修改文件清单；
（3）`pytest -q app/tests/test_visibility.py` 验证；
（4）不要启动 uvicorn / docker。
```

### 预期产物

- `app/game/visibility.py`（derive_events_from_action / build_outbound_events_for_player / adjacent_factions / fuzz_military_event）。
- `app/services/action_service.py` 集成 `_emit_outbound_events`。
- `app/tests/test_visibility.py`。

### 验收标准

1. derive_events 覆盖五 mode + lock。
2. build_outbound_events 按 scope 过滤。
3. private / treaty 生成主 + meta 两条事件。
4. military 邻国模糊化。
5. ActionService 写入 EventLogRepository。
6. visible_to_faction 与 build_outbound 一致。
7. 测试通过。
8. ruff 通过。
9. 不依赖 protocol / llm / api。
10. 不直接推 WebSocket。

### 禁止事项

- 禁止复杂反作弊。
- 禁止调用 LLM。
- 禁止启动 WebSocket。
- 禁止把可见性逻辑写前端。
- 禁止 ActionService 直接推送给玩家。
- 禁止在 visibility 里写 LLM prompt。
- 禁止在 visibility 修改 FactionState。
- 禁止引入图算法库。

---

## 任务 9：实现回合阶段状态机

### 使用场景

游戏推进依赖阶段状态机：observe → action → resolve → arbitrate。每个阶段时长固定（前端 mock 已对齐）。本任务实现纯逻辑状态机 + phase 推进事件生成，**不真实 sleep / 不启动定时器**，由测试 / 调试接口 / 未来 WebSocket gateway 显式驱动。

### 可直接复制给 AI 编程工具的完整提示词

```
你是一名资深游戏循环工程师。请为《外交风云》—— 人机混战 AI Diplomacy 后端实现回合阶段状态机（PhaseService），覆盖 observe / action / resolve / arbitrate（含三子阶段）及 epoch 推进。

【项目背景】
设计文档定义每回合四阶段 + 每三回合裁决阶段：
- observe 15s → action 90s → resolve 30s → 下一回合 observe（连续 3 回合）→ arbitrate（battle 20s → epic 60s → summary 15s）→ 下一 epoch turn=1。
- 整局最多 8 epoch；结束后 game finished。

本任务实现纯逻辑状态机，不真实 sleep；时间推进由外部 tick (clock) 显式驱动，便于测试。

【共用规则（强制遵守）】
1. 这是《外交风云》AI Diplomacy 后端。
2. 前端会并行开发，最终通过协议接入。
3. 当前任务只做后端，不写前端。
4. 不启动开发服务器。
5. 不调用真实 LLM。
6. 不连接真实数据库。
7. 不启动 Docker。
8. 游戏过程中只记录玩家消息和行动。
9. 只有结算阶段才允许通过抽象 LLM client 调用模型。
10. MVP 阶段不要重点实现 prompt injection 防护。
11. 所有模块要可测试。
12. 业务逻辑不要写在 API 路由或 WebSocket handler 里。
13. mock / in-memory 实现必须可以未来替换。
14. 代码结构必须清晰，避免单文件巨石。
15. 输出时先说明计划，再列出修改文件，最后说明验证方式。

【阶段时长（强制）】
observe 15000ms / action 90000ms / resolve 30000ms / arbitrate.battle 20000ms / arbitrate.epic 60000ms / arbitrate.summary 15000ms。

【本任务允许做以下事情】

1. 在 `app/services/phase_service.py` 实现 `PhaseService`：
   - 构造 `__init__(self, repos, clock, *, on_settlement_required: Callable[[room_id, epoch, turn], Awaitable[None]] | None = None)`。
   - `on_settlement_required` 回调用于通知 settlement_service（任务 15 实现，本任务仅声明），但本任务可传 None。

   - `async def begin_turn(room_id, epoch, turn) -> EpochTurn`：
     - 写入 current_turn={epoch, turn, phase=observe, arbitrate_phase=None, phase_started_at_ms=clock.now_ms(), phase_duration_ms=15000}。
     - 生成 GameEvent kind=phase_change scope=public payload={"new_phase":"observe", "epoch":epoch, "turn":turn}，append EventLogRepository。
     - 同时生成 turn.begin outbound 事件（任务 17 gateway 会单独构造 turn.begin envelope，本任务先保留 GameEvent.payload 中相关数据）。
     - 返回 EpochTurn。

   - `async def lock_action(room_id, player_id) -> bool`：
     - 当前 phase 必须为 action。
     - 在 ActionLog 中查找 player 是否已 record_lock；若已有则忽略。
     - 检查房间所有真人玩家是否都已 lock（AI 玩家忽略）。
     - 若全 lock 返回 True；否则 False。

   - `async def advance_phase(room_id) -> EpochTurn`：
     - 取当前 EpochTurn，根据当前 phase 推进至下一阶段。
     - observe → action（duration=90000）。
     - action → resolve（duration=30000）。
     - resolve → 若 turn % 3 != 0：进入下一 turn observe；若 turn % 3 == 0：进入 arbitrate.battle（duration=20000）。
     - arbitrate.battle → arbitrate.epic（duration=60000）。
     - arbitrate.epic → arbitrate.summary（duration=15000）。
     - arbitrate.summary → 若 epoch < 8：epoch+1, turn=1, phase=observe；否则 room.status=finished。
     - 每次切换生成 GameEvent kind=phase_change，并按需调用 on_settlement_required（进入 resolve 时调用）。
     - 写入 GameStateRepository.save_current_turn。

   - `async def maybe_advance_by_clock(room_id) -> EpochTurn`：
     - 计算 elapsed = clock.now_ms() - current.phase_started_at_ms。
     - 若 elapsed >= phase_duration_ms：调用 advance_phase。
     - 否则返回当前不变。
     - 测试可在 FrozenClock 中手动 advance 后调用本方法。

   - `async def maybe_advance_by_lock(room_id) -> EpochTurn`：
     - 当前 phase=action 且所有真人玩家已 lock：立即 advance_phase 至 resolve。
     - 否则返回当前不变。

   - `async def force_phase(room_id, *, phase: GamePhase, arbitrate_phase: ArbitratePhase | None = None) -> EpochTurn`：
     - 仅调试用，跳过校验直接写入；本任务实现但在测试中标注 debug only。

2. 在 `app/services/phase_service.py` 内部实现 phase transition 表 `PHASE_TRANSITIONS: dict[tuple[GamePhase, ArbitratePhase|None], tuple[GamePhase, ArbitratePhase|None, int]]`，把状态转换抽成纯数据。

3. 在 `app/tests/test_phase_service.py` 编写测试（使用 FrozenClock）：
   - begin_turn 写入 observe + phase_change 事件。
   - advance_phase 按顺序：observe → action → resolve → observe (turn 2)。
   - turn 3 末 resolve → arbitrate.battle → arbitrate.epic → arbitrate.summary → epoch 2 turn 1 observe。
   - epoch 8 末 arbitrate.summary → room.status=finished。
   - maybe_advance_by_clock：在阶段 duration 内不推进；超出后推进。
   - lock_action 单玩家 lock 不触发；全玩家 lock 触发 maybe_advance_by_lock 进入 resolve。
   - on_settlement_required 回调在进入 resolve 时调用一次。
   - force_phase 调试用例可直接跳到 arbitrate.summary。

【禁止做的事】
- 不要使用 asyncio.sleep 或 background task 推进阶段。
- 不要启动定时器服务。
- 不要接 WebSocket。
- 不要调用 LLM。
- 不要让 phase service 依赖前端 mock。
- 不要在 phase service 中执行真正的结算逻辑（仅触发回调）。
- 不要省略 phase_change 事件。
- 不要把 phase 切换硬编码进 if/elif 大块；用 transition 表。
- 不要让 advance_phase 在同一调用里跨越多于一个阶段（每次只推一步）。

【验收标准】
1. begin_turn / lock_action / advance_phase / maybe_advance_by_clock / maybe_advance_by_lock / force_phase 全部实现。
2. PHASE_TRANSITIONS 表清晰且单一源。
3. observe → action → resolve → 下一 turn observe（turn % 3 != 0）。
4. resolve → arbitrate.battle（turn % 3 == 0）。
5. arbitrate.battle → epic → summary → 下一 epoch turn=1 observe。
6. epoch 8 末 status=finished。
7. on_settlement_required 在进入 resolve 时触发。
8. lock_action 全员触发推进至 resolve。
9. `pytest -q app/tests/test_phase_service.py` 全部通过。
10. 无 sleep / 无定时器；测试用 FrozenClock。

请按以上规范完成本任务。完成后输出：
（1）实施计划；
（2）创建/修改文件清单；
（3）`pytest -q app/tests/test_phase_service.py` 验证；
（4）不要启动 uvicorn / docker。
```

### 预期产物

- `app/services/phase_service.py`（PhaseService + PHASE_TRANSITIONS 表）。
- `app/tests/test_phase_service.py`。

### 验收标准

1. 六方法实现。
2. transition 表单一源。
3. observe → action → resolve → 下一 turn observe。
4. 第三回合末 resolve → arbitrate.battle。
5. arbitrate 三子阶段链路。
6. epoch 8 末 finished。
7. on_settlement_required 触发。
8. lock 推进。
9. 测试通过。
10. 无 sleep / 无定时器。

### 禁止事项

- 禁止真实 sleep / 定时器。
- 禁止启动 WebSocket。
- 禁止调用 LLM。
- 禁止依赖前端 mock。
- 禁止在 phase service 内执行结算。
- 禁止省略 phase_change 事件。
- 禁止硬编码 if/elif（用 transition 表）。
- 禁止一次跨多阶段。

---

## 任务 10：实现结算输入聚合 settlement aggregator

### 使用场景

进入 resolve 阶段后，结算需要一个完整的输入快照：本回合所有玩家行动、消息、密谈、条约请求、军令、当前游戏状态、关系矩阵、势力指标。这是 LLM 调用和规则裁决前的唯一数据来源。本任务实现 SettlementAggregator，仅汇总数据，不调用 LLM，不做规则结算。

### 可直接复制给 AI 编程工具的完整提示词

```
你是一名资深结算输入工程师。请为《外交风云》—— 人机混战 AI Diplomacy 后端实现结算输入聚合器（SettlementAggregator），汇总本回合所有玩家行动、消息、当前游戏状态，为模型裁决与规则结算准备 SettlementInput。

【项目背景】
这是本项目后端核心任务之一。架构决策：游戏过程中先记录行动与消息，到结算阶段再统一读取。Aggregator 是结算流水线的第一步：从仓储读取数据 → 构造 SettlementInput → 后续由 PromptBuilder + LLMClient + RuleResolver 处理。

【共用规则（强制遵守）】
1. 这是《外交风云》AI Diplomacy 后端。
2. 前端会并行开发，最终通过协议接入。
3. 当前任务只做后端，不写前端。
4. 不启动开发服务器。
5. 不调用真实 LLM。
6. 不连接真实数据库。
7. 不启动 Docker。
8. 游戏过程中只记录玩家消息和行动。
9. 只有结算阶段才允许通过抽象 LLM client 调用模型。
10. MVP 阶段不要重点实现 prompt injection 防护。
11. 所有模块要可测试。
12. 业务逻辑不要写在 API 路由或 WebSocket handler 里。
13. mock / in-memory 实现必须可以未来替换。
14. 代码结构必须清晰，避免单文件巨石。
15. 输出时先说明计划，再列出修改文件，最后说明验证方式。

【技术栈】
Python 3.11+ + asyncio + Pydantic v2。本任务允许 import app.domain.*、app.repositories.*，禁止 import app.llm.* / app.api.* / app.protocol.*。

【本任务允许做以下事情】

1. 在 app/game/settlement_aggregator.py 定义 SettlementInput(BaseModel)：
   - room_id: str
   - epoch: int
   - turn: int
   - generated_at_ms: int
   - factions_snapshot: list[FactionState]
   - relationships_snapshot: list[Relationship]
   - regions_snapshot: list[MapRegion]
   - treaties_snapshot: list[Treaty]
   - turn_actions: list[GameAction]
   - public_speeches: list[SpeechAction]
   - private_messages: list[PrivateMessageAction]
   - treaty_requests: list[TreatyAction]
   - military_orders: list[MilitaryAction]
   - intel_actions: list[IntelAction]
   - recent_events: list[GameEvent]    # 最近 N=20 条事件，按时间倒序
   - faction_personality_summary: dict[FactionId, dict[str, Any]]   # 来自 FACTION_META
   - relationship_summary_text: str    # 人类可读摘要
   - faction_stats_summary_text: str

2. 在同文件实现 SettlementAggregator：
   - 构造 __init__(self, repos: Repositories, clock: Clock, *, recent_event_window: int = 20)。
   - 方法（全部 async）：

   - async def aggregate(room_id: str, epoch: int, turn: int) -> SettlementInput：
     - 通过 ActionLogRepository.list_by_turn 拿取所有 GameAction。
     - 按 mode 分桶：public_speeches / private_messages / treaty_requests / military_orders / intel_actions。
     - 通过 GameStateRepository 拿取 factions / relationships / regions / treaties / current_turn。
     - 通过 EventLogRepository.list_by_turn(epoch, turn) + 上一回合事件，截取 recent_event_window 条。
     - 调用 app.domain.factions.FACTION_META 构造 faction_personality_summary（只取 archetype / speech_style / aggression / trust_base / honor_code / trigger_words）。
     - 调用内部 _build_relationship_summary_text(relationships) 产出人类可读文本。
     - 调用内部 _build_faction_stats_summary_text(factions) 产出表格化文本。
     - 返回 SettlementInput。

   - async def aggregate_epoch_summary(room_id: str, epoch: int) -> SettlementInput（占位）：
     - 与 aggregate 类似但 turn 设为该 epoch 最后回合，扩大 recent_event_window=80。
     - 用于 arbitrate.summary 阶段。

3. 在同模块下提供工具函数：
   - def split_actions_by_mode(actions: list[GameAction]) -> dict[str, list[GameAction]]。
   - def format_faction_stats_line(state: FactionState) -> str。
   - def format_relationship_line(rel: Relationship) -> str。

4. 在 app/tests/test_settlement_aggregator.py 编写测试：
   - 给定房间已 record 5 个 speech / 2 个 private / 1 个 treaty / 3 个 military / 1 个 intel 后，aggregate 返回的 SettlementInput 各桶数量正确。
   - factions_snapshot / relationships_snapshot / regions_snapshot 完整。
   - recent_events 数量 ≤ window。
   - faction_personality_summary 含 archetype 与 trigger_words。
   - relationship_summary_text / faction_stats_summary_text 非空且可读。
   - SettlementInput Pydantic 校验通过。
   - 同一回合多次调用 aggregate 结果一致（除时间戳）。
   - aggregator 不调用 LLM；测试中 patch app.llm 不会被触发。

【禁止做的事】
- 不要实时调用模型（这是 Aggregator，仅汇总数据）。
- 不要在 Aggregator 中写规则结算（仅读，不改 game state）。
- 不要在 Aggregator 中直接修改仓储数据。
- 不要让 Aggregator 依赖 protocol 层。
- 不要把 Aggregator 设计成同步 IO（必须 async）。
- 不要把 personality_summary 字段裁剪过度。
- 不要在 summary 文本中泄漏所有 Level 3 绝密信息；MVP 不做严格隔离，但应注释"可在未来按 viewer perspective 过滤"。

【验收标准】
1. SettlementInput 字段齐全。
2. aggregate(room_id, epoch, turn) 按 mode 分桶正确。
3. 完整 snapshot 与 recent_events。
4. 人类可读 summary 文本生成。
5. 同 turn 多次调用一致。
6. aggregate_epoch_summary 占位实现完成。
7. pytest -q app/tests/test_settlement_aggregator.py 全部通过。
8. Aggregator 不修改任何仓储数据。
9. Aggregator 不 import app.llm。
10. Aggregator 不 import app.api / app.protocol。

请按以上规范完成本任务。完成后输出：
（1）实施计划；
（2）创建/修改文件清单；
（3）pytest 验证；
（4）不要启动 uvicorn / docker；
（5）确认本任务不调用 LLM。
```

### 预期产物

- `app/game/settlement_aggregator.py`（SettlementInput + SettlementAggregator + 工具函数）。
- `app/tests/test_settlement_aggregator.py`。

### 验收标准

1. SettlementInput 字段齐全。
2. mode 分桶正确。
3. 完整 snapshot + recent_events。
4. summary 文本可读。
5. 同 turn 一致。
6. epoch summary 占位完成。
7. 测试通过。
8. 不修改仓储数据。
9. 不 import llm。
10. 不 import api / protocol。

### 禁止事项

- 禁止调用 LLM。
- 禁止在 Aggregator 写规则结算。
- 禁止修改仓储数据。
- 禁止依赖 protocol。
- 禁止同步 IO。
- 禁止裁剪 personality_summary 过度。
- 禁止 MVP 阶段做严格 viewer 视角过滤（仅注释占位）。

---

## 任务 11：设计结算阶段 LLM prompt builder

### 使用场景

聚合器产出 SettlementInput 后，需要构造结算 prompt 让模型给出结构化 JSON 输出。本任务实现 PromptBuilder：按设计文档"AI 性格系统"+"LLM 评估框架"组装 system prompt + user prompt + expected JSON schema 说明。本任务不调用模型，只产出 prompt 字符串。

### 可直接复制给 AI 编程工具的完整提示词

```
你是一名资深 LLM Prompt 工程师。请为《外交风云》—— 人机混战 AI Diplomacy 后端实现结算阶段 LLM PromptBuilder，构造完整的 system / user / JSON schema 说明 prompt。

【项目背景】
游戏过程中不调用模型；只有结算阶段统一构造 prompt 调用模型一次（每回合每房间一次）。模型输出结构化 JSON，包含关系变化、AI 发言、条约结果、战争建议、文化影响、士气影响、事件叙事。本任务只构造 prompt，不调用任何模型。

【共用规则（强制遵守）】
1. 这是《外交风云》AI Diplomacy 后端。
2. 前端会并行开发，最终通过协议接入。
3. 当前任务只做后端，不写前端。
4. 不启动开发服务器。
5. 不调用真实 LLM。
6. 不连接真实数据库。
7. 不启动 Docker。
8. 游戏过程中只记录玩家消息和行动。
9. 只有结算阶段才允许通过抽象 LLM client 调用模型。
10. MVP 阶段不要重点实现 prompt injection 防护。
11. 所有模块要可测试。
12. 业务逻辑不要写在 API 路由或 WebSocket handler 里。
13. mock / in-memory 实现必须可以未来替换。
14. 代码结构必须清晰，避免单文件巨石。
15. 输出时先说明计划，再列出修改文件，最后说明验证方式。

【技术栈】
Python 3.11+ + Pydantic v2 + 标准库 string / f-string。本任务只 import app.domain.* 与 app.game.settlement_aggregator 的 SettlementInput 类型。

【本任务允许做以下事情】

1. 在 app/llm/prompt_builder.py 实现：

   - 常量 SYSTEM_PROMPT_TEMPLATE：固定文本（约 30~50 行），说明：
     - 你是《外交风云》的裁决与叙事 AI。
     - 你需要根据本回合所有玩家行动和当前游戏状态，给出八大势力的反应、关系变化、条约结果、战争建议、文化影响、士气影响、事件叙事。
     - 输出必须是严格 JSON，符合 schema。
     - 输出的关系变化、士气变化必须有限度，单次变化绝对值不超过 30（关系）/ 0.2（士气）。
     - 输出的战争建议仅作为后端规则引擎参考，最终结算由后端 RuleResolver 处理。
     - 你只是建议方，后端规则会最终裁决。
     - 不要输出 markdown 围栏。

   - 常量 OUTPUT_JSON_SCHEMA_HINT：JSON 形态描述文本，包含字段：
     - relationship_deltas: list of {from, to, delta, reason}
     - ai_speeches: list of {faction_id, kind, content, target_faction}
     - treaty_decisions: list of {treaty_id, accepted, reason, counter_proposal}
     - military_judgements: list of {region_id, attacker, defender, legitimacy, narrative}
     - culture_impacts: list of {faction_id, delta, reason}
     - morale_impacts: list of {faction_id, delta, reason}
     - narrative_events: list of {kind, actor, target, narration}
     - map_change_suggestions: list of {region_id, new_owner, reason}
     - stat_change_suggestions: list of {faction_id, military_delta, economy_delta, diplomacy_delta, culture_delta, morale_delta}

   - 类 PromptBuilder：
     - def build_settlement_prompt(self, input: SettlementInput) -> SettlementPrompt：
       - 拼装 system + user。
       - user 部分按以下结构（每个章节带 ## 标题）：
         ## 当前回合（epoch / turn）
         ## 八势力状态（faction_stats_summary_text）
         ## 关系矩阵（relationship_summary_text）
         ## 八势力性格简要（faction_personality_summary 序列化文本）
         ## 本回合公开演讲（遍历 public_speeches，每条 1~3 行：actor / targets / content 节选）
         ## 本回合密谈（遍历 private_messages：actor → target / content）
         ## 本回合条约请求（遍历 treaty_requests：actor / kind / target_factions / proposal_text）
         ## 本回合军令（遍历 military_orders：actor / source → target / movement / troops / orders_text）
         ## 本回合情报（遍历 intel_actions：actor / target / kind / brief）
         ## 最近事件（recent_events narration 列表，最多 20 条）
         ## 输出格式（OUTPUT_JSON_SCHEMA_HINT）

     - 返回 SettlementPrompt(BaseModel)：system: str / user: str / json_schema_hint: str / temperature: float = 0.6 / max_tokens: int = 4000。

   - 工具函数：
     - def truncate(text: str, *, max_chars: int) -> str：超长字符串截断。
     - def format_action_lines(actions, prefix_label) -> list[str]。
     - def format_personality_summary(personality_dict) -> str。

   - 文件顶部 docstring："本模块仅产出 prompt 文本，不调用模型。模型调用由 app.llm.client 负责，且只在结算阶段触发。"

2. 在 app/tests/test_prompt_builder.py 编写测试：
   - 构造一个 SettlementInput fixture（含 2 个 speech / 1 个 private / 1 个 treaty / 1 个 military / 1 个 intel）。
   - 调用 build_settlement_prompt 返回 SettlementPrompt。
   - system 包含"《外交风云》"标识。
   - user 包含 8 势力状态文本。
   - user 包含密谈内容。
   - user 包含 OUTPUT_JSON_SCHEMA_HINT 关键字段名（如 relationship_deltas、ai_speeches、treaty_decisions 等）。
   - truncate(超长字符串) 长度受限。
   - 同一输入两次 build 结果相同（deterministic）。
   - PromptBuilder 不调用模型，测试不会触发任何 HTTP 请求。

【禁止做的事】
- 不要在本任务中调用模型；只产 prompt 字符串。
- 不要实现 prompt injection 防护系统（MVP 不重点；可加一行注释"未来可扩展安全过滤"）。
- 不要做实时玩家消息解析。
- 不要把 prompt 散落到业务代码里（必须集中在 prompt_builder.py）。
- 不要把 prompt 字段写得未来无法被 OpenAI / Claude / 本地模型共用。
- 不要在 prompt 中输出真实 API key 或秘密信息。
- 不要使用 jinja2 / 复杂模板引擎（只用 f-string + truncate）。
- 不要让 PromptBuilder 依赖 protocol / api / repositories。

【验收标准】
1. SettlementPrompt 字段齐全（system / user / json_schema_hint / temperature / max_tokens）。
2. build_settlement_prompt 拼装完整 user 文本。
3. system 含项目背景与"建议方"声明。
4. user 含八势力状态 / 关系矩阵 / 五类行动 / 最近事件 / JSON schema 提示。
5. OUTPUT_JSON_SCHEMA_HINT 含 9 类输出字段。
6. truncate 工具按字符长度截断。
7. 同输入两次结果相同。
8. pytest -q app/tests/test_prompt_builder.py 全部通过。
9. PromptBuilder 不调用模型。
10. PromptBuilder 不 import api / protocol / repositories。

请按以上规范完成本任务。完成后输出：
（1）实施计划；
（2）创建/修改文件清单；
（3）pytest 验证；
（4）不要启动 uvicorn / docker；
（5）确认本任务只产 prompt，不调用模型。
```

### 预期产物

- `app/llm/prompt_builder.py`（PromptBuilder + SYSTEM_PROMPT_TEMPLATE + OUTPUT_JSON_SCHEMA_HINT + SettlementPrompt）。
- `app/tests/test_prompt_builder.py`。

### 验收标准

1. SettlementPrompt 字段齐全。
2. user 文本完整。
3. system 含建议方声明。
4. 五类行动完整。
5. JSON schema 含 9 类输出。
6. truncate 工具。
7. deterministic。
8. 测试通过。
9. 不调用模型。
10. 不 import api / protocol / repositories。

### 禁止事项

- 禁止调用模型。
- 禁止实现 prompt injection 防护系统（MVP 不重点）。
- 禁止实时解析玩家消息。
- 禁止把 prompt 散落业务代码。
- 禁止绑定特定供应商字段。
- 禁止输出 API key。
- 禁止 jinja2 复杂模板。
- 禁止依赖 protocol / api / repositories。

---

## 任务 12：实现 LLM client 抽象层

### 使用场景

PromptBuilder 产出 prompt 后，需要一个统一的 LLMClient 把 prompt 发给模型并返回文本。本任务实现抽象接口 + MockLLMClient（默认 / 测试用）+ OpenAICompatibleClient / ClaudeCompatibleClient 占位（不真实调用）。所有 settlement 流程默认使用 MockLLMClient。

### 可直接复制给 AI 编程工具的完整提示词

```
你是一名资深 LLM 接入工程师。请为《外交风云》—— 人机混战 AI Diplomacy 后端实现 LLM 客户端抽象层，提供统一的接口、Mock 实现以及 OpenAI / Claude 兼容客户端占位。

【项目背景】
为避免绑定单一供应商，所有 LLM 调用都通过 LLMClient 接口完成。MVP 阶段默认使用 MockLLMClient 返回 deterministic JSON，便于结算流水线在不真实调用 API 的情况下运转。OpenAI / Claude 兼容实现仅保留接口签名 + raise NotImplementedError，不引入运行依赖。

【共用规则（强制遵守）】
1. 这是《外交风云》AI Diplomacy 后端。
2. 前端会并行开发，最终通过协议接入。
3. 当前任务只做后端，不写前端。
4. 不启动开发服务器。
5. 不调用真实 LLM。
6. 不连接真实数据库。
7. 不启动 Docker。
8. 游戏过程中只记录玩家消息和行动。
9. 只有结算阶段才允许通过抽象 LLM client 调用模型。
10. MVP 阶段不要重点实现 prompt injection 防护。
11. 所有模块要可测试。
12. 业务逻辑不要写在 API 路由或 WebSocket handler 里。
13. mock / in-memory 实现必须可以未来替换。
14. 代码结构必须清晰，避免单文件巨石。
15. 输出时先说明计划，再列出修改文件，最后说明验证方式。

【技术栈】
Python 3.11+ + asyncio + Pydantic v2。本任务不引入 openai / anthropic SDK。

【本任务允许做以下事情】

1. 在 app/llm/client.py 定义：
   - LLMRequest(BaseModel)：system: str / user: str / temperature: float / max_tokens: int / metadata: dict[str, Any] = {}。
   - LLMResponse(BaseModel)：content: str / model: str / prompt_tokens: int | None / completion_tokens: int | None / latency_ms: int / raw: dict[str, Any] | None。
   - LLMClient(Protocol)：
     - async def call_settlement_model(self, request: LLMRequest) -> LLMResponse
     - def name(self) -> str

2. 在 app/llm/mock_client.py 实现 MockLLMClient：
   - 构造 __init__(self, *, deterministic_output: dict | None = None, latency_ms: int = 0)。
   - 若传入 deterministic_output：直接序列化为 JSON 文本返回。
   - 否则根据 user prompt 中的 keywords 生成一份合规默认 JSON（含 1~2 个 relationship_deltas / 0~1 ai_speeches / 空 treaty_decisions / 空 military_judgements / 0~1 culture_impacts / 0~1 morale_impacts / 1~2 narrative_events / 空 map_change_suggestions / 0 stat_change_suggestions）。
   - 默认 JSON 必须能通过任务 13 的 schema 校验（提前与 13 对齐字段）。
   - name() 返回 "mock"。
   - 提供 set_next_output(output: dict)：测试中可注入下一次输出。

3. 在 app/llm/openai_client.py 占位 OpenAICompatibleClient(LLMClient)：
   - 构造 __init__(self, *, api_key: str, base_url: str, model: str, timeout_s: float = 30.0)。
   - call_settlement_model 抛 NotImplementedError("openai client pending wiring; provide api adapter in production")。
   - 类 docstring 注明"未来用 httpx + chat/completions endpoint 接入"。

4. 在 app/llm/claude_client.py 占位 ClaudeCompatibleClient(LLMClient)：
   - 同上结构，抛 NotImplementedError("claude client pending")。
   - docstring 注明"未来用 httpx + /v1/messages 接入"。

5. 在 app/llm/factory.py 实现：
   - def make_llm_client(provider, *, settings=None) -> LLMClient。
   - provider="mock" 返回 MockLLMClient。
   - provider in ("openai","claude") 抛 NotImplementedError("provider not wired yet; default to mock in MVP")。
   - 注释指出未来从 settings 读取 api_key / base_url。

6. 在 app/llm/retry.py 提供简单工具：
   - async def call_with_retry(client: LLMClient, request: LLMRequest, *, max_retries: int = 1, base_delay_ms: int = 200) -> LLMResponse。
   - MVP 仅做 1 次重试，指数退避。
   - 测试可注入抛错的 client，验证重试次数。

7. 在 app/tests/test_llm_mock_client.py 编写测试：
   - MockLLMClient 默认输出可被 json.loads。
   - set_next_output 可注入。
   - latency_ms=0 时调用立即返回。
   - call_with_retry：第一次失败、第二次成功的 client 调用计数为 2。
   - call_with_retry 重试到上限仍失败抛原异常。
   - OpenAICompatibleClient / ClaudeCompatibleClient.call_settlement_model 抛 NotImplementedError。
   - make_llm_client("mock") 返回 MockLLMClient。
   - make_llm_client("openai") 抛 NotImplementedError。
   - 整个测试不发出任何 HTTP 请求。

【禁止做的事】
- 不要写死 API key。
- 不要真实调用外部 LLM API。
- 不要启动服务。
- 不要把 LLM SDK 调用散落在业务服务里。
- 不要让 MockLLMClient 输出无法通过 schema 校验的 JSON。
- 不要在本任务中实现 prompt injection 防护过滤系统。
- 不要在本任务中实现完整熔断 / 限流。
- 不要 import openai / anthropic / httpx 运行依赖。

【验收标准】
1. LLMClient Protocol、LLMRequest、LLMResponse 定义齐全。
2. MockLLMClient 默认输出可通过 JSON 解析且字段对齐任务 13 schema。
3. set_next_output 注入工作。
4. call_with_retry 重试逻辑正确。
5. OpenAI / Claude 占位类抛 NotImplementedError 且不 import 真实 SDK。
6. make_llm_client 工厂工作正常。
7. pytest -q app/tests/test_llm_mock_client.py 全部通过。
8. 整个测试无网络依赖。
9. ruff check app/llm 通过。
10. 设置 LLM_PROVIDER=mock 时整个结算流水线（与任务 15 联调）可工作。

请按以上规范完成本任务。完成后输出：
（1）实施计划；
（2）创建/修改文件清单；
（3）pytest 验证；
（4）不要启动 uvicorn / docker；
（5）确认本任务不真实调用外部 API。
```

### 预期产物

- `app/llm/client.py`、`mock_client.py`、`openai_client.py`、`claude_client.py`、`factory.py`、`retry.py`。
- `app/tests/test_llm_mock_client.py`。

### 验收标准

1. 接口与 DTO 齐全。
2. MockLLMClient 默认 JSON 合规。
3. set_next_output 注入。
4. retry 行为正确。
5. 占位类抛 NotImplementedError。
6. factory 工作。
7. 测试通过。
8. 无网络。
9. ruff 通过。
10. LLM_PROVIDER=mock 可走通流水线。

### 禁止事项

- 禁止写死 API key。
- 禁止真实调用外部 API。
- 禁止启动服务。
- 禁止把 LLM SDK 散落业务。
- 禁止 mock 输出违反 schema。
- 禁止实现注入防护。
- 禁止熔断限流。
- 禁止 import openai / anthropic / httpx。

---

## 任务 13：实现模型裁决结果 schema 与解析器

### 使用场景

LLMClient 返回 JSON 字符串后，需要校验、解析、容错。本任务定义 SettlementModelOutput Pydantic schema，与 PromptBuilder 中 OUTPUT_JSON_SCHEMA_HINT 严格对应；并实现 ModelOutputParser，对非法 JSON、缺字段、类型错误做容错。

### 可直接复制给 AI 编程工具的完整提示词

```
你是一名资深 LLM 输出解析工程师。请为《外交风云》—— 人机混战 AI Diplomacy 后端实现模型裁决结果 schema 与解析器，对结算阶段 LLM 输出进行严格校验和容错处理。

【项目背景】
模型输出必须严格 JSON，但实际 LLM 经常输出 markdown 围栏、缺字段、字段类型错误、字段值越界。后端必须先做校验，再交给 RuleResolver。任何字段缺失或越界要么 fallback 默认值，要么报错丢弃整次输出。

【共用规则（强制遵守）】
1. 这是《外交风云》AI Diplomacy 后端。
2. 前端会并行开发，最终通过协议接入。
3. 当前任务只做后端，不写前端。
4. 不启动开发服务器。
5. 不调用真实 LLM。
6. 不连接真实数据库。
7. 不启动 Docker。
8. 游戏过程中只记录玩家消息和行动。
9. 只有结算阶段才允许通过抽象 LLM client 调用模型。
10. MVP 阶段不要重点实现 prompt injection 防护。
11. 所有模块要可测试。
12. 业务逻辑不要写在 API 路由或 WebSocket handler 里。
13. mock / in-memory 实现必须可以未来替换。
14. 代码结构必须清晰，避免单文件巨石。
15. 输出时先说明计划，再列出修改文件，最后说明验证方式。

【技术栈】
Python 3.11+ + Pydantic v2 严格模式。本任务只 import app.domain.* 与标准库。

【本任务允许做以下事情】

1. 在 app/llm/output_schema.py 定义 Pydantic v2 models：

   - AIReaction(BaseModel)：faction_id: FactionId / emotion: str / target_faction: FactionId | None。
   - RelationshipDelta(BaseModel)：from_faction: FactionId / to_faction: FactionId / delta: float (-30~30) / reason: str。
   - TreatyDecision(BaseModel)：treaty_id: str / accepted: bool / reason: str / counter_proposal: str | None。
   - MilitaryJudgement(BaseModel)：region_id: str / attacker: FactionId | None / defender: FactionId | None / legitimacy: Literal["just","neutral","unjust"] / narrative: str。
   - CultureImpact(BaseModel)：faction_id: FactionId / delta: float (-20~20) / reason: str。
   - MoraleImpact(BaseModel)：faction_id: FactionId / delta: float (-0.2~0.2) / reason: str。
   - NarrativeEvent(BaseModel)：kind: Literal["betrayal","alliance","declare_war","intel_leak","golden_age","civil_unrest","custom"] / actor: FactionId | None / target: FactionId | None / narration: str。
   - MapChangeSuggestion(BaseModel)：region_id: str / new_owner: FactionId | None / reason: str。
   - StatChangeSuggestion(BaseModel)：faction_id: FactionId / military_delta: float (-15~15) = 0 / economy_delta: float (-15~15) = 0 / diplomacy_delta: float (-15~15) = 0 / culture_delta: float (-15~15) = 0 / morale_delta: float (-0.1~0.1) = 0。
   - AISpeechItem(BaseModel)：faction_id: FactionId / kind: Literal["public","private","reaction","narration"] / content: str (1~400) / target_faction: FactionId | None。

   - SettlementModelOutput(BaseModel)：
     - relationship_deltas: list[RelationshipDelta] = []
     - ai_speeches: list[AISpeechItem] = []
     - treaty_decisions: list[TreatyDecision] = []
     - military_judgements: list[MilitaryJudgement] = []
     - culture_impacts: list[CultureImpact] = []
     - morale_impacts: list[MoraleImpact] = []
     - narrative_events: list[NarrativeEvent] = []
     - map_change_suggestions: list[MapChangeSuggestion] = []
     - stat_change_suggestions: list[StatChangeSuggestion] = []
     - model_config = ConfigDict(strict=False, extra="ignore")  # 忽略未知字段，避免轻微差异炸掉

2. 在 app/llm/output_parser.py 实现：

   - def strip_markdown_fences(text: str) -> str：去除 ```json ... ``` / ``` ... ``` 围栏。
   - def coerce_to_dict(text: str) -> dict[str, Any]：先 strip_markdown_fences，再 json.loads；失败时尝试以 { 开始 } 结束的子串。
   - def fallback_output() -> SettlementModelOutput：返回所有列表为空的安全默认对象，附加一条 NarrativeEvent {kind:"custom", narration:"裁决系统暂未响应，本回合按规则继续。"}。

   - 类 ModelOutputParser：
     - def parse(self, llm_text: str) -> SettlementModelOutput：
       - 调 strip_markdown_fences → coerce_to_dict → SettlementModelOutput.model_validate(d)。
       - 任何阶段失败：记录 warning 日志（通过 app.core.logging）+ 返回 fallback_output()。
     - def parse_strict(self, llm_text: str) -> SettlementModelOutput：
       - 同上但失败直接 raise ModelOutputError（在 app.core.errors 新增）。
       - 用于测试 / 调试。

3. 在 app/core/errors.py 新增 ModelOutputError。

4. 在 app/tests/test_output_parser.py 编写测试覆盖以下用例：
   - 标准合规 JSON 解析成功。
   - 带 ```json 围栏的 JSON 解析成功。
   - 带 ``` 围栏的 JSON 解析成功。
   - JSON 前后含多余文本（如 "Here's the result:\n{...}\nThanks"）解析成功。
   - 非法 JSON / 缺括号：parse 返回 fallback_output；parse_strict 抛 ModelOutputError。
   - 缺整个字段（如缺 relationship_deltas）：Pydantic 默认空列表，解析成功。
   - relationship_deltas 中 delta=999（越界）：单条被 ValidationError 拒绝；parse 返回 fallback；parse_strict 抛错。
   - 含 extra 字段：被忽略，不影响解析。
   - AISpeechItem.content > 400 字符：触发 ValidationError；parse 返回 fallback。
   - fallback_output 的 NarrativeEvent.narration 非空。

【禁止做的事】
- 不要相信模型输出直接修改 game state（本任务只负责校验 + 解析）。
- 不要跳过 schema 校验。
- 不要做复杂安全审计（MVP 不重点）。
- 不要启动服务。
- 不要调用真实 LLM 验证。
- 不要把 parser 与 prompt builder 耦合（仅依赖 LLMResponse.content 字符串）。
- 不要在 fallback 中产出复杂叙事（一条 NarrativeEvent 即可）。
- 不要省略 strict / loose 两种解析入口。

【验收标准】
1. SettlementModelOutput 与 OUTPUT_JSON_SCHEMA_HINT 字段一致。
2. 字段约束（delta 范围 / morale delta 范围 / content 长度）有效。
3. strip_markdown_fences 处理 ```json 与 ``` 两种围栏。
4. coerce_to_dict 处理前后含多余文本。
5. parse 在错误输入时 fallback；parse_strict 抛错。
6. extra 字段被 ignore。
7. 单条非法子项不影响整体（fallback / 拒绝整次）；测试覆盖。
8. pytest -q app/tests/test_output_parser.py 全部通过。
9. ruff check app/llm 通过。
10. parser 不调用 LLM、不修改 game state、不依赖 protocol。

请按以上规范完成本任务。完成后输出：
（1）实施计划；
（2）创建/修改文件清单；
（3）pytest 验证；
（4）不要启动 uvicorn / docker。
```

### 预期产物

- `app/llm/output_schema.py`（9 个 BaseModel + SettlementModelOutput）。
- `app/llm/output_parser.py`（strip_markdown_fences / coerce_to_dict / fallback_output / ModelOutputParser）。
- `app/core/errors.py` 补 ModelOutputError。
- `app/tests/test_output_parser.py`。

### 验收标准

1. SettlementModelOutput 字段一致。
2. 字段约束生效。
3. 围栏剥除。
4. 多余文本处理。
5. parse fallback / parse_strict 抛错。
6. extra 忽略。
7. 错误用例覆盖。
8. 测试通过。
9. ruff 通过。
10. 不调 LLM / 不改 state。

### 禁止事项

- 禁止相信模型输出直接改 state。
- 禁止跳过 schema 校验。
- 禁止复杂安全审计。
- 禁止启动服务。
- 禁止真实调 LLM。
- 禁止与 prompt builder 耦合。
- 禁止 fallback 复杂叙事。
- 禁止省略 strict 入口。

---

## 任务 14：实现服务端规则裁决 rule resolver

### 使用场景

模型输出只是建议。后端必须用规则引擎对建议进行权威裁决：约束士气范围、关系范围、占领前必须满足兵力 / 持续回合条件、贸易收益按公式计算、战损按公式计算、领土易手按守军 / min_garrison 判定。本任务实现 RuleResolver。

### 可直接复制给 AI 编程工具的完整提示词

```
你是一名资深规则引擎工程师。请为《外交风云》—— 人机混战 AI Diplomacy 后端实现规则裁决器（RuleResolver），把模型建议与后端规则结合，生成最终 SettlementResult 权威结算。

【项目背景】
模型只是建议方，后端是权威方。RuleResolver 接收 SettlementInput + SettlementModelOutput，输出 SettlementResult：
- 关系变化（约束在 [-100, 100]，单次 |delta| ≤ 30）。
- 条约结果（创建 / 拒绝 / 反提议）。
- 军事裁决（含简化版 battle 公式）。
- 文化影响（约束在合理范围）。
- 士气影响（约束 [0.3, 1.8]）。
- 经济变化（按贸易 / 维护 / 战争 / 经济衰竭机制）。
- 地图变化（领土易手必须满足 min_garrison）。
- 边界约束（faction.total_power 由 4 维加权重新计算）。

【共用规则（强制遵守）】
1. 这是《外交风云》AI Diplomacy 后端。
2. 前端会并行开发，最终通过协议接入。
3. 当前任务只做后端，不写前端。
4. 不启动开发服务器。
5. 不调用真实 LLM。
6. 不连接真实数据库。
7. 不启动 Docker。
8. 游戏过程中只记录玩家消息和行动。
9. 只有结算阶段才允许通过抽象 LLM client 调用模型。
10. MVP 阶段不要重点实现 prompt injection 防护。
11. 所有模块要可测试。
12. 业务逻辑不要写在 API 路由或 WebSocket handler 里。
13. mock / in-memory 实现必须可以未来替换。
14. 代码结构必须清晰，避免单文件巨石。
15. 输出时先说明计划，再列出修改文件，最后说明验证方式。

【技术栈】
Python 3.11+ + Pydantic v2。本任务允许 import app.domain.*、app.llm.output_schema、app.game.settlement_aggregator.SettlementInput。

【本任务允许做以下事情】

1. 在 app/game/rule_resolver.py 实现：

   - 类 RuleResolver：
     - __init__(self, *, deterministic_rng_seed: int | None = None)：构造 RNG，便于战斗 ±10% 波动 deterministic。
     - 核心方法：
       def resolve(self, input: SettlementInput, model_output: SettlementModelOutput) -> SettlementResult。

     - 内部分步骤：

     1. apply_relationship_deltas(input, model_output) → list[RelationshipDelta]
        - 接收模型建议，clamp delta 至 [-30, 30]，叠加 input.relationships_snapshot 当前值后 clamp 至 [-100, 100]。
        - 双方向同步（A→B 与 B→A 关系值通常一致；但允许 ±5 不对称）。

     2. resolve_treaties(input, model_output) → list[TreatyDecision]
        - 对每条 treaty_requests，若 model_output.treaty_decisions 有对应项 → 使用；否则按"信任值 + interest_alignment - 利益冲突"近似决定（trust_base 等取自 FACTION_META.personality）。
        - accepted=True 时创建 Treaty 对象写入 result.created_treaties。

     3. resolve_military_orders(input, model_output) → list[BattleResultRecord]
        - 对每条 military_order(movement=attack)：
          - 调用 _compute_battle(attacker, defender, region, input)。
        - movement=move/defend：仅记录调动事件，不发生战斗。

     4. _compute_battle(attacker_faction, defender_faction, region, input) → BattleResultRecord
        - 严格按设计文档简化版：
          - atk_power = attacker.military * attacker.morale
          - def_power = defender.military * defender.morale * 1.3（防御加成）
          - terrain modifier（mountain 防+40 攻-20 / plains 1.0 / river 攻-20 / fortress 防+60 攻-30 / desert 双方-10）
          - 多线作战惩罚（attacker 当前活跃战争数：1→1.0；2→0.85；3→0.65；4+→0.45）
          - atk_ratio = atk_power / (atk_power + def_power)
          - 随机 ±10%（用 RuleResolver.rng）
          - clamp [0.1, 0.9]
          - atk_loss = attacker.military * (1 - atk_ratio) * 0.3
          - def_loss = defender.military * atk_ratio * 0.3
          - territory_captured = def_remaining_in_region < region.min_garrison（按估算）
          - morale_shift = (atk_ratio - 0.5) * 0.2

     5. apply_culture_impact(input, model_output) → list[FactionStatChange]
     6. apply_morale_impact(input, model_output) → list[FactionStatChange]
        - 士气 clamp [0.3, 1.8]。
     7. apply_economy_changes(input, model_output) → list[FactionStatChange]
        - 应用贸易收益 / 维护成本 / 战争消耗 / 多线作战累积，按设计文档"经济衰竭机制"判断 net_income < 0 累计 3 回合 → 进入 crisis 标记。
     8. apply_map_changes(input, model_output, battle_results) → list[RegionChange]
        - 只接受 territory_captured=True 或模型 map_change_suggestions 且 attacker.military_in_region > defender.military_in_region * 1.2 的情形。
     9. enforce_bounds(stats: list[FactionStatChange]) → 限制 military/economy/diplomacy/culture ≥ 0；morale ∈ [0.3, 1.8]；total_power 重新计算。
     10. assemble_settlement_result(input, all_step_outputs) → SettlementResult。

   - 工具结构：
     - BattleResultRecord(BaseModel)：attacker / defender / region_id / atk_loss / def_loss / territory_captured / morale_shift / narrative。

2. 提供常量 TERRAIN_MODIFIERS、WAR_PENALTY_TABLE 在同模块。

3. 在 app/tests/test_rule_resolver.py 编写测试：
   - relationship delta 越界被 clamp 到 ±30。
   - 关系叠加超 100 被 clamp 至 100。
   - 模型未给 treaty_decision 时使用 fallback 决定（不抛错）。
   - 战斗 fortress 地形显著增加防御。
   - 多线作战惩罚（attacker active_wars=3 → 战力 ×0.65）。
   - territory_captured 需满足 defender_remaining < min_garrison。
   - morale clamp [0.3, 1.8]。
   - economy_changes 持续 3 回合 net_income<0 标记 crisis。
   - assemble_settlement_result 返回完整 SettlementResult。
   - deterministic_rng_seed 同 seed 两次 resolve 结果一致。

【禁止做的事】
- 不要实现过度复杂的完整平衡系统（MVP 用简化公式）。
- 不要实时调用模型（本任务只消费 SettlementModelOutput）。
- 不要让模型直接修改 game state；必须经 RuleResolver。
- 不要启动服务。
- 不要把规则常量散落到多个文件（集中在 rule_resolver.py 顶部）。
- 不要省略 clamp / bounds 校验。
- 不要省略多线作战惩罚。
- 不要让 RuleResolver 写仓储（仅返回 SettlementResult，由 SettlementService 写仓储）。

【验收标准】
1. RuleResolver.resolve(input, model_output) → SettlementResult。
2. 关系 / 士气 / 数值 clamp 正确。
3. 战斗公式按简化设计实现。
4. 地形 / 多线作战 / 防御加成生效。
5. 领土易手需满足 min_garrison。
6. 经济衰竭 3 回合标记 crisis。
7. 同 seed 同输入两次结果一致。
8. pytest -q app/tests/test_rule_resolver.py 全部通过。
9. RuleResolver 不写仓储。
10. RuleResolver 不调 LLM、不依赖 protocol / api。

请按以上规范完成本任务。完成后输出：
（1）实施计划；
（2）创建/修改文件清单；
（3）pytest 验证；
（4）不要启动 uvicorn / docker。
```

### 预期产物

- `app/game/rule_resolver.py`（RuleResolver + BattleResultRecord + TERRAIN_MODIFIERS + WAR_PENALTY_TABLE）。
- `app/tests/test_rule_resolver.py`。

### 验收标准

1. resolve 完整。
2. clamp 正确。
3. 战斗公式简化版。
4. 地形 / 多线 / 防御加成。
5. 领土易手条件。
6. 经济衰竭。
7. deterministic。
8. 测试通过。
9. 不写仓储。
10. 不调 LLM / 不依赖 protocol / api。

### 禁止事项

- 禁止过度复杂平衡。
- 禁止实时调模型。
- 禁止让模型直改 state。
- 禁止启动服务。
- 禁止规则常量散落。
- 禁止省略 clamp。
- 禁止省略多线惩罚。
- 禁止在 resolver 内写仓储。

---

## 任务 15：实现结算服务 settlement service

### 使用场景

聚合器 / prompt builder / LLM client / parser / rule resolver 都就绪后，需要一个总控服务串联完整流水线。SettlementService 负责：构造输入 → 构造 prompt → 调用 mock LLM → 解析输出 → 应用规则裁决 → 持久化结算结果 → 生成 outbound resolve.events / map_diff / stats_diff。

### 可直接复制给 AI 编程工具的完整提示词

```
你是一名资深结算流水线工程师。请为《外交风云》—— 人机混战 AI Diplomacy 后端实现结算服务（SettlementService），串联 SettlementAggregator → PromptBuilder → LLMClient → ModelOutputParser → RuleResolver，完成一次回合结算，并生成 outbound 协议事件。

【项目背景】
这是唯一允许调用 LLM 的主流程之一，且仅在结算阶段触发。SettlementService 由 PhaseService 在进入 resolve 阶段时通过 on_settlement_required 回调触发。

【共用规则（强制遵守）】
1. 这是《外交风云》AI Diplomacy 后端。
2. 前端会并行开发，最终通过协议接入。
3. 当前任务只做后端，不写前端。
4. 不启动开发服务器。
5. 不调用真实 LLM。
6. 不连接真实数据库。
7. 不启动 Docker。
8. 游戏过程中只记录玩家消息和行动。
9. 只有结算阶段才允许通过抽象 LLM client 调用模型。
10. MVP 阶段不要重点实现 prompt injection 防护。
11. 所有模块要可测试。
12. 业务逻辑不要写在 API 路由或 WebSocket handler 里。
13. mock / in-memory 实现必须可以未来替换。
14. 代码结构必须清晰，避免单文件巨石。
15. 输出时先说明计划，再列出修改文件，最后说明验证方式。

【技术栈】
Python 3.11+ + asyncio + Pydantic v2。本任务可 import app.game.*、app.llm.*、app.repositories.*、app.domain.*；禁止 import app.api.* / app.protocol.*（生成 outbound dict 即可，protocol 层在任务 17 包装成 envelope）。

【本任务允许做以下事情】

1. 在 app/services/settlement_service.py 实现 SettlementService：
   - 构造 __init__(self, *, repos: Repositories, clock: Clock, aggregator: SettlementAggregator, prompt_builder: PromptBuilder, llm_client: LLMClient, parser: ModelOutputParser, rule_resolver: RuleResolver)。

   - 方法（全部 async）：

   - async def run_turn_settlement(self, room_id: str, epoch: int, turn: int) -> SettlementOutboundBundle：
     1. settlement_input = await aggregator.aggregate(room_id, epoch, turn)。
     2. prompt = prompt_builder.build_settlement_prompt(settlement_input)。
     3. llm_request = LLMRequest(system=prompt.system, user=prompt.user, temperature=prompt.temperature, max_tokens=prompt.max_tokens, metadata={"room_id": room_id, "epoch": epoch, "turn": turn})。
     4. llm_response = await call_with_retry(self.llm_client, llm_request, max_retries=1)。
     5. model_output = parser.parse(llm_response.content)。
     6. settlement_result = rule_resolver.resolve(settlement_input, model_output)。
     7. 持久化 settlement_result（SettlementRepository.save）。
     8. 应用 settlement_result 到 GameStateRepository（更新 factions / relationships / regions / treaties）。
     9. 生成 outbound bundle（详见步骤 11）。
     10. 写入 EventLogRepository（resolve 阶段产出的所有 narrative + battle + ai_speeches 都成为 GameEvent）。

   - async def run_epoch_settlement(self, room_id: str, epoch: int) -> SettlementOutboundBundle（占位）：
     - 类似 run_turn_settlement，但 input 由 aggregator.aggregate_epoch_summary 提供，写入 ReplayRepository 一些纪元摘要。
     - 本任务可保留 raise NotImplementedError 或简化实现：仅生成 narrative events 不变更 state。

2. 在同模块定义：
   - SettlementOutboundBundle(BaseModel)：
     - resolve_events: list[dict[str, Any]]    # 待包装为 resolve.events envelope 的 payload
     - resolve_map_diff: dict[str, Any]        # changes + border_updates
     - resolve_stats_diff: dict[str, Any]      # faction_stats + relationship_changes
     - ai_speech_events: list[dict[str, Any]]  # 待包装为 ai.speak envelopes
     - room_id / epoch / turn / generated_at_ms / seq_base: int

   - 内部工具：
     - def _build_resolve_events(result, input) -> list[dict]
     - def _build_map_diff(result, input) -> dict
     - def _build_stats_diff(result, input) -> dict
     - def _build_ai_speech_events(result, input) -> list[dict]
     - 这些函数返回纯 dict（兼容前端 mock GameEvent 结构），不依赖 protocol 类。

3. 异常处理：
   - LLM 失败 → parser.parse 已 fallback；不重抛。
   - 仓储失败 → 抛 DiplomacyError；上层 PhaseService 决定是否回滚 phase（本任务不实现回滚，仅记录 error 日志）。

4. 日志：通过 app.core.logging 在每步骤打 info（含 room_id / epoch / turn / step）。

5. 在 app/tests/test_settlement_service.py 编写测试：
   - 构造完整 fixture：room / players / actions（speech + private + treaty + military + intel）。
   - 注入 MockLLMClient 并设置 deterministic output。
   - 调用 run_turn_settlement 后：
     - SettlementResult 写入 SettlementRepository。
     - GameStateRepository.factions / relationships / regions 被更新（与 result 一致）。
     - 返回的 SettlementOutboundBundle.resolve_events / map_diff / stats_diff 字段齐全。
     - EventLogRepository 增加了对应 narrative / ai_speak GameEvent。
   - 注入抛错的 LLMClient：parser 仍能 fallback；流水线不崩溃，返回带 fallback narrative 的 bundle。
   - 同 seed 同输入同 mock 输出两次 run_turn_settlement 结果一致。

【禁止做的事】
- 不要在行动期调用本服务（仅在 resolve 阶段触发）。
- 不要接真实 API。
- 不要启动服务。
- 不要把所有逻辑写在一个大函数里（必须分步函数）。
- 不要让 SettlementService 拼装 protocol envelope（envelope 在任务 17 由 gateway 包装；本任务只返回 dict 字段）。
- 不要省略持久化（SettlementResult 必须写入 SettlementRepository）。
- 不要让 SettlementService 跳过 GameStateRepository 更新。
- 不要在 SettlementService 中重新计算战斗（必须委托 RuleResolver）。

【验收标准】
1. SettlementService.run_turn_settlement 完整串联 6 步。
2. SettlementOutboundBundle 字段齐全。
3. GameStateRepository 在结算后被更新。
4. SettlementRepository 写入 result。
5. EventLogRepository 写入对应 GameEvent。
6. LLM 失败时 fallback 仍能产出 bundle。
7. 同 seed 同 mock 输出 deterministic。
8. pytest -q app/tests/test_settlement_service.py 全部通过。
9. SettlementService 不依赖 protocol / api。
10. 仅在 resolve 阶段触发（通过 PhaseService 回调）。

请按以上规范完成本任务。完成后输出：
（1）实施计划；
（2）创建/修改文件清单；
（3）pytest 验证；
（4）不要启动 uvicorn / docker；
（5）确认行动期不触发本服务。
```

### 预期产物

- `app/services/settlement_service.py`（SettlementService + SettlementOutboundBundle + _build_* 工具）。
- `app/tests/test_settlement_service.py`。

### 验收标准

1. 完整 6 步串联。
2. Bundle 字段齐全。
3. GameStateRepository 更新。
4. SettlementRepository 写入。
5. EventLog 写入。
6. LLM 失败 fallback 不崩。
7. deterministic。
8. 测试通过。
9. 不依赖 protocol / api。
10. 仅 resolve 阶段触发。

### 禁止事项

- 禁止行动期调用。
- 禁止接真实 API。
- 禁止启动服务。
- 禁止单函数巨石。
- 禁止拼装 protocol envelope。
- 禁止省略持久化。
- 禁止跳过 GameStateRepository 更新。
- 禁止在 SettlementService 内重算战斗。

---

## 任务 16：实现 AI 势力行动生成占位

### 使用场景

结算输出的 ai_speeches 是 AI 势力公开发言 / 密谈 / 反应 / 旁白。本任务在结算阶段或博弈期生成 AI 势力的行动与发言，写入 message log 与 event log，生成 ai.speak / ai.reaction outbound 事件。AI 不在行动期实时调用模型，全部基于结算 output 或本地模板。

### 可直接复制给 AI 编程工具的完整提示词

```
你是一名资深 AI 行为输出工程师。请为《外交风云》—— 人机混战 AI Diplomacy 后端实现 AI 势力行动与发言生成服务（AIOutputService），把 SettlementModelOutput 中的 ai_speeches 转化为正式 GameEvent 与 MessageRecord，并提供基于本地模板的 fallback 生成器。

【项目背景】
游戏过程中 AI 不实时调用 LLM。AI 的行为有两个来源：
1. SettlementModelOutput.ai_speeches（结算阶段一次性产出）。
2. 本地模板（fallback：模型输出缺失或字段不完整时）。

【共用规则（强制遵守）】
1. 这是《外交风云》AI Diplomacy 后端。
2. 前端会并行开发，最终通过协议接入。
3. 当前任务只做后端，不写前端。
4. 不启动开发服务器。
5. 不调用真实 LLM。
6. 不连接真实数据库。
7. 不启动 Docker。
8. 游戏过程中只记录玩家消息和行动。
9. 只有结算阶段才允许通过抽象 LLM client 调用模型。
10. MVP 阶段不要重点实现 prompt injection 防护。
11. 所有模块要可测试。
12. 业务逻辑不要写在 API 路由或 WebSocket handler 里。
13. mock / in-memory 实现必须可以未来替换。
14. 代码结构必须清晰，避免单文件巨石。
15. 输出时先说明计划，再列出修改文件，最后说明验证方式。

【技术栈】
Python 3.11+ + asyncio + Pydantic v2 + random.Random（deterministic）。

【八势力本地发言模板（强制每势力 ≥ 6 条，必须体现性格）】
- 铁冠帝国 commanding_imperial：例如"这片大陆只需要一个主人。"、"铁冠的意志不容质疑。"
- 星辉联邦 analytical_diplomatic：例如"根据数据，合作收益高出 47%。"
- 翡翠王庭 charming_mercantile：例如"朋友，何必刀兵相见？"、"在翡翠王庭，没有敌人，只有还没成交的客户。"
- 灰烬部族 passionate_warrior：例如"用战斗来证明！"
- 虚空教廷 mystical_prophetic：例如"虚空已经预见了你的命运。"
- 极光共和 academic_neutral：例如"我们的研究表明，和平环境下技术进步 3.7 倍。"
- 熔岩议会 gruff_pragmatic：例如"少废话。"
- 暗潮商会 smooth_conspiratorial：例如"我听说了一些...有趣的事情。"

【本任务允许做以下事情】

1. 在 app/services/ai_output_service.py 实现 AIOutputService：
   - 构造 __init__(self, *, repos, clock, rng_seed: int | None = None)。
   - 方法（全部 async）：

   - async def generate_ai_reactions_from_settlement(room_id, epoch, turn, model_output: SettlementModelOutput) -> AIOutputBundle：
     - 遍历 model_output.ai_speeches，按 kind 分类：
       - public → 生成 GameEvent kind=speech，actor=faction_id，visibility=public。
       - private → 生成 GameEvent kind=private + MessageRecord，visibility=faction_pair。
       - reaction → 生成 GameEvent kind=ai_reaction，visibility=public（reaction 是轻量）。
       - narration → 生成 GameEvent kind=narration，visibility=public，actor=None。
     - 若 model_output.ai_speeches 为空，调用 fallback_generate(input.factions_snapshot, recent_events) 产出 1~3 条模板化发言。
     - 写入 EventLogRepository / MessageLogRepository。
     - 返回 AIOutputBundle 含 ai_speak_events / ai_reaction_events 两类 dict 列表（待 gateway 包装）。

   - async def generate_ai_public_speech(room_id, faction_id, *, context_hint: str = "") -> dict
   - async def generate_ai_private_messages(room_id, faction_id, target_factions, *, context_hint: str = "") -> list[dict]
     - 仅基于本地模板 + 随机变体；不调 LLM。
     - 写入 message log（private）。

2. 在 app/services/ai_templates.py 提供 AI_SPEECH_TEMPLATES / AI_REACTION_TEMPLATES / AI_PRIVATE_TEMPLATES / SYSTEM_NARRATION_TEMPLATES（按八势力 + 通用旁白）：
   - 数据结构：dict[FactionId, list[str]] for speech / reaction / private。
   - SYSTEM_NARRATION_TEMPLATES: list[str]，含"纪元 III 终结。XX 帝国陨落，新的格局开始形成。" 等格式化模板（带 {epoch} / {faction} 占位符）。

3. 在 app/services/ai_output_service.py 提供 fallback_generate(factions_snapshot, recent_events, *, rng) -> list[dict]：
   - 按 recent_events 中冲突 / 合作占比，随机挑选模板 + 替换占位符。
   - 不调 LLM；deterministic with rng。

4. AIOutputBundle(BaseModel)：
   - ai_speak_events: list[dict]
   - ai_reaction_events: list[dict]
   - private_message_events: list[dict]
   - narration_events: list[dict]
   - room_id / epoch / turn / generated_at_ms。

5. 在 app/services/settlement_service.py 内部调用 AIOutputService：在步骤 9（生成 outbound bundle）之前 / 之中调用 generate_ai_reactions_from_settlement，把结果合并到 SettlementOutboundBundle.ai_speech_events / resolve_events。

6. 在 app/tests/test_ai_output_service.py 编写测试：
   - 给 model_output.ai_speeches 提供 3 条 public/private/reaction → 写入 EventLog 与 MessageLog 数量正确。
   - 空 ai_speeches → fallback_generate 产出 ≥ 1 条 模板化发言。
   - private 同时写入 MessageLog（list_private_between 可以检索）。
   - generate_ai_public_speech 不调 LLM（mock patch app.llm 不被触发）。
   - 同 rng_seed 同输入两次结果一致。
   - 模板覆盖八势力 ≥ 6 条。

【禁止做的事】
- 不要为每个 AI 单独实时调用 LLM。
- 不要做复杂 Agent 记忆系统（MVP 用模板）。
- 不要启动服务。
- 不要接真实 LLM。
- 不要在行动期触发本服务（仅在结算阶段触发）。
- 不要让 AI 发言绕过 EventLog / MessageLog（必须经仓储）。
- 不要硬编码势力色到模板（颜色由前端处理）。
- 不要省略 SYSTEM_NARRATION_TEMPLATES。

【验收标准】
1. AIOutputService 三个生成方法实现。
2. 八势力模板 ≥ 6 条。
3. ai_speeches 写入 EventLog + MessageLog 正确数量。
4. fallback 在空输入时产出 ≥ 1 条。
5. private 写入 MessageLog 可被检索。
6. AIOutputBundle 字段齐全。
7. SettlementService 集成 AIOutputService。
8. pytest -q app/tests/test_ai_output_service.py 全部通过。
9. 不调用 LLM。
10. deterministic with rng。

请按以上规范完成本任务。完成后输出：
（1）实施计划；
（2）创建/修改文件清单；
（3）pytest 验证；
（4）不要启动 uvicorn / docker；
（5）确认 AI 发言不实时调 LLM。
```

### 预期产物

- `app/services/ai_output_service.py`（AIOutputService + fallback_generate + AIOutputBundle）。
- `app/services/ai_templates.py`（八势力模板）。
- `app/services/settlement_service.py` 集成调用。
- `app/tests/test_ai_output_service.py`。

### 验收标准

1. 三方法实现。
2. 八势力模板 ≥ 6。
3. 写入 EventLog / MessageLog 正确。
4. fallback ≥ 1。
5. private 可检索。
6. Bundle 完整。
7. 集成 SettlementService。
8. 测试通过。
9. 不调 LLM。
10. deterministic。

### 禁止事项

- 禁止每 AI 实时调 LLM。
- 禁止复杂 Agent 记忆。
- 禁止启动服务。
- 禁止接真实 LLM。
- 禁止行动期触发。
- 禁止绕过 EventLog / MessageLog。
- 禁止硬编码势力色。
- 禁止省略旁白模板。

---

## 任务 17：实现 WebSocket gateway 协议层占位

### 使用场景

ActionService / PhaseService / SettlementService 已就绪，需要一个 WebSocket Gateway 把入站消息路由到 service、把出站事件推送给玩家。本任务实现 gateway 代码结构 + connection manager + room subscription + inbound router + outbound dispatcher + ack/error + reconnect snapshot 占位，**不启动 uvicorn**。

### 可直接复制给 AI 编程工具的完整提示词

```
你是一名资深实时通信工程师。请为《外交风云》—— 人机混战 AI Diplomacy 后端实现 WebSocket Gateway 的代码结构（不启动服务），包括 connection manager、room subscription、inbound router、outbound dispatcher、ack/error 处理、reconnect snapshot 占位。

【项目背景】
Gateway 是协议层的执行者：接收 Envelope，校验，路由到对应 Service；接收 outbound 事件，根据 visibility 推送给可见玩家。本任务不真实启动 WebSocket，但所有路由器与 dispatcher 必须可以通过单元测试直接调用。

【共用规则（强制遵守）】
1. 这是《外交风云》AI Diplomacy 后端。
2. 前端会并行开发，最终通过协议接入。
3. 当前任务只做后端，不写前端。
4. 不启动开发服务器。
5. 不调用真实 LLM。
6. 不连接真实数据库。
7. 不启动 Docker。
8. 游戏过程中只记录玩家消息和行动。
9. 只有结算阶段才允许通过抽象 LLM client 调用模型。
10. MVP 阶段不要重点实现 prompt injection 防护。
11. 所有模块要可测试。
12. 业务逻辑不要写在 API 路由或 WebSocket handler 里。
13. mock / in-memory 实现必须可以未来替换。
14. 代码结构必须清晰，避免单文件巨石。
15. 输出时先说明计划，再列出修改文件，最后说明验证方式。

【技术栈】
Python 3.11+ + FastAPI（仅装配 router，不启动）+ asyncio + Pydantic v2。

【本任务允许做以下事情】

1. 在 app/api/websocket/connection.py 实现：
   - PlayerSession(BaseModel)：player_id / room_id | None / last_seq: int / connected_at_ms / connected: bool / websocket: Any（运行期为 WebSocket 实例，测试中可为 FakeSocket）。
   - ConnectionManager：
     - __init__(self)：内部维护 dict[str, PlayerSession] 与 dict[str (room_id), set[str (player_id)]]。
     - async def register(player_id, websocket) -> PlayerSession
     - async def unregister(player_id)
     - async def attach_to_room(player_id, room_id)
     - async def detach_from_room(player_id)
     - async def get_room_subscribers(room_id) -> list[PlayerSession]
     - async def get_session(player_id) -> PlayerSession | None
     - 不真实操作 WebSocket（可在测试中提供 FakeSocket：async def send_text(self, text) → 记录消息）。

2. 在 app/api/websocket/router.py 实现 InboundRouter：
   - 构造 __init__(self, *, room_service, action_service, phase_service, settlement_service, repos, clock)。
   - async def handle_raw(self, player_id, raw: dict) -> dict | None：
     - parse_incoming(raw) → Envelope。
     - 按 envelope.t 路由：
       - "conn.auth" → 返回 conn.auth.ok（MVP 不做真实鉴权，仅记录 token）。
       - "conn.ping" → 返回 conn.pong。
       - "room.create" → room_service.create_room。
       - "room.join" → room_service.join_room。
       - "room.leave" → room_service.leave_room。
       - "room.select_faction" → room_service.select_faction。
       - "room.ready" → room_service.set_ready。
       - "action.speak" → action_service.record_speech。
       - "action.private" → action_service.record_private_message。
       - "action.treaty" → action_service.record_treaty_request。
       - "action.military" → action_service.record_military_order。
       - "action.intel" → action_service.record_intel_action。
       - "action.lock" → action_service.record_lock_action + phase_service.maybe_advance_by_lock。
       - "reconnect.request" → 调用 _build_reconnect_payload。
     - 异常处理：捕获 DiplomacyError，返回 action.rejected envelope 含 error_code 与 reason。
     - 返回单条 outbound envelope dict（供 dispatcher 推送）。

3. 在 app/api/websocket/dispatcher.py 实现 OutboundDispatcher：
   - 构造 __init__(self, connection_manager, repos)。
   - async def dispatch_to_player(player_id, envelope_dict)：通过 ConnectionManager 找 session → session.websocket.send_text(json.dumps(envelope_dict))。
   - async def dispatch_to_room(room_id, envelope_dict, *, visibility_filter: Callable | None)：遍历 room subscribers，按 visibility_filter 过滤后逐一发送。
   - async def dispatch_phase_change(room_id, phase_change_payload)：广播给房间所有人。
   - async def dispatch_resolve_bundle(room_id, bundle: SettlementOutboundBundle)：
     - 把 bundle.resolve_events / map_diff / stats_diff / ai_speech_events 包装为对应 envelope 后按可见性推送。

4. 在 app/api/websocket/gateway.py 实现 GameWebSocketGateway：
   - 注册 FastAPI router：@router.websocket("/ws"), async def endpoint(websocket: WebSocket)。
   - endpoint 内仅做：accept / register / loop receive_text → router.handle_raw → dispatcher / on disconnect → unregister。
   - 业务逻辑不在 endpoint 内。

5. 在 app/api/websocket/__init__.py re-export。
6. 在 app/main.py include websocket router。

7. 在 app/api/websocket/router.py 内 def _build_reconnect_payload(player_id, last_seq) -> dict（占位实现：
   - 通过 EventLogRepository.list_visible_to_faction(...) 拉取自 last_seq 起的事件。
   - 数量 ≤ 50：返回 reconnect.catchup envelope 含 messages 列表。
   - 数量 > 50：返回 reconnect.snapshot envelope 含 full_state（factions / regions / relationships / current_turn 快照）。

8. 在 app/tests/test_gateway_router.py 编写测试：
   - FakeSocket 类记录 send_text 调用。
   - ConnectionManager register / unregister / attach_to_room / get_room_subscribers 工作。
   - InboundRouter.handle_raw 对 conn.ping 返回 conn.pong。
   - room.create → room.created envelope。
   - action.speak（在 phase=action 的房间）→ action.broadcast envelope。
   - action.speak（在 phase=observe）→ action.rejected envelope。
   - action.lock 全员后触发 phase 推进至 resolve。
   - reconnect.request last_seq=0 且 events ≤ 50 → reconnect.catchup。
   - 整个测试不启动 uvicorn，所有路由通过直接调用 router.handle_raw。

【禁止做的事】
- 不要启动 uvicorn / fastapi dev。
- 不要写复杂鉴权（仅记录 token，不验证签名）。
- 不要真实部署。
- 不要把业务逻辑写在 gateway endpoint 内（必须经 router → service）。
- 不要让 dispatcher 调用 service（只负责推送）。
- 不要在 router 内修改仓储（必须经 service）。
- 不要省略 action.rejected 反馈。
- 不要省略 reconnect.snapshot 占位。
- 不要让 ConnectionManager 直接调用 service。

【验收标准】
1. ConnectionManager / InboundRouter / OutboundDispatcher / Gateway 全部存在。
2. router.handle_raw 路由 14 种入站消息正确。
3. 异常被捕获为 action.rejected envelope。
4. dispatcher 按 visibility 推送给可见玩家。
5. reconnect.catchup / snapshot 阈值生效。
6. WebSocket endpoint 仅负责 accept / receive / dispatch / unregister。
7. pytest -q app/tests/test_gateway_router.py 全部通过。
8. 整个测试不启动 uvicorn。
9. 业务逻辑 0 行写在 endpoint。
10. ruff check app/api/websocket 通过。

请按以上规范完成本任务。完成后输出：
（1）实施计划；
（2）创建/修改文件清单；
（3）pytest 验证；
（4）不要启动 uvicorn / docker；
（5）确认 endpoint 内不含业务逻辑。
```

### 预期产物

- `app/api/websocket/{connection.py, router.py, dispatcher.py, gateway.py, __init__.py}`。
- `app/main.py` include websocket router。
- `app/tests/test_gateway_router.py`（FakeSocket + 路由测试）。

### 验收标准

1. Gateway 四组件齐全。
2. 14 入站消息路由正确。
3. action.rejected 异常处理。
4. dispatcher 可见性过滤。
5. reconnect catchup / snapshot 阈值。
6. endpoint 仅 accept / loop / unregister。
7. 测试通过。
8. 不启动 uvicorn。
9. endpoint 内无业务。
10. ruff 通过。

### 禁止事项

- 禁止启动 uvicorn / fastapi dev。
- 禁止复杂鉴权。
- 禁止真实部署。
- 禁止业务逻辑写 endpoint。
- 禁止 dispatcher 调 service。
- 禁止 router 内改仓储。
- 禁止省略 action.rejected。
- 禁止省略 reconnect.snapshot。
- 禁止 ConnectionManager 调 service。

---

## 任务 18：实现 REST 调试接口占位

### 使用场景

后端独立开发时需要 REST 接口便于 Postman / curl 调试，不依赖前端 / WebSocket。本任务实现一组调试 API，所有接口都调用对应 service，绝不绕过。**不启动服务器**，仅注册 router。

### 可直接复制给 AI 编程工具的完整提示词

```
你是一名资深后端 API 工程师。请为《外交风云》—— 人机混战 AI Diplomacy 后端实现 REST 调试接口，方便后端独立开发与单元测试，覆盖创建房间、加入房间、查询房间状态、提交行动、推进阶段、运行结算、查询事件、查询回放。

【项目背景】
WebSocket Gateway 是生产路径，但开发期需要 REST 调试接口。所有 REST 接口都必须调用对应 Service（不写业务逻辑），便于在 pytest 中通过 TestClient 验证完整流程。

【共用规则（强制遵守）】
1. 这是《外交风云》AI Diplomacy 后端。
2. 前端会并行开发，最终通过协议接入。
3. 当前任务只做后端，不写前端。
4. 不启动开发服务器。
5. 不调用真实 LLM。
6. 不连接真实数据库。
7. 不启动 Docker。
8. 游戏过程中只记录玩家消息和行动。
9. 只有结算阶段才允许通过抽象 LLM client 调用模型。
10. MVP 阶段不要重点实现 prompt injection 防护。
11. 所有模块要可测试。
12. 业务逻辑不要写在 API 路由或 WebSocket handler 里。
13. mock / in-memory 实现必须可以未来替换。
14. 代码结构必须清晰，避免单文件巨石。
15. 输出时先说明计划，再列出修改文件，最后说明验证方式。

【技术栈】
Python 3.11+ + FastAPI + Pydantic v2（请求 / 响应 DTO）+ httpx.TestClient（测试）。

【本任务允许做以下事情】

1. 在 app/api/rest/debug.py 注册 router，前缀 `/debug/v1`，所有路由必须：
   - 解析 request DTO（Pydantic BaseModel）。
   - 调用对应 service。
   - 包装 service 返回值为 response DTO。

   路由列表：

   - POST `/debug/v1/rooms`（CreateRoomRequest{mode, host_display_name, seed?}）→ room_service.create_room → CreateRoomResponse{room: dict, host: dict}。
   - POST `/debug/v1/rooms/{room_id}/join`（JoinRoomRequest{display_name}）→ room_service.join_room → JoinRoomResponse{room, player}。
   - POST `/debug/v1/rooms/{room_id}/leave`（LeaveRoomRequest{player_id}）→ room_service.leave_room。
   - POST `/debug/v1/rooms/{room_id}/select-faction`（SelectFactionRequest{player_id, faction_id}）→ room_service.select_faction。
   - POST `/debug/v1/rooms/{room_id}/ready`（ReadyRequest{player_id, ready}）→ room_service.set_ready。
   - POST `/debug/v1/rooms/{room_id}/start`（StartRequest{player_id}）→ room_service.start_game。
   - GET `/debug/v1/rooms/{room_id}` → RoomStateResponse{room, factions, regions, relationships, current_turn}。
   - POST `/debug/v1/rooms/{room_id}/actions/speak`（SpeakRequest{player_id, content, targets, request_id?}）→ action_service.record_speech。
   - POST `/debug/v1/rooms/{room_id}/actions/private` → action_service.record_private_message。
   - POST `/debug/v1/rooms/{room_id}/actions/treaty` → action_service.record_treaty_request。
   - POST `/debug/v1/rooms/{room_id}/actions/military` → action_service.record_military_order。
   - POST `/debug/v1/rooms/{room_id}/actions/intel` → action_service.record_intel_action。
   - POST `/debug/v1/rooms/{room_id}/actions/lock`（LockRequest{player_id}）→ action_service.record_lock_action。
   - POST `/debug/v1/rooms/{room_id}/phase/advance` → phase_service.advance_phase。
   - POST `/debug/v1/rooms/{room_id}/phase/force`（ForcePhaseRequest{phase, arbitrate_phase?}）→ phase_service.force_phase（仅 debug）。
   - POST `/debug/v1/rooms/{room_id}/settlement/run`（RunSettlementRequest{epoch, turn}）→ settlement_service.run_turn_settlement → SettlementOutboundBundle dict。
   - GET `/debug/v1/rooms/{room_id}/events?since_ms=0&faction_id=...` → list[GameEvent dict]。
   - GET `/debug/v1/rooms/{room_id}/messages?epoch=&turn=` → list[MessageRecord dict]。
   - GET `/debug/v1/rooms/{room_id}/replay` → replay_service.build_replay（任务 19 实现）→ ReplayResponse。

2. 在 app/api/rest/dto.py 定义所有 Request / Response BaseModel。

3. 在 app/api/rest/deps.py 实现 FastAPI 依赖工厂：
   - get_repositories()
   - get_clock()
   - get_room_service() / get_action_service() / get_phase_service() / get_settlement_service() / get_replay_service()
   - 这些依赖在测试中可被覆盖。

4. 在 app/main.py include `/debug/v1` router。

5. 异常处理：
   - 注册 FastAPI exception handler 把 DiplomacyError 转为 400 / 404 / 409 JSON 响应（含 error_code）。
   - RoomNotFoundError → 404。
   - FactionAlreadyTakenError → 409。
   - InvalidPhaseError / InvalidActionError / RateLimitedError → 400。
   - 未知异常 → 500 含 error_code "internal"。

6. 在 app/tests/test_rest_debug.py 用 httpx.TestClient 编写测试：
   - 端到端流程：create room → join → select faction → ready → start → record speech → lock → advance phase → run settlement → list events → get replay。
   - 校验各路由响应状态码与字段。
   - phase != action 时 speak → 400 含 InvalidPhase。
   - 重复 select faction → 409。
   - 房间不存在 → 404。
   - 整个测试不真实启动 uvicorn，仅用 TestClient。

【禁止做的事】
- 不要在路由内写业务逻辑（必须经 service）。
- 不要启动服务。
- 不要写真实登录 / OAuth / JWT 验证（MVP 仅占位）。
- 不要接数据库。
- 不要把路由 DTO 直接用 domain models（须 DTO，但内部字段可来源于 domain enums）。
- 不要把响应直接返回 domain 对象（用 model_dump 或专门 DTO）。
- 不要省略 exception handler。

【验收标准】
1. 18+ 调试路由全部注册。
2. 路由全部调用 service，无业务逻辑写在 endpoint。
3. DTO 完整。
4. 依赖注入工厂可被测试覆盖。
5. exception handler 映射正确 HTTP 状态码。
6. 端到端测试在 TestClient 下通过。
7. 重复势力 / phase 错误 / 房间不存在分别 409/400/404。
8. pytest -q app/tests/test_rest_debug.py 全部通过。
9. ruff check app/api/rest 通过。
10. 不启动 uvicorn。

请按以上规范完成本任务。完成后输出：
（1）实施计划；
（2）创建/修改文件清单；
（3）pytest 验证；
（4）不要启动 uvicorn / docker。
```

### 预期产物

- `app/api/rest/debug.py`（18+ 路由）。
- `app/api/rest/dto.py`（请求 / 响应 DTO）。
- `app/api/rest/deps.py`（依赖工厂）。
- `app/main.py` exception handlers + include router。
- `app/tests/test_rest_debug.py`（TestClient 端到端）。

### 验收标准

1. 18+ 路由注册。
2. 全部走 service。
3. DTO 完整。
4. 依赖工厂可覆盖。
5. 异常映射正确。
6. 端到端通过。
7. 状态码正确（409/400/404）。
8. 测试通过。
9. ruff 通过。
10. 不启动 uvicorn。

### 禁止事项

- 禁止路由内写业务逻辑。
- 禁止启动服务。
- 禁止真实登录。
- 禁止接数据库。
- 禁止 DTO 直接复用 domain model。
- 禁止响应返回 domain 对象。
- 禁止省略 exception handler。

---

