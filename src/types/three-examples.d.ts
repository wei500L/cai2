declare module 'three/examples/jsm/lines/Line2' {
  import type { BufferGeometry, Material, Object3D } from 'three'

  export class Line2 extends Object3D {
    constructor(geometry?: BufferGeometry, material?: Material)
    geometry: BufferGeometry & {
      setPositions(positions: number[]): void
    }
    material: Material & {
      resolution: { set(width: number, height: number): void }
    }
    computeLineDistances(): this
  }
}

declare module 'three/examples/jsm/lines/LineGeometry' {
  import type { BufferGeometry } from 'three'

  export class LineGeometry extends BufferGeometry {
    setPositions(positions: number[]): this
  }
}

declare module 'three/examples/jsm/lines/LineMaterial' {
  import type { Material } from 'three'

  export class LineMaterial extends Material {
    constructor(parameters?: Record<string, unknown>)
    resolution: { set(width: number, height: number): void }
  }
}
