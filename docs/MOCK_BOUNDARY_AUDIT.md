# Mock Boundary Audit

## 1. Boundary Definition

Allowed consumers of `src/mock/**` are limited to `src/protocol/transport.ts` for `MockTransport`, mock-internal files under `src/mock/**`, and fixture/test code under `src/**/__tests__/**`, `tests/**`, or `playwright/**`. Business/runtime code under `src/features/**`, `src/pages/**`, `src/store/**`, `src/render/**`, `src/effects/**`, `src/api/**`, `src/components/**`, plus `src/protocol/adapter.ts`, `src/protocol/dispatcher.ts`, and `src/protocol/types.ts`, must not import `@/mock/*` or `@/mock/**`. Shared runtime contracts belong in `src/types`; runtime faction metadata must come from `src/store/*MetaStore` or protocol payloads.

## 2. Current `src/mock/**` Inventory And Allowed Importers

- `src/mock/aiResponder.ts`: imported by `src/protocol/transport.ts:19`.
- `src/mock/aiTemplates.ts`: imported by `src/protocol/transport.ts:4`, `src/mock/gameLoop.ts:2`, `src/mock/aiResponder.ts:10`, and `src/mock/replay.ts:1`.
- `src/mock/diplomaticArcs.ts`: imported by `src/protocol/transport.ts:21`.
- `src/mock/events.ts`: no current importers.
- `src/mock/factions.ts`: imported by `src/protocol/transport.ts:3`, `src/mock/gameLoop.ts:3`, `src/mock/aiResponder.ts:2`, `src/mock/diplomaticArcs.ts:1`, `src/mock/replay.ts:2`, `src/api/__tests__/factionsMetaApi.test.ts:2`, `src/store/__tests__/factionMetaStore.test.ts:2`, and `src/features/relationsPanel/__tests__/FactionRowDetail.diary.test.tsx:3`.
- `src/mock/gameLoop.ts`: imported dynamically by `src/protocol/transport.ts:1331`.
- `src/mock/gameState.ts`: imported by `src/mock/gameLoop.ts:5` and `src/mock/replay.ts:4`.
- `src/mock/index.ts`: no current importers; banner-only boundary marker.
- `src/mock/initialState.ts`: imported by `src/mock/replayFixtures.ts:3` and `src/render/__tests__/buildNeighbors.test.ts:2`.
- `src/mock/relationships.ts`: no current importers.
- `src/mock/replay.ts`: imported by `src/mock/replayFixtures.ts:1`.
- `src/mock/replayFixtures.ts`: no current importers.
- `src/mock/types.ts`: no current importers.
- `src/mock/worldGeometry.ts`: imported by `src/protocol/transport.ts:20`.
- `src/mock/__tests__/MockTransport.aiResponse.test.ts`: test file; not imported by runtime code.
- `src/mock/__tests__/worldGeometry.test.ts`: test file; not imported by runtime code.

## 3. ESLint Rule

Enabled file globs:

```js
['src/features/**', 'src/pages/**', 'src/store/**', 'src/render/**', 'src/effects/**', 'src/api/**', 'src/components/**']
['src/protocol/adapter.ts', 'src/protocol/dispatcher.ts', 'src/protocol/types.ts']
```

Rule body:

```js
{
  files: ['src/features/**', 'src/pages/**', 'src/store/**', 'src/render/**', 'src/effects/**', 'src/api/**', 'src/components/**'],
  ignores: ['**/__tests__/**'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        { group: ['@/mock/*', '@/mock/**'], message: 'Business code must not import from src/mock. Use src/types or src/store/*MetaStore. MockTransport is the only allowed consumer.' },
      ],
    }],
  },
}
```

The protocol adapter, dispatcher, and types files use the same `no-restricted-imports` rule. `src/protocol/transport.ts` is intentionally not in the restricted file globs because it owns `MockTransport`.

## 4. CI Enforcement

CI must run `npm run lint:strict`. The script expands to `eslint . --max-warnings 0`, so any mock-boundary violation, ESLint error, or warning fails the lint job and blocks merge. If a workflow exists, its lint job should call `npm run lint:strict`; this repository currently has no `.github/workflows/*.yml` files to update.

## 5. Adding Future Mock Files

New mock files require a boundary review before implementation. Discuss the need first, confirm whether the consumer is `MockTransport` or a test fixture, implement inside `src/mock/**`, update this audit inventory and exception list, then run `npm run lint:strict`. Business code must not add temporary inline disables; fix the ownership boundary instead.

## 6. Exception List

- `src/protocol/transport.ts:3` imports `@/mock/factions` to seed MockTransport faction metadata and mock room/player payloads; this is compliant because MockTransport is the allowed runtime mock owner.
- `src/protocol/transport.ts:4` imports `@/mock/aiTemplates` to generate local mock narration; this is compliant because the generated messages are emitted only through MockTransport.
- `src/protocol/transport.ts:19` imports `@/mock/aiResponder` to schedule and clear mock AI responses; this is compliant because response timers are part of MockTransport behavior.
- `src/protocol/transport.ts:20` imports `@/mock/worldGeometry` to emit `room.world_geometry` in mock transport sessions; this is compliant because business stores consume only the protocol payload.
- `src/protocol/transport.ts:21` imports `@/mock/diplomaticArcs` to emit mock diplomatic visuals; this is compliant because visuals enter the app through protocol messages.
- `src/protocol/transport.ts:1331` dynamically imports `@/mock/gameLoop` only in development and only when MockTransport starts its mock loop; this is compliant because it is scoped to MockTransport and not business code.
