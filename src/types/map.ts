import type { FactionId } from '@/types/faction'

export type RegionTerrain = 'mountain' | 'plains' | 'river' | 'fortress' | 'desert'

export type RegionEntry = {
  id: string
  owner: FactionId | null
  resourceValue: number
  developmentLevel: number
  elevation: number
  resistance: number
  capturedAtTurn: number | null
  centerLatLng: [number, number]
  lat: number
  lng: number
  hex_id: string
  terrain: RegionTerrain
  minGarrison: number
  supplyLines: number
  neighbors: string[]
}

export type MapRegion = Omit<RegionEntry, 'elevation' | 'lat' | 'lng' | 'hex_id'> & {
  elevation?: number | null
  lat?: number | null
  lng?: number | null
  hex_id?: string | null
}
