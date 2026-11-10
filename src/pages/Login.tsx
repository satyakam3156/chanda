import { useState } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { Logo } from '@/components/Logo'

/**
 * Supabase sends sign-in errors back in the URL (query or hash).
 * The allowlist trigger shows up as a generic "Database error saving new user".
 */
function readRedirectError(): string | null {
  const params = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const raw = params.get('error_description') ?? hash.get('error_description')
  if (!raw) return null
  window.history.replaceState(null, '', window.location.pathname)
  if (/database error saving new user/i.test(raw)) {
    return "This Google account isn't allowed to use Chanda."
  }
  return raw
}

export function Login({ notice }: { notice?: string }) {
  const [error, setError] = useState<string | null>(() => notice ?? readRedirectError())
  const [busy, setBusy] = useState(false)

  async function signInWithGoogle() {
    setError(null)
    setBusy(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    // On success the browser leaves for Google, so we only get here on failure.
    if (error) {
      setError(error.message)
      setBusy(false)
    }
  }

  return (
    <div className="relative flex min-h-full items-center justify-center overflow-hidden bg-gradient-to-br from-[#1f1630] via-[#171a2e] to-[#0f1424] p-4 text-white">
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -left-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-amber-400/35 blur-[120px]"
        animate={{ x: [0, 50, -20, 0], y: [0, 40, 70, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -right-24 h-[30rem] w-[30rem] rounded-full bg-rose-400/30 blur-[130px]"
        animate={{ x: [0, -50, 30, 0], y: [0, -30, -60, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
      />

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center shadow-[0_0_60px_-15px_rgba(251,113,133,0.4)] backdrop-blur-xl"
      >
        <Logo className="mx-auto mb-3 h-14 w-14" />
        <h1 className="text-2xl font-bold tracking-tight">Chanda</h1>
        <p className="mt-1 text-sm text-white/50">Our shared expenses, settled every month</p>

        <button
          type="button"
          onClick={signInWithGoogle}
          disabled={busy}
          className="mt-8 flex h-11 w-full items-center justify-center gap-3 rounded-lg bg-white text-sm font-semibold text-[#1f1630] transition hover:bg-white/90 disabled:opacity-60"
        >
          <GoogleIcon />
          {busy ? 'Opening Google…' : 'Continue with Google'}
        </button>

        {error && <p className="mt-4 text-sm text-rose-300">{error}</p>}

        <p className="mt-6 text-xs text-white/35">Only the two of us can sign in.</p>
      </motion.div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}
