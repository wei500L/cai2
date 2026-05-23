import type { ReactNode } from 'react'
import { GlobeInstanceContext } from './useGlobeInstance'
import type { GlobeInstanceSnapshot } from './globeTypes'

export function GlobeInstanceProvider({
  value,
  children,
}: {
  value: GlobeInstanceSnapshot | null
  children: ReactNode
}) {
  return <GlobeInstanceContext.Provider value={value}>{children}</GlobeInstanceContext.Provider>
}

