# 《外交风云》球体地图升级 × 战争 VFX 同步开发任务型提示词库

> 项目：《外交风云》— 人机混战 AI Diplomacy
> 版本：v1.0
> 适用阶段：联调任务 1–10、同步完善任务 1–10 已完成。本文档把现有"平面径向雷达" `MapStageR3F` / `MapStage2D` 升级为"月球视角无大气星球"3D 地图，并引入"战争爆炸 VFX + LLM 范围判定"新玩法。
> 用途：每条任务给出**前端子提示词**与**后端子提示词**，分别复制给 AI 编程工具独立执行，但端到端契约严格一致。
> 渲染库决策（覆盖 DESIGN.md 附录D 原决策）：采用 **vanilla `globe.gl`（github.com/vasturiano/globe.gl）** 作为主渲染器，**不采用 `react-globe.gl`**，原因见 §0.6。

---

## 零、总体说明（必读）

### 0.1 阶段定位

| 阶段 | 文档 | 目标 |
|------|------|------|
| 独立开发期 | BACKEND_TASK_PROMPTS.md / FRONTEND_TASK_PROMPTS.md | 各自完成主体实现 |
| 联调期 | INTEGRATION_TASK_PROMPTS.md | 协议握手、连接生命周期 |
| 同步完善期 | SYNC_REFINEMENT_TASK_PROMPTS.md | 替换 mock 为真实形态 |
| **球体地图升级期（本文档）** | GLOBE_MAP_TASK_PROMPTS.md | 平面地图 → 球体；新增"战争 VFX + LLM 范围判定"玩法 |

### 0.2 新玩法一句话定义

> **当 resolve 阶段触发"军事冲突"类事件时，后端在 SettlementService 中调用 LLM 判定"冲击区域"（受影响 region_id 列表 + 半径 + 强度 + 持续回合），下发 `resolve.event.explosion` 与 `resolve.scorched_diff` 事件；前端在 globe 上对应坐标播放粒子爆炸 + 涟漪扩散 + 焦土染色，并在镜头层做"自动 zoom 到事件点 → 2 秒后回到全景"的电影感叙事。**
>
> 美学方向：**从月亮看地球**——无大气散射、星空黑、地球表面光点构成的"全息地球"、爆炸是冷色 + 红橙过渡、焦土是灰黑色斑块。

### 0.3 渲染库变更（覆盖 DESIGN.md 附录D）

| 维度 | DESIGN.md 附录D 原决策 | 本文档新决策 |
|------|---------------------|------------|
| 主渲染 | Three.js 原生 + R3F | **vanilla `globe.gl`** |
| 数据层 | three-globe（手动接入） | 由 `globe.gl` 内置封装 |
| 能量场 shader | 自研 ShaderMaterial | 暂缓，用 `hexPolygonsData` 颜色 + bloom 替代 |
| React 集成 | R3F 声明式 | **命令式：useRef + globe instance + useEffect 生命周期** |
| `react-globe.gl` | 排除 | 仍排除（见 §0.6） |

> 决策变更纪要：DESIGN.md 附录D 的"能量场 SDF shader"需要 3-6 周自研，与 MVP 节奏不匹配；本期改用 globe.gl 内置 hex 多边形 + bloom 后处理 + 自研爆炸粒子系统达到"足够立体"的视觉，把 shader 自研推迟到后续迭代。

### 0.4 文件触碰范围

允许新增：
- 前端 `src/render/MapStageGlobe.tsx`（globe.gl 容器组件，命令式封装）。
- 前端 `src/render/globe/`：`useGlobeInstance.ts`、`buildHexPolygons.ts`、`explosionFx.ts`、`cameraDirector.ts`、`stylePresets.ts`、`globeTypes.ts`。
- 前端 `src/store/mapStore.ts`（地图层独立 store：renderer 模式 / 镜头预设 / 爆炸队列 / 焦土集合）。
- 后端 `app/game/globe_geometry.py`（球面 hex/voronoi 区块生成）。
- 后端 `app/game/explosion_resolver.py`（爆炸事件 → 区域判定）。
- 后端 `app/llm/explosion_prompt.py`（LLM 范围判定 prompt 模板）。
- 后端 `app/services/scorched_service.py`（焦土状态机）。
- 后端 `app/protocol/explosion_events.py`（新增出站事件 schema）。
- 测试：前端 `src/render/globe/__tests__/`、后端 `app/tests/test_globe_geometry.py` / `test_explosion_resolver.py` / `test_scorched_service.py`。

允许修改：
- 前端 `src/render/MapStage2D.tsx`（保留作为 fallback，仅在 mapStore.renderer === '2d' 时挂载）。
- 前端 `src/render/MapStageR3F.tsx`（保留但默认不挂载，可作为 'r3f' 选项调试用）。
- 前端 `src/pages/GamePage.tsx`（中央地图槽位接入三态切换）。
- 前端 `src/protocol/types.ts` / `src/protocol/adapter.ts` / `src/protocol/dispatcher.ts`（新增 explosion / scorched_diff 类型，**前后端同步**）。
- 前端 `src/mock/factions.ts`（如需新增首都经纬度字段）。
- 前端 `src/store/uiStore.ts`（仅新增 mapQuality 档位与渲染器模式枚举；不动业务字段）。
- 前端 `src/store/gameStore.ts`（仅新增爆炸事件 / 焦土集合的 dispatch handler）。
- 前端 `package.json`（新增 `globe.gl` 依赖）。
- 后端 `app/game/map_init.py`（接入球面几何生成）。
- 后端 `app/services/settlement_service.py`（在 resolve 期触发 explosion_resolver）。
- 后端 `app/protocol/outgoing.py` / `app/protocol/routing.py`（新增出站事件路由）。
- 后端 `app/domain/models.py`（新增 Region.lat / lng / scorched_state 等字段）。
- 后端 `app/llm/prompt_builder.py` / `app/llm/output_schema.py`（新增 explosion 范围判定 JSON schema）。
- 后端 `app/llm/mock_client.py`（mock provider 给出 deterministic explosion area）。

禁止：
- 禁止安装 `react-globe.gl`、`three-globe`（globe.gl 内部已含 three-globe，重复装会冲突）。
- 禁止在前端业务 service / store 业务字段层做兼容；新增的 globe 视图状态必须落在 `mapStore`。
- 禁止把 globe.gl 实例放进 R3F `<Canvas>` 内（混合两套渲染管线会撕裂帧）。
- 禁止在 action 期调用 LLM（架构红线）；爆炸范围判定只发生在 resolve 期。
- 禁止把真实国家边界数据 (Natural Earth GeoJSON) 当作势力领土（世界观是虚构的"新伊甸纪元"）。
- 禁止删除 `MapStage2D` / `MapStageR3F`，必须保留作 fallback。

### 0.5 红线（每条任务都内置）

1. 行动期不调用 LLM，爆炸范围判定只在 resolve 阶段由 SettlementService 调度。
2. 协议字段前后端同步改、同步测试，更新 `docs/PROTOCOL_AUDIT.md`。
3. 不引入 `react-globe.gl` / `three-globe`（globe.gl 已内含后者）。
4. 真实地球数据（GeoJSON、Natural Earth）只能用于"骨架参考"，不得作为势力领土数据源；势力领土必须由后端 `globe_geometry.py` 程序化生成。
5. 不部署到任何远程环境；本机 dev-up 验证。
6. LLM provider 保持 mock fallback，可通过 `LLM_PROVIDER` 切换。
7. `MapStage2D` 必须保留并能通过 `mapStore.renderer = '2d'` 切换回退。
8. 球体地图必须能在 1080p 中端 GPU 上稳定 60fps；高画质档允许降到 45fps。
9. 不引入 PostgreSQL / Redis / Docker。
10. 每条任务必须前后端联合验收（dev-up + 浏览器手工 + smoke）。

### 0.6 为什么用 vanilla globe.gl 而非 react-globe.gl

| 维度 | vanilla `globe.gl` | `react-globe.gl` |
|------|--------------------|------------------|
| 包体积 | 较小（~250KB gz） | 多一层 React 封装（~280KB） |
| 控制粒度 | 100%（命令式 API） | 受 React props diff 影响 |
| 帧率稳定性 | 高（无 React 反复 reconcile） | hexPolygonsData 大数组 prop 变更会触发整层重建 |
| 与 R3F 共存 | 不强求 R3F，独立 canvas | 强 React 渲染绑定 |
| 接 `useEffect` 生命周期成本 | 低（mount/dispose 各一次） | 同 |
| 自定义粒子叠加 | 拿到 `globe.renderer()` / `globe.scene()` 即可注入 | 需绕过 props |

**关键考量**：爆炸 VFX 是高频（每秒上百粒子位置更新）、命令式驱动；用 vanilla globe.gl 拿到 underlying THREE 实例后直接 `scene.add(particleSystem)`，避开 React 的 reconcile 开销。

### 0.7 端到端架构图

```
┌──────────────────────────────────────────────────────────────────┐
│                          浏览器                                   │
│                                                                  │
│  GamePage                                                        │
│    └─ <MapSwitcher>                                              │
│         ├─ mapStore.renderer === 'globe' → <MapStageGlobe>       │
│         │     ├─ globe.gl instance (vanilla)                     │
│         │     │   ├─ hexPolygonsData    ← regions[]              │
│         │     │   ├─ arcsData           ← arcs[]                 │
│         │     │   ├─ pointsData         ← capitals/markers       │
│         │     │   ├─ ringsData          ← speech ripples         │
│         │     │   ├─ htmlElementsData   ← labels                 │
│         │     │   └─ customLayerData    ← explosion particles    │
│         │     └─ cameraDirector (zoom on event)                  │
│         ├─ mapStore.renderer === 'r3f'  → <MapStageR3F> (debug)  │
│         └─ mapStore.renderer === '2d'   → <MapStage2D> (fallback)│
│                                                                  │
│  gameStore.handleResolveEvent(explosion) → mapStore.queueExplo() │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
                              ▲
                              │ resolve.event.explosion
                              │ resolve.scorched_diff
                              │ resolve.map_diff (扩展 lat/lng)
                              │
┌──────────────────────────────────────────────────────────────────┐
│                          后端进程                                 │
│                                                                  │
│  SettlementService.run_resolve(turn)                             │
│    ├─ aggregate_settlement_inputs()                              │
│    ├─ MockLLM/RealLLM.call_settlement_model()                    │
│    ├─ for each military_event:                                   │
│    │     explosion_resolver.resolve_explosion(event, regions)    │
│    │       ├─ LLM.judge_explosion_area(event, world_state)       │
│    │       └─ scorched_service.apply(affected_regions)           │
│    └─ emit resolve.event.explosion + resolve.scorched_diff       │
│                                                                  │
│  app/game/globe_geometry.py                                      │
│    ├─ generate_fibonacci_hex_grid(n_cells, resolution)           │
│    ├─ assign_factions_voronoi(seed_capitals, hex_cells)          │
│    └─ build_neighbors_on_sphere(hex_cells)                       │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 0.8 任务依赖关系

```
任务 1 (球体容器接入 + 三态切换)
  └─→ 任务 2 (球面区块生成)
        └─→ 任务 3 (星球美学层)
              └─→ 任务 4 (数据层叠加)
                    └─→ 任务 5 (战争爆炸 VFX)
                          └─→ 任务 6 (LLM 范围判定 + 焦土)
                                └─→ 任务 7 (镜头叙事)
                                      └─→ 任务 8 (性能档位 + 端到端冒烟)
```

建议执行顺序：**1 → 2 → 3 → 4 → 5 → 6 → 7 → 8**（强串行）。

### 0.9 每条任务的统一格式

每条任务包含：

1. **使用场景**：什么时候做这条任务。
2. **当前状态描述**：在改之前是什么样。
3. **契约对齐**：端到端时序图 + 字段约定 + 协议 schema。
4. **前端子提示词**：完整可复制给 AI 工具的前端任务。
5. **后端子提示词**：完整可复制给 AI 工具的后端任务。
6. **预期产物**（前端 + 后端）。
7. **验收标准**（前端单端 + 后端单端 + 端到端联合）。
8. **禁止事项**。

---

## 任务 1：球体容器接入 + MapStage 三态切换

### 使用场景

`GamePage` 中央地图槽位当前只挂载 `MapStageR3F`（平面径向雷达）。本任务在前端引入 vanilla `globe.gl`，新建 `MapStageGlobe.tsx`，并把渲染器切换抽象成 `mapStore.renderer ∈ {'globe' | 'r3f' | '2d'}`。后端本任务**不需要改动**，但要为 §0.2 后续任务的契约对齐做一次轻量准备（导出 region 的 `lat / lng` 字段）。

### 当前状态

- `package.json` 已有 `three / @react-three/fiber / @react-three/drei`，但无 `globe.gl`。
- `src/render/MapStageR3F.tsx` 723 行，使用 R3F + 自研 shader 渲染平面径向雷达。
- `src/render/MapStage2D.tsx` 941 行，Canvas 2D 备用实现。
- `src/store/uiStore.ts` 含 `mapQuality: 'low'|'mid'|'high'`，无 renderer 字段。
- 后端 `Region` 模型已有 `position: tuple[float, float]`（平面坐标），无球面 `lat/lng`。

### 契约对齐

```
S → C   resolve.map_diff  扩展字段（向后兼容）
        regions[].lat       float  -90..90    球面纬度
        regions[].lng       float  -180..180  球面经度
        regions[].hex_id    string             球面 hex 单元 id（任务 2 引入，本任务先占位）

