import { useEffect } from 'react'
import clsx from 'clsx'
import { motion } from 'framer-motion'
import { factionById, type FactionId } from '@/mock/factions'
import type { RegionAnimationParams } from '@/protocol/types'

export type RegionInflowAnimationProps = {
  region_id: string
  new_owner: FactionId | null
  animation_params: RegionAnimationParams
  onDone?: (regionId: string) => void
}

function directionGradient(direction: RegionAnimationParams['direction']) {
  if (direction === 'south_to_north') {
    return 'linear-gradient(0deg, rgba(0,0,0,0) 0%, currentColor 100%)'
  }
  if (direction === 'north_to_south') {
    return 'linear-gradient(180deg, rgba(0,0,0,0) 0%, currentColor 100%)'
  }
  if (direction === 'east_to_west') {
    return 'linear-gradient(270deg, rgba(0,0,0,0) 0%, currentColor 100%)'
  }
  return 'linear-gradient(90deg, rgba(0,0,0,0) 0%, currentColor 100%)'
}

export function RegionInflowAnimation({
  region_id,
  new_owner,
  animation_params,
  onDone,
}: RegionInflowAnimationProps) {
  useEffect(() => {
    const timer = window.setTimeout(() => onDone?.(region_id), 1200)
    return () => window.clearTimeout(timer)
  }, [onDone, region_id])

  const ownerGlow = new_owner ? factionById[new_owner].glow : '#8fcaff'

  return (
    <motion.div
      aria-hidden
      className={clsx(
        'pointer-events-none absolute inset-0 mix-blend-screen',
        animation_params.particles === 'aggressive' ? 'opacity-90' : 'opacity-72',
      )}
      style={{
        color: ownerGlow,
        background: directionGradient(animation_params.direction),
        filter: 'blur(2px)',
      }}
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: [0, 0.92, 0], scale: [0.98, 1, 1.02] }}
      transition={{ duration: 1.2, ease: 'easeOut' }}
    />
  )
}
