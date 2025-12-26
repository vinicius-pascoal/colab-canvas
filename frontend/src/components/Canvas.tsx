'use client'

import { useRef, useEffect, useState } from 'react'
import Ably from 'ably'

interface DrawData {
  x: number
  y: number
  color: string
  userId: string
  isEraser?: boolean
}

interface PixelBatch {
  pixels: DrawData[]
  userId: string
}

const Canvas = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [color, setColor] = useState('#000000')
  const pixelSize = 10 // Tamanho fixo
  const [isEraser, setIsEraser] = useState(false)
  const [colorHistory, setColorHistory] = useState<string[]>(['#FF0000', '#00FF00', '#0000FF', '#FFFF00'])
  const [userId] = useState(() => Math.random().toString(36).substr(2, 9))
  const [connected, setConnected] = useState(false)
  const [userCount, setUserCount] = useState(1)
  const ablyRef = useRef<Ably.Realtime | null>(null)
  const channelRef = useRef<Ably.Types.RealtimeChannelCallbacks | null>(null)
  const lastPosition = useRef<{ x: number; y: number } | null>(null)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })
  const pixelBatchRef = useRef<DrawData[]>([])
  const batchTimerRef = useRef<NodeJS.Timeout | null>(null)
  const drawnPixelsRef = useRef<Set<string>>(new Set())

  // Histórico permanente de todos os pixels desenhados
  const pixelHistoryRef = useRef<Map<string, DrawData>>(new Map())

  // Estados para pan e zoom
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)
  const [isPanning, setIsPanning] = useState(false)
  const [panMode, setPanMode] = useState(false) // Modo pan para mobile
  const panStartRef = useRef({ x: 0, y: 0 })
  const lastTouchDistance = useRef<number | null>(null)

  // Tamanho fixo do canvas
  useEffect(() => {
    setCanvasSize({
      width: 1920,
      height: 1080,
    })

    // Centralizar canvas na primeira vez (mobile)
    if (window.innerWidth < 1920 || window.innerHeight < 1080) {
      const initialScale = Math.min(
        window.innerWidth / 1920,
        window.innerHeight / 1080
      ) * 0.9
      setScale(initialScale)
      setOffset({
        x: (window.innerWidth - 1920 * initialScale) / 2,
        y: (window.innerHeight - 1080 * initialScale) / 2
      })
    }
  }, [])

  // Desenhar grid quando canvas for criado ou redimensionado
  useEffect(() => {
    if (canvasSize.width > 0 && canvasSize.height > 0) {
      drawGrid()
    }
  }, [canvasSize, offset, scale])

  // Adicionar wheel listener com passive: false
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const handleWheelEvent = (e: WheelEvent) => {
      e.preventDefault()

      const rect = canvas.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top

      const delta = e.deltaY > 0 ? 0.9 : 1.1
      const newScale = Math.max(0.5, Math.min(5, scale * delta))

      // Ajustar offset para zoom centrado no mouse
      const worldX = (mouseX - offset.x) / scale
      const worldY = (mouseY - offset.y) / scale

      setOffset({
        x: mouseX - worldX * newScale,
        y: mouseY - worldY * newScale
      })
      setScale(newScale)
    }

    canvas.addEventListener('wheel', handleWheelEvent, { passive: false })
    return () => canvas.removeEventListener('wheel', handleWheelEvent)
  }, [scale, offset])

  // Enviar batch de pixels agrupados
  const sendPixelBatch = () => {
    if (pixelBatchRef.current.length === 0) return

    if (channelRef.current) {
      channelRef.current.publish('pixel-batch', {
        pixels: pixelBatchRef.current,
        userId,
      })
    }

    pixelBatchRef.current = []
    drawnPixelsRef.current.clear()
  }

  // Agendar envio do batch
  const scheduleBatchSend = () => {
    if (batchTimerRef.current) {
      clearTimeout(batchTimerRef.current)
    }

    batchTimerRef.current = setTimeout(() => {
      sendPixelBatch()
    }, 100) // Envia a cada 100ms
  }

  // Carregar estado do canvas do backend
  const loadCanvasState = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
      const response = await fetch(`${apiUrl}/canvas/load`)
      const data = await response.json()

      if (data.canvasData) {
        const canvas = canvasRef.current
        if (!canvas) return

        const ctx = canvas.getContext('2d')
        if (!ctx) return

        const img = new Image()
        img.onload = () => {
          // Desenhar imagem carregada
          ctx.save()
          ctx.setTransform(1, 0, 0, 1, 0, 0)
          ctx.drawImage(img, 0, 0)
          ctx.restore()

          // Nota: O histórico de pixels será reconstruído gradualmente conforme usuários desenham
          redrawCanvas()
          console.log('✅ Estado do canvas carregado')
        }
        img.src = data.canvasData
      }
    } catch (error) {
      console.error('Erro ao carregar canvas:', error)
    }
  }

  // Salvar estado do canvas no backend
  const saveCanvasState = async () => {
    const canvas = canvasRef.current
    if (!canvas) return

    try {
      const canvasData = canvas.toDataURL('image/png')
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

      await fetch(`${apiUrl}/canvas/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ canvasData }),
      })
    } catch (error) {
      console.error('Erro ao salvar canvas:', error)
    }
  }

  // Debounced save - salva após 2 segundos de inatividade
  const debouncedSave = () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveCanvasState()
    }, 2000)
  }

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_ABLY_API_KEY

    if (!apiKey) {
      console.error('Ably API Key não configurada')
      return
    }

    // Inicializar Ably
    const ably = new Ably.Realtime({
      key: apiKey,
      clientId: userId,
    })

    ablyRef.current = ably

    ably.connection.on('connected', () => {
      setConnected(true)
      console.log('Conectado ao Ably')
      // Carregar estado atual do canvas
      loadCanvasState()
    })

    ably.connection.on('disconnected', () => {
      setConnected(false)
      console.log('Desconectado do Ably')
    })

    // Canal para colaboração
    const channel = ably.channels.get('canvas-draw')
    channelRef.current = channel

    // Escutar eventos de desenho de outros usuários (pixels individuais - retrocompatibilidade)
    channel.subscribe('draw', (message) => {
      const data = message.data as DrawData
      if (data.userId !== userId) {
        drawPixel(data.x, data.y, data.color, data.isEraser || false)
      }
    })

    // Escutar batches de pixels
    channel.subscribe('pixel-batch', (message) => {
      const batch = message.data as PixelBatch
      if (batch.userId !== userId) {
        batch.pixels.forEach(pixel => {
          drawPixel(pixel.x, pixel.y, pixel.color, pixel.isEraser || false)
        })
      }
    })

    // Escutar evento de limpar canvas
    channel.subscribe('clear', (message) => {
      if (message.data.userId !== userId) {
        clearCanvas()
      }
    })

    // Presença - contar usuários
    channel.presence.enter()
    channel.presence.subscribe('enter', () => {
      channel.presence.get((err, members) => {
        if (!err && members) {
          setUserCount(members.length)
        }
      })
    })

    channel.presence.subscribe('leave', () => {
      channel.presence.get((err, members) => {
        if (!err && members) {
          setUserCount(members.length)
        }
      })
    })

    return () => {
      channel.presence.leave()
      channel.unsubscribe()
      ably.close()
    }
  }, [userId])

  // Redesenhar tudo (grid + todos os pixels)
  const redrawCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Limpar canvas
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.restore()

    // Aplicar transformações
    ctx.save()
    ctx.translate(offset.x, offset.y)
    ctx.scale(scale, scale)

    // Desenhar grid
    ctx.strokeStyle = 'rgba(200, 200, 200, 0.2)'
    ctx.lineWidth = 0.5 / scale

    const startX = Math.floor(-offset.x / scale / pixelSize) * pixelSize
    const startY = Math.floor(-offset.y / scale / pixelSize) * pixelSize
    const endX = Math.ceil((canvas.width - offset.x) / scale / pixelSize) * pixelSize
    const endY = Math.ceil((canvas.height - offset.y) / scale / pixelSize) * pixelSize

    // Linhas verticais
    for (let x = startX; x <= endX; x += pixelSize) {
      ctx.beginPath()
      ctx.moveTo(x, startY)
      ctx.lineTo(x, endY)
      ctx.stroke()
    }

    // Linhas horizontais
    for (let y = startY; y <= endY; y += pixelSize) {
      ctx.beginPath()
      ctx.moveTo(startX, y)
      ctx.lineTo(endX, y)
      ctx.stroke()
    }

    // Redesenhar todos os pixels do histórico
    pixelHistoryRef.current.forEach((pixelData) => {
      const pixelX = Math.floor(pixelData.x / pixelSize) * pixelSize
      const pixelY = Math.floor(pixelData.y / pixelSize) * pixelSize

      if (!pixelData.isEraser) {
        ctx.fillStyle = pixelData.color
        ctx.fillRect(pixelX, pixelY, pixelSize, pixelSize)
      }
    })

    ctx.restore()
  }

  // Função auxiliar para compatibilidade
  const drawGrid = () => {
    redrawCanvas()
  }

  const drawPixel = (
    x: number,
    y: number,
    pixelColor: string,
    eraser: boolean = false
  ) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Calcular posição do pixel no grid
    const pixelX = Math.floor(x / pixelSize) * pixelSize
    const pixelY = Math.floor(y / pixelSize) * pixelSize
    const pixelKey = `${pixelX},${pixelY}`

    // Atualizar histórico
    if (eraser) {
      pixelHistoryRef.current.delete(pixelKey)
    } else {
      pixelHistoryRef.current.set(pixelKey, {
        x: pixelX,
        y: pixelY,
        color: pixelColor,
        userId,
        isEraser: false
      })
    }

    // Redesenhar imediatamente
    ctx.save()
    ctx.translate(offset.x, offset.y)
    ctx.scale(scale, scale)

    if (eraser) {
      ctx.clearRect(pixelX, pixelY, pixelSize, pixelSize)
      // Redesenhar grid no pixel apagado
      ctx.strokeStyle = 'rgba(200, 200, 200, 0.2)'
      ctx.lineWidth = 0.5 / scale
      ctx.strokeRect(pixelX, pixelY, pixelSize, pixelSize)
    } else {
      ctx.fillStyle = pixelColor
      ctx.fillRect(pixelX, pixelY, pixelSize, pixelSize)
    }

    ctx.restore()
  }

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDrawing(true)
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const clientX = e.clientX - rect.left
    const clientY = e.clientY - rect.top

    // Converter coordenadas do canvas para coordenadas do mundo
    const x = (clientX - offset.x) / scale
    const y = (clientY - offset.y) / scale

    // Desenhar pixel imediatamente ao clicar
    drawPixel(x, y, color, isEraser)

    // Adicionar ao batch
    const pixelKey = `${Math.floor(x / pixelSize)},${Math.floor(y / pixelSize)}`
    if (!drawnPixelsRef.current.has(pixelKey)) {
      pixelBatchRef.current.push({ x, y, color, userId, isEraser })
      drawnPixelsRef.current.add(pixelKey)
      scheduleBatchSend()
    }
  }

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return

    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const clientX = e.clientX - rect.left
    const clientY = e.clientY - rect.top

    // Converter coordenadas do canvas para coordenadas do mundo
    const x = (clientX - offset.x) / scale
    const y = (clientY - offset.y) / scale

    drawPixel(x, y, color, isEraser)

    // Adicionar ao batch (evitando duplicatas)
    const pixelKey = `${Math.floor(x / pixelSize)},${Math.floor(y / pixelSize)}`
    if (!drawnPixelsRef.current.has(pixelKey)) {
      pixelBatchRef.current.push({ x, y, color, userId, isEraser })
      drawnPixelsRef.current.add(pixelKey)
      scheduleBatchSend()
    }
  }

  const stopDrawing = () => {
    setIsDrawing(false)
    setIsPanning(false)
    // Enviar último batch imediatamente
    if (batchTimerRef.current) {
      clearTimeout(batchTimerRef.current)
    }
    sendPixelBatch()
    // Salvar estado do canvas após desenhar
    debouncedSave()
  }

  // Touch handlers
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return

    if (e.touches.length === 1) {
      const touch = e.touches[0]
      const rect = canvas.getBoundingClientRect()
      const clientX = touch.clientX - rect.left
      const clientY = touch.clientY - rect.top

      if (panMode) {
        // Modo pan - arrastar com um dedo
        setIsPanning(true)
        panStartRef.current = { x: clientX, y: clientY }
      } else {
        // Modo desenho - um dedo desenha
        const x = (clientX - offset.x) / scale
        const y = (clientY - offset.y) / scale

        setIsDrawing(true)
        drawPixel(x, y, color, isEraser)

        const pixelKey = `${Math.floor(x / pixelSize)},${Math.floor(y / pixelSize)}`
        if (!drawnPixelsRef.current.has(pixelKey)) {
          pixelBatchRef.current.push({ x, y, color, userId, isEraser })
          drawnPixelsRef.current.add(pixelKey)
          scheduleBatchSend()
        }
      }
    } else if (e.touches.length === 2) {
      // Dois dedos - preparar para zoom/pan
      setIsDrawing(false)
      setIsPanning(true)
      const touch1 = e.touches[0]
      const touch2 = e.touches[1]
      const distance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      )
      lastTouchDistance.current = distance

      panStartRef.current = {
        x: (touch1.clientX + touch2.clientX) / 2,
        y: (touch1.clientY + touch2.clientY) / 2
      }
    }
  }

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return

    if (e.touches.length === 1) {
      const touch = e.touches[0]
      const rect = canvas.getBoundingClientRect()
      const clientX = touch.clientX - rect.left
      const clientY = touch.clientY - rect.top

      if (isPanning && panMode) {
        // Pan com um dedo
        const dx = clientX - panStartRef.current.x
        const dy = clientY - panStartRef.current.y

        setOffset(prev => ({
          x: prev.x + dx,
          y: prev.y + dy
        }))

        panStartRef.current = { x: clientX, y: clientY }
      } else if (isDrawing && !isPanning) {
        // Desenhar

        const x = (clientX - offset.x) / scale
        const y = (clientY - offset.y) / scale

        drawPixel(x, y, color, isEraser)

        const pixelKey = `${Math.floor(x / pixelSize)},${Math.floor(y / pixelSize)}`
        if (!drawnPixelsRef.current.has(pixelKey)) {
          pixelBatchRef.current.push({ x, y, color, userId, isEraser })
          drawnPixelsRef.current.add(pixelKey)
          scheduleBatchSend()
        }
      } else if (e.touches.length === 2) {
        // Dois dedos - zoom e pan
        const touch1 = e.touches[0]
        const touch2 = e.touches[1]

        // Zoom
        const distance = Math.hypot(
          touch2.clientX - touch1.clientX,
          touch2.clientY - touch1.clientY
        )

        if (lastTouchDistance.current) {
          const delta = distance - lastTouchDistance.current
          const newScale = Math.max(0.5, Math.min(5, scale + delta * 0.01))
          setScale(newScale)
        }
        lastTouchDistance.current = distance

        // Pan
        const centerX = (touch1.clientX + touch2.clientX) / 2
        const centerY = (touch1.clientY + touch2.clientY) / 2

        const dx = centerX - panStartRef.current.x
        const dy = centerY - panStartRef.current.y

        setOffset(prev => ({
          x: prev.x + dx,
          y: prev.y + dy
        }))

        panStartRef.current = { x: centerX, y: centerY }
      }
    }

    const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
      e.preventDefault()
      if (e.touches.length === 0) {
        stopDrawing()
        lastTouchDistance.current = null
      } else if (e.touches.length === 1) {
        lastTouchDistance.current = null
        setIsPanning(false)
      }
    }

    const clearCanvas = () => {
      const canvas = canvasRef.current
      if (!canvas) return

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      // Limpar histórico de pixels
      pixelHistoryRef.current.clear()

      // Redesenhar (apenas grid)
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.restore()
      redrawCanvas()
    }

    const handleClearCanvas = () => {
      clearCanvas()

      // Publicar evento de limpar para outros usuários
      if (channelRef.current) {
        channelRef.current.publish('clear', { userId })
      }

      // Salvar canvas limpo
      saveCanvasState()
    }

    // Atualizar cor e histórico
    const handleColorChange = (newColor: string) => {
      setColor(newColor)
      setIsEraser(false) // Desativar borracha ao selecionar cor

      // Atualizar histórico (remover se já existe e adicionar no início)
      setColorHistory(prev => {
        const filtered = prev.filter(c => c !== newColor)
        return [newColor, ...filtered].slice(0, 4)
      })
    }

    return (
      <div className="fixed inset-0 w-screen h-screen overflow-hidden">
        {/* Canvas em tela cheia */}
        <canvas
          ref={canvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="absolute inset-0 w-full h-full bg-white cursor-crosshair touch-none"
        />

        {/* Controles flutuantes na parte inferior */}
        <div className="absolute bottom-4 md:bottom-8 left-1/2 transform -translate-x-1/2 z-10 max-w-[95vw]">
          <div className="flex flex-col md:flex-row items-center gap-2 md:gap-4 px-3 md:px-6 py-3 md:py-4 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 backdrop-blur-sm bg-opacity-95">
            <div className="flex items-center gap-2 md:gap-3 w-full md:w-auto justify-center">
              <label className="font-medium text-xs md:text-sm">
                Cor:
              </label>
              <input
                type="color"
                value={color}
                onChange={(e) => handleColorChange(e.target.value)}
                className="w-8 h-8 md:w-10 md:h-10 cursor-pointer rounded-lg border-2 border-gray-300"
              />
              {/* Histórico de cores */}
              <div className="flex gap-1">
                {colorHistory.map((histColor, index) => (
                  <button
                    key={index}
                    onClick={() => handleColorChange(histColor)}
                    className={`w-7 h-7 md:w-8 md:h-8 rounded-md border-2 transition-all hover:scale-110 ${color === histColor && !isEraser
                      ? 'border-blue-500 ring-2 ring-blue-300'
                      : 'border-gray-300'
                      }`}
                    style={{ backgroundColor: histColor }}
                    title={histColor}
                  />
                ))}
              </div>
            </div>

            <div className="hidden md:block h-8 w-px bg-gray-300 dark:bg-gray-600" />

            <div className="flex items-center gap-2 w-full md:w-auto justify-center">
              <button
                onClick={() => { setIsEraser(false); setPanMode(false); }}
                className={`px-3 md:px-4 py-2 rounded-lg font-medium text-xs md:text-base transition-all ${!isEraser && !panMode
                  ? 'bg-blue-500 text-white shadow-md'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                  }`}
              >
                ✏️ Pincel
              </button>
              <button
                onClick={() => { setIsEraser(true); setPanMode(false); }}
                className={`px-3 md:px-4 py-2 rounded-lg font-medium text-xs md:text-base transition-all ${isEraser && !panMode
                  ? 'bg-blue-500 text-white shadow-md'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                  }`}
              >
                ⬜ Borracha
              </button>
              <button
                onClick={() => { setPanMode(!panMode); setIsEraser(false); }}
                className={`px-3 md:px-4 py-2 rounded-lg font-medium text-xs md:text-base transition-all md:hidden ${panMode
                  ? 'bg-blue-500 text-white shadow-md'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                  }`}
              >
                🖐️ Mover
              </button>
            </div>

            <div className="hidden md:block h-8 w-px bg-gray-300 dark:bg-gray-600" />

            <div className="flex items-center gap-3 md:gap-4 w-full md:w-auto justify-center">
              <div className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 md:w-2.5 md:h-2.5 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'
                    }`}
                />
                <span className="text-xs font-medium">
                  {connected ? 'Online' : 'Offline'}
                </span>
              </div>
              <span className="text-xs font-medium">
                👥 {userCount}
              </span>
              <span className="text-xs font-medium hidden md:inline">
                🔍 {scale.toFixed(1)}x
              </span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  export default Canvas
