import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Member } from '@/types/database'

type AuthStatus = 'loading' | 'signed_out' | 'not_member' | 'ready'

type AuthContextValue = {
  status: AuthStatus
  session: Session | null
  user: User | null
  /** The signed-in person's members row. Set only when status is 'ready'. */
  member: Member | null
  /** Both members, so pages can show "you" and "her" by name. */
  members: Member[]
  /** Re-read the members list, e.g. after a rename. */
  reloadMembers: () => void
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoaded, setSessionLoaded] = useState(false)
  // Members list tagged with the user it was fetched for, so a stale list
  // never shows after switching accounts.
  const [loaded, setLoaded] = useState<{ userId: string; members: Member[] } | null>(null)
  const [membersVersion, setMembersVersion] = useState(0)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setSessionLoaded(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      // Keep the same reference when the token is unchanged so tab-focus token
      // refreshes don't churn the user object and trigger a refetch.
      setSession((prev) => (prev?.access_token === s?.access_token ? prev : s))
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id ?? null

  // Load the members list once per signed-in user. Row Level Security returns
  // nothing unless this user is one of the two members.
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    supabase
      .from('members')
      .select('*')
      .order('created_at')
      .then(({ data, error }) => {
        if (cancelled) return
        setLoaded({ userId, members: error ? [] : (data ?? []) })
      })
    return () => {
      cancelled = true
    }
  }, [userId, membersVersion])

  const members = loaded && loaded.userId === userId ? loaded.members : null
  const member = members?.find((m) => m.user_id === userId) ?? null

  let status: AuthStatus
  if (!sessionLoaded) status = 'loading'
  else if (!session) status = 'signed_out'
  else if (members === null) status = 'loading'
  else status = member ? 'ready' : 'not_member'

  const value: AuthContextValue = {
    status,
    session,
    user: session?.user ?? null,
    member,
    members: members ?? [],
    reloadMembers: () => setMembersVersion((v) => v + 1),
    signOut: async () => {
      await supabase.auth.signOut()
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
