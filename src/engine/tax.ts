import {
  PERIODS_PER_YEAR,
  type Bracket,
  type ExtrasResult,
  type PayLine,
  type Profile,
  type TakeHomeResult,
  type TaxYear,
} from './types'

/** IRS limit on ESPP stock purchased per year, measured at the undiscounted price. Fixed by statute, not indexed. */
export const ESPP_ANNUAL_STOCK_LIMIT = 25_000

/** Progressive tax on `taxable` using `brackets`. */
export function bracketTax(taxable: number, brackets: Bracket[]): number {
  let tax = 0
  let lower = 0
  for (const b of brackets) {
    const upper = b.upTo ?? Infinity
    if (taxable <= lower) break
    tax += (Math.min(taxable, upper) - lower) * b.rate
    lower = upper
  }
  return tax
}

/** Rate of the bracket that `taxable` falls into. */
export function marginalRate(taxable: number, brackets: Bracket[]): number {
  for (const b of brackets) {
    if (taxable <= (b.upTo ?? Infinity)) return b.rate
  }
  return brackets[brackets.length - 1]?.rate ?? 0
}

/** Annual 401(k) employee limit for a given age. */
export function k401Limit(age: number, tax: TaxYear): number {
  const { limit, catchUp, catchUpAge } = tax.limits.k401
  return limit + (age >= catchUpAge ? catchUp : 0)
}

/** Annual ESPP contribution, capped so the stock bought stays within the IRS limit. */
export function esppContribution(profile: Profile): { amount: number; capped: boolean } {
  const discount = Math.min(Math.max(profile.esppDiscountPct, 0), 99) / 100
  const wanted = (Math.max(0, profile.salary) * Math.max(0, profile.esppPct)) / 100
  const cap = ESPP_ANNUAL_STOCK_LIMIT * (1 - discount)
  return { amount: Math.min(wanted, cap), capped: wanted > cap }
}

/** Annual tax and deductions on base salary plus `bonus` and `rsu` income. */
function compute(profile: Profile, tax: TaxYear, bonus: number, rsu: number): TakeHomeResult {
  const periods = PERIODS_PER_YEAR[profile.payFrequency]
  const salary = Math.max(0, profile.salary)
  const gross = salary + bonus + rsu
  const fs = profile.filingStatus
  const fed = tax.federal
  const state = profile.state === 'none' ? null : (tax.states[profile.state] ?? null)

  // Pre-tax deductions
  const k401Wanted = ((salary + (profile.k401OnBonus ? bonus : 0)) * Math.max(0, profile.k401Pct)) / 100
  const k401Cap = k401Limit(profile.age, tax)
  const k401 = Math.min(k401Wanted, k401Cap)
  const health = Math.max(0, profile.healthPremiumPerPaycheck) * periods
  const hsa = Math.max(0, profile.hsaPerPaycheck) * periods
  const customPre = profile.deductions.filter((d) => d.preTax)
  const customPost = profile.deductions.filter((d) => !d.preTax)
  const otherPre = customPre.reduce((s, d) => s + Math.max(0, d.amountPerPaycheck) * periods, 0)
  const espp = esppContribution(profile).amount

  // Federal income tax
  const federalTaxable = Math.max(0, gross - k401 - health - hsa - otherPre - fed.standardDeduction[fs])
  const federalTax = bracketTax(federalTaxable, fed.brackets[fs])

  // FICA: 401(k) deferrals do not reduce FICA wages; cafeteria-plan items do.
  const ficaWages = Math.max(0, gross - health - hsa - otherPre)
  const f = fed.fica
  const socialSecurity = Math.min(ficaWages, f.socialSecurityWageBase) * f.socialSecurityRate
  const medicare =
    ficaWages * f.medicareRate +
    Math.max(0, ficaWages - f.additionalMedicareThreshold) * f.additionalMedicareRate

  // State income tax and SDI
  let stateTax = 0
  let stateTaxable = 0
  let sdi = 0
  let marginalStateRate = 0
  if (state) {
    const stateHsa = state.hsaDeductible ? hsa : 0
    stateTaxable = Math.max(0, gross - k401 - health - otherPre - stateHsa - state.standardDeduction[fs])
    stateTax = Math.max(0, bracketTax(stateTaxable, state.brackets[fs]) - state.exemptionCredit[fs])
    marginalStateRate = marginalRate(stateTaxable, state.brackets[fs])
    if (state.surtax && stateTaxable > state.surtax.over) {
      stateTax += (stateTaxable - state.surtax.over) * state.surtax.rate
      marginalStateRate += state.surtax.rate
    }
    if (state.sdi) {
      const sdiWages = Math.max(0, gross - health - otherPre)
      sdi = Math.min(sdiWages, state.sdi.wageBase ?? Infinity) * state.sdi.rate
    }
  }

  const lines: PayLine[] = []
  const add = (key: string, label: string, annual: number, kind: PayLine['kind']) => {
    if (annual > 0) lines.push({ key, label, annual, kind })
  }
  add('k401', '401(k)', k401, 'pretax')
  add('health', 'Health premiums', health, 'pretax')
  add('hsa', 'HSA', hsa, 'pretax')
  for (const d of customPre) add(d.id, d.name || 'Pre-tax deduction', d.amountPerPaycheck * periods, 'pretax')
  add('federal', 'Federal income tax', federalTax, 'tax')
  add('ss', 'Social Security', socialSecurity, 'tax')
  add('medicare', 'Medicare', medicare, 'tax')
  if (state) {
    add('state', `${state.name} income tax`, stateTax, 'tax')
    if (state.sdi) add('sdi', state.sdi.label, sdi, 'tax')
  }
  add('espp', 'ESPP', espp, 'posttax')
  for (const d of customPost) add(d.id, d.name || 'Post-tax deduction', d.amountPerPaycheck * periods, 'posttax')

  const totalTax = federalTax + socialSecurity + medicare + stateTax + sdi
  const net = gross - lines.reduce((s, l) => s + l.annual, 0)

  const assumptions = [
    `Tax year ${tax.year}. Federal tables as of ${fed.asOf}.`,
    `Standard deduction (${fed.standardDeduction[fs].toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}); no itemized deductions, credits, other income, or second job.`,
    'Annual tax is computed first, then spread evenly across pay periods. Real withholding (IRS Pub. 15-T, your W-4) will differ slightly.',
    '401(k) deferrals are treated as traditional (pre-tax): they reduce income tax but not Social Security or Medicare wages.',
    'Health premiums, payroll HSA, and other pre-tax deductions are treated as cafeteria-plan items that reduce both income tax and FICA wages.',
  ]
  if (profile.bonusAnnual > 0 || profile.rsuAnnual > 0) {
    assumptions.push(
      'Regular paychecks are taxed as if base salary were your only income. Bonus and RSUs are shown separately, taxed on top at your highest brackets. Employers withhold on them at flat supplemental rates, so your refund or balance due will differ.',
    )
  }
  if (espp > 0) {
    assumptions.push('ESPP contributions come out of each paycheck after tax, on base salary. The discount is taxed as income when you sell, which is not modeled.')
  }
  if (state) {
    assumptions.push(
      state.status === 'estimated'
        ? `${state.name} tables are ESTIMATED (as of ${state.asOf}): ${state.source}`
        : `${state.name} tables as of ${state.asOf}.`,
    )
    if (!state.hsaDeductible && hsa > 0) {
      assumptions.push(`${state.name} does not recognize HSAs: payroll HSA contributions are taxed for state income tax and SDI.`)
    }
  } else {
    assumptions.push('No state income tax applied.')
  }
  if (k401Wanted > k401Cap) {
    assumptions.push(`401(k) deferral capped at the ${tax.year} limit of $${k401Cap.toLocaleString('en-US')}.`)
  }

  return {
    taxYear: tax.year,
    periods,
    gross,
    lines,
    net,
    totalTax,
    effectiveTaxRate: gross > 0 ? totalTax / gross : 0,
    marginalFederalRate: marginalRate(federalTaxable, fed.brackets[fs]),
    marginalStateRate,
    federalTaxable,
    stateTaxable,
    k401Annual: k401,
    k401Capped: k401Wanted > k401Cap,
    hsaAnnual: hsa,
    esppAnnual: espp,
    assumptions,
  }
}

