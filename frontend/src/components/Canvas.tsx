'use client'

import { useRef, useEffect, useState } from 'react'
import Ably from 'ably'

interface DrawData {
  x: number
  y: number
  prevX: number
  prevY: number
  color: string
  lineWidth: number
  userId: string
  isEraser?: boolean
}

const Canvas = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [color, setColor] = useState('#000000')
  const [lineWidth, setLineWidth] = useState(2)
  const [isEraser, setIsEraser] = useState(false)
  const [userId] = useState(() => Math.random().toString(36).substr(2, 9))
  const [connected, setConnected] = useState(false)
  const [userCount, setUserCount] = useState(1)
  const ablyRef = useRef<Ably.Realtime | null>(null)
  const channelRef = useRef<Ably.Types.RealtimeChannelCallbacks | null>(null)
  const lastPosition = useRef<{ x: number; y: number } | null>(null)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })

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

    // Escutar eventos de desenho de outros usuários
    channel.subscribe('draw', (message) => {
      const data = message.data as DrawData
      if (data.userId !== userId) {
        drawLine(data.prevX, data.prevY, data.x, data.y, data.color, data.lineWidth, data.isEraser || false)
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

  const drawLine = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    strokeColor: string,
    strokeWidth: number,
    eraser: boolean = false
  ) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)

    if (eraser) {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.strokeStyle = 'rgba(0,0,0,1)'
    } else {
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = strokeColor
    }

    ctx.lineWidth = strokeWidth
    ctx.lineCap = 'round'
    ctx.stroke()

    // Resetar para modo normal
    ctx.globalCompositeOperation = 'source-over'
  }

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDrawing(true)
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    lastPosition.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }
  }

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !lastPosition.current) return

    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    drawLine(lastPosition.current.x, lastPosition.current.y, x, y, color, lineWidth, isEraser)

    // Publicar evento de desenho para outros usuários
    if (channelRef.current) {
      channelRef.current.publish('draw', {
        x,
        y,
        prevX: lastPosition.current.x,
        prevY: lastPosition.current.y,
        color,
        lineWidth,
        userId,
        isEraser,
      })
    }

    lastPosition.current = { x, y }
  }

  const stopDrawing = () => {
    setIsDrawing(false)
    lastPosition.current = null
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
          <div className="flex items-center gap-2">
            <label htmlFor="color" className="font-medium text-sm">
              Cor:
            </label>
            <input
              id="color"
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-10 h-10 cursor-pointer rounded-lg border-2 border-gray-300"
            />
          </div>

          <div className="h-8 w-px bg-gray-300 dark:bg-gray-600" />

          <div className="flex items-center gap-2">
            <label htmlFor="lineWidth" className="font-medium text-sm">
              Espessura:
            </label>
            <input
              id="lineWidth"
              type="range"
              min="1"
              max="20"
              value={lineWidth}
              onChange={(e) => setLineWidth(Number(e.target.value))}
              className="w-24"
            />
            <span className="text-sm w-8 font-medium">{lineWidth}px</span>
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
