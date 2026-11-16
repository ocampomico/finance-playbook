import { useEffect, useState } from 'react'
import { StoreProvider, useStore } from './state'
import { Disclaimer } from './ui'
import { Budget } from './views/Budget'
import { Data } from './views/Data'
import { Paycheck } from './views/Paycheck'
import { Payday } from './views/Payday'
import { Playbook } from './views/Playbook'
import { Projection } from './views/Projection'

const TABS = [
  { id: 'pay', label: 'Paycheck', blurb: 'What you take home after taxes and deductions.' },
  { id: 'playbook', label: 'Playbook', blurb: 'Where you are in the order of operations, and what your next dollar should do.' },
  { id: 'budget', label: 'Budget', blurb: 'Your monthly take-home, split by percentage.' },
  { id: 'payday', label: 'Payday', blurb: 'Move money the same way every time you get paid.' },
  { id: 'projection', label: 'Projection', blurb: 'How much you could have, and by what age, if you follow the plan.' },
  { id: 'data', label: 'Data', blurb: 'Export, import, or delete your data, and see the tax tables in use.' },
] as const

export type TabId = (typeof TABS)[number]['id']

const tabFromHash = (): TabId => TABS.find((t) => `#${t.id}` === window.location.hash)?.id ?? 'pay'

type Theme = 'light' | 'dark'
const THEME_KEY = 'finance-playbook:theme'

function loadTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

/** Erases everything stored in this browser, after an inline confirmation. */
function ResetData() {
  const { reset } = useStore()
  const [confirming, setConfirming] = useState(false)
  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className="min-h-10 rounded-lg px-3 text-left text-sm text-muted hover:text-ink">
        Reset data
      </button>
    )
  }
  return (
    <div role="alertdialog" aria-label="Reset all data" className="absolute inset-x-4 top-14 z-30 rounded-lg border border-line bg-card p-3 text-sm shadow-sm lg:static lg:mx-0">
      <p className="font-medium">Erase everything?</p>
      <p className="mt-1 text-[13px] text-muted">All numbers, line items, and payday history in this browser are deleted. This cannot be undone.</p>
      <div className="mt-3 flex flex-wrap gap-2 whitespace-nowrap">
        <button
          type="button"
          className="min-h-9 rounded-lg border border-warn px-3 font-medium text-warn"
          onClick={() => {
            reset()
            setConfirming(false)
          }}
        >
          Yes, reset
        </button>
        <button type="button" autoFocus className="min-h-9 rounded-lg border border-line px-3" onClick={() => setConfirming(false)}>
          Cancel
        </button>
      </div>
    </div>
  )
}

export default function App() {
  const [tab, setTab] = useState<TabId>(tabFromHash)
  const [theme, setTheme] = useState<Theme>(loadTheme)
  const active = TABS.find((t) => t.id === tab) ?? TABS[0]

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      // Storage unavailable: the choice lasts for this session only.
    }
  }, [theme])

  useEffect(() => {
    const onHash = () => {
      setTab(tabFromHash())
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const goTo = (id: TabId) => {
    window.location.hash = id
    setTab(id)
    window.scrollTo({ top: 0 })
  }

  return (
    <StoreProvider>
      <div className="mx-auto max-w-[88rem] px-4 sm:px-6 lg:grid lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-10 lg:px-8">
        {/* Sidebar on desktop; on phones a top bar plus a bottom tab bar. */}
        <aside className="relative flex items-center justify-between gap-1 py-4 lg:sticky lg:top-0 lg:h-dvh lg:flex-col lg:items-stretch lg:justify-start lg:py-8">
          <p className="mr-auto text-[15px] font-semibold tracking-tight lg:mr-0 lg:px-3">Finance Playbook</p>
          <nav
            aria-label="Sections"
            className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-card pb-[env(safe-area-inset-bottom)] lg:static lg:mt-8 lg:border-0 lg:bg-transparent lg:pb-0"
          >
            <ul className="flex lg:flex-col lg:gap-0.5">
              {TABS.map((t) => {
                const on = t.id === tab
                return (
                  <li key={t.id} className="min-w-0 flex-1 lg:flex-none">
                    <a
                      href={`#${t.id}`}
                      aria-current={on ? 'page' : undefined}
                      onClick={(e) => {
                        e.preventDefault()
                        goTo(t.id)
                      }}
                      className={`flex min-h-14 items-center justify-center border-t-2 text-[11px] lg:min-h-0 lg:justify-start lg:rounded-lg lg:border-0 lg:px-3 lg:py-2 lg:text-sm ${
                        on ? 'border-ink font-semibold text-ink lg:bg-accent-soft lg:font-medium' : 'border-transparent text-muted hover:text-ink'
                      }`}
                    >
                      {t.label}
                    </a>
                  </li>
                )
              })}
            </ul>
          </nav>
          <div className="lg:mt-auto lg:flex lg:flex-col">
            <ResetData />
          </div>
          <button
            type="button"
            role="switch"
            aria-label="Dark mode"
            aria-checked={theme === 'dark'}
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="flex min-h-10 items-center gap-2.5 rounded-lg px-3 text-sm text-muted hover:text-ink"
          >
            <span aria-hidden="true" className={`relative h-5 w-9 rounded-full border transition-colors ${theme === 'dark' ? 'border-ink bg-ink' : 'border-field bg-card'}`}>
              <span className={`absolute top-0.5 size-3.5 rounded-full transition-all ${theme === 'dark' ? 'left-[18px] bg-paper' : 'left-0.5 bg-field'}`} />
            </span>
            <span className="hidden sm:inline">Dark mode</span>
          </button>
        </aside>

        <div className="min-w-0 pt-2 pb-28 lg:py-8">
          <header className="mb-6">
            <h1 className="text-2xl font-semibold tracking-tight">{active.label}</h1>
            <p className="mt-1 text-sm text-muted">{active.blurb}</p>
          </header>

          <main>
            {tab === 'pay' && <Paycheck goTo={goTo} />}
            {tab === 'playbook' && <Playbook goTo={goTo} />}
            {tab === 'budget' && <Budget />}
            {tab === 'payday' && <Payday />}
            {tab === 'projection' && <Projection />}
            {tab === 'data' && <Data />}
          </main>

          <footer className="mt-8">
            <Disclaimer />
          </footer>
        </div>
      </div>
    </StoreProvider>
  )
}