/**
 * Annual take-home estimate for regular paychecks (base salary only). Annual
 * tax is computed first; callers divide by `periods` for a per-paycheck view.
 * Bonus and RSUs are handled by `calcExtras`.
 */
export function calcTakeHome(profile: Profile, tax: TaxYear): TakeHomeResult {
  return compute(profile, tax, 0, 0)
}

/**
 * Bonus, RSUs, and ESPP. Bonus and RSU income is stacked on top of base salary,
 * so the tax attributed to it is the difference between total tax with and
 * without it, split in proportion to each amount.
 */
export function calcExtras(profile: Profile, tax: TaxYear): ExtrasResult {
  const bonus = Math.max(0, profile.bonusAnnual)
  const rsu = Math.max(0, profile.rsuAnnual)
  const base = compute(profile, tax, 0, 0)
  const all = compute(profile, tax, bonus, rsu)

  const extraTax = all.totalTax - base.totalTax
  const extraK401 = all.k401Annual - base.k401Annual
  const extra = bonus + rsu
  const bonusTax = extra > 0 ? (extraTax * bonus) / extra : 0
  const rsuTax = extraTax - bonusTax

  const { amount: contribution, capped } = esppContribution(profile)
  const discount = Math.min(Math.max(profile.esppDiscountPct, 0), 99) / 100
  const stockValue = contribution / (1 - discount)

  const bonusNet = bonus - extraK401 - bonusTax
  const rsuNet = rsu - rsuTax
  return {
    bonus: { gross: bonus, k401: extraK401, tax: bonusTax, net: bonusNet },
    rsu: { gross: rsu, tax: rsuTax, net: rsuNet },
    espp: { contribution, stockValue, gain: stockValue - contribution, capped },
    totalGross: all.gross,
    totalTax: all.totalTax,
    totalNet: base.net + bonusNet + rsuNet,
    effectiveTaxRate: all.effectiveTaxRate,
    marginalFederalRate: all.marginalFederalRate,
    marginalStateRate: all.marginalStateRate,
  }
}
