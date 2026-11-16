import type { BudgetPlan, BudgetResult, LineItem, SavingsDest } from './types'

export const BUDGET_PRESETS: { label: string; split: [number, number, number] }[] = [
  { label: '50 / 30 / 20', split: [50, 30, 20] },
  { label: '60 / 20 / 20', split: [60, 20, 20] },
  { label: '70 / 20 / 10', split: [70, 20, 10] },
  { label: '40 / 30 / 30', split: [40, 30, 30] },
]

/** Split monthly take-home across buckets. `calcTakeHome` is the calculator's monthly net. */
export function splitBudget(plan: BudgetPlan, calcMonthlyTakeHome: number): BudgetResult {
  const takeHome = Math.max(0, plan.takeHomeOverride ?? calcMonthlyTakeHome)
  const totalPct = plan.buckets.reduce((s, b) => s + b.pct, 0)
  return {
    takeHome,
    totalPct,
    valid: Math.abs(totalPct - 100) < 0.005,
    buckets: plan.buckets.map((b) => {
      const assigned = plan.lineItems.filter((l) => l.bucket === b.id).reduce((s, l) => s + l.amount, 0)
      return {
        ...b,
        amount: (takeHome * b.pct) / 100,
        assigned,
        assignedPct: takeHome > 0 ? (assigned / takeHome) * 100 : 0,
      }
    }),
  }
}

/** Destination of a savings line item: the explicit choice, or a guess from its name. */
export function lineItemDest(item: LineItem): SavingsDest {
  if (item.dest) return item.dest
  const n = item.name.toLowerCase()
  if (/roth|\bira\b/.test(n)) return 'roth'
  if (/hsa/.test(n)) return 'hsa'
  if (/broker|invest|index|stock|etf|fund(?!.*emergency)/.test(n) && !/emergency/.test(n)) return 'brokerage'
  if (/emergency|saving|cash|hysa|rainy/.test(n)) return 'cash'
  if (/debt|loan|card|mortgage/.test(n)) return 'debt'
  return 'other'
}

/** Monthly dollars the savings bucket's line items send to each destination. */
export function savingsByDest(plan: BudgetPlan): Record<SavingsDest, number> {
  const out: Record<SavingsDest, number> = { cash: 0, roth: 0, brokerage: 0, hsa: 0, debt: 0, other: 0 }
  for (const l of plan.lineItems) if (l.bucket === 'savings') out[lineItemDest(l)] += Math.max(0, l.amount)
  return out
}
