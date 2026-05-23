import { createContext, useContext, type ReactNode } from 'react'
import type { GlobeInstanceSnapshot } from './globeTypes'

const GlobeInstanceContext = createContext<GlobeInstanceSnapshot | null>(null)

export function GlobeInstanceProvider({
  value,
  children,
}: {
  value: GlobeInstanceSnapshot | null
  children: ReactNode
}) {
  return <GlobeInstanceContext.Provider value={value}>{children}</GlobeInstanceContext.Provider>
}

export function useGlobeInstance() {
  return useContext(GlobeInstanceContext)
}

