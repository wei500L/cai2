# 《外交风云》后端-前端最终接入说明

## 1.0 概述

本文说明《外交风云》AI Diplomacy 后端如何与前端最终接入。当前前端由 `MockTransport` 驱动完整体验，后端已实现协议、路由、行动记录、阶段推进和结算链路；最终联调目标是把前端 `MockTransport` 替换为 `WebSocketTransport`，URL 为 `ws://localhost:8000/ws`，不改 UI，不改 store。

后端总体架构：

```text
WebSocket /ws
  -> app.api.websocket.gateway
  -> InboundRouter
  -> RoomService / ActionService / PhaseService / SettlementService
  -> Repositories(memory, future db)
  -> OutboundDispatcher
  -> envelope { v, id, t, ts, seq, p }
```

前端总体架构：

```text
GamePage
  -> Transport(MockTransport | WebSocketTransport)
  -> ActionDispatcher sends OutgoingMessage
  -> adapter.dispatch IncomingMessage
  -> gameStore / uiStore
  -> UI render / effects / animations
```

联调边界只在协议层：前端 `ActionDispatcher` 继续发 `OutgoingMessage`，后端 `InboundRouter` 解析同一信封；后端 `OutboundDispatcher` 推送同一信封，前端 adapter 按 `IncomingMessage` 分发。行动期不调用 LLM，结算期才允许通过抽象 LLM client 调用模型。

## 2.0 协议对齐清单

### 2.1 信封

| 字段 | 前端 `Envelope` | 后端 `Envelope` | 对齐状态 | 说明 |
| --- | --- | --- | --- | --- |
| `v` | `ProtocolVersion = 1` | `int = 1` | 完全一致 | 当前固定为 1 |
| `id` | `string` | `str` | 完全一致 | 请求/消息唯一 ID |
| `t` | 字符串字面量 | `str` + payload discriminator | 完全一致 | 消息类型 |
| `ts` | `number` | `int` | 完全一致 | 毫秒时间戳 |
| `seq` | `number` | `int | None` | 基本一致 | 后端部分工具函数允许 `None`，正式 envelope 应补序号 |
| `p` | payload 对象 | Pydantic payload | 完全一致 | 业务负载 |

### 2.2 入站消息类型：前端 `OutgoingMessage` vs 后端 `InboundRouter`

| # | 前端发送 `t` | 后端 payload / 路由 | 状态 | 处理结果 |
| --- | --- | --- | --- | --- |
| 1 | `conn.auth` | `ConnAuthPayload` / `conn.auth` | 已接入 | 返回 `conn.auth.ok` |
| 2 | `conn.ping` | `ConnPingPayload` / `conn.ping` | 已接入 | 返回 `conn.pong` |
| 3 | `room.create` | `RoomCreatePayload` / `room.create` | 已接入 | 返回 `room.created` |
| 4 | `room.join` | `RoomJoinPayload` / `room.join` | 已接入 | 返回 `room.joined` |
| 5 | `room.leave` | `RoomLeavePayload` / `room.leave` | 已接入 | 返回 `room.player_leave` |
| 6 | `room.select_faction` | `RoomSelectFactionPayload` / `room.select_faction` | 已接入 | 返回 `room.joined` 快照 |
| 7 | `room.ready` | `RoomReadyPayload` / `room.ready` | 已接入 | 返回 `room.joined` 快照 |
| 8 | `action.speak` | `ActionSpeakPayload` / `action.speak` | 已接入 | 记录行动和消息，返回 `action.broadcast` ACK |
| 9 | `action.private` | `ActionPrivatePayload` / `action.private` | 已接入 | 记录密谈，返回 `action.private` ACK |
| 10 | `action.treaty` | `ActionTreatyPayload` / `action.treaty` | 部分差异 | 后端未接收 `metadata` |
| 11 | `action.military` | `ActionMilitaryPayload` / `action.military` | 部分差异 | 后端未接收 `unit_id` / `metadata` |
| 12 | `action.intel` | `ActionIntelPayload` / `action.intel` | 部分差异 | 后端未接收 `metadata` |
| 13 | `action.lock` | `ActionLockPayload` / `action.lock` | 已接入 | 可能返回 `phase.change` |
| 14 | `reconnect.request` | `ReconnectRequestPayload` / `reconnect.request` | 已接入 | 返回 `reconnect.catchup` 或 `reconnect.snapshot` |

