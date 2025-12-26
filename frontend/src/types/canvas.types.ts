export interface DrawData {
  x: number
  y: number
  color: string
  userId: string
  isEraser?: boolean
}

export interface PixelBatch {
  pixels: DrawData[]
  userId: string
}

export interface CanvasSize {
  width: number
  height: number
}

export interface Position {
  x: number
  y: number
}
