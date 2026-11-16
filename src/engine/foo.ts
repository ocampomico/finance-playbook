import { k401Limit } from './tax'
import {
  PERIODS_PER_YEAR,
  type FooInputs,
  type FooResult,
  type Profile,
  type StepResult,
  type StepStatus,
  type TaxYear,
} from './types'

const usd = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const pct = (n: number) => `${(Math.round(n * 10) / 10).toLocaleString('en-US')}%`
const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0)
const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0)

/** Hyperaccumulation target: invest this share of gross income. */
export const INVESTING_TARGET = 0.25

function status(progress: number): StepStatus {
  if (progress >= 1) return 'done'
  return progress > 0 ? 'in-progress' : 'not-started'
}

export function iraLimit(age: number, tax: TaxYear): number {
  const { limit, catchUp, catchUpAge } = tax.limits.ira
  return limit + (age >= catchUpAge ? catchUp : 0)
}

export function hsaLimit(coverage: FooInputs['hsaCoverage'], age: number, tax: TaxYear): number {
  if (coverage === 'none') return 0
  const { catchUp, catchUpAge } = tax.limits.hsa
  return tax.limits.hsa[coverage] + (age >= catchUpAge ? catchUp : 0)
}

/** Share of gross income invested per year (401(k) + payroll HSA + other investing). */
export function investingRate(profile: Profile, foo: FooInputs, tax: TaxYear): number {
  if (profile.salary <= 0) return 0
  const k401 = Math.min((profile.salary * profile.k401Pct) / 100, k401Limit(profile.age, tax))
  const hsa = profile.hsaPerPaycheck * PERIODS_PER_YEAR[profile.payFrequency]
  return (k401 + hsa + foo.otherInvestingMonthly * 12) / profile.salary
}

/**
 * Evaluate the nine steps against the user's numbers. Each step reports
 * partial progress; the current step is the first that is not done or N/A.
 */