### 2.3 出站消息类型：前端 `IncomingMessage` vs 后端 `OutboundDispatcher` / outgoing payload

| # | 前端接收 `t` | 后端包装类型 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | `conn.auth.ok` | `ConnAuthOkPayload` | 已定义 | 登录成功 |
| 2 | `conn.auth.fail` | `ConnAuthFailPayload` | 已定义 | 认证失败 |
| 3 | `conn.pong` | `ConnPongPayload` | 已定义 | 心跳响应 |
| 4 | `conn.kick` | `ConnKickPayload` | 已定义 | 踢出连接 |
| 5 | `room.created` | `RoomCreatedPayload` | 已定义 | 房间创建成功 |
| 6 | `room.joined` | `RoomJoinedPayload` | 已定义 | 房间快照 |
| 7 | `room.player_join` | `RoomPlayerJoinPayload` | 已定义 | 玩家加入广播 |
| 8 | `room.player_leave` | `RoomPlayerLeavePayload` | 已定义 | 玩家离开广播 |
| 9 | `room.start` | `RoomStartPayload` | 已定义 | 游戏开始初始状态 |
| 10 | `phase.change` | `PhaseChangePayload` / `dispatch_phase_change` | 已定义 | 阶段切换 |
| 11 | `turn.begin` | `TurnBeginPayload` | 已定义 | 新回合可见快照 |
| 12 | `action.broadcast` | `ActionBroadcastPayload` | 已定义 | 公开或轻量行动广播 |
| 13 | `action.private` | `ActionPrivateBroadcastPayload` | 已定义 | 仅相关方可见 |
| 14 | `action.rejected` | `ActionRejectedPayload` | 已定义 | 行动拒绝 |
| 15 | `resolve.events` | `ResolveEventsPayload` / `dispatch_resolve_bundle` | 已定义 | 结算事件批量推送 |
| 16 | `resolve.map_diff` | `ResolveMapDiffPayload` / `dispatch_resolve_bundle` | 已定义 | 地图变化 |
| 17 | `resolve.stats_diff` | `ResolveStatsDiffPayload` / `dispatch_resolve_bundle` | 已定义 | 势力和关系变化 |
| 18 | `ai.thinking` | `AIThinkingPayload` | 已定义 | AI 思考进度 |
| 19 | `ai.speak` | `AISpeakPayload` / `dispatch_resolve_bundle` | 已定义 | 结算阶段 AI 发言 |
| 20 | `ai.reaction` | `AIReactionPayload` | 字段差异 | 前端期望含 `event`；后端 payload 当前未含 `event` |
| 21 | `panorama.open` | 无 | TODO | 前端已定义，后端尚未定义 |
| 22 | `panorama.update` | 无 | TODO | 前端已定义，后端尚未定义 |
| 23 | `panorama.close` | 无 | TODO | 前端已定义，后端尚未定义 |
| 24 | `reconnect.catchup` | `ReconnectCatchupPayload` | 已定义 | 断线补消息 |
| 25 | `reconnect.snapshot` | `ReconnectSnapshotPayload` | 已定义 | 断线全量快照 |
| 26 | `error.message` | `ErrorMessagePayload` | 已定义 | 通用错误 |

### 2.4 FactionId 命名表

| # | FactionId | 中文名 | 前端来源 | 后端来源 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 1 | `ironCrown` | 铁冠帝国 | `factionIds` | `FactionId.ironCrown` | 一致 |
| 2 | `starlight` | 星辉联邦 | `factionIds` | `FactionId.starlight` | 一致 |
| 3 | `emerald` | 翡翠王庭 | `factionIds` | `FactionId.emerald` | 一致 |
| 4 | `ashen` | 灰烬部族 | `factionIds` | `FactionId.ashen` | 一致 |
| 5 | `voidChurch` | 虚空教廷 | `factionIds` | `FactionId.voidChurch` | 一致 |
| 6 | `aurora` | 极光共和 | `factionIds` | `FactionId.aurora` | 一致 |
| 7 | `magma` | 熔岩议会 | `factionIds` | `FactionId.magma` | 一致 |
| 8 | `darkTide` | 暗潮商会 | `factionIds` | `FactionId.darkTide` | 一致 |

