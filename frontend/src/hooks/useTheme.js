import { useState, useEffect } from 'react'

const KEY = 'track-theme'

function getInitial() {
  const stored = localStorage.getItem(KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function useTheme() {
  const [theme, setTheme] = useState(getInitial)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(KEY, theme)
  }, [theme])

  function toggleTheme() {
    setTheme(t => (t === 'dark' ? 'light' : 'dark'))
  }

  return { theme, toggleTheme }
}