前端 mapStore 新增：
  renderer: 'globe' | 'r3f' | '2d'   默认 'globe'
  cameraPreset: 'overview' | 'focus' | 'cinematic'
```

**本任务先添加可选字段**：`lat / lng / hex_id` 在前端 `protocol/types.ts` 与后端 `outgoing.py` 中均标记 `Optional`，后端可以暂时不发，前端若未收到则回落到 2D `position`。任务 2 落地后转为必填。

---

### 前端子提示词

```
你是一名资深 Three.js + React 渲染集成工程师。请为《外交风云》前端引入 vanilla globe.gl 作为主地图渲染器，并实现 MapStage 三态切换。

【项目背景】
前端 React 19 + Vite + Tailwind + Zustand。当前中央地图槽位由 src/render/MapStageR3F.tsx 渲染平面径向雷达，效果不够立体；同步开发的后端将开始下发球面 lat/lng 坐标。本任务先把 globe.gl 接入到 React 生命周期，并保留 R3F / 2D 两种 fallback。

【球体地图升级期红线（强制遵守）】
1. 行动期不调用 LLM，爆炸范围判定只在 resolve 阶段由 SettlementService 调度。
2. 协议字段前后端同步改、同步测试，更新 docs/PROTOCOL_AUDIT.md。
3. 不引入 react-globe.gl / three-globe（globe.gl 已内含后者）。
4. 真实地球数据只能用于"骨架参考"，势力领土必须由后端程序化生成。
5. 不部署到任何远程环境；本机 dev-up 验证。
6. LLM provider 保持 mock fallback。
7. MapStage2D 必须保留并能通过 mapStore.renderer = '2d' 切换回退。
8. 球体地图必须能在 1080p 中端 GPU 上稳定 60fps。
9. 不引入 PostgreSQL / Redis / Docker。
10. 每条任务必须前后端联合验收。

【技术栈】
- React 19 / TypeScript / Vite / Tailwind / Zustand。
- 渲染：vanilla `globe.gl`（npm i globe.gl@^2.x），不安装 react-globe.gl。
- globe.gl 内部已绑定 three-globe，禁止再单独装 three-globe。

【本任务允许做以下事情】

1. 在 package.json dependencies 中新增 `"globe.gl": "^2.34.0"`，运行 `npm i`。
   - 校验 node_modules/globe.gl 实际安装版本，写入 docs/DEPENDENCY_NOTES.md（新增段落"球体地图依赖"）。
   - 校验 three 实例只有一份（npm ls three），如有冲突，按 globe.gl 要求的 three 版本做 overrides。

2. 新建 src/store/mapStore.ts（独立于 uiStore / gameStore）：
   - state:
     - renderer: 'globe' | 'r3f' | '2d'，默认 'globe'，持久化到 localStorage(key='mapRenderer')
     - cameraPreset: 'overview' | 'focus' | 'cinematic'，默认 'overview'
     - focusRegionId: string | null
     - explosionQueue: ExplosionEvent[]（任务 5 使用，本任务先空数组）
     - scorchedRegions: Set<string>（任务 6 使用）
   - actions:
     - setRenderer(renderer)
     - setCameraPreset(preset, options?)
     - focusOnRegion(regionId)
     - clearFocus()
     - enqueueExplosion(event)（任务 5 占位）
     - consumeExplosion(id)（任务 5 占位）
     - markScorched(regionId)（任务 6 占位）
     - clearScorched(regionId)
   - 类型定义放到 src/render/globe/globeTypes.ts。
   - 用 zustand persist middleware 仅持久化 renderer 字段。

3. 新建 src/render/MapStageGlobe.tsx（命令式封装）：
   - 不使用 R3F；直接 useRef<HTMLDivElement> + useEffect 挂载 globe.gl 实例。
   - 生命周期：
     - mount: `const g = Globe()(containerRef.current); g.globeImageUrl(null).backgroundColor('#000').showAtmosphere(false).pointOfView({lat:0, lng:0, altitude:2.5}, 0)`
     - dispose: `g._destructor()`（globe.gl 暴露的销毁方法）；同时 `globe.renderer().dispose()`、清空 ref。
   - 监听 ResizeObserver 调用 g.width(w).height(h)。
   - 监听 mapStore.cameraPreset 变化，调用 g.pointOfView() 做平滑过渡。
   - 监听 mapStore.focusRegionId 变化，从 region.lat/lng 平滑移动镜头。
   - 暴露 globeInstanceRef 给后续任务（任务 4/5）通过 useGlobeInstance hook 访问。

4. 新建 src/render/globe/useGlobeInstance.ts：
   - 提供 createContext + Provider，让 MapStageGlobe 把 globe 实例 publish 出去。
   - useGlobeInstance() 返回 { globe, scene, camera, renderer } 或 null。
   - 任务 4/5 的子组件通过这个 hook 操作 globe。

5. 新建 src/render/MapSwitcher.tsx：
   - 读 mapStore.renderer，分别挂载 MapStageGlobe / MapStageR3F / MapStage2D。
   - 同一时刻只挂载一个；切换时强制 unmount-remount（用 key={renderer}）以确保前一个实例销毁。

6. 修改 src/pages/GamePage.tsx：
   - 把原来直接挂 `<MapStageR3F />` 的地方替换成 `<MapSwitcher />`。
   - 不动 GamePage 其它任何业务区块（事件流 / 势力关系 / 命令终端）。

7. 在 HUD / SettingsPanel 中新增"渲染器"分段控件：
   - 三选项："球体（推荐）" / "径向 3D（调试）" / "2D 平面（兼容）"。
   - 切换时调用 mapStore.setRenderer，并在 toast 提示"渲染器已切换，画面将重建一次"。

8. 修改 src/protocol/types.ts：
   - RegionEntry 添加可选字段：`lat?: number; lng?: number; hex_id?: string`。
   - 在 adapter.ts 中向 gameStore 传递这些字段时保持 nullable。
   - 在 docs/PROTOCOL_AUDIT.md 末尾新增"球体地图扩展"段落，列出本次新增字段。

9. 修改 src/store/gameStore.ts：
   - regions selector 增加 lat/lng/hex_id 透传。
   - 不动业务字段语义。

10. 单元测试：
    - src/render/globe/__tests__/useGlobeInstance.test.tsx：测 Provider/consumer。
    - src/render/__tests__/MapSwitcher.test.tsx：测三态切换正确 mount/unmount。
    - 使用 vitest，jsdom 环境。
    - globe.gl 真实 WebGL 不可在 jsdom 跑，需要 mock：vi.mock('globe.gl', () => ({ default: () => () => ({ width:()=>{}, height:()=>{}, _destructor:()=>{}, /* ...其它链式方法返回 self */ }) }))。

11. 验证：
    - `npx tsc --noEmit` 通过。
    - `npm run lint` 通过。
    - `npm run test` 全绿。
    - `npm run dev`：浏览器打开后默认看到球体（任务 1 阶段球面为空 / 仅底色 + 默认 backgroundColor 黑），右上设置面板能切换到 2D / R3F 并能切回。
    - 切换 3 次：globe → 2d → r3f → globe，无内存泄漏（DevTools Memory 快照前后差 <10MB）。

【禁止做的事】
- 不要安装 react-globe.gl 或 three-globe。
- 不要把 globe.gl 实例挂在 R3F <Canvas> 内。
- 不要在本任务实现任何 hexPolygonsData 渲染（任务 2 负责）。
- 不要为切换写"双 canvas 同时渲染"的兼容代码；同一时刻只能一个 canvas 存在。
- 不要修改 MapStage2D / MapStageR3F 的渲染逻辑（仅允许它们被有条件挂载）。
- 不要在 mapStore 写业务逻辑（如领土归属、关系），那些归 gameStore。
- 不要在 globe 容器内调用 ReactDOM.render（globe.gl 的 htmlElementsData 渲染由它自己负责）。
- 不要把 lat/lng 当成必填字段，本任务它们必须是 optional。
- 不要把渲染器选择写死在 GamePage（必须读 mapStore）。
- 不要在本任务实现 cameraDirector 镜头叙事（任务 7 负责），cameraPreset 切换只做无动画的瞬间切换。

【验收标准】
1. package.json 含 globe.gl，无 react-globe.gl / three-globe。
2. npm ls three 显示唯一一份 three（与 globe.gl 内部要求兼容的版本）。
3. mapStore.ts 存在，含 9 个 action，renderer 持久化到 localStorage。
4. MapStageGlobe.tsx 正确挂载 / 销毁 globe 实例（dispose 后 ref 为 null）。
5. MapSwitcher.tsx 三态切换正确 unmount 前一个 stage。
6. GamePage 已切换到 <MapSwitcher />，不再直接挂 MapStageR3F。
7. 设置面板含三选项分段控件。
8. RegionEntry 类型含 optional lat/lng/hex_id。
9. PROTOCOL_AUDIT.md 末尾含"球体地图扩展"段落。
10. tsc / lint / test 全绿。
11. dev 起后默认看到 globe 容器（暂为空球或黑色 + 默认绕轴），切换 2D 看到原 MapStage2D，切回 globe 正常。
12. 3 次切换后内存差 <10MB。

请按以上规范完成本任务。完成后输出：
（1）新增 / 修改文件清单；
（2）npm ls three 输出；
（3）切换 3 次的 Performance > Memory 快照差值；
（4）验证命令输出摘要。
```

### 后端子提示词

```
你是一名资深 Python 后端协议工程师。请为《外交风云》后端扩展 Region 协议字段，为后续球体地图升级铺路。本任务只做**最小协议扩展**，不实现球面几何（任务 2 负责）。

【项目背景】
前端正在引入 vanilla globe.gl 作为主地图渲染器，需要 region 携带球面 lat/lng/hex_id。本任务先把这三个字段以 Optional 形式加入后端 Region 模型与出站协议，前端可以先收到 null 并 fallback 到平面坐标。

【球体地图升级期红线】
（同前端，略）

【技术栈】
Python 3.11+ + FastAPI + Pydantic v2。仓储为内存仓储。

【本任务允许做以下事情】

1. 修改 app/domain/models.py：
   - Region 模型新增三个 Optional 字段：
     - lat: float | None = Field(default=None, ge=-90.0, le=90.0)
     - lng: float | None = Field(default=None, ge=-180.0, le=180.0)
     - hex_id: str | None = Field(default=None, max_length=32)
   - 保留原 position 字段（平面坐标，前端 2D fallback 仍用）。

2. 修改 app/protocol/outgoing.py：
   - RegionEntryOut（resolve.map_diff 中嵌套的 region payload）同步新增 Optional lat/lng/hex_id。
   - 序列化时如 None 则不写入 dict（exclude_none=True）。
   - 任何已有调用方均无需改动（向后兼容）。

3. 修改 app/repositories/memory.py / postgres_placeholder.py（如有）：
   - Region 仓储读写新字段，默认 None。

4. 修改 app/services/settlement_service.py 中构造 map_diff 的位置：
   - 把 region.lat / lng / hex_id 透传到出站 payload。
   - 不引入新逻辑（不计算几何）。

5. 测试：
   - app/tests/test_protocol.py 新增用例：
     - region 携带 lat/lng/hex_id 时序列化包含三字段。
     - region 不携带时序列化中无该三字段（exclude_none）。
   - app/tests/test_domain_models.py 新增用例：
     - lat=91.0 校验失败。
     - lng=-181.0 校验失败。
     - hex_id 超长校验失败。

6. 协议审计文档：
   - docs/PROTOCOL_AUDIT.md 末尾新增"球体地图扩展"段落，列出本次新增字段、对应前端类型、是否必填、引入版本（v1.0-globe）。

7. 验证：
   - `pytest -q app/tests/test_protocol.py app/tests/test_domain_models.py` 通过。
   - `ruff check app/domain app/protocol app/services` 通过。
   - 不启动 uvicorn。

【禁止做的事】
- 不要在本任务实现球面几何生成（任务 2 负责）。
- 不要把 lat/lng 设为必填。
- 不要删除 position 字段。
- 不要改动其它消息类型字段。
- 不要在 SettlementService 引入新业务逻辑（仅透传字段）。
- 不要使用真实 GeoJSON 数据填 lat/lng。
- 不要在 mock 数据里写死 lat/lng（任务 2 才生成）。
- 不要修改 ws gateway / dispatcher。

【验收标准】
1. Region 模型含 Optional lat/lng/hex_id 三字段 + 边界校验。
2. RegionEntryOut 同步新增三字段，exclude_none=True。
3. 仓储读写新字段不破坏现有用例。
4. SettlementService 透传新字段到 map_diff。
5. 新增 5 条单元测试（3 协议 + 3 模型边界），全部通过。
6. PROTOCOL_AUDIT.md 末尾含"球体地图扩展"段落。
7. pytest 通过。
8. ruff 通过。
9. 不启动服务器。