### 2.5 枚举命名一致性

| 枚举 | 前端值 | 后端值 | 状态 |
| --- | --- | --- | --- |
| `GamePhase` | `observe`, `action`, `resolve`, `arbitrate` | `observe`, `action`, `resolve`, `arbitrate` | 一致 |
| `ArbitratePhase` | `battle`, `epic`, `summary` | `battle`, `epic`, `summary` | 一致 |
| `TreatyKind` | `non_aggression`, `trade`, `alliance`, `ceasefire` | `non_aggression`, `trade`, `alliance`, `ceasefire` | 一致 |
| `RelationshipStatus` | `hostile`, `wary`, `neutral`, `friendly`, `allied` | `hostile`, `wary`, `neutral`, `friendly`, `allied` | 一致 |
| `EventPriority` | `P0`, `P1`, `P2` | `P0`, `P1`, `P2` | 一致 |
| `EventKind` | `speech`, `private`, `reaction`, `narration`, `treaty`, `military`, `declare_war`, `alliance`, `trade`, `betrayal`, `battle`, `economy`, `intel`, `peace`, `phase_change` | `speech`, `private`, `declare_war`, `alliance`, `trade`, `non_aggression`, `ceasefire`, `betrayal`, `battle`, `economy`, `intel`, `phase_change`, `ai_thinking`, `ai_reaction`, `narration` | 有差异，见 8.0 |

### 2.6 字段映射差异

| 前端字段 | 后端字段 | 影响面 | 当前建议 |
| --- | --- | --- | --- |
| `GameEvent.createdAt` | `GameEvent.created_at_ms` | adapter / store 事件展示 | 出站前在后端 adapter 层转为前端形状，或前端 adapter 做兼容 |
| `GameEvent.actor` | `GameEvent.actor_faction` | 事件归属、特效 | 统一映射为 `actor` |
| `GameEvent.target` | `GameEvent.target_faction` | 目标势力展示 | 统一映射为 `target` |
| `FactionState.totalPower` | `FactionState.total_power` | 势力面板 | 统一映射为 `totalPower` |
| `Relationship.from` / `to` | `from_faction` / `to_faction` | 关系面板 | 统一映射为 `from` / `to` |
| `MapRegion.resourceValue` | `resource_value` | 地图资源 | 统一映射为 `resourceValue` |
| `MapRegion.developmentLevel` | `development_level` | 地图区块 | 统一映射为 `developmentLevel` |
| `MapRegion.centerLatLng` | `center_lat_lng` | 地图定位 | 统一映射为 `centerLatLng` |
| `PhasePayload.is_paused` | 后端 `PhaseChangePayload` 暂无 | 暂停/结束 UI | 后端补可选字段或前端保持可选兼容 |
| `ActionEventPayload.private_message` | 后端 `ActionPrivateBroadcastPayload` 暂只含 `event` | 密谈抽屉 | 需要决定是否补 `private_message` |

## 3.0 关键消息序列示意

以下 JSON 仅展示协议片段，`id` / `ts` / `seq` 可由双方各自生成。

### 3.1 `action.speak` -> `action.broadcast`

Inbound:

```json
{
  "v": 1,
  "id": "action.speak_1",
  "t": "action.speak",
  "ts": 1710000000000,
  "seq": 12,
  "p": {
    "room_id": "mock-room",
    "mode": "speech",
    "content": "星辉联邦愿意开放贸易谈判。",
    "targets": ["emerald"],
    "metadata": { "player_faction": "starlight", "mode": "speech" }
  }
}
```

Outbound:

```json
{
  "v": 1,
  "id": "msg_ack_speak",
  "t": "action.broadcast",
  "ts": 1710000000100,
  "seq": 33,
  "p": {
    "room_id": "mock-room",
    "event": {
      "request_id": "action.speak_1",
      "accepted": true,
      "action_id": "act_xxx",
      "reason": null,
      "server_ts": 1710000000100,
      "seq": 33
    }
  }
}
```

