# Protocol Audit

## 房间快照设置

- `room.snapshot` 现在携带 `schema_version="1.0"` 与 `settings`。
- `settings` 字段包含 `phase_durations`、`turns_per_epoch`、`max_epochs`。
- `phase_durations` 默认值为 `observe=10000`、`action=60000`、`resolve=8000`、`arbitrate=12000`，单位毫秒。
- `turns_per_epoch` 默认值为 `20`，`max_epochs` 默认值为 `5`。
- `reconnect.snapshot.full_state.room` 同样携带 `settings`，重连不再依赖 mock 常量。
- 环境变量覆盖项：`ROOM_PHASE_DURATIONS`、`ROOM_TURNS_PER_EPOCH`、`ROOM_MAX_EPOCHS`。

## v1.0-mock-to-real

- 新增 `room.factions_meta` 事件，后端成为势力静态元数据 source of truth。
- 下发时机：`room.start` 后立即广播；`reconnect.snapshot` / `reconnect.catchup` 前会先单独复发。
- Payload 字段：`room_id`、`schema_version`、`factions`。
- `factions[]` 字段：`id`、`name`、`short_name`、`primary_color`、`glow_color`、`shadow_color`、`speech_style`、`speech_style_label`、`speech_style_description`、`civilization_traits`、`ai_archetype`、`capital_hex_id`。
- Debug REST 兜底：`GET /debug/v1/rooms/{room_id}/factions_meta` 返回当前房间 8 势力元数据列表。

## 球体地图扩展

- `RegionEntryOut` / `resolve.map_diff.previous` 中的 `lat`、`lng`、`hex_id` 已升级为 required。
- `RegionEntryOut` 新增 `terrain`、`elevation`、`neighbors`。
- `room.world_geometry.factions` 现包含 `capital_hex_id` / `capital_lat` / `capital_lng`。
- 新增 `resolve.diplomatic_arcs` 与 `resolve.ripple` 事件，用于 resolve 阶段外交飞线与涟漪。
- 新增 `resolve.world_lighting` 事件，用于回合结算阶段下发可选昼夜方向参考。
- `resolve.world_lighting` 在动态光照开启时必须位于 `resolve.scorched_diff` 之后、`ai.thinking` / `ai.speak` 之前。
- `resolve.event.explosion` 现包含 `intensity` 与 `cinematic_hint`，并支持 `nuke` / `siege` / `uprising` 等 cinematic 分支。
- 新增 dev-only `POST /debug/v1/seed/globe`，仅 `ENV=dev|development` 且 `LLM_PROVIDER=mock` 可用；流程只写入当前进程内存仓库。
- 新增 `turn.end` payload：`room_id`、`epoch`、`turn`、`next_epoch`、`next_turn`、`server_time_ms`。
- P0 演讲事件在 EventLog 中会补充 `cinematic_hint="speech"`，P1/P2 不受影响。
- `reconnect.snapshot` / `reconnect.catchup` 会携带 `world_geometry`，并在快照前单独下发对应事件。
- `room.start` 之后会立即广播 `room.world_geometry`。

## AI 事件场景完整性

- `ai.thinking` 由调度层在 resolve 前统一下发，作为所有 AI 结算输出的前置状态。
- `SettlementService` 现在会补全公开演讲、密谈、条约、宣战四类场景的 AI 输出，并交由 `AIOutputService` 转成正式事件。
- `ai.speak` 负载新增 `kind`，仅允许 `public` / `private` / `narration`。
- `ai.reaction` 负载新增 `target_event_id`，并继续携带 `event` / `faction_id` / `reaction` / `target_faction`。
- `OutboundDispatcher` 现在会把 `ai.speak` 与 `ai.reaction` 分开下发，避免把反应误发成普通发言。
- 回归目标：thinking -> speak -> reaction 的顺序在 resolve 阶段保持稳定，且 reaction 不再缺少目标事件锚点。

## Replay 复盘协议

- `GET /debug/v1/rooms/{room_id}/replay` 返回 `ReplayDTO`，路由仍只挂在 debug 前缀下，不对 prod 公开。
- `ReplayDTO` 包含 `room_id`、`generated_at_ms`、`mode`、`start_ts`、`end_ts`、`in_progress`、`total_epochs`、`total_turns`、`timeline`、`factions`、`public_events`、`private_messages`、`ai_internal_thoughts`、`ai_inner_thoughts`、`faction_curves`、`relationship_snapshots`、`key_moments`、`famous_quotes`、`betrayal_events`、`deception_stats`、`final_factions`、`winner`、`final_narration`。
- 房间不存在时返回 `404 { "error": "room_not_found" }`。
- 房间未结束时，`in_progress=true`，`timeline` 只暴露已发生部分，`ai_internal_thoughts` / `ai_inner_thoughts` 保持空数组。
- `factions` 取房间对应的静态势力元数据，`capital_hex_id` 会随房间 world geometry 兜底补齐。
