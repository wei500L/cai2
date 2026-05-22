import type { ComponentType } from 'react'
import LandingPage from '@/pages/LandingPage'
import FactionSelectPage from '@/pages/FactionSelectPage'
import GamePage from '@/pages/GamePage'
import EpochSummaryPage from '@/pages/EpochSummaryPage'
import ReplayPage from '@/pages/ReplayPage'

export type AppRoute = {
  path: string
  element: ComponentType
}

export const appRoutes: AppRoute[] = [
  { path: '/', element: LandingPage },
  { path: '/design-system', element: LandingPage },
  { path: '/factions', element: FactionSelectPage },
  { path: '/game', element: GamePage },
  { path: '/epoch-summary', element: EpochSummaryPage },
  { path: '/replay', element: ReplayPage },
]