### 3.2 `action.private` -> `action.private` 仅相关方 + public meta event

Inbound:

```json
{
  "v": 1,
  "id": "action.private_1",
  "t": "action.private",
  "ts": 1710000000000,
  "seq": 13,
  "p": {
    "room_id": "mock-room",
    "target_faction": "emerald",
    "content": "我们可以私下承诺本回合不进攻。",
    "metadata": { "player_faction": "starlight", "mode": "private" }
  }
}
```

Outbound to pair:

```json
{
  "v": 1,
  "id": "msg_private_pair",
  "t": "action.private",
  "ts": 1710000000100,
  "seq": 34,
  "p": {
    "room_id": "mock-room",
    "event": {
      "request_id": "action.private_1",
      "accepted": true,
      "action_id": "act_private",
      "server_ts": 1710000000100,
      "seq": 34
    }
  }
}
```

Optional public meta event:

```json
{
  "v": 1,
  "id": "msg_private_meta",
  "t": "action.broadcast",
  "ts": 1710000000110,
  "seq": 35,
  "p": {
    "room_id": "mock-room",
    "event": {
      "kind": "private",
      "actor": "starlight",
      "payload": { "meta_only": true, "target_count": 1 },
      "narration": "星辉联邦发起了一次密谈。"
    }
  }
}
```

### 3.3 `action.treaty` -> `action.broadcast` meta + 结算后 `resolve.events`

Inbound:

```json
{
  "v": 1,
  "id": "action.treaty_1",
  "t": "action.treaty",
  "ts": 1710000000000,
  "seq": 14,
  "p": {
    "room_id": "mock-room",
    "treaty_kind": "trade",
    "target_factions": ["emerald"],
    "proposal_text": "建立三回合贸易协定。"
  }
}
```

Immediate outbound:

```json
{
  "v": 1,
  "id": "msg_treaty_ack",
  "t": "action.broadcast",
  "ts": 1710000000100,
  "seq": 36,
  "p": {
    "room_id": "mock-room",
    "event": {
      "request_id": "action.treaty_1",
      "accepted": true,
      "action_id": "act_treaty",
      "server_ts": 1710000000100,
      "seq": 36
    }
  }
}
```

Settlement outbound:

```json
{
  "v": 1,
  "id": "msg_resolve_events",
  "t": "resolve.events",
  "ts": 1710000010000,
  "seq": 80,
  "p": {
    "room_id": "mock-room",
    "epoch": 1,
    "turn": 1,
    "events": [
      {
        "kind": "trade",
        "actor": "starlight",
        "target": "emerald",
        "payload": { "treaty_kind": "trade", "accepted": true },
        "narration": "星辉联邦与翡翠王庭签署贸易协定。"
      }
    ]
  }
}
```

### 3.4 `action.military` -> `action.broadcast` 模糊版本给邻国

Inbound:

```json
{
  "v": 1,
  "id": "action.military_1",
  "t": "action.military",
  "ts": 1710000000000,
  "seq": 15,
  "p": {
    "room_id": "mock-room",
    "source_region": "north-1",
    "target_region": "border-2",
    "movement": "attack",
    "orders_text": "向边境集结并准备进攻。",
    "troops": 20
  }
}
```

Outbound fuzzy event:

```json
{
  "v": 1,
  "id": "msg_military_fuzzy",
  "t": "action.broadcast",
  "ts": 1710000000100,
  "seq": 37,
  "p": {
    "room_id": "mock-room",
    "event": {
      "kind": "military",
      "actor": "starlight",
      "payload": {
        "visibility": "neighbor_fuzzy",
        "source_region": "north-1",
        "target_region": "border-2",
        "movement": "attack",
        "detail_level": "fuzzy"
      },
      "narration": "星辉联邦在边境出现军事调动。"
    }
  }
}
```

### 3.5 `action.intel` -> 仅 self 可见

Inbound:

