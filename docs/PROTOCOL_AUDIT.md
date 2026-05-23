## 1. 信封字段对齐

| 字段名 | 前端类型 | 后端类型 | 是否一致 | 备注 |
| --- | --- | --- | --- | --- |
| v | `ProtocolVersion = 1` | `Literal[1] = 1` | 是 | 协议版本固定为 `1`。 |
| id | `string` | `str` | 是 | 消息 ID。 |
| t | `T extends string` | `str` | 是 | 具体消息类型由 payload / routing 表约束。 |
| ts | `number` | `int` | 是 | 毫秒时间戳。 |
| seq | `number` | `int` | 是 | 修复后后端信封层要求非空 `seq`。 |
| p | 泛型 payload | 泛型 `PayloadT` | 是 | 两端按消息类型约束载荷。 |

## 2. 入站消息类型对齐（C→S）

| 消息类型字符串 t | 前端 payload 接口 | 后端 payload model | 字段差异 | 是否一致 |
| --- | --- | --- | --- | --- |
| conn.auth | `ConnAuthMessage.p`: `token`, `client_version` | `ConnAuthPayload`: `token`, `client_version` | 无 | 是 |
| conn.ping | `ConnPingMessage.p`: `client_ts` | `ConnPingPayload`: `client_ts` | 无 | 是 |
| room.create | `RoomCreateMessage.p`: `mode`, `display_name`, `seed?` | `RoomCreatePayload`: `mode`, `display_name`, `seed=None` | 无 | 是 |
| room.join | `RoomJoinMessage.p`: `room_id`, `display_name` | `RoomJoinPayload`: `room_id`, `display_name` | 无 | 是 |
| room.leave | `RoomLeaveMessage.p`: `room_id` | `RoomLeavePayload`: `room_id` | 无 | 是 |
| room.select_faction | `RoomSelectFactionMessage.p`: `room_id`, `faction_id` | `RoomSelectFactionPayload`: `room_id`, `faction_id` | 无 | 是 |
| room.ready | `RoomReadyMessage.p`: `room_id`, `ready` | `RoomReadyPayload`: `room_id`, `ready` | 无 | 是 |
| action.speak | `ActionSpeakMessage.p`: `room_id`, `mode`, `content`, `targets`, `metadata?` | `ActionSpeakPayload`: `room_id`, `mode`, `content`, `targets`, `metadata=None` | 无 | 是 |
| action.private | `ActionPrivateSubmitMessage.p`: `room_id`, `target_faction`, `content`, `metadata?` | `ActionPrivatePayload`: `room_id`, `target_faction`, `content`, `metadata=None` | 无 | 是 |
| action.treaty | `ActionTreatyMessage.p`: `room_id`, `treaty_kind`, `target_factions`, `proposal_text`, `metadata?` | `ActionTreatyPayload`: `room_id`, `treaty_kind`, `target_factions`, `proposal_text`, `metadata=None` | 无 | 是 |
| action.military | `ActionMilitaryMessage.p`: `room_id`, `source_region`, `target_region`, `movement`, `orders_text`, `unit_id?`, `troops?`, `metadata?` | `ActionMilitaryPayload`: `room_id`, `source_region`, `target_region`, `movement`, `orders_text`, `unit_id=None`, `troops=None`, `metadata=None` | 无 | 是 |
| action.intel | `ActionIntelMessage.p`: `room_id`, `target_faction`, `intel_kind`, `brief`, `metadata?` | `ActionIntelPayload`: `room_id`, `target_faction`, `intel_kind`, `brief`, `metadata=None` | 无 | 是 |
| action.lock | `ActionLockMessage.p`: `room_id` | `ActionLockPayload`: `room_id` | 无 | 是 |
| reconnect.request | `ReconnectRequestMessage.p`: `room_id`, `player_id`, `last_seq`, `session_token` | `ReconnectRequestPayload`: `room_id`, `player_id`, `last_seq`, `session_token` | 无 | 是 |

## 3. 出站消息类型对齐（S→C）

