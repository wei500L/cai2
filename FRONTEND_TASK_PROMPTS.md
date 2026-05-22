# 《外交风云》前端任务型提示词库

> 项目：《外交风云》— 人机混战 AI Diplomacy
> 版本：v1.0
> 用途：将下列任意一条任务提示词整段复制粘贴给 Cursor / Claude Code / Windsurf / Bolt / Lovable / v0 等 AI 编程工具即可独立执行，不依赖上下文，不依赖上一阶段。
> 每条提示词都已内置项目背景、技术栈、视觉规范、允许范围、禁止事项、产物清单、验收标准。

---

## 任务 1：初始化前端工程骨架

### 使用场景

项目从零开始，需要建立一个干净的 React + TypeScript + Vite + Tailwind + Zustand 工程骨架，预留好后续 18 项前端任务全部需要使用的目录与分层。后续所有任务都依赖这套骨架，因此本任务必须做到结构清晰、命名规范、可扩展。

### 可直接复制给 AI 编程工具的完整提示词

```
你是一名资深前端架构师。请为《外交风云》— 人机混战 AI Diplomacy 项目初始化一份 React + TypeScript + Vite + Tailwind CSS + Zustand 的前端工程骨架。

【项目背景】
《外交风云》是一款以自然语言为唯一核心操作方式的实时战略外交模拟器，玩家通过演讲、密谈、条约、宣战、威胁、欺骗、谈判等语言行为影响游戏世界。AI 势力拥有独立性格、记忆、情绪、欺骗倾向和关系网络。前端不是普通聊天页面，也不是普通后台系统，而是一个完整、精致、强交互、像素粒子风格的科幻战略游戏前端。

【技术栈（强制）】
- React 19
- TypeScript 严格模式
- Vite（不要使用 Next.js）
- Tailwind CSS
- Zustand
- Framer Motion（仅安装，不在本任务中使用）
- 不安装任何额外 UI 组件库（不要 antd / MUI / Chakra / shadcn）

【视觉风格说明（仅用于影响目录命名与基础样式，不在本任务中实现具体视觉）】
深色宇宙背景、像素粒子、全息 HUD、发光边界、八大势力色彩 token、无圆角直角切割、扫描线、能量场。

【本任务只允许做以下事情】
1. 使用 `npm create vite@latest` 等价方式生成 React + TS + Vite 项目。
2. 安装并配置：tailwindcss、postcss、autoprefixer、zustand、framer-motion、clsx。
3. 配置 tsconfig 为严格模式，添加路径别名 `@/*` 指向 `src/*`。
4. 配置 tailwind.config.ts 启用 darkMode、扫描 `src/**/*.{ts,tsx}`。
5. 创建以下目录结构（必须严格一致，目录可以是空目录加 `.gitkeep`）：

```
src/
  app/                       # 应用入口、Provider、全局路由
    App.tsx
    main.tsx
    routes.tsx
  pages/                     # 顶层页面（仅占位）
    LandingPage.tsx
    FactionSelectPage.tsx
    GamePage.tsx
    EpochSummaryPage.tsx
    ReplayPage.tsx
  features/                  # 业务特性模块
    landing/
    factionSelect/
    hud/
    commandTerminal/
    eventStream/
    relationsPanel/
    aiSpeech/
    map/
    phaseSystem/
    epochSummary/
    replay/
  components/                # 通用 UI 组件（GlowPanel、PixelButton 等留空目录）
  render/                    # 三维/粒子渲染（留空目录）
  effects/                   # 视觉特效（留空目录）
  store/                     # Zustand 全局状态
    gameStore.ts             # 仅创建空 store
    uiStore.ts               # 仅创建空 store
  mock/                      # mock 数据集中目录
    factions.ts              # 八大势力 mock，仅 id+name 占位
    events.ts                # 事件 mock 占位
    relationships.ts         # 关系 mock 占位
    gameState.ts             # 全局 mock 占位
  protocol/                  # 前后端协议适配层占位
    types.ts                 # incoming/outgoing message 类型占位
    adapter.ts               # mock adapter 占位
    transport.ts             # mock transport 占位
  hooks/
  utils/
  styles/
    globals.css
    tokens.css               # 仅创建空文件
```

6. 在 `src/app/main.tsx` 渲染 `<App/>`，在 `App.tsx` 内创建一个最简单的纯黑色背景页面，仅显示文字 "Diplomacy Frontend Bootstrap OK"，使用 Tailwind class，证明 Tailwind 工作正常。
7. 创建空 Zustand store（gameStore、uiStore），导出 hook 占位但不写任何字段。
8. 在 README 顶部追加一段中文说明，说明：本项目前端先用 mock 数据完成完整体验，后端以后通过 protocol / adapter 层替换。

【禁止做的事】
- 不要实现任何后端代码、API 路由、Server Action。
- 不要安装或调用任何真实 WebSocket。
- 不要安装任何 UI 组件库。
- 不要写真实 LLM 调用代码。
- 不要在本任务里写势力选择、HUD、地图、终端等任何业务功能。
- 不要写任何 demo 数据填充进 store，store 字段保持空。
- 不要使用 Next.js 替换 Vite。
- 不要修改基础页面之外的视觉，本任务的页面只允许显示一行确认文字。

【验收标准】
1. `npm run dev` 启动成功，浏览器看到纯黑底白字 "Diplomacy Frontend Bootstrap OK"。
2. `npm run build` 构建成功无报错。
3. 严格模式 TypeScript 通过类型检查。
4. 上述完整目录结构存在，路径别名 `@/` 在导入中可用。
5. Tailwind 工作正常（背景黑色由 Tailwind class 控制）。
6. Zustand 已安装且 store 文件存在并可导入。
7. mock 目录、protocol 目录均存在。
8. README 中已说明前后端隔离原则。

请按以上规范完成本任务。完成后输出文件树和关键文件的内容摘要。
```

### 预期产物

- `package.json` 中包含 react / react-dom / typescript / vite / tailwindcss / zustand / framer-motion / clsx。
- `tailwind.config.ts`、`postcss.config.js`、`tsconfig.json`（含 `@/*` 路径别名）。
- 完整目录结构 `src/{app,pages,features,components,render,effects,store,mock,protocol,hooks,utils,styles}`。
- `src/app/main.tsx`、`src/app/App.tsx`、`src/store/gameStore.ts`、`src/store/uiStore.ts`、`src/styles/globals.css`、`src/styles/tokens.css`。
- `README.md` 中含前后端隔离说明。

### 验收标准

1. `npm run dev` 启动后页面显示 "Diplomacy Frontend Bootstrap OK"。
2. `npm run build` 通过。
3. `tsc --noEmit` 通过（严格模式）。
4. 引入 `import x from '@/store/gameStore'` 可解析。
5. Tailwind 工具类生效。
6. 目录树严格符合规范。
7. 没有引入任何 UI 组件库。
8. 没有任何后端文件、API 路由、WebSocket 连接。
9. store 字段为空、mock 文件为空。
10. README 包含"前端 mock 优先 / 后端通过 protocol 替换"原则说明。

### 禁止事项

- 禁止实现任何业务功能（势力选择、地图、终端等）。
- 禁止安装 antd、MUI、Chakra、shadcn、Radix 等 UI 组件库。
- 禁止使用 Next.js。
- 禁止安装或运行真实 WebSocket / LLM SDK。
- 禁止在 store 中预填假数据。
- 禁止跳过路径别名配置。
- 禁止省略 protocol / mock 目录。

---

## 任务 2：建立像素粒子视觉设计系统

### 使用场景

工程骨架就绪后，需要先建立全局视觉语言。所有后续 UI、HUD、地图、效果都基于此设计系统。本任务不实现游戏功能，只产出 token + 基础组件 + 全局样式。

### 可直接复制给 AI 编程工具的完整提示词