```json
{
  "v": 1,
  "id": "action.intel_1",
  "t": "action.intel",
  "ts": 1710000000000,
  "seq": 16,
  "p": {
    "room_id": "mock-room",
    "target_faction": "darkTide",
    "intel_kind": "spy",
    "brief": "确认暗潮商会本回合是否调兵。"
  }
}
```

Outbound self:

```json
{
  "v": 1,
  "id": "msg_intel_self",
  "t": "action.broadcast",
  "ts": 1710000000100,
  "seq": 38,
  "p": {
    "room_id": "mock-room",
    "event": {
      "kind": "intel",
      "actor": "starlight",
      "target": "darkTide",
      "payload": { "visibility": "self", "intel_kind": "spy" },
      "narration": "情报行动已记录，结果将在结算后返回。"
    }
  }
}
```

### 3.6 `action.lock` -> 可能触发 `phase.change`

Inbound:

```json
{
  "v": 1,
  "id": "action.lock_1",
  "t": "action.lock",
  "ts": 1710000000000,
  "seq": 17,
  "p": { "room_id": "mock-room" }
}
```

Outbound:

```json
{
  "v": 1,
  "id": "msg_phase_resolve",
  "t": "phase.change",
  "ts": 1710000000200,
  "seq": 39,
  "p": {
    "room_id": "mock-room",
    "epoch": 1,
    "turn": 1,
    "phase": "resolve",
    "arbitrate_phase": null,
    "phase_started_at_ms": 1710000000200,
    "phase_duration_ms": 8000
  }
}
```

### 3.7 `phase.change`: observe / action / resolve / arbitrate

```json
{
  "v": 1,
  "id": "msg_phase_arbitrate",
  "t": "phase.change",
  "ts": 1710000020000,
  "seq": 90,
  "p": {
    "room_id": "mock-room",
    "epoch": 1,
    "turn": 3,
    "phase": "arbitrate",
    "arbitrate_phase": "battle",
    "phase_started_at_ms": 1710000020000,
    "phase_duration_ms": 6000
  }
}
```

`phase` 可为 `observe` / `action` / `resolve` / `arbitrate`；当 `phase = arbitrate` 时，`arbitrate_phase` 可为 `battle` / `epic` / `summary`。

### 3.8 `turn.begin`：含 `visible_snapshot`

```json
{
  "v": 1,
  "id": "msg_turn_begin",
  "t": "turn.begin",
  "ts": 1710000030000,
  "seq": 100,
  "p": {
    "room_id": "mock-room",
    "epoch": 1,
    "turn": 2,
    "visible_snapshot": {
      "epoch": { "id": 1, "turn": 2, "phase": "observe" },
      "factions": [],
      "relationships": [],
      "regions": [],
      "events": [],
      "privateMessages": []
    }
  }
}
```

`visible_snapshot` 只包含当前玩家可见的世界状态：回合阶段、势力状态、关系、地图区域、公开事件、该玩家可见密谈。

### 3.9 `resolve.events` / `resolve.map_diff` / `resolve.stats_diff`

Settlement outbound events:

```json
{
  "v": 1,
  "id": "msg_resolve_events_1",
  "t": "resolve.events",
  "ts": 1710000040000,
  "seq": 120,
  "p": {
    "room_id": "mock-room",
    "epoch": 1,
    "turn": 1,
    "events": [
      {
        "kind": "battle",
        "actor": "ironCrown",
        "target": "starlight",
        "payload": { "regionId": "border-2", "winner": "ironCrown" },
        "narration": "铁冠帝国在边境取得优势。"
      }
    ]
  }
}
```

Settlement map diff:

```json
{
  "v": 1,
  "id": "msg_map_diff_1",
  "t": "resolve.map_diff",
  "ts": 1710000040100,
  "seq": 121,
  "p": {
    "room_id": "mock-room",
    "epoch": 1,
    "turn": 1,
    "changes": [{ "id": "border-2", "owner": "ironCrown" }],
    "border_updates": [{ "region_id": "border-2", "transition": "conquest" }]
  }
}
```

Settlement stats diff:

