import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/context/ThemeProvider'

export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  return (
    <Button variant="outline" size="icon" aria-label="Toggle theme" onClick={toggle}>
      {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  )
}
