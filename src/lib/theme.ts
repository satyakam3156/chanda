export type Theme = 'light' | 'dark'

export function effectiveTheme(): Theme {
  const attr = document.documentElement.getAttribute('data-theme')
  if (attr === 'light' || attr === 'dark') return attr
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applySavedTheme() {
  try {
    const t = localStorage.getItem('ft_theme')
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t)
  } catch {
    /* ignore */
  }
}

export function toggleTheme(): Theme {
  const next: Theme = effectiveTheme() === 'dark' ? 'light' : 'dark'
  document.documentElement.setAttribute('data-theme', next)
  try {
    localStorage.setItem('ft_theme', next)
  } catch {
    /* ignore */
  }
  return next
}