```json
{
  "v": 1,
  "id": "msg_stats_diff_1",
  "t": "resolve.stats_diff",
  "ts": 1710000040200,
  "seq": 122,
  "p": {
    "room_id": "mock-room",
    "epoch": 1,
    "turn": 1,
    "faction_stats": [{ "id": "ironCrown", "military": 88, "totalPower": 320 }],
    "relationship_changes": [{ "from": "ironCrown", "to": "starlight", "delta": -18, "status": "hostile" }]
  }
}
```

### 3.10 `ai.speak` / `ai.reaction`：结算阶段产出

AI speak:

```json
{
  "v": 1,
  "id": "msg_ai_speak_1",
  "t": "ai.speak",
  "ts": 1710000040300,
  "seq": 123,
  "p": {
    "room_id": "mock-room",
    "event": {
      "kind": "speech",
      "actor": "emerald",
      "payload": { "source": "model", "content": "贸易仍有余地。" },
      "narration": "贸易仍有余地。"
    }
  }
}
```

AI reaction:

```json
{
  "v": 1,
  "id": "msg_ai_reaction_1",
  "t": "ai.reaction",
  "ts": 1710000040400,
  "seq": 124,
  "p": {
    "room_id": "mock-room",
    "event": {
      "kind": "reaction",
      "actor": "darkTide",
      "target": "starlight",
      "payload": { "label": "怀疑" },
      "narration": "暗潮商会对星辉联邦保持怀疑。"
    },
    "faction_id": "darkTide",
    "reaction": "怀疑",
    "target_faction": "starlight"
  }
}
```

### 3.11 `reconnect.request` / `reconnect.catchup` / `reconnect.snapshot`

Inbound:

```json
{
  "v": 1,
  "id": "reconnect_1",
  "t": "reconnect.request",
  "ts": 1710000050000,
  "seq": 130,
  "p": {
    "room_id": "mock-room",
    "player_id": "player_1",
    "last_seq": 80,
    "session_token": "dev-token"
  }
}
```

Catchup:

```json
{
  "v": 1,
  "id": "msg_catchup",
  "t": "reconnect.catchup",
  "ts": 1710000050100,
  "seq": 131,
  "p": {
    "room_id": "mock-room",
    "from_seq": 81,
    "messages": []
  }
}
```

Snapshot:

```json
{
  "v": 1,
  "id": "msg_snapshot",
  "t": "reconnect.snapshot",
  "ts": 1710000050200,
  "seq": 132,
  "p": {
    "room_id": "mock-room",
    "full_state": { "epoch": {}, "factions": [], "relationships": [], "regions": [] },
    "seq": 132
  }
}
```

### 3.12 `action.rejected` / `error.message`

Action rejected:

```json
{
  "v": 1,
  "id": "msg_rejected",
  "t": "action.rejected",
  "ts": 1710000060000,
  "seq": 140,
  "p": {
    "room_id": "mock-room",
    "request_id": "action.speak_2",
    "reason": "content must not be empty",
    "error_code": "InvalidActionError"
  }
}
```

Generic error:

```json
{
  "v": 1,
  "id": "msg_error",
  "t": "error.message",
  "ts": 1710000060100,
  "seq": 141,
  "p": {
    "reason": "unknown message type",
    "error_code": "ProtocolError",
    "request_id": "bad_msg_1"
  }
}
```

## 4.0 结算阶段模型调用时机

必须明确：行动期不调用 LLM。行动期不调用 LLM。行动期不调用 LLM。

结算调用流程固定为 12 步：

1. 玩家在行动期提交公开发言、密谈、条约、军令、情报或锁定行动。
2. 后端只做基础校验：房间、玩家、阶段、势力、字段、长度、目标、频率限制。
3. 后端记录玩家消息和行动；游戏过程中只记录玩家消息和行动。
4. 后端立即返回 ACK，通常包装为 `action.broadcast`、`action.private` 或 `action.rejected`。
5. 后端根据 visibility 生成轻量广播事件，公开消息给全体，密谈仅给相关方，情报仅 self，军令可给邻国模糊版本。
6. 行动期结束，阶段进入 `resolve` 或对应结算流程。
7. `settlement aggregator` 汇总本回合行动、消息、密谈、条约、军令、情报、最近事件和当前状态。
8. `prompt builder` 基于汇总输入构造结算 prompt。
9. `LLM client` 只在结算阶段调用模型；开发和测试中使用抽象 client / mock client，不调用真实 LLM。
10. `parser` 校验模型 JSON 输出；字段缺失或非法时走 fallback，不让前端崩溃。
11. `rule resolver` 根据模型建议和后端规则生成最终权威结果，后端规则优先。
12. 后端生成 `resolve.events`、`resolve.map_diff`、`resolve.stats_diff` 和必要的 `ai.speak` / `ai.reaction`，前端收到后播放动画和更新 UI。

