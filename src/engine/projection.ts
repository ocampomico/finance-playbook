import { hsaLimit, INVESTING_TARGET, iraLimit } from './foo'
import { k401Limit } from './tax'
import { PERIODS_PER_YEAR, type FooInputs, type Profile, type SavingsDest, type TaxYear } from './types'

/** Invested accounts tracked by the projection. Cash comes from the Playbook's liquid savings. */
export type InvestedAccount = 'k401' | 'ira' | 'hsa' | 'brokerage'
export const INVESTED_ACCOUNTS: InvestedAccount[] = ['k401', 'ira', 'hsa', 'brokerage']

export interface ProjectionSettings {
  /** What each invested account holds today. */
  balances: Record<InvestedAccount, number>
  annualReturnPct: number
  /** Interest earned on cash savings. */
  cashReturnPct: number
  salaryGrowthPct: number
  inflationPct: number
  retireAge: number
  /** Employer contribution as a percent of salary when you get the full match. */
  employerMatchPct: number
}

export const DEFAULT_PROJECTION: ProjectionSettings = {
  balances: { k401: 0, ira: 0, hsa: 0, brokerage: 0 },
  annualReturnPct: 7,
  cashReturnPct: 0,
  salaryGrowthPct: 3,
  inflationPct: 3,
  retireAge: 65,
  employerMatchPct: 0,
}

/** Monthly money the projection has to work with, from the budget. */
export interface SavingsPlan {
  /** Total monthly savings the plan scenario directs down the nine steps. */
  monthlySavings: number
  /** Where savings go today, per month; drives the current-allocations scenario. */
  current: Record<SavingsDest, number>
}

export interface Balances extends Record<InvestedAccount, number> {
  /** Liquid savings plus step 8 goal balances. */
  cash: number
  debt: number
  /** Sum of the four invested accounts. */
  invested: number
  netWorth: number
}

export interface ProjectionPoint {
  age: number
  /** Following the order of operations with the monthly savings budget. */
  foo: Balances
  /** Current allocations continue unchanged. */
  pace: Balances
  /** Divide a future amount by this to express it in today's dollars. */
  deflator: number
}

export interface StepForecast {
  n: number
  title: string
  /** Months from now until the step is first complete; 0 = already; null = not within the horizon or N/A. */
  months: number | null
  applicable: boolean
}

export interface ProjectionResult {
  points: ProjectionPoint[]
  steps: StepForecast[]
  /** First age at which net worth reaches $1M (nominal) in each scenario, if ever. */
  millionAge: { foo: number | null; pace: number | null }
  monthlySavings: number
}

const STEP_TITLES = [
  'Deductibles covered',
  'Employer match',
  'High-interest debt',
  'Emergency fund',
  'Roth IRA and HSA',
  'Max employer plans',
  'Hyperaccumulation',
  'Prepay future expenses',
  'Prepay low-interest debt',
]

const EPS = 0.005

