import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import rateLimit from 'express-rate-limit'

import applicationsRouter  from './routes/applications.js'
import parseEmailRouter    from './routes/parseEmail.js'
import syncRouter          from './routes/sync.js'
import enrichRouter        from './routes/enrich.js'
import researchRouter      from './routes/research.js'
import receiptsRouter      from './routes/receipts.js'
import syncReceiptsRouter  from './routes/syncReceipts.js'
import chatRouter          from './routes/chat.js'
import gmailSearchRouter   from './routes/gmailSearch.js'
import gmailStreamRouter   from './routes/gmailStream.js'

const app  = express()
const PORT = process.env.PORT ?? 3001
const isProd = process.env.NODE_ENV === 'production'

// ── Security headers ──────────────────────────────────────────
app.use(helmet())

// ── CORS ──────────────────────────────────────────────────────
const allowedOrigins = (process.env.FRONTEND_URL ?? 'http://localhost:5173')
  .split(',')
  .map(o => o.trim())

app.use(cors({
  origin: (origin, cb) => {
    // Allow server-to-server / curl in dev (no origin header)
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true)
    cb(new Error(`CORS: origin ${origin} not allowed`))
  },
  credentials: true,
}))

// ── Logging ───────────────────────────────────────────────────
app.use(morgan(isProd ? 'combined' : 'dev'))

// ── Body parsing ──────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }))

// ── Rate limiting ─────────────────────────────────────────────
// Chat: conversational — allow up to 30 messages per minute per user
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many messages — wait a moment and try again.' },
  standardHeaders: true,
  legacyHeaders: false,
})

// Sync/enrich: expensive one-shot operations — keep tight
const syncLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Too many sync requests — wait a minute and try again.' },
  standardHeaders: true,
  legacyHeaders: false,
})

// General API limit
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
})

app.use('/api', apiLimiter)
app.use('/api/sync', syncLimiter)
app.use('/api/sync-receipts', syncLimiter)
app.use('/api/enrich', syncLimiter)
app.use('/api/chat', chatLimiter)

// ── Routes ────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({
  status: 'ok',
  env: process.env.NODE_ENV ?? 'development',
  ts: new Date().toISOString(),
}))

app.use('/api/applications',  applicationsRouter)
app.use('/api/parse-email',   parseEmailRouter)
app.use('/api/sync',          syncRouter)
app.use('/api/enrich',        enrichRouter)
app.use('/api/research',      researchRouter)
app.use('/api/receipts',      receiptsRouter)
app.use('/api/sync-receipts', syncReceiptsRouter)
app.use('/api/chat',          chatRouter)
app.use('/api/gmail-search', gmailSearchRouter)
app.use('/api/gmail-stream', gmailStreamRouter)

// ── 404 ───────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Not found' }))

// ── Global error handler ──────────────────────────────────────
app.use((err, _req, res, _next) => {
  const status = err.status ?? err.statusCode ?? 500
  const message = isProd && status === 500 ? 'Internal server error' : err.message
  if (status >= 500) console.error(err)
  res.status(status).json({ error: message })
})

// ── Start ─────────────────────────────────────────────────────
const server = app.listen(PORT, () =>
  console.log(`Backend running on port ${PORT} [${process.env.NODE_ENV ?? 'development'}]`)
)

// ── Graceful shutdown ─────────────────────────────────────────
function shutdown(signal) {
  console.log(`\nReceived ${signal} — shutting down gracefully…`)
  server.close(() => {
    console.log('HTTP server closed.')
    process.exit(0)
  })
  // Force-kill if shutdown takes too long
  setTimeout(() => process.exit(1), 10_000)
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT',  () => shutdown('SIGINT'))
