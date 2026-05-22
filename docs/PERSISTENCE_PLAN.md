# Persistence Plan

本计划文档不要求 MVP 实施，仅供未来对齐。《外交风云》AI Diplomacy 后端在 MVP 阶段继续使用 in-memory repository，不连接真实 PostgreSQL、Redis 或 Docker。

## 4.1 表结构草案

### rooms

- `room_id` PK
- `mode`
- `status`
- `mode_config` jsonb
- `created_at`
- `finished_at`
- `seed`

### players

- `player_id` PK
- `room_id` FK
- `display_name`
- `kind`
- `faction_id`
- `connected`
- `joined_at`
- `ready`

### factions_state

- `room_id`
- `faction_id`
- `snapshot` jsonb
- `updated_at`
- PRIMARY KEY (`room_id`, `faction_id`)

### regions

- `room_id`
- `region_id`
- `snapshot` jsonb
- PRIMARY KEY (`room_id`, `region_id`)

### relationships

- `room_id`
- `from_faction`
- `to_faction`
- `snapshot` jsonb
- PRIMARY KEY (`room_id`, `from_faction`, `to_faction`)

### actions_log

- `action_id` PK
- `room_id`
- `epoch`
- `turn`
- `phase`
- `actor_player_id`
- `actor_faction`
- `mode`
- `payload` jsonb
- `created_at`

### messages_log

- `message_id` PK
- `room_id`
- `epoch`
- `turn`
- `from_faction`
- `to_factions` jsonb
- `visibility`
- `content`
- `created_at`

### events_log

- `event_id` PK
- `room_id`
- `epoch`
- `turn`
- `phase`
- `priority`
- `kind`
- `actor_faction`
- `target_faction`
- `payload` jsonb
- `narration`
- `visibility` jsonb
- `created_at`
- `seq` bigint

### settlement_results

- `room_id`
- `epoch`
- `turn`
- `payload` jsonb
- `created_at`
- PRIMARY KEY (`room_id`, `epoch`, `turn`)

### replays

- `room_id` PK
- `payload` jsonb
- `created_at`

### turns

- `room_id` PK
- `epoch`
- `turn`
- `phase`
- `arbitrate_phase`
- `phase_started_at`
- `phase_duration_ms`

## 4.2 索引

- `events_log(room_id, seq)`
- `actions_log(room_id, epoch, turn, actor_player_id)`
- `messages_log(room_id, epoch, turn)`

## 4.3 Redis pub/sub channel 命名

- `room:{room_id}:outbound`
- `room:{room_id}:phase`

## 4.4 迁移策略

从 in-memory 切换 PostgreSQL 时，service 层不修改；只切换 `make_repositories` 的 factory 选项。API 路由和 WebSocket handler 继续只依赖 service 层，业务逻辑不下沉到传输层。

Repository Protocol 是替换边界。MVP 使用 `Memory*Repository`，未来补齐 `Postgres*Repository` 后由 factory 返回同一个 `Repositories` 容器。Redis pub/sub 和 cache 也保持在 adapter 层，避免 service 直接绑定运行时依赖。

游戏过程中只记录玩家消息和行动；结算阶段才允许通过抽象 LLM client 调用模型并写入结算、事件与回放相关数据。

## 4.5 数据迁移工具

暂未实现。建议未来用 alembic + asyncpg 管理 schema 迁移与数据修复脚本。MVP 不要求实施真实迁移工具，也不要求安装 PostgreSQL、Redis、asyncpg 或 SQLAlchemy。

## 4.6 性能预算

- `events_log` 单房间 <= 5000 行
- `settlement_results` 单房间 <= 64 行（8 epoch * 8 turn）