完成后输出：
（1）修改文件清单；
（2）新增测试用例名；
（3）pytest 输出摘要；
（4）PROTOCOL_AUDIT.md 新增段落原文。
```

### 预期产物

- 前端：`package.json`（含 globe.gl）/ `src/store/mapStore.ts` / `src/render/MapStageGlobe.tsx` / `src/render/MapSwitcher.tsx` / `src/render/globe/useGlobeInstance.ts` / `src/render/globe/globeTypes.ts` / `src/components/SettingsPanel.tsx`（新增分段控件） / `src/pages/GamePage.tsx`（接入 MapSwitcher） / 协议类型扩展 / 单元测试。
- 后端：`app/domain/models.py` Region 扩展 / `app/protocol/outgoing.py` Region payload 扩展 / `app/services/settlement_service.py` 透传 / 测试。
- 共同：`docs/PROTOCOL_AUDIT.md` 新增"球体地图扩展"段落。

### 验收标准（端到端联合）

1. dev-up 后浏览器打开 GamePage，默认看到黑色背景的 globe 球体（暂无领土）。
2. 设置面板切换到"2D 平面"看到原 MapStage2D 完整渲染；切换"径向 3D"看到原 MapStageR3F。
3. 切回"球体"画面重建无报错。
4. 后端日志显示 resolve.map_diff 出站时 region 包含 lat/lng/hex_id 字段（即使为 null）。
5. 前端 DevTools 收到的 resolve.map_diff 消息含三新字段。
6. localStorage 中 mapRenderer 值随切换变化。
7. 前后端单端测试全绿。

### 禁止事项

- 禁止安装 react-globe.gl / three-globe。
- 禁止在 R3F `<Canvas>` 内挂 globe.gl。
- 禁止把 lat/lng/hex_id 改成必填。
- 禁止删除 MapStage2D / MapStageR3F。
- 禁止把渲染器选择写死。
- 禁止在 mapStore 写业务逻辑。

---

## 任务 2：球面虚构区块生成（Voronoi + Hex Grid 精细化）

### 使用场景

七大势力的领土必须程序化生成在球面上。本任务后端用 **Spherical Fibonacci 采样 + Voronoi 切分 + Hex 网格细化**生成区块，前端用 globe.gl 的 `hexPolygonsData` 渲染。**目标：每势力 ~80-120 个 hex 单元，总共 600-840 个 hex 单元，球面覆盖均匀，势力领土连续，边界自然。**

### 当前状态

- 后端 `app/game/map_init.py` 当前生成平面径向坐标 + 7 势力均分扇区。
- 没有任何球面几何代码。
- 没有 Voronoi 实现。
- 前端 globe 球面为空。

### 契约对齐

```
S → C   resolve.map_diff  扩展（任务 1 已 optional → 本任务转必填）
        regions[].lat       float  -90..90    必填
        regions[].lng       float  -180..180  必填
        regions[].hex_id    string h3-like 32 chars 必填
        regions[].faction   FactionId
        regions[].neighbors string[]  邻接 hex_id 列表（用于 LLM 范围判定时扩散）
        regions[].terrain   'plain'|'mountain'|'ocean'|'desert'|'forest'|'tundra'
        regions[].elevation float  0..1（用于 hex 多边形高度抬升的视觉表达）

新增一次性出站事件：room.world_geometry  （房间开始时下发，1 次）
  payload:
    seed: int                世界种子
    hex_resolution: int      hex 网格分辨率（任务 2: 默认 4，对应 ~700 hex）
    total_cells: int
    factions: [{id, capital_hex_id, capital_lat, capital_lng}]
    cells: RegionEntry[]     全量 cells
```

`room.world_geometry` 与 `resolve.map_diff` 的区别：前者一次下发全量几何 + 势力初始分布；后者只下发增量变更（领土易手 / 焦土）。

---

### 前端子提示词

```
你是一名资深前端 3D 地图渲染工程师。请把球面 hex 网格区块在 globe.gl 上渲染出来，并实现势力领土的填色 / 边界 / 高度抬升。

【项目背景】
任务 1 已落地 MapStageGlobe + mapStore + 协议字段扩展。后端将下发 room.world_geometry 携带 ~700 个 hex cells 与势力归属。本任务把这些 cells 喂给 globe.gl 的 hexPolygonsData 实现"七色拼花球"。

【球体地图升级期红线】
（同前端任务 1，略）

【技术栈】
- globe.gl 的 hexPolygonsData / hexPolygonResolution / hexPolygonColor / hexPolygonAltitude / hexPolygonMargin。
- 不引入 d3-geo-voronoi（前端不算几何，几何由后端给）。
- 颜色用 src/mock/factions.ts 的 Primary / Glow / Shadow 三色板。

【本任务允许做以下事情】

1. 新建 src/render/globe/buildHexPolygons.ts：
   - 入参：region[] (含 lat/lng/hex_id/faction/elevation/terrain)。
   - 出参：HexPolygonInput[]，符合 globe.gl hexPolygonsData 要求：
     - 每个元素含 `lat: number`, `lng: number`, `factionId`, `terrain`, `elevation`, `hexId`。
     - 不需要预先计算 polygon vertices，globe.gl 内部基于 H3 网格自动生成。
   - 提供 hexPolygonColor(region) → string（六势力 primary + 灰烬 dim 处理）。
   - 提供 hexPolygonAltitude(region) → number  范围 0.005..0.02（视觉立体感）。
   - 提供 hexPolygonMargin(region) → number  常量 0.2（hex 间留缝隙营造拼花感）。

2. 在 MapStageGlobe.tsx 中接入：
   - useEffect 监听 gameStore.regions 变化：
     - globe.hexPolygonsData(buildHexPolygons(regions))
     - globe.hexPolygonResolution(4)（约 700 cells）
     - globe.hexPolygonColor(d => hexPolygonColor(d.__data))
     - globe.hexPolygonAltitude(d => hexPolygonAltitude(d.__data))
     - globe.hexPolygonMargin(0.2)
     - globe.hexPolygonUseDots(false)（任务 3 切到 true 做光点版本）
   - 焦土集合（mapStore.scorchedRegions）变化时，给受影响 hex 应用 dimmed color（任务 6 占位实现）。

3. 协议字段：
   - src/protocol/types.ts 把 lat/lng/hex_id 从 Optional 升级到 Required。
   - 新增 WorldGeometryPayload：
     interface WorldGeometryPayload {
       seed: number;
       hex_resolution: number;
       total_cells: number;
       factions: Array<{id:FactionId; capital_hex_id:string; capital_lat:number; capital_lng:number}>;
       cells: RegionEntry[];
     }
   - dispatcher.ts 新增 'room.world_geometry' 路由 → gameStore.applyWorldGeometry(payload)。

4. 修改 src/store/gameStore.ts：
   - 新增 worldGeometry 切片：seed / hex_resolution / total_cells / capitals[]。
   - applyWorldGeometry(payload) 写入 regions[]（覆盖任意 mock）+ capitals + seed。
   - 不破坏现有 resolve.map_diff 增量合并逻辑。

5. mock 数据：
   - src/mock/worldGeometry.ts：基于 Spherical Fibonacci 采样生成 ~700 个 lat/lng 点，使用确定性 seed，按到 7 个 capital 的球面距离最近原则分组（模拟后端 Voronoi）。
   - 仅在 USE_WS=false 时使用，且明确标注 "// MOCK only — backend is the source of truth"。

6. 单元测试：
   - src/render/globe/__tests__/buildHexPolygons.test.ts：覆盖颜色 / 高度 / margin。
   - src/store/__tests__/applyWorldGeometry.test.ts：覆盖入栈 + 不被 map_diff 覆盖。

7. 验证：
   - `npx tsc --noEmit` / `npm run lint` / `npm run test` 全绿。
   - `npm run dev`：进入房间后球体显示七色拼花，可旋转 / 缩放；切换 mapStore.renderer = '2d' 仍有原 2D 视图。
   - DevTools Performance：稳定 60fps（hexPolygonResolution=4，total_cells≈700）。

【禁止做的事】
- 不要在前端做 Voronoi 计算（必须由后端给）。
- 不要使用真实国家 GeoJSON。
- 不要把 hexPolygonResolution 写死，必须从 worldGeometry.hex_resolution 读。
- 不要在本任务实现高度纹理 / 大气层 / bloom（任务 3 负责）。
- 不要在本任务实现 arc / point / ring（任务 4 负责）。
- 不要在本任务实现爆炸 VFX（任务 5 负责）。
- 不要修改 settlement 业务逻辑。
- 不要把 capital_hex_id 当作渲染必需（仅在任务 7 镜头叙事使用）。

【验收标准】
1. buildHexPolygons.ts 输出格式正确，能被 globe.gl 接受。
2. RegionEntry 的 lat/lng/hex_id 升级为 Required。
3. dispatcher 路由含 'room.world_geometry'。
4. gameStore.applyWorldGeometry 不被 map_diff 覆盖（map_diff 仅增量）。
5. mock 数据可用，且 USE_WS=true 时被后端覆盖。
6. 球体显示七色拼花，旋转流畅。
7. 1080p 中端 GPU 稳定 60fps。
8. 单元测试覆盖率 ≥80%。
9. tsc / lint / test 全绿。

完成后输出：
（1）修改 / 新增文件清单；
（2）DevTools Performance > Frames 截图说明（描述帧时间分布）；
（3）单测覆盖率报告；
（4）验证命令摘要。
```

### 后端子提示词

```
你是一名资深 Python 几何 / 游戏地图工程师。请实现球面 Spherical Fibonacci + Voronoi + Hex 网格生成器，为七大势力分配领土。

【项目背景】
本游戏世界是虚构的"新伊甸纪元"。任务 1 已给 Region 添加 lat/lng/hex_id Optional 字段。本任务生成球面 hex 网格 → 选七个均匀分布的 capital → Voronoi 把所有 cells 分配给最近 capital → 输出 room.world_geometry 一次性广播给客户端。

【球体地图升级期红线】
（同前端任务 1，略）

【技术栈】
- Python 3.11+ + numpy（球面三角运算）。
- 不引入 scipy（保持依赖最小）；如必须，可用纯 numpy 实现 Voronoi（球面 Voronoi 用"对每点取最近 capital"近似即可，球面 KNN 用 cosine 距离）。
- 不引入 h3-py（包体积大）；hex_id 用确定性自定义编码（"H{resolution}_{cellIndex:05d}"）。

【本任务允许做以下事情】

1. 新建 app/game/globe_geometry.py：
   - `generate_fibonacci_sphere(n: int, seed: int) -> list[tuple[float, float]]`
     返回 n 个 (lat, lng)，使用 Spherical Fibonacci spiral（golden angle = π*(3-√5)）。
   - `cells_for_resolution(resolution: int) -> int`
     resolution 4 → 642（默认）; 5 → 2562; 3 → 162（low quality）。
   - `assign_factions_voronoi(cells: list[(lat,lng)], capitals: list[(lat,lng,faction_id)]) -> list[str]`
     对每个 cell，取 cosine 距离最近的 capital，返回 faction_id list。
   - `pick_capitals(seed: int, faction_ids: list[FactionId]) -> list[(faction_id,lat,lng)]`
     用 seed 取 7 个均匀分布点：Fibonacci sphere n=7 + 随机扰动。
   - `build_neighbors_on_sphere(cells: list[(lat,lng)], k: int = 6) -> list[list[int]]`
     对每个 cell 取 cosine 距离最近 k 个邻居。
   - `assign_terrain(cells, seed) -> list[Terrain]`
     用 3D simplex / Perlin 噪声（自实现或纯 numpy）按 elevation 阈值分类：
       <0.25 ocean / <0.5 plain / <0.75 forest / >=0.75 mountain，附加 desert / tundra 按 |lat| 区间分布。
   - `generate_world_geometry(seed: int, hex_resolution: int = 4, faction_ids: list[FactionId]) -> WorldGeometry` 总入口。

2. 新建 app/domain/world_geometry.py：
   - 定义 `Terrain` 枚举与 `WorldGeometry` dataclass。
   - `WorldGeometry`: seed / hex_resolution / total_cells / capitals / cells。
   - `RegionCell`: lat / lng / hex_id / faction_id / terrain / elevation / neighbors。

3. 修改 app/game/map_init.py：
   - 引入 globe_geometry.generate_world_geometry。
   - 旧的平面径向生成器保留但走 fallback（仅当 hex_resolution=0 时用）。
   - 默认行为：使用球面几何 + 同步在 region 上写入旧的平面 position（用 lat/lng 等距投影）作为 2D fallback 数据。

4. 修改 app/protocol/outgoing.py：
   - 把 lat/lng/hex_id 升级为 required。
   - RegionEntryOut 新增 terrain / elevation / neighbors。
   - 新增 WorldGeometryEvent：
     class WorldGeometryEvent(BaseEnvelope):
       t: Literal['room.world_geometry']
       p: WorldGeometryPayload
   - WorldGeometryPayload 含 seed / hex_resolution / total_cells / factions / cells。

5. 修改 app/api/websocket/router.py / dispatcher.py：
   - 房间 start 时（room.start 出站后立刻）push 一条 room.world_geometry 给所有客户端。
   - reconnect.catchup 时也包含 world_geometry（在 snapshot 之前发）。

6. 修改 app/services/room_service.py / settlement_service.py：
   - room_service 在 start_room 时调用 generate_world_geometry，把结果存到 Room.world_geometry。
   - settlement_service 在 resolve 时引用 Room.world_geometry.cells（不重新生成）。

7. 测试：
   - app/tests/test_globe_geometry.py：
     - fibonacci_sphere 输出 n 个点，均匀性 χ²（按 36 区间分桶） p>0.05。
     - assign_factions_voronoi 七个势力 cells 数量差异 <15%（均衡性）。
     - build_neighbors_on_sphere 邻居数恰好 k=6（除极点附近）。
     - 同 seed 完全确定性（两次生成 deepequal）。
     - assign_terrain 八类全覆盖且 ocean 占比 ∈ [0.20, 0.35]。
   - app/tests/test_protocol.py：
     - WorldGeometryEvent 序列化 / 反序列化往返一致。
     - resolve.map_diff 中 region 必含 lat/lng/hex_id。
   - app/tests/test_room_service.py：
     - room.start 后 Room.world_geometry 非空。
     - reconnect.catchup 包含 world_geometry。

