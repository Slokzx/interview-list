import { Router } from 'express'
import { parseEmail } from '../services/emailParser.js'

const router = Router()

router.post('/', (req, res) => {
  const { subject, body, senderDomain } = req.body
  if (!subject && !body) {
    return res.status(400).json({ error: 'subject or body required' })
  }
  const result = parseEmail({ subject, body, senderDomain })
  res.json(result)
})

export default router