| 消息类型字符串 t | 前端 payload 接口 | 后端 payload model | 字段差异 | 是否一致 |
| --- | --- | --- | --- | --- |
| conn.auth.ok | `ConnAuthOkMessage.p`: `player_id`, `display_name`, `server_time_ms` | `ConnAuthOkPayload`: `player_id`, `display_name`, `server_time_ms` | 无 | 是 |
| conn.auth.fail | `ConnAuthFailMessage.p`: `reason` | `ConnAuthFailPayload`: `reason` | 无 | 是 |
| conn.pong | `ConnPongMessage.p`: `server_time_ms`（兼容旧 `server_ts`） | `ConnPongPayload`: `server_time_ms` | 前端 tolerant 接收旧字段，后端统一发送 `server_time_ms` | 是 |
| conn.kick | `ConnKickMessage.p`: `reason` | `ConnKickPayload`: `reason` | 无 | 是 |
| room.created | `RoomCreatedMessage.p`: `room_id`, `mode` | `RoomCreatedPayload`: `room_id`, `mode` | 无 | 是 |
| room.joined | `RoomJoinedMessage.p`: `room_id`, `room_snapshot` | `RoomJoinedPayload`: `room_id`, `room_snapshot` | 无；后端以 `dict[str, Any]` 承载快照 | 是 |
| room.player_join | `RoomPlayerJoinMessage.p`: `room_id`, `player_id`, `display_name`, `faction_id?` | `RoomPlayerJoinPayload`: `room_id`, `player_id`, `display_name`, `faction_id=None` | 无 | 是 |
| room.player_leave | `RoomPlayerLeaveMessage.p`: `room_id`, `player_id` | `RoomPlayerLeavePayload`: `room_id`, `player_id` | 无 | 是 |
| room.snapshot | `RoomSnapshotMessage.p`: `room_id`, `mode`, `status`, `players[{player_id,display_name,faction_id,connected,ready,ai_takeover}]`, `ai_factions` | `RoomSnapshotPayload`: 同名字段；`players` 使用 `RoomPlayerSnapshot` | 无；不包含 token / session_id | 是 |
| room.player_takeover | `RoomPlayerTakeoverMessage.p`: `room_id`, `player_id`, `faction_id`, `reason` | `RoomPlayerTakeoverPayload`: 同名字段；`reason` 为 `disconnected_30s \| manual_leave` | 无 | 是 |
| room.player_resume | `RoomPlayerResumeMessage.p`: `room_id`, `player_id`, `faction_id` | `RoomPlayerResumePayload`: 同名字段 | 无 | 是 |
| room.start | `RoomStartMessage.p`: `room_id`, `initial_state` | `RoomStartPayload`: `room_id`, `initial_state` | 无；后端以 `dict[str, Any]` 承载世界状态 | 是 |
| room.finished | `RoomFinishedMessage.p`: `room_id`, `winner`, `final_narration`, `replay_available` | `RoomFinishedPayload`: `room_id`, `winner`, `final_narration`, `replay_available` | 无；完成后前端显示倒计时并跳转 `/replay?room=...` | 是 |
| phase.change | `PhaseChangeMessage.p`: `room_id`, `epoch`, `turn`, `phase`, `arbitrate_phase?`, `phase_started_at_ms`, `phase_duration_ms`, `server_time_ms`, `is_paused?` | `PhaseChangePayload`: 同名字段，`arbitrate_phase=None`, `is_paused=None` | 无；`server_time_ms` 用于前端校准本地时钟偏移 | 是 |
| turn.begin | `TurnBeginMessage.p`: `room_id`, `epoch`, `turn`, `phase`, `arbitrate_phase?`, `phase_started_at_ms`, `phase_duration_ms`, `server_time_ms`, `visible_snapshot` | `TurnBeginPayload`: 同名字段 | 无；后端以 `dict[str, Any]` 承载可见快照，regions 现包含 `neighbors` | 是 |
| action.broadcast | `ActionBroadcastMessage.p`: `room_id`, `event` | `ActionBroadcastPayload`: `room_id`, `event` | 无 | 是 |
| action.private | `ActionPrivateMessage.p`: `room_id`, `event`, `private_message?` | `ActionPrivateBroadcastPayload`: `room_id`, `event`, `private_message=None` | 无 | 是 |
| action.rejected | `ActionRejectedMessage.p`: `room_id`, `request_id`, `reason`, `error_code` | `ActionRejectedPayload`: `room_id`, `request_id`, `reason`, `error_code` | 无 | 是 |
| resolve.events | `ResolveEventsMessage.p`: `room_id`, `epoch`, `turn`, `events`, `private_messages?` | `ResolveEventsPayload`: `room_id`, `epoch`, `turn`, `events`, `private_messages=None` | 无；`kind="battle"` 的 `payload` 现在固定包含 `region_id / atk_loss / def_loss / territory_captured / morale_shift / narrative / attacker_remaining_troops / defender_remaining_troops` | 是 |
| resolve.map_diff | `ResolveMapDiffMessage.p`: `room_id`, `epoch`, `turn`, `changes`, `border_updates` | `ResolveMapDiffPayload`: `room_id`, `epoch`, `turn`, `changes`, `border_updates` | 无；后端 diff item 以 `dict[str, Any]` 承载，`changes` 现在固定包含 `region_id / prev_owner / new_owner / transition / animation_params`，`border_updates` 继续携带 `between/tension/visual_state` | 是 |
| resolve.stats_diff | `ResolveStatsDiffMessage.p`: `room_id`, `epoch`, `turn`, `faction_stats`, `relationship_changes` | `ResolveStatsDiffPayload`: `room_id`, `epoch`, `turn`, `faction_stats`, `relationship_changes` | 无；字段名已对齐为 delta 语义 | 是 |
| ai.thinking | `AIThinkingMessage.p`: `room_id`, `faction_id`, `progress` | `AIThinkingPayload`: `room_id`, `faction_id`, `progress` | 无 | 是 |
| ai.speak | `AISpeakMessage.p`: `room_id`, `event`, `private_message?` | `AISpeakPayload`: `room_id`, `event`, `private_message=None` | 无 | 是 |
| ai.reaction | `AIReactionMessage.p`: `room_id`, `event`, `private_message?`, `faction_id`, `reaction`, `target_faction?` | `AIReactionPayload`: `room_id`, `event`, `private_message=None`, `faction_id`, `reaction`, `target_faction=None` | 无 | 是 |
| replay.ai_diary_reveal | `ReplayAIDiaryRevealMessage.p`: `room_id`, `faction_id`, `entries[{faction_id,epoch,turn,internal_thought,emotion,triggers,created_at_ms}]` | `ReplayAIDiaryRevealPayload`: `room_id`, `faction_id`, `entries` | 无；游戏结束后一次性推送 AI diary | 是 |
| reconnect.catchup | `ReconnectCatchupMessage.p`: `room_id`, `from_seq`, `to_seq`, `server_time_ms`, `messages[envelope...]` | `ReconnectCatchupPayload`: `room_id`, `from_seq`, `to_seq`, `server_time_ms`, `messages` | 无；后端以 `list[dict[str, Any]]` 承载按 seq 排序的 envelope，前端校验 `from_seq..to_seq` 连续，缺口 fallback snapshot | 是 |
| reconnect.snapshot | `ReconnectSnapshotMessage.p`: `room_id`, `server_time_ms`, `full_state{room,current_turn,factions,regions(neighbors),relationships,treaties,recent_events,recent_messages,ai_thinking_state,border_tension,winner,final_narration}`, `seq` | `ReconnectSnapshotPayload`: `room_id`, `server_time_ms`, `full_state`, `seq` | 无；后端以 `dict[str, Any]` 承载完整状态，`recent_events` 近 100 条，`recent_messages` 近 50 条，snapshot 清洗 `internal_thought`，`border_tension.visual_state` 支持 `calm/watch/tense/critical` | 是 |
| error.message | `ErrorMessage.p`: `reason`, `error_code`, `request_id?` | `ErrorMessagePayload`: `reason`, `error_code`, `request_id=None` | 无 | 是 |