8. PROTOCOL_AUDIT.md 更新：
   - "球体地图扩展"段落：lat/lng/hex_id 已升级为 required，新增 terrain/elevation/neighbors，新增 room.world_geometry 事件。

9. 验证：
   - `pytest -q app/tests/test_globe_geometry.py app/tests/test_protocol.py app/tests/test_room_service.py` 通过。
   - `ruff check app/game app/domain app/protocol app/services` 通过。
   - 不启动 uvicorn。

【禁止做的事】
- 不要引入 scipy / h3-py / shapely 等重依赖。
- 不要使用真实地球 GeoJSON / Natural Earth 数据。
- 不要在 action 阶段调用本模块的随机生成（必须在 room.start 前确定性生成）。
- 不要让 seed 默认随机；必须从 room 配置读，未配则用 room_id 哈希。
- 不要让 hex_resolution 写死在协议外（必须随 world_geometry 下发）。
- 不要在 generate_world_geometry 中调用 LLM。
- 不要把 hex 邻接表存到 redis / disk（仅内存 Room.world_geometry）。
- 不要破坏 resolve.map_diff 既有契约。

【验收标准】
1. globe_geometry.py 暴露 5 个公共函数，每个有 docstring。
2. WorldGeometry / RegionCell dataclass 完整。
3. map_init.py 接入新生成器，旧逻辑作 fallback。
4. WorldGeometryEvent 与 payload 类型正确。
5. room.start 后下发 room.world_geometry。
6. reconnect.catchup 含 world_geometry。
7. 新增 ≥10 条单元测试全绿。
8. ruff 通过。
9. PROTOCOL_AUDIT.md 更新。
10. 不启动服务器。

完成后输出：
（1）新增 / 修改文件清单；
（2）七势力 cells 数量分布表；
（3）terrain 八类占比表；
（4）pytest / ruff 输出摘要。
```

### 预期产物

- 前端：buildHexPolygons.ts / MapStageGlobe 接入 hex 渲染 / dispatcher 新增 room.world_geometry 路由 / gameStore.applyWorldGeometry / mock 数据 / 单元测试。
- 后端：app/game/globe_geometry.py / app/domain/world_geometry.py / map_init.py 改造 / WorldGeometryEvent / room_service 集成 / 单元测试。

### 验收标准（端到端联合）

1. dev-up 后进入房间，前端在收到 room.world_geometry 后渲染七色拼花球，cells ≈ 642 个。
2. 七势力 cells 数量分布均衡（最大势力 cells / 最小势力 cells < 1.5）。
3. terrain 分布合理：ocean ≈ 25-30%，山脉占 15-20% 集中在高 elevation。
4. 同 seed 两次 dev-up 生成的 world geometry 完全一致。
5. 切到 2D 视图，原 MapStage2D 仍可渲染（用 lat/lng 等距投影到平面）。
6. resolve.map_diff 增量更新势力归属时，前端 globe 对应 cells 颜色平滑过渡。
7. 1080p 中端 GPU 稳定 60fps。

### 禁止事项

- 禁止前端做 Voronoi。
- 禁止真实地球数据。
- 禁止 action 期生成几何。
- 禁止 seed 默认随机。
- 禁止破坏 map_diff 契约。
- 禁止 scipy / h3-py / shapely。

---

## 任务 3：星球美学层（月观地球 + 暗色基底 + 星空 + Bloom）

### 使用场景

任务 2 的拼花球缺少氛围。本任务把 globe 调成"从月亮看地球"风格：黑色背景 + 远星星空 + 无大气 + 暗色海洋 + hex 边界轻微 glow + bloom 后处理。前端为主，后端**仅提供配色与昼夜参考时区**（可选）。

### 当前状态

- 球体可见但单调，无光照、无星空、无后处理。
- backgroundColor 黑色但无星空粒子。
- 海洋 hex 与陆地颜色对比度不足。

### 契约对齐

```
S → C   resolve.world_lighting（可选，本任务前端可硬编码作为兜底）
        sun_lat: float
        sun_lng: float
        day_color: '#hex'
        night_color: '#hex'

新增前端 mapStore.lighting:
  starfield_density: number       默认 0.7
  bloom_strength: number          默认 1.4
  bloom_radius: number            默认 0.6
  bloom_threshold: number         默认 0.85
  show_sun: boolean               默认 true
  night_overlay_alpha: number     默认 0.5
```

---

### 前端子提示词

```
你是一名资深 Three.js 后处理与美学工程师。请把 globe.gl 升级为"月观地球"风格：黑色 + 星空 + 无大气 + 暗色海洋 + bloom。

【项目背景】
任务 2 已渲染七色 hex 拼花球，但视觉单调。本任务在不改变 globe.gl 数据层契约的前提下，往 underlying THREE.Scene 注入星空 / 太阳定向光 / EffectComposer + UnrealBloomPass，并把 hex 配色调成"地球级"色彩。

【球体地图升级期红线】
（同前端任务 1，略）

【技术栈】
- globe.gl 的 `renderer()` / `scene()` / `camera()` 暴露接口。
- THREE.Points + ShaderMaterial 做星空。
- THREE.DirectionalLight + AmbientLight 做日夜光照（虽然 globe.gl 默认是无光照材质，但 hexPolygons 是 MeshLambertMaterial）。
- 后处理：postprocessing@^6（npm i postprocessing）—— 暴露 EffectComposer / RenderPass / EffectPass / BloomEffect / VignetteEffect / NoiseEffect。

【本任务允许做以下事情】

1. 安装 postprocessing：
   - `npm i postprocessing@^6`
   - 校验 three peer 版本兼容。

2. 新建 src/render/globe/stylePresets.ts：
   - 暗色海洋色板（terrain → color）：
     ocean: '#0a1a2a'
     plain: '#3a3a3a' + faction.primary 混色
     forest: '#1e3a1e' + faction.primary 混色
     mountain: '#5a4a3a' + faction.primary 混色
     desert: '#6a5a3a'
     tundra: '#7a8a9a'
   - 边界 glow color = faction.glow，强度按 elevation。
   - 提供 hexPolygonColor(region, ctx) 函数（覆盖任务 2 的简单版）：
     如果是 ocean → 海洋色 + 5% faction tint
     非 ocean → terrain 色 × 0.4 + faction.primary × 0.6

3. 新建 src/render/globe/starfield.ts：
   - createStarfield(scene, density) → THREE.Points 注入 scene。
   - 8000 颗星（density=0.7 时），位置在半径 800 的球壳上 Fibonacci 分布。
   - 颜色随机 4 类：white / pale-blue / pale-yellow / pale-red。
   - PointsMaterial 含 sizeAttenuation=false 保证远星不消失。
   - 慢速旋转：每帧 y 轴 0.0001 rad。

4. 新建 src/render/globe/postprocess.ts：
   - setupBloom(renderer, scene, camera, options):
     - 创建 EffectComposer。
     - 添加 RenderPass。
     - 添加 EffectPass(BloomEffect{strength:1.4, radius:0.6, threshold:0.85} + VignetteEffect{darkness:0.6} + NoiseEffect{premultiply:true, blendFunction:BlendFunction.SCREEN, opacity:0.06})。
   - 返回 { composer, dispose }。
   - **关键**：globe.gl 内部有自己的 animationFrame 调度，需要接管：
     - 通过 globe.renderer(composer)  ← 不对，globe.gl 不暴露这个；改用 `globe.tickFunction(()=> composer.render())`。
     - 实测如果上面不行，则方案 B：把 globe.renderer() 拿出来，自己 requestAnimationFrame 串联 globe.scene 与 composer。
   - 写一段 docstring 标注"如果未来 globe.gl 升级导致此 hack 失效，参考 globe.gl issue #xxx"。

5. 修改 MapStageGlobe.tsx：
   - mount 时调用 createStarfield + setupBloom。
   - 暴露 mapStore.lighting 字段控制 starfield_density / bloom_*。
   - dispose 时清理 composer + starfield geometry / material。

6. 修改 SettingsPanel.tsx：
   - 在"渲染器"分段下新增"视觉氛围"折叠组：
     - bloom 强度滑杆（0..3）。
     - 星空密度滑杆（0..1）。
     - 日夜遮罩 alpha（0..1）。
     - 抖动噪点开关。

7. 修改 globe 配置：
   - showAtmosphere(false)  ← 关键，去掉默认大气散射。
   - showGraticules(false)
   - 自定义 sun light: 用 DirectionalLight 模拟太阳在 lat=10/lng=0 方向。
   - hex 在 night 半球颜色 ×0.5（用 onAfterRender 钩子，或在 hexPolygonColor 中动态算 sun.dot(cellNormal)）。

8. 单元测试：
   - src/render/globe/__tests__/stylePresets.test.ts：terrain → color 边界值。
   - src/render/globe/__tests__/starfield.test.ts：注入 / 销毁 / 计数。

9. 视觉回归：
   - 在 docs/VISUAL_REGRESSION_GLOBE.md 写入 3 张截图描述（任务 3 完成时）：
     - 全景默认
     - bloom 关闭对照
     - 切到日侧 / 夜侧对照

10. 验证：
    - tsc / lint / test 全绿。
    - dev：球体呈现"月观地球"氛围，1080p 60fps（bloom + 8000 stars 同时存在）。
    - 切换"2D"仍正常。

【禁止做的事】
- 不要安装 @react-three/postprocessing（与 globe.gl 不兼容渲染管线）；只装 postprocessing。
- 不要打开 globe.showAtmosphere(true)（大气与"从月亮看"美学冲突）。
- 不要用 cubemap 大尺寸贴图做星空（用 Points + Fibonacci 即可，包体积 0）。
- 不要修改 hexPolygonsData 结构（任务 2 已定）。
- 不要在本任务实现 arcs / points / rings（任务 4 负责）。
- 不要在本任务实现爆炸 VFX（任务 5 负责）。
- 不要在 SettingsPanel 改业务字段。
- 不要用 globe.globeImageUrl 加载真实地球贴图（这违反"月观地球 + 虚构世界"的美学）。

【验收标准】
1. postprocessing 安装且与 three peer 兼容。
2. stylePresets / starfield / postprocess 三个模块独立可测。
3. MapStageGlobe 接入并能销毁干净。
4. SettingsPanel 含视觉氛围控件。
5. 球体呈现星空 + bloom + 暗色海洋。
6. 1080p 60fps，VRAM 占用 <300MB。
7. 切换渲染器无内存泄漏。
8. tsc / lint / test 全绿。
9. VISUAL_REGRESSION_GLOBE.md 含 3 张截图描述。

完成后输出：
（1）修改 / 新增文件清单；
（2）Performance 截图描述；
（3）3 张视觉对照说明；
（4）验证命令摘要。
```

### 后端子提示词

```
你是一名资深后端工程师。请为前端"月观地球"美学层提供光照参数与昼夜模拟参考数据（轻量任务）。

【项目背景】
任务 3 主要在前端，后端仅提供一条**可选**的 resolve.world_lighting 事件，便于前端动态切换日夜方向（如剧情推进到"夜战"时把太阳挪到背面）。

【球体地图升级期红线】
（同后端任务 1，略）

【本任务允许做以下事情】

1. 新建 app/domain/world_lighting.py：
   - WorldLighting dataclass：sun_lat / sun_lng / day_color / night_color / phase_label。
   - WorldLightingPolicy：根据 turn 数与季节推进太阳方向（简单线性：每回合 sun_lng += 15°）。

2. 修改 app/protocol/outgoing.py：
   - 新增 WorldLightingEvent，payload = WorldLightingPayload。
   - 注册到 routing.py。

3. 修改 app/services/settlement_service.py：
   - resolve 阶段最后 emit 一条 resolve.world_lighting（如开启 lighting_policy）。
   - 受 env LIGHTING_DYNAMIC = true/false 控制；默认 false。

4. 测试：
   - app/tests/test_world_lighting.py：
     - WorldLightingPolicy.next(turn) 单调推进。
     - 序列化 / 反序列化往返。

5. PROTOCOL_AUDIT.md 更新：
   - "球体地图扩展"段落新增 resolve.world_lighting。

6. 验证：
   - pytest 通过。
   - ruff 通过。
   - 不启动服务器。

【禁止做的事】
- 不要在本任务做任何视觉相关计算（颜色 / bloom / 星空）。
- 不要让 LIGHTING_DYNAMIC 默认 true（保持兼容性）。
- 不要影响其它 resolve 事件顺序。

【验收标准】
1. WorldLighting 模块完成。
2. 协议事件注册。
3. SettlementService 集成（默认 off）。
4. 测试通过。
5. ruff 通过。

