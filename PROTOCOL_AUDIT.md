# Protocol Audit

## 球体地图扩展

- `RegionEntryOut` / `resolve.map_diff.previous` 中的 `lat`、`lng`、`hex_id` 已升级为 required。
- `RegionEntryOut` 新增 `terrain`、`elevation`、`neighbors`。
- `room.world_geometry.factions` 现包含 `capital_hex_id` / `capital_lat` / `capital_lng`。
- 新增 `resolve.diplomatic_arcs` 与 `resolve.ripple` 事件，用于 resolve 阶段外交飞线与涟漪。
- 新增 `resolve.world_lighting` 事件，用于回合结算阶段下发可选昼夜方向参考。
- `resolve.event.explosion` 现包含 `intensity` 与 `cinematic_hint`，并支持 `nuke` / `siege` / `uprising` 等 cinematic 分支。
- P0 演讲事件在 EventLog 中会补充 `cinematic_hint="speech"`，P1/P2 不受影响。
- `reconnect.snapshot` / `reconnect.catchup` 会携带 `world_geometry`，并在快照前单独下发对应事件。
- `room.start` 之后会立即广播 `room.world_geometry`。
