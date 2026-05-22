export type RandomGenerator = () => number

export function mulberry32(seed: number): RandomGenerator {
  let state = seed >>> 0

  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

export function randomInt(rng: RandomGenerator, min: number, max: number) {
  return Math.floor(rng() * (max - min + 1)) + min
}

export function randomFloat(rng: RandomGenerator, min: number, max: number) {
  return rng() * (max - min) + min
}

export function pickOne<T>(rng: RandomGenerator, items: readonly T[]) {
  return items[Math.floor(rng() * items.length)]
}

export function shuffle<T>(rng: RandomGenerator, items: readonly T[]) {
  const copy = [...items]

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1))
    const current = copy[index]
    copy[index] = copy[swapIndex]
    copy[swapIndex] = current
  }

  return copy
}

export function weightedPick<T>(
  rng: RandomGenerator,
  entries: readonly { item: T; weight: number }[],
) {
  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0)
  let cursor = rng() * totalWeight

  for (const entry of entries) {
    cursor -= entry.weight
    if (cursor <= 0) {
      return entry.item
    }
  }

  return entries[entries.length - 1].item
}