完成后输出：
（1）修改 / 新增文件清单；
（2）pytest 摘要。
```

### 预期产物

- 前端：postprocessing 依赖 / stylePresets / starfield / postprocess / MapStageGlobe 升级 / SettingsPanel 视觉氛围控件 / VISUAL_REGRESSION_GLOBE.md。
- 后端：world_lighting domain / WorldLightingEvent / settlement 集成 / 测试。

### 验收标准（端到端联合）

1. dev-up 后球体呈现"月观地球"氛围（星空 + bloom + 暗海 + 无大气）。
2. 视觉对照：bloom 开 / 关切换有明显差异。
3. SettingsPanel 控件可实时调节。
4. LIGHTING_DYNAMIC=true 时，每回合太阳方向变化反映到前端 hex 明暗。
5. 60fps 稳定。

### 禁止事项

- 禁止 @react-three/postprocessing。
- 禁止真实地球贴图。
- 禁止默认开启 LIGHTING_DYNAMIC。
- 禁止 atmosphere on。
- 禁止本任务实现 arcs / particles / VFX。

---

## 任务 4：数据层叠加（Arcs / Points / Rings / Labels）

### 使用场景

势力之间的外交飞线、首都光点、演讲涟漪、势力名称悬浮标签 —— 这些数据可视化层叠加到任务 3 的"月观地球"上，复用 globe.gl 内置 `arcsData / pointsData / ringsData / htmlElementsData`。

### 当前状态

- 球体显示拼花，但没有任何动态数据可视化。
- 演讲 / 密谈 / 条约事件目前只显示在事件流面板，没有在球体上反映。

### 契约对齐

```
S → C   resolve.diplomatic_arcs   （新增）
        arcs: [{
          id: string,
          from_faction: FactionId,
          to_faction: FactionId,
          kind: 'speech'|'private'|'treaty'|'declaration'|'trade',
          color: '#hex',
          intensity: float 0..1,
          ttl_ms: int (默认 4000),
          start_lat / start_lng / end_lat / end_lng (由后端从 capital 取)
        }]

S → C   resolve.ripple             （新增）
        ripples: [{
          id, lat, lng, color, max_radius, ttl_ms, kind:'speech'|'shockwave'
        }]

S → C   room.capitals              （已包含在 room.world_geometry，本任务前端只是消费）
```

`htmlElementsData` 在前端纯本地渲染，不需要协议字段。

---

### 前端子提示词

```
你是一名资深 globe.gl 数据可视化工程师。请把"外交飞线 + 首都光点 + 涟漪 + 势力标签"叠加到球体上。

【项目背景】
任务 1-3 已落地球体 + 拼花 + 美学层。本任务消费 resolve.diplomatic_arcs / resolve.ripple 与 room.world_geometry.factions，渲染 globe.gl 内置数据层。

【球体地图升级期红线】
（略）

【本任务允许做以下事情】

1. 新建 src/render/globe/dataLayers.ts：
   - buildArcsData(arcs[]) → globe.gl arcsData 格式
     - { startLat, startLng, endLat, endLng, color: [start, end], stroke: 0.6, dashLength: 0.3, dashGap: 0.05, dashAnimateTime: arc.kind==='private'?2000:1500 }
   - buildPointsData(capitals[]) → globe.gl pointsData
     - { lat, lng, color: faction.glow, radius: 0.6, altitude: 0.01, label: faction.name }
   - buildRingsData(ripples[]) → globe.gl ringsData
     - { lat, lng, maxR: ripple.max_radius, propagationSpeed: ripple.max_radius/ripple.ttl_ms*1000, repeatPeriod: ripple.ttl_ms, color: ripple.color }
   - buildHtmlElementsData(factions[]) → 势力名称浮标
     - 每个 capital 对应一个 div：`<div class="faction-label">名称 + 状态徽章</div>`
     - 通过 globe.htmlElementsData + globe.htmlElement = (d) => createLabelDiv(d)
     - 注意：DOM 元素通过 CSS2DRenderer 渲染，避免高频更新

2. 在 MapStageGlobe.tsx 中接入：
   - useEffect 监听 gameStore.diplomaticArcs / ripples / worldGeometry.factions 变化：
     - globe.arcsData(buildArcsData(arcs))
     - globe.pointsData(buildPointsData(capitals))
     - globe.ringsData(buildRingsData(ripples))
     - globe.htmlElementsData(buildHtmlElementsData(factions))
   - 配置 arc 动画：globe.arcDashLength(0.3).arcDashGap(0.05).arcDashAnimateTime(d => d.dashAnimateTime).arcColor(d => d.color).arcStroke(d=>d.stroke).arcAltitudeAutoScale(0.4)
   - 配置 point: globe.pointColor(d=>d.color).pointRadius(d=>d.radius).pointAltitude(d=>d.altitude)
   - 配置 ring: globe.ringColor(d=>d.color).ringMaxRadius(d=>d.maxR).ringPropagationSpeed(d=>d.propagationSpeed).ringRepeatPeriod(d=>d.repeatPeriod)

3. 协议层：
   - src/protocol/types.ts 新增 DiplomaticArc / Ripple 接口。
   - dispatcher 新增路由：'resolve.diplomatic_arcs' / 'resolve.ripple'。
   - gameStore 切片：
     - diplomaticArcs: DiplomaticArc[]  保持最近 ttl_ms 内的活跃 arcs
     - ripples: Ripple[]                同上
   - 自动 expire 用 setTimeout + cleanup（任务 5 引入 RAF 主循环时会重构）。

4. 标签 CSS（src/render/globe/labels.module.css）：
   - .faction-label  font-mono, 12px, color: faction.glow, text-shadow neon
   - .faction-badge  小徽章显示势力状态（中立 / 友好 / 敌对）
   - pointer-events: none

5. mock 数据：
   - 在 src/mock/diplomaticArcs.ts 生成 mock arcs 与 ripples，用于 USE_WS=false 调试。

6. 单元测试：
   - buildArcsData / buildPointsData / buildRingsData 输入输出测试。
   - arc/ripple expire 测试。

7. 验证：
   - tsc / lint / test 全绿。
   - dev：发送一条演讲，球体上出现从演讲势力首都到全球势力的多条 dashed arcs；密谈出现两点之间单线 arc；演讲涟漪从首都扩散。
   - 60fps，arcs 同时存在 ≤24 条。

【禁止做的事】
- 不要在本任务实现爆炸 VFX（任务 5 负责）。
- 不要让 arc 永久存在（必须 ttl 过期）。
- 不要让 ring 重复无限循环（必须有 ttl）。
- 不要在 htmlElements 内挂业务交互（如点击进入势力面板）—— 这是任务 7 镜头叙事的事。
- 不要修改 globe.gl 内部代码。
- 不要把 arc 路径写死（必须从 capital lat/lng 计算）。

【验收标准】
1. dataLayers.ts 输出格式正确。
2. 协议路由新增。
3. gameStore 切片含自动 expire。
4. 标签样式符合美学。
5. 演讲事件触发 7 条飞线 + 1 个涟漪。
6. 密谈事件触发 1 条 arc。
7. 60fps + ≤24 arcs。
8. tsc / lint / test 全绿。

完成后输出：
（1）修改 / 新增文件清单；
（2）演讲 / 密谈触发的 arc 数量对照；
（3）验证摘要。
```

### 后端子提示词

```
你是一名资深后端 service 工程师。请在 SettlementService / ActionService 中产出 resolve.diplomatic_arcs 与 resolve.ripple 事件，把外交事件可视化到地图。

【项目背景】
任务 4 前端要消费 arcs / ripples 数据层。本任务在后端 resolve 阶段把已有的演讲 / 密谈 / 条约事件映射为 arcs，把演讲涟漪映射为 ripples。

【球体地图升级期红线】
（略）

【本任务允许做以下事情】

1. 新建 app/services/arc_builder.py：
   - build_arcs_from_events(events: list[Event], capitals: dict[FactionId, Capital]) -> list[ArcSpec]
     - 演讲 → 1→其它势力 N-1 条 dashed arc（每条 ttl=4000ms，color=演讲方 primary→对方 glow）
     - 密谈 → 双向 arc（2s）
     - 条约 → 实线 alliance arc（6s）
     - 宣战 → 红色粗 arc（8s）+ 附带 ripple
     - 贸易 → 黄色细 arc（5s）
   - build_ripples_from_events(events) -> list[RippleSpec]
     - 演讲 → 单 ripple 在演讲方 capital，cyan 色 max_radius=300
     - 宣战 → 红 ripple max_radius=500
     - 城市陷落 → 黑 ripple max_radius=200（任务 6 复用）

2. 修改 app/protocol/outgoing.py：
   - 新增 DiplomaticArcsEvent / RippleEvent。
   - payload 含 arc list / ripple list。
   - 注册 routing.py。

3. 修改 app/services/settlement_service.py：
   - resolve 末尾调用 arc_builder，将 events 中带空间含义的子集映射为 arcs/ripples。
   - 通过 outbound_dispatcher.emit 下发。

4. 修改 app/services/action_service.py（仅 resolve 期，行动期不动）：
   - speak/private 完成入栈到 EventLog 时已有 actor_faction，不需新增字段；arc_builder 从 EventLog 读。

5. 测试：
   - test_arc_builder.py：
     - 演讲事件 → arcs 数 == N-1（N=7 势力）。
     - 密谈 → arcs 数 == 1（含双向 color array）。
     - 条约/宣战/贸易 类型映射正确。
     - 颜色与势力 palette 一致。
   - test_protocol.py：新事件序列化往返。

6. PROTOCOL_AUDIT.md 更新。

7. 验证：
   - pytest 通过。
   - ruff 通过。

【禁止做的事】
- 不要在 action 期下发 arcs（必须 resolve 期）。
- 不要让 arc 颜色硬编码（必须从 faction palette）。
- 不要让 arc / ripple ttl 由前端决定（后端给出）。
- 不要让 capital 经纬度在 arc 事件中重复发送大块数据（前端已有 world_geometry.factions）。

【验收标准】
1. arc_builder 完整。
2. 协议事件注册。
3. settlement 集成。
4. ≥6 条单测全绿。
5. ruff 通过。

完成后输出：
（1）修改 / 新增文件清单；
（2）事件类型 → arc 数量对照；
（3）pytest 摘要。
```

### 预期产物

- 前端：dataLayers / 协议 / store / 标签样式 / mock / 测试。
- 后端：arc_builder / 协议事件 / settlement 集成 / 测试。

### 验收标准（端到端联合）

1. 演讲事件触发 7 条 dashed arc + 1 个 cyan ripple。
2. 密谈触发 1 条双色 arc（双向）。
3. 条约触发 alliance 色实线 arc（6s 持续）。
4. arc / ripple 在 ttl 后自动消失。
5. 60fps 稳定，arc ≤ 24 条同时。

### 禁止事项

- 禁止行动期发 arcs。
- 禁止前端写死颜色。
- 禁止 arc 永久存在。
- 禁止 htmlElements 业务交互。

---

## 任务 5：战争爆炸 VFX 闭环（resolve.event.explosion）

### 使用场景

当 resolve 阶段产出"军事冲突"事件（侵略、战役、城市陷落、轰炸），后端下发 `resolve.event.explosion` 含坐标 + 规模 + 类型 + 持续时间。前端在 globe 上 underlying THREE 注入一个粒子爆炸系统，按 (lat,lng) 在球面对应位置爆发。

### 当前状态

- resolve.events 包含 military 事件但只走事件流文本。
- 球体上无任何战争 VFX。
- mapStore.explosionQueue 占位但未消费。

### 契约对齐

```
S → C   resolve.event.explosion
        payload:
          id: string
          turn: int
          attacker_faction: FactionId
          defender_faction: FactionId
          center_lat: float
          center_lng: float
          radius_km_estimate: float   （由 LLM 给出，任务 6 决定）
          kind: 'conventional'|'nuke'|'aerial'|'naval'|'uprising'|'siege'
          intensity: float 0..1
          ttl_ms: int   （动画持续时间，建议 4000）
          casualties_estimate: int    （用于伤亡数字浮标）
          affected_hex_ids: string[]  （任务 6 由 LLM 给出，本任务可空）
```

爆炸 VFX 与"焦土染色"在本任务先分离：本任务**只做粒子爆炸 + 冲击波 ring**，焦土染色任务 6 做。

---

### 前端子提示词

```
你是一名资深 GPU 粒子 / VFX 工程师。请把 resolve.event.explosion 实现为 globe 球面上的粒子爆炸 VFX。

【项目背景】
任务 4 已搭好数据层；本任务往 underlying THREE.Scene 注入命令式粒子系统。爆炸点用 (lat,lng) 转球面坐标，粒子向外发射 + 冲击波 ring + 闪光 sprite，4 秒生命周期。

【球体地图升级期红线】
（略）

【技术栈】
- THREE.InstancedMesh + InstancedBufferAttribute（GPU 实例化）。
- vertex shader 做粒子动力学（time uniform，避免 CPU 每帧改 attribute）。
- 复用任务 3 的 EffectComposer（bloom 让闪光更明显）。

【本任务允许做以下事情】

1. 新建 src/render/globe/explosionFx.ts：
   - latLngToVec3(lat, lng, altitude) → THREE.Vector3。
   - createExplosionEmitter(scene, config) → ExplosionHandle
     - config: { centerLat, centerLng, intensity, kind, ttl_ms }
     - 创建 InstancedMesh(SphereGeom 0.4 radius, ParticleShaderMat, count=intensity*200)
     - 每个 instance attribute: aSeed / aDir(球面切线方向) / aSpeed(intensity 决定)
     - vertex shader 计算 pos = origin + dir * speed * t  并按 ttl 衰减 size
     - kind 决定颜色：conventional→orange-red, nuke→white-cyan, aerial→orange-yellow, naval→blue-white, uprising→purple-red, siege→brown
   - createShockwaveRing(scene, config) → ShockwaveHandle
     - RingGeometry 在球面 normal 方向放置
     - ShaderMaterial 控制 outer radius 随时间扩张
   - createMuzzleFlash(scene, config) → FlashHandle
     - 一次性 Sprite 1 帧 alpha=1，3 帧 fade
   - 每个 handle 暴露 update(dtMs) / dispose() / isAlive()
   - 总入口 spawnExplosion(scene, event) 返回 ExplosionHandle 聚合体（包含 emitter + ring + flash）