function simulate(mode: 'foo' | 'pace', profile: Profile, foo: FooInputs, s: ProjectionSettings, plan: SavingsPlan, tax: TaxYear, startMonth: number) {
  const months = Math.max(0, Math.round(s.retireAge - profile.age)) * 12
  const r = s.annualReturnPct / 100 / 12
  const rCash = s.cashReturnPct / 100 / 12
  const growth = 1 + s.salaryGrowthPct / 100
  const infl = 1 + s.inflationPct / 100
  const hasMatch = foo.hasMatch && foo.matchPct > 0

  const acc: Record<InvestedAccount, number> = { ...s.balances }
  let cash = foo.cash
  const debts = foo.debts.filter((d) => d.balance > 0).map((d) => ({ ...d }))
  const goals = foo.skipGoals ? [] : foo.goals.filter((g) => g.target > 0).map((g) => ({ ...g }))
  let k401Ytd = foo.k401Ytd
  let rothYtd = foo.rothYtd
  let hsaYtd = foo.hsaYtd

  const doneAt: (number | null)[] = Array(9).fill(null)
  const mark = (i: number, ok: boolean, m: number) => {
    if (ok && doneAt[i] === null) doneAt[i] = m
  }
  const snapshot = (): Balances => {
    const c = cash + goals.reduce((a, g) => a + g.balance, 0)
    const debt = debts.reduce((a, d) => a + d.balance, 0)
    const invested = acc.k401 + acc.ira + acc.hsa + acc.brokerage
    return { ...acc, cash: c, debt, invested, netWorth: invested + c - debt }
  }

  const yearly: Balances[] = [snapshot()]

  for (let m = 0; m < months; m++) {
    const year = Math.floor(m / 12)
    const calYear = Math.floor((startMonth + m) / 12)
    if (m > 0 && (startMonth + m) % 12 === 0) k401Ytd = rothYtd = hsaYtd = 0

    const salaryFactor = growth ** year
    const monthlySalary = (profile.salary * salaryFactor) / 12
    const limitFactor = infl ** calYear
    const costFactor = infl ** year

    // Growth and debt service happen in both scenarios.
    for (const k of INVESTED_ACCOUNTS) acc[k] *= 1 + r
    cash *= 1 + rCash
    for (const d of debts) {
      d.balance += (d.balance * d.apr) / 1200
      d.balance -= Math.min(d.balance, d.minPayment)
    }

    const k401Room = () => Math.max(0, k401Limit(profile.age + year, tax) * limitFactor - k401Ytd)
    const hsaCap = hsaLimit(foo.hsaCoverage, profile.age + year, tax) * limitFactor
    const hsaRoom = () => (foo.hsaCoverage === 'none' ? 0 : Math.max(0, hsaCap - hsaYtd))
    const rothCap = foo.rothEligible ? iraLimit(profile.age + year, tax) * limitFactor : 0
    const rothRoom = () => Math.max(0, rothCap - rothYtd)

    // Payroll contributions already in place.
    const k401Pay = Math.min((monthlySalary * profile.k401Pct) / 100, k401Room())
    k401Ytd += k401Pay
    acc.k401 += k401Pay
    const hsaWanted = ((profile.hsaPerPaycheck * PERIODS_PER_YEAR[profile.payFrequency]) / 12) * salaryFactor
    const hsaPay = foo.hsaCoverage === 'none' ? hsaWanted : Math.min(hsaWanted, hsaRoom())
    hsaYtd += hsaPay
    acc.hsa += hsaPay
    let investedThisMonth = k401Pay + hsaPay
    let matchShare = hasMatch ? Math.min(1, profile.k401Pct / foo.matchPct) : 0

    let left = 0
    const take = (want: number) => {
      const a = Math.min(left, Math.max(0, want))
      left -= a
      return a
    }
    const payDebts = (high: boolean | null) => {
      const list = debts.filter((d) => high === null || d.apr >= foo.aprThreshold === high).sort((a, b) => b.apr - a.apr)
      for (const d of list) d.balance -= take(d.balance)
      return list.every((d) => d.balance <= EPS)
    }

    if (mode === 'pace') {
      acc.k401 += monthlySalary * (s.employerMatchPct / 100) * matchShare
      const c = plan.current
      // Each allocation keeps going where it goes today; anything over an account's limit spills into brokerage.
      left = c.roth * salaryFactor
      const roth = take(rothRoom())
      rothYtd += roth
      acc.ira += roth
      acc.brokerage += left

      left = c.hsa * salaryFactor
      const hsa = take(hsaRoom())
      hsaYtd += hsa
      acc.hsa += hsa
      acc.brokerage += left

      left = c.debt * salaryFactor
      payDebts(null)
      acc.brokerage += left

      acc.brokerage += c.brokerage * salaryFactor
      cash += c.cash * salaryFactor
      if ((m + 1) % 12 === 0) yearly.push(snapshot())
      continue
    }

    // Following the plan: direct the monthly savings budget down the nine steps.
    left = plan.monthlySavings * salaryFactor

    // 1. Deductible
    const deductible = foo.highestDeductible * costFactor
    cash += take(deductible - cash)
    mark(0, cash >= deductible - EPS, m)

    // 2. Employer match
    if (hasMatch) {
      const gap = (monthlySalary * Math.max(0, foo.matchPct - profile.k401Pct)) / 100
      const extra = take(Math.min(gap, k401Room()))
      k401Ytd += extra
      acc.k401 += extra
      investedThisMonth += extra
      matchShare = Math.min(1, (profile.k401Pct + (monthlySalary > 0 ? (extra / monthlySalary) * 100 : 0)) / foo.matchPct)
      mark(1, matchShare >= 1 - 1e-9, m)
    }
    acc.k401 += monthlySalary * (s.employerMatchPct / 100) * matchShare

    // 3. High-interest debt
    mark(2, payDebts(true), m)

    // 4. Emergency fund
    const fund = foo.monthlyExpenses * foo.emergencyMonths * costFactor
    cash += take(fund - cash)
    mark(3, fund > 0 && cash >= fund - EPS, m)

    // 5. Roth IRA and HSA
    const roth = take(rothRoom())
    rothYtd += roth
    acc.ira += roth
    const hsa = take(hsaRoom())
    hsaYtd += hsa
    acc.hsa += hsa
    investedThisMonth += roth + hsa
    const step5Applies = rothCap > 0 || foo.hsaCoverage !== 'none'
    mark(4, step5Applies && rothRoom() <= EPS && hsaRoom() <= EPS, m)

    // 6 and 7. Employer plan, then taxable, until 25% of gross is invested.
    const target = INVESTING_TARGET * monthlySalary
    const planExtra = take(Math.min(target - investedThisMonth, k401Room()))
    k401Ytd += planExtra
    acc.k401 += planExtra
    const taxable = take(target - investedThisMonth - planExtra)
    acc.brokerage += taxable
    investedThisMonth += planExtra + taxable
    const atTarget = monthlySalary > 0 && investedThisMonth >= target - EPS
    mark(5, atTarget || k401Room() <= EPS, m)
    mark(6, atTarget, m)

    // 8. Goals
    for (const g of goals) g.balance += take(g.target - g.balance)
    mark(7, goals.length > 0 && goals.every((g) => g.balance >= g.target - EPS), m)

    // 9. Low-interest debt
    mark(8, payDebts(false), m)

    // Anything left is invested in the brokerage account.
    acc.brokerage += left

    if ((m + 1) % 12 === 0) yearly.push(snapshot())
  }

  return { yearly, doneAt }
}

