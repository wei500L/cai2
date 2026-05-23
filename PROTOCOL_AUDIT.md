# Protocol Audit

## 球体地图扩展

- `RegionEntryOut` / `resolve.map_diff.previous` 中的 `lat`、`lng`、`hex_id` 已升级为 required。
- `RegionEntryOut` 新增 `terrain`、`elevation`、`neighbors`。
- 新增 `room.world_geometry` 事件，用于房间开始后下发球面几何。
- `reconnect.snapshot` / `reconnect.catchup` 会携带 `world_geometry`，并在快照前单独下发对应事件。
- `room.start` 之后会立即广播 `room.world_geometry`。

