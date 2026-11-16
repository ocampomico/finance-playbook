import { useMemo, useState } from 'react'
import { PERIODS_PER_YEAR, projectFoo, type Balances, type InvestedAccount, type ProjectionPoint, type SavingsPlan, type StepForecast } from '../engine'
import { useDerived, useStore } from '../state'
import { Card, Grid, Hero, Num, Toggle, usd, usdCompact } from '../ui'

type Scenario = 'foo' | 'pace'
type SeriesKey = 'netWorth' | InvestedAccount | 'cash'

const SCENARIOS: { id: Scenario; label: string }[] = [
  { id: 'foo', label: 'Following the plan' },
  { id: 'pace', label: 'Current allocations' },
]

// Fixed order and fixed colors: an account keeps its color whether or not others are shown.
const SERIES: { key: SeriesKey; label: string; color: string; width: number }[] = [
  { key: 'netWorth', label: 'Net worth', color: 'var(--ink)', width: 2.5 },
  { key: 'k401', label: '401(k)', color: 'var(--series-1)', width: 2 },
  { key: 'ira', label: 'IRA', color: 'var(--series-2)', width: 2 },
  { key: 'brokerage', label: 'Brokerage', color: 'var(--series-3)', width: 2 },
  { key: 'cash', label: 'Cash', color: 'var(--series-4)', width: 2 },
  { key: 'hsa', label: 'HSA', color: 'var(--series-5)', width: 2 },
]

const W = 640
const H = 300
const PAD = { top: 12, right: 12, bottom: 28, left: 52 }

/** Round a maximum up to a tidy axis ceiling with four intervals. */
function niceMax(max: number): { top: number; ticks: number[] } {
  if (max <= 0) return { top: 1, ticks: [0, 1] }
  const raw = max / 4
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  return { top: step * 4, ticks: [0, 1, 2, 3, 4].map((i) => i * step) }
}

function Swatch({ color }: { color: string }) {
  return <span aria-hidden="true" className="inline-block h-0.5 w-3.5 shrink-0 rounded-full" style={{ background: color }} />
}

