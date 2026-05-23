import type { FactionId } from '@/types/faction'
import type { GameEvent } from '@/types/event'

export type BattleEvent = GameEvent & {
  kind: 'battle'
  actor: FactionId
  target: FactionId
  payload: {
    region_id: string
    attacker: FactionId
    defender: FactionId
    atk_loss: number
    def_loss: number
    territory_captured: boolean
    morale_shift: number
    narrative: string
    attacker_remaining_troops: number
    defender_remaining_troops: number
  }
}

export type BattleOutcome = {
  attacker: FactionId
  defender: FactionId
  atkLoss?: number
  defLoss?: number
  moraleShift?: number | { attacker?: number; defender?: number }
}