/**
 * Project each account to retirement age two ways: following the order of
 * operations with the plan's monthly savings, and continuing today's
 * allocations. Amounts are nominal; use each point's `deflator` for today's dollars.
 */
export function projectFoo(
  profile: Profile,
  foo: FooInputs,
  settings: ProjectionSettings,
  plan: SavingsPlan,
  tax: TaxYear,
  startMonth = new Date().getMonth(),
): ProjectionResult {
  const followed = simulate('foo', profile, foo, settings, plan, tax, startMonth)
  const pace = simulate('pace', profile, foo, settings, plan, tax, startMonth)
  const infl = 1 + settings.inflationPct / 100

  const points = followed.yearly.map((b, i) => ({
    age: profile.age + i,
    foo: b,
    pace: pace.yearly[i],
    deflator: infl ** i,
  }))

  const applicable = [
    true,
    foo.hasMatch && foo.matchPct > 0,
    true,
    foo.monthlyExpenses > 0,
    foo.rothEligible || foo.hsaCoverage !== 'none',
    true,
    true,
    !foo.skipGoals && foo.goals.some((g) => g.target > 0),
    true,
  ]

  return {
    points,
    steps: STEP_TITLES.map((title, i) => ({
      n: i + 1,
      title,
      months: applicable[i] ? followed.doneAt[i] : null,
      applicable: applicable[i],
    })),
    millionAge: {
      foo: points.find((p) => p.foo.netWorth >= 1_000_000)?.age ?? null,
      pace: points.find((p) => p.pace.netWorth >= 1_000_000)?.age ?? null,
    },
    monthlySavings: plan.monthlySavings,
  }
}
