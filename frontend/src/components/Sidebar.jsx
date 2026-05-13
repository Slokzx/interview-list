import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useTheme } from '../hooks/useTheme'

const TOP_ITEMS = [
  { to: '/chat', icon: 'auto_awesome', label: 'Research Emails' },
]

const RESEARCH_ITEMS = [
  { to: '/dashboard', icon: 'grid_view',    label: 'Applications' },
  { to: '/receipts',  icon: 'receipt_long', label: 'Receipts' },
]

export default function Sidebar() {
  const [open, setOpen] = useState(() => {
    const stored = localStorage.getItem('sidebar-open')
    return stored === null ? true : stored === 'true'
  })
  const { user, signOut } = useAuth()
  const { theme, toggleTheme } = useTheme()

  function toggle() {
    const next = !open
    setOpen(next)
    localStorage.setItem('sidebar-open', String(next))
  }

  return (
    <aside
      className={`${open ? 'w-52' : 'w-14'} transition-[width] duration-200 ease-in-out shrink-0 flex flex-col h-screen sticky top-0 bg-nav border-r border-outline-variant/30 z-30`}
    >
      {/* Logo + toggle */}
      <div className="flex items-center h-14 px-3 gap-2 border-b border-outline-variant/30 shrink-0">
        {open && (
          <span className="font-display text-base font-bold tracking-tight text-primary-container flex-1 overflow-hidden whitespace-nowrap">
            Track
          </span>
        )}
        <button
          onClick={toggle}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-outline hover:text-on-surface transition-colors shrink-0"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
            {open ? 'menu_open' : 'menu'}
          </span>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 flex flex-col gap-0.5 overflow-hidden">

        {/* Top-level items */}
        {TOP_ITEMS.map(({ to, icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-2.5 py-2.5 rounded-lg transition-all ${
                isActive
                  ? 'bg-primary-container/15 text-primary-container'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-primary-container/5'
              }`
            }
          >
            <span className="material-symbols-outlined shrink-0" style={{ fontSize: 18 }}>{icon}</span>
            {open && (
              <span className="font-display font-bold uppercase tracking-widest text-[10px] whitespace-nowrap">
                {label}
              </span>
            )}
          </NavLink>
        ))}

        {/* Divider before Research section */}
        <div className="h-px bg-outline-variant/20 mx-1 my-1" />

        {/* Research section label */}
        {open && (
          <p className="px-2.5 pt-2 pb-1 font-display font-bold uppercase tracking-widest text-[9px] text-outline select-none">
            Research
          </p>
        )}
        {!open && (
          <div className="h-px bg-outline-variant/20 mx-2 my-1" />
        )}

        {RESEARCH_ITEMS.map(({ to, icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-2.5 py-2.5 rounded-lg transition-all ${
                isActive
                  ? 'bg-primary-container/15 text-primary-container'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-primary-container/5'
              } ${open ? 'pl-4' : ''}`
            }
          >
            <span className="material-symbols-outlined shrink-0" style={{ fontSize: 18 }}>{icon}</span>
            {open && (
              <span className="font-display font-bold uppercase tracking-widest text-[10px] whitespace-nowrap">
                {label}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom section */}
      <div className="p-2 border-t border-outline-variant/30 flex flex-col gap-0.5 shrink-0">
        <button
          onClick={toggleTheme}
          className="flex items-center gap-3 px-2.5 py-2.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-primary-container/5 transition-all"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          <span className="material-symbols-outlined shrink-0" style={{ fontSize: 18 }}>
            {theme === 'dark' ? 'light_mode' : 'dark_mode'}
          </span>
          {open && (
            <span className="font-display font-bold uppercase tracking-widest text-[10px] whitespace-nowrap">
              {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
            </span>
          )}
        </button>

        <div className={`flex items-center gap-2.5 px-2.5 py-2 ${!open ? 'justify-center' : ''}`}>
          {user?.user_metadata?.avatar_url
            ? <img src={user.user_metadata.avatar_url} alt="" className="w-6 h-6 rounded-full border border-outline-variant shrink-0" />
            : <div className="w-6 h-6 rounded-full bg-primary-container/20 flex items-center justify-center text-primary-container font-bold text-xs shrink-0">
                {(user?.email ?? '?')[0].toUpperCase()}
              </div>
          }
          {open && (
            <span className="text-xs text-on-surface-variant truncate flex-1">
              {user?.user_metadata?.full_name ?? user?.email}
            </span>
          )}
        </div>

        <button
          onClick={signOut}
          className="flex items-center gap-3 px-2.5 py-2.5 rounded-lg text-on-surface-variant hover:text-error transition-all"
          title="Sign out"
        >
          <span className="material-symbols-outlined shrink-0" style={{ fontSize: 16 }}>logout</span>
          {open && (
            <span className="font-display font-bold uppercase tracking-widest text-[10px] whitespace-nowrap">
              Sign Out
            </span>
          )}
        </button>
      </div>
    </aside>
  )
}
