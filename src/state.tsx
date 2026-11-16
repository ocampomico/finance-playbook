import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getTaxYear, LATEST_TAX_YEAR } from './data/tax'
import {
  calcExtras,
  calcTakeHome,
  savingsByDest,
  DEFAULT_PROJECTION,
  DEFAULT_TEMPLATE,
  evaluateFoo,
  isValidIsoDate,
  splitBudget,
  todayIso,
  type BudgetPlan,
  type FooInputs,
  type PaydayRecord,
  type ProjectionSettings,
  type Profile,
  type TemplateItem,
} from './engine'

const STORAGE_KEY = 'finance-playbook:v1'

export interface AppState {
  version: 1
  taxYear: number
  profile: Profile
  foo: FooInputs
  budget: BudgetPlan
  checklist: { template: TemplateItem[]; paydays: Record<string, PaydayRecord> }
  projection: ProjectionSettings
  /** ISO date the FOO balances were last edited. */
  balancesUpdatedAt: string | null
}

export function defaultState(): AppState {
  return {
    version: 1,
    taxYear: LATEST_TAX_YEAR,
    profile: {
      salary: 0,
      payFrequency: 'biweekly',
      nextPayDate: todayIso(),
      filingStatus: 'single',
      state: 'CA',
      age: 30,
      k401Pct: 0,
      healthPremiumPerPaycheck: 0,
      hsaPerPaycheck: 0,
      deductions: [],
      bonusAnnual: 0,
      k401OnBonus: false,
      rsuAnnual: 0,
      esppPct: 0,
      esppDiscountPct: 15,
    },
    foo: {
      cash: 0,
      highestDeductible: 0,
      monthlyExpenses: 0,
      emergencyMonths: 3,
      aprThreshold: 8,
      hasMatch: true,
      matchPct: 0,
      rothEligible: true,
      rothYtd: 0,
      hsaCoverage: 'none',
      hsaYtd: 0,
      k401Ytd: 0,
      otherInvestingMonthly: 0,
      debts: [],
      goals: [],
      skipGoals: false,
    },
    budget: {
      buckets: [
        { id: 'needs', name: 'Needs', pct: 50 },
        { id: 'wants', name: 'Wants', pct: 30 },
        { id: 'savings', name: 'Savings and debt', pct: 20 },
      ],
      takeHomeOverride: null,
      lineItems: [],
      savedSplits: [],
    },
    checklist: { template: DEFAULT_TEMPLATE, paydays: {} },
    projection: DEFAULT_PROJECTION,
    balancesUpdatedAt: null,
  }
}

/** Sample profile: steps 1-3 met, emergency fund half funded. */
export function sampleState(): AppState {
  const s = defaultState()
  return {
    ...s,
    profile: {
      ...s.profile,
      salary: 95_000,
      k401Pct: 6,
      healthPremiumPerPaycheck: 85,
      hsaPerPaycheck: 50,
    },
    foo: {
      ...s.foo,
      cash: 9_000,
      highestDeductible: 3_000,
      monthlyExpenses: 6_000,
      matchPct: 4,
      hsaCoverage: 'self',
      hsaYtd: 1_100,
      rothYtd: 2_000,
      k401Ytd: 4_900,
      otherInvestingMonthly: 200,
      debts: [{ id: 'sample-car', name: 'Car loan', balance: 11_200, startBalance: 18_000, apr: 4.5, minPayment: 340, kind: 'car' }],
      goals: [{ id: 'sample-529', name: '529 plan', target: 20_000, balance: 2_500 }],
    },
    budget: {
      ...s.budget,
      lineItems: [
        { id: 'sample-rent', name: 'Rent', bucket: 'needs', amount: 2_100 },
        { id: 'sample-groceries', name: 'Groceries', bucket: 'needs', amount: 520 },
      ],
    },
    projection: { ...s.projection, balances: { k401: 31_000, ira: 6_500, hsa: 1_500, brokerage: 3_000 }, employerMatchPct: 4 },
    balancesUpdatedAt: todayIso(),
  }
}

/** Older saves kept one "invested today" number; treat it as the 401(k) balance. */
function hydrateProjection(raw: unknown): ProjectionSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<ProjectionSettings> & { currentInvested?: number }
  const { currentInvested, ...rest } = r
  const balances = { ...DEFAULT_PROJECTION.balances, ...(typeof currentInvested === 'number' ? { k401: currentInvested } : {}), ...rest.balances }
  return { ...DEFAULT_PROJECTION, ...rest, balances }
}

