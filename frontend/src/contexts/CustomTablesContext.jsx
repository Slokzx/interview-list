import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

const CustomTablesCtx = createContext({ tables: [], refetch: () => {} })

export function CustomTablesProvider({ children }) {
  const { user } = useAuth()
  const [tables, setTables] = useState([])

  const refetch = useCallback(async () => {
    if (!user) { setTables([]); return }
    const { data } = await supabase
      .from('custom_tables')
      .select('id, name, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    setTables(data ?? [])
  }, [user])

  useEffect(() => { refetch() }, [refetch])

  return (
    <CustomTablesCtx.Provider value={{ tables, refetch }}>
      {children}
    </CustomTablesCtx.Provider>
  )
}

export const useCustomTables = () => useContext(CustomTablesCtx)
