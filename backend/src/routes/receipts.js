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
  const client = clientForReq(req)
  const PAGE   = 1000
  let all      = []
  let from     = 0

  // Paginate past Supabase's 1000-row default cap
  while (true) {
    const { data = [], error } = await client
      .from('receipts')
      .select('*')
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
  const { data: { user } } = await clientForReq(req).auth.getUser()
  const { data, error } = await clientForReq(req)
    .from('receipts')
    .insert({ user_id: user.id, company, description, amount, category, date, notes })
    .select()
    .single()
  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

router.patch('/:id', async (req, res) => {
  const { data, error } = await clientForReq(req)
    .from('receipts')
    .update(req.body)
    .eq('id', req.params.id)
    .select()
    .single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.delete('/:id', async (req, res) => {
  const { error } = await clientForReq(req).from('receipts').delete().eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

export default router
