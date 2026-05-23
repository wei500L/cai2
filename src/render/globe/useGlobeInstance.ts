import { createContext, useContext } from 'react'
import type { GlobeInstanceSnapshot } from './globeTypes'

export const GlobeInstanceContext = createContext<GlobeInstanceSnapshot | null>(null)

export function useGlobeInstance() {
  return useContext(GlobeInstanceContext)
}