## 4. 枚举字面量对齐

| 枚举 | 前端字面量 | 后端字面量 | 是否一致 | 备注 |
| --- | --- | --- | --- | --- |
| FactionId | `ironCrown`, `starlight`, `emerald`, `ashen`, `voidChurch`, `aurora`, `magma`, `darkTide` | `ironCrown`, `starlight`, `emerald`, `ashen`, `voidChurch`, `aurora`, `magma`, `darkTide` | 是 | 八势力一致。 |
| GamePhase | `observe`, `action`, `resolve`, `arbitrate` | `observe`, `action`, `resolve`, `arbitrate` | 是 | 四阶段一致。 |
| ArbitratePhase | `battle`, `epic`, `summary` | `battle`, `epic`, `summary` | 是 | 三仲裁阶段一致。 |
| TreatyKind | `non_aggression`, `trade`, `alliance`, `ceasefire` | `non_aggression`, `trade`, `alliance`, `ceasefire` | 是 | 四条约类型一致。 |
| EventPriority | `P0`, `P1`, `P2` | `P0`, `P1`, `P2` | 是 | 三优先级一致。 |
| EventKind | `speech`, `private`, `declare_war`, `alliance`, `trade`, `non_aggression`, `ceasefire`, `betrayal`, `battle`, `economy`, `intel`, `phase_change`, `ai_thinking`, `ai_reaction`, `narration` | `speech`, `private`, `declare_war`, `alliance`, `trade`, `non_aggression`, `ceasefire`, `betrayal`, `battle`, `economy`, `intel`, `phase_change`, `ai_thinking`, `ai_reaction`, `narration` | 是 | 实际全集为 15 项，按后端 domain 枚举对齐。 |
| RelationshipStatus | `hostile`, `wary`, `neutral`, `friendly`, `allied` | `hostile`, `wary`, `neutral`, `friendly`, `allied` | 是 | 五关系状态一致。 |

