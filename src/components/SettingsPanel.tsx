import { AnimatePresence, motion } from 'framer-motion'
import { GlowPanel } from './GlowPanel'
import { PixelButton } from './PixelButton'
import { useGameStore } from '@/store/gameStore'
import { useUIStore, type GlobalParticleDensity } from '@/store/uiStore'

const densityOptions: Array<{ value: GlobalParticleDensity; label: string }> = [
  { value: 'low', label: 'LOW' },
  { value: 'mid', label: 'MID' },
  { value: 'high', label: 'HIGH' },
  { value: 'ultra', label: 'ULTRA' },
]

export function SettingsPanel() {
  const open = useUIStore((state) => state.settingsOpen)
  const density = useUIStore((state) => state.globalParticleDensity)
  const quality = useUIStore((state) => state.mapQuality)
  const devOverlayOpen = useUIStore((state) => state.devOverlayOpen)
  const phaseDurationScale = useUIStore((state) => state.phaseDurationScale)
  const setOpen = useUIStore((state) => state.setSettingsOpen)
  const setDensity = useUIStore((state) => state.setGlobalParticleDensity)
  const setQuality = useUIStore((state) => state.setMapQuality)
  const setDevOverlayOpen = useUIStore((state) => state.setDevOverlayOpen)
  const setPhaseDurationScale = useUIStore((state) => state.setPhaseDurationScale)
  const initGame = useGameStore((state) => state.initGame)

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[115] flex justify-end bg-black/58 p-4 max-sm:p-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          onClick={() => setOpen(false)}
        >
          <motion.aside
            className="h-full w-[min(92vw,25rem)] max-sm:w-screen"
            initial={{ opacity: 0, x: 32 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 28 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            onClick={(event) => event.stopPropagation()}
          >
            <GlowPanel className="h-full rounded-none">
              <div className="flex h-full flex-col p-5 font-hud">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-[0.56rem] uppercase tracking-[0.26em] text-[color:var(--text-muted)]">
                      SETTINGS
                    </div>
                    <div className="mt-1 text-lg uppercase tracking-[0.2em]">系统调校</div>
                  </div>
                  <PixelButton tone="ghost" className="px-3 py-1 text-[0.54rem]" onClick={() => setOpen(false)}>
                    关闭
                  </PixelButton>
                </div>

                <div className="mt-6 grid gap-5">
                  <section>
                    <div className="mb-2 text-[0.58rem] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
                      粒子密度
                    </div>
                    <div className="grid grid-cols-4 gap-1">
                      {densityOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className="h-9 border font-hud text-[0.58rem] uppercase tracking-[0.14em] transition-holo"
                          style={{
                            borderColor: density === option.value ? 'var(--border-glow)' : 'rgba(255,255,255,0.14)',
                            background:
                              density === option.value ? 'rgba(51,170,255,0.14)' : 'rgba(255,255,255,0.025)',
                            color: density === option.value ? 'var(--text-primary)' : 'var(--text-muted)',
                          }}
                          onClick={() => setDensity(option.value)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </section>

                  <section>
                    <div className="mb-2 text-[0.58rem] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
                      地图质量
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      {(['low', 'mid', 'high'] as const).map((value) => (
                        <button
                          key={value}
                          type="button"
                          className="h-9 border font-hud text-[0.58rem] uppercase tracking-[0.14em] transition-holo"
                          style={{
                            borderColor: quality === value ? 'var(--border-glow)' : 'rgba(255,255,255,0.14)',
                            background:
                              quality === value ? 'rgba(51,170,255,0.14)' : 'rgba(255,255,255,0.025)',
                            color: quality === value ? 'var(--text-primary)' : 'var(--text-muted)',
                          }}
                          onClick={() => setQuality(value)}
                        >
                          {value.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </section>

                  <section>
                    <div className="mb-2 flex items-center justify-between text-[0.58rem] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
                      <span>阶段时长</span>
                      <span>{phaseDurationScale.toFixed(1)}x</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="2"
                      step="0.1"
                      value={phaseDurationScale}
                      onChange={(event) => setPhaseDurationScale(Number(event.target.value))}
                      className="w-full accent-[var(--border-glow)]"
                    />
                  </section>

                  <button
                    type="button"
                    aria-pressed={devOverlayOpen}
                    className="flex h-10 items-center justify-between border border-[color:rgba(196,228,255,0.14)] bg-[color:rgba(255,255,255,0.025)] px-3 text-left font-hud text-[0.62rem] uppercase tracking-[0.16em]"
                    onClick={() => setDevOverlayOpen(!devOverlayOpen)}
                  >
                    <span>显示 FPS</span>
                    <span className="text-[color:var(--border-glow)]">{devOverlayOpen ? 'ON' : 'OFF'}</span>
                  </button>

                  <PixelButton
                    tone="danger"
                    className="h-10 text-[0.58rem]"
                    onClick={() => {
                      initGame()
                      setOpen(false)
                    }}
                  >
                    重置游戏
                  </PixelButton>
                </div>
              </div>
            </GlowPanel>
          </motion.aside>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