```
你是一名资深前端视觉系统架构师。请为《外交风云》— 人机混战 AI Diplomacy 项目建立一套像素粒子风格的全局视觉设计系统。

【项目背景】
《外交风云》是一款以自然语言为唯一核心操作方式的实时战略外交模拟器，前端追求像素粒子、深色宇宙、全息 HUD、发光边界、能量场的科幻战略游戏质感。八大势力分别拥有 Primary / Glow / Shadow 三级色彩。

【技术栈】
React 19 + TypeScript 严格模式 + Vite + Tailwind CSS + Zustand + Framer Motion。不引入任何 UI 组件库。

【工程前提】
项目骨架已存在，结构为 `src/{app,pages,features,components,render,effects,store,mock,protocol,hooks,utils,styles}`，已配置路径别名 `@/*`。

【八大势力色彩 token（强制使用以下数值）】
- 铁冠帝国 ironCrown:     Primary #8B1A1A | Glow #FF3333 | Shadow #2D0A0A
- 星辉联邦 starlight:     Primary #1A5F8B | Glow #33AAFF | Shadow #0A1A2D
- 翡翠王庭 emerald:       Primary #1A8B3D | Glow #33FF77 | Shadow #0A2D15
- 灰烬部族 ashen:         Primary #8B5A1A | Glow #FF9933 | Shadow #2D1E0A
- 虚空教廷 voidChurch:    Primary #5A1A8B | Glow #9933FF | Shadow #1E0A2D
- 极光共和 aurora:        Primary #1A8B8B | Glow #33FFFF | Shadow #0A2D2D
- 熔岩议会 magma:         Primary #8B3A1A | Glow #FF6633 | Shadow #2D120A
- 暗潮商会 darkTide:      Primary #6B5A1A | Glow #CCAA33 | Shadow #231E0A

【设计规范（强制遵守）】
- 默认背景 #02040A 至 #050912 深色宇宙黑。
- 所有面板背景 rgba(0,0,0,0.6)，1px 发光边框。
- 全部直角切割，禁止圆角。
- HUD 字体使用等宽 + 科技感（建议 `JetBrains Mono` 或 `Share Tech Mono` 通过 Google Fonts 引入）。
- 数据数字呈现"滚动计数器"质感（视觉层面，本任务先做基础类）。
- 默认动画 easing：`cubic-bezier(0.22, 1, 0.36, 1)`。
- 默认 panel 进入动画：从线框展开为面板，0.3s。
- 默认扫描线纹理叠加透明度 0.03。

【本任务允许做以下事情】
1. 在 `src/styles/tokens.css` 中定义全部 CSS 变量：
   - `--bg-space`、`--bg-panel`、`--bg-panel-strong`、`--border-glow`、`--text-primary`、`--text-muted`、`--text-warn`、`--text-hostile`、`--scanline-opacity`。
   - 八大势力主色：`--faction-ironCrown-primary` 等共 24 个变量。
2. 扩展 `tailwind.config.ts`：
   - `theme.extend.colors` 添加 `faction.ironCrown.{primary,glow,shadow}` 等八组。
   - 添加 `boxShadow.glow-sm/md/lg`（基于发光描边）。
   - 添加 `fontFamily.hud`、`fontFamily.mono`。
   - 添加 `animation`：`scanline`、`flicker`、`panel-reveal`、`pulse-glow`。
   - 添加 `transitionTimingFunction.holo`。
3. 在 `src/styles/globals.css`：
   - 引入字体 + tokens.css。
   - 设置 `body` 默认背景 / 颜色 / 字体。
   - 增加全局扫描线伪元素 overlay（opacity 0.03，pointer-events: none，z-index: 9999）。
4. 在 `src/components/` 创建以下基础组件（每个组件必须可独立 import）：
   - `GlowPanel`：黑色半透明面板，1px 发光描边，进入动画。`props: { tone?: 'neutral'|'warn'|'hostile'|'faction', factionId?: string, children, className? }`。
   - `PixelButton`：直角按钮，hover 发光，按下时像素抖动。`props: { tone?: 'primary'|'danger'|'ghost', icon?, children, onClick }`。
   - `HoloDivider`：水平/垂直全息分隔线，带能量流动动画。
   - `StatusBadge`：势力关系/状态标签（敌对/中立/友好/同盟）。
   - `ScrollNumber`：滚动计数器组件，数字变化时滑动动画。
   - `Scanlines`：可挂载在任意容器内的扫描线 overlay。
5. 在 `src/pages/LandingPage.tsx` 临时建一个 `/design-system` 路由（或在 LandingPage 内直接展示），陈列所有 token、八大势力色块、所有基础组件 demo，作为视觉验证页。本验证页可以保留，作为开发期间的设计系统看板。

【禁止做的事】
- 禁止做任何游戏业务功能（势力选择、HUD、地图、终端等）。
- 禁止改成普通 SaaS 风格、白色背景、圆角卡片、Material 风。
- 禁止引入第三方 UI 组件库。
- 禁止使用商业 SVG 库的现成插画。
- 禁止把势力色彩硬编码到组件内部，必须全部走 token。
- 禁止改动 store、mock、protocol 目录。
- 禁止安装 Three.js / R3F（视觉系统本任务不涉及 3D）。

【验收标准】
1. tokens.css 中所有 CSS 变量齐全且语义清晰。
2. tailwind.config.ts 中 `faction.ironCrown.primary` 等可作为 Tailwind class 使用：例如 `bg-faction-ironCrown-primary`。
3. 默认页面背景为深色宇宙黑而非白色。
4. GlowPanel 在挂载时具有"线框展开"动画。
5. PixelButton hover 呈现发光且无圆角。
6. ScrollNumber 数字变化具备滚动质感。
7. 任意 GlowPanel 设置 `factionId="ironCrown"` 后边框使用铁冠帝国的 Glow 色。
8. 扫描线在全局可见但不影响可点击元素。
9. 完整设计系统看板可访问、可视觉巡检。
10. 整体观感像 Stellaris / Mass Effect / Destiny 2 的科幻 HUD，绝对不像 SaaS 后台。

请按以上规范完成本任务。完成后输出 token 清单、Tailwind 扩展摘要、组件 props 摘要、设计系统看板截图思路。
```

### 预期产物

- `src/styles/tokens.css`（八大势力 × 三级色 = 24 个 CSS 变量 + 全局色 token）。
- `tailwind.config.ts`（faction 配色、boxShadow、animation、easing 扩展）。
- `src/styles/globals.css`（深色背景、字体、扫描线 overlay）。
- `src/components/GlowPanel.tsx`、`PixelButton.tsx`、`HoloDivider.tsx`、`StatusBadge.tsx`、`ScrollNumber.tsx`、`Scanlines.tsx`。
- 设计系统看板页面，可视化所有 token 与组件。

### 验收标准

1. tokens.css 含八大势力共 24 个色彩变量。
2. `bg-faction-emerald-primary` 等 Tailwind class 可用。
3. 默认背景非白色。
4. GlowPanel 进入动画为线框展开。
5. PixelButton 无圆角、hover 发光。
6. ScrollNumber 数字滚动动画存在。
7. 设计系统看板页面陈列全部色彩与组件。
8. 整体观感符合科幻 HUD 描述，无任何 Material/Saas 风格残留。
9. 组件不硬编码势力颜色，全部通过 token 访问。
10. 不引入任何 UI 组件库。

### 禁止事项

- 禁止实现任何业务功能。
- 禁止使用圆角、白色背景、明亮 Material 风格。
- 禁止安装 UI 组件库。
- 禁止硬编码势力色彩。
- 禁止修改 store / mock / protocol 目录。
- 禁止安装 Three.js / R3F。

---

## 任务 3：构建 Landing / 启动画面

### 使用场景

视觉系统就绪后，构建玩家进入游戏前的沉浸式启动画面。这是用户对游戏的第一印象，必须做出"打开一艘星际指挥舰"的感觉，而非任何形式的官网或营销页。

### 可直接复制给 AI 编程工具的完整提示词

```
你是一名前端创意工程师。请为《外交风云》— 人机混战 AI Diplomacy 项目构建启动画面（Landing Page）。

【项目背景】
《外交风云》是一款以自然语言为唯一核心操作方式的实时战略外交模拟器。玩家通过演讲、密谈、条约、宣战影响游戏世界。前端追求像素粒子、深色宇宙、全息 HUD 风格。

【世界观引用】
公元 2147 年，人类殖民舰队抵达新星球"伊甸-7"。八支殖民舰队建立独立文明。灵能矿脉分布不均导致必然冲突。本启动画面是玩家"登入指挥系统"的入口。

【技术栈】
React 19 + TypeScript 严格模式 + Vite + Tailwind CSS + Framer Motion。可使用 canvas2D 实现粒子背景，不引入 Three.js（保持本任务轻量）。

【工程前提】
- 已存在视觉设计系统：GlowPanel / PixelButton / HoloDivider / StatusBadge / ScrollNumber / Scanlines。
- 已存在路径别名 `@/*`。
- 已存在路由占位 `src/pages/LandingPage.tsx`。

【本任务允许做以下事情】
1. 实现 `src/pages/LandingPage.tsx`，挂载到 `/` 路由。
2. 创建 `src/features/landing/` 下若干子组件：
   - `StarfieldCanvas.tsx`：基于 canvas2D 的像素粒子星空背景，性能稳定 60fps，粒子 800~1500，按视口大小自适应，鼠标移动产生微弱视差。
   - `TitleBlock.tsx`：主标题"外交风云"+副标题"人机混战 AI Diplomacy"+一句世界观文案"公元 2147 · 伊甸-7 殖民纪元 · 八文明博弈"。
   - `EnterButton.tsx`：PixelButton 复用，文字"进入指挥系统"，按下后跳转 `/faction-select`。
   - `ScanlinesOverlay`：使用已有 Scanlines 组件叠加。
   - `BootSequence.tsx`：首次进入时显示 1.8s 启动动画：屏幕从黑到揭幕、HUD 边缘从四角推进、扫描线高速下扫一次后稳定、最后标题从粒子聚合而成。
3. 标题字体使用已有 `font-hud`，颜色偏冷青/冷白，带轻微 flicker 动画（透明度 0.95~1.0 抖动）。
4. 背景粒子默认呈现深色星云气息：少量大颗粒缓慢漂浮，大量微颗粒匀速移动，整体感受"宇宙呼吸"。
5. 鼠标 hover "进入指挥系统"按钮时，按钮发光强度增强，附近粒子被吸附形成围绕按钮的轻微涡流。
6. 移动端响应式：在窄屏下标题/副标题字号缩小，粒子数量自动降到 400~700，仍保持 60fps。
7. 提供性能开关：`window.__DIPLOMACY_DEBUG__.particleDensity` 在控制台可调整粒子密度（仅开发环境）。

【禁止做的事】
- 禁止做成任何形式的官网 Hero。
- 禁止使用大量营销文案、"立即注册"、"免费试玩"、"产品特性"等任何商业话术。
- 禁止使用任何明亮的浅色背景或圆角元素。
- 禁止接入真实路由跳转外的任何后端、登录、注册接口。
- 禁止引入 Three.js / WebGL 实现粒子（本任务保持轻量 canvas2D）。
- 禁止使用 lottie / 视频背景。
- 禁止改动 store、mock、protocol、design system 组件实现。

【验收标准】
1. 路径 `/` 渲染 LandingPage。
2. 背景为像素粒子星空，性能 60fps。
3. 标题"外交风云"+副标题"人机混战 AI Diplomacy"+一句世界观文案存在并具备 flicker 动画。
4. 启动动画 BootSequence 在首次进入时播放，时长约 1.8s，包含粒子聚合形成标题。
5. "进入指挥系统"按钮存在，hover 时附近粒子被吸附形成轻微涡流。
6. 点击"进入指挥系统"按钮跳转到 `/faction-select`（即使目标页面尚未实现也要正确触发路由）。
7. 扫描线 overlay 存在且不影响点击。
8. 整体视觉与"普通官网"完全不同，更接近 Stellaris / Mass Effect 的登入界面。
9. 移动端响应式可用。
10. 控制台未报错。

请按以上规范完成本任务。完成后输出新增文件清单，描述粒子动画与按钮 hover 效果的技术细节。
```

### 预期产物

- `src/pages/LandingPage.tsx`。
- `src/features/landing/StarfieldCanvas.tsx`、`TitleBlock.tsx`、`EnterButton.tsx`、`BootSequence.tsx`。
- 路由：`/` → LandingPage，按钮跳转 `/faction-select`。

### 验收标准

1. 路由 `/` 呈现启动画面。
2. 像素粒子星空 60fps 渲染。
3. 标题 + 副标题 + 世界观文案具备 flicker。
4. BootSequence 启动动画约 1.8s。
5. "进入指挥系统"按钮存在并附近粒子涡流响应。
6. 按钮触发 `/faction-select` 跳转。
7. 扫描线 overlay 不影响点击。
8. 与商业官网完全异质。
9. 移动端响应式可用。
10. 控制台无报错。

### 禁止事项

- 禁止商业官网 Hero 风格。
- 禁止注册 / 登录 / "立即试玩"等营销组件。
- 禁止圆角、明亮配色。
- 禁止接入任何后端、登录、统计 SDK。
- 禁止引入 Three.js / 视频 / Lottie。
- 禁止改动设计系统组件实现。

---

## 任务 4：构建势力选择界面

### 使用场景

启动画面之后，玩家进入势力选择页。八大势力差异极大，必须通过卡片直观展现颜色、性格、关键词。本任务全部使用集中 mock 数据，禁止硬编码到组件内。

### 可直接复制给 AI 编程工具的完整提示词

```
你是一名前端业务工程师。请为《外交风云》— 人机混战 AI Diplomacy 项目构建势力选择界面。

【项目背景】
本游戏共有八大势力，每个势力都有视觉主色、文明特征、AI 性格原型、核心优势、说话风格。玩家选择一个势力后开始游戏。

【八大势力数据（强制使用以下完整数据集，命名键统一为以下英文 id）】
- ironCrown    铁冠帝国 | 深红+金   | 军事工业化，等级森严     | 铁血征服者     | 军事力+20%      | speech: commanding_imperial      | trigger: 臣服/投降/弱者
- starlight    星辉联邦 | 蓝白     | 科技民主，重视规则       | 理性合作者     | 科技系数+1      | speech: analytical_diplomatic    | trigger: 数据/逻辑/证据
- emerald      翡翠王庭 | 绿金     | 商贸帝国，富可敌国       | 狡猾商人       | 贸易收益+30%    | speech: charming_mercantile      | trigger: 利润/交易/合作
- ashen        灰烬部族 | 橙黑     | 游牧战士，崇尚荣誉       | 热血战士       | 士气上限+0.3    | speech: passionate_warrior       | trigger: 懦夫/荣誉/勇气/战斗
- voidChurch   虚空教廷 | 紫银     | 宗教文明，精神控制       | 神秘操控者     | 文化影响+40%    | speech: mystical_prophetic       | trigger: 命运/预言/信仰
- aurora       极光共和 | 青白     | 科研至上，和平主义       | 技术中立者     | 防御加成+25%    | speech: academic_neutral         | trigger: 研究/和平/知识
- magma        熔岩议会 | 红橙     | 地底文明，资源丰富       | 防御守财奴     | 资源产出+25%    | speech: gruff_pragmatic          | trigger: 资源/矿脉/领土
- darkTide     暗潮商会 | 暗金     | 情报网络，无处不在       | 情报贩子       | 情报获取免费    | speech: smooth_conspiratorial    | trigger: 秘密/情报/交换

颜色 token 已在视觉系统中存在（faction.ironCrown.primary/glow/shadow 等），本任务必须复用。

【技术栈】
React 19 + TypeScript 严格模式 + Vite + Tailwind CSS + Zustand + Framer Motion。不引入 UI 库，不引入 Three.js。

【工程前提】
- 已存在 GlowPanel / PixelButton / HoloDivider / StatusBadge / Scanlines。
- 已存在 `src/store/gameStore.ts` 与 `src/mock/factions.ts`（当前为空）。
- 已存在 `src/pages/FactionSelectPage.tsx` 占位。

【本任务允许做以下事情】
1. 实现 `src/mock/factions.ts`：导出 `FACTIONS: FactionMeta[]`，每个对象包含 `id, name, primary, glow, shadow, civilization, archetype, advantage, speechStyle, triggerWords, slogan`。八大势力数据严格按上表填入，并增加 `slogan` 字段：从设计文档中"AI 发言风格示例"为每个势力挑一句最具代表性的台词。同时导出 TypeScript 类型 `FactionMeta`、`FactionId`。
2. 在 `src/store/gameStore.ts` 中添加字段 `selectedFactionId: FactionId | null` 与 action `selectFaction(id)`、`clearFaction()`。本任务只做这一处 store 修改，其他字段在任务 6 中实现。
3. 实现 `src/features/factionSelect/` 子组件：
   - `FactionSelectGrid.tsx`：八个 `FactionCard` 网格布局。
   - `FactionCard.tsx`：单张卡片，呈现势力名称、文明特征、AI 性格原型、核心优势、关键词标签、势力主色头像（用 CSS 径向渐变 + 边缘发光 + 内部能量粒子动画模拟"灵能徽章"）。hover 时整张卡片浮现一层势力 Glow 色的扫光与微弱粒子环绕。
   - `FactionDetailPanel.tsx`：选中势力后右侧面板，显示完整 slogan、说话风格描述、触发词列表、性格弱点（这里暂用一句固定文案占位："此势力的性格弱点将在战局中显现"，不写入 mock 数据）。
   - `ConfirmBar.tsx`：底部确认条，PixelButton "确认出征" 按钮在未选中时 disabled，选中后高亮并可点击。点击后调用 `selectFaction` 并跳转 `/game`。
4. 整体布局：左 / 中 = 卡片网格；右 = FactionDetailPanel；底 = ConfirmBar。整体在深色宇宙背景上叠加 Scanlines。
5. 键盘交互：方向键在卡片间移动焦点；Enter 选中；Esc 清空选择。
6. 选中态动画：卡片放大 1.02，边框发光增强，粒子环绕加速。
7. 切换势力时，FactionDetailPanel 内文字使用 Framer Motion 做"碎裂重组"过渡（旧字粒子化飞散 → 新字粒子聚合显现，时长 0.4s）。

【禁止做的事】
- 禁止将势力数据硬编码到任何组件内，必须全部从 `mock/factions.ts` 读取。
- 禁止使用商业 SaaS 风格的卡片（圆角、阴影柔和、明亮配色）。
- 禁止省略任何一个势力。
- 禁止把势力性格弱点写入 mock 数据（按设计这是 AI 行为里隐藏的）。
- 禁止在本任务中实现 AI 性格矩阵或与 LLM 相关任何调用。
- 禁止接入任何后端 / 注册 / 排行榜数据。
- 禁止修改设计系统组件实现。
- 禁止安装新的 UI 库。
- 禁止改动 protocol / 其他 mock 文件。

【验收标准】
1. 路径 `/faction-select` 显示八张势力卡片，颜色、文明特征、关键词正确，无遗漏。
2. 每张卡片颜色与设计系统 token 一致，无硬编码 hex。
3. hover 卡片时有发光与粒子环绕反馈。
4. 选中卡片后右侧 FactionDetailPanel 显示完整信息且包含 slogan。
5. 切换选中势力时 detail 文本具备"碎裂重组"过渡。
6. 键盘方向键 + Enter + Esc 交互可用。
7. 未选中时确认按钮 disabled，选中后可点击。
8. 确认后 Zustand store 的 selectedFactionId 被正确写入。
9. 确认后路由跳转 `/game`。
10. 整体视觉与商业 SaaS 卡片网格截然不同，呈现科幻战略游戏选阵营的质感。

请按以上规范完成本任务。完成后输出 mock 数据片段、FactionCard 关键代码、store diff。
```

### 预期产物

- `src/mock/factions.ts`（FACTIONS 数组 + FactionMeta、FactionId 类型）。
- `src/store/gameStore.ts` 新增 `selectedFactionId` 与相关 action。
- `src/features/factionSelect/{FactionSelectGrid,FactionCard,FactionDetailPanel,ConfirmBar}.tsx`。
- `src/pages/FactionSelectPage.tsx` 接入路由。

### 验收标准

1. 八张势力卡片完整呈现且颜色匹配 token。
2. hover 有粒子+发光反馈。
3. 选中卡片后右侧详情面板显示完整信息含 slogan。
4. detail 切换具备碎裂重组过渡。
5. 键盘方向键 + Enter + Esc 工作正常。
6. 未选中时确认按钮 disabled。
7. store.selectedFactionId 正确写入。
8. 确认后跳转 `/game`。
9. 视觉风格符合科幻战略游戏要求。
10. mock 数据集中管理，零硬编码。

### 禁止事项

- 禁止把势力数据硬编码到组件内。
- 禁止使用商业 SaaS 卡片样式。
- 禁止减少势力数量。
- 禁止把性格弱点写进 mock。
- 禁止接入任何后端 / 登录 / LLM。
- 禁止改动设计系统组件。
- 禁止改动 protocol / 其他 mock 文件。

---

## 任务 5：构建主游戏 HUD 静态布局

### 使用场景

势力选择完成后进入主游戏页面。本任务先搭建主 HUD 的静态骨架，不写真实游戏逻辑、不写 AI 行为、不写真实地图。任务 6~13 会在此布局之上分别填充内容。

### 可直接复制给 AI 编程工具的完整提示词

```
你是一名前端布局工程师。请为《外交风云》— 人机混战 AI Diplomacy 项目搭建主游戏页面（GamePage）的 HUD 静态布局骨架。

【项目背景】
主游戏 HUD 是玩家全程游玩的核心界面。设计要求：UI 占屏比例可控（默认行动态约 35%）；中央是战略地图；底部是自然语言指挥终端；左侧是事件流；右侧是势力关系面板；顶部是纪元 / 回合 / 阶段 / 倒计时。

【UI 状态机参考】
- 观察态：UI 占屏 8%。
- 行动态：UI 占屏 35%。
- 博弈态：UI 占屏 20%（中央放 AI 思考进度卡片）。
- 结算态：UI 占屏 30%（中央叠加事件揭晓卡片）。

本任务先做"行动态"作为默认布局，后续任务 14 会接入阶段切换逻辑。

【技术栈】
React 19 + TypeScript 严格模式 + Vite + Tailwind CSS + Zustand + Framer Motion。本任务不需要 Three.js（中央地图区域留占位）。

【工程前提】
- 已存在视觉设计系统（GlowPanel / PixelButton / HoloDivider / StatusBadge / ScrollNumber / Scanlines）。
- 已存在 gameStore（含 selectedFactionId）。
- 已存在路由 `/game` → GamePage 占位。
- 已存在 mock/factions.ts。

【本任务允许做以下事情】
1. 实现 `src/pages/GamePage.tsx`，使用 grid + flex 完成响应式布局。
2. 在 `src/features/hud/` 创建子组件骨架（仅静态展示，不接任何真实数据）：
   - `TopBar.tsx`：左侧"纪元 III · 回合 2"+ 中间"阶段：行动期"+ 右侧倒计时 `01:12`（ScrollNumber 复用）+ 设置按钮。
   - `EventStreamPanel.tsx`（左侧）：标题"事件流"+ 占位 6 条事件文案 + 折叠/全屏按钮。
   - `RelationsPanel.tsx`（右侧）：标题"势力关系"+ 八个势力名称 + 简单"敌对/中立/友好/同盟"占位标签。
   - `CommandTerminal.tsx`（底部）：模式选择 tab `[演讲][密谈][条约][军令][情报]` + 占位文本输入区 + 占位发送按钮 + "影响力预估"进度条占位。
   - `MapStage.tsx`（中央）：暂时只渲染一个深色圆形 + 内嵌"战略地图待接入"占位文字，作为后续任务 11 的挂载点。
3. 布局规范：
   - GamePage 使用 100vh，超出 hidden。
   - TopBar 高 56px。
   - 底部 CommandTerminal 高 180px（行动态）。
   - 左侧 EventStreamPanel 宽 280px。
   - 右侧 RelationsPanel 宽 320px。
   - 中央 MapStage 自适应剩余空间，居中。
   - 所有面板背景 rgba(0,0,0,0.6) + 1px 发光描边，无圆角，使用 GlowPanel 包装。
4. 添加全局扫描线 overlay。
5. 主色 / 边框基于当前 selectedFactionId 微调（例如顶部纪元数字使用所选势力的 glow 色），但不强制风格突变。
6. 响应式：宽度 < 1280px 时左右面板宽度收缩；< 960px 时左右面板可折叠为 Drawer（可点击侧边按钮展开），保证 MapStage 不被挤压。
7. 在 store 中扩展 `uiStore`：`leftPanelOpen / rightPanelOpen / hudMode: 'observe'|'action'|'resolve'|'arbitrate'`，默认 `'action'`。本任务只创建状态字段与 setter，不接逻辑。
8. 键盘快捷键占位：`Tab` 切换面板焦点（仅记录在 uiStore）；`E` 切换 EventStream 折叠；`R` 切换 Relations 折叠（功能可全做）。

【禁止做的事】
- 禁止实现真实事件流逻辑、真实关系数据、真实指挥终端发送行为（任务 7、9、10 负责）。
- 禁止将页面做成普通聊天窗口，禁止把 MapStage 缩小到边角。
- 禁止使用任何 UI 组件库。
- 禁止接入后端 / WebSocket / LLM。
- 禁止在 HUD 中使用任何圆角卡片样式。
- 禁止修改 mock/factions.ts 与 protocol 目录。
- 禁止在本任务中加入 Three.js / R3F。
- 禁止省略响应式处理。

【验收标准】
1. 路径 `/game` 渲染主 HUD：顶部 + 左 + 中 + 右 + 底五区清晰可见。
2. UI 占屏比例符合行动态约 35% 的目标（中央 MapStage 占比足够大）。
3. 所有面板使用 GlowPanel 包装，背景半透明 + 发光描边 + 无圆角。
4. 五个 HUD 子组件文件存在并可独立 import。
5. 中央 MapStage 显示深色圆形 + 占位文案。
6. uiStore 包含 leftPanelOpen / rightPanelOpen / hudMode 字段，默认值正确。
7. 在不同宽度下布局正常：1920 / 1440 / 1280 / 960 / 640。
8. 键盘 E / R 可切换左右面板折叠。
9. 顶部纪元数字使用所选势力的 glow 色。
10. 视觉整体呈科幻战略游戏 HUD 质感，不像聊天应用、不像 SaaS 后台。

请按以上规范完成本任务。完成后输出 GamePage 截图思路、组件树、uiStore diff、响应式断点说明。
```

### 预期产物

- `src/pages/GamePage.tsx`。
- `src/features/hud/{TopBar,EventStreamPanel,RelationsPanel,CommandTerminal,MapStage}.tsx`。
- `src/store/uiStore.ts` 扩展字段。
- 键盘快捷键基础挂载。

### 验收标准

1. `/game` 五区 HUD 静态布局完整。
2. 行动态 UI 占屏约 35%。
3. 所有面板使用 GlowPanel，半透明 + 发光描边。
4. MapStage 占据中央且尺寸足够大。
5. uiStore 字段正确。
6. 至少在 1920/1440/1280/960/640 五个断点布局正常。
7. E / R 快捷键切换左右面板。
8. 顶部纪元数字使用所选势力 glow 色。
9. 视觉为科幻战略 HUD，无聊天/SaaS 痕迹。
10. 不引入 UI 库 / 后端 / WebSocket / Three.js。

### 禁止事项

- 禁止实现真实事件 / 关系 / 终端逻辑。
- 禁止将页面做成聊天窗口。
- 禁止使用圆角卡片、明亮配色。
- 禁止使用 UI 组件库。
- 禁止接入后端 / WebSocket / LLM。
- 禁止改动 mock/factions.ts 与 protocol 目录。
- 禁止在本任务引入 Three.js / R3F。
- 禁止省略响应式。

---

## 任务 6：构建 mock game state 与 mock game loop

### 使用场景

HUD 骨架就绪后，需要一套与未来后端对应的、可被 UI 订阅的 mock 游戏状态与时钟循环。任务 7~16 都依赖此 mock 数据驱动 UI。本任务是后端到来前唯一真实"游戏世界"。

### 可直接复制给 AI 编程工具的完整提示词

```
你是一名前端游戏状态架构师。请为《外交风云》— 人机混战 AI Diplomacy 项目构建 mock game state 与 mock game loop，让前端在没有真实后端时仍能完整模拟游戏世界运行。

【项目背景】
游戏由 5~8 个纪元构成，每个纪元 3 回合，每回合分四阶段：态势感知期 15s → 行动期 90s → 博弈期 30s → 结算期 15s。每三回合后插入一个裁决阶段（战争结算 20s → 史诗时刻 60s → 纪元总结 15s）。八大势力之间有动态关系、条约、战争、贸易、密谈、情报。

【技术栈】
React 19 + TypeScript 严格模式 + Zustand。本任务不引入 Three.js / WebSocket。

【工程前提】
- 已存在视觉系统、HUD 骨架、selectedFactionId。
- 已存在 `src/mock/factions.ts`。
- 已存在空 `src/mock/{events,relationships,gameState}.ts` 与 `src/store/gameStore.ts`。

【本任务允许做以下事情】
1. 在 `src/mock/types.ts` 中定义所有核心类型（之后任务 17 的 protocol 类型会复用结构）：
   - `FactionId`（已存在）。
   - `GamePhase = 'observe' | 'action' | 'resolve' | 'arbitrate'`。
   - `ArbitratePhase = 'battle' | 'epic' | 'summary'`。
   - `Epoch = { id: number; turn: number; phase: GamePhase; arbitratePhase?: ArbitratePhase; phaseStartedAt: number; phaseDurationMs: number }`。
   - `FactionState = { id: FactionId; military: number; economy: number; diplomacy: number; culture: number; morale: number; totalPower: number; status: 'thriving'|'stable'|'declining'|'critical'|'eliminated' }`。
   - `RelationshipValue = number` (-100~100)。
   - `RelationshipStatus = 'hostile'|'wary'|'neutral'|'friendly'|'allied'`。
   - `Relationship = { from: FactionId; to: FactionId; value: RelationshipValue; status: RelationshipStatus; treaties: TreatyKind[] }`。
   - `TreatyKind = 'non_aggression'|'trade'|'alliance'|'ceasefire'`。
   - `EventPriority = 'P0'|'P1'|'P2'`。
   - `EventKind = 'speech'|'private'|'declare_war'|'alliance'|'trade'|'betrayal'|'battle'|'economy'|'intel'|'phase_change'`。
   - `GameEvent = { id; createdAt; epoch; turn; phase; priority; kind; actor?: FactionId; target?: FactionId; payload: Record<string, unknown>; narration: string }`。
   - `BattleEvent`、`SpeechEvent`、`PrivateMessage`、`MapRegion` 详细字段。
   - `MapRegion = { id; owner: FactionId|null; resourceValue: number; developmentLevel: number; centerLatLng: [number,number]; terrain: 'mountain'|'plains'|'river'|'fortress'|'desert' }`。
2. 在 `src/mock/factions.ts` 之外建立：
   - `src/mock/initialState.ts`：导出 `createInitialState()` 函数，生成八势力初始 `FactionState`、初始 64 个 `MapRegion`（每势力 8 个区域、id 用 `region_0`~`region_63`、随机但稳定地分配 owner、terrain 多样化）、初始关系矩阵（同盟 2 对、敌对 1 对、其余中立 / 警惕，关系值在 -40~+40 范围内）、初始事件流（5 条 P2 级别的占位事件）、初始 Epoch=1、Turn=1、Phase='observe'。
3. 实现 `src/store/gameStore.ts` 完整版（保留任务 4 中 selectedFactionId）：
   - `state: { epoch: Epoch; factions: FactionState[]; relationships: Relationship[]; regions: MapRegion[]; events: GameEvent[]; privateMessages: PrivateMessage[]; selectedFactionId: FactionId | null; isPaused: boolean }`。
   - `actions: initGame(), pushEvent(e), advancePhase(), tickPhase(deltaMs), updateRelationship(from,to,delta), updateRegionOwner(regionId,newOwner), triggerBattle(att,def,regionId), addPrivateMessage(msg), togglePause()`。
   - 使用 `subscribe()` 暴露 vanilla 订阅（用于 useFrame 直接读取）。
4. 实现 `src/mock/gameLoop.ts`：
   - 导出 `startMockGameLoop()`：requestAnimationFrame 节拍 + 阶段计时器；阶段时长按设计文档（observe 15000ms / action 90000ms / resolve 30000ms / arbitrate 50000ms）；isPaused=true 时暂停。
   - 阶段切换时调用 `advancePhase()` 并 `pushEvent({kind:'phase_change',...})`。
   - 在 action 与 resolve 阶段每 5~12s 随机生成一条 mock 事件（kind 在 speech / private / trade / battle / betrayal / intel 中随机；priority 加权随机）。事件需要包含可信的 narration 文本（直接拼接势力名称即可，例如"翡翠王庭向极光共和发起贸易提议"）。
   - 每三回合后进入 arbitrate 三个子阶段（battle → epic → summary）依次切换，结束后 epoch+1, turn 重置为 1。
   - 整局最长 8 epoch，结束后停止循环并写入 `state.isPaused=true`、`pushEvent({kind:'phase_change', payload:{end:true}})`。
5. 在 GamePage 挂载时调用 `initGame()` 与 `startMockGameLoop()`，卸载时停止循环。
6. TopBar、EventStreamPanel、RelationsPanel 改造为消费 store 数据：TopBar 显示真实 epoch/turn/phase/倒计时；EventStreamPanel 渲染真实 events（任务 9 再做完整 UI，本任务只要文本列表）；RelationsPanel 渲染真实关系（任务 10 再做完整 UI，本任务只要文本列表）。
7. 在 `src/utils/random.ts` 中实现 seedable 伪随机（mulberry32），确保 mock 在同 seed 下可复现，便于调试。`createInitialState(seed?:number)` 可接受 seed。

【禁止做的事】
- 禁止接入任何真实后端或 WebSocket。
- 禁止调用任何真实 LLM API。
- 禁止把 mock 数据写进 UI 组件内部，必须全部走 store。
- 禁止把 store 结构设计为以后无法被 WebSocket 数据替换。
- 禁止在 store 中混入 UI 状态（UI 状态留在 uiStore）。
- 禁止省略 phase 计时器与暂停逻辑。
- 禁止在本任务中实现指挥终端发送、AI 发言生成（任务 7、8 负责）。
- 禁止动用 Three.js / canvas 绘制。

【验收标准】
1. `src/mock/types.ts` 含全部类型定义且 strict 通过。
2. `createInitialState()` 输出稳定结构、8 势力、64 区域、合理关系矩阵。
3. `startMockGameLoop()` 实际推动 phase 在 observe / action / resolve / arbitrate 间轮转，阶段时长与设计文档一致。
4. arbitrate 阶段包含三个子阶段。
5. 每三回合后 epoch+1。
6. action / resolve 期间随机产出 mock 事件，narration 文本可读。
7. TopBar 显示与 store 同步的 epoch/turn/phase/倒计时。
8. EventStreamPanel 与 RelationsPanel 渲染 store 中的真实事件 / 关系列表。
9. 控制台无报错，FPS 稳定（store 更新不引起整屏 re-render）。
10. mock 数据结构与未来 protocol 消息格式可兼容（任务 17 将复用）。

请按以上规范完成本任务。完成后输出 types.ts 摘要、gameStore actions 列表、gameLoop 阶段迁移示意。
```

### 预期产物

- `src/mock/types.ts`、`src/mock/initialState.ts`、`src/mock/gameLoop.ts`、`src/utils/random.ts`。
- `src/store/gameStore.ts` 完整字段与 action。
- TopBar / EventStreamPanel / RelationsPanel 改造为消费 store。
- GamePage 挂载/卸载控制 loop 启停。

### 验收标准

1. 完整类型定义。
2. 初始状态稳定可复现。
3. 阶段在 observe/action/resolve/arbitrate 切换。
4. arbitrate 三子阶段切换正确。
5. epoch+1 逻辑正确。
6. 随机事件可读且符合势力关系。
7. TopBar 倒计时实时正确。
8. EventStream / Relations 数据由 store 驱动。
9. FPS 稳定。
10. 结构与未来 WebSocket 协议可兼容。

### 禁止事项

- 禁止接入真实后端 / WebSocket / LLM。
- 禁止把 mock 数据散落进 UI 组件。
- 禁止把 store 结构写得无法被 WebSocket 替换。
- 禁止混入 UI 状态。
- 禁止省略 phase 计时与暂停。
- 禁止本任务实现指挥终端发送 / AI 发言。
- 禁止使用 Three.js。

---

## 任务 7：构建自然语言指挥终端

### 使用场景

mock game state 就绪后，玩家需要一个核心交互入口"指挥终端"。终端是整个游戏的语言行为出入口：演讲 / 密谈 / 条约 / 军令 / 情报五个模式。本任务实现完整输入与发送行为，并触发 mock 事件，但绝不接入真实 LLM。

### 可直接复制给 AI 编程工具的完整提示词

```
你是一名前端核心交互工程师。请为《外交风云》— 人机混战 AI Diplomacy 项目构建自然语言指挥终端（CommandTerminal）。

【项目背景】
指挥终端不是聊天框，而是科幻战略游戏的"灵能通讯指挥台"。玩家通过演讲、密谈、条约、军令、情报五种模式向世界发送语言行为。每个模式的目标选择、智能提示、影响力反馈都不同。

【五种模式定义】
- 演讲 speech：所有势力都会听到；目标列表禁用；语气检测条偏蓝→红展示；影响力反映"culture_gain"。
- 密谈 private：必须选择且仅一个目标势力；语气检测条强调 deceptive / 信任。
- 条约 treaty：选择 1~3 个目标势力 + 条约种类（互不侵犯 / 贸易 / 同盟 / 停战）；模板预填，玩家可修改。
- 军令 military：选择部队、来源区域、目标区域、动作（move / attack / defend）；语言区可写部队指令，例如"装甲师向北方平原推进并保持隐蔽"。
- 情报 intel：仅暗潮商会与少数势力可用情报模式；其它势力可派密使（消耗 1 行动点）；选择目标势力并填写"情报需求"。

【实时反馈要求】
- 语气检测条：4 段渐变蓝→黄→橙→红，按输入内容关键词模糊判断（不调用 LLM；本任务用本地词表 + 关键词权重做近似），实时滑动。
- 影响力预估条：低 / 中 / 高 三档，按字数 / 关键词 / 模式给出估计，不保证准确。
- 仅密谈模式显示"目标可能反应预览"标签（接受 / 犹豫 / 拒绝），三个之一，随机但稳定。

【发送行为】
- Enter 发送，Shift+Enter 换行；点击 PixelButton "发送" 亦可。
- 发送瞬间：输入框内文字以粒子化飞出动画飘向目标（演讲 → 全方向扩散；密谈 → 定向射线；宣战 / 强语气 → 红色火花）。本任务用 DOM / canvas2D 完成粒子化动画（不用 Three.js），保证 60fps。
- 发送后：在 gameStore.events 中 push 一条对应类型的 GameEvent（speech / private / treaty / military / intel）；密谈消息同时写入 `privateMessages`；语气强烈时（红色）顺带 push 一条相关 betrayal 倾向的 P1 事件占位。
- 发送后输入框短暂"回弹"动画。
- 发送频率限制：每个阶段（action）每个玩家最多 5 条发言、3 条军令、1 条情报；超出时按钮变灰并提示。

【技术栈】
React 19 + TypeScript + Tailwind + Framer Motion + Zustand。不引入 LLM、不引入 WebSocket、不引入 Three.js。

【工程前提】
- 已存在 GlowPanel / PixelButton 等。
- 已存在 gameStore（含 events / privateMessages / phase）。
- 已存在 mock/factions.ts、initialState.ts、gameLoop.ts。
- HUD 中底部 CommandTerminal.tsx 已是占位骨架。

【本任务允许做以下事情】
1. 重写 `src/features/commandTerminal/`：
   - `CommandTerminal.tsx`：整体容器、引入子组件、订阅 store.epoch.phase。
   - `ModeTabs.tsx`：五个模式 tab，键盘 1~5 可切换。
   - `ContextHint.tsx`：模式上下文文案（例如"演讲模式：所有势力将听到你的发言"）。
   - `TargetSelector.tsx`：根据模式动态渲染目标选择（演讲禁用 / 密谈单选 / 条约多选最多 3 / 军令需选择区域 / 情报单选）。
   - `MessageInput.tsx`：自动增高 textarea，字数 0/400，支持 Shift+Enter；上方挂语气检测条；右侧或下方挂影响力预估条。
   - `ToneMeter.tsx` 和 `InfluenceBar.tsx`：实时反馈。
   - `SendButton.tsx`：PixelButton 包装。
   - `SendFx.tsx`：粒子化飞出动画的 DOM/canvas2D 组件，支持 speech / private / aggressive 三种 mode。
   - `RateLimiter.ts`：阶段内发送频率限制工具。
   - `useToneAnalyzer.ts`：基于本地词表（设计文档"触发词"+ 常见敌意 / 合作词汇）的近似语气分析 hook。
2. 在 gameStore 中新增 action：
   - `submitSpeech({ mode, content, targets, treatyKind? })`：执行所有合法性校验，触发 RateLimiter，push event，按需 push 私聊。
3. 模式可见性约束：仅在 phase === 'action' 时输入框可用；非行动期 textarea disabled 并显示提示"等待行动期开始"。
4. 输入框内可识别 `/ally [势力名]`、`/war [势力名]`、`/trade [势力名]`、`/spy [势力名]`、`/history`、`/status`、`/map` 等快捷指令（仅演示：识别后预填模板文字，仍需玩家发送）。
5. 发送行为：调用 `submitSpeech` 之外，先触发 SendFx（动画 600ms），动画结束前禁用输入。

【禁止做的事】
- 禁止接入真实 LLM、真实 API。
- 禁止把 AI 回复逻辑写进本任务（任务 8 负责）。
- 禁止把语气检测做成黑盒判定，本任务必须用本地词表 + 简单加权。
- 禁止将 mock 数据散落到组件内部（必须读 store）。
- 禁止让发送行为绕过 store action 直接修改 events。
- 禁止把指挥终端做成普通聊天框：禁用气泡 / 头像 / "对方正在输入"等聊天 UI。
- 禁止省略模式之间的差异。
- 禁止破坏行动期与非行动期之间的禁用约束。
- 禁止使用 Three.js / R3F 渲染粒子。

【验收标准】
1. 五种模式可切换，1~5 快捷键正常。
2. 演讲：目标列表禁用；密谈：目标单选；条约：1~3 多选 + 条约种类；军令：可选区域；情报：单选。
3. 语气检测条实时随输入变化。
4. 影响力预估条按字数 + 模式给出三档反馈。
5. 仅密谈模式显示目标反应预览标签。
6. 发送触发 SendFx（speech 全向扩散 / private 定向射线 / aggressive 红色火花）。
7. 发送后 gameStore.events 增加一条对应事件，密谈同时写入 privateMessages。
8. 非行动期 textarea disabled。
9. 阶段内发送频率限制生效（演讲≤5 / 军令≤3 / 情报≤1）。
10. 整体外观为科幻指挥台，与普通聊天框完全不同。

请按以上规范完成本任务。完成后输出 ModeTabs / TargetSelector 关键代码、submitSpeech action 摘要、SendFx 实现策略。
```

### 预期产物

- `src/features/commandTerminal/{CommandTerminal,ModeTabs,ContextHint,TargetSelector,MessageInput,ToneMeter,InfluenceBar,SendButton,SendFx}.tsx`、`RateLimiter.ts`、`useToneAnalyzer.ts`。
- gameStore 新增 `submitSpeech`。
- 快捷指令解析（`/ally /war /trade /spy /history /status /map`）。
- 完整粒子化发送动画。

### 验收标准

1. 五模式 + 快捷键正常。
2. 模式之间目标选择差异化。
3. ToneMeter 实时滑动。
4. InfluenceBar 三档反馈。
5. 密谈反应预览标签存在。
6. 发送动画包含三种 mode。
7. 事件 / 私聊 store 写入正确。
8. 非行动期 disabled。
9. 频率限制生效。
10. 视觉非聊天框。

### 禁止事项

- 禁止接入真实 LLM / 后端。
- 禁止把 AI 回复逻辑写进本任务。
- 禁止把语气分析黑盒化。
- 禁止散落 mock 数据到组件。
- 禁止绕过 store action 写事件。
- 禁止做成聊天 UI。
- 禁止省略模式差异。
- 禁止破坏 phase 禁用约束。
- 禁止使用 Three.js。

---

## 任务 8：构建 AI 发言与密谈展示系统

### 使用场景

指挥终端就绪后，需要 AI 势力做出"看起来像在说话"的反馈。本任务实现 AI 公开发言、私密密谈、系统旁白的展示与 mock 回复生成，全部基于本地模板，禁止真实 LLM。

### 可直接复制给 AI 编程工具的完整提示词

```
你是一名前端 AI 表达层工程师。请为《外交风云》— 人机混战 AI Diplomacy 项目构建 AI 发言与密谈展示系统。

【项目背景】
八大势力都有独特说话风格，参考《设计文档·附录B》。本任务不调用真实 LLM，而用本地模板 + 随机变体生成 AI 回复，确保发言风格差异化。

【八大势力说话风格（强制每个势力至少 6 条模板，必须直接体现性格）】
- 铁冠帝国 commanding_imperial：例如"这片大陆只需要一个主人。"、"铁冠的意志不容质疑。"
- 星辉联邦 analytical_diplomatic：例如"根据数据，合作收益高出 47%。"、"让我们用事实说话。"
- 翡翠王庭 charming_mercantile：例如"朋友，何必刀兵相见？"、"在翡翠王庭，没有敌人，只有还没成交的客户。"
- 灰烬部族 passionate_warrior：例如"用战斗来证明！"、"灰烬的战士宁可站着死。"
- 虚空教廷 mystical_prophetic：例如"虚空已经预见了你的命运。"
- 极光共和 academic_neutral：例如"我们的研究表明，和平环境下技术进步 3.7 倍。"
- 熔岩议会 gruff_pragmatic：例如"少废话。你想要什么，能给什么？"
- 暗潮商会 smooth_conspiratorial：例如"我听说了一些...有趣的事情。"

【发言类型】
- 公开发言（speech）：来自 AI 势力，出现在事件流并在地图相应势力区域上方浮出气泡。
- 密谈消息（private）：仅当目标势力为玩家时才显示，且需要从右下侧"密谈抽屉"以暗紫色气泡浮入。
- 系统旁白（narration）：阶段切换 / 战争结算 / 灭国时由系统旁白者朗读，居中弹出。
- 即时反应（reaction）：极简标签气泡（"震惊"/"赞许"/"警惕"/"愤怒"），1.5s 自动消失，浮在地图区域。

【AI 回复触发逻辑（本任务实现）】
- 玩家发送 speech：50% 概率每个 AI 势力随机产出一条 reaction；30% 概率某一势力 1~3s 内回应一条公开发言。
- 玩家发送 private 给某 AI：70% 概率该 AI 在 1.5~3s 内私聊回复；20% 概率"沉默"；10% 概率"假装答应"并 5~10s 后在事件流出现 P1 betrayal 占位事件。
- 玩家发送 declare_war（来自 mode=military 中识别"宣战"关键词或条约模式选择敌对类型）：相关 AI 立刻产出 reaction，并在 2s 内播放系统旁白。
- 所有回复内容用 `templates[factionId][kind]` 中模板 + 随机参数填充（如对方势力名）。

【技术栈】
React 19 + TypeScript + Tailwind + Framer Motion + Zustand。不引入真实 LLM、不引入 WebSocket。

【工程前提】
- 已存在 gameStore（含 events / privateMessages / phase / factions / relationships）。
- 已存在 mock/factions.ts。
- 已存在 CommandTerminal，玩家发送时通过 submitSpeech 写入 events 与 privateMessages。

【本任务允许做以下事情】
1. 新建 `src/mock/aiTemplates.ts`：导出 `AI_SPEECH_TEMPLATES`、`AI_PRIVATE_TEMPLATES`、`AI_REACTION_TEMPLATES`、`SYSTEM_NARRATION_TEMPLATES`。
2. 新建 `src/mock/aiResponder.ts`：导出 `triggerAIResponses(playerEvent)`，按上述触发逻辑生成回复 event 并 push 到 store。订阅 gameStore.events 末尾追加事件，若 actor 是玩家所选势力则调用 `triggerAIResponses`。
3. 新建 `src/features/aiSpeech/`：
   - `PublicSpeechBubble.tsx`：势力色描边气泡，势力头像，打字机效果，关键词高亮（威胁词红 / 合作词绿 / 中性默认）。
   - `PrivateMessageDrawer.tsx`：右下角抽屉，仅渲染发给玩家或玩家发出的密谈，暗紫色气泡，未读红点。
   - `ReactionTag.tsx`：地图区域上方浮出的小标签，1.5s 自动隐藏。
   - `NarrationBanner.tsx`：屏幕中央居中横幅，配合阶段切换 / 关键事件出现。
   - `useAIResponseScheduler.ts`：调度延迟回复，使用 setTimeout 集合并在卸载时清理。
4. 在 EventStreamPanel 中渲染 AI 公开发言条目时使用 PublicSpeechBubble 的简化卡片版本（不显示气泡尾巴）；在 MapStage 上方位置（任务 11 接入地图时再覆盖具体定位，本任务先用 MapStage 中心向上偏移作占位）。
5. 关键词高亮库：在 `src/utils/keywords.ts` 中维护 hostileWords / cooperativeWords / deceptiveWords 词表。
6. 当 phase ∈ {'observe','action','resolve'} 时允许 reaction / public speech；arbitrate 期间仅允许 NarrationBanner。
7. 在 uiStore 中加 `privateDrawerOpen`、`unreadPrivateCount`；密谈抽屉默认关闭，新私聊到来时角标 +1。

【禁止做的事】
- 禁止调用真实 LLM。
- 禁止把所有 AI 发言写成同一种风格，必须按势力模板差异化。
- 禁止使用普通聊天 UI（无头像、无势力色、无打字机）。
- 禁止在 PublicSpeechBubble 内硬编码势力色，必须读 token。
- 禁止省略 reaction / narration 两种发言类型。
- 禁止把 AI 回复写进 CommandTerminal 内部。
- 禁止在事件流之外保留独立 AI 历史（一切走 events / privateMessages）。
- 禁止在本任务接入地图渲染（任务 11 负责）。
- 禁止接入后端 / WebSocket。

【验收标准】
1. 八大势力模板分别就位，每个势力 ≥ 6 条模板。
2. 玩家 speech 后 1~3s 出现至少一条 AI 公开回复且风格与势力性格一致。
3. 玩家 private 后 1.5~3s 出现 AI 私聊回复，10% 概率"假答应+5~10s 后 betrayal 占位事件"。
4. PublicSpeechBubble 使用势力色描边，打字机效果存在。
5. PrivateMessageDrawer 抽屉可折叠，新私聊角标 +1。
6. ReactionTag 1.5s 自动消失。
7. NarrationBanner 在阶段切换 / 战争关键事件出现。
8. 关键词高亮按词表生效。
9. arbitrate 期间不出现 reaction / public speech，仅 narration。
10. 任何 AI 输出来自 `aiTemplates` 而非硬编码，且通过 `triggerAIResponses` 走 store。

请按以上规范完成本任务。完成后输出模板片段、触发逻辑摘要、关键词高亮策略。
```

### 预期产物

- `src/mock/aiTemplates.ts`、`src/mock/aiResponder.ts`、`src/utils/keywords.ts`。
- `src/features/aiSpeech/{PublicSpeechBubble,PrivateMessageDrawer,ReactionTag,NarrationBanner}.tsx`、`useAIResponseScheduler.ts`。
- uiStore 新增字段。
- EventStreamPanel 接入 AI 发言显示。

### 验收标准

1. 八势力模板齐全且差异化。
2. speech 触发 reaction + 公开回复。
3. private 触发 70% 回复 + 假答应概率。
4. PublicSpeechBubble 含势力色 + 打字机。
5. PrivateDrawer 含未读角标。
6. ReactionTag 自动消失。
7. NarrationBanner 在关键事件触发。
8. 关键词高亮生效。
9. arbitrate 仅 narration。
10. 所有 AI 输出走 store。

### 禁止事项

- 禁止接入真实 LLM。
- 禁止统一所有势力风格。
- 禁止使用普通聊天 UI。
- 禁止硬编码势力色。
- 禁止省略 reaction / narration。
- 禁止把回复逻辑写进 CommandTerminal。
- 禁止在事件流之外另建 AI 历史。
- 禁止接入后端 / WebSocket / 地图。

---

## 任务 9：构建左侧事件流

### 使用场景

事件由 gameLoop 与 AI 回复持续产出，玩家通过左侧事件流感知游戏世界变化。本任务实现完整的事件流 UI 与交互（优先级、滑入动画、点击聚焦、势力色、可折叠）。

### 可直接复制给 AI 编程工具的完整提示词

```
你是一名前端信息流工程师。请为《外交风云》— 人机混战 AI Diplomacy 项目构建左侧事件流（EventStream）。

【项目背景】
事件流是玩家感知世界的核心通道，要传达"宣战 / 结盟 / 贸易 / 背叛 / 密谈请求 / 战斗 / 经济变化 / 情报"。优先级 P0（紧急）/P1（重要）/P2（信息）。事件颜色与势力关联。

【优先级视觉规范】
- P0：红色发光描边 + 全屏边缘红色脉冲 + 镜头自动转向（本任务先实现描边与边缘脉冲；镜头由任务 14 处理）。中心大字（2s）由 NarrationBanner 承担，本任务不重复。
- P1：势力色描边 + 左侧滑入动画 + 地图位置标记（位置标记任务 11 接入）。
- P2：浅灰色描边 + 默认静默出现。

【技术栈】
React 19 + TypeScript + Tailwind + Framer Motion + Zustand。

【工程前提】
- 已存在 gameStore（events 数组）。
- 已存在 EventStreamPanel 占位（任务 5）。
- 已存在 mock/factions.ts 与 visual tokens。

【本任务允许做以下事情】
1. 重写 `src/features/eventStream/`：
   - `EventStream.tsx`：左侧主面板，topbar 显示"事件流"+ 筛选按钮（全部 / P0 / P1 / 我相关）。
   - `EventItem.tsx`：单条事件，结构包含图标、势力色头像、kind 标签、actor → target、narration 摘要、时间戳（相对时间，秒/分钟/小时）。
   - `EventBadge.tsx`：左上角 P0/P1/P2 徽章。
   - `EventFilters.tsx`：筛选状态保存在 uiStore。
   - `EventGroup.tsx`：同一回合事件可折叠为分组（按 epoch.turn 分组）。
   - `useEventFocus.ts`：点击事件后调用 `uiStore.setMapFocus({regionId})` + `gameStore` 临时高亮 actor 与 target；地图实际聚焦在任务 11 完成接入，本任务先在 console 与 uiStore 中体现。
2. 在 uiStore 中扩展：`eventFilter: 'all'|'P0'|'P1'|'mine'`、`mapFocus: { regionId?: string; factionId?: FactionId } | null`、`eventStreamScrollMode: 'auto'|'manual'`。
3. 新事件滑入动画：从左侧 -16px slide-in + opacity 0→1 + 势力色描边脉冲 1 次（300ms）。P0 事件额外触发屏幕左右两侧 12px 红色脉冲（CSS 伪元素 overlay）。
4. 自动滚动到最新：当用户处于列表顶部时启用 auto；当用户向上滚动后切换为 manual 并在底部出现"返回最新"按钮。
5. 折叠 / 展开：点击 EventGroup 标题折叠该回合事件；保持当前回合默认展开。
6. 键盘：`F` 切换 EventStream 全屏（占满左侧 60% 宽）；`Esc` 取消聚焦；上下方向键在事件之间移动选中。
7. 当用户筛选为"我相关"时，仅显示 actor / target 含 selectedFactionId 的事件，或 kind === 'phase_change' / 'narration'。

【禁止做的事】
- 禁止把事件流做成普通日志或控制台风格。
- 禁止省略优先级视觉差异。
- 禁止省略势力色头像。
- 禁止使用圆角与亮色背景。
- 禁止把事件渲染写进 GamePage 直接 JSX（必须通过 EventStream 组件）。
- 禁止在事件流内执行 store 写入（除聚焦相关的 uiStore 写入）。
- 禁止接入真实后端。
- 禁止改动 mock/factions.ts 与 protocol 目录。

【验收标准】
1. P0/P1/P2 三种视觉差异明显。
2. P0 事件触发屏幕左右红色脉冲（短暂、不影响点击）。
3. 新事件滑入动画与势力色脉冲存在。
4. 列表按 epoch.turn 分组，默认当前回合展开。
5. 筛选 全部 / P0 / P1 / 我相关 工作正常。
6. 自动滚动 / 手动滚动 / 返回最新按钮存在。
7. 键盘 F / Esc / 方向键 工作正常。
8. 点击事件写入 uiStore.mapFocus（值与 console 输出一致）。
9. 整体视觉非日志非聊天，符合科幻 HUD。
10. 性能：100 条事件下滚动平滑 60fps。

请按以上规范完成本任务。完成后输出 EventItem 关键代码、滚动与筛选策略、键盘交互说明。
```

### 预期产物

- `src/features/eventStream/{EventStream,EventItem,EventBadge,EventFilters,EventGroup}.tsx`、`useEventFocus.ts`。
- uiStore 扩展字段（eventFilter / mapFocus / scrollMode）。
- 全局 P0 边缘脉冲叠加层。

### 验收标准

1. P0/P1/P2 视觉差异明显。
2. P0 边缘脉冲存在。
3. 新事件滑入动画与脉冲存在。
4. 按回合分组与默认展开正确。
5. 筛选四种模式可用。
6. 自动 / 手动滚动 + 返回最新按钮。
7. 键盘 F/Esc/上下方向键正常。
8. 点击事件写入 uiStore.mapFocus。
9. 视觉非日志非聊天。
10. 100 条事件 60fps。

### 禁止事项

- 禁止控制台风格。
- 禁止省略优先级差异。
- 禁止省略势力色头像。
- 禁止圆角 / 亮色背景。
- 禁止 JSX 散写到 GamePage。
- 禁止事件流内写主 store 数据。
- 禁止接入后端。
- 禁止改动 mock/factions.ts 与 protocol 目录。

---

## 任务 10：构建右侧势力关系面板

### 使用场景

势力关系是外交游戏的核心信息。本任务实现完整的右侧关系面板：八势力列表、关系值、状态、条约、四维指标、hover 详情、点击聚焦、关系变化动画。

### 可直接复制给 AI 编程工具的完整提示词

```
你是一名前端关系网络工程师。请为《外交风云》— 人机混战 AI Diplomacy 项目构建右侧势力关系面板（RelationsPanel）。

【项目背景】
玩家需要一眼看出每个 AI 势力对自己的态度、当前条约、四维实力。当关系值变化时面板必须给出可见反馈。

【关系视觉规范】
- 关系值映射 status：≤-60 hostile / -60~-20 wary / -20~+20 neutral / +20~+60 friendly / +60 allied。
- status 颜色：hostile 红 / wary 橙 / neutral 灰 / friendly 蓝青 / allied 金。
- 条约标签：non_aggression / trade / alliance / ceasefire 各自图标 + 持续回合数。
- 四维指标：military / economy / diplomacy / culture，单条迷你 bar，0~150。
- 关系变化：从旧值滑动到新值（0.6s），并附带势力色脉冲一次。

【技术栈】
React 19 + TypeScript + Tailwind + Framer Motion + Zustand。

【工程前提】
- 已存在 gameStore（factions / relationships / regions）。
- 已存在 mock/factions.ts。
- 已存在 RelationsPanel 占位（任务 5）。
- 已存在 uiStore.mapFocus。

【本任务允许做以下事情】
1. 重写 `src/features/relationsPanel/`：
   - `RelationsPanel.tsx`：右侧主面板，包含切换 tab `[势力] [条约] [情报]`，默认"势力"。
   - `FactionRow.tsx`：单行势力，左侧头像（势力主色径向渐变）+ 名称 + 当前 status 标签（StatusBadge）+ 关系值（ScrollNumber）。
   - `FactionRowDetail.tsx`：hover 或点击展开，显示四维 mini-bar、当前条约清单、性格原型、说话风格简介。
   - `TreatyList.tsx`：第二 tab，按条约种类分组列出所有现存条约。
   - `IntelHints.tsx`：第三 tab，显示玩家"已知情报"占位（例如"暗潮商会 hover 关系，灰烬部族 持续敌对 3 回合"）。
   - `useRelationDelta.ts`：订阅 store.relationships 变化，记录前后 diff，触发动画。
2. 视觉规则：
   - 列表行高 64px。
   - hover 行：势力 glow 描边 + 行展开高度自适应。
   - 关系值变化时：值数字滑动 + 势力色光晕呼吸 1 次。
   - 当关系跌入 hostile 时：标签轻微抖动 + 红色脉冲。
3. 交互：
   - 点击 FactionRow → `uiStore.setMapFocus({ factionId })` + 在 EventStream 上方临时显示"已聚焦 XX"。
   - 双击 → 打开 FactionDetailModal（沿用任务 4 的 FactionDetailPanel 视觉，但为 modal，可关闭）。
   - 右键 → 显示快捷菜单（演讲到该势力 / 密谈 / 提议条约 / 派密使），点击后切换 CommandTerminal 模式与目标。
4. 排序：默认按"关系值降序"。
5. 筛选：顶部小开关"仅显示有条约的势力"、"仅敌对"。
6. 渲染性能：FactionRow 使用 `React.memo` + selector，避免整体 re-render。

【禁止做的事】
- 禁止使用电子表格 / Excel 风格堆数据。
- 禁止省略 hover 详情。
- 禁止省略动画。
- 禁止省略性格原型与说话风格简介。
- 禁止把关系数据散写到 RelationsPanel 内部（必须 selector 订阅 gameStore）。
- 禁止接入后端。
- 禁止改动 protocol 目录。
- 禁止省略响应式（< 1280px 时面板宽度收缩）。
- 禁止改动 CommandTerminal 内部实现（只能调用其暴露 action）。

【验收标准】
1. 三 tab `[势力] [条约] [情报]` 切换正常。
2. 八势力 row 显示主色头像、名称、status、关系值。
3. hover 行展开四维 mini-bar、条约清单、性格原型、说话风格。
4. 关系值变化时数字滑动 + 势力色光晕呼吸。
5. 跌入 hostile 时标签抖动 + 红色脉冲。
6. 点击 → uiStore.mapFocus 写入。
7. 双击 → 打开势力详情 modal。
8. 右键 → 显示快捷菜单并能切换 CommandTerminal。
9. 默认排序为关系值降序。
10. 性能：100 次/秒关系变化下面板仍 60fps。

请按以上规范完成本任务。完成后输出 FactionRow 关键代码、关系动画策略、右键菜单接入说明。
```

### 预期产物

- `src/features/relationsPanel/{RelationsPanel,FactionRow,FactionRowDetail,TreatyList,IntelHints}.tsx`、`useRelationDelta.ts`。
- FactionDetailModal 复用任务 4 风格。
- 右键快捷菜单接入 CommandTerminal。

### 验收标准

1. 三 tab 切换正常。
2. row 显示完整。
3. hover 详情展开。
4. 关系动画存在。
5. hostile 跌入抖动。
6. 点击写 mapFocus。
7. 双击打开 modal。
8. 右键菜单接入终端。
9. 默认排序正确。
10. 性能 60fps。

### 禁止事项

- 禁止 Excel 风格堆数据。
- 禁止省略 hover 详情。
- 禁止省略动画。
- 禁止省略性格信息。
- 禁止数据散写到组件。
- 禁止接入后端 / 改 protocol。
- 禁止省略响应式。
- 禁止改 CommandTerminal 内部实现。

---

## 任务 11：构建像素粒子战略地图 MVP

### 使用场景

中央 MapStage 一直是占位。本任务用低复杂度方案先做出强风格的 2.5D / 圆形战略地图：粒子化星球或圆形板块、势力区域、发光边界、城市光点、贸易弧线、密谈射线、战争火花。先不追求完整 Three.js 50K 粒子。

### 可直接复制给 AI 编程工具的完整提示词

```
你是一名前端实时图形工程师。请为《外交风云》— 人机混战 AI Diplomacy 项目构建像素粒子战略地图 MVP。

【项目背景】
设计文档目标是完整的 Three.js + R3F + SDF + GPU 粒子地球。本任务作为 MVP，先选择"低复杂度方案"：圆形 2.5D 战略板块 + canvas2D（或 R3F 简化 shader），优先保证强烈风格 + 与 mock 数据驱动 + 60fps。

【技术栈选择】
React 19 + TypeScript + Tailwind + Framer Motion + Zustand。可使用 React Three Fiber + drei，但本任务限制：
- 只允许使用 sphere geometry / line / instancedMesh basic。
- 禁止编写重 shader（仅可用 ShaderMaterial 实现简单噪声 + 发光，不允许复杂 SDF 距离场）。
- 渲染规模硬上限：粒子 ≤ 8000，并保留性能开关 `uiStore.mapQuality: 'low'|'mid'|'high'`。
若 R3F 配置过重，可降级为 canvas2D：64 区域绘制成圆形板块，能量粒子用 canvas2D 模拟，仍需做到本规范要求。

【数据来源】
- gameStore.regions：64 个区域，含 owner / resourceValue / developmentLevel / centerLatLng / terrain。
- gameStore.factions：用于颜色与强度。
- gameStore.relationships：贸易 / 密谈 / 战争边界视觉。
- gameStore.events：触发演讲涟漪、宣战火花等（任务 12 / 13 接入）。
- uiStore.mapFocus：聚焦某 region 或 faction。

【本任务允许做以下事情】
1. 在 `src/render/` 下新建 MapStageR3F.tsx（若选 R3F）或 MapStage2D.tsx（若选 canvas2D）。在 features/hud/MapStage.tsx 中根据 `uiStore.mapQuality` 自动选择实现。
2. 核心视觉元素：
   - 中央 2.5D 圆形战略板块（半径 = 容器最短边 * 0.42）。
   - 64 个 region 以 Voronoi 风格切割成扇区或方块，按 owner 填势力 Primary 色，叠加噪声 + 内部呼吸光晕。
   - 区域边界：相邻 region owner 不同时绘制 1~2px 发光边界，颜色为双方 Glow 色混合，且周期性脉冲。
   - 城市光点：每个 region 按 developmentLevel 渲染 1~5 个城市光点（白色 / Glow 色）。
   - 贸易弧线：所有 status='allied' 或 'friendly' 且含 trade 条约的关系，绘制弧线 + 金色粒子流动。
   - 密谈射线：当前回合内 events 中 kind='private' 且 createdAt < 5s，绘制双方之间暗紫色定向射线，5s 后衰减消失。
   - 战争边境火花：status='hostile' 的边界叠加红色火花粒子。
3. 交互：
   - hover region：显示一个 tooltip，包含 region id / owner / development / terrain。
   - 点击 region：写入 uiStore.mapFocus 并暂时高亮该 region + owner 势力的相邻 region。
   - 滚轮缩放（仅视觉缩放 0.85~1.25 倍，禁止地图变形）；右键拖动平移；按 `M` 重置视角。
4. 性能：
   - 暴露 `uiStore.mapQuality`：low ≤ 2000 粒子；mid ≤ 4000；high ≤ 8000。
   - useFrame 中直接读取 gameStore.getState()，不经 React re-render（参考"三层状态隔离"）。
   - 全局粒子池预分配，不动态创建销毁。
5. mapFocus 联动：当 uiStore.mapFocus 改变（来自事件流 / 关系面板），地图视角缓慢拉近对应 region（视觉缩放 + 偏移）。
6. 视觉风格强度调节：通过 uiStore.mapQuality 决定能量场亮度 / 粒子密度 / bloom 模拟程度。

【禁止做的事】
- 禁止一次性实现 50K GPU 粒子。
- 禁止写复杂 SDF / 距离场 / Voronoi shader（最多 fragment shader 内 fbm 噪声 + 简单发光）。
- 禁止把地图做成静态图片或 SVG。
- 禁止让地图与游戏状态脱节（地图视觉必须由 store 驱动，禁止硬编码 region）。
- 禁止把交互（hover / 点击 / 缩放）放在 React 整体 re-render 中。
- 禁止使用第三方付费地图 SDK。
- 禁止接入真实后端 / WebSocket。
- 禁止把 MapStage 改成全屏盖住其他 HUD（必须仍嵌入中央）。
- 禁止破坏任务 5 设定的 HUD 五区比例。

【验收标准】
1. MapStage 内呈现一个像素粒子风格的 2.5D 圆形战略板块（含 64 个 region）。
2. region 按 owner 填势力 Primary 色 + 内部噪声 / 呼吸光晕。
3. 区域边界绘制 1~2px 发光线 + 周期性脉冲。
4. 城市光点数量与 developmentLevel 对应。
5. 贸易弧线 + 金色粒子流动存在（status allied/friendly + trade 条约）。
6. 密谈射线在 events 触发后 5s 内出现并衰减。
7. 战争边境火花在 hostile 边界出现。
8. hover region 显示 tooltip。
9. 点击 region 写 uiStore.mapFocus；mapFocus 改变时视角拉近。
10. 在 high 质量下 60fps 稳定，low/mid 在低端设备也能流畅运行。

请按以上规范完成本任务。完成后输出 MapStage 数据流图、性能策略、视觉关键点。
```

### 预期产物

- `src/render/{MapStageR3F,MapStage2D,particles,bordersLayer,tradeArcs,privateRays,warSparks}.tsx`（按所选实现方案）。
- `src/features/hud/MapStage.tsx` 接入根据 mapQuality 选择实现。
- uiStore 扩展 `mapQuality / mapZoom / mapFocus`。
- region tooltip、hover、点击、滚轮缩放、右键平移、`M` 重置视角。

### 验收标准

1. 圆形战略板块 + 64 区域呈现。
2. region 按 owner 着色 + 呼吸光晕。
3. 发光边界 + 脉冲。
4. 城市光点对应 developmentLevel。
5. 贸易弧线 + 金色粒子。
6. 密谈射线 5s 内出现并消失。
7. hostile 边界火花。
8. hover tooltip / 点击聚焦 / 滚轮缩放 / 右键平移 / M 重置。
9. mapFocus 改变时视角拉近。
10. high 60fps、low/mid 流畅。

### 禁止事项

- 禁止一次性 50K GPU 粒子。
- 禁止重型 SDF shader。
- 禁止地图变静态图片或 SVG。
- 禁止与游戏状态脱节。
- 禁止破坏 HUD 比例。
- 禁止 React 整体 re-render 驱动地图。
- 禁止第三方付费地图 SDK。
- 禁止接入真实后端。

---

## 任务 12：构建演讲 / 密谈 / 贸易 / 结盟粒子效果

### 使用场景

地图 MVP 就绪后，核心外交行为需要专属视觉反馈：演讲（环形扩散）/ 密谈（定向射线）/ 贸易（金色弧流）/ 结盟（共鸣光桥）。本任务实现事件驱动的粒子效果，与事件系统解耦。

### 可直接复制给 AI 编程工具的完整提示词

```
你是一名前端 VFX 工程师。请为《外交风云》— 人机混战 AI Diplomacy 项目构建演讲 / 密谈 / 贸易 / 结盟四种核心外交粒子效果。

【项目背景】
四种核心外交行为需要差异化视觉反馈：
- 演讲 speech：玩家或某势力中心向四面八方扩散环形粒子波。
- 密谈 private：两势力之间出现定向暗紫粒子射线（任务 11 已实现简化版，本任务做完整版）。
- 贸易 trade：金色粒子沿贝塞尔弧线双向流动。
- 结盟 alliance：双方边界产生共鸣光桥（白金色脉冲桥梁）。

【数据驱动】
所有效果由 gameStore.events 驱动；订阅 events 末尾追加：
- kind=speech → 在 actor 势力中心触发环形扩散。
- kind=private → 在 actor → target 之间触发定向暗紫射线。
- kind=trade → 若该条约新建立，则在 actor ↔ target 之间持续生成金色弧流（直到条约结束）。
- kind=alliance → 双方边界共鸣光桥脉冲 6s。

【技术栈】
React 19 + TypeScript + Tailwind + Framer Motion + Zustand。可使用 R3F 与 InstancedMesh basic，但只能写基础 vertex/fragment shader（叠加 fbm 噪声 + 发光 + alpha 衰减），不允许写 SDF 距离场。

【工程前提】
- 任务 11 已实现 MapStage 与 64 region 视觉。
- 已存在 gameStore.events / relationships。
- 已存在视觉 token 八势力色。

【本任务允许做以下事情】
1. 在 `src/effects/` 下创建：
   - `EffectsLayer.tsx`：挂在 MapStage 同一容器，覆盖在地图视觉之上但低于 HUD。
   - `SpeechRipple.tsx`：环形扩散，参数 `{ origin, color, duration=2200ms, maxRadius }`，自动消失。
   - `PrivateBeam.tsx`：定向射线，参数 `{ from, to, color='#9933FF', life=5000ms, density }`，渐隐。
   - `TradeArc.tsx`：贝塞尔弧 + 双向金色粒子流，参数 `{ from, to, density=20, persist=true }`，由条约存续控制。
   - `AllianceBridge.tsx`：共鸣光桥，参数 `{ a, b, life=6000ms }`，桥梁脉冲 + 双方颜色叠加白金。
2. 在 `src/effects/useEffectsBus.ts` 中实现事件 → 效果总线：
   - 订阅 gameStore.events 末尾追加。
   - 按 event.kind 决定 spawn 哪种效果。
   - 效果实例池预分配（每种类型 8 个并发上限）；超过上限时丢弃最早的并复用资源。
   - 每个效果有完整生命周期 onSpawn → onUpdate(dt) → onComplete，自动清理。
3. EffectsLayer 接受 mapQuality 自动降级：low 关闭 SpeechRipple 与 AllianceBridge 内层粒子；mid 减半密度；high 全开。
4. 视觉规范：
   - SpeechRipple：3 圈同心环 + 内向粒子拖尾。
   - PrivateBeam：粒子沿直线高速移动 + 末端微微震动 + 暗紫色高斯光带。
   - TradeArc：贝塞尔弧明确高度，粒子从 a→b 与 b→a 同时流动，金色 #CCAA33 ~ #FFD86B 渐变。
   - AllianceBridge：白金色光桥含细小光粒上下抖动，6s 内淡出。
5. 与任务 11 已有 PrivateRay 解耦：将任务 11 中简化版的 PrivateRay 替换为 `<PrivateBeam>`。

【禁止做的事】
- 禁止永久堆积粒子（必须有生命周期与池）。
- 禁止把所有效果做成同一外观。
- 禁止使用过重 shader（无 SDF / 无后处理叠加 / 无复杂噪声）。
- 禁止把效果触发逻辑硬编码到 CommandTerminal 或 EventStream（必须经 useEffectsBus）。
- 禁止把效果绑定到 React state（必须 useRef / useFrame）。
- 禁止破坏任务 11 的 60fps 目标。
- 禁止接入后端 / WebSocket。

【验收标准】
1. speech 事件触发后立刻看到 SpeechRipple 环形扩散，2.2s 自动消失。
2. private 事件触发后在双方之间出现 PrivateBeam，5s 内渐隐。
3. 新建 trade 条约后 TradeArc 持续出现金色双向粒子直到条约结束。
4. alliance 事件触发 6s AllianceBridge 脉冲。
5. mapQuality=low 时关闭部分细节，仍能识别四种效果。
6. 同屏 ≥ 8 个并发效果时不卡顿，资源池正确复用。
7. 效果均通过 useEffectsBus 触发，不在 UI 组件中硬编码。
8. 任务 11 的简化 PrivateRay 已被 PrivateBeam 替换。
9. 效果与 HUD 层级正确（位于地图视觉之上、HUD 之下）。
10. 视觉风格统一像素粒子 + 发光，无圆角 SaaS 痕迹。

请按以上规范完成本任务。完成后输出 useEffectsBus 摘要、各效果生命周期参数、性能策略。
```

### 预期产物

- `src/effects/{EffectsLayer,SpeechRipple,PrivateBeam,TradeArc,AllianceBridge}.tsx`、`useEffectsBus.ts`。
- 接入 MapStage 同一容器。
- 替换任务 11 的简化 PrivateRay。

### 验收标准

1. speech → SpeechRipple 2.2s。
2. private → PrivateBeam 5s。
3. trade → TradeArc 持续。
4. alliance → AllianceBridge 6s。
5. mapQuality 降级生效。
6. 8 并发不卡顿。
7. 效果走 useEffectsBus。
8. 替换 PrivateRay。
9. 层级正确。
10. 风格统一像素粒子。

### 禁止事项

- 禁止永久堆积粒子。
- 禁止四效果同质化。
- 禁止重 shader。
- 禁止把触发逻辑硬编码到 UI 组件。
- 禁止绑 React state。
- 禁止破坏 60fps。
- 禁止接入后端。

---

## 任务 13：构建宣战与战争冲突动画

### 使用场景

宣战 / 边境冲突 / 战斗结果需要强反馈。本任务实现宣战冲击波、边境火花强化、地图震动、战斗结果卡片、战损数字动画、战斗结束后区域状态更新。

### 可直接复制给 AI 编程工具的完整提示词

```
你是一名前端战斗动画工程师。请为《外交风云》— 人机混战 AI Diplomacy 项目构建宣战与战争冲突动画系统。

【项目背景】
战争是 P0 级事件，必须强反馈。设计文档定义：
- 0.0s 镜头快速推向边境线 + BGM 低频鼓点渐入（本任务先不接 BGM）。
- 0.5s 边境线剧烈震动，双方粒子加速碰撞。
- 1.0s 裂缝出现 + 红色能量喷涌 + 屏幕轻微震动。
- 1.5s 冲击波扩散，临近势力涟漪。
- 2.5s 裂缝稳定为"战争前线"，双方颜色激烈交融。
- 3.5s 镜头缓慢拉远 + UI 弹出战争状态标签 + 全局关系线闪烁更新。
- 5.0s 回到正常视角，战争前线持续动画（直到战争结束）。

【数据来源】
gameStore.events 中 kind='declare_war' 与 kind='battle'：
- declare_war：触发宣战动画 5s。
- battle：触发 BattleResultCard，包含 attacker/defender、atk_loss/def_loss、territory_captured、morale_shift；卡片自动播放战损数字滚动 + 双方颜色对撞。

【技术栈】
React 19 + TypeScript + Tailwind + Framer Motion + Zustand + R3F basic（用于地图层效果）。

【工程前提】
- MapStage / EffectsLayer / EventStream / NarrationBanner 已就绪。
- 任务 12 效果总线 useEffectsBus 已就绪，需扩展。

【本任务允许做以下事情】
1. 在 `src/effects/war/` 下创建：
   - `DeclareWarShockwave.tsx`：边境裂缝 + 红色冲击波，参数 `{ from, to, regionId? }`，时长 5s。
   - `BorderSparkBoost.tsx`：宣战 / 持续战争期间，加强 hostile 边境火花密度。
   - `ScreenShake.ts`：调用 `ScreenShake.trigger(intensity, duration)`，在屏幕根容器使用 CSS transform 实现 ≤ 8px 抖动；轻 / 中 / 重三档。
   - `BattleResultCard.tsx`：中央偏右位置的事件卡片，势力色对撞、攻守双方头像、ScrollNumber 滚动战损 / 士气变化、territory_captured 时显示"领土易主"红色高亮 + 一行 narration；用户点击"下一事件 →"可关闭，或 6s 自动隐藏。
   - `BattleFrontlineParticles.tsx`：战争存续期间，对应边境呈现"持续作战火花 + 烟尘"粒子层（密度低于 declare_war 时的爆发，但持久）。
2. 在 useEffectsBus 中扩展：
   - declare_war 事件：触发 DeclareWarShockwave 5s + ScreenShake 重 → 中 → 轻、共 1.5s 衰减 + BorderSparkBoost 持续。
   - battle 事件：触发 BattleResultCard，并对涉及 region 触发 BorderSparkBoost 闪烁 800ms。
   - peace / ceasefire 事件：停止 BorderSparkBoost。
3. 战斗结束后地图区域状态更新：
   - 若 result.territory_captured：调用 `gameStore.updateRegionOwner(regionId, attacker)`；新 owner 的颜色在 1.2s 内"流入"该 region（CSS / shader uniform 动画）。
   - 调整 factions 中相关势力 morale 与 totalPower（小幅，本任务直接 set）。
4. 视觉规则：
   - DeclareWarShockwave 颜色基于攻击方 Glow（默认红基底叠加攻击方 Glow）。
   - BattleResultCard 背景半透明黑 + 攻守双方 Glow 描边对撞；attacker 在左、defender 在右。
   - territory_captured 时附加 "+1 区域" 飘字。
5. 性能：BorderSparkBoost 在 mapQuality=low 时降密度 75%；BattleResultCard 不阻断地图渲染。

【禁止做的事】
- 禁止把宣战 / 战斗反馈做成普通 toast / 弹窗。
- 禁止省略地图反馈（必须包含 ScreenShake / BorderSparkBoost / 领土流入）。
- 禁止省略战损 ScrollNumber 动画。
- 禁止省略 territory_captured 视觉反馈。
- 禁止接入真实后端 / 战斗规则计算（本任务沿用 mock 字段，不引入规则引擎）。
- 禁止破坏 60fps。
- 禁止动画期间锁住玩家输入（玩家仍可操作 CommandTerminal）。
- 禁止 ScreenShake 抖动 > 8px。

【验收标准】
1. declare_war 事件触发 5s 宣战动画 + 屏幕震动 + 持续 BorderSparkBoost。
2. battle 事件触发 BattleResultCard 含战损 ScrollNumber + 双方对撞视觉。
3. territory_captured 时新 owner 颜色 1.2s 内流入该 region。
4. peace / ceasefire 后 BorderSparkBoost 停止。
5. ScreenShake 抖动 ≤ 8px，1.5s 衰减。
6. BattleResultCard 6s 自动隐藏或用户可关闭。
7. mapQuality 降级生效。
8. declare_war / battle 触发期间整体仍 60fps。
9. 玩家在动画期间仍可输入命令。
10. 视觉为科幻战略战场反馈，无普通 toast 痕迹。

请按以上规范完成本任务。完成后输出 useEffectsBus war 分支摘要、BattleResultCard 关键代码、领土流入实现策略。
```

### 预期产物

- `src/effects/war/{DeclareWarShockwave,BorderSparkBoost,ScreenShake,BattleResultCard,BattleFrontlineParticles}.tsx/.ts`。
- useEffectsBus 扩展 war 分支。
- gameStore 增加 territory / morale 更新逻辑。

### 验收标准

1. 5s 宣战动画 + 震动 + Spark Boost。
2. BattleResultCard 完整。
3. territory_captured 颜色流入。
4. peace 停止 BorderSparkBoost。
5. ScreenShake 限制 ≤ 8px。
6. 卡片 6s 自动隐藏 / 可手动关闭。
7. mapQuality 降级。
8. 60fps。
9. 输入不阻断。
10. 视觉非 toast。

### 禁止事项

- 禁止 toast 风格。
- 禁止省略地图反馈。
- 禁止省略 ScrollNumber 战损。
- 禁止省略 territory_captured 反馈。
- 禁止接入真实战斗规则。
- 禁止破坏 60fps。
- 禁止锁住玩家输入。
- 禁止抖动 > 8px。

---

## 任务 14：构建回合阶段切换系统

### 使用场景

mock gameLoop 已经在背后切换阶段，但前端尚未对四阶段差异做出 UI 响应。本任务实现 observe / action / arbitrate（含三子阶段）/ resolve 的视觉差异 + AI 思考进度 + 结算事件逐条播放。

### 可直接复制给 AI 编程工具的完整提示词

```
你是一名前端节奏感工程师。请为《外交风云》— 人机混战 AI Diplomacy 项目构建回合阶段切换系统。

【项目背景】
设计文档定义五种阶段（含裁决三子阶段）：
- 态势感知期 observe 15s：UI 占屏 8%，镜头自动巡游，CommandTerminal 折叠。
- 行动期 action 90s：UI 占屏 35%，CommandTerminal 全开。
- 博弈期（AI 决策）/ 在本项目实现为 resolve 30s：UI 占屏 20%，中央显示 AI 思考进度卡片，CommandTerminal 隐藏，每个 AI 一根进度条 ████░░ ✓。
- 结算期 resolve 15s：UI 占屏 30%，中央卡片逐条揭晓事件，下一事件按钮。
- 裁决阶段三子：battle 20s → epic 60s → summary 15s（任务 15 详细处理 summary）。

【技术栈】
React 19 + TypeScript + Tailwind + Framer Motion + Zustand。

【工程前提】
- gameStore 含 epoch.phase / arbitratePhase。
- HUD 各组件存在。
- uiStore.hudMode 已存在但未自动联动。

【本任务允许做以下事情】
1. 在 `src/features/phaseSystem/` 下创建：
   - `PhaseStateMachine.ts`：纯函数 + 类型，映射 phase 与 arbitratePhase → 一套 UI 配置 `{ commandTerminalVisible, eventStreamVisible, relationsVisible, aiThinkingVisible, mapZoom, hudOcclusion }`。
   - `PhaseIndicator.tsx`：顶部纪元 / 阶段 / 倒计时（替换任务 5 静态版本），阶段名称呈现"态势感知 / 行动 / 博弈 / 结算 / 裁决·战争 / 裁决·史诗 / 裁决·总结"。
   - `PhaseTransitionOverlay.tsx`：阶段切换时全屏 0.6s 过渡：势力色快速光条扫过、阶段标题以打字机方式淡入、扫描线高速一次下扫。
   - `Countdown.tsx`：倒计时 mm:ss，最后 10s 心跳呼吸 + 数字红色脉冲。
   - `AIThinkingPanel.tsx`：博弈期中央卡片，列出八个 AI 势力（排除玩家所选势力），每个 AI 一根进度条 0~100% + ✓ 完成图标，进度由阶段时间 + 随机抖动驱动。
   - `ResolveEventPlayer.tsx`：结算期中央卡片，从 gameStore.events 中过滤当前 turn 的关键事件按顺序展示，每条卡片显示 narration + 关键 数字 + 一个"下一事件 →"按钮，用户可主动跳过，或 6s 自动下一条。
2. 自动联动：
   - 订阅 gameStore.epoch.phase / arbitratePhase 写入 uiStore.hudMode。
   - HUD 各组件读 uiStore.hudMode 决定显隐与尺寸（CommandTerminal 在 observe / resolve / arbitrate 期折叠为窄条；EventStream / RelationsPanel 在 observe 时窄化；MapStage 在 observe 时 mapZoom 拉远）。
3. 阶段切换动画：
   - 进入 observe：HUD 各面板向边缘收拢 0.4s，MapStage 中心放大。
   - 进入 action：HUD 重新展开 0.4s。
   - 进入 resolve：CommandTerminal 折叠 0.3s + AIThinkingPanel 居中淡入 0.4s。
   - 退出 resolve 进入 arbitrate·battle：AIThinkingPanel 淡出 + ResolveEventPlayer 居中淡入。
4. arbitrate 三子阶段：battle 强化 BorderSparkBoost；epic 暂时不实现完整 image2，先展示一张固定占位"史诗时刻"幕布（黑色 + 棕褐滤镜 + "历史正在书写..."文字）；summary 由任务 15 处理（本任务先确认能切换到该状态）。
5. 倒计时最后 10s：心跳音效暂不接入，仅做视觉脉冲。
6. 性能：阶段切换不应导致整屏 React re-render；HUD 组件可使用 framer-motion 的 `layout` 与 `motion.div` 做布局动画。

【禁止做的事】
- 禁止所有阶段 UI 一样。
- 禁止把倒计时做成普通数字。
- 禁止 AI 思考期没有悬念感（必须有进度条 + ✓ + 阶段标题）。
- 禁止结算期一次性展示所有事件（必须逐条 + 可手动跳过）。
- 禁止把阶段控制硬编码在 HUD 各组件内部（必须经 PhaseStateMachine + uiStore）。
- 禁止破坏 60fps。
- 禁止改动 gameLoop 阶段时长（保持任务 6 设定）。
- 禁止改动 gameStore 阶段逻辑（本任务只读阶段）。

【验收标准】
1. 五阶段（含裁决三子）UI 显隐与占比明显不同。
2. 顶部 PhaseIndicator 显示正确阶段名称。
3. Countdown 最后 10s 心跳呼吸 + 红色脉冲。
4. AIThinkingPanel 博弈期居中显示，每个 AI 一根进度条，逐步打 ✓。
5. ResolveEventPlayer 结算期逐条播放，下一事件按钮可用且 6s 自动跳。
6. PhaseTransitionOverlay 在阶段切换时显示 0.6s 全屏过渡。
7. arbitrate·epic 时显示棕褐占位幕布。
8. 阶段切换 60fps，整屏不闪烁。
9. CommandTerminal 在非 action 期不可输入。
10. HUD 各面板大小通过 framer-motion `layout` 平滑切换。

请按以上规范完成本任务。完成后输出 PhaseStateMachine 表、PhaseTransitionOverlay 关键代码、AIThinkingPanel 进度策略。
```

### 预期产物

- `src/features/phaseSystem/{PhaseStateMachine.ts,PhaseIndicator,PhaseTransitionOverlay,Countdown,AIThinkingPanel,ResolveEventPlayer}.tsx`。
- 联动 uiStore.hudMode。
- HUD 各组件接入 hudMode 决定显隐尺寸。

### 验收标准

1. 五阶段 UI 差异化。
2. 顶部阶段名称正确。
3. 倒计时最后 10s 视觉脉冲。
4. AIThinkingPanel 进度条 + ✓。
5. ResolveEventPlayer 逐条播放 + 跳过。
6. PhaseTransitionOverlay 0.6s 全屏过渡。
7. arbitrate·epic 棕褐幕布。
8. 60fps + 不闪烁。
9. 非 action 期 CommandTerminal 不可输入。
10. HUD 大小 framer-motion 平滑切换。

### 禁止事项

- 禁止阶段 UI 一致。
- 禁止倒计时纯数字。
- 禁止 AI 思考期无悬念。
- 禁止结算期一次性展示。
- 禁止阶段控制硬编码 HUD 内。
- 禁止破坏 60fps。
- 禁止改动 gameLoop 时长。
- 禁止改动 gameStore 阶段逻辑。

---

## 任务 15：构建纪元结算界面

### 使用场景

每三回合（一个纪元）结束后进入 arbitrate·summary 阶段，需要全屏的庄严、史诗感纪元总结。包括纪元标题、重大事件、势力排名变化、关键战争、关键背叛、AI 旁白、进入下一纪元按钮。

### 可直接复制给 AI 编程工具的完整提示词

```
你是一名前端叙事视觉工程师。请为《外交风云》— 人机混战 AI Diplomacy 项目构建纪元结算界面（EpochSummary）。

【项目背景】
每完成一个纪元（3 回合），全屏进入纪元总结：背景地图弱化、棕褐色史书滤镜、史诗 BGM（本任务先不接 BGM）、AI 旁白逐字显现。结束后玩家点击"进入下一纪元"或自动进入 8s 倒计时。

【技术栈】
React 19 + TypeScript + Tailwind + Framer Motion + Zustand。可使用 R3F 但本任务不强制（背景可以使用任务 11 的 MapStage 弱化版本）。

【工程前提】
- gameStore.epoch / events / factions / relationships 数据完整。
- 任务 14 已可切换至 arbitrate.summary 状态。
- 任务 8 NarrationBanner 已存在。

【本任务允许做以下事情】
1. 实现 `src/pages/EpochSummaryPage.tsx`，作为 modal 全屏 overlay（不替换 GamePage 路由），由 uiStore.hudMode === 'arbitrate' && arbitratePhase === 'summary' 自动显示。
2. 在 `src/features/epochSummary/` 创建：
   - `EpochTitle.tsx`：屏幕中央上方"纪元 III · 终章"或"纪元 III · 史册"，使用 hud 字体 + Glow 描边 + 入场动画（粒子聚合）。
   - `MajorEvents.tsx`：本纪元 events 中 priority='P0' 与 'P1' 的精选 5 条，按时间顺序排列，每条卡片含 kind 图标 / actor / target / 一句精炼 narration。
   - `RankingDelta.tsx`：八势力 totalPower 排名横向条形图，左侧上轮排名、右侧本轮排名、中间用上下箭头标示 ↑↓ 与差值。
   - `KeyWars.tsx`：本纪元发生战争清单（按区域、攻守、伤亡）。
   - `KeyBetrayals.tsx`：本纪元背叛事件清单（actor / target / 短叙述）。
   - `AINarration.tsx`：屏幕底部居中"史官 AI"旁白，逐字显现，本任务用 `src/mock/aiTemplates.ts` 中 SYSTEM_NARRATION_TEMPLATES 随机挑选 + 关键变量替换（例如 "纪元 III 终结。XX 帝国陨落，新的格局开始形成。"）。
   - `NextEpochButton.tsx`：PixelButton "进入下一纪元"，8s 自动倒计时；点击立即推进。
3. 背景：
   - 沿用 MapStage 的弱化版本（粒子密度 25%、bloom 强、棕褐色滤镜叠加），固定缩放 0.85。
   - 屏幕四周叠加暗色 vignette + 棕褐 ColorGrading 模拟"旧胶片"效果（CSS 滤镜即可）。
4. 入场动画：屏幕从黑色淡入 0.8s，EpochTitle 粒子聚合 1s，其余面板从两侧 slide-in 0.5s。
5. 离场动画：点击 NextEpochButton 后，棕褐滤镜淡出 0.6s，EpochSummary 整体淡出 0.5s，回到 GamePage。
6. 自动推进：8s 倒计时（视觉脉冲）+ 在 gameStore 中调用 `advancePhase()` 进入下一纪元。
7. 数据来源：所有内容必须从 gameStore 真实数据归纳（按当前 epoch.id 过滤 events），不写死。

【禁止做的事】
- 禁止做成普通弹窗 / 普通结算页。
- 禁止只显示数字（必须含 narration / KeyWars / KeyBetrayals）。
- 禁止缺少叙事感。
- 禁止缺少视觉转场（必须包括入场 / 离场 / 棕褐滤镜）。
- 禁止把数据硬编码到组件内（必须 selector 订阅 gameStore）。
- 禁止接入后端 / 真实 LLM。
- 禁止破坏 GamePage 路由（必须 overlay）。
- 禁止省略 8s 自动推进。

【验收标准】
1. arbitrate.summary 阶段自动出现 EpochSummary overlay。
2. EpochTitle 入场粒子聚合。
3. MajorEvents 含 P0/P1 精选 5 条且按时间排列。
4. RankingDelta 显示八势力上一轮 / 本轮排名 + 升降箭头。
5. KeyWars / KeyBetrayals 按本纪元真实数据列出。
6. AINarration 逐字显现且文本由模板生成。
7. NextEpochButton 8s 自动倒计时 + 可手动点击。
8. 棕褐滤镜 + vignette 生效。
9. 入场 / 离场动画完成不卡顿。
10. 全部数据来自 gameStore，无硬编码。

请按以上规范完成本任务。完成后输出 EpochSummaryPage 关键代码、AINarration 模板片段、动画时间线。
```

### 预期产物

- `src/pages/EpochSummaryPage.tsx`（作为 overlay 挂在 GamePage 之上）。
- `src/features/epochSummary/{EpochTitle,MajorEvents,RankingDelta,KeyWars,KeyBetrayals,AINarration,NextEpochButton}.tsx`。
- 棕褐滤镜 + vignette 实现。
- `src/mock/aiTemplates.ts` 扩展 SYSTEM_NARRATION_TEMPLATES。

### 验收标准

1. 阶段自动显示 overlay。
2. EpochTitle 粒子聚合。
3. MajorEvents 精选 5 条。
4. RankingDelta 升降箭头正确。
5. KeyWars / KeyBetrayals 真实数据。
6. AINarration 模板生成 + 逐字显现。
7. NextEpochButton 倒计时 + 点击。
8. 棕褐滤镜 + vignette。
9. 入场 / 离场动画。
10. 无硬编码。

### 禁止事项

- 禁止普通弹窗。
- 禁止只显示数字。
- 禁止缺少叙事 / 转场。
- 禁止硬编码数据。
- 禁止接入后端 / 真实 LLM。
- 禁止破坏路由。
- 禁止省略自动推进。

---

## 任务 16：构建赛后复盘页面

### 使用场景

游戏结束后玩家进入复盘页：时间轴 + 关键事件节点 + 势力兴衰曲线 + 密谈记录 + AI 内心独白 + 关系网络演变 + 名场面截图区 + 分享按钮。本任务用 mock replay data 即可，所有数据来自整局 gameStore 的累积事件。

### 可直接复制给 AI 编程工具的完整提示词

```
你是一名前端复盘体验工程师。请为《外交风云》— 人机混战 AI Diplomacy 项目构建赛后复盘页面（ReplayPage）。

【项目背景】
游戏结束 = 上帝之眼揭示一切。复盘要素：所有密谈、AI 日记 / 内心独白、欺骗 / 背叛链条、势力兴衰曲线。本任务用 mock 即可：游戏结束时按 gameStore 中累积事件生成 mock replay data，并补充 mock AI 内心独白（参考设计文档"AI 内心独白"格式）。

【技术栈】
React 19 + TypeScript + Tailwind + Framer Motion + Zustand。

【工程前提】
- gameStore 整局事件累积。
- mock/aiTemplates 存在。
- 视觉系统就绪。

【本任务允许做以下事情】
1. 实现 `src/pages/ReplayPage.tsx`，绑定路由 `/replay`，仅在游戏结束 / 玩家手动跳转时进入。
2. 在 `src/mock/replay.ts` 中实现 `buildReplay()`，由 gameStore 状态生成 mock replay data：
   - `timeline: Array<{ epoch, turn, phase, keyEventIds: string[] }>`。
   - `privateMessages: PrivateMessage[]`：全部密谈。
   - `aiInnerThoughts: Array<{ factionId, epoch, turn, text }>`：每个 AI 每回合一条，使用 mock 模板拼接，例如 "玩家提出结盟时语气太急切了，一定是被 C 威胁了。我决定假装接受，实际上已经和 C 达成了夹击协议。"
   - `factionCurves: Array<{ factionId, points: Array<{ epoch, turn, totalPower }> }>`：8 势力曲线占位。
   - `relationshipSnapshots: Array<{ epoch, matrix: Record<FactionId, Record<FactionId, RelationshipStatus>> }>`：每个纪元末关系矩阵。
   - `deceptionStats: Array<{ factionId, lies: number, exposed: number, successRate: number }>`：欺骗统计占位。
3. 在 `src/features/replay/` 创建：
   - `ReplayTimeline.tsx`：底部可拖动时间轴，节点高亮 ▲宣战 ▲灭国 ▲背叛 ▲结盟，点击跳转。
   - `ReplayStage.tsx`：中央区域，沿用 MapStage 视觉但接受 `replayTime` 参数；本任务用占位文案 "回放地图 (静态快照)"，仅按当前 timeline 节点切换 mapFocus（不实现完整回放动画）。
   - `PrivateMessageLog.tsx`：右侧密谈记录列表，按时间排序，包含 actor → target 与内容。
   - `AIInnerThoughtPanel.tsx`：屏幕下方 AI 内心独白滚动展示，配合时间轴节点同步显示当前回合 AI 想法。
   - `FactionCurves.tsx`：势力兴衰曲线（用 SVG / canvas2D 画 8 条线，颜色为势力 Primary）。
   - `RelationshipNetwork.tsx`：力导向图占位（每节点圆点 + 关系连线），按当前 timeline 节点显示矩阵；本任务可使用简化 SVG 静态布局（八节点圆形分布）。
   - `KeyMoments.tsx`：名场面截图占位，按 P0 事件生成卡片（先用样式占位，不真实截图）。
   - `ShareBar.tsx`：分享按钮"导出史书 / 分享名场面 / 一键复制链接"占位，按钮可点击但仅显示 toast "已复制 (mock)"。
   - `ReplayControls.tsx`：播放 / 暂停 / 1x / 2x / 4x 速率切换；时间轴自动推进时受速率影响。
3. 自动模式：进入 `/replay` 时若 gameStore 不为空则用 `buildReplay()` 生成 replay；若为空则使用 `src/mock/replayFixtures.ts` 中预置的一份完整 mock 数据（参考设计文档"复盘界面布局"格式）。
4. 视觉规范：
   - 整页采用棕褐色调（旧胶片）+ 全息扫描线 + 深色背景。
   - 时间轴节点用势力色脉冲。
   - AIInnerThoughtPanel 使用打字机效果显示，背景为深紫色 panel + 月光感星点。

【禁止做的事】
- 禁止把复盘做成普通结算页 / 仅显示胜负。
- 禁止省略"揭密感"（必须包含 AI 内心独白 / 密谈记录 / 欺骗统计）。
- 禁止接入真实后端 / 真实视频导出。
- 禁止省略 mock fixtures。
- 禁止破坏 GamePage 主路由。
- 禁止改动 mock/factions.ts。
- 禁止把数据硬编码到组件（必须经 buildReplay 或 fixtures）。
- 禁止省略时间轴节点的势力色脉冲。
- 禁止使用商业图表库（如 echarts、antd-charts），保持轻量 SVG / canvas2D。

【验收标准】
1. 路径 `/replay` 渲染完整复盘页面。
2. ReplayTimeline 包含 ▲宣战 ▲灭国 ▲背叛 ▲结盟 节点，可拖动可点击。
3. PrivateMessageLog 显示完整密谈记录。
4. AIInnerThoughtPanel 按 timeline 节点切换并打字机显现。
5. FactionCurves 显示 8 条势力兴衰曲线（颜色匹配 Primary）。
6. RelationshipNetwork 显示 8 节点 + 关系连线。
7. KeyMoments 含 P0 事件名场面占位卡片。
8. ShareBar 按钮可点击且 toast 反馈。
9. ReplayControls 播放 / 暂停 / 速率切换正常。
10. 进入 `/replay` 时数据来源正确（gameStore 非空时用 buildReplay，否则 fixtures）。

请按以上规范完成本任务。完成后输出 buildReplay 摘要、AIInnerThoughtPanel 关键代码、视觉规范确认。
```

### 预期产物

- `src/pages/ReplayPage.tsx`、`src/mock/replay.ts`、`src/mock/replayFixtures.ts`。
- `src/features/replay/{ReplayTimeline,ReplayStage,PrivateMessageLog,AIInnerThoughtPanel,FactionCurves,RelationshipNetwork,KeyMoments,ShareBar,ReplayControls}.tsx`。
- 自动从 gameStore 或 fixtures 生成 replay。

### 验收标准

1. `/replay` 渲染完整。
2. 时间轴节点齐全。
3. 密谈记录完整。
4. 内心独白按节点切换。
5. 8 条势力曲线颜色匹配。
6. 关系网络节点 + 连线。
7. 名场面占位卡片。
8. 分享按钮 toast 反馈。
9. 速率切换正常。
10. 数据来源正确。

### 禁止事项

- 禁止普通结算页。
- 禁止只显示胜负。
- 禁止省略 AI 内心独白。
- 禁止接入真实后端。
- 禁止省略 fixtures。
- 禁止破坏主路由。
- 禁止改 mock/factions.ts。
- 禁止硬编码数据。
- 禁止使用商业图表库。

---

## 任务 17：构建前后端协议适配层占位

### 使用场景

mock 已能驱动完整体验，但项目最终需要接入真实 WebSocket 后端。本任务先建立 protocol/adapter 占位，保证 UI 与 store 不直接依赖 mock 数据结构，让后端到来时仅需替换 transport 与 adapter，不动 UI。

### 可直接复制给 AI 编程工具的完整提示词

```
你是一名前端协议层架构师。请为《外交风云》— 人机混战 AI Diplomacy 项目构建前后端协议适配层占位。

【项目背景】
设计文档定义 WebSocket 消息格式：
- 信封：`{ v, id, t, ts, seq, p }`。
- 关键消息类型：`conn.*`, `room.*`, `phase.change`, `turn.begin`, `action.speak`, `action.broadcast`, `action.private`, `action.military`, `action.treaty`, `action.intel`, `action.rejected`, `resolve.events`, `resolve.map_diff`, `resolve.stats_diff`, `ai.thinking`, `ai.speak`, `ai.reaction`, `panorama.*`, `reconnect.*`。

【目标】
本任务不连接真实 WebSocket。我们构建一个 mock transport，把 mock gameLoop 与 AI 回复包装成 protocol 消息序列，再由 adapter 写回 gameStore。UI 永远只读 store，永远只通过 ActionDispatcher 发送消息。

【技术栈】
TypeScript 严格模式 + Zustand。

【工程前提】
- gameStore 已可被 mock 直接写入。
- mock/{factions,initialState,gameLoop,aiResponder,aiTemplates,replay}.ts 已存在。
- CommandTerminal.submitSpeech 当前直接写 store。

【本任务允许做以下事情】
1. 在 `src/protocol/types.ts` 完整定义：
   - 信封 `Envelope<T extends string, P>`。
   - 所有 incoming message 类型 union：`IncomingMessage`。
   - 所有 outgoing action 类型 union：`OutgoingMessage`。
   - 类型与 mock/types.ts 中数据结构兼容（FactionId / GamePhase / GameEvent 等）。
2. 在 `src/protocol/transport.ts` 实现 `MockTransport`：
   - 类 `MockTransport implements Transport`：`connect()`, `disconnect()`, `send(msg: OutgoingMessage)`, `on(handler: (msg: IncomingMessage) => void)`, `off(handler)`。
   - 内部维护一个事件总线，自身订阅 mock gameLoop + aiResponder 触发的所有事件，将它们序列化为 protocol 消息并通过 handler 推送给上层。
   - send() 时进行最小化"服务端模拟"：把玩家 action.speak / action.military / action.treaty / action.intel 转化为 mock 事件写回总线（这相当于"服务端"确认后再广播）。
3. 在 `src/protocol/adapter.ts` 实现 `attachAdapter(transport, gameStore)`：
   - 订阅 transport，按消息类型路由：
     - `phase.change` / `turn.begin` → `gameStore._applyPhase()`。
     - `resolve.events` → `gameStore._applyEvents()`。
     - `resolve.map_diff` → `gameStore._applyMapDiff()`。
     - `resolve.stats_diff` → `gameStore._applyStatsDiff()`。
     - `action.broadcast` / `action.private` / `ai.speak` / `ai.reaction` → `gameStore._applyEvents()`。
     - `action.rejected` → 触发 toast / `uiStore.setLastError()`。
   - 在 gameStore 中新增 `_applyXxx` 内部 action（不被 UI 直接调用），仅供 adapter 写入。
4. 在 `src/protocol/dispatcher.ts` 实现 `ActionDispatcher`：
   - `submitSpeech({ mode, content, targets, treatyKind?, militaryDetails?, intelDetails? })`。
   - 内部组装为 OutgoingMessage 后调用 `transport.send()`。
   - 不再让 UI 直接修改 gameStore.events / privateMessages。
5. 把 CommandTerminal 中 `submitSpeech` 改为调用 ActionDispatcher。把 aiResponder 改为只产出 mock 消息发到 MockTransport（而不是直接写 store）。把 gameLoop 也改为产出 mock 协议消息（phase.change / turn.begin / resolve.events 等）。
6. 入口：在 GamePage 挂载时执行 `const transport = new MockTransport(); transport.connect(); attachAdapter(transport, gameStore); ActionDispatcher.setTransport(transport); startMockGameLoop(transport)`；卸载时 disconnect。
7. 保留一处明确的 TODO：`src/protocol/transport.ts` 末尾留 `// TODO: 替换为 WebSocketTransport，URL 与 token 待后端接入`，并预留 `WebSocketTransport` 占位类（仅类型签名，不实现）。

【禁止做的事】
- 禁止连接真实 WebSocket。
- 禁止把协议消息与 UI 组件耦合（UI 永远只读 store）。
- 禁止让 UI 直接调用 gameStore._applyXxx。
- 禁止破坏现有 mock gameLoop / aiResponder 的事件产出节奏。
- 禁止删除 mock 数据，仅修改其触发路径。
- 禁止把 Envelope 写得无法被 MessagePack 序列化（保持纯 JSON 兼容）。
- 禁止省略 `WebSocketTransport` 占位。
- 禁止省略 `action.rejected` 流程。

【验收标准】
1. `src/protocol/types.ts` 完整定义信封与全部 incoming/outgoing 消息。
2. `MockTransport` 提供 connect/disconnect/send/on/off 接口并通过事件总线工作。
3. `attachAdapter` 路由所有相关消息到 gameStore._applyXxx。
4. `ActionDispatcher.submitSpeech` 替代 CommandTerminal 内的旧 submitSpeech。
5. mock gameLoop 与 aiResponder 改为产出协议消息，不再直接写 store。
6. UI 不再直接修改 events / privateMessages / phase / regions。
7. `WebSocketTransport` 占位类存在并标注 TODO。
8. 控制台无类型错误，`tsc --noEmit` 通过。
9. 游戏在重构后表现一致，所有任务 6~16 的功能仍正常。
10. 替换 mock → ws 时 UI 与 store 不需要修改。

请按以上规范完成本任务。完成后输出 types / transport / adapter / dispatcher 关键代码、迁移路径说明。
```

### 预期产物

- `src/protocol/{types,transport,adapter,dispatcher}.ts`、`WebSocketTransport` 占位。
- gameStore 新增 `_applyPhase / _applyEvents / _applyMapDiff / _applyStatsDiff` 等内部 action。
- CommandTerminal、aiResponder、gameLoop 统一通过 protocol 协议传输。

### 验收标准

1. 完整 protocol 类型。
2. MockTransport 工作正常。
3. adapter 路由正确。
4. ActionDispatcher 接管 submitSpeech。
5. mock 全部走协议而非直接写 store。
6. UI 不直接写主 store。
7. WebSocketTransport 占位 + TODO。
8. tsc strict 通过。
9. 游戏体验不退化。
10. 未来替换 ws 不动 UI。

### 禁止事项

- 禁止连接真实 WebSocket。
- 禁止协议与 UI 耦合。
- 禁止 UI 调用 _applyXxx。
- 禁止破坏 mock 节奏。
- 禁止删除 mock。
- 禁止 Envelope 非 JSON 兼容。
- 禁止省略 WebSocketTransport 占位。
- 禁止省略 action.rejected。

---

## 任务 18：全局交互与视觉打磨

### 使用场景

所有功能模块已完成。最后一轮统一打磨：hover / active / focus 状态、键盘快捷键、过渡一致性、粒子密度控制、响应式、性能优化、空状态、错误状态、加载状态、视觉一致性检查。

### 可直接复制给 AI 编程工具的完整提示词

```
你是一名前端体验打磨工程师。请为《外交风云》— 人机混战 AI Diplomacy 项目执行一次全局交互与视觉的统一打磨。

【项目背景】
《外交风云》前端涵盖：Landing、势力选择、HUD（顶/左/中/右/底）、CommandTerminal、AI 发言系统、事件流、势力关系面板、像素粒子地图、外交粒子效果、战争动画、阶段切换、纪元结算、赛后复盘、protocol 适配层。本任务不重构上述任何模块，只做"统一打磨"，让整体体验像一个完整产品而不是 18 个独立组件。

【技术栈】
React 19 + TypeScript + Tailwind + Framer Motion + Zustand。

【工程前提】
- 任务 1~17 全部完成。

【本任务允许做以下事情】

1. 交互状态统一：
   - 在视觉系统补全 hover / active / focus / disabled 四态。
   - 所有可点击元素 focus 时呈现 outline = 2px 势力 Glow 色（或全局 token Primary）。
   - 所有按钮 disabled 时 opacity 0.4、cursor not-allowed、不响应 hover 动画。
   - 所有 GlowPanel 在 focus 时 Glow 描边加亮 1.4x。

2. 键盘快捷键统一在 `src/hooks/useGlobalHotkeys.ts`：
   - `1~5` 切换 CommandTerminal 模式。
   - `Enter` 发送、`Shift+Enter` 换行。
   - `Tab` 切换面板焦点。
   - `E` 折叠 EventStream、`R` 折叠 RelationsPanel、`F` EventStream 全屏。
   - `M` 重置地图视角、滚轮缩放、右键平移。
   - `Esc` 关闭 modal / 抽屉 / 取消聚焦。
   - `Space` 暂停 / 继续（仅单人）。
   - `H` 显示 / 隐藏帮助层 `HotkeysHelp.tsx`。
   - 所有快捷键写入 HotkeysHelp，玩家随时按 H 查看。

3. 过渡动画一致性：
   - 全局默认 easing = `transitionTimingFunction.holo`。
   - 所有 panel 进入 0.3s、退出 0.25s。
   - 模态进入 0.4s、退出 0.3s。
   - 阶段切换全屏过渡 0.6s。

4. 粒子密度控制：
   - 在 uiStore 中新增 `globalParticleDensity: 'low'|'mid'|'high'|'ultra'`，默认 'mid'。
   - 所有粒子层（Landing 星空 / 地图能量 / 效果 / 战争前线）读取此值乘以本地基础密度。
   - 在设置面板 `SettingsPanel.tsx` 中提供切换 UI；切换后即时生效。

5. 响应式：
   - 1920 / 1440 / 1280 / 960 / 640 五个断点全验证。
   - <960 时左右面板自动收为 Drawer。
   - <640 时 CommandTerminal 改为底部全宽抽屉，模式 tab 横向滚动。
   - 所有 modal 在 <640 时全屏。

6. 性能优化：
   - 在 `src/utils/perfMonitor.ts` 实现 FPS 监控，<45 持续 3 帧则自动降级 `globalParticleDensity` 一级；<30 则关闭 EffectsLayer 部分内容（保留必要的 PrivateBeam / SpeechRipple）。
   - 在 dev 模式下右下角显示 FPS / 粒子数 / 当前 phase 调试条（可用 `D` 切换）。

7. 空 / 加载 / 错误状态：
   - `EmptyState.tsx`：通用空状态，扫描线 + 提示文本 + 可选 CTA。
   - `LoadingHologram.tsx`：通用加载态，旋转全息环 + 字符闪烁。
   - `ErrorPanel.tsx`：通用错误，红色描边 + 错误码 + 重试按钮。
   - 各位置接入：EventStream 在 events.length === 0 时显示 EmptyState；RelationsPanel 在 factions 未加载时显示 LoadingHologram；adapter 路由 action.rejected 时显示 ErrorPanel toast。

8. 视觉一致性检查：
   - 列出所有"非视觉系统"颜色与圆角，统一为 token / 0 圆角；
   - 检查所有 panel 是否使用 GlowPanel；
   - 检查所有按钮是否使用 PixelButton；
   - 检查所有数字是否使用 ScrollNumber；
   - 输出一份 `docs/VISUAL_CONSISTENCY_AUDIT.md`，列出修复点（仅列表，不要新增大段文字）。

9. 设置面板 `SettingsPanel.tsx`：
   - 粒子密度切换 / 阶段时长（仅本地 mock 调试）/ 显示 FPS / 重置游戏（重新 initGame）。
   - 入口：TopBar 右侧齿轮按钮 / 快捷键 `,`（逗号）。

【禁止做的事】
- 禁止做大规模重构（不要删 / 改任务 1~17 的组件实现，只能新增、补全细节、补 hooks）。
- 禁止改变核心设计语言（不要把直角改圆角、不要把深色改浅色、不要替换字体族）。
- 禁止删除已有功能。
- 禁止为追求"普通 UI 一致性"而牺牲游戏感（例如不要把全息按钮改成 Material Button）。
- 禁止接入真实后端 / 真实 LLM。
- 禁止破坏 protocol 边界（仍由 ActionDispatcher 发送 / adapter 接收）。
- 禁止破坏性能预算（任何一项打磨不得让整体 FPS 低于打磨前）。
- 禁止把 SettingsPanel 做成商业风格设置中心（必须保持全息 HUD 风格）。

【验收标准】
1. 所有可点击元素具备 hover / active / focus / disabled 一致样式。
2. 所有键盘快捷键就位，按 `H` 显示完整快捷键帮助。
3. 全局动画 easing / 时长一致。
4. 粒子密度可在 SettingsPanel 切换且即时生效。
5. 五断点响应式正确，<640 modal 全屏 / CommandTerminal 抽屉化。
6. FPS 监控生效：<45 自动降级；<30 关闭部分效果；`D` 可显示调试条。
7. EmptyState / LoadingHologram / ErrorPanel 均接入对应位置。
8. 视觉一致性审计文档完成且列出实际修复点。
9. SettingsPanel 可访问、风格统一。
10. 打磨后整体观感像一个完整 AAA 科幻战略游戏前端，而非组件拼贴。

请按以上规范完成本任务。完成后输出快捷键清单、性能策略、修复点摘要、视觉一致性结果。
```

### 预期产物

- `src/hooks/useGlobalHotkeys.ts`、`src/components/{HotkeysHelp,EmptyState,LoadingHologram,ErrorPanel,SettingsPanel}.tsx`。
- `src/utils/perfMonitor.ts`。
- 全局 hover/active/focus/disabled 视觉补全。
- `docs/VISUAL_CONSISTENCY_AUDIT.md`。
- uiStore 扩展 `globalParticleDensity`、`devOverlayOpen`。

### 验收标准

1. 四态样式统一。
2. 快捷键 + H 帮助。
3. 动画一致性。
4. 粒子密度即时切换。
5. 五断点响应式。
6. FPS 监控 + 调试条 + 自动降级。
7. Empty / Loading / Error 接入。
8. 视觉审计文档完成。
9. SettingsPanel 风格统一。
10. 整体如完整 AAA 科幻战略游戏前端。

### 禁止事项

- 禁止大规模重构。
- 禁止改变核心设计语言。
- 禁止删除已有功能。
- 禁止为通用一致性牺牲游戏感。
- 禁止接入真实后端 / LLM。
- 禁止破坏 protocol 边界。
- 禁止破坏性能预算。
- 禁止把 SettingsPanel 做成商业风格。

---

## 附录：18 条任务一览

| # | 任务 | 主要交付物 |
|---|------|----------|
| 1 | 初始化前端工程骨架 | Vite + React + TS + Tailwind + Zustand + 完整目录 |
| 2 | 像素粒子视觉设计系统 | token + Tailwind 扩展 + GlowPanel / PixelButton 等 |
| 3 | Landing / 启动画面 | 像素粒子星空 + 标题 + 进入按钮 |
| 4 | 势力选择界面 | 八张势力卡片 + 详情面板 + 确认条 |
| 5 | 主游戏 HUD 静态布局 | 顶/左/中/右/底五区 + 响应式 |
| 6 | mock game state & game loop | 类型 / 初始状态 / 阶段循环 / store 完整字段 |
| 7 | 自然语言指挥终端 | 五模式 + 语气检测 + 影响力 + 发送粒子化 |
| 8 | AI 发言与密谈系统 | 模板 + 公开发言 / 密谈 / reaction / 旁白 |
| 9 | 左侧事件流 | P0/P1/P2 + 筛选 + 滑入 + 聚焦 |
| 10 | 右侧势力关系面板 | 三 tab + hover 详情 + 关系变化动画 + 右键菜单 |
| 11 | 像素粒子战略地图 MVP | 圆形板块 + 边界 + 城市光点 + 贸易弧 + 密谈射线 |
| 12 | 演讲 / 密谈 / 贸易 / 结盟粒子效果 | 四类专属 VFX + useEffectsBus |
| 13 | 宣战与战争冲突动画 | 冲击波 + 屏幕震动 + 战斗结果卡 + 领土流入 |
| 14 | 回合阶段切换系统 | 五阶段 UI 差异 + AI 思考进度 + 结算逐条 |
| 15 | 纪元结算界面 | 棕褐滤镜 + 排名变化 + 关键战争 / 背叛 + AI 旁白 |
| 16 | 赛后复盘页面 | 时间轴 + 密谈 + 内心独白 + 兴衰曲线 + 关系网络 |
| 17 | 前后端协议适配层占位 | protocol/types/transport/adapter/dispatcher |
| 18 | 全局交互与视觉打磨 | 四态 + 快捷键 + 粒子密度 + FPS 监控 + Settings |

> 使用建议：按 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15 → 16 → 17 → 18 顺序提交任务给 AI 编程工具，单条复制即可。每条任务独立，不依赖上一阶段的对话上下文，可在不同 AI 工具间互换使用。
