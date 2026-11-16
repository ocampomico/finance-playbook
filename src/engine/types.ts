// Shared types for the calculation engine. No UI imports anywhere in /engine.

export type FilingStatus = 'single' | 'mfj' | 'hoh'
export type PayFrequency = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly'

export const PERIODS_PER_YEAR: Record<PayFrequency, number> = {
  weekly: 52,
  biweekly: 26,
  semimonthly: 24,
  monthly: 12,
}

// ---------- Tax data (versioned JSON per year) ----------

export interface Bracket {
  rate: number
  /** Upper bound of the bracket; null means no upper bound. */
  upTo: number | null
}

type ByStatus<T> = Record<FilingStatus, T>

interface DataMeta {
  asOf: string
  status: 'published' | 'estimated'
  source: string
  sourceUrl: string
}

export interface FederalTaxData extends DataMeta {
  standardDeduction: ByStatus<number>
  brackets: ByStatus<Bracket[]>
  fica: {
    socialSecurityRate: number
    socialSecurityWageBase: number
    medicareRate: number
    additionalMedicareRate: number
    additionalMedicareThreshold: number
  }
}

export interface StateTaxData extends DataMeta {
  code: string
  name: string
  /** Whether payroll HSA contributions reduce state taxable income (false in CA). */
  hsaDeductible: boolean
  standardDeduction: ByStatus<number>
  exemptionCredit: ByStatus<number>
  brackets: ByStatus<Bracket[]>
  surtax: { rate: number; over: number; label: string } | null
  sdi: { rate: number; wageBase: number | null; label: string } | null
}

export interface LimitsData extends DataMeta {
  k401: { limit: number; catchUp: number; catchUpAge: number }
  hsa: { self: number; family: number; catchUp: number; catchUpAge: number }
  ira: { limit: number; catchUp: number; catchUpAge: number }
  rothPhaseOut: ByStatus<[number, number]>
}

export interface TaxYear {
  year: number
  federal: FederalTaxData
  states: Record<string, StateTaxData>
  limits: LimitsData
}

// ---------- Profile ----------

export interface CustomDeduction {
  id: string
  name: string
  preTax: boolean
  amountPerPaycheck: number
}

export interface Profile {
  salary: number
  payFrequency: PayFrequency
  /** ISO date (YYYY-MM-DD) of any known pay date; anchors the pay schedule. */
  nextPayDate: string
  filingStatus: FilingStatus
  /** State code with a table in the tax data, or 'none' for no state income tax. */
  state: string
  age: number
  /** Traditional 401(k) deferral as a percent of gross. */
  k401Pct: number
  healthPremiumPerPaycheck: number
  hsaPerPaycheck: number
  deductions: CustomDeduction[]
  /** Cash bonus per year, before tax. */
  bonusAnnual: number
  /** Whether the 401(k) percentage is also taken from the bonus. */
  k401OnBonus: boolean
  /** Value of RSUs vesting per year, before tax. */
  rsuAnnual: number
  /** ESPP contribution as a percent of base salary (after-tax payroll deduction). */
  esppPct: number
  /** ESPP purchase discount, typically 15. */
  esppDiscountPct: number
}

// ---------- Take-home result ----------

export interface PayLine {
  key: string
  label: string
  /** Annual amount; positive numbers are subtracted from gross. */
  annual: number
  kind: 'pretax' | 'tax' | 'posttax'
}

export interface TakeHomeResult {
  taxYear: number
  periods: number
  gross: number
  lines: PayLine[]
  net: number
  totalTax: number
  effectiveTaxRate: number
  marginalFederalRate: number
  marginalStateRate: number
  federalTaxable: number
  stateTaxable: number
  k401Annual: number
  k401Capped: boolean
  hsaAnnual: number
  esppAnnual: number
  assumptions: string[]
}

/** Bonus, RSU, and ESPP figures, taxed on top of base salary. */
export interface ExtrasResult {
  bonus: { gross: number; k401: number; tax: number; net: number }
  rsu: { gross: number; tax: number; net: number }
  espp: { contribution: number; stockValue: number; gain: number; capped: boolean }
  totalGross: number
  totalTax: number
  /** Base net pay plus net bonus plus net RSU value. */
  totalNet: number
  effectiveTaxRate: number
  marginalFederalRate: number
  marginalStateRate: number
}

// ---------- FOO ----------

export type DebtKind = 'consumer' | 'car' | 'student' | 'mortgage' | 'other'

export interface Debt {
  id: string
  name: string
  balance: number
  /** Balance when the debt was first entered; used for payoff progress. */
  startBalance: number
  apr: number
  minPayment: number
  kind: DebtKind
}

export interface Goal {
  id: string
  name: string
  target: number
  balance: number
}

export interface FooInputs {
  cash: number
  highestDeductible: number
  monthlyExpenses: number
  emergencyMonths: number
  /** Debts at or above this APR count as high-interest (step 3). */
  aprThreshold: number
  hasMatch: boolean
  /** Contribution percent needed to get the full employer match. */
  matchPct: number
  rothEligible: boolean
  rothYtd: number
  hsaCoverage: 'none' | 'self' | 'family'
  hsaYtd: number
  k401Ytd: number
  /** Monthly investing outside payroll (Roth IRA, brokerage). */
  otherInvestingMonthly: number
  debts: Debt[]
  goals: Goal[]
  /** Mark step 8 not applicable. */
  skipGoals: boolean
}

export type StepStatus = 'done' | 'in-progress' | 'not-started' | 'na'

export interface StepResult {
  n: number
  title: string
  explain: string
  note?: string
  status: StepStatus
  /** 0..1 */
  progress: number
  detail: string
  /** Next action with a dollar amount; null when done or not applicable. */
  action: string | null
}

export interface FooResult {
  steps: StepResult[]
  /** Step number of the first unmet step, or null when all are done. */
  currentStep: number | null
  investingRate: number
}

// ---------- Budget ----------

export type BucketId = 'needs' | 'wants' | 'savings'

export interface Bucket {
  id: BucketId
  name: string
  pct: number
}

/** Where a savings line item actually goes each month. */
export type SavingsDest = 'cash' | 'roth' | 'brokerage' | 'hsa' | 'debt' | 'other'

export interface LineItem {
  id: string
  name: string
  bucket: BucketId
  amount: number
  /** Only meaningful for the savings bucket; inferred from the name when unset. */
  dest?: SavingsDest
}

export interface BudgetPlan {
  buckets: Bucket[]
  /** Monthly take-home override; null uses the calculator. */
  takeHomeOverride: number | null
  lineItems: LineItem[]
  /** Custom splits the user saved, as [needs, wants, savings] percentages. */
  savedSplits: number[][]
}

export interface BucketResult extends Bucket {
  amount: number
  assigned: number
  assignedPct: number
}

export interface BudgetResult {
  takeHome: number
  totalPct: number
  valid: boolean
  buckets: BucketResult[]
}

// ---------- Payday checklist ----------

export type AmountKey = 'none' | 'net' | 'needs' | 'wants' | 'savings' | 'k401' | 'hsa' | 'custom'

export interface TemplateItem {
  id: string
  /** `{step}` is replaced with the current FOO step. */
  text: string
  amountKey: AmountKey
  customAmount?: number
  /** Hide the item when its resolved amount is zero (e.g. no HSA). */
  hideIfZero?: boolean
}

export interface PaydayRecord {
  done: Record<string, boolean>
  completedAt?: string
}

export interface ChecklistItem {
  id: string
  text: string
  amount: number | null
}
