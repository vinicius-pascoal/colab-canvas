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

// Nome do canal Ably para persistência
const CANVAS_STATE_CHANNEL = 'canvas-state'

// Rotas
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Endpoint para salvar o estado do canvas usando Ably
app.post('/canvas/save', async (req: Request, res: Response) => {
  try {
    console.log('🔵 Recebendo requisição para salvar canvas...')
    const { canvasData } = req.body

    if (!canvasData) {
      console.error('❌ canvasData não fornecido')
      return res.status(400).json({ error: 'canvasData é obrigatório' })
    }

    // Usar Ably para persistir o estado
    const channel = ably.channels.get(CANVAS_STATE_CHANNEL)
    await channel.publish('state', { canvasData, timestamp: new Date().toISOString() })

    console.log('✅ Estado do canvas salvo no Ably')
    res.json({ success: true, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('❌ Erro ao salvar canvas:', error)
    res.status(500).json({ error: 'Erro ao salvar canvas' })
  }
})

// Endpoint para carregar o estado do canvas usando Ably
app.get('/canvas/load', async (req: Request, res: Response) => {
  try {
    console.log('🔵 Recebendo requisição para carregar canvas...')
    // Buscar histórico do canal Ably
    const channel = ably.channels.get(CANVAS_STATE_CHANNEL)
    const history = await channel.history({ limit: 1 })

    if (history.items.length > 0) {
      const latestState = history.items[0].data
      console.log('✅ Canvas carregado do histórico Ably')
      res.json({
        canvasData: latestState.canvasData,
        timestamp: latestState.timestamp
      })
    } else {
      console.log('ℹ️ Nenhum estado salvo encontrado')
      res.json({ canvasData: null, timestamp: new Date().toISOString() })
    }
  } catch (error) {
    console.error('❌ Erro ao carregar canvas:', error)
    res.json({ canvasData: null, timestamp: new Date().toISOString() })
  }
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
