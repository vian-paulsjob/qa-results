import { Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'

type ThemeMode = 'light' | 'dark'
const THEME_STORAGE_KEY = 'theme'

function resolveInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') {
    return 'light'
  }

  const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') {
    return stored
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(mode: ThemeMode) {
  document.documentElement.classList.toggle('dark', mode === 'dark')
  document.documentElement.style.colorScheme = mode
}

export default function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>('light')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const initialTheme = resolveInitialTheme()
    setMode(initialTheme)
    applyTheme(initialTheme)
    setMounted(true)
  }, [])

  function toggleTheme() {
    const next = mode === 'dark' ? 'light' : 'dark'
    setMode(next)
    applyTheme(next)
    window.localStorage.setItem(THEME_STORAGE_KEY, next)
  }

  const label = mounted
    ? `Switch to ${mode === 'dark' ? 'light' : 'dark'} mode`
    : 'Toggle theme'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      className={`relative inline-flex h-10 w-[4.75rem] items-center rounded-full p-1 transition-colors duration-250 ${
        mode === 'dark'
          ? 'bg-[#1f2024] shadow-[inset_0_1px_2px_rgba(255,255,255,0.05),0_8px_18px_rgba(0,0,0,0.26)]'
          : 'bg-[#e9e9ea] shadow-[inset_0_1px_2px_rgba(0,0,0,0.08),0_8px_18px_rgba(0,0,0,0.12)]'
      }`}
    >
      <span
        className={`absolute top-1 h-8 w-8 rounded-full transition-transform duration-250 ${
          mode === 'dark'
            ? 'translate-x-1 bg-[#f4f4f5] shadow-[0_2px_10px_rgba(0,0,0,0.34)]'
            : 'translate-x-[2.25rem] bg-[#232429] shadow-[0_2px_10px_rgba(0,0,0,0.35)]'
        }`}
        aria-hidden="true"
      />
      {mode === 'light' ? (
        <span className="absolute top-1 left-1 z-10 flex h-8 w-8 items-center justify-center">
          <Sun className="size-[0.95rem] text-[#111317]" />
        </span>
      ) : (
        <span className="absolute top-1 right-1 z-10 flex h-8 w-8 items-center justify-center">
          <Moon className="size-[0.95rem] text-[#f6f7fb]" />
        </span>
      )}
    </button>
  )
}
