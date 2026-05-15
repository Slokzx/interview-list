import './index.css'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { CustomTablesProvider } from './contexts/CustomTablesContext'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import AuthCallback from './pages/AuthCallback'
import Receipts from './pages/Receipts'
import Chat from './pages/Chat'
import ResearchTable from './pages/ResearchTable'
import Sidebar from './components/Sidebar'

const OWNER_EMAIL = 'slokshah92@gmail.com'

function ProtectedLayout({ children, ownerOnly = false }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  // Pages marked ownerOnly redirect everyone else to /chat
  if (ownerOnly && user.email !== OWNER_EMAIL) return <Navigate to="/chat" replace />
  return (
    <CustomTablesProvider>
      <div className="flex min-h-screen bg-background text-on-background font-sans">
        <Sidebar />
        <div className="flex-1 min-w-0 overflow-auto">
          {children}
        </div>
      </div>
    </CustomTablesProvider>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login"                element={<Login />} />
        <Route path="/auth/callback"        element={<AuthCallback />} />
        <Route path="/chat"                 element={<ProtectedLayout><Chat /></ProtectedLayout>} />
        <Route path="/dashboard"            element={<ProtectedLayout ownerOnly><Dashboard /></ProtectedLayout>} />
        <Route path="/receipts"             element={<ProtectedLayout ownerOnly><Receipts /></ProtectedLayout>} />
        <Route path="/research/:tableId"    element={<ProtectedLayout><ResearchTable /></ProtectedLayout>} />
        <Route path="*"                     element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
