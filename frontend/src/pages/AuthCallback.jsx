import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function AuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    let done = false
    const finish = (session) => {
      if (done) return
      done = true
      if (session) navigate('/chat', { replace: true })
      else navigate('/login', { replace: true })
    }

    // Handle both INITIAL_SESSION (first load) and SIGNED_IN (after code exchange)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
        finish(session)
      }
    })

    // Also try exchanging the code directly from the URL (PKCE flow)
    const code = new URLSearchParams(window.location.search).get('code')
    if (code) {
      supabase.auth.exchangeCodeForSession(code)
        .then(({ data }) => finish(data.session))
        .catch(() => {}) // onAuthStateChange will handle it
    }

    // Fallback: if nothing resolves in 15 s, give up
    const timeout = setTimeout(() => finish(null), 15_000)

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
