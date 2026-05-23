import { AnimatePresence, motion } from 'framer-motion'
import { GlowPanel } from './GlowPanel'
import { PixelButton } from './PixelButton'
import { useGameStore } from '@/store/gameStore'
import { useMapStore } from '@/store/mapStore'
import { useUIStore, type GlobalParticleDensity } from '@/store/uiStore'

const densityOptions: Array<{ value: GlobalParticleDensity; label: string }> = [
  { value: 'low', label: 'LOW' },
  { value: 'mid', label: 'MID' },
  { value: 'high', label: 'HIGH' },
  { value: 'ultra', label: 'ULTRA' },
]

const rendererOptions: Array<{ value: 'globe' | 'r3f' | '2d'; label: string }> = [
  { value: 'globe', label: '球体（推荐）' },
  { value: 'r3f', label: '径向 3D（调试）' },
  { value: '2d', label: '2D 平面（兼容）' },
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
  const setFocusToast = useUIStore((state) => state.setFocusToast)
  const renderer = useMapStore((state) => state.renderer)
  const lighting = useMapStore((state) => state.lighting)
  const setRenderer = useMapStore((state) => state.setRenderer)
  const setLighting = useMapStore((state) => state.setLighting)
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
                      渲染器
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      {rendererOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          aria-pressed={renderer === option.value}
                          className="min-h-10 border px-2 py-1 font-hud text-[0.53rem] uppercase leading-tight tracking-[0.12em] transition-holo"
                          style={{
                            borderColor: renderer === option.value ? 'var(--border-glow)' : 'rgba(255,255,255,0.14)',
                            background:
                              renderer === option.value ? 'rgba(51,170,255,0.14)' : 'rgba(255,255,255,0.025)',
                            color: renderer === option.value ? 'var(--text-primary)' : 'var(--text-muted)',
                          }}
                          onClick={() => {
                            setRenderer(option.value)
                            setFocusToast('渲染器已切换，画面将重建一次')
                          }}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>

                    <details open className="mt-3 border border-[color:rgba(196,228,255,0.14)] bg-[color:rgba(255,255,255,0.02)] px-3 py-2">
                      <summary className="cursor-pointer list-none text-[0.58rem] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
                        视觉氛围
                      </summary>
                      <div className="mt-3 grid gap-3">
                        <label className="grid gap-1 text-[0.56rem] uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
                          <span className="flex items-center justify-between">
                            <span>Bloom 强度</span>
                            <span>{lighting.bloomStrength.toFixed(1)}</span>
                          </span>
                          <input
                            type="range"
                            min="0"
                            max="3"
                            step="0.05"
                            value={lighting.bloomStrength}
                            onChange={(event) =>
                              setLighting({ bloomStrength: Number(event.target.value) })
                            }
                            className="w-full accent-[var(--border-glow)]"
                          />
                        </label>

                        <label className="grid gap-1 text-[0.56rem] uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
                          <span className="flex items-center justify-between">
                            <span>星空密度</span>
                            <span>{lighting.starfieldDensity.toFixed(2)}</span>
                          </span>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={lighting.starfieldDensity}
                            onChange={(event) =>
                              setLighting({ starfieldDensity: Number(event.target.value) })
                            }
                            className="w-full accent-[var(--border-glow)]"
                          />
                        </label>

                        <label className="grid gap-1 text-[0.56rem] uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
                          <span className="flex items-center justify-between">
                            <span>日夜遮罩</span>
                            <span>{lighting.dayNightMaskAlpha.toFixed(2)}</span>
                          </span>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={lighting.dayNightMaskAlpha}
                            onChange={(event) =>
                              setLighting({ dayNightMaskAlpha: Number(event.target.value) })
                            }
                            className="w-full accent-[var(--border-glow)]"
                          />
                        </label>

                        <label className="flex items-center justify-between border border-[color:rgba(255,255,255,0.08)] px-3 py-2 text-[0.56rem] uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
                          <span>抖动噪点</span>
                          <input
                            type="checkbox"
                            checked={lighting.noiseEnabled}
                            onChange={(event) =>
                              setLighting({ noiseEnabled: event.target.checked })
                            }
                            className="h-4 w-4 accent-[var(--border-glow)]"
                          />
                        </label>
                      </div>
                    </details>
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
