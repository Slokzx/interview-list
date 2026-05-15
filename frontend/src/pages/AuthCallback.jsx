import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function AuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    // Wait for Supabase to finish the PKCE code exchange and fire SIGNED_IN.
    // Calling getSession() immediately races with the async code exchange and
    // returns null before the session is stored — causing a false redirect to /login.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        navigate('/chat', { replace: true })
      } else if (event === 'SIGNED_OUT') {
        navigate('/login', { replace: true })
      }
    })

    // In case the session is already established (e.g. refresh / re-visit)
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate('/chat', { replace: true })
    })

    // Safety fallback — if neither fires within 10 s, go back to login
    const timeout = setTimeout(() => navigate('/login', { replace: true }), 10_000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [navigate])

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 rounded-full liquid-neon animate-spin" style={{ animationDuration: '1s' }} />
        <p className="font-display text-xs uppercase tracking-widest text-on-surface-variant">
          Signing you in…
        </p>
      </div>
    </div>
  )
}
