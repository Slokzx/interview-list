import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { GlassCard, Button, Input, Divider } from '../ui'
import { useAuth } from '../hooks/useAuth'
import { useTheme } from '../hooks/useTheme'

export default function Login() {
  const { user, loading, signInWithGoogle } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  if (loading) return null
  if (user) return <Navigate to="/dashboard" replace />

  function handleSubmit(e) {
    e.preventDefault()
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background font-sans text-on-background">

      {/* Subtle accent blobs — visible in both themes */}
      <div className="fixed inset-0 z-0 pointer-events-none opacity-30">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-primary-container/20 blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-secondary-container/20 blur-[120px]" />
      </div>

      {/* Header */}
      <header className="fixed top-0 w-full z-50 flex justify-between items-center h-16 px-6 md:px-12 bg-login-header backdrop-blur-xl border-b border-outline-variant/30">
        <span className="font-display text-2xl font-bold tracking-tight text-primary-container">
          Track
        </span>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="w-8 h-8 rounded-lg glass-l1 border border-outline-variant/40 flex items-center justify-center text-outline hover:text-primary-container hover:border-primary-container/40 transition-all active:scale-95"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              {theme === 'dark' ? 'light_mode' : 'dark_mode'}
            </span>
          </button>
          <a href="#" className="font-display text-sm font-medium text-on-surface-variant hover:text-primary-container transition-colors duration-300">
            Support
          </a>
        </div>
      </header>

      {/* Card */}
      <main className="relative z-10 min-h-screen flex items-center justify-center px-6 py-24">
        <GlassCard glow className="w-full max-w-[440px] flex flex-col gap-6 p-12">

          <div className="text-center space-y-1">
            <h1 className="font-display text-3xl font-semibold tracking-tight text-on-surface">
              Welcome Back
            </h1>
            <p className="text-sm text-on-surface-variant font-sans">
              Track your job applications in one place.
            </p>
          </div>

          {/* Google */}
          <button
            onClick={signInWithGoogle}
            className="w-full flex items-center justify-center gap-3 glass-l2 hover:bg-primary-container/10 transition-all duration-300 py-4 rounded-lg active:scale-95 group"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.47 2.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            <span className="font-display font-bold uppercase tracking-widest text-[11px] text-on-surface group-hover:text-primary-container transition-colors">
              Continue with Google
            </span>
          </button>

          <Divider label="Or" />

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <Input
              label="Email Address"
              icon="mail"
              type="email"
              placeholder="name@domain.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              label="Password"
              hint="Forgot?"
              icon="lock"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <Button type="submit" variant="primary" className="w-full mt-1">
              Sign In
            </Button>
          </form>

          <p className="text-center text-sm text-on-surface-variant">
            Don&apos;t have an account?{' '}
            <a href="#" className="text-primary-container font-bold hover:opacity-80 transition-opacity ml-1">
              Sign Up
            </a>
          </p>
        </GlassCard>
      </main>

      {/* System status */}
      <div className="fixed bottom-0 left-0 p-6 z-20 hidden md:flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-primary-container animate-pulse" />
        <span className="font-display font-bold uppercase tracking-widest text-[10px] text-outline">
          System Online
        </span>
      </div>

      {/* Footer */}
      <footer className="fixed bottom-0 w-full py-6 z-20 flex flex-col md:flex-row justify-center items-center gap-4 md:gap-8">
        <div className="flex gap-6">
          {['Privacy', 'Terms', 'Contact'].map((l) => (
            <a key={l} href="#" className="font-display text-xs text-outline hover:text-primary-container transition-colors">
              {l}
            </a>
          ))}
        </div>
        <span className="font-display text-xs text-outline">© 2024 Track. All rights reserved.</span>
      </footer>
    </div>
  )
}
