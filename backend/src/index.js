import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import applicationsRouter from './routes/applications.js'
import parseEmailRouter from './routes/parseEmail.js'
import syncRouter from './routes/sync.js'
import enrichRouter from './routes/enrich.js'

const app = express()
const PORT = process.env.PORT ?? 3001

app.use(cors({ origin: 'http://localhost:5173' }))
app.use(express.json())

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))
app.use('/api/applications', applicationsRouter)
app.use('/api/parse-email', parseEmailRouter)
app.use('/api/sync', syncRouter)
app.use('/api/enrich', enrichRouter)

app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`))
