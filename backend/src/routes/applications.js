import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'

const router = Router()

// Admin client — service role key. RLS is bypassed, so every query MUST
// include an explicit .eq('user_id', req.user.id) filter. Never omit it.
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('applications')
    .select('*')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.post('/', async (req, res) => {
  const { company, role, stage, notes } = req.body
  const { data, error } = await supabase
    .from('applications')
    .insert({ user_id: req.user.id, company, role, stage: stage ?? 'Applied', notes })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

router.patch('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('applications')
    .update(req.body)
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)   // prevent patching another user's row
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.delete('/:id', async (req, res) => {
  const { error } = await supabase
    .from('applications')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)   // prevent deleting another user's row

  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

export default router