任何玩家行动提交、密谈发送、条约提案、军令提交、情报提交、锁定行动，都不得直接触发模型调用。只有结算阶段才允许通过抽象 LLM client 调用模型。

## 5.0 前端切换步骤

本节只描述最终接入步骤，不在本任务修改前端代码，不修改 UI，不修改 store。

1. 在 `src/protocol/transport.ts` 末尾的 `WebSocketTransport` 占位类完成实现。
2. `WebSocketTransport` 构造参数接收 `url` / `token` / `on_disconnect`。
3. 连接逻辑使用 `new WebSocket(url + "?token=" + token)`，目标 URL 为 `ws://localhost:8000/ws`。
4. 收到消息后执行 `JSON.parse`，得到 envelope，再交给 adapter 的 dispatch 流程。
5. 发送消息时执行 `ws.send(JSON.stringify(envelope))`，envelope 必须保持 `{ v, id, t, ts, seq, p }`。
6. 在 `GamePage` 挂载时替换 transport 创建逻辑：`const transport = USE_WS ? new WebSocketTransport(...) : new MockTransport()`。
7. 通过 env 或 query string 切换 `USE_WS`。
8. 前端 UI / store 不需要修改，协议 adapter 边界保持不变。

## 6.0 本地联调步骤（不启动服务器版本）

开发过程默认不启动服务器、不启动 Docker、不连接真实数据库、不调用真实 LLM。

后端静态联调：

1. 使用 `pytest -m integration` 跑端到端测试。
2. 确认 `SettlementOutboundBundle` 能正常产出。
3. 确认行动服务只记录消息和行动，结算服务才进入 aggregator / prompt builder / LLM client / parser / resolver。
4. 确认 WebSocket 入站 14 种消息都能被 `InboundRouter` 路由。
5. 确认出站 envelope 形状均为 `{ v, id, t, ts, seq, p }`。

前端静态联调：

1. 使用前端任务 17 的 `MockTransport` 跑通完整体验。
2. 确认 `ActionDispatcher` 只发送 `OutgoingMessage`。
3. 确认 adapter 只接收 `IncomingMessage` 并更新 store。
4. 确认 protocol 边界稳固后，再切换真实 WebSocket。

联调时机：

双方都通过静态测试后，再启动一次 `uvicorn` + `npm run dev` 做真实联调。该启动只允许发生在最终联调时，开发过程中不启动。

## 7.0 不启动服务器的静态检查方式

后端：

```bash
python -c "from app.main import app"
pytest -q
pytest -m integration -q
ruff check app
```

前端：

```bash
npm run build
tsc --noEmit
npm run lint
```

以上命令均不要求启动 uvicorn、Docker、npm dev 或真实数据库。若某些 integration 测试依赖外部服务，必须改用 mock / in-memory 配置。

## 8.0 协议差异对齐清单

### 8.1 字段命名差异列表（frontend -> backend）

| 前端字段 | 后端字段 | TODO |
| --- | --- | --- |
| `createdAt` | `created_at_ms` | 统一出站事件映射 |
| `actor` | `actor_faction` | 统一出站事件映射 |
| `target` | `target_faction` | 统一出站事件映射 |
| `totalPower` | `total_power` | 统一状态快照 / stats diff 映射 |
| `resourceValue` | `resource_value` | 统一地图快照 / map diff 映射 |
| `developmentLevel` | `development_level` | 统一地图快照 / map diff 映射 |
| `centerLatLng` | `center_lat_lng` | 统一地图快照映射 |
| `from` / `to` | `from_faction` / `to_faction` | 统一关系快照 / stats diff 映射 |
| `regionId` | `region_id` | 战斗 payload 需要统一 |
| `privateMessages` | 后端当前没有同名快照字段 | 需要确定快照输出形状 |

