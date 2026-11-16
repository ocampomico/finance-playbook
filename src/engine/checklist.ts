import type { AmountKey, ChecklistItem, PayFrequency, PaydayRecord, TemplateItem } from './types'

// Dates are ISO strings (YYYY-MM-DD) handled in UTC to avoid timezone drift.

const parse = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return { y, m: m - 1, d }
}
const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10)
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
const clampDay = (y: number, m: number, d: number) => {
  const yy = y + Math.floor(m / 12)
  const mm = ((m % 12) + 12) % 12
  return iso(yy, mm, Math.min(d, daysInMonth(yy, mm)))
}

export function isValidIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))
}

/** Today's local calendar date as ISO. */
export function todayIso(now = new Date()): string {
  return iso(now.getFullYear(), now.getMonth(), now.getDate())
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000)
}

/** The pay date `n` periods after (or before, if negative) the anchor pay date. */
export function payDateAt(anchor: string, freq: PayFrequency, n: number): string {
  const { y, m, d } = parse(anchor)
  switch (freq) {
    case 'weekly':
      return iso(y, m, d + 7 * n)
    case 'biweekly':
      return iso(y, m, d + 14 * n)
    case 'monthly':
      return clampDay(y, m + n, d)
    case 'semimonthly': {
      // Two pay days per month, 15 days apart (e.g. 1st/16th, 15th/30th); the
      // later one clamps to month end.
      const first = d <= 15 ? d : d - 15
      const idx = (d <= 15 ? 0 : 1) + n
      const half = ((idx % 2) + 2) % 2
      return clampDay(y, m + Math.floor(idx / 2), half === 0 ? first : first + 15)
    }
  }
}

export interface CurrentPayday {
  date: string
  /** Index relative to the anchor date. */
  index: number
  /** True when the first pay date is still in the future. */
  upcoming: boolean
}

/** The most recent pay date on or before today, or the anchor if it is still ahead. */
export function currentPayday(anchor: string, freq: PayFrequency, today: string): CurrentPayday {
  if (anchor > today) return { date: anchor, index: 0, upcoming: true }
  let n = 0
  while (n < 5000 && payDateAt(anchor, freq, n + 1) <= today) n++
  return { date: payDateAt(anchor, freq, n), index: n, upcoming: false }
}

/** The first pay date strictly after today. */
export function nextPayday(anchor: string, freq: PayFrequency, today: string): string {
  const cur = currentPayday(anchor, freq, today)
  return cur.upcoming ? cur.date : payDateAt(anchor, freq, cur.index + 1)
}

/**
 * Consecutive completed paydays, counting back from the most recent pay date.
 * An unfinished current payday does not break the streak.
 */
export function streak(
  paydays: Record<string, PaydayRecord>,
  anchor: string,
  freq: PayFrequency,
  today: string,
): number {
  const cur = currentPayday(anchor, freq, today)
  let i = cur.upcoming ? -1 : cur.index
  if (!cur.upcoming && !paydays[cur.date]?.completedAt) i--
  let count = 0
  while (count < 1000 && paydays[payDateAt(anchor, freq, i)]?.completedAt) {
    count++
    i--
  }
  return count
}

export interface ChecklistContext {
  /** Per-paycheck amounts for each amount key. */
  amounts: Record<Exclude<AmountKey, 'none' | 'custom'>, number>
  /** e.g. "Step 4: Emergency fund" */
  stepLabel: string
}

/** Resolve the template into concrete items with dollar amounts for one payday. */
export function buildChecklist(template: TemplateItem[], ctx: ChecklistContext): ChecklistItem[] {
  const out: ChecklistItem[] = []
  for (const t of template) {
    const amount =
      t.amountKey === 'none' ? null : t.amountKey === 'custom' ? (t.customAmount ?? 0) : ctx.amounts[t.amountKey]
    if (t.hideIfZero && !amount) continue
    out.push({ id: t.id, text: t.text.replaceAll('{step}', ctx.stepLabel), amount })
  }
  return out
}

export function isComplete(items: ChecklistItem[], done: Record<string, boolean>): boolean {
  return items.length > 0 && items.every((i) => done[i.id])
}

export const DEFAULT_TEMPLATE: TemplateItem[] = [
  { id: 'deposit', text: 'Confirm the deposit matches expected net pay', amountKey: 'net' },
  { id: 'k401', text: 'Confirm the 401(k) contribution on the paystub', amountKey: 'k401', hideIfZero: true },
  { id: 'hsa', text: 'Confirm the HSA contribution on the paystub', amountKey: 'hsa', hideIfZero: true },
  { id: 'savings', text: 'Transfer savings toward {step}', amountKey: 'savings' },
  { id: 'wants', text: 'Move the "wants" allocation to spending', amountKey: 'wants' },
  { id: 'debt', text: 'Make any extra debt payments', amountKey: 'none' },
  { id: 'balances', text: 'Update balances in the Playbook', amountKey: 'none' },
]
