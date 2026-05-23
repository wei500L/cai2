# Dependency Notes

## 球体地图依赖

- `globe.gl` is declared as `^2.34.0` in `package.json`.
- `npm i` resolved `globe.gl@2.46.1`.
- `npm ls three` currently resolves to a single `three@0.184.0` tree.
- `package.json` uses an `overrides` entry to pin every `three` consumer to the same `0.184.0` release.
