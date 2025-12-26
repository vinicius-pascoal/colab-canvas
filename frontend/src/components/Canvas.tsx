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
  const pixelSize = 15 // Tamanho fixo
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

  // Ajustar tamanho do canvas para tela cheia
  useEffect(() => {
    const updateCanvasSize = () => {
      setCanvasSize({
        width: window.innerWidth,
        height: window.innerHeight,
      })
    }

    updateCanvasSize()
    window.addEventListener('resize', updateCanvasSize)

    return () => window.removeEventListener('resize', updateCanvasSize)
  }, [])

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
          ctx.drawImage(img, 0, 0)
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

    if (eraser) {
      ctx.clearRect(pixelX, pixelY, pixelSize, pixelSize)
    } else {
      ctx.fillStyle = pixelColor
      ctx.fillRect(pixelX, pixelY, pixelSize, pixelSize)
    }

    // Desenhar grid (opcional)
    ctx.strokeStyle = 'rgba(200, 200, 200, 0.3)'
    ctx.lineWidth = 0.5
    ctx.strokeRect(pixelX, pixelY, pixelSize, pixelSize)
  }

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDrawing(true)
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

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
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

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
    // Enviar último batch imediatamente
    if (batchTimerRef.current) {
      clearTimeout(batchTimerRef.current)
    }
    sendPixelBatch()
    // Salvar estado do canvas após desenhar
    debouncedSave()
  }

  const clearCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)
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
        className="absolute inset-0 w-full h-full bg-white cursor-crosshair"
      />

      {/* Controles flutuantes na parte inferior */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-10">
        <div className="flex items-center gap-4 px-6 py-4 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 backdrop-blur-sm bg-opacity-95">
          <div className="flex items-center gap-3">
            <label className="font-medium text-sm">
              Cor:
            </label>
            <input
              type="color"
              value={color}
              onChange={(e) => handleColorChange(e.target.value)}
              className="w-10 h-10 cursor-pointer rounded-lg border-2 border-gray-300"
            />
            {/* Histórico de cores */}
            <div className="flex gap-1">
              {colorHistory.map((histColor, index) => (
                <button
                  key={index}
                  onClick={() => handleColorChange(histColor)}
                  className={`w-8 h-8 rounded-md border-2 transition-all hover:scale-110 ${color === histColor && !isEraser
                      ? 'border-blue-500 ring-2 ring-blue-300'
                      : 'border-gray-300'
                    }`}
                  style={{ backgroundColor: histColor }}
                  title={histColor}
                />
              ))}
            </div>
          </div>

          <div className="h-8 w-px bg-gray-300 dark:bg-gray-600" />

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsEraser(false)}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${!isEraser
                ? 'bg-blue-500 text-white shadow-md'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                }`}
            >
              ✏️ Pincel
            </button>
            <button
              onClick={() => setIsEraser(true)}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${isEraser
                ? 'bg-blue-500 text-white shadow-md'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                }`}
            >
              ⬜ Borracha
            </button>
          </div>

          <div className="h-8 w-px bg-gray-300 dark:bg-gray-600" />

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div
                className={`w-2.5 h-2.5 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'
                  }`}
              />
              <span className="text-xs font-medium">
                {connected ? 'Online' : 'Offline'}
              </span>
            </div>
            <span className="text-xs font-medium">
              👥 {userCount}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Canvas
