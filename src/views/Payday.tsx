import {
  buildChecklist,
  currentPayday,
  daysBetween,
  DEFAULT_TEMPLATE,
  isComplete,
  nextPayday,
  streak,
  todayIso,
  type AmountKey,
  type TemplateItem,
} from '../engine'
import { newId, useDerived, useStore } from '../state'
import { Button, Card, Num, Progress, Select, Text, formatDate, usd } from '../ui'

const AMOUNT_OPTIONS: { value: AmountKey; label: string }[] = [
  { value: 'none', label: 'No amount' },
  { value: 'net', label: 'Net pay' },
  { value: 'needs', label: 'Needs bucket' },
  { value: 'wants', label: 'Wants bucket' },
  { value: 'savings', label: 'Savings bucket' },
  { value: 'k401', label: '401(k)' },
  { value: 'hsa', label: 'HSA' },
  { value: 'custom', label: 'Custom amount' },
]

export function Payday() {
  const { state, update } = useStore()
  const { pay, budget, current } = useDerived()
  const { profile, checklist } = state
  const today = todayIso()
  const cur = currentPayday(profile.nextPayDate, profile.payFrequency, today)
  const next = nextPayday(profile.nextPayDate, profile.payFrequency, today)

  // Budget buckets are monthly; convert to a per-paycheck amount.
  const perCheck = (monthly: number) => (monthly * 12) / pay.periods
  const bucket = (id: string) => perCheck(budget.buckets.find((b) => b.id === id)?.amount ?? 0)
  const items = buildChecklist(checklist.template, {
    amounts: {
      net: pay.net / pay.periods,
      needs: bucket('needs'),
      wants: bucket('wants'),
      savings: bucket('savings'),
      k401: pay.k401Annual / pay.periods,
      hsa: pay.hsaAnnual / pay.periods,
    },
    stepLabel: current ? `Step ${current.n}: ${current.title}` : 'your goals',
  })

  const record = checklist.paydays[cur.date] ?? { done: {} }
  const doneCount = items.filter((i) => record.done[i.id]).length
  const complete = Boolean(record.completedAt)
  const streakCount = streak(checklist.paydays, profile.nextPayDate, profile.payFrequency, today)
  const history = Object.entries(checklist.paydays)
    .filter(([, r]) => r.completedAt)
    .sort(([a], [b]) => b.localeCompare(a))

  const toggle = (id: string) =>
    update((s) => {
      const prev = s.checklist.paydays[cur.date] ?? { done: {} }
      const done = { ...prev.done, [id]: !prev.done[id] }
      const completedAt = isComplete(items, done) ? (prev.completedAt ?? new Date().toISOString()) : undefined
      return { ...s, checklist: { ...s.checklist, paydays: { ...s.checklist.paydays, [cur.date]: { done, completedAt } } } }
    })

  const setTemplate = (template: TemplateItem[]) => update((s) => ({ ...s, checklist: { ...s.checklist, template } }))
  const patchItem = (id: string, patch: Partial<TemplateItem>) =>
    setTemplate(checklist.template.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  const move = (i: number, dir: -1 | 1) => {
    const t = [...checklist.template]
    const j = i + dir
    if (j < 0 || j >= t.length) return
    ;[t[i], t[j]] = [t[j], t[i]]
    setTemplate(t)
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      <div className="space-y-4">
      <section className="rounded-xl border border-line bg-card p-5 sm:p-6">
        <p className="text-xs font-medium tracking-wider text-muted uppercase">{cur.upcoming ? 'First payday' : complete ? 'Payday complete' : 'Payday'}</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight">{formatDate(cur.date, { weekday: 'long', month: 'long', day: 'numeric' })}</h2>
        <p className="num mt-2 text-sm text-muted">
          {cur.upcoming
            ? `In ${daysBetween(today, cur.date)} day${daysBetween(today, cur.date) === 1 ? '' : 's'}. The checklist unlocks on payday.`
            : `${doneCount} of ${items.length} done · next payday ${formatDate(next)}`}
        </p>
        <p className="num mt-1 text-sm text-muted">
          <span aria-hidden="true">★ </span>
          Streak: {streakCount} payday{streakCount === 1 ? '' : 's'} in a row
        </p>
      </section>

      <Card title="Checklist" aside={complete ? '✓ Complete' : `${doneCount}/${items.length}`}>
        <Progress value={items.length ? doneCount / items.length : 0} label="Checklist progress" />
        <ul className="mt-3 divide-y divide-line">
          {items.map((item) => {
            const checked = Boolean(record.done[item.id])
            return (
              <li key={item.id}>
                <label className={`flex min-h-12 items-center gap-3 py-2 ${cur.upcoming ? 'opacity-60' : 'cursor-pointer'}`}>
                  <input
                    type="checkbox"
                    className="size-[18px] shrink-0 accent-(--accent)"
                    checked={checked}
                    disabled={cur.upcoming}
                    onChange={() => toggle(item.id)}
                  />
                  <span className={`flex-1 text-sm ${checked ? 'text-muted line-through' : ''}`}>{item.text}</span>
                  {item.amount !== null && <span className="num text-sm font-medium">{usd(item.amount, true)}</span>}
                </label>
              </li>
            )
          })}
        </ul>
        {items.length === 0 && <p className="mt-3 text-sm text-muted">No items. Add some below.</p>}
        {profile.salary <= 0 && <p className="mt-3 text-sm text-muted">Enter your salary on the Paycheck tab to fill in the amounts.</p>}
      </Card>

      </div>

      <div className="space-y-4">
      <Card title="Edit checklist">
        <details>
          <summary className="cursor-pointer text-sm font-semibold">Add, edit, reorder, or remove items</summary>
          <p className="mt-2 text-xs text-muted">
            Use <code>{'{step}'}</code> in the text to insert your current step. Amounts are per paycheck.
          </p>
          <ol className="mt-3 space-y-3">
            {checklist.template.map((t, i) => (
              <li key={t.id} className="rounded-lg border border-line p-4">
                <Text label={`Item ${i + 1}`} value={t.text} onChange={(text) => patchItem(t.id, { text })} />
                <div className="mt-2 grid grid-cols-2 items-end gap-3">
                  <Select<AmountKey> label="Amount" value={t.amountKey} options={AMOUNT_OPTIONS} onChange={(amountKey) => patchItem(t.id, { amountKey })} />
                  {t.amountKey === 'custom' && (
                    <Num label="Custom amount" prefix="$" value={t.customAmount ?? 0} onChange={(customAmount) => patchItem(t.id, { customAmount })} />
                  )}
                </div>
                <div className="mt-2 flex flex-wrap justify-end gap-1">
                  <Button variant="ghost" label={`Move item ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                    ↑
                  </Button>
                  <Button variant="ghost" label={`Move item ${i + 1} down`} disabled={i === checklist.template.length - 1} onClick={() => move(i, 1)}>
                    ↓
                  </Button>
                  <Button variant="ghost" onClick={() => setTemplate(checklist.template.filter((x) => x.id !== t.id))}>
                    Remove<span className="sr-only"> item {i + 1}</span>
                  </Button>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => setTemplate([...checklist.template, { id: newId(), text: 'New item', amountKey: 'none' }])}>+ Add an item</Button>
            <Button variant="ghost" onClick={() => setTemplate(DEFAULT_TEMPLATE)}>
              Reset to default
            </Button>
          </div>
        </details>
      </Card>

      <Card title="History" aside={`${history.length} completed`}>
        {history.length === 0 ? (
          <p className="text-sm text-muted">Completed paydays will appear here.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {history.map(([date]) => (
              <li key={date} className="flex justify-between py-2">
                <span>{formatDate(date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
                <span className="font-semibold">
                  <span aria-hidden="true">✓ </span>Complete
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      </div>
    </div>
  )
}
