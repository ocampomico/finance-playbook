import { describe, expect, it } from 'vitest'
import { getTaxYear } from '../data/tax'
import {
  bracketTax,
  buildChecklist,
  calcExtras,
  calcTakeHome,
  lineItemDest,
  savingsByDest,
  currentPayday,
  DEFAULT_PROJECTION,
  projectFoo,
  DEFAULT_TEMPLATE,
  evaluateFoo,
  isComplete,
  nextPayday,
  payDateAt,
  splitBudget,
  streak,
  type FooInputs,
  type Profile,
} from './index'

const tax = getTaxYear(2026)

const profile = (over: Partial<Profile> = {}): Profile => ({
  salary: 100_000,
  payFrequency: 'biweekly',
  nextPayDate: '2026-11-20',
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
  ...over,
})

const foo = (over: Partial<FooInputs> = {}): FooInputs => ({
  cash: 0,
  highestDeductible: 0,
  monthlyExpenses: 0,
  emergencyMonths: 3,
  aprThreshold: 8,
  hasMatch: false,
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
  ...over,
})

const line = (r: ReturnType<typeof calcTakeHome>, key: string) => r.lines.find((l) => l.key === key)?.annual ?? 0

describe('take-home calculator (2026 reference cases)', () => {
  it('bracketTax is progressive', () => {
    const b = tax.federal.brackets.single
    expect(bracketTax(0, b)).toBe(0)
    expect(bracketTax(12_400, b)).toBeCloseTo(1_240, 2)
    expect(bracketTax(83_900, b)).toBeCloseTo(13_170, 2)
  })

  it('$100,000 single, California, no deductions', () => {
    const r = calcTakeHome(profile(), tax)
    expect(r.federalTaxable).toBe(83_900)
    expect(line(r, 'federal')).toBeCloseTo(13_170, 2)
    expect(line(r, 'ss')).toBeCloseTo(6_200, 2)
    expect(line(r, 'medicare')).toBeCloseTo(1_450, 2)
    expect(line(r, 'sdi')).toBeCloseTo(1_300, 2)
    expect(line(r, 'state')).toBeCloseTo(4_910.86, 1)
    expect(r.net).toBeCloseTo(72_969.14, 1)
    expect(r.marginalFederalRate).toBe(0.22)
    expect(r.marginalStateRate).toBe(0.093)
    expect(r.effectiveTaxRate).toBeCloseTo(0.2703, 3)
  })

  it('$250,000 married filing jointly with 401(k), health, and HSA', () => {
    const r = calcTakeHome(
      profile({ salary: 250_000, filingStatus: 'mfj', k401Pct: 10, healthPremiumPerPaycheck: 200, hsaPerPaycheck: 100 }),
      tax,
    )
    // 10% would be $25,000; capped at the $24,500 limit.
    expect(r.k401Annual).toBe(24_500)
    expect(r.k401Capped).toBe(true)
    expect(r.federalTaxable).toBe(185_500)
    expect(line(r, 'federal')).toBeCloseTo(30_234, 2)
    // Wages above the $184,500 base pay no Social Security.
    expect(line(r, 'ss')).toBeCloseTo(11_439, 2)
    // 1.45% of $242,200 plus 0.9% above $200,000.
    expect(line(r, 'medicare')).toBeCloseTo(3_891.7, 2)
    // California taxes HSA contributions: 250,000 - 24,500 - 5,200 - 11,800.
    expect(r.stateTaxable).toBe(208_500)
  })

  it('401(k) catch-up applies at 50+', () => {
    const r = calcTakeHome(profile({ salary: 400_000, k401Pct: 20, age: 52 }), tax)
    expect(r.k401Annual).toBe(32_500)
  })

  it('no state: only federal and FICA lines', () => {
    const r = calcTakeHome(profile({ state: 'none' }), tax)
    expect(r.lines.map((l) => l.key)).toEqual(['federal', 'ss', 'medicare'])
    expect(r.net).toBeCloseTo(100_000 - 13_170 - 6_200 - 1_450, 2)
  })

  it('zero salary does not divide by zero', () => {
    const r = calcTakeHome(profile({ salary: 0 }), tax)
    expect(r.net).toBe(0)
    expect(r.effectiveTaxRate).toBe(0)
  })
})

