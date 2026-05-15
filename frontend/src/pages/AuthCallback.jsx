import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function AuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    let done = false

    const go = (path) => {
      if (done) return
      done = true
      navigate(path, { replace: true })
    }

    // Supabase v2 automatically detects the code/token in the URL and fires
    // SIGNED_IN once the PKCE exchange completes. We just wait for it.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        go('/chat')
      }
    })

    // Poll getSession every 500 ms — catches cases where SIGNED_IN already
    // fired before our listener was attached (race on fast connections).
    const poll = setInterval(async () => {
      const { data } = await supabase.auth.getSession()
      if (data.session) {
        clearInterval(poll)
        go('/chat')
      }
    }, 500)

    // Give up after 20 s and send back to login
    const timeout = setTimeout(() => {
      clearInterval(poll)
      go('/login')
    }, 20_000)

    return () => {
      subscription.unsubscribe()
      clearInterval(poll)
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
