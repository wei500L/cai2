import { ENV } from '@/app/env'
import type { FactionMeta } from '@/types/faction'
import type { FactionMetaPayload } from '@/protocol/types'

function parseFactionsMetaPayload(value: unknown): FactionMeta[] {
  if (Array.isArray(value)) {
    return value as FactionMeta[]
  }

  if (typeof value === 'object' && value !== null) {
    const payload = value as Partial<FactionMetaPayload>
    if (Array.isArray(payload.factions_meta)) {
      return payload.factions_meta as FactionMeta[]
    }
    if (Array.isArray(payload.factions)) {
      return payload.factions as FactionMeta[]
    }
  }

  throw new Error('Invalid factions_meta response')
}

export async function fetchFactionsMeta(roomId: string, signal?: AbortSignal): Promise<FactionMeta[]> {
  const response = await fetch(
    `${ENV.backendRestBase}/rooms/${encodeURIComponent(roomId)}/factions_meta`,
    { signal },
  )

  if (!response.ok) {
    throw new Error(`Failed to fetch factions_meta: ${response.status}`)
  }

  return parseFactionsMetaPayload(await response.json())
}
