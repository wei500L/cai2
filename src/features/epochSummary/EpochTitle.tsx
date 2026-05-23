import { motion } from 'framer-motion'
import { useGameStore } from '@/store/gameStore'

const romanNumerals = [
  '',
  'I',
  'II',
  'III',
  'IV',
  'V',
  'VI',
  'VII',
  'VIII',
  'IX',
  'X',
]

function toRoman(value: number) {
  return romanNumerals[value] ?? String(value)
}

const titleParticles = Array.from({ length: 34 }, (_, index) => {
  const angle = (index / 34) * Math.PI * 2
  const radius = 80 + (index % 7) * 18
  return {
    id: index,
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * (radius * 0.42),
    delay: (index % 9) * 0.035,
  }
})

export function EpochTitle() {
  const epochId = useGameStore((state) => state.epoch.id)
  const eventCount = useGameStore(
    (state) =>
      state.events.filter(
        (event) => event.epoch === state.epoch.id && (event.priority === 'P0' || event.priority === 'P1'),
      ).length,
  )
  const subtitle = eventCount >= 5 ? '终章' : '史册'

  return (
    <div className="pointer-events-none relative mx-auto w-[min(44rem,calc(100vw-2rem))] pt-7 text-center sm:pt-9">
      <div aria-hidden className="absolute left-1/2 top-16 h-0 w-0">
        {titleParticles.map((particle) => (
          <motion.span
            key={particle.id}
            className="absolute h-1 w-1 bg-[color:rgba(255,222,158,0.92)] shadow-[0_0_16px_rgba(255,204,102,0.9)]"
            initial={{
              x: particle.x,
              y: particle.y,
              opacity: 0,
              scale: 0.35,
            }}
            animate={{
              x: 0,
              y: 0,
              opacity: [0, 1, 0.35, 0],
              scale: [0.35, 1.35, 0.8, 0.2],
            }}
            transition={{ duration: 1, delay: particle.delay, ease: [0.22, 1, 0.36, 1] }}
          />
        ))}
      </div>
      <motion.div
        initial={{ opacity: 0, y: 18, filter: 'blur(10px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.58, delay: 0.62, ease: [0.22, 1, 0.36, 1] }}
        className="relative"
      >
        <div className="font-hud text-[0.56rem] uppercase tracking-[0.34em] text-[color:rgba(255,231,184,0.52)]">
          EPOCH ARCHIVE
        </div>
        <h1
          className="mt-2 font-hud text-3xl leading-none tracking-[0.16em] text-[color:rgba(255,239,204,0.98)] sm:text-5xl"
          style={{
            textShadow:
              '0 0 2px rgba(43,20,8,1), 0 0 18px rgba(255,204,102,0.55), 0 0 44px rgba(151,106,55,0.38)',
            WebkitTextStroke: '1px rgba(80, 42, 16, 0.72)',
          }}
        >
          纪元 {toRoman(epochId)} · {subtitle}
        </h1>
      </motion.div>
    </div>
  )
}