describe('FOO tracker', () => {
  it('acceptance: steps 1-3 met and step 4 half funded shows step 4 current at 50%', () => {
    const r = evaluateFoo(
      profile({ k401Pct: 4 }),
      foo({ cash: 9_000, highestDeductible: 3_000, monthlyExpenses: 6_000, hasMatch: true, matchPct: 4 }),
      tax,
    )
    expect(r.steps.slice(0, 3).map((s) => s.status)).toEqual(['done', 'done', 'done'])
    expect(r.currentStep).toBe(4)
    expect(r.steps[3].progress).toBe(0.5)
    expect(r.steps[3].action).toContain('$9,000')
  })

  it('no match and no HSA/Roth eligibility mark steps not applicable', () => {
    const r = evaluateFoo(profile(), foo({ rothEligible: false }), tax)
    expect(r.steps[1].status).toBe('na')
    expect(r.steps[4].status).toBe('na')
  })

  it('high-interest debt blocks step 3 and tracks payoff progress', () => {
    const r = evaluateFoo(
      profile(),
      foo({
        cash: 5_000,
        highestDeductible: 2_000,
        debts: [
          { id: 'a', name: 'Card', balance: 3_000, startBalance: 4_000, apr: 24, minPayment: 90, kind: 'consumer' },
          { id: 'b', name: 'Car', balance: 10_000, startBalance: 10_000, apr: 4, minPayment: 300, kind: 'car' },
        ],
      }),
      tax,
    )
    expect(r.currentStep).toBe(3)
    expect(r.steps[2].progress).toBeCloseTo(0.25)
    expect(r.steps[2].action).toContain('$3,000')
    expect(r.steps[8].status).toBe('not-started')
  })

  it('step 5 sums Roth and HSA limits', () => {
    const r = evaluateFoo(profile(), foo({ hsaCoverage: 'self', rothYtd: 7_500, hsaYtd: 0 }), tax)
    // 7,500 of (7,500 + 4,400)
    expect(r.steps[4].progress).toBeCloseTo(7_500 / 11_900)
    expect(r.steps[4].action).toContain('$4,400')
  })

  it('investing 25% of gross completes steps 6 and 7', () => {
    const r = evaluateFoo(profile({ k401Pct: 15 }), foo({ otherInvestingMonthly: 900 }), tax)
    expect(r.investingRate).toBeCloseTo(0.258)
    expect(r.steps[5].status).toBe('done')
    expect(r.steps[6].status).toBe('done')
  })
})

describe('budget', () => {
  const plan = {
    buckets: [
      { id: 'needs' as const, name: 'Needs', pct: 50 },
      { id: 'wants' as const, name: 'Wants', pct: 30 },
      { id: 'savings' as const, name: 'Savings and debt', pct: 20 },
    ],
    takeHomeOverride: null,
    lineItems: [],
    savedSplits: [],
  }

  it('acceptance: $6,000 at 50/30/20 gives $3,000 / $1,800 / $1,200', () => {
    const r = splitBudget(plan, 6_000)
    expect(r.buckets.map((b) => b.amount)).toEqual([3_000, 1_800, 1_200])
    expect(r.valid).toBe(true)
  })

  it('flags percentages that do not total 100 and honors the override', () => {
    const r = splitBudget({ ...plan, takeHomeOverride: 5_000, buckets: plan.buckets.map((b) => ({ ...b, pct: 40 })) }, 6_000)
    expect(r.valid).toBe(false)
    expect(r.totalPct).toBe(120)
    expect(r.takeHome).toBe(5_000)
  })

  it('compares line items against the bucket target', () => {
    const r = splitBudget({ ...plan, lineItems: [{ id: '1', name: 'Rent', bucket: 'needs', amount: 2_400 }] }, 6_000)
    expect(r.buckets[0].assigned).toBe(2_400)
    expect(r.buckets[0].assignedPct).toBe(40)
  })
})

