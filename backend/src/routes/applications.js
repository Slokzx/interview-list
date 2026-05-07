import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'

const router = Router()

// Create a per-request Supabase client that uses the user's JWT so RLS applies
function clientForReq(req) {
  const token = req.headers.authorization?.split(' ')[1]
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
}

router.get('/', async (req, res) => {
  const { data, error } = await clientForReq(req)
    .from('applications')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.post('/', async (req, res) => {
  const { company, role, stage, notes } = req.body
  const { data, error } = await clientForReq(req)
    .from('applications')
    .insert({ company, role, stage: stage ?? 'Applied', notes })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

router.patch('/:id', async (req, res) => {
  const { id } = req.params
  const { data, error } = await clientForReq(req)
    .from('applications')
    .update(req.body)
    .eq('id', id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.delete('/:id', async (req, res) => {
  const { id } = req.params
  const { error } = await clientForReq(req).from('applications').delete().eq('id', id)
  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

export default router