2. 新建 src/render/globe/fxLoop.ts：
   - 维护活跃 handles 数组。
   - useFxLoop hook 注册到 globe.tickFunction（globe.gl 暴露 onZoom / onTick；如无 onTick 则自己 requestAnimationFrame 内串联 composer 与 fx update）。
   - 每帧遍历 handles 调用 update(dt)，已死则 dispose。

3. 修改 MapStageGlobe.tsx：
   - 订阅 mapStore.explosionQueue：
     - 每出现一个 event，调用 spawnExplosion(scene, event)，并 mapStore.consumeExplosion(event.id)。
     - 持有 handles ref。
   - dispose 全部 handles 在 unmount。

4. 修改 mapStore.ts：
   - enqueueExplosion(event) 真正实现。
   - consumeExplosion(id) 真正实现。
   - explosionQueue 持有近 30 个事件作为环形缓冲（避免内存膨胀）。

5. dispatcher / 协议：
   - dispatcher 路由 'resolve.event.explosion' → gameStore.handleExplosion → mapStore.enqueueExplosion。
   - protocol/types.ts 新增 ExplosionEvent 接口。

6. 视觉测试 mock：
   - 在 SettingsPanel 新增 "[Debug] 触发模拟爆炸" 按钮（dev 环境可见），在屏幕坐标处随机选 lat/lng 调用 spawnExplosion。
   - 6 种 kind 可单独触发。

7. 单元测试：
   - latLngToVec3 正交单元测试。
   - explosionFx 的生命周期（spawn / update / dispose）。
   - mapStore.explosionQueue 环形缓冲行为。

8. 性能与回归：
   - 同时存在 ≤6 个 explosion handles，1080p 中端 GPU 仍 60fps。
   - VRAM 增量 <40MB。
   - 4s 后 handles 全部 disposed，scene.children 数恢复基线。

9. 视觉回归文档：
   - VISUAL_REGRESSION_GLOBE.md 新增 6 种 kind 截图描述。

10. 验证：tsc / lint / test 全绿；dev 中按 Debug 按钮可见爆炸。

【禁止做的事】
- 不要用 CPU 每帧改 InstancedBufferAttribute（必须 vertex shader 用 time uniform 驱动）。
- 不要超 600 instance per explosion（性能基线）。
- 不要让 explosion handle 永不释放。
- 不要在 explosionFx 里调用 globe.gl 数据层 API（独立于 hex/arc/point）。
- 不要在本任务实现焦土染色（任务 6 负责）。
- 不要在本任务实现镜头自动 zoom（任务 7 负责）。
- 不要把粒子贴图换成 emoji 或大尺寸 PNG（用程序化 shader）。
- 不要让爆炸位置漂移（必须钉在球面 lat/lng，跟随球体旋转）。

【验收标准】
1. explosionFx 模块完整，6 种 kind 可视化区分明显。
2. fxLoop 接入 globe tick，无双层 RAF。
3. mapStore explosion 环形缓冲正确。
4. Debug 按钮可在 dev 触发 6 种爆炸。
5. ≤6 个并发 explosion 60fps。
6. 4s 后 handles 全部 disposed。
7. VRAM 增量 <40MB。
8. tsc / lint / test 全绿。
9. VISUAL_REGRESSION_GLOBE.md 含 6 种截图描述。

完成后输出：
（1）修改 / 新增文件清单；
（2）6 种 kind 性能数据（粒子数 / 时长 / VRAM）；
（3）handles 残留数（动画结束后）；
（4）验证摘要。
```

### 后端子提示词

```
你是一名资深后端 service / 协议工程师。请把"军事冲突"类事件转换为 resolve.event.explosion 出站事件（不含 LLM 范围判定，任务 6 才接 LLM）。

【项目背景】
任务 5 前端要消费爆炸事件。本任务用**规则法**（无 LLM）从已有 military_event 派生 explosion payload：取 attacker / defender 的中心 region 作为 center_lat/lng，按事件子类型映射 kind，按损失数字映射 intensity。

【球体地图升级期红线】
（略）

【本任务允许做以下事情】

1. 新建 app/services/explosion_dispatcher.py：
   - dispatch_explosions(events: list[Event], world_geometry, scorched_state) -> list[ExplosionPayload]
     - 筛选 EventKind 属于 {invasion, battle, siege, bombing, naval_assault, uprising, nuclear_strike}
     - 取 attacker 与 defender 的 conflict_region.lat/lng 作为 center（防御方为主）。
     - kind 映射规则：
       invasion → conventional
       battle → conventional
       siege → siege
       bombing → aerial
       naval_assault → naval
       uprising → uprising
       nuclear_strike → nuke
     - intensity = clamp(casualties / 10000, 0.2, 1.0)
     - ttl_ms：nuke=6000, siege=5000, 其它=4000
     - radius_km_estimate：基于 kind 与 intensity 的常量表（任务 6 由 LLM 覆盖）：
       conventional=120, aerial=80, naval=150, siege=60, uprising=40, nuke=400
     - casualties_estimate 直接来自事件字段。
     - affected_hex_ids: [] （本任务先空，任务 6 由 LLM 填）。

2. 新增 app/protocol/explosion_events.py：
   - ExplosionPayload pydantic model（与契约对齐）。
   - ExplosionEvent envelope。
   - 注册 routing.py。

3. 修改 app/services/settlement_service.py：
   - resolve 末尾调用 explosion_dispatcher.dispatch_explosions。
   - 与 arc_builder 平级，先 arcs 后 explosions（前端按 message order 处理动画堆叠）。

4. 修改 app/services/arc_builder.py：
   - 对 military 事件，额外加一条与 explosion 同步的红色 thick arc（attacker capital → defender capital，4s）。

5. 测试：
   - test_explosion_dispatcher.py：
     - 7 种事件类型映射 kind 正确。
     - intensity clamp 边界（casualties=0 → 0.2; casualties=20000 → 1.0）。
     - ttl_ms 映射。
     - radius_km_estimate 常量。
     - center 取 defender 的 region.lat/lng。
   - test_protocol.py：ExplosionEvent 往返。

6. PROTOCOL_AUDIT.md 更新：
   - "球体地图扩展"段落含 resolve.event.explosion 完整 schema。

7. 验证：
   - pytest 通过。
   - ruff 通过。

【禁止做的事】
- 不要在本任务调用 LLM（任务 6 负责）。
- 不要让 affected_hex_ids 在本任务非空。
- 不要让 explosion 在 action 期下发。
- 不要让 center 漂浮（必须落在某个 region.lat/lng 上）。
- 不要让 intensity 超 1。
- 不要让 nuke 的 radius 超 1000km（防止前端冲击波画布越界）。

【验收标准】
1. explosion_dispatcher 完成 + 7 种映射。
2. ExplosionEvent 协议 + 路由。
3. settlement 集成。
4. arc_builder 同步红 arc。
5. ≥8 条单测全绿。
6. ruff 通过。

完成后输出：
（1）修改 / 新增文件清单；
（2）7 种事件 → kind 映射表；
（3）pytest 摘要。
```

### 预期产物

- 前端：explosionFx / fxLoop / mapStore / 协议 / Debug 按钮 / 测试 / VISUAL_REGRESSION_GLOBE.md。
- 后端：explosion_dispatcher / 协议事件 / settlement 集成 / arc_builder 同步红 arc / 测试。

### 验收标准（端到端联合）

1. resolve 期触发战役事件，球体上 4s 内出现完整爆炸动画。
2. 6 种 kind 颜色 / 粒子风格区分明显。
3. arc + explosion 同步播放。
4. ≤6 并发 explosion 仍 60fps。
5. action 期不会触发 explosion。

### 禁止事项

- 禁止本任务调用 LLM。
- 禁止 affected_hex_ids 非空。
- 禁止焦土染色（任务 6）。
- 禁止镜头 zoom（任务 7）。

---

## 任务 6：LLM 范围判定 + 焦土状态机

### 使用场景

任务 5 用规则法给爆炸打 radius_km_estimate 与 kind。本任务接入 **真实 / mock LLM**，让模型判定：
- **affected_hex_ids**：哪些 hex 单元被波及（球面圆形 + 地形 + 风向 + 政治影响）。
- **scorched_turns**：焦土持续几回合。
- **fallout_severity**：放射污染（仅 nuke）。
- **economic_loss**：经济损失（影响目标势力 resource_value）。

前端在收到 `resolve.scorched_diff` 后，把对应 hex 染色为焦土灰黑，并保持到 scorched_turns 过期。

### 当前状态

- 任务 5 的 affected_hex_ids 仍为空数组。
- 焦土状态机不存在。
- mapStore.scorchedRegions 占位但未消费。

### 契约对齐

```
LLM Prompt 输入：
  event 信息（attacker / defender / kind / intensity / location）
  capital 与受影响 region 的 lat/lng 与 terrain
  邻接关系
  当前焦土状态
  当前回合数

LLM 输出 JSON（严格 schema）：
  {
    "affected_hex_ids": ["H4_00123", "H4_00124", ...],
    "primary_hex_id": "H4_00123",
    "scorched_turns": 3,
    "fallout_severity": 0.0,
    "economic_loss_pct": 0.18,
    "narrative_hint": "极光共和的北部三个 hex 在熔岩议会的空袭中陷入火海..."
  }

S → C   resolve.event.explosion   （任务 5 已定，本任务把 affected_hex_ids 填上 + radius_km 由 LLM 给）
S → C   resolve.scorched_diff
        payload:
          changes: [{hex_id, scorched_turns_remaining, fallout, scorched_since_turn}]
          turn: int

S → C   resolve.event.explosion 的 payload 新增字段：
          narrative_hint: string
          primary_hex_id: string
          economic_loss_pct: float
```

---

### 前端子提示词

```
你是一名资深前端状态机 / 渲染状态工程师。请把"焦土染色"在 globe 上落地，并接入 LLM 给出的 affected_hex_ids。

【项目背景】
任务 5 的爆炸 VFX 已落地，但只有粒子，没有持久焦土效果。本任务消费 resolve.scorched_diff，把对应 hex 染色 / 高度抬升变化 / 边界加深 / 漂浮烟雾。

【球体地图升级期红线】
（略）

【本任务允许做以下事情】

1. 修改 src/store/mapStore.ts：
   - scorchedRegions: Map<hex_id, { since_turn, ttl_turns, severity, fallout }>
   - applyScorchedDiff(payload) 增量合并。
   - 每回合 turn.begin 时调用 advanceScorched(turn)：到期的 hex 移除。

2. 修改 src/render/globe/stylePresets.ts：
   - hexPolygonColor(region, ctx) 增加焦土支路：
     - 如果 hex 在 scorchedRegions：
       baseColor = '#202020'
       primaryColor lerp baseColor by severity（0.6..0.9）
       如果 fallout>0：色相偏绿 + 闪烁 alpha
   - hexPolygonAltitude(region) 焦土地区抬升 ×0.5（地表下陷视觉）。

3. 修改 MapStageGlobe.tsx：
   - 监听 mapStore.scorchedRegions 变化，调用 globe.hexPolygonColor(...) 触发 globe.gl 内部重渲染。
   - 焦土 hex 上方注入 SmokeColumn（持续烟柱）：
     - 新建 src/render/globe/smokeColumn.ts：InstancedMesh + 向上 drift shader。
     - 持续到 ttl 过期。

4. 协议：
   - dispatcher 新增路由 'resolve.scorched_diff' → gameStore.applyScorchedDiff → mapStore.applyScorchedDiff。
   - resolve.event.explosion 的 payload 新增 affected_hex_ids / narrative_hint / primary_hex_id / economic_loss_pct（schema 升级）。
   - PROTOCOL_AUDIT.md 同步。

5. 事件流叙事 hint：
   - 在 EventStream 面板，爆炸事件如有 narrative_hint，以斜体次行显示（不替换原 LLM 叙事，只补充）。

6. 单元测试：
   - applyScorchedDiff / advanceScorched 状态机测试。
   - smokeColumn 生命周期。
   - hexPolygonColor 焦土支路边界值。

7. 视觉回归：
   - VISUAL_REGRESSION_GLOBE.md 新增"爆炸后 3 回合焦土演变"截图描述。

8. 验证：tsc / lint / test 全绿；dev 中触发战役，3 回合内目标 hex 持续显示焦土，3 回合后恢复。

【禁止做的事】
- 不要让焦土永久（必须 ttl_turns 到期清除）。
- 不要在前端推断 affected_hex_ids（必须从协议读）。
- 不要让 smoke 在所有焦土 hex 都飘（severity<0.4 不飘）。
- 不要让焦土染色覆盖任务 4 的 arc / point / ring 渲染顺序。
- 不要修改 hexPolygonsData 数据结构。
- 不要把 fallout 视觉做成"绿色雾"覆盖整片区域（仅在 hex 颜色上偏移色相 + alpha 闪烁）。

【验收标准】
1. mapStore 焦土状态机完整。
2. stylePresets 焦土支路。
3. smokeColumn 模块。
4. 协议路由 + payload 升级。
5. 事件流斜体 hint 显示。
6. 单测全绿。
7. 视觉对照截图描述完成。

完成后输出：
（1）修改 / 新增文件清单；
（2）焦土状态机 3 回合演变描述；
（3）验证摘要。
```

### 后端子提示词

```
你是一名资深 LLM 调度 / 后端服务工程师。请实现"爆炸范围 LLM 判定 + 焦土状态机"。

【项目背景】
任务 5 已给出爆炸事件骨架，但 affected_hex_ids 为空。本任务在 SettlementService 中对每条 military event 调用 LLM，得到精确的受影响 hex 列表与焦土参数，然后驱动 ScorchedService 推进每回合的焦土生命周期。

