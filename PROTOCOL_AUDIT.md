# Protocol Audit

## 球体地图扩展

- `RegionEntryOut` / `resolve.map_diff.previous` 中的 `lat`、`lng`、`hex_id` 已升级为 required。
- `RegionEntryOut` 新增 `terrain`、`elevation`、`neighbors`。
- `room.world_geometry.factions` 现包含 `capital_hex_id` / `capital_lat` / `capital_lng`。
- 新增 `resolve.diplomatic_arcs` 与 `resolve.ripple` 事件，用于 resolve 阶段外交飞线与涟漪。
- 新增 `resolve.world_lighting` 事件，用于回合结算阶段下发可选昼夜方向参考。
- `reconnect.snapshot` / `reconnect.catchup` 会携带 `world_geometry`，并在快照前单独下发对应事件。
- `room.start` 之后会立即广播 `room.world_geometry`。
