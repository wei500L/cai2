import { Vector3 } from 'three'

export const GLOBE_RADIUS = 100

export type GlobeSurfaceNormal = {
  x: number
  y: number
  z: number
}

// globe.gl uses +Z as lng=0 and +X as lng=90.
export function globeSurfaceNormal(lat: number, lng: number): GlobeSurfaceNormal {
  const latRad = (lat * Math.PI) / 180
  const lngRad = (lng * Math.PI) / 180
  const cosLat = Math.cos(latRad)

  return {
    x: cosLat * Math.sin(lngRad),
    y: Math.sin(latRad),
    z: cosLat * Math.cos(lngRad),
  }
}

export function latLngToVec3(lat: number, lng: number, altitude = 0) {
  const radius = GLOBE_RADIUS * (1 + altitude)
  const normal = globeSurfaceNormal(lat, lng)

  return new Vector3(
    normal.x * radius,
    normal.y * radius,
    normal.z * radius,
  )
}