【球体地图升级期红线】
（同前端，特别强调：本任务 LLM 调用必须发生在 resolve 阶段，且必须有 mock provider fallback）

【技术栈】
- LLM provider：复用同步完善任务 1 已实现的 OpenAICompatibleClient / ClaudeCompatibleClient / MockLLMClient。
- 结构化输出：JSON schema 强约束（pydantic 校验）。

【本任务允许做以下事情】

1. 新建 app/llm/explosion_prompt.py：
   - build_explosion_judge_prompt(event, world_geometry, scorched_state, turn) -> str
   - System Prompt（中文）模板：
     ```
     你是《外交风云》中的战场范围判定模型。你的工作是给一个军事冲突事件确定波及的 hex 单元、焦土持续时间、放射污染、经济损失。
     ...
     规则：
     1. 只能使用提供的 hex 邻接关系扩散。
     2. 中心 hex 必须在 affected_hex_ids 第一位。
     3. nuke 半径不超过 400km（约 8 个 hex）。
     4. conventional 半径不超过 120km（约 2-3 hex）。
     5. 海洋 hex 不会变焦土，但纳入 affected_hex_ids 表示军舰损失。
     6. scorched_turns ∈ [1, 6]，nuke 必须 >=4。
     7. 输出必须是严格 JSON，无前后多余字符。
     ```
   - User Prompt 含 event 细节 + 邻接子图（中心 hex + 2 跳邻居）+ 当前焦土状态。

2. 新建 app/llm/output_schema.py 增加 ExplosionJudgeOutput：
   - pydantic model: affected_hex_ids / primary_hex_id / scorched_turns / fallout_severity / economic_loss_pct / narrative_hint。
   - 校验：primary 在 affected 内；affected 长度 ≤16；turns 1..6；fallout 0..1。

3. 新建 app/game/explosion_resolver.py：
   - resolve_explosion(event, world_geometry, scorched_state, llm_client) -> ExplosionResolution
     - 调用 build_explosion_judge_prompt。
     - llm_client.call_explosion_judge(prompt) → JSON。
     - pydantic 解析；失败 fallback 到规则法（任务 5 的常量表）。
     - 返回 ExplosionResolution 含完整 ExplosionPayload + scorched_diff。

4. 新建 app/services/scorched_service.py：
   - state: Dict[hex_id, ScorchedEntry(since_turn, ttl_turns, severity, fallout)]
   - apply(resolutions: list[ExplosionResolution], turn: int) -> list[ScorchedChange]
   - advance(turn: int) -> list[ScorchedChange]
     - 每个 entry ttl_turns-=1；到 0 删除并发"recovered"。
   - economic_impact(faction_id, turn) -> float
     - 该势力所有焦土 hex 的 resource_value 衰减比例。

5. 修改 app/services/settlement_service.py：
   - resolve 阶段：
     1. arc_builder
     2. for event in military_events:
          resolution = explosion_resolver.resolve_explosion(event, world_geometry, scorched_state, llm)
          explosions.append(resolution.payload)
        scorched_diff = scorched_service.apply(resolutions, turn)
     3. emit resolve.event.explosion(每条) + resolve.scorched_diff
     4. apply economic_impact 到 faction.resource_value

6. 修改 app/protocol/explosion_events.py：
   - ExplosionPayload 加 affected_hex_ids / narrative_hint / primary_hex_id / economic_loss_pct。
   - 新增 ScorchedDiffEvent + ScorchedChange schema。

7. 修改 app/llm/mock_client.py：
   - call_explosion_judge(prompt) 返回 deterministic 模拟：
     - 解析中心 hex_id 与 kind。
     - kind=nuke → 7 邻居（2 跳）+ scorched=5 + fallout=0.6
     - conventional → 3 邻居（1 跳）+ scorched=2 + fallout=0
     - aerial → 2 邻居 + scorched=1
     - naval → 4 海洋邻居 + scorched=0（仅 affected）
     - 其它对应规则。
   - 用 hex_id 做 seed 保证 deterministic。

8. 修改 app/llm/real_client.py（OpenAI/Claude 兼容）：
   - call_explosion_judge(prompt) 用 response_format=json_object + schema validator。
   - 超时 8s；3 次重试指数退避；最终 fallback 到 mock。

9. 测试：
   - test_explosion_resolver.py：
     - mock LLM 返回不合法 JSON → fallback 到规则法。
     - mock 正常返回 → ExplosionResolution 完整。
     - nuke 输出 affected_hex_ids ≥ 5。
     - primary 必在 affected。
   - test_scorched_service.py：
     - apply / advance 状态机。
     - 6 回合后所有 1-turn 焦土清空。
     - economic_impact 比例正确。
   - test_protocol.py：ScorchedDiffEvent 往返。
   - test_settlement_service.py：完整 resolve 流的 emit 顺序。

10. PROTOCOL_AUDIT.md 更新。

11. 验证：
    - LLM_PROVIDER=mock 全跑通。
    - 真实 provider 需 env 配 key，但本任务不强制（保留 mock fallback）。
    - pytest 通过；ruff 通过。

【禁止做的事】
- 不要在 action 期调用 LLM。
- 不要让 explosion_resolver 直接调用 OpenAI client（必须通过 LLM provider 抽象）。
- 不要让 mock 的输出随机（必须 deterministic）。
- 不要让 LLM 输出影响协议字段 schema 之外的字段（严格校验）。
- 不要让 scorched 永远不衰减。
- 不要让 LLM 直接修改 faction.resource_value（必须经 economic_impact 函数）。
- 不要把整张 world_geometry 喂给 LLM（必须只喂中心 + 2 跳邻居）；prompt token 上限 < 2000。
- 不要 retry 5 次以上（最多 3 次）。

【验收标准】
1. explosion_prompt / explosion_resolver / scorched_service / 协议 / mock / real client 全部就位。
2. mock 全 deterministic。
3. real provider 实现 schema 校验 + retry + fallback。
4. ≥12 条单测全绿。
5. ruff 通过。
6. PROTOCOL_AUDIT.md 更新。
7. settlement 完整 resolve 流 emit 顺序正确（arcs → explosions → scorched_diff）。

完成后输出：
（1）修改 / 新增文件清单；
（2）mock 7 种 kind 输出对照表；
（3）prompt token 大小估算（中心 + 2 跳邻居 = 估算 N hex × M token）；
（4）pytest 摘要。
```

### 预期产物

- 前端：mapStore 焦土状态机 / stylePresets 焦土支路 / smokeColumn / 事件流 hint / 协议路由 / 测试 / VISUAL_REGRESSION_GLOBE.md。
- 后端：explosion_prompt / explosion_resolver / scorched_service / mock 升级 / real client / 协议升级 / settlement 集成 / 测试。

### 验收标准（端到端联合）

1. dev-up 后触发战役：球体爆炸 + 受影响 hex 焦土染色 + 烟柱 + 事件流叙事 hint。
2. 同回合多条军事事件分别 emit explosion + 合并到一条 scorched_diff。
3. 3-5 回合后焦土自动清除。
4. nuke 的 affected_hex_ids 明显大于 conventional。
5. 经济损失反映在势力 resource_value 衰减。
6. LLM_PROVIDER=mock 与 real 均跑通；real 异常时 fallback 到 mock 无报错。
7. action 期不调用 LLM（架构红线）。

### 禁止事项

- 禁止 action 期调用 LLM。
- 禁止 mock 非 deterministic。
- 禁止 prompt 超 2000 token。
- 禁止 retry > 3。
- 禁止焦土永久。
- 禁止 LLM 直接改 faction 字段。

---

## 任务 7：镜头叙事（自动 zoom + 月观回归）

### 使用场景

大事件发生时，相机应自动从"月观远景"平滑 zoom 到事件中心；2 秒后回到全景。这是"电影感叙事"。镜头由前端 cameraDirector 统一调度，依据事件优先级与冲突。

### 当前状态

- 镜头一直保持 overview altitude=2.5，不响应事件。
- mapStore.cameraPreset 已有 'overview' / 'focus' / 'cinematic' 但无具体行为。

### 契约对齐

```
不新增协议字段。镜头叙事由前端基于已有 resolve.event.explosion / resolve.diplomatic_arcs 触发。

mapStore 镜头状态：
  cameraPreset: 'overview' | 'focus' | 'cinematic'
  focusRegionId: string | null
  cinematicScript: CameraKeyframe[]
  CameraKeyframe: { lat, lng, altitude, duration_ms, easing }
```

---

### 前端子提示词

```
你是一名资深相机叙事 / Tween 工程师。请把"事件触发自动镜头切换"在 globe 上实现。

【项目背景】
任务 1-6 球体地图功能完整，但镜头不动。本任务用基于优先级的镜头调度器，让 nuke 触发 cinematic 飞行，conventional 触发短暂 focus，arc 不触发。

【球体地图升级期红线】
（略）

【本任务允许做以下事情】

1. 新建 src/render/globe/cameraDirector.ts：
   - 维护一个优先级队列：每个事件入栈含 priority (0=overview,1=focus_short,2=focus_long,3=cinematic)。
   - 同时只有一个活跃 keyframe sequence；更高优先级抢占低优先级（淡入淡出 300ms 过渡）。
   - 提供 onResolveEvent(event) 入口：
     - nuke → priority=3, cinematic 5 段 keyframe（远→拉近→旋转→冲击→远）
     - aerial / siege / naval / conventional → priority=2, focus 2.5s 后回 overview
     - speech (P0 演讲) → priority=1, 轻微 zoom 0.8s
     - 其它 → 不触发
   - tick(dt) 推进当前 keyframe，使用 cubic-bezier easing。
   - 调用 globe.pointOfView({lat,lng,altitude}, 0)  保持瞬时帧推进，不依赖 globe.gl 自带 transition（自带 transition 与并发冲突）。

2. 修改 MapStageGlobe.tsx：
   - useEffect 监听 mapStore.explosionQueue 的 enqueue 事件，调用 cameraDirector.onResolveEvent。
   - 监听 gameStore.resolve.events 的 speech P0，调用 director。
   - useFxLoop 主循环每帧调用 director.tick(dt)。

3. cinematic Script (nuke)：
   - 0ms: overview {lat:0, lng:0, alt:2.5}
   - 800ms ease-out: alt=1.4, lat=event.lat-15, lng=event.lng（侧上方）
   - 1600ms linear: alt=0.7, lat=event.lat, lng=event.lng（贴近）
   - 2800ms ease-in: alt=0.7, 旋转 lng+=60
   - 4400ms ease-out: alt=2.5, lat=0（回归月观）

4. focus Script (conventional/aerial/siege/naval)：
   - 0ms: 当前位置
   - 600ms ease-out: alt=1.2, target event.lat/lng
   - 1800ms hold
   - 2800ms ease-in: 回 overview

5. speech P0 Script：
   - 0ms: 当前
   - 400ms ease-out: alt -=0.3, target = speaker_capital.lat/lng
   - 1200ms hold
   - 2000ms ease-in: 回 overview

6. 设置开关：
   - SettingsPanel 新增"自动镜头"开关（cinematicEnabled）。
   - 关闭时所有事件不触发镜头，仅保留手动滑动。

7. 防晕动症：
   - 同一事件 5 秒内不重复 cinematic（去抖动）。
   - cinematicEnabled=false 时直接走 overview，不闪屏。
   - SettingsPanel 加"减少运动"切换（POSER 减半 keyframe 持续时长）。

8. 单元测试：
   - cameraDirector 优先级抢占测试。
   - keyframe easing 边界。
   - cinematicEnabled=false 行为。
   - 防抖去重。

9. 视觉回归：
   - VISUAL_REGRESSION_GLOBE.md 新增 nuke / conventional / speech 三段镜头脚本时间轴。

10. 验证：
    - tsc / lint / test 全绿。
    - dev：nuke 事件触发完整 5 段动画，无卡顿；conventional 短焦后回归；speech 轻微 zoom。
    - 60fps 稳定（叠加爆炸 VFX）。

【禁止做的事】
- 不要使用 globe.gl 自带 pointOfView({...}, durationMs) 的内置 tween（与 cameraDirector tick 冲突）；durationMs=0 立即应用，由 director 自己插值。
- 不要让低优先级抢占高优先级。
- 不要让镜头一次飞行超 5 秒（用户控制感丢失）。
- 不要在 cinematic 期间禁用用户拖拽（用户拖拽立即中断 director，回到 overview）。
- 不要让 speech P1/P2 触发镜头（噪声大）。
- 不要让镜头脚本里包含 alt<0.3（穿过地表）。

【验收标准】
1. cameraDirector 优先级 + tick 完整。
2. nuke/conventional/speech 三种脚本可视。
3. 开关与减运动切换可用。
4. 5 秒去抖。
5. 用户拖拽中断 director。
6. 60fps。
7. tsc / lint / test 全绿。

完成后输出：
（1）修改 / 新增文件清单；
（2）三种 script 时间轴；
（3）防晕动症策略说明；
（4）验证摘要。
```

### 后端子提示词

```
你是一名资深后端协议工程师。本任务后端**仅需补充事件优先级标记**，便于前端 cameraDirector 调度。

【项目背景】
任务 7 主要在前端。后端需要在 resolve.event.explosion 的 payload 中确保 intensity 字段可用；并对 P0 演讲事件在 EventLog 标注 cinematic_hint='speech'。

【球体地图升级期红线】
（略）

【本任务允许做以下事情】

