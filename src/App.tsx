import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/context/AuthProvider'
import { ThemeProvider } from '@/context/ThemeProvider'
import { AppShell } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/button'
import { Login } from '@/pages/Login'
import { SettingsPage } from '@/pages/settings/SettingsPage'
import { InboxPage } from '@/pages/InboxPage'
import { MonthPage } from '@/pages/month/MonthPage'
import { TransactionsPage } from '@/pages/TransactionsPage'
import { TripDetailPage } from '@/pages/trips/TripDetailPage'
import { TripsPage } from '@/pages/trips/TripsPage'

function FullScreenMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-4 p-4 text-center text-sm text-muted-foreground">
      {children}
    </div>
  )
}

/** Signed in with Google, but not one of the two members (e.g. removed from the list). */
function NotMember() {
  const { user, signOut } = useAuth()
  return (
    <FullScreenMessage>
      <p>
        <span className="font-medium text-foreground">{user?.email}</span> isn't on Chanda's members list.
      </p>
      <Button variant="outline" onClick={() => signOut()}>
        Sign out
      </Button>
    </FullScreenMessage>
  )
}

function Gate() {
  const { status } = useAuth()
  if (status === 'loading') return <FullScreenMessage>Loading…</FullScreenMessage>
  if (status === 'signed_out') return <Login />
  if (status === 'not_member') return <NotMember />

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<MonthPage />} />
        <Route path="/inbox" element={<InboxPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/trips" element={<TripsPage />} />
        <Route path="/trips/:id" element={<TripDetailPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Gate />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  )
}
