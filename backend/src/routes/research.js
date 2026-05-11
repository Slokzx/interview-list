import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'

const router = Router()

function clientForReq(req) {
  const token = req.headers.authorization?.split(' ')[1]
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
}

router.get('/', async (req, res) => {
  const { data, error } = await clientForReq(req)
    .from('research')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.post('/', async (req, res) => {
  const { company, role, interview_round, topics, notes, status } = req.body
  const { data: { user } } = await clientForReq(req).auth.getUser()
  const { data, error } = await clientForReq(req)
    .from('research')
    .insert({ user_id: user.id, company, role, interview_round, topics, notes, status })
    .select()
    .single()
  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

router.patch('/:id', async (req, res) => {
  const { data, error } = await clientForReq(req)
    .from('research')
    .update(req.body)
    .eq('id', req.params.id)
    .select()
    .single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.delete('/:id', async (req, res) => {
  const { error } = await clientForReq(req).from('research').delete().eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

export default router