## 5. 差异清单

| # | 文件名 + 行号 | 前端值 | 后端值 | 推荐修复方向 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 1 | `src/protocol/types.ts:227` / `app/protocol/outgoing.py:150` | `AIReactionMessage.p` 包含 `room_id`, `event`, `private_message?`, `faction_id`, `reaction`, `target_faction?` | `AIReactionPayload` 原先缺少 `event` 与 `private_message`，只有 `room_id`, `faction_id`, `reaction`, `target_faction?` | 后端跟前端；`ai.reaction` 应携带可进入事件流的 `event`，并允许通用事件载荷的可选 `private_message` | 已修复，后端新增 `event: dict[str, Any]`、`private_message: dict[str, Any] \| None` 并补协议测试 |

## 6. 修复 PR 摘要（待执行）

| 文件 | 修改内容 |
| --- | --- |
| `app/protocol/outgoing.py` | 为 `AIReactionPayload` 增加必填 `event` 与可选 `private_message` 字段，使 `ai.reaction` 出站 payload 与前端一致。 |
| `app/protocol/outgoing.py` | 新增 `ReplayAIDiaryRevealPayload`，对齐游戏结束后的 diary reveal 协议。 |
| `app/api/websocket/dispatcher.py` | 运行期剥离 `internal_thought`，并在 finished 时推送 `replay.ai_diary_reveal`。 |
| `app/tests/test_protocol.py` | 为 `AIReactionPayload.event` / `private_message` 增加协议测试覆盖。 |
| `docs/PROTOCOL_AUDIT.md` | 新增本审计报告，覆盖信封、14 个入站消息、24 个出站消息、7 组枚举和差异清单。 |

## 7. 球体地图扩展

| 字段 | 前端类型 | 后端类型 | 是否必填 | 引入版本 |
| --- | --- | --- | --- | --- |
| `region.lat` | `number \| null` | `float \| None` | 否 | `v1.0-globe` |
| `region.lng` | `number \| null` | `float \| None` | 否 | `v1.0-globe` |
| `region.hex_id` | `string \| null` | `str \| None` | 否 | `v1.0-globe` |

说明：后端 `MapRegion` 与 `resolve.map_diff` 内部 region payload 现已携带上述可选字段；当值为 `None` 时序列化会省略对应键，前端可继续回退到 `center_lat_lng`。
