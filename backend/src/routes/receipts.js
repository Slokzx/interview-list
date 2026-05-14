import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'

const router = Router()

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

router.get('/', async (req, res) => {
  const PAGE = 1000
  let all    = []
  let from   = 0

  while (true) {
    const { data = [], error } = await supabase
      .from('receipts')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE - 1)

    if (error) return res.status(500).json({ error: error.message })
    all.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }

  res.json(all)
})

router.post('/', async (req, res) => {
  const { company, description, amount, category, date, notes } = req.body
  const { data, error } = await supabase
    .from('receipts')
    .insert({ user_id: req.user.id, company, description, amount, category, date, notes })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

router.patch('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('receipts')
    .update(req.body)
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.delete('/:id', async (req, res) => {
  const { error } = await supabase
    .from('receipts')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)

  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

export default router
