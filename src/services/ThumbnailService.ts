import type { IStroke } from "../models/CanvasModel"

export class ThumbnailService {
  static generateThumbnail(strokes: IStroke[], background: string, width = 200, height = 150): string {
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d")

    if (!ctx) return ""

    // Set background
    if (background === "white") {
      ctx.fillStyle = "#ffffff"
      ctx.fillRect(0, 0, width, height)
    } else if (background === "grid") {
      ctx.fillStyle = "#ffffff"
      ctx.fillRect(0, 0, width, height)
      this.drawGrid(ctx, width, height)
    } else {
      // Transparent background - add a subtle border
      ctx.strokeStyle = "#e5e7eb"
      ctx.lineWidth = 1
      ctx.strokeRect(0, 0, width, height)
    }

    if (strokes.length === 0) {
      return canvas.toDataURL()
    }

    // Calculate bounds of all strokes
    let minX = Number.POSITIVE_INFINITY,
      minY = Number.POSITIVE_INFINITY,
      maxX = Number.NEGATIVE_INFINITY,
      maxY = Number.NEGATIVE_INFINITY

    strokes.forEach((stroke) => {
      stroke.points.forEach((point) => {
        minX = Math.min(minX, point.x)
        minY = Math.min(minY, point.y)
        maxX = Math.max(maxX, point.x)
        maxY = Math.max(maxY, point.y)
      })
    })

    // Add padding
    const padding = 0.1
    const strokeWidth = maxX - minX
    const strokeHeight = maxY - minY
    minX -= strokeWidth * padding
    minY -= strokeHeight * padding
    maxX += strokeWidth * padding
    maxY += strokeHeight * padding

    // Calculate scale to fit thumbnail
    const scaleX = width / (maxX - minX)
    const scaleY = height / (maxY - minY)
    const scale = Math.min(scaleX, scaleY, 1) // Don't scale up

    // Center the drawing
    const offsetX = (width - (maxX - minX) * scale) / 2
    const offsetY = (height - (maxY - minY) * scale) / 2

    // Render strokes
    strokes.forEach((stroke) => {
      if (stroke.points.length < 2) return

      ctx.beginPath()
      ctx.strokeStyle = stroke.color
      ctx.lineWidth = Math.max(1, stroke.size * scale * 0.5) // Scale down stroke size
      ctx.lineCap = "round"
      ctx.lineJoin = "round"

      const firstPoint = stroke.points[0]
      ctx.moveTo((firstPoint.x - minX) * scale + offsetX, (firstPoint.y - minY) * scale + offsetY)

      for (let i = 1; i < stroke.points.length; i++) {
        const point = stroke.points[i]
        ctx.lineTo((point.x - minX) * scale + offsetX, (point.y - minY) * scale + offsetY)
      }

      ctx.stroke()
    })

    return canvas.toDataURL()
  }

  private static drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const gridSize = 10
    ctx.strokeStyle = "#f0f0f0"
    ctx.lineWidth = 0.5

    for (let x = 0; x < width; x += gridSize) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
      ctx.stroke()
    }

    for (let y = 0; y < height; y += gridSize) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
      ctx.stroke()
    }
  }
}
