import type { CustomDeduction, FilingStatus, PayFrequency, PayLine } from '../engine'
import { newId, useDerived, useStore } from '../state'
import { Button, Card, DateField, Grid, Num, Select, Text, Toggle, pct, usd } from '../ui'

const KIND_LABEL: Record<PayLine['kind'], string> = {
  pretax: 'Pre-tax deductions',
  tax: 'Taxes',
  posttax: 'Post-tax deductions',
}

function Row({ label, annual, periods, strong, minus }: { label: string; annual: number; periods: number; strong?: boolean; minus?: boolean }) {
  return (
    <tr className={strong ? "font-semibold" : ""}>
      <th scope="row" className="py-1.5 pr-2 text-left font-[inherit]">
        {label}
      </th>
      {[annual / periods, annual / 12, annual].map((v, i) => (
        <td key={i} className="num py-1.5 pl-2 text-right whitespace-nowrap">
          {minus && v > 0 ? "−" : ""}
          {usd(v, i < 2)}
        </td>
      ))}
    </tr>
  )
}

export function Paycheck({ goTo }: { goTo: (tab: 'playbook') => void }) {
  const { state, setProfile } = useStore()
  const { pay, tax, extras } = useDerived()
  const hasExtras = extras.bonus.gross > 0 || extras.rsu.gross > 0 || extras.espp.contribution > 0
  const p = state.profile

  const patchDeduction = (id: string, patch: Partial<CustomDeduction>) =>
    setProfile({ deductions: p.deductions.map((d) => (d.id === id ? { ...d, ...patch } : d)) })

  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      <section className="rounded-xl border border-line bg-card p-5 sm:p-6 lg:col-start-2 lg:row-start-1" aria-live="polite">
        <p className="text-xs font-medium tracking-wider text-muted uppercase">Estimated take-home · tax year {pay.taxYear}</p>
        <p className="num mt-2 text-5xl font-semibold tracking-tighter">
          {usd(pay.net / pay.periods, true)}
          <span className="ml-2 text-base font-normal tracking-normal text-muted">per paycheck</span>
        </p>
        <p className="num mt-2 text-sm text-muted">
          {usd(pay.net / 12)} per month · {usd(pay.net)} per year
        </p>
      </section>

      <div className="space-y-4 lg:col-start-1 lg:row-span-2 lg:row-start-1">
      <Card title="Income">
        <Grid>
          <Num label="Annual salary" prefix="$" value={p.salary} onChange={(salary) => setProfile({ salary })} />
          <Select<PayFrequency>
            label="Pay frequency"
            value={p.payFrequency}
            onChange={(payFrequency) => setProfile({ payFrequency })}
            options={[
              { value: 'weekly', label: 'Weekly (52)' },
              { value: 'biweekly', label: 'Every 2 weeks (26)' },
              { value: 'semimonthly', label: 'Twice a month (24)' },
              { value: 'monthly', label: 'Monthly (12)' },
            ]}
          />
          <DateField label="Next pay date" value={p.nextPayDate} onChange={(nextPayDate) => setProfile({ nextPayDate })} hint="Anchors the payday checklist" />
          <Select<FilingStatus>
            label="Filing status"
            value={p.filingStatus}
            onChange={(filingStatus) => setProfile({ filingStatus })}
            options={[
              { value: 'single', label: 'Single' },
              { value: 'mfj', label: 'Married filing jointly' },
              { value: 'hoh', label: 'Head of household' },
            ]}
          />
          <Select
            label="State"
            value={p.state}
            onChange={(state) => setProfile({ state })}
            options={[
              ...Object.values(tax.states).map((s) => ({ value: s.code, label: s.name })),
              { value: 'none', label: 'No state income tax' },
            ]}
          />
          <Num label="Age" value={p.age} max={120} hint="For catch-up limits" onChange={(age) => setProfile({ age })} />
        </Grid>
      </Card>

      <Card title="Deductions">
        <Grid>
          <Num
            label="401(k) contribution"
            suffix="%"
            value={p.k401Pct}
            max={100}
            hint={pay.k401Capped ? `Capped at the ${tax.year} limit` : 'Traditional, pre-tax'}
            onChange={(k401Pct) => setProfile({ k401Pct })}
          />
          <Num
            label="Health premiums"
            prefix="$"
            value={p.healthPremiumPerPaycheck}
            hint="Per paycheck"
            onChange={(healthPremiumPerPaycheck) => setProfile({ healthPremiumPerPaycheck })}
          />
          <Num label="HSA (payroll)" prefix="$" value={p.hsaPerPaycheck} hint="Per paycheck" onChange={(hsaPerPaycheck) => setProfile({ hsaPerPaycheck })} />
        </Grid>
        <div className="mt-3 space-y-3">
          {p.deductions.map((d) => (
            <div key={d.id} className="grid grid-cols-2 items-end gap-3 border-t border-line pt-3 sm:grid-cols-[2fr_1fr_auto_auto]">
              <Text label="Deduction name" value={d.name} placeholder="Roth 401(k), FSA, union dues" onChange={(name) => patchDeduction(d.id, { name })} />
              <Num label="Per paycheck" prefix="$" value={d.amountPerPaycheck} onChange={(amountPerPaycheck) => patchDeduction(d.id, { amountPerPaycheck })} />
              <Toggle label="Pre-tax" checked={d.preTax} onChange={(preTax) => patchDeduction(d.id, { preTax })} />
              <Button variant="ghost" onClick={() => setProfile({ deductions: p.deductions.filter((x) => x.id !== d.id) })}>
                Remove<span className="sr-only"> {d.name || 'deduction'}</span>
              </Button>
            </div>
          ))}
          <Button onClick={() => setProfile({ deductions: [...p.deductions, { id: newId(), name: '', preTax: false, amountPerPaycheck: 0 }] })}>
            + Add a deduction
          </Button>
        </div>
      </Card>

      <Card title="Bonus and equity" aside="Optional">
        <Grid>
          <Num label="Annual bonus" prefix="$" value={p.bonusAnnual} hint="Before tax" onChange={(bonusAnnual) => setProfile({ bonusAnnual })} />
          <Num label="RSUs vesting" prefix="$" value={p.rsuAnnual} hint="Value per year" onChange={(rsuAnnual) => setProfile({ rsuAnnual })} />
          <Num label="ESPP contribution" suffix="%" value={p.esppPct} max={100} hint="Of base salary" onChange={(esppPct) => setProfile({ esppPct })} />
          <Num label="ESPP discount" suffix="%" value={p.esppDiscountPct} max={50} hint="Usually 15" onChange={(esppDiscountPct) => setProfile({ esppDiscountPct })} />
        </Grid>
        {p.bonusAnnual > 0 && p.k401Pct > 0 && (
          <div className="mt-2">
            <Toggle label="My 401(k) percentage also comes out of my bonus" checked={p.k401OnBonus} onChange={(k401OnBonus) => setProfile({ k401OnBonus })} />
          </div>
        )}
      </Card>
      </div>

      <div className="space-y-4 lg:col-start-2 lg:row-start-2">
      <Card title="Breakdown" aside="Estimate">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
                <th scope="col" className="py-1.5 text-left font-semibold">
                  <span className="sr-only">Item</span>
                </th>
                <th scope="col" className="py-1.5 pl-2 text-right font-semibold">
                  Paycheck
                </th>
                <th scope="col" className="py-1.5 pl-2 text-right font-semibold">
                  Month
                </th>
                <th scope="col" className="py-1.5 pl-2 text-right font-semibold">
                  Year
                </th>
              </tr>
            </thead>
            <tbody>
              <Row periods={pay.periods} label="Gross pay" annual={pay.gross} strong />
            </tbody>
            {(['pretax', 'tax', 'posttax'] as const).map((kind) => {
              const lines = pay.lines.filter((l) => l.kind === kind)
              if (lines.length === 0) return null
              return (
                <tbody key={kind}>
                  <tr>
                    <th scope="colgroup" colSpan={4} className="pt-3 pb-1 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                      {KIND_LABEL[kind]}
                    </th>
                  </tr>
                  {lines.map((l) => (
                    <Row periods={pay.periods} key={l.key} label={l.label} annual={l.annual} minus />
                  ))}
                </tbody>
              )
            })}
            <tfoot className="border-t-2 border-ink">
              <Row periods={pay.periods} label="Net pay" annual={pay.net} strong />
            </tfoot>
          </table>
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
          <div>
            <dt className="text-muted">Effective tax rate</dt>
            <dd className="num text-lg font-semibold">{pct(pay.effectiveTaxRate)}</dd>
          </div>
          <div>
            <dt className="text-muted">Federal bracket</dt>
            <dd className="num text-lg font-semibold">{pct(pay.marginalFederalRate, 0)}</dd>
          </div>
          <div>
            <dt className="text-muted">State bracket</dt>
            <dd className="num text-lg font-semibold">{pct(pay.marginalStateRate, 1)}</dd>
          </div>
        </dl>
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-semibold">Assumptions and sources</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
            {pay.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </details>
      </Card>
      {hasExtras && (
        <Card title="Bonus and equity" aside="Per year, estimate">
          <div className="overflow-x-auto">
            <table className="num w-full text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-muted">
                  <th scope="col" className="py-1.5 text-left font-medium">
                    <span className="sr-only">Item</span>
                  </th>
                  <th scope="col" className="py-1.5 pl-2 text-right font-medium">
                    Before tax
                  </th>
                  <th scope="col" className="py-1.5 pl-2 text-right font-medium">
                    Tax
                  </th>
                  <th scope="col" className="py-1.5 pl-2 text-right font-medium">
                    You keep
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {extras.bonus.gross > 0 && (
                  <tr>
                    <th scope="row" className="py-2 pr-2 text-left font-medium">
                      Bonus
                      {extras.bonus.k401 > 0 && <span className="block text-xs font-normal text-muted">{usd(extras.bonus.k401)} to 401(k)</span>}
                    </th>
                    <td className="py-2 pl-2 text-right">{usd(extras.bonus.gross)}</td>
                    <td className="py-2 pl-2 text-right">−{usd(extras.bonus.tax)}</td>
                    <td className="py-2 pl-2 text-right font-semibold">{usd(extras.bonus.net)}</td>
                  </tr>
                )}
                {extras.rsu.gross > 0 && (
                  <tr>
                    <th scope="row" className="py-2 pr-2 text-left font-medium">
                      RSUs<span className="block text-xs font-normal text-muted">Kept as shares, after selling to cover tax</span>
                    </th>
                    <td className="py-2 pl-2 text-right">{usd(extras.rsu.gross)}</td>
                    <td className="py-2 pl-2 text-right">−{usd(extras.rsu.tax)}</td>
                    <td className="py-2 pl-2 text-right font-semibold">{usd(extras.rsu.net)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {extras.espp.contribution > 0 && (
            <dl className="num mt-3 grid grid-cols-3 gap-3 border-t border-line pt-3 text-sm">
              <div>
                <dt className="text-[13px] text-muted">ESPP you pay in</dt>
                <dd className="font-medium">{usd(extras.espp.contribution)}</dd>
              </div>
              <div>
                <dt className="text-[13px] text-muted">Stock you get</dt>
                <dd className="font-medium">{usd(extras.espp.stockValue)}</dd>
              </div>
              <div>
                <dt className="text-[13px] text-muted">Built-in gain</dt>
                <dd className="font-medium">{usd(extras.espp.gain)}</dd>
              </div>
            </dl>
          )}
          {extras.espp.capped && <p className="mt-2 text-xs text-muted">ESPP contribution capped by the IRS limit of $25,000 of stock per year.</p>}
          <dl className="num mt-4 grid grid-cols-3 gap-3 border-t border-line pt-3 text-sm">
            <div>
              <dt className="text-[13px] text-muted">Total compensation</dt>
              <dd className="text-lg font-semibold">{usd(extras.totalGross)}</dd>
            </div>
            <div>
              <dt className="text-[13px] text-muted">Total after tax</dt>
              <dd className="text-lg font-semibold">{usd(extras.totalNet)}</dd>
            </div>
            <div>
              <dt className="text-[13px] text-muted">Effective tax rate</dt>
              <dd className="text-lg font-semibold">{pct(extras.effectiveTaxRate)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted">
            Regular paychecks above do not include bonus or RSUs. Their tax is estimated at your top brackets ({pct(extras.marginalFederalRate, 0)} federal,{" "}
            {pct(extras.marginalStateRate, 1)} state). Employers withhold at flat rates, so expect a difference at tax time. ESPP gain is before tax.
          </p>
        </Card>
      )}
      <Button variant="primary" onClick={() => goTo('playbook')}>
        See where I am in the order of operations →
      </Button>
      </div>
    </div>
  )
}