### 8.2 类型差异列表

| 类型 | 前端 | 后端 | TODO |
| --- | --- | --- | --- |
| `EventKind` | 含 `reaction`, `treaty`, `military`, `peace` | 含 `non_aggression`, `ceasefire`, `ai_thinking`, `ai_reaction` | 统一事件种类或在 adapter 映射 |
| `ai.reaction` payload | 期望含 `event`、`faction_id`、`reaction`、`target_faction` | `AIReactionPayload` 当前无 `event` | 后端补 `event` 或前端兼容 |
| `resolve.stats_diff.faction_stats` | `id` + 前端 camel 字段 | 后端 settlement 输出倾向 `faction_id` + delta/result 字段 | 后端出站前转成前端 patch |
| `resolve.stats_diff.relationship_changes` | `from` / `to` / `delta` / `status` | 后端 settlement 输出 `from_faction` / `to_faction` / `delta` / `reason` | 后端出站前转成前端 patch |
| `action.private` outbound | 前端 payload 可含 `private_message` | 后端当前只定义 `event` | 若要密谈抽屉即时显示，补 `private_message` |

### 8.3 待补字段列表

| 位置 | 待补字段 | 原因 |
| --- | --- | --- |
| 后端 `ActionTreatyPayload` | `metadata?: dict` | 前端 `ActionDispatcher` 会发送 metadata，后端 strict forbid 会拒绝 |
| 后端 `ActionMilitaryPayload` | `unit_id?: str`, `metadata?: dict` | 前端军令会发送 `unit_id` 和 metadata |
| 后端 `ActionIntelPayload` | `metadata?: dict` | 前端情报会发送 metadata |
| 后端 `PhaseChangePayload` | `is_paused?: bool` | 前端 `PhasePayload` 已定义可选暂停状态 |
| 后端 `AIReactionPayload` | `event: dict` | 前端 adapter 对 `ai.reaction` 使用 `message.p.event` |
| 后端 `ResolveEventsPayload` | `private_messages?: list` | 前端 `EventBundlePayload` 支持该字段 |

### 8.4 待补消息类型列表

| 消息类型 | 前端状态 | 后端状态 | MVP 处理 |
| --- | --- | --- | --- |
| `panorama.open` | 已定义 | 未定义 | 可延后；前端 adapter 当前默认忽略未处理分支 |
| `panorama.update` | 已定义 | 未定义 | 可延后 |
| `panorama.close` | 已定义 | 未定义 | 可延后 |

## 9.0 风险与对策

| 风险 | 对策 |
| --- | --- |
| 模型超时 | 结算阶段使用 retry + fallback；前端不阻塞行动期，结算结果可降级为空事件或规则结果 |
| WebSocket 断线 | `reconnect.request` 根据 `last_seq` 补回放；阈值 50，超过返回 `reconnect.snapshot` |
| JSON 字段缺失 | parser fallback；后端返回 `action.rejected` 或 `error.message`，前端展示友好提示，不崩溃 |
| 高频玩家发送 | 后端 rate limit + `action.rejected`；前端保留本地频率限制和友好提示 |
| 前后端字段命名不一致 | 在协议 adapter 或出站 DTO 层做集中映射，不把转换散落在业务服务 |
| 结算结果与模型建议冲突 | `rule resolver` 生成最终权威结果，模型只提供建议 |

## 10.0 安全说明（MVP 范围）

MVP 阶段不要重点实现 prompt injection 防护。当前只做基础字段校验、长度限制、空内容拒绝、目标合法性校验、频率限制和日志记录。

玩家输入只在行动期记录，行动期不调用 LLM。结算阶段由 `settlement aggregator` 汇总后进入 `prompt builder`，未来可在 `prompt_builder` 内扩展输入清洗、token 白名单、关键词过滤和更完整的模型输出审计。

不要在 WebSocket handler 或 API 路由里写业务逻辑；校验、记录、结算、可见性和出站映射都应保持为可测试模块，mock / in-memory 实现必须可以未来替换为真实数据库或外部服务。
