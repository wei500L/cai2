# Globe Visual Regression

1. Default panorama: black background, sparse star shell, dark ocean hexes, subtle bloom on faction edges.
2. Bloom off comparison: same camera, same map seed, bloom disabled to verify the glow pass is the only difference.
3. Day/night comparison: sun rotated to the lit hemisphere and then the opposite side, showing the night-side half-brightness falloff.
4. Explosion aftermath: three consecutive turns over the same battle hex, showing scorched hex tint, lowered altitude, border darkening, and smoke columns fading after ttl expiry on the third turn.
4. Explosion / conventional: orange core, red particle edge, warm expanding shockwave ring pinned to the selected globe latitude and longitude.
5. Explosion / nuke: white flash, cyan-white particles, brightest bloom response, wider shockwave than conventional at the same camera distance.
6. Explosion / aerial: yellow-orange burst with a fast, compact ring and high-contrast flash.
7. Explosion / naval: blue-white burst and pale cyan shockwave, visually distinct from warm land impacts.
8. Explosion / uprising: purple-red particles and red ring, readable as unrest rather than artillery.
9. Explosion / siege: muted brown/amber particles with a darker smoke-like edge, lower apparent brightness than conventional.

## Camera Scripts

1. Nuke
   - 0ms: overview `{lat: 0, lng: 0, altitude: 2.5}`
   - 800ms: ease-out to `{lat: event.lat - 15, lng: event.lng, altitude: 1.4}`
   - 1600ms: linear to `{lat: event.lat, lng: event.lng, altitude: 0.7}`
   - 2800ms: ease-in rotate to `{lat: event.lat, lng: event.lng + 60, altitude: 0.7}`
   - 4400ms: ease-out back to overview
2. Conventional / Aerial / Siege / Naval
   - 0ms: current view
   - 600ms: ease-out to `{lat: event.lat, lng: event.lng, altitude: 1.2}`
   - 1800ms: hold
   - 2800ms: ease-in back to overview
3. Speech P0
   - 0ms: current view
   - 400ms: ease-out to `{lat: speaker_capital.lat, lng: speaker_capital.lng, altitude: current.altitude - 0.3}`
   - 1200ms: hold
   - 2000ms: ease-in back to overview

## Final Composite

One full-function composite capture should show the globe renderer in high quality with faction-colored hex territory, starfield at full density, one conventional blast, one nuke flash, five public speech ripples/arcs, scorched terrain with smoke columns still active, the settings panel quality segment visible, and the HUD event stream confirming the same turn. The expected visual balance is readable faction borders first, explosion and smoke effects second, and starfield/bloom as background accents only.