describe('payday checklist', () => {
  it('generates pay dates for each frequency', () => {
    expect(payDateAt('2026-11-20', 'weekly', 1)).toBe('2026-11-27')
    expect(payDateAt('2026-11-20', 'biweekly', 3)).toBe('2027-01-01')
    expect(payDateAt('2026-11-20', 'biweekly', -1)).toBe('2026-11-06')
    expect(payDateAt('2026-01-31', 'monthly', 1)).toBe('2026-02-28')
    expect(payDateAt('2026-01-31', 'monthly', 2)).toBe('2026-03-31')
    expect(payDateAt('2026-11-15', 'semimonthly', 1)).toBe('2026-11-30')
    expect(payDateAt('2026-11-15', 'semimonthly', 2)).toBe('2026-12-15')
    expect(payDateAt('2026-01-30', 'semimonthly', 1)).toBe('2026-02-15')
    expect(payDateAt('2026-01-30', 'semimonthly', 2)).toBe('2026-02-28')
    expect(payDateAt('2026-01-15', 'semimonthly', -1)).toBe('2025-12-30')
  })

  it('finds the current and next payday', () => {
    expect(currentPayday('2026-11-20', 'biweekly', '2026-11-15')).toEqual({ date: '2026-11-20', index: 0, upcoming: true })
    expect(currentPayday('2026-11-20', 'biweekly', '2026-11-20').upcoming).toBe(false)
    expect(currentPayday('2026-11-20', 'biweekly', '2026-12-10').date).toBe('2026-12-04')
    expect(nextPayday('2026-11-20', 'biweekly', '2026-12-10')).toBe('2026-12-18')
  })

  it('acceptance: amounts are filled in and ticking every item completes the payday', () => {
    const items = buildChecklist(DEFAULT_TEMPLATE, {
      amounts: { net: 2_800, needs: 1_400, wants: 840, savings: 560, k401: 230, hsa: 0 },
      stepLabel: 'Step 4: Emergency fund',
    })
    // HSA item is hidden when there is no HSA contribution.
    expect(items.map((i) => i.id)).toEqual(['deposit', 'k401', 'savings', 'wants', 'debt', 'balances'])
    expect(items[0].amount).toBe(2_800)
    expect(items[2]).toMatchObject({ text: 'Transfer savings toward Step 4: Emergency fund', amount: 560 })
    const done: Record<string, boolean> = {}
    expect(isComplete(items, done)).toBe(false)
    for (const i of items) done[i.id] = true
    expect(isComplete(items, done)).toBe(true)
  })

  it('counts a streak and does not break it on an unfinished current payday', () => {
    const c = { completedAt: 'x', done: {} }
    const paydays = { '2026-10-23': c, '2026-11-06': c, '2026-09-25': c }
    // Current payday 11-20 not yet complete; 11-06 and 10-23 are; 10-09 was missed.
    expect(streak(paydays, '2026-11-20', 'biweekly', '2026-11-21')).toBe(2)
    expect(streak({ ...paydays, '2026-11-20': c }, '2026-11-20', 'biweekly', '2026-11-21')).toBe(3)
    expect(streak({}, '2026-11-20', 'biweekly', '2026-11-21')).toBe(0)
  })
})