/** Merge untrusted saved or imported data over defaults, section by section. */
export function hydrate(raw: unknown): AppState {
  const d = defaultState()
  if (!raw || typeof raw !== 'object') return d
  const r = raw as Partial<AppState>
  const profile = { ...d.profile, ...r.profile }
  if (!isValidIsoDate(profile.nextPayDate)) profile.nextPayDate = d.profile.nextPayDate
  return {
    version: 1,
    taxYear: typeof r.taxYear === 'number' ? r.taxYear : d.taxYear,
    profile: { ...profile, deductions: Array.isArray(profile.deductions) ? profile.deductions : [] },
    foo: {
      ...d.foo,
      ...r.foo,
      debts: Array.isArray(r.foo?.debts) ? r.foo.debts : [],
      goals: Array.isArray(r.foo?.goals) ? r.foo.goals : [],
    },
    budget: {
      ...d.budget,
      ...r.budget,
      buckets: Array.isArray(r.budget?.buckets) && r.budget.buckets.length === 3 ? r.budget.buckets : d.budget.buckets,
      lineItems: Array.isArray(r.budget?.lineItems) ? r.budget.lineItems : [],
      savedSplits: Array.isArray(r.budget?.savedSplits) ? r.budget.savedSplits.filter((s) => Array.isArray(s) && s.length === 3) : [],
    },
    checklist: {
      template: Array.isArray(r.checklist?.template) ? r.checklist.template : d.checklist.template,
      paydays: r.checklist?.paydays && typeof r.checklist.paydays === 'object' ? r.checklist.paydays : {},
    },
    projection: hydrateProjection(r.projection),
    balancesUpdatedAt: typeof r.balancesUpdatedAt === 'string' ? r.balancesUpdatedAt : null,
  }
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? hydrate(JSON.parse(raw)) : defaultState()
  } catch {
    return defaultState()
  }
}

type Updater = (s: AppState) => AppState

interface Store {
  state: AppState
  update: (fn: Updater) => void
  setProfile: (patch: Partial<Profile>) => void
  /** Patch FOO inputs and stamp the "balances updated" date. */
  setFoo: (patch: Partial<FooInputs>) => void
  setBudget: (patch: Partial<BudgetPlan>) => void
  setProjection: (patch: Partial<ProjectionSettings>) => void
  replace: (s: AppState) => void
  reset: () => void
}

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(load)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // Storage unavailable (private mode, quota): the app still works for this session.
    }
  }, [state])

  const update = useCallback((fn: Updater) => setState(fn), [])
  const store = useMemo<Store>(
    () => ({
      state,
      update,
      setProfile: (patch) => update((s) => ({ ...s, profile: { ...s.profile, ...patch } })),
      setFoo: (patch) => update((s) => ({ ...s, foo: { ...s.foo, ...patch }, balancesUpdatedAt: todayIso() })),
      setBudget: (patch) => update((s) => ({ ...s, budget: { ...s.budget, ...patch } })),
      setProjection: (patch) => update((s) => ({ ...s, projection: { ...s.projection, ...patch } })),
      replace: (s) => setState(s),
      reset: () => {
        try {
          localStorage.removeItem(STORAGE_KEY)
        } catch {
          // ignore
        }
        setState(defaultState())
      },
    }),
    [state, update],
  )

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>
}

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore must be used inside StoreProvider')
  return s
}

/** Everything the screens derive from the profile, computed once per state change. */
export function useDerived() {
  const { state } = useStore()
  return useMemo(() => {
    const tax = getTaxYear(state.taxYear)
    const pay = calcTakeHome(state.profile, tax)
    const extras = calcExtras(state.profile, tax)
    const budget = splitBudget(state.budget, pay.net / 12)
    // Savings line items, when tagged, are the source of truth for investing outside payroll.
    const savings = savingsByDest(state.budget)
    const taggedInvesting = savings.roth + savings.brokerage + savings.hsa
    const fooInputs = taggedInvesting > 0 ? { ...state.foo, otherInvestingMonthly: taggedInvesting } : state.foo
    const foo = evaluateFoo(state.profile, fooInputs, tax)
    const current = foo.steps.find((s) => s.n === foo.currentStep) ?? null
    return { tax, pay, extras, foo, fooInputs, budget, savings, taggedInvesting, current }
  }, [state])
}

export const newId = () => crypto.randomUUID()
