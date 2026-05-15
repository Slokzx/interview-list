import { createContext, useContext, useState, useCallback } from 'react'

const Ctx = createContext(null)
// eslint-disable-next-line react-refresh/only-export-components
export const useMobileSidebar = () => useContext(Ctx)

export function MobileSidebarProvider({ children }) {
  const [open, setOpen] = useState(false)
  const toggle = useCallback(() => setOpen(o => !o), [])
  const close  = useCallback(() => setOpen(false), [])
  return <Ctx.Provider value={{ open, toggle, close }}>{children}</Ctx.Provider>
}