describe("bonus, RSUs, and ESPP", () => {
  it("taxes bonus and RSUs on top of base salary", () => {
    const p = profile({ bonusAnnual: 10_000, rsuAnnual: 20_000 })
    const x = calcExtras(p, tax)
    // Extra tax on $30,000: federal 6,764 + Social Security 1,860 + Medicare 435 + SDI 390 + California 2,790.
    expect(x.bonus.tax + x.rsu.tax).toBeCloseTo(12_239, 1)
    expect(x.bonus.tax).toBeCloseTo(12_239 / 3, 1)
    expect(x.bonus.net).toBeCloseTo(10_000 - 12_239 / 3, 1)
    expect(x.rsu.net).toBeCloseTo(20_000 - (12_239 * 2) / 3, 1)
    expect(x.totalGross).toBe(130_000)
    expect(x.totalNet).toBeCloseTo(72_969.14 + 30_000 - 12_239, 1)
    expect(x.marginalFederalRate).toBe(0.24)
    // Regular paychecks are unchanged by bonus and RSUs.
    expect(calcTakeHome(p, tax).net).toBeCloseTo(72_969.14, 1)
  })

  it("takes the 401(k) percentage from the bonus only when asked", () => {
    const base = { k401Pct: 10, bonusAnnual: 10_000 }
    expect(calcExtras(profile(base), tax).bonus.k401).toBe(0)
    expect(calcExtras(profile({ ...base, k401OnBonus: true }), tax).bonus.k401).toBeCloseTo(1_000, 6)
  })

  it("deducts ESPP after tax and values the discount", () => {
    const p = profile({ esppPct: 10 })
    expect(calcTakeHome(p, tax).net).toBeCloseTo(72_969.14 - 10_000, 1)
    const x = calcExtras(p, tax)
    expect(x.espp.contribution).toBe(10_000)
    expect(x.espp.stockValue).toBeCloseTo(11_764.71, 2)
    expect(x.espp.gain).toBeCloseTo(1_764.71, 2)
    expect(x.espp.capped).toBe(false)
  })

  it("caps ESPP at the IRS $25,000 stock limit", () => {
    const x = calcExtras(profile({ salary: 300_000, esppPct: 10 }), tax)
    expect(x.espp.contribution).toBeCloseTo(21_250, 6)
    expect(x.espp.stockValue).toBeCloseTo(25_000, 6)
    expect(x.espp.capped).toBe(true)
  })

  it("no extras means no extra tax", () => {
    const x = calcExtras(profile(), tax)
    expect(x.bonus.net).toBe(0)
    expect(x.rsu.net).toBe(0)
    expect(x.totalNet).toBeCloseTo(72_969.14, 1)
  })
})

describe("savings destinations", () => {
  const item = (name: string, bucket: "needs" | "wants" | "savings" = "savings", amount = 100) => ({ id: name, name, bucket, amount })
  it("guesses a destination from the name and honors an explicit one", () => {
    expect(lineItemDest(item("Roth IRA"))).toBe("roth")
    expect(lineItemDest(item("Brokerage"))).toBe("brokerage")
    expect(lineItemDest(item("Emergency fund"))).toBe("cash")
    expect(lineItemDest(item("Travel"))).toBe("other")
    expect(lineItemDest({ ...item("Travel"), dest: "cash" })).toBe("cash")
  })

  it("sums only savings-bucket items", () => {
    const r = savingsByDest({
      buckets: [],
      takeHomeOverride: null,
      savedSplits: [],
      lineItems: [item("Brokerage", "savings", 3_000), item("Travel", "savings", 500), item("Index fund", "wants", 999)],
    })
    expect(r).toEqual({ cash: 0, roth: 0, brokerage: 3_000, hsa: 0, debt: 0, other: 500 })
  })
})