function Chart({
  points,
  series,
  value,
  label,
}: {
  points: ProjectionPoint[]
  series: typeof SERIES
  value: (p: ProjectionPoint, k: SeriesKey) => number
  label: string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const n = points.length
  const { top, ticks } = niceMax(Math.max(...points.flatMap((p) => series.map((s) => value(p, s.key)))))
  const x = (i: number) => PAD.left + (n > 1 ? (i / (n - 1)) * (W - PAD.left - PAD.right) : 0)
  const y = (v: number) => H - PAD.bottom - (Math.min(top, Math.max(0, v)) / top) * (H - PAD.top - PAD.bottom)
  const path = (k: SeriesKey) => points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(value(p, k)).toFixed(1)}`).join('')
  const everyN = n > 32 ? 10 : 5
  const h = hover !== null ? points[hover] : null

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none"
        role="img"
        aria-label={label}
        onPointerMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect()
          const px = ((e.clientX - box.left) / box.width) * W
          const i = Math.round(((px - PAD.left) / (W - PAD.left - PAD.right)) * (n - 1))
          setHover(Math.min(n - 1, Math.max(0, i)))
        }}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth="1" />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--muted)" className="num">
              {usdCompact(t)}
            </text>
          </g>
        ))}
        {points.map((p, i) =>
          p.age % everyN === 0 || i === n - 1 ? (
            <text key={p.age} x={x(i)} y={H - 8} textAnchor={i === n - 1 ? 'end' : 'middle'} fontSize="11" fill="var(--muted)" className="num">
              {i === n - 1 && p.age % everyN !== 0 ? `age ${p.age}` : p.age}
            </text>
          ) : null,
        )}
        {/* Accounts first, net worth last so the total sits on top. */}
        {[...series].reverse().map((s) => (
          <path key={s.key} d={path(s.key)} fill="none" stroke={s.color} strokeWidth={s.width} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {h && hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--field)" strokeWidth="1" />
            {series.map((s) => (
              <circle key={s.key} cx={x(hover)} cy={y(value(h, s.key))} r="4" fill={s.color} stroke="var(--card)" strokeWidth="2" />
            ))}
          </g>
        )}
      </svg>
      {h && hover !== null && (
        <div
          className="num pointer-events-none absolute top-2 z-10 min-w-44 rounded-lg border border-line bg-card px-3 py-2 text-xs shadow-sm"
          style={hover > n / 2 ? { right: `${100 - (x(hover) / W) * 100 + 2}%` } : { left: `${(x(hover) / W) * 100 + 2}%` }}
        >
          <p className="mb-1 font-medium">Age {h.age}</p>
          {series.map((s) => (
            <p key={s.key} className="flex items-center gap-2 whitespace-nowrap">
              <Swatch color={s.color} />
              {s.label}
              <span className={`ml-auto pl-4 ${s.key === 'netWorth' ? 'font-semibold' : 'font-medium'}`}>{usd(value(h, s.key))}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

function when(step: StepForecast, age: number, retireAge: number): string {
  if (!step.applicable) return 'Not applicable'
  if (step.months === null) return `After age ${retireAge}`
  if (step.months === 0) return 'Now'
  const m = step.months + 1
  const years = Math.floor(m / 12)
  const rest = m % 12
  const span = [years ? `${years} yr` : '', rest ? `${rest} mo` : ''].filter(Boolean).join(' ')
  return `Age ${age + years} · in ${span}`
}

export function Projection() {
  const { state, setProjection, setFoo } = useStore()
  const { tax, budget, savings, pay } = useDerived()
  const { profile, foo, projection: s } = state
  const [real, setReal] = useState(false)
  const [scenario, setScenario] = useState<Scenario>('foo')

  // Savings line items drive the projection when they exist; otherwise fall back to the savings bucket.
  const tagged = savings.cash + savings.roth + savings.brokerage + savings.hsa + savings.debt
  const bucketAmount = budget.buckets.find((b) => b.id === 'savings')?.amount ?? 0
  const plan: SavingsPlan = useMemo(
    () =>
      tagged > 0
        ? { monthlySavings: tagged, current: savings }
        : {
            monthlySavings: Math.max(bucketAmount, foo.otherInvestingMonthly),
            current: { cash: 0, roth: 0, brokerage: foo.otherInvestingMonthly, hsa: 0, debt: 0, other: 0 },
          },
    [tagged, savings, bucketAmount, foo.otherInvestingMonthly],
  )

  const result = useMemo(() => projectFoo(profile, foo, s, plan, tax), [profile, foo, s, plan, tax])
  const { points } = result
  const last = points[points.length - 1]
  const other: Scenario = scenario === 'foo' ? 'pace' : 'foo'
  const adj = (v: number, p: ProjectionPoint) => v / (real ? p.deflator : 1)
  const value = (p: ProjectionPoint, k: SeriesKey) => adj(p[scenario][k], p)
  const used = (k: keyof Balances) => points.some((p) => p.foo[k] > 0.5 || p.pace[k] > 0.5)
  const series = SERIES.filter((x) => x.key === 'netWorth' || used(x.key))
  const hasDebt = used('debt')
  const rows = points.filter((p, i) => i === 0 || i === points.length - 1 || p.age % 5 === 0)
  const diff = last[scenario].netWorth - last[other].netWorth
  const million = result.millionAge[scenario]
  const name = SCENARIOS.find((x) => x.id === scenario)!.label

  const setBalance = (k: InvestedAccount, v: number) => setProjection({ balances: { ...s.balances, [k]: v } })
  const matchShare = foo.hasMatch && foo.matchPct > 0 ? Math.min(1, profile.k401Pct / foo.matchPct) : 0
  const contributions: [string, number][] = [
    ['401(k), from your paycheck', pay.k401Annual / 12],
    ['Employer match', ((profile.salary / 12) * s.employerMatchPct * matchShare) / 100],
    ['HSA, from your paycheck', (profile.hsaPerPaycheck * PERIODS_PER_YEAR[profile.payFrequency]) / 12],
    ['Roth IRA', plan.current.roth],
    ['HSA, direct', plan.current.hsa],
    ['Brokerage', plan.current.brokerage],
    ['Cash savings', plan.current.cash],
    ['Extra debt payments', plan.current.debt],
  ]

  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      <div className="space-y-4 lg:order-2">
        <div role="group" aria-label="Scenario" className="inline-flex rounded-lg border border-line bg-card p-0.5">
          {SCENARIOS.map((x) => (
            <button
              key={x.id}
              type="button"
              aria-pressed={scenario === x.id}
              onClick={() => setScenario(x.id)}
              className={`min-h-9 rounded-md px-3.5 text-sm ${scenario === x.id ? 'bg-accent font-medium text-on-accent' : 'text-muted hover:text-ink'}`}
            >
              {x.label}
            </button>
          ))}
        </div>

        <Hero label={`${name} · net worth at age ${last.age}`} live>
          <p className="num mt-2 text-5xl font-semibold tracking-tighter">{usdCompact(adj(last[scenario].netWorth, last))}</p>
          <p className="num mt-2 text-sm text-muted">
            {real ? "In today's dollars" : `About ${usdCompact(last[scenario].netWorth / last.deflator)} in today's dollars`} · {usdCompact(adj(Math.abs(diff), last))}{' '}
            {diff >= 0 ? 'more' : 'less'} than {scenario === 'foo' ? 'your current allocations' : 'following the plan'} ({usdCompact(adj(last[other].netWorth, last))})
            {million !== null && ` · first $1M at age ${million}`}
          </p>
        </Hero>

        {profile.salary <= 0 && (
          <p className="rounded-xl border border-line bg-card p-4 text-sm text-muted">Enter your salary on the Paycheck tab to project contributions.</p>
        )}

        {points.length > 1 && (
          <Card title="Growth by account" aside={real ? "Today's dollars" : 'Future dollars'}>
            <ul className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
              {series.map((x) => (
                <li key={x.key} className="flex items-center gap-1.5">
                  <Swatch color={x.color} />
                  {x.label}
                </li>
              ))}
            </ul>
            <Chart
              points={points}
              series={series}
              value={value}
              label={`${name}: projected balances by age. Net worth reaches ${usdCompact(value(last, 'netWorth'))} at age ${last.age}. Full figures are in the table below.`}
            />
            <Toggle label="Show in today's dollars" checked={real} onChange={setReal} />
          </Card>
        )}

        <Card title="Balances by age" aside={name}>
          <div className="overflow-x-auto">
            <table className="num w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th scope="col" className="py-2 font-medium">
                    Age
                  </th>
                  {series
                    .filter((x) => x.key !== 'netWorth')
                    .map((x) => (
                      <th key={x.key} scope="col" className="py-2 pl-3 text-right font-medium whitespace-nowrap">
                        {x.label}
                      </th>
                    ))}
                  {hasDebt && (
                    <th scope="col" className="py-2 pl-3 text-right font-medium">
                      Debt
                    </th>
                  )}
                  <th scope="col" className="py-2 pl-3 text-right font-medium whitespace-nowrap">
                    Net worth
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((p, i) => (
                  <tr key={p.age}>
                    <th scope="row" className="py-2 text-left font-normal whitespace-nowrap">
                      {p.age}
                      {i === 0 && <span className="text-muted"> · today</span>}
                    </th>
                    {series
                      .filter((x) => x.key !== 'netWorth')
                      .map((x) => (
                        <td key={x.key} className="py-2 pl-3 text-right text-muted">
                          {usd(value(p, x.key))}
                        </td>
                      ))}
                    {hasDebt && <td className="py-2 pl-3 text-right text-muted">{p[scenario].debt > 0.5 ? `−${usd(adj(p[scenario].debt, p))}` : usd(0)}</td>}
                    <td className="py-2 pl-3 text-right font-medium">{usd(value(p, 'netWorth'))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted">Net worth is all accounts plus cash and goal savings, minus debt.</p>
        </Card>
      </div>

      <div className="space-y-4 lg:order-1">
        <Card title="What you have today">
          <Grid>
            <Num label="401(k)" prefix="$" value={s.balances.k401} onChange={(v) => setBalance('k401', v)} />
            <Num label="IRA" prefix="$" value={s.balances.ira} hint="Roth and traditional" onChange={(v) => setBalance('ira', v)} />
            <Num label="Brokerage" prefix="$" value={s.balances.brokerage} onChange={(v) => setBalance('brokerage', v)} />
            <Num label="Cash" prefix="$" value={foo.cash} hint="Same as Playbook savings" onChange={(cash) => setFoo({ cash })} />
            <Num label="HSA" prefix="$" value={s.balances.hsa} onChange={(v) => setBalance('hsa', v)} />
          </Grid>
        </Card>

        <Card title="What goes in each month" aside={tagged > 0 ? 'From your budget' : 'No savings line items yet'}>
          <dl className="num divide-y divide-line text-sm">
            {contributions
              .filter(([, v]) => v > 0)
              .map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 py-2">
                  <dt>{k}</dt>
                  <dd className="font-medium">{usd(v)}</dd>
                </div>
              ))}
          </dl>
          <p className="mt-3 text-[13px] text-muted">
            {tagged > 0
              ? `Your savings line items total ${usd(result.monthlySavings)} a month. "Current allocations" keeps them where they go today; "Following the plan" sends the same ${usd(result.monthlySavings)} down the nine steps instead. Change them on the Budget tab.`
              : `Using your budget's savings bucket (${usd(result.monthlySavings)} a month). Add savings line items on the Budget tab and pick where each one goes to see your real allocations.`}
          </p>
        </Card>

        <Card title="Assumptions">
          <Grid>
            <Num label="Retirement age" value={s.retireAge} max={100} hint={`You are ${profile.age}`} onChange={(retireAge) => setProjection({ retireAge })} />
            <Num label="Investment return" suffix="%" value={s.annualReturnPct} max={30} hint="Per year" onChange={(annualReturnPct) => setProjection({ annualReturnPct })} />
            <Num label="Cash interest" suffix="%" value={s.cashReturnPct} max={30} hint="Per year" onChange={(cashReturnPct) => setProjection({ cashReturnPct })} />
            <Num label="Salary growth" suffix="%" value={s.salaryGrowthPct} max={30} hint="Per year" onChange={(salaryGrowthPct) => setProjection({ salaryGrowthPct })} />
            <Num label="Inflation" suffix="%" value={s.inflationPct} max={30} hint="Per year" onChange={(inflationPct) => setProjection({ inflationPct })} />
            <Num
              label="Employer match"
              suffix="%"
              value={s.employerMatchPct}
              max={100}
              hint="Of salary, at full match"
              onChange={(employerMatchPct) => setProjection({ employerMatchPct })}
            />
          </Grid>
        </Card>

        <Card title="When each step is complete" aside="Following the plan">
          <ol className="divide-y divide-line text-sm">
            {result.steps.map((step) => (
              <li key={step.n} className="flex items-baseline justify-between gap-3 py-2">
                <span>
                  <span className="num mr-3 text-muted">{step.n}</span>
                  {step.title}
                </span>
                <span className={`num shrink-0 text-right ${step.months === 0 ? 'font-medium' : 'text-muted'}`}>
                  {step.months === 0 && <span aria-hidden="true">✓ </span>}
                  {when(step, profile.age, s.retireAge)}
                </span>
              </li>
            ))}
          </ol>
          {result.steps[6].months === null && profile.salary > 0 && (
            <p className="mt-3 border-t border-line pt-3 text-[13px] text-muted">
              At {usd(result.monthlySavings)} a month you never reach 25% of gross invested, so the later steps stay open.
            </p>
          )}
        </Card>

        <details className="rounded-xl border border-line bg-card p-5 text-sm sm:p-6">
          <summary className="cursor-pointer font-medium">How this is calculated</summary>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted">
            <li>
              <strong className="font-medium text-ink">Following the plan</strong> sends {usd(result.monthlySavings)} a month (growing with salary) down the nine steps in order: deductible and emergency fund into cash, the match and employer plan into the 401(k), Roth IRA into the IRA, then brokerage up to 25% of gross, goals, low-interest debt. Anything left over goes to brokerage.
            </li>
            <li>
              <strong className="font-medium text-ink">Current allocations</strong> keeps every contribution where it goes today. Amounts above an account's annual limit spill into brokerage.
            </li>
            <li>Both include payroll 401(k) and HSA contributions and the employer match. Debt minimums are assumed to come from the rest of your budget.</li>
            <li>
              Investments return a constant {s.annualReturnPct}% a year, compounded monthly; cash earns {s.cashReturnPct}%. Real markets vary and can lose money.
            </li>
            <li>Contributions grow with salary. Limits, expenses, and the deductible rise with inflation.</li>
            <li>Bonus, RSUs, and ESPP are not added to contributions. Taxes on withdrawals, and the tax savings from extra pre-tax contributions, are ignored.</li>
            <li>A hypothetical illustration, not a prediction or investment advice.</li>
          </ul>
        </details>
      </div>
    </div>
  )
}
