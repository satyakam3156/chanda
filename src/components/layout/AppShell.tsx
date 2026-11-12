import { NavLink, useLocation, useOutlet } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { CalendarRange, Inbox, ListOrdered, LogOut, Plane, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Logo } from '@/components/Logo'
import { useAuth } from '@/context/AuthProvider'

const NAV = [
  { to: '/', label: 'Month', icon: CalendarRange },
  { to: '/inbox', label: 'Inbox', icon: Inbox },
  { to: '/transactions', label: 'Transactions', icon: ListOrdered },
  { to: '/trips', label: 'Trips', icon: Plane },
  { to: '/settings', label: 'Settings', icon: Settings },
] as const

/**
 * Desktop (lg+): fixed sidebar. Phone: bottom tab bar, since a phone is
 * where most quick checks will happen.
 */
export function AppShell() {
  const { member, signOut } = useAuth()
  const { pathname } = useLocation()
  const outlet = useOutlet()
  const title = NAV.find((n) => n.to === pathname || (n.to !== '/' && pathname.startsWith(n.to + '/')))?.label ?? 'Chanda'

  return (
    <div className="min-h-full">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border bg-card text-card-foreground lg:flex">
        <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-border px-5">
          <Logo className="h-8 w-8" />
          <span className="text-base font-bold tracking-tight">Chanda</span>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                )
              }
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-border p-3">
          <p className="truncate px-3 pb-2 text-xs text-muted-foreground">Signed in as {member?.display_name}</p>
          <button
            onClick={() => signOut()}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
          >
            <LogOut className="h-[18px] w-[18px] shrink-0" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      <div className="flex min-h-full flex-col lg:pl-60">
        <header className="sticky top-0 z-20 flex h-[calc(3.5rem+env(safe-area-inset-top))] shrink-0 items-center justify-between gap-3 border-b border-border bg-background/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur lg:h-16 lg:px-8 lg:pt-0">
          <div className="flex min-w-0 items-center gap-2.5">
            <Logo className="h-7 w-7 lg:hidden" />
            <h1 className="truncate text-lg font-semibold tracking-tight">{title}</h1>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="outline" size="icon" className="lg:hidden" aria-label="Sign out" onClick={() => signOut()}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {/* Bottom padding keeps content clear of the phone tab bar. */}
        <main className="flex-1 px-4 py-5 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:p-8">
          <div className="mx-auto max-w-[1100px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={pathname}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              >
                {outlet}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
        aria-label="Main"
      >
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'group flex min-w-0 flex-col items-center gap-0.5 pb-1.5 pt-2 text-[11px] font-medium transition-colors',
                isActive ? 'text-foreground' : 'text-muted-foreground',
              )
            }
          >
            {({ isActive }) => (
              <>
                <span className={cn('flex h-7 w-12 items-center justify-center rounded-full transition-colors', isActive && 'bg-accent')}>
                  <Icon className="h-5 w-5" />
                </span>
                <span className="max-w-full truncate px-0.5">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