export function evaluateFoo(profile: Profile, foo: FooInputs, tax: TaxYear): FooResult {
  const periods = PERIODS_PER_YEAR[profile.payFrequency]
  const rate = investingRate(profile, foo, tax)
  const steps: StepResult[] = []
  const push = (s: Omit<StepResult, 'status'> & { status?: StepStatus }) =>
    steps.push({ ...s, progress: clamp01(s.progress), status: s.status ?? status(s.progress) })

  // 1. Deductibles covered
  {
    const target = foo.highestDeductible
    const p = target > 0 ? foo.cash / target : foo.cash > 0 ? 1 : 0
    push({
      n: 1,
      title: 'Deductibles covered',
      explain: 'Keep enough cash to cover your highest insurance deductible so a surprise bill does not become debt.',
      note: 'Ground rule: generosity comes first, as a "step 0".',
      progress: p,
      detail: target > 0 ? `${usd(Math.min(foo.cash, target))} of ${usd(target)}` : 'Enter your highest deductible',
      action:
        target <= 0
          ? 'Enter your highest insurance deductible and your savings balance.'
          : p < 1
            ? `Add ${usd(target - foo.cash)} to savings to cover your ${usd(target)} deductible.`
            : null,
    })
  }

  // 2. Employer match
  {
    const na = !foo.hasMatch || foo.matchPct <= 0
    const p = na ? 0 : profile.k401Pct / foo.matchPct
    const gapPct = Math.max(0, foo.matchPct - profile.k401Pct)
    push({
      n: 2,
      title: 'Employer match',
      explain: 'Contribute enough to your employer plan to get the full match. It is an instant return on your money.',
      progress: p,
      status: na ? 'na' : undefined,
      detail: na ? 'No employer match' : `Contributing ${pct(profile.k401Pct)} of ${pct(foo.matchPct)} needed`,
      action:
        na || p >= 1
          ? null
          : `Raise your 401(k) contribution from ${pct(profile.k401Pct)} to ${pct(foo.matchPct)} (about ${usd((profile.salary * gapPct) / 100 / periods)} more per paycheck).`,
    })
  }

  // 3. High-interest debt
  {
    const high = foo.debts.filter((d) => d.apr >= foo.aprThreshold && d.balance > 0)
    const owed = sum(high.map((d) => d.balance))
    const start = sum(high.map((d) => Math.max(d.startBalance, d.balance)))
    const worst = [...high].sort((a, b) => b.apr - a.apr)[0]
    push({
      n: 3,
      title: 'High-interest debt',
      explain: `Pay off debt at or above ${pct(foo.aprThreshold)} APR. Few investments reliably beat that rate.`,
      note: 'Ground rule: use debt cautiously. The APR cutoff is your call; change it in settings below.',
      progress: owed <= 0 ? 1 : 1 - owed / start,
      status: owed <= 0 ? 'done' : owed < start ? 'in-progress' : 'not-started',
      detail: owed <= 0 ? `No debt at or above ${pct(foo.aprThreshold)} APR` : `${usd(owed)} remaining across ${high.length} debt${high.length === 1 ? '' : 's'}`,
      action:
        owed <= 0
          ? null
          : `Pay off ${usd(owed)} of high-interest debt, starting with ${worst.name || 'the highest APR'} (${usd(worst.balance)} at ${pct(worst.apr)}).`,
    })
  }

  // 4. Emergency fund (the deductible fund counts toward it)
  {
    const target = foo.monthlyExpenses * foo.emergencyMonths
    const p = target > 0 ? foo.cash / target : 0
    push({
      n: 4,
      title: 'Emergency fund',
      explain: `Build ${foo.emergencyMonths} months of living expenses in liquid savings. Your deductible fund counts toward it.`,
      progress: p,
      detail: target > 0 ? `${usd(Math.min(foo.cash, target))} of ${usd(target)}` : 'Enter your monthly expenses',
      action:
        target <= 0
          ? 'Enter your monthly expenses to size your emergency fund.'
          : p < 1
            ? `Add ${usd(target - foo.cash)} to reach your ${foo.emergencyMonths}-month emergency fund.`
            : null,
    })
  }

  // 5. Roth IRA and HSA
  {
    const rothTarget = foo.rothEligible ? iraLimit(profile.age, tax) : 0
    const hsaTarget = hsaLimit(foo.hsaCoverage, profile.age, tax)
    const target = rothTarget + hsaTarget
    const rothGap = Math.max(0, rothTarget - foo.rothYtd)
    const hsaGap = Math.max(0, hsaTarget - foo.hsaYtd)
    const funded = rothTarget - rothGap + (hsaTarget - hsaGap)
    const parts = [
      rothGap > 0 ? `${usd(rothGap)} to your Roth IRA` : '',
      hsaGap > 0 ? `${usd(hsaGap)} to your HSA` : '',
    ].filter(Boolean)
    const [lo, hi] = tax.limits.rothPhaseOut[profile.filingStatus]
    push({
      n: 5,
      title: 'Roth IRA and HSA',
      explain: 'Fund tax-free growth: a Roth IRA, and an HSA if you have a high-deductible health plan.',
      note:
        foo.rothEligible && profile.salary >= lo
          ? `Your salary is in or above the ${tax.year} Roth IRA phase-out (${usd(lo)} to ${usd(hi)}); your direct contribution limit may be reduced.`
          : undefined,
      progress: target > 0 ? funded / target : 0,
      status: target <= 0 ? 'na' : undefined,
      detail: target > 0 ? `${usd(funded)} of ${usd(target)} for ${tax.year}` : 'Not eligible for either account',
      action: target <= 0 || parts.length === 0 ? null : `Contribute ${parts.join(' and ')} to max them for ${tax.year}.`,
    })
  }

  // 6. Max employer plans
  {
    const limit = k401Limit(profile.age, tax)
    const gap = Math.max(0, limit - foo.k401Ytd)
    const byRate = rate >= INVESTING_TARGET
    push({
      n: 6,
      title: 'Max employer plans',
      explain: 'Raise 401(k)/403(b)/457 contributions toward the annual limit, or until you invest 25% of gross income.',
      progress: byRate ? 1 : foo.k401Ytd / limit,
      detail: byRate
        ? `Investing ${pct(rate * 100)} of gross, at or above the 25% target`
        : `${usd(Math.min(foo.k401Ytd, limit))} of ${usd(limit)} for ${tax.year}`,
      action: byRate || gap <= 0 ? null : `Contribute ${usd(gap)} more to your employer plan to reach the ${tax.year} limit of ${usd(limit)}.`,
    })
  }

  // 7. Hyperaccumulation
  {
    const gapMonthly = Math.max(0, ((INVESTING_TARGET - rate) * profile.salary) / 12)
    push({
      n: 7,
      title: 'Hyperaccumulation',
      explain: 'Invest 25% or more of your gross income across all accounts.',
      note: 'Ground rule: 25% of gross is the long-run investing target.',
      progress: rate / INVESTING_TARGET,
      detail: profile.salary > 0 ? `Investing ${pct(rate * 100)} of gross (target 25%)` : 'Enter your salary',
      action: profile.salary > 0 && rate < INVESTING_TARGET ? `Invest ${usd(gapMonthly)} more per month to reach 25% of gross income.` : null,
    })
  }

  // 8. Prepay future expenses
  {
    const goals = foo.goals.filter((g) => g.target > 0)
    const target = sum(goals.map((g) => g.target))
    const funded = sum(goals.map((g) => Math.min(g.balance, g.target)))
    const next = goals.find((g) => g.balance < g.target)
    const na = foo.skipGoals
    push({
      n: 8,
      title: 'Prepay future expenses',
      explain: 'Fund known future costs you choose, such as a 529 for college or a planned large purchase.',
      progress: target > 0 ? funded / target : 0,
      status: na ? 'na' : undefined,
      detail: na ? 'Marked not applicable' : target > 0 ? `${usd(funded)} of ${usd(target)} across ${goals.length} goal${goals.length === 1 ? '' : 's'}` : 'No goals yet',
      action: na
        ? null
        : target <= 0
          ? 'Add a goal with a target amount, or mark this step not applicable.'
          : next
            ? `Add ${usd(next.target - next.balance)} to ${next.name || 'your goal'} (${usd(target - funded)} left across all goals).`
            : null,
    })
  }

  // 9. Prepay low-interest debt
  {
    const low = foo.debts.filter((d) => d.apr < foo.aprThreshold && d.balance > 0)
    const owed = sum(low.map((d) => d.balance))
    const start = sum(low.map((d) => Math.max(d.startBalance, d.balance)))
    const worst = [...low].sort((a, b) => b.apr - a.apr)[0]
    push({
      n: 9,
      title: 'Prepay low-interest debt',
      explain: 'With everything else on track, pay down remaining low-rate debt, typically the mortgage.',
      progress: owed <= 0 ? 1 : 1 - owed / start,
      status: owed <= 0 ? 'done' : owed < start ? 'in-progress' : 'not-started',
      detail: owed <= 0 ? 'No low-interest debt' : `${usd(owed)} remaining across ${low.length} debt${low.length === 1 ? '' : 's'}`,
      action: owed <= 0 ? null : `Put extra toward ${worst.name || 'your debt'} (${usd(worst.balance)} at ${pct(worst.apr)}); ${usd(owed)} of low-interest debt remains.`,
    })
  }

  const current = steps.find((s) => s.status !== 'done' && s.status !== 'na')
  return { steps, currentStep: current?.n ?? null, investingRate: rate }
}
