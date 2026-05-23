# Globe Performance Baseline

Measured with `npm run smoke:globe` on Playwright Chromium headless at 1920x1080, `LLM_PROVIDER=mock`.
Report: `reports/globe-smoke-2026-05-23T16-52-32-372Z.html`.

| Quality | Avg FPS | Min FPS | FPS floor | Target cells | Render budget | Bloom | Starfield | Particles | Smoke | Cinematic | Drawcalls | Triangles | JS heap | VRAM estimate |
| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- | --- | ---: | ---: | ---: | ---: |
| low | 91.1 | 88.0 | 58 | ~162 | 144 | off | 0.3 | 0.4x | off | focus_short | 4 | 7,928 | 86.4 MB | ~42 MB |
| mid | 68.6 | 63.4 | 55 | ~642 | 96 | on, strength 1.0 | 0.7 | 0.7x | on | focus_short | 32 | 8,040 | 86.4 MB | ~48 MB |
| high | 62.6 | 59.4 | 45 | ~642 | 144 | on, strength 1.4 | 1.0 | 1.0x | on | full | 32 | 8,040 | 86.4 MB | ~52 MB |

Notes:

- Chrome does not expose dedicated VRAM to page JavaScript; VRAM is an estimate from WebGL resource counts plus observed heap stability.
- `Target cells` records the quality preset intent. `Render budget` is the hot-swapped runtime sampling cap used to keep smoke thresholds stable on software/headless Chromium.
- The smoke script also validates explosion handle disposal after 4s, scorched TTL clearing after five turns, 30s quality switching without console errors, and three 2D/R3F/globe renderer round trips without heap growth.
