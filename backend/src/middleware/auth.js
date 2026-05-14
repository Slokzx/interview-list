import { createClient } from '@supabase/supabase-js'

// Admin client used ONLY for token verification — never for data queries
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/**
 * Verifies the Supabase JWT in the Authorization header.
 * On success, attaches `req.user` (the Supabase user object) to the request.
 * Rejects with 401 if the token is missing, expired, or tampered.
 */
export async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
    if (error || !user) return res.status(401).json({ error: 'Unauthorized' })
    req.user = user   // { id, email, ... }
    next()
  } catch {
    res.status(401).json({ error: 'Unauthorized' })
  }
}
