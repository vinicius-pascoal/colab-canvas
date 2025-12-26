import express, { Request, Response } from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import Ably from 'ably'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001
const ABLY_API_KEY = process.env.ABLY_API_KEY

if (!ABLY_API_KEY) {
  console.error('ABLY_API_KEY não configurada no arquivo .env')
  process.exit(1)
}

// Inicializar Ably
const ably = new Ably.Rest({ key: ABLY_API_KEY })

// Configurar origens permitidas para CORS
const allowedOrigins = [
  'http://localhost:3000',
  'https://colab-canvas.vercel.app',
  process.env.CORS_ORIGIN,
].filter(Boolean)

// Middlewares
app.use(cors({
  origin: (origin, callback) => {
    // Permitir requisições sem origin (mobile apps, Postman, etc)
    if (!origin) return callback(null, true)

    if (allowedOrigins.includes(origin)) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  },
  credentials: true,
}))
app.use(express.json({ limit: '50mb' }))

// Armazenar estado do canvas em memória (em produção, use Redis ou banco de dados)
let canvasState: string | null = null

// Rotas
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Endpoint para salvar o estado do canvas
app.post('/canvas/save', (req: Request, res: Response) => {
  try {
    const { canvasData } = req.body

    if (!canvasData) {
      return res.status(400).json({ error: 'canvasData é obrigatório' })
    }

    canvasState = canvasData
    console.log('✅ Estado do canvas salvo')
    res.json({ success: true, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Erro ao salvar canvas:', error)
    res.status(500).json({ error: 'Erro ao salvar canvas' })
  }
})

// Endpoint para carregar o estado do canvas
app.get('/canvas/load', (req: Request, res: Response) => {
  res.json({ canvasData: canvasState, timestamp: new Date().toISOString() })
})

// Endpoint para gerar token Ably (opcional, para maior segurança)
app.post('/auth/token', async (req: Request, res: Response) => {
  try {
    const { clientId } = req.body

    if (!clientId) {
      return res.status(400).json({ error: 'clientId é obrigatório' })
    }

    const tokenRequest = await ably.auth.createTokenRequest({
      clientId,
      capability: {
        'canvas-draw': ['publish', 'subscribe', 'presence'],
      },
    })

    res.json(tokenRequest)
  } catch (error) {
    console.error('Erro ao gerar token:', error)
    res.status(500).json({ error: 'Erro ao gerar token' })
  }
})

// Endpoint para obter estatísticas do canvas
app.get('/canvas/stats', (req: Request, res: Response) => {
  res.json({
    status: 'active',
    channel: 'canvas-draw',
    timestamp: new Date().toISOString(),
  })
})

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`)
  console.log(`📡 Ably configurado e pronto`)
})

export default app
