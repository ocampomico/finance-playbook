import { useState } from 'react'
import { BUDGET_PRESETS, lineItemDest, type BucketId, type LineItem, type SavingsDest } from '../engine'
import { newId, useDerived, useStore } from '../state'
import { Button, Card, Num, Progress, Select, Text, Toggle, usd } from '../ui'

const DESTS: { value: SavingsDest; label: string }[] = [
  { value: 'cash', label: 'Cash savings' },
  { value: 'roth', label: 'Roth IRA' },
  { value: 'brokerage', label: 'Brokerage' },
  { value: 'hsa', label: 'HSA' },
  { value: 'debt', label: 'Extra debt payment' },
  { value: 'other', label: 'Something else (not projected)' },
]

const sameSplit = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i])
const splitLabel = (s: number[]) => s.join(' / ')
const share = (n: number) => `${n.toFixed(n >= 10 || n === 0 ? 0 : 1)}%`

export function Budget() {
  const { state, setBudget } = useStore()
  const { budget, pay, current } = useDerived()
  const plan = state.budget
  const calcMonthly = pay.net / 12
  const overriding = plan.takeHomeOverride !== null

  const split = plan.buckets.map((b) => b.pct)
  const presets = BUDGET_PRESETS.map((p) => p.split as number[])
  const isPreset = presets.some((p) => sameSplit(p, split))
  const isSaved = plan.savedSplits.some((s) => sameSplit(s, split))
  // Custom editing is open whenever the current split is not one of the listed ones.
  const [editing, setEditing] = useState(!isPreset && !isSaved)
  const custom = editing || (!isPreset && !isSaved)

  const setPcts = (next: number[]) => setBudget({ buckets: plan.buckets.map((b, i) => ({ ...b, pct: next[i] })) })
  const choose = (next: number[]) => {
    setEditing(false)
    setPcts(next)
  }
  const patchItem = (id: string, patch: Partial<LineItem>) =>
    setBudget({ lineItems: plan.lineItems.map((l) => (l.id === id ? { ...l, ...patch } : l)) })

  const assigned = budget.buckets.reduce((s, b) => s + b.assigned, 0)
  const left = budget.takeHome - assigned
  const ofTakeHome = (amount: number) => (budget.takeHome > 0 ? (amount / budget.takeHome) * 100 : 0)

  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      <Card title="Monthly take-home" className="lg:col-start-1 lg:row-start-1">
        <p className="num text-5xl font-semibold tracking-tighter">{usd(budget.takeHome)}</p>
        <p className="mt-2 text-sm text-muted">
          {overriding ? `Your override. The calculator estimates ${usd(calcMonthly)}.` : 'From the take-home calculator.'}
        </p>
        <div className="mt-2">
          <Toggle
            label="Use my actual take-home instead"
            checked={overriding}
            onChange={(on) => setBudget({ takeHomeOverride: on ? Math.round(calcMonthly) : null })}
          />
          {overriding && (
            <div className="mt-2 max-w-56">
              <Num label="Actual monthly take-home" prefix="$" value={plan.takeHomeOverride ?? 0} onChange={(takeHomeOverride) => setBudget({ takeHomeOverride })} />
            </div>
          )}
        </div>
      </Card>

      <Card title="Split" aside={`Total ${budget.totalPct}%`} className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
        <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Budget split">
          {presets.map((p) => {
            const on = !custom && sameSplit(p, split)
            return (
              <Button key={splitLabel(p)} variant={on ? 'primary' : 'secondary'} onClick={() => choose(p)}>
                {splitLabel(p)}
                {on && <span className="sr-only"> (selected)</span>}
              </Button>
            )
          })}
          {plan.savedSplits.map((s) => {
            const on = !custom && sameSplit(s, split)
            return (
              <span key={splitLabel(s)} className={`inline-flex items-stretch overflow-hidden rounded-lg border ${on ? 'border-accent bg-accent text-on-accent' : 'border-line bg-card'}`}>
                <button type="button" className="min-h-10 pr-2 pl-3.5 text-sm font-medium" onClick={() => choose(s)}>
                  {splitLabel(s)}
                  {on && <span className="sr-only"> (selected)</span>}
                </button>
                <button
                  type="button"
                  aria-label={`Delete saved split ${splitLabel(s)}`}
                  className="px-2.5 text-sm opacity-60 hover:opacity-100"
                  onClick={() => setBudget({ savedSplits: plan.savedSplits.filter((x) => !sameSplit(x, s)) })}
                >
                  ×
                </button>
              </span>
            )
          })}
          <Button variant={custom ? 'primary' : 'secondary'} onClick={() => setEditing(true)}>
            Custom
            {custom && <span className="sr-only"> (selected)</span>}
          </Button>
        </div>

        {custom && (
          <div className="mb-5 rounded-lg border border-line p-4">
            <div className="grid grid-cols-3 gap-3">
              {plan.buckets.map((b, i) => (
                <Num key={b.id} label={b.name} suffix="%" value={b.pct} max={100} onChange={(v) => setPcts(split.map((x, j) => (j === i ? v : x)))} />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className={`num text-sm ${budget.valid ? 'text-muted' : 'font-medium text-warn'}`} role={budget.valid ? undefined : 'alert'}>
                {budget.valid
                  ? 'Totals 100%.'
                  : budget.totalPct < 100
                    ? `⚠ Totals ${budget.totalPct}%. ${100 - budget.totalPct}% is unassigned.`
                    : `⚠ Totals ${budget.totalPct}%. Over by ${budget.totalPct - 100}%.`}
              </p>
              <Button
                disabled={!budget.valid || isPreset || isSaved}
                onClick={() => {
                  setBudget({ savedSplits: [...plan.savedSplits, split] })
                  setEditing(false)
                }}
              >
                {isPreset || isSaved ? 'Already in the list' : `Save ${splitLabel(split)}`}
              </Button>
            </div>
          </div>
        )}

        <ul className="divide-y divide-line [&>li]:py-4 [&>li:first-child]:pt-0 [&>li:last-child]:pb-0">
          {budget.buckets.map((b) => {
            const bucketLeft = b.amount - b.assigned
            return (
              <li key={b.id}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">
                    {b.name} <span className="num font-normal text-muted">· {b.pct}%</span>
                  </span>
                  <span className="num text-2xl font-semibold tracking-tight">{usd(b.amount)}</span>
                </div>
                <div className="mt-2">
                  <Progress value={b.amount > 0 ? b.assigned / b.amount : b.assigned > 0 ? 1 : 0} label={`${b.name} assigned`} />
                  <p className="num mt-1.5 flex justify-between gap-3 text-[13px] text-muted">
                    <span>
                      {usd(b.assigned)} in line items · <span className="font-medium text-ink">{share(b.assignedPct)}</span> of take-home vs {b.pct}% target
                    </span>
                    <span className={bucketLeft < 0 ? 'font-medium text-warn' : 'font-medium text-ink'}>
                      {bucketLeft < 0 ? `⚠ Over by ${usd(-bucketLeft)}` : `${usd(bucketLeft)} left`}
                    </span>
                  </p>
                </div>
                {b.id === 'savings' && (
                  <p className="mt-2 text-[13px] text-muted">
                    {current ? (
                      <>
                        Fund first:{' '}
                        <strong className="font-medium text-ink">
                          Step {current.n}, {current.title}
                        </strong>
                        . {current.action}
                      </>
                    ) : (
                      'All nine steps are complete.'
                    )}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      </Card>

      <Card title="Line items" aside={`${plan.lineItems.length} item${plan.lineItems.length === 1 ? '' : 's'}`} className="lg:col-start-1 lg:row-start-2">
        <div className="mb-5 rounded-lg bg-accent-soft p-4" aria-live="polite">
          <p className="text-xs font-medium tracking-wider text-muted uppercase">{left < 0 ? 'Over your take-home' : 'Left to allocate'}</p>
          <p className={`num mt-1 text-3xl font-semibold tracking-tight ${left < 0 ? 'text-warn' : ''}`}>
            {left < 0 && <span aria-hidden="true">⚠ </span>}
            {usd(Math.abs(left))}
          </p>
          <p className="num mt-1 text-[13px] text-muted">
            {usd(assigned)} of {usd(budget.takeHome)} assigned · <span className="font-medium text-ink">{share(ofTakeHome(assigned))}</span> of take-home
          </p>
          <dl className="num mt-3 grid grid-cols-3 gap-3 border-t border-line pt-3 text-[13px]">
            {budget.buckets.map((b) => {
              const bucketLeft = b.amount - b.assigned
              return (
                <div key={b.id} className="min-w-0">
                  <dt className="truncate text-muted">{b.name}</dt>
                  <dd className={`mt-0.5 font-medium ${bucketLeft < 0 ? 'text-warn' : ''}`}>{bucketLeft < 0 ? `−${usd(-bucketLeft)} over` : `${usd(bucketLeft)} left`}</dd>
                  <dd className="mt-0.5 text-muted">
                    {share(b.assignedPct)} of {b.pct}%
                  </dd>
                </div>
              )
            })}
          </dl>
        </div>

        <p className="mb-3 text-xs text-muted">The percentage beside each item is its share of monthly take-home.</p>
        <div className="divide-y divide-line [&>div]:py-3 [&>div:first-child]:pt-0">
          {plan.lineItems.map((l) => (
            <div key={l.id} className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(6rem,1fr)_minmax(7.5rem,1fr)_3.25rem_auto]">
              <div className="col-span-2 sm:col-span-1">
                <Text label="Item" value={l.name} placeholder="Rent" onChange={(name) => patchItem(l.id, { name })} />
              </div>
              <Num label="Per month" prefix="$" value={l.amount} onChange={(amount) => patchItem(l.id, { amount })} />
              <Select<BucketId>
                label="Bucket"
                value={l.bucket}
                onChange={(bucket) => patchItem(l.id, { bucket })}
                options={plan.buckets.map((b) => ({ value: b.id, label: b.name }))}
              />
              <p className="num flex h-10 items-center text-sm font-medium sm:justify-end">
                {share(ofTakeHome(l.amount))}
                <span className="sr-only sm:not-sr-only">&nbsp;</span>
                <span className="ml-1 font-normal text-muted sm:sr-only">of take-home</span>
              </p>
              <Button variant="ghost" onClick={() => setBudget({ lineItems: plan.lineItems.filter((x) => x.id !== l.id) })}>
                Remove<span className="sr-only"> {l.name || 'item'}</span>
              </Button>
              {l.bucket === 'savings' && (
                <div className="col-span-full max-w-72">
                  <Select<SavingsDest> label={`Where ${l.name || 'this'} goes`} value={lineItemDest(l)} options={DESTS} onChange={(dest) => patchItem(l.id, { dest })} />
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="mt-3">
          <Button onClick={() => setBudget({ lineItems: [...plan.lineItems, { id: newId(), name: '', bucket: 'needs', amount: 0 }] })}>+ Add a line item</Button>
        </div>
      </Card>
    </div>
  )
}
