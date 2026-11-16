import type { Debt, DebtKind, Goal, StepResult, StepStatus } from '../engine'
import { newId, sampleState, useDerived, useStore } from '../state'
import { Button, Card, Grid, Num, Progress, Select, Text, Toggle, formatDate, usd } from '../ui'

const FOO_GUIDE = 'https://moneyguy.com/?p=24602'

const STATUS: Record<StepStatus, { label: string; icon: string; cls: string }> = {
  done: { label: 'Done', icon: '✓', cls: 'bg-accent text-on-accent' },
  'in-progress': { label: 'In progress', icon: '◐', cls: 'bg-accent-soft text-ink' },
  'not-started': { label: 'Not started', icon: '○', cls: 'border border-line text-muted' },
  na: { label: 'Not applicable', icon: '–', cls: 'border border-dashed border-line text-muted' },
}

function StatusChip({ status }: { status: StepStatus }) {
  const s = STATUS[status]
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${s.cls}`}>
      <span aria-hidden="true">{s.icon}</span>
      {s.label}
    </span>
  )
}

function StepRow({ step, current }: { step: StepResult; current: boolean }) {
  return (
    <li className={`rounded-lg border px-3 py-2.5 ${current ? 'border-ink' : 'border-line'}`} aria-current={current ? 'step' : undefined}>
      <details>
        <summary className="cursor-pointer list-none">
          <div className="flex items-center gap-3">
            <span className="num w-5 shrink-0 text-center text-sm font-medium text-muted">{step.n}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                <span className="text-sm font-medium">
                  {step.title}
                  {current && <span className="ml-2 text-[11px] font-medium tracking-wider text-muted uppercase">You are here</span>}
                </span>
                <StatusChip status={step.status} />
              </div>
              {step.status !== 'na' && (
                <div className="mt-2 flex items-center gap-2">
                  <Progress value={step.progress} label={`${step.title} progress`} />
                  <span className="num w-10 shrink-0 text-right text-xs text-muted">{Math.floor(step.progress * 100)}%</span>
                </div>
              )}
              <p className="num mt-1 text-[13px] text-muted">{step.detail}</p>
            </div>
          </div>
        </summary>
        <div className="mt-3 space-y-2 border-t border-line pt-3 pl-9 text-sm">
          <p>{step.explain}</p>
          {step.action && <p className="font-medium">Next: {step.action}</p>}
          {step.note && <p className="text-muted">{step.note}</p>}
          <a className="inline-block text-accent underline" href={FOO_GUIDE} target="_blank" rel="noreferrer">
            Source guide
          </a>
        </div>
      </details>
    </li>
  )
}

const DEBT_KINDS: { value: DebtKind; label: string }[] = [
  { value: 'consumer', label: 'Credit card / consumer' },
  { value: 'car', label: 'Car loan' },
  { value: 'student', label: 'Student loan' },
  { value: 'mortgage', label: 'Mortgage' },
  { value: 'other', label: 'Other' },
]

export function Playbook({ goTo }: { goTo: (tab: 'pay') => void }) {
  const { state, setFoo, setProfile, replace } = useStore()
  const { foo: result, current, tax, taggedInvesting } = useDerived()
  const { foo, profile } = state

  const patchDebt = (id: string, patch: Partial<Debt>) =>
    setFoo({
      debts: foo.debts.map((d) => {
        if (d.id !== id) return d
        const next = { ...d, ...patch }
        // Remember the highest balance seen so payoff progress has a baseline.
        return { ...next, startBalance: Math.max(next.startBalance, next.balance) }
      }),
    })
  const patchGoal = (id: string, patch: Partial<Goal>) => setFoo({ goals: foo.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)) })

  const empty = profile.salary <= 0 && foo.cash <= 0

  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      <div className="space-y-4 lg:sticky lg:top-4 lg:order-2 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto">
      {/* Hero: current step and next dollar, visible without scrolling on a phone. */}
      <section className="rounded-xl border border-line bg-card p-5 sm:p-6" aria-live="polite">
        {current ? (
          <>
            <p className="text-xs font-medium tracking-wider text-muted uppercase">Your next dollar goes to</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">
              Step {current.n}: {current.title}
            </h2>
            <p className="mt-2 text-[15px] text-muted">{current.action}</p>
            <div className="mt-4 flex items-center gap-3">
              <div
                className="h-1.5 flex-1 overflow-hidden rounded-full bg-line"
                role="progressbar"
                aria-label="Current step progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.floor(current.progress * 100)}
              >
                <div className="h-full rounded-full bg-accent" style={{ width: `${current.progress * 100}%` }} />
              </div>
              <span className="num text-sm font-semibold">{Math.floor(current.progress * 100)}%</span>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs font-medium tracking-wider text-muted uppercase">All nine steps</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">Done. Keep going.</h2>
            <p className="mt-2">Every step is complete or not applicable. Revisit when your numbers change.</p>
          </>
        )}
      </section>

      {empty && (
        <Card title="Start here">
          <p className="mb-3 text-sm text-muted">Enter your salary and a few balances below. Everything stays in this browser.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => goTo('pay')}>
              Enter salary
            </Button>
            <Button onClick={() => replace(sampleState())}>Load sample data</Button>
          </div>
        </Card>
      )}

      <Card
        title="The nine steps"
        aside={state.balancesUpdatedAt ? `Balances updated ${formatDate(state.balancesUpdatedAt, { month: 'short', day: 'numeric' })}` : 'Balances not entered yet'}
      >
        <ol className="space-y-1.5">
          {result.steps.map((s) => (
            <StepRow key={s.n} step={s} current={s.n === result.currentStep} />
          ))}
        </ol>
        <p className="mt-3 text-xs text-muted">Tap a step for the explanation and next action. Status is shown as text and icon, not color alone.</p>
      </Card>

      </div>

      <div className="space-y-4 lg:order-1">
      <Card title="Cash cushion">
        <Grid>
          <Num label="Liquid savings" prefix="$" value={foo.cash} onChange={(cash) => setFoo({ cash })} />
          <Num label="Highest deductible" prefix="$" value={foo.highestDeductible} onChange={(highestDeductible) => setFoo({ highestDeductible })} />
          <Num label="Monthly expenses" prefix="$" value={foo.monthlyExpenses} onChange={(monthlyExpenses) => setFoo({ monthlyExpenses })} />
          <Num
            label="Months of expenses"
            value={foo.emergencyMonths}
            max={24}
            hint="3 to 6 is typical"
            onChange={(emergencyMonths) => setFoo({ emergencyMonths })}
          />
        </Grid>
      </Card>

      <Card title="Retirement and investing" aside={`Investing ${(result.investingRate * 100).toFixed(1)}% of gross`}>
        <div className="space-y-3">
          <Toggle label="My employer offers a match" checked={foo.hasMatch} onChange={(hasMatch) => setFoo({ hasMatch })} />
          <Grid>
            <Num label="401(k) contribution" suffix="%" value={profile.k401Pct} max={100} onChange={(k401Pct) => setProfile({ k401Pct })} />
            {foo.hasMatch && (
              <Num label="Full match at" suffix="%" value={foo.matchPct} max={100} onChange={(matchPct) => setFoo({ matchPct })} />
            )}
            <Num
              label="401(k) this year"
              prefix="$"
              value={foo.k401Ytd}
              hint={`${tax.year} limit ${usd(tax.limits.k401.limit)}`}
              onChange={(k401Ytd) => setFoo({ k401Ytd })}
            />
          </Grid>
          <Toggle label="I can contribute to a Roth IRA" checked={foo.rothEligible} onChange={(rothEligible) => setFoo({ rothEligible })} />
          <Grid>
            {foo.rothEligible && (
              <Num
                label="Roth IRA this year"
                prefix="$"
                value={foo.rothYtd}
                hint={`${tax.year} limit ${usd(tax.limits.ira.limit)}`}
                onChange={(rothYtd) => setFoo({ rothYtd })}
              />
            )}
            <Select
              label="HSA coverage"
              value={foo.hsaCoverage}
              onChange={(hsaCoverage) => setFoo({ hsaCoverage })}
              hint="Needs a high-deductible plan"
              options={[
                { value: 'none', label: 'Not eligible' },
                { value: 'self', label: 'Self-only' },
                { value: 'family', label: 'Family' },
              ]}
            />
            {foo.hsaCoverage !== 'none' && (
              <Num
                label="HSA this year"
                prefix="$"
                value={foo.hsaYtd}
                hint={`${tax.year} limit ${usd(tax.limits.hsa[foo.hsaCoverage])}`}
                onChange={(hsaYtd) => setFoo({ hsaYtd })}
              />
            )}
            {taggedInvesting > 0 ? (
              <div className="min-w-0">
                <p className="mb-1.5 text-[13px] font-medium text-muted">Other investing</p>
                <p className="num flex h-10 items-center text-[15px] font-medium">{usd(taggedInvesting)}</p>
                <p className="mt-1 text-xs text-muted">Per month, from Budget line items</p>
              </div>
            ) : (
              <Num
                label="Other investing"
                prefix="$"
                value={foo.otherInvestingMonthly}
                hint="Per month: IRA, brokerage"
                onChange={(otherInvestingMonthly) => setFoo({ otherInvestingMonthly })}
              />
            )}
          </Grid>
        </div>
      </Card>

      <Card title="Debts">
        <div className="space-y-3">
          <div className="max-w-56">
            <Num
              label="High-interest cutoff"
              suffix="%"
              value={foo.aprThreshold}
              max={100}
              hint="Debts at or above this APR belong to step 3; the rest to step 9"
              onChange={(aprThreshold) => setFoo({ aprThreshold })}
            />
          </div>
          {foo.debts.map((d) => (
            <fieldset key={d.id} className="rounded-lg border border-line p-4">
              <legend className="px-1 text-[13px] font-medium">
                {d.name || 'Debt'} · {d.apr >= foo.aprThreshold ? 'high-interest (step 3)' : 'low-interest (step 9)'}
              </legend>
              <Grid>
                <Text label="Name" value={d.name} placeholder="Visa" onChange={(name) => patchDebt(d.id, { name })} />
                <Select label="Kind" value={d.kind} options={DEBT_KINDS} onChange={(kind) => patchDebt(d.id, { kind })} />
                <Num label="Balance" prefix="$" value={d.balance} onChange={(balance) => patchDebt(d.id, { balance })} />
                <Num label="APR" suffix="%" value={d.apr} max={100} onChange={(apr) => patchDebt(d.id, { apr })} />
                <Num label="Minimum payment" prefix="$" value={d.minPayment} onChange={(minPayment) => patchDebt(d.id, { minPayment })} />
                <Num
                  label="Starting balance"
                  prefix="$"
                  value={d.startBalance}
                  hint="Baseline for progress"
                  onChange={(startBalance) => patchDebt(d.id, { startBalance })}
                />
              </Grid>
              <div className="mt-2 text-right">
                <Button variant="ghost" onClick={() => setFoo({ debts: foo.debts.filter((x) => x.id !== d.id) })}>
                  Remove {d.name || 'debt'}
                </Button>
              </div>
            </fieldset>
          ))}
          <Button
            onClick={() =>
              setFoo({ debts: [...foo.debts, { id: newId(), name: '', balance: 0, startBalance: 0, apr: 0, minPayment: 0, kind: 'consumer' }] })
            }
          >
            + Add a debt
          </Button>
        </div>
      </Card>

      <Card title="Goals (step 8)">
        <div className="space-y-3">
          <Toggle label="Step 8 does not apply to me" checked={foo.skipGoals} onChange={(skipGoals) => setFoo({ skipGoals })} />
          {!foo.skipGoals && (
            <>
              {foo.goals.map((g) => (
                <div key={g.id} className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
                  <div className="col-span-2 sm:col-span-1">
                    <Text label="Goal" value={g.name} placeholder="529 plan" onChange={(name) => patchGoal(g.id, { name })} />
                  </div>
                  <Num label="Target" prefix="$" value={g.target} onChange={(target) => patchGoal(g.id, { target })} />
                  <Num label="Saved" prefix="$" value={g.balance} onChange={(balance) => patchGoal(g.id, { balance })} />
                  <Button variant="ghost" onClick={() => setFoo({ goals: foo.goals.filter((x) => x.id !== g.id) })}>
                    Remove<span className="sr-only"> {g.name || 'goal'}</span>
                  </Button>
                </div>
              ))}
              <Button onClick={() => setFoo({ goals: [...foo.goals, { id: newId(), name: '', target: 0, balance: 0 }] })}>+ Add a goal</Button>
            </>
          )}
        </div>
      </Card>
      </div>
    </div>
  )
}
