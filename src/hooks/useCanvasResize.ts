import { useState, useEffect } from "react"

interface CanvasSize {
  width: number
  height: number
}

export const useCanvasResize = (minWidth = 400, minHeight = 300, maxWidth = 1200, maxHeight = 800) => {
  const [canvasSize, setCanvasSize] = useState<CanvasSize>({ width: 800, height: 600 })

  useEffect(() => {
    const updateCanvasSize = () => {
      const availableWidth = window.innerWidth - 200 // Account for sidebars
      const availableHeight = window.innerHeight - 200 // Account for headers/footers

      const width = Math.max(minWidth, Math.min(maxWidth, availableWidth))
      const height = Math.max(minHeight, Math.min(maxHeight, availableHeight))

      setCanvasSize({ width, height })
    }

    updateCanvasSize()
    window.addEventListener("resize", updateCanvasSize)
    return () => window.removeEventListener("resize", updateCanvasSize)
  }, [minWidth, minHeight, maxWidth, maxHeight])

  return canvasSize
}
