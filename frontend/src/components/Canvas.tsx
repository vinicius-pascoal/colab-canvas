"use client"

declare const process: any

import { useRef, useEffect, useState } from 'react'
import Ably from 'ably'
import CanvasControls from './CanvasControls'
import type { DrawData, PixelBatch } from '../types/canvas.types'

const Canvas = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const ablyRef = useRef<Ably.Realtime | null>(null)
  const channelRef = useRef<Ably.Types.RealtimeChannelCallbacks | null>(null)

  const [isDrawing, setIsDrawing] = useState(false)
  const [color, setColor] = useState('#000000')
  const pixelSize = 10
  const [isEraser, setIsEraser] = useState(false)
  const [colorHistory, setColorHistory] = useState<string[]>(['#FF0000', '#00FF00', '#0000FF', '#FFFF00'])
  const [userId] = useState(() => Math.random().toString(36).substr(2, 9))
  const [connected, setConnected] = useState(false)
  const [userCount, setUserCount] = useState(1)

  const [canvasSize] = useState({ width: 1920, height: 1080 })

  const pixelBatchRef = useRef<DrawData[]>([])
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const drawnPixelsRef = useRef<Set<string>>(new Set())
  const pixelHistoryRef = useRef<Map<string, DrawData>>(new Map())

  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)
  const [isPanning, setIsPanning] = useState(false)
  const [panMode, setPanMode] = useState(false)
  const panStartRef = useRef({ x: 0, y: 0 })
  const lastTouchDistance = useRef<number | null>(null)

  useEffect(() => {
    const initialScale = Math.min(window.innerWidth / canvasSize.width, window.innerHeight / canvasSize.height) * 0.9
    setScale(initialScale)
    setOffset({
      x: (window.innerWidth - canvasSize.width * initialScale) / 2,
      y: (window.innerHeight - canvasSize.height * initialScale) / 2,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Converte coordenadas de cliente (DOM) para coordenadas internas do canvas
  const toCanvasCoords = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: clientX, y: clientY }
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return {
      x: clientX * scaleX,
      y: clientY * scaleY,
    }
  }

  const redrawCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.restore()

    ctx.save()
    ctx.translate(offset.x, offset.y)
    ctx.scale(scale, scale)

    ctx.strokeStyle = 'rgba(200, 200, 200, 0.2)'
    ctx.lineWidth = 0.5 / scale

    const startX = Math.floor(-offset.x / scale / pixelSize) * pixelSize
    const startY = Math.floor(-offset.y / scale / pixelSize) * pixelSize
    const endX = Math.ceil((canvas.width - offset.x) / scale / pixelSize) * pixelSize
    const endY = Math.ceil((canvas.height - offset.y) / scale / pixelSize) * pixelSize

    for (let x = startX; x <= endX; x += pixelSize) {
      ctx.beginPath()
      ctx.moveTo(x, startY)
      ctx.lineTo(x, endY)
      ctx.stroke()
    }

    for (let y = startY; y <= endY; y += pixelSize) {
      ctx.beginPath()
      ctx.moveTo(startX, y)
      ctx.lineTo(endX, y)
      ctx.stroke()
    }

    pixelHistoryRef.current.forEach((p: DrawData) => {
      if (!p.isEraser) {
        ctx.fillStyle = p.color
        ctx.fillRect(p.x, p.y, pixelSize, pixelSize)
      }
    })

    ctx.restore()
  }

  useEffect(() => {
    redrawCanvas()
  }, [offset, scale, canvasSize])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const handleWheelEvent = (e: any) => {
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const clientX = e.clientX - rect.left
      const clientY = e.clientY - rect.top
      const { x: mouseX, y: mouseY } = toCanvasCoords(clientX, clientY)
      const delta = e.deltaY > 0 ? 0.9 : 1.1
      const newScale = Math.max(0.5, Math.min(5, scale * delta))
      const worldX = (mouseX - offset.x) / scale
      const worldY = (mouseY - offset.y) / scale
      setOffset({ x: mouseX - worldX * newScale, y: mouseY - worldY * newScale })
      setScale(newScale)
    }
    canvas.addEventListener('wheel', handleWheelEvent, { passive: false })
    return () => canvas.removeEventListener('wheel', handleWheelEvent)
  }, [scale, offset])

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
          ctx.save()
          ctx.setTransform(1, 0, 0, 1, 0, 0)
          ctx.drawImage(img, 0, 0)
          ctx.restore()
          redrawCanvas()
        }
        img.src = data.canvasData
      }
    } catch (error) {
      console.error('Erro ao carregar canvas:', error)
    }
  }

  const saveCanvasState = async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    try {
      const canvasData = canvas.toDataURL('image/png')
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
      await fetch(`${apiUrl}/canvas/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canvasData }),
      })
    } catch (error) {
      console.error('Erro ao salvar canvas:', error)
    }
  }

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const debouncedSave = () => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
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
    const ably = new Ably.Realtime({ key: apiKey, clientId: userId })
    ablyRef.current = ably
    ably.connection.on('connected', () => {
      setConnected(true)
      loadCanvasState()
    })
    ably.connection.on('disconnected', () => setConnected(false))
    const channel = ably.channels.get('canvas-draw')
    channelRef.current = channel
    channel.subscribe('draw', (message: any) => {
      const data = message.data as DrawData
      if (data.userId !== userId) {
        drawPixel(data.x, data.y, data.color, data.isEraser || false)
      }
    })
    channel.subscribe('pixel-batch', (message: any) => {
      const batch = message.data as PixelBatch
      if (batch.userId !== userId) {
        batch.pixels.forEach((p: DrawData) => {
          drawPixel(p.x, p.y, p.color, p.isEraser || false)
        })
      }
    })
    channel.subscribe('clear', (message: any) => {
      if (message.data.userId !== userId) {
        clearCanvas()
      }
    })
    channel.presence.enter()
    channel.presence.subscribe('enter', () => {
      channel.presence.get((err: any, members: any[]) => {
        if (!err && members) setUserCount(members.length)
      })
    })
    channel.presence.subscribe('leave', () => {
      channel.presence.get((err: any, members: any[]) => {
        if (!err && members) setUserCount(members.length)
      })
    })
    return () => {
      channel.presence.leave()
      channel.unsubscribe()
      ably.close()
    }
  }, [userId])

  const sendPixelBatch = () => {
    if (pixelBatchRef.current.length === 0) return
    if (channelRef.current) {
      channelRef.current.publish('pixel-batch', { pixels: pixelBatchRef.current, userId })
    }
    pixelBatchRef.current = []
    drawnPixelsRef.current.clear()
  }

  const scheduleBatchSend = () => {
    if (batchTimerRef.current) clearTimeout(batchTimerRef.current)
    batchTimerRef.current = setTimeout(sendPixelBatch, 100)
  }

  const drawPixel = (x: number, y: number, pixelColor: string, eraser: boolean = false) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const pixelX = Math.floor(x / pixelSize) * pixelSize
    const pixelY = Math.floor(y / pixelSize) * pixelSize
    const key = `${pixelX},${pixelY}`
    if (eraser) {
      pixelHistoryRef.current.delete(key)
    } else {
      pixelHistoryRef.current.set(key, { x: pixelX, y: pixelY, color: pixelColor, userId, isEraser: false })
    }
    ctx.save()
    ctx.translate(offset.x, offset.y)
    ctx.scale(scale, scale)
    if (eraser) {
      ctx.clearRect(pixelX, pixelY, pixelSize, pixelSize)
      ctx.strokeStyle = 'rgba(200, 200, 200, 0.2)'
      ctx.lineWidth = 0.5 / scale
      ctx.strokeRect(pixelX, pixelY, pixelSize, pixelSize)
    } else {
      ctx.fillStyle = pixelColor
      ctx.fillRect(pixelX, pixelY, pixelSize, pixelSize)
    }
    ctx.restore()
  }

  const startDrawing = (e: any) => {
    setIsDrawing(true)
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const clientX = e.clientX - rect.left
    const clientY = e.clientY - rect.top
    const { x: canvasX, y: canvasY } = toCanvasCoords(clientX, clientY)
    const x = (canvasX - offset.x) / scale
    const y = (canvasY - offset.y) / scale
    drawPixel(x, y, color, isEraser)
    const pixelKey = `${Math.floor(x / pixelSize)},${Math.floor(y / pixelSize)}`
    if (!drawnPixelsRef.current.has(pixelKey)) {
      pixelBatchRef.current.push({ x, y, color, userId, isEraser })
      drawnPixelsRef.current.add(pixelKey)
      scheduleBatchSend()
    }
  }

  const draw = (e: any) => {
    if (!isDrawing) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const clientX = e.clientX - rect.left
    const clientY = e.clientY - rect.top
    const { x: canvasX, y: canvasY } = toCanvasCoords(clientX, clientY)
    const x = (canvasX - offset.x) / scale
    const y = (canvasY - offset.y) / scale
    drawPixel(x, y, color, isEraser)
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
    if (batchTimerRef.current) clearTimeout(batchTimerRef.current)
    sendPixelBatch()
    debouncedSave()
  }

  const handleTouchStart = (e: any) => {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    if (e.touches.length === 1) {
      const touch = e.touches[0]
      const rect = canvas.getBoundingClientRect()
      const clientX = touch.clientX - rect.left
      const clientY = touch.clientY - rect.top
      const { x: canvasX, y: canvasY } = toCanvasCoords(clientX, clientY)
      if (panMode) {
        setIsPanning(true)
        panStartRef.current = { x: canvasX, y: canvasY }
      } else {
        const x = (canvasX - offset.x) / scale
        const y = (canvasY - offset.y) / scale
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
      setIsDrawing(false)
      setIsPanning(true)
      const t1 = e.touches[0]
      const t2 = e.touches[1]
      lastTouchDistance.current = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY)
      panStartRef.current = { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 }
    }
  }

  const handleTouchMove = (e: any) => {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    if (e.touches.length === 1) {
      const touch = e.touches[0]
      const rect = canvas.getBoundingClientRect()
      const clientX = touch.clientX - rect.left
      const clientY = touch.clientY - rect.top
      const { x: canvasX, y: canvasY } = toCanvasCoords(clientX, clientY)
      if (isPanning && panMode) {
        const dx = canvasX - panStartRef.current.x
        const dy = canvasY - panStartRef.current.y
        setOffset((prev: any) => ({ x: prev.x + dx, y: prev.y + dy }))
        panStartRef.current = { x: canvasX, y: canvasY }
      } else if (isDrawing && !isPanning) {
        const x = (canvasX - offset.x) / scale
        const y = (canvasY - offset.y) / scale
        drawPixel(x, y, color, isEraser)
        const pixelKey = `${Math.floor(x / pixelSize)},${Math.floor(y / pixelSize)}`
        if (!drawnPixelsRef.current.has(pixelKey)) {
          pixelBatchRef.current.push({ x, y, color, userId, isEraser })
          drawnPixelsRef.current.add(pixelKey)
          scheduleBatchSend()
        }
      }
    } else if (e.touches.length === 2) {
      const t1 = e.touches[0]
      const t2 = e.touches[1]
      const distance = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY)
      if (lastTouchDistance.current) {
        const delta = distance - lastTouchDistance.current
        const newScale = Math.max(0.5, Math.min(5, scale + delta * 0.01))
        setScale(newScale)
      }
      lastTouchDistance.current = distance
      const centerClientX = (t1.clientX + t2.clientX) / 2
      const centerClientY = (t1.clientY + t2.clientY) / 2
      const rect = canvas.getBoundingClientRect()
      const { x: centerX, y: centerY } = toCanvasCoords(centerClientX - rect.left, centerClientY - rect.top)
      const dx = centerX - panStartRef.current.x
      const dy = centerY - panStartRef.current.y
      setOffset((prev: any) => ({ x: prev.x + dx, y: prev.y + dy }))
      panStartRef.current = { x: centerX, y: centerY }
    }
  }

  const handleTouchEnd = (e: any) => {
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
    pixelHistoryRef.current.clear()
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.restore()
    redrawCanvas()
  }

  const handleClearCanvas = () => {
    clearCanvas()
    if (channelRef.current) {
      channelRef.current.publish('clear', { userId })
    }
    saveCanvasState()
  }

  const handleColorChange = (newColor: string) => {
    setColor(newColor)
    setIsEraser(false)
    setColorHistory((prev: string[]) => {
      const filtered = prev.filter((c: string) => c !== newColor)
      return [newColor, ...filtered].slice(0, 4)
    })
  }

  return (
    <div className="fixed inset-0 w-screen h-screen overflow-hidden">
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
      <CanvasControls
        color={color}
        colorHistory={colorHistory}
        isEraser={isEraser}
        panMode={panMode}
        connected={connected}
        userCount={userCount}
        scale={scale}
        onColorChange={handleColorChange}
        onSelectBrush={() => { setIsEraser(false); setPanMode(false) }}
        onSelectEraser={() => { setIsEraser(true); setPanMode(false) }}
        onTogglePanMode={() => { setPanMode(!panMode); setIsEraser(false) }}
      />
    </div>
  )
}

export default Canvas