1. 修改 app/protocol/outgoing.py：
   - ExplosionPayload 新增 cinematic_hint: Literal['nuke_cinematic','focus_short','focus_long','none'] = 'none'
   - 在 explosion_dispatcher 中根据 kind 自动填充：nuke → nuke_cinematic; siege/aerial/conventional/naval → focus_long; uprising → focus_short; other → none。

2. 修改 app/services/action_service.py 演讲事件 emit：
   - P0 演讲在 EventOut payload 中附加 cinematic_hint='speech'。
   - 其它 priority 不附加。

3. 测试：
   - test_explosion_dispatcher.py 新增 cinematic_hint 映射用例。
   - test_action_service.py 新增 P0 / P1 演讲 hint 对照。

4. PROTOCOL_AUDIT.md 更新。

5. 验证：pytest 通过；ruff 通过。

【禁止做的事】
- 不要新增独立 camera 事件（前端从已有事件推导）。
- 不要让 P1/P2 演讲带 hint。
- 不要让 hint 影响其它已有字段。

【验收标准】
1. ExplosionPayload + 演讲 EventOut 含 cinematic_hint。
2. 单测全绿。
3. ruff 通过。

完成后输出：
（1）修改 / 新增文件清单；
（2）pytest 摘要。
```

### 预期产物

- 前端：cameraDirector / MapStageGlobe 接入 / SettingsPanel 开关 / 测试。
- 后端：ExplosionPayload + 演讲 EventOut 的 cinematic_hint 字段 / 测试。

### 验收标准（端到端联合）

1. nuke 事件触发完整 5 段电影感镜头。
2. conventional 触发短焦点。
3. P0 演讲触发轻 zoom。
4. cinematicEnabled=false 完全不触发。
5. 用户拖拽立即接管。
6. 60fps 稳定。

### 禁止事项

- 禁止使用 globe.gl 内置 tween 并发。
- 禁止 P1/P2 演讲触发。
- 禁止镜头穿过地表。
- 禁止脚本 > 5 秒。

---

## 任务 8：性能档位 + 端到端总冒烟

### 使用场景

不同硬件需求差异巨大。本任务把 uiStore.mapQuality 三档（low/mid/high）与 globe 全配置项绑定，并执行端到端冒烟覆盖任务 1-7。

### 当前状态

- mapQuality 在 R3F 时代有意义，但 globe 接入后未联动。
- 没有覆盖球体地图 + 战争 VFX 全链路的冒烟脚本。

---

### 前端子提示词

```
你是一名资深性能工程师 + QA。请把性能档位与端到端冒烟落地。

【球体地图升级期红线】
（略）

【本任务允许做以下事情】

1. 修改 src/store/uiStore.ts：
   - mapQuality 三档与 globe 配置映射表（写到 stylePresets.ts）：
     low:  hexResolution=3, hexAltitude×0.5, bloom=off, starfield_density=0.3, particle_count×0.4, smokeColumn=off, cinematic=off, cells≈162
     mid:  hexResolution=4, hexAltitude×1.0, bloom=on(strength=1.0), starfield=0.7, particle×0.7, smoke=on, cinematic=on(focus only), cells≈642
     high: hexResolution=4, hexAltitude×1.0, bloom=on(strength=1.4), starfield=1.0, particle×1.0, smoke=on, cinematic=full, cells≈642
   - 仅 high 启用 cameraDirector cinematic（low/mid 只 focus_short）。

2. 修改 MapStageGlobe.tsx：
   - 监听 mapQuality 变化，更新 globe 全配置项。
   - 避免变更时整层重建（hexResolution 变化会重建 hex，可接受；其它热替换）。

3. SettingsPanel：
   - 三档分段控件 + 当前 fps 估算（最近 1s 平均帧时间）。
   - "推荐档"建议：1080p 中端 GPU → mid；4K / RTX 30+ → high；老 GPU / 笔记本 → low。

4. 端到端冒烟脚本 scripts/globe-smoke.ts：
   - playwright 启动 dev → 创建 4v4 房间 → 推进 5 回合 → 触发 1 次 nuke + 2 次 conventional + 5 次 speech。
   - 校验：
     - 任意时刻 fps >= 45 (high) / 55 (mid) / 58 (low)
     - 4s 后 explosion handles 全部 disposed
     - 5 回合后焦土如 ttl 过期则清除
     - 切换三档 30s 内无报错
     - 切换到 2D / R3F / globe 三次往返无内存泄漏
   - 输出 reports/globe-smoke-{ts}.html。

5. 视觉回归与性能基线文档：
   - docs/GLOBE_PERFORMANCE.md：三档 fps / VRAM / drawcalls / triangle count 实测表。
   - VISUAL_REGRESSION_GLOBE.md 总收口：附 1 张全功能合成图描述。

6. 单元测试不新增（端到端 playwright 已覆盖）。

7. 验证：
   - tsc / lint / test 全绿。
   - npm run smoke:globe 全通过。

【禁止做的事】
- 不要让 high 档默认（强迫用户切换）；默认应是 mid。
- 不要让档位切换变成"重 load 房间"（必须热替换）。
- 不要让 playwright 烟雾测试访问真实 LLM provider（LLM_PROVIDER=mock）。
- 不要在 smoke 脚本中跳过任何断言。

【验收标准】
1. 三档映射完整。
2. mapQuality 切换在 1 秒内生效。
3. 烟雾脚本覆盖任务 1-7 全链路。
4. GLOBE_PERFORMANCE.md 含三档实测表。
5. 60fps（mid）/ 45fps（high）满足。

完成后输出：
（1）修改 / 新增文件清单；
（2）三档实测表；
（3）烟雾脚本断言数量；
（4）验证摘要。
```

### 后端子提示词

```
你是一名资深后端 QA。请配合前端端到端冒烟，提供 dev-up + seed 房间脚本。

【球体地图升级期红线】
（略）

【本任务允许做以下事情】

1. 新建 scripts/dev-seed-globe.py：
   - 启动 uvicorn（LLM_PROVIDER=mock, LIGHTING_DYNAMIC=true）。
   - 创建房间 4v4 + 6 AI；start_room。
   - 推进 5 回合，每回合在 resolve 期注入：
     - 1 次 nuclear_strike（用 MockLLMClient 输出固定 deterministic）
     - 2 次 conventional battle
     - 5 次 P0 speech
   - 提供 HTTP /debug/v1/seed/globe 触发上述脚本（前端 playwright 用）。

2. 修改 app/api/rest/debug.py：
   - 新增 POST /debug/v1/seed/globe（仅 ENV=development）。
   - 调用 dev-seed-globe 流程。

3. 测试：
   - smoke：python scripts/dev-seed-globe.py 单跑 5 回合，校验 emit 顺序：
     room.world_geometry → turn.begin → action.broadcast×N → resolve.events → resolve.diplomatic_arcs → resolve.event.explosion×3 → resolve.scorched_diff → resolve.world_lighting (if dynamic) → ai.thinking / ai.speak (mock) → turn.end。

4. PROTOCOL_AUDIT.md 更新。

5. 验证：
   - 脚本本地跑通。
   - 任务 6 mock provider 输出 deterministic。

【禁止做的事】
- 不要让 /debug/v1/seed/globe 在 prod env 暴露。
- 不要在脚本里启用真实 LLM。
- 不要让 seed 跨进程持久化（仅当次进程）。
- 不要跳过任何 resolve 子阶段。

【验收标准】
1. dev-seed-globe.py 跑通。
2. /debug/v1/seed/globe 仅 dev 可用。
3. emit 顺序符合规范。
4. ruff 通过。

完成后输出：
（1）修改 / 新增文件清单；
（2）一次完整 5 回合 emit 序列截取；
（3）耗时统计。
```

### 预期产物

- 前端：mapQuality 映射 / SettingsPanel / smoke 脚本 / GLOBE_PERFORMANCE.md / VISUAL_REGRESSION_GLOBE.md 收口。
- 后端：dev-seed-globe / debug endpoint / 路径协议审计更新。

### 验收标准（端到端联合）

1. mid 档 60fps 稳定。
2. 全链路冒烟 playwright 跑通。
3. emit 序列符合契约。
4. 三档切换热替换。
5. 内存 / 切换 / 重连无泄漏。

### 禁止事项

- 禁止 high 档默认。
- 禁止 prod env 暴露 seed endpoint。
- 禁止真实 LLM。
- 禁止跳过断言。

---

## 附录 A：球体地图 8 条任务一览

| # | 任务标题 | 前端关键产物 | 后端关键产物 | 依赖 |
|---|---------|------------|------------|------|
| 1 | 球体容器接入 + 三态切换 | MapStageGlobe / MapSwitcher / mapStore | Region lat/lng/hex_id Optional | — |
| 2 | 球面虚构区块生成 | buildHexPolygons / world_geometry 路由 | globe_geometry.py / Voronoi / WorldGeometryEvent | 1 |
| 3 | 月观地球美学层 | starfield / postprocess / stylePresets | WorldLighting（可选） | 2 |
| 4 | Arcs / Points / Rings / Labels | dataLayers / 标签样式 | arc_builder / ripple_builder | 3 |
| 5 | 战争爆炸 VFX | explosionFx / fxLoop / Debug 按钮 | explosion_dispatcher / 协议 | 4 |
| 6 | LLM 范围判定 + 焦土 | scorchedRegions / smokeColumn | explosion_resolver / scorched_service / LLM prompt | 5 |
| 7 | 镜头自动叙事 | cameraDirector | cinematic_hint 字段 | 6 |
| 8 | 性能档位 + 端到端冒烟 | mapQuality 映射 / playwright | dev-seed-globe / debug endpoint | 7 |

## 附录 B：新增协议事件一览

| 事件 t | 方向 | 引入任务 | 说明 |
|--------|------|---------|------|
| room.world_geometry | S→C | 2 | 一次性下发球面 hex + 势力归属 |
| resolve.diplomatic_arcs | S→C | 4 | 外交飞线批 |
| resolve.ripple | S→C | 4 | 球面涟漪批 |
| resolve.event.explosion | S→C | 5/6 | 爆炸 VFX 事件（任务 5 骨架，任务 6 加 LLM 字段） |
| resolve.scorched_diff | S→C | 6 | 焦土增量 |
| resolve.world_lighting | S→C | 3 | 太阳方向（可选） |

## 附录 C：新增前端 store 切片一览

| Store | 切片 | 引入任务 |
|-------|-----|---------|
| mapStore.renderer | 'globe'\|'r3f'\|'2d' | 1 |
| mapStore.cameraPreset | 'overview'\|'focus'\|'cinematic' | 1 / 7 |
| mapStore.focusRegionId | string\|null | 1 / 7 |
| mapStore.explosionQueue | ExplosionEvent[] (ring buffer 30) | 5 |
| mapStore.scorchedRegions | Map<hex_id, ScorchedEntry> | 6 |
| mapStore.lighting | bloom / starfield / night | 3 |
| gameStore.worldGeometry | seed / cells / capitals | 2 |
| gameStore.diplomaticArcs | DiplomaticArc[] | 4 |
| gameStore.ripples | Ripple[] | 4 |

## 附录 D：新增后端模块一览

| 模块 | 路径 | 引入任务 |
|------|------|---------|
| 球面几何 | app/game/globe_geometry.py | 2 |
| 世界几何 domain | app/domain/world_geometry.py | 2 |
| 弧线生成器 | app/services/arc_builder.py | 4 |
| 爆炸分派 | app/services/explosion_dispatcher.py | 5 |
| 爆炸 LLM prompt | app/llm/explosion_prompt.py | 6 |
| 爆炸解析器 | app/game/explosion_resolver.py | 6 |
| 焦土服务 | app/services/scorched_service.py | 6 |
| 世界光照 | app/domain/world_lighting.py | 3 |
| 协议事件 | app/protocol/explosion_events.py | 5 / 6 |

## 附录 E：执行顺序建议

强串行：**1 → 2 → 3 → 4 → 5 → 6 → 7 → 8**。

每条任务完成后：
1. 前后端各自单端验收（pytest / vitest / ruff / tsc / lint 全绿）。
2. dev-up 联调一次（cmd: `npm run dev` + `uvicorn app.main:app --reload`）。
3. 用 `scripts/dev-seed-globe.py`（任务 8 提供）跑端到端 smoke。
4. 在 docs/PROTOCOL_AUDIT.md / VISUAL_REGRESSION_GLOBE.md / GLOBE_PERFORMANCE.md 更新。
5. 仅当上述四项全绿才进入下一任务。

## 附录 F：与 DESIGN.md 附录D 的差异声明

| 维度 | DESIGN.md 附录D | 本文档 v1.0 |
|------|----------------|------------|
| 主渲染 | Three.js 原生 + R3F | vanilla globe.gl |
| 能量场 SDF shader | 自研 | **推迟到 v2.0**，本期用 hex + bloom 替代 |
| 数据层 | three-globe 直接接入 | globe.gl 已内含 |
| Cobe 借鉴 | 大气散射 raymarching | 推迟（无大气美学不需要） |
| 粒子系统 | InstancedMesh + 50K | 维持，但 50K 改为 high 档上限 |
| LOD | 自研 | 由 globe.gl 内置 + mapQuality 三档 |

本期决策原因：MVP 节奏。v2.0 如需深度自研 shader，可在球体地图稳定后将 globe.gl 替换为 DESIGN.md 附录D 的原方案（mapStore.renderer 留好 'r3f' 槽位，迁移成本可控）。

---

> 文档结束。每条任务的前端 / 后端子提示词可单独复制给 AI 编程工具执行；端到端契约以本文档 §0 与各任务"契约对齐"段为准；与既有协议冲突时以 docs/PROTOCOL_AUDIT.md 最新版为准。