describe("projection", () => {
  const settings = { ...DEFAULT_PROJECTION, retireAge: 40 }
  const flat = { ...settings, annualReturnPct: 0, salaryGrowthPct: 0, inflationPct: 0, retireAge: 31 }
  const plan = (monthlySavings: number, current: Partial<Record<"cash" | "roth" | "brokerage" | "hsa" | "debt" | "other", number>> = {}) => ({
    monthlySavings,
    current: { cash: 0, roth: 0, brokerage: 0, hsa: 0, debt: 0, other: 0, ...current },
  })

  it("compounds an untouched balance at the expected return", () => {
    const s = { ...settings, retireAge: 31, balances: { k401: 10_000, ira: 0, hsa: 0, brokerage: 0 } }
    const r = projectFoo(profile({ salary: 0 }), foo(), s, plan(0), tax, 0)
    expect(r.points).toHaveLength(2)
    expect(r.points[1].foo.k401).toBeCloseTo(10_000 * (1 + 0.07 / 12) ** 12, 2)
    expect(r.points[1].foo.invested).toBeCloseTo(r.points[1].foo.k401, 6)
    expect(r.points[1].pace.invested).toBeCloseTo(r.points[1].foo.invested, 2)
  })

  it("fills the deductible, then the emergency fund, before investing", () => {
    const r = projectFoo(
      profile(),
      foo({ highestDeductible: 2_000, monthlyExpenses: 1_000, rothEligible: false }),
      { ...settings, salaryGrowthPct: 0, inflationPct: 0 },
      plan(1_000),
      tax,
      0,
    )
    // $1,000 a month: deductible in month 2, 3-month fund in month 3.
    expect(r.steps[0].months).toBe(1)
    expect(r.steps[3].months).toBe(2)
    expect(r.points[1].foo.cash).toBeCloseTo(3_000, 2)
    // The remaining 9 months go to the employer plan (under 25% of gross).
    expect(r.points[1].foo.k401).toBeGreaterThan(9_000)
    expect(r.points[1].foo.brokerage).toBe(0)
    expect(r.steps[1].applicable).toBe(false)
  })

  it("pays high-interest debt before building the emergency fund", () => {
    const r = projectFoo(
      profile(),
      foo({
        monthlyExpenses: 1_000,
        debts: [{ id: "a", name: "Card", balance: 3_000, startBalance: 3_000, apr: 24, minPayment: 0, kind: "consumer" }],
      }),
      settings,
      plan(1_000),
      tax,
      0,
    )
    expect(r.steps[2].months).toBeGreaterThan(2)
    expect(r.steps[3].months!).toBeGreaterThan(r.steps[2].months!)
    expect(r.points[1].foo.debt).toBe(0)
    expect(r.points[1].pace.debt).toBeGreaterThan(3_000)
  })

  it("routes plan dollars to the right accounts and respects the Roth limit", () => {
    const r = projectFoo(profile({ salary: 12_000 }), foo(), flat, plan(2_000), tax, 0)
    // Roth takes $2,000, $2,000, $2,000, $1,500. After that, 25% of gross ($250 a month for 8 months)
    // goes to the employer plan and the rest overflows to brokerage.
    expect(r.steps[4].months).toBe(3)
    expect(r.points[1].foo.ira).toBeCloseTo(7_500, 2)
    expect(r.points[1].foo.k401).toBeCloseTo(2_000, 2)
    expect(r.points[1].foo.brokerage).toBeCloseTo(14_500, 2)
    expect(r.points[1].foo.invested).toBeCloseTo(24_000, 2)
  })

  it("current allocations go where the budget sends them", () => {
    const r = projectFoo(
      profile({ k401Pct: 6 }),
      foo({ cash: 1_000, hasMatch: true, matchPct: 4 }),
      { ...flat, employerMatchPct: 4 },
      plan(0, { roth: 1_000, brokerage: 300, cash: 200 }),
      tax,
      0,
    )
    const p = r.points[1].pace
    expect(p.k401).toBeCloseTo(100_000 * 0.06 + 100_000 * 0.04, 2)
    // Roth stops at the $7,500 limit; the other $4,500 spills into brokerage.
    expect(p.ira).toBeCloseTo(7_500, 2)
    expect(p.brokerage).toBeCloseTo(300 * 12 + 4_500, 2)
    expect(p.cash).toBeCloseTo(1_000 + 2_400, 2)
    expect(p.netWorth).toBeCloseTo(p.invested + p.cash, 6)
  })

  it("reports when each scenario first reaches $1M", () => {
    const r = projectFoo(profile({ k401Pct: 4 }), foo({ hasMatch: true, matchPct: 4 }), { ...settings, employerMatchPct: 4, retireAge: 65 }, plan(1_200, { brokerage: 100 }), tax, 0)
    const last = r.points.at(-1)!
    expect(last.age).toBe(65)
    expect(last.foo.netWorth).toBeGreaterThan(last.pace.netWorth)
    expect(r.millionAge.foo).not.toBeNull()
    expect(r.millionAge.foo!).toBeLessThan(r.millionAge.pace ?? 999)
    expect(last.deflator).toBeCloseTo(1.03 ** 35, 6)
  })

  it("cash earns interest when a rate is set", () => {
    const r = projectFoo(profile({ salary: 0 }), foo({ cash: 10_000 }), { ...flat, cashReturnPct: 4 }, plan(0), tax, 0)
    expect(r.points[1].pace.cash).toBeCloseTo(10_000 * (1 + 0.04 / 12) ** 12, 2)
  })

  it("handles a retirement age at or below the current age", () => {
    const r = projectFoo(profile({ age: 70 }), foo(), DEFAULT_PROJECTION, plan(500), tax, 0)
    expect(r.points).toHaveLength(1)
  })
})
