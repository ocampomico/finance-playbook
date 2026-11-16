import { useRef, useState } from 'react'
import { hydrate, sampleState, useDerived, useStore } from '../state'
import { Button, Card, usd } from '../ui'

export function Data() {
  const { state, replace, reset } = useStore()
  const { tax } = useDerived()
  const fileRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `finance-playbook-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
    setMessage('Exported.')
  }

  const importJson = async (file: File) => {
    try {
      const parsed: unknown = JSON.parse(await file.text())
      if (!parsed || typeof parsed !== 'object' || !('profile' in parsed)) throw new Error('not a playbook export')
      replace(hydrate(parsed))
      setMessage('Imported.')
    } catch {
      setMessage('That file is not a valid Playbook export. Nothing was changed.')
    }
  }

  const sources = [
    { name: 'Federal income tax and FICA', d: tax.federal },
    ...Object.values(tax.states).map((s) => ({ name: `${s.name} income tax and SDI`, d: s })),
    { name: 'Contribution limits', d: tax.limits },
  ]

  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      <Card title="Your data">
        <p className="mb-3 text-sm text-muted">
          Everything you enter is stored only in this browser. Nothing is sent to a server, and no account numbers or credentials are collected.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={exportJson}>Export JSON</Button>
          <Button onClick={() => fileRef.current?.click()}>Import JSON</Button>
          <Button onClick={() => replace(sampleState())}>Load sample data</Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            aria-label="Import a Playbook JSON file"
            tabIndex={-1}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void importJson(f)
              e.target.value = ''
            }}
          />
        </div>
        <div className="mt-4 border-t border-line pt-4">
          {confirmingDelete ? (
            <div role="alert" className="space-y-2">
              <p className="text-sm font-medium text-warn">Delete all data in this browser? This cannot be undone. Export first if you want a copy.</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="danger"
                  onClick={() => {
                    reset()
                    setConfirmingDelete(false)
                    setMessage('All data deleted.')
                  }}
                >
                  Yes, delete everything
                </Button>
                <Button onClick={() => setConfirmingDelete(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <Button variant="danger" onClick={() => setConfirmingDelete(true)}>
              Delete all data
            </Button>
          )}
        </div>
        <p className="mt-3 min-h-5 text-sm" role="status">
          {message}
        </p>
      </Card>

      <Card title={`Tax year ${tax.year} tables`} className="lg:row-span-2">
        <ul className="space-y-3 text-sm">
          {sources.map(({ name, d }) => (
            <li key={name}>
              <p className="font-semibold">
                {name}{' '}
                <span className={`ml-1 rounded-full px-2 py-0.5 text-xs ${d.status === 'estimated' ? 'bg-warn-soft text-warn' : 'bg-accent-soft'}`}>
                  {d.status === 'estimated' ? '⚠ Estimated' : '✓ Published'} · as of {d.asOf}
                </span>
              </p>
              <p className="mt-1 text-muted">
                {d.source}{' '}
                <a className="text-accent underline" href={d.sourceUrl} target="_blank" rel="noreferrer">
                  Source
                </a>
              </p>
            </li>
          ))}
        </ul>
        <dl className="num mt-4 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-line pt-3 text-sm sm:grid-cols-3">
          {[
            ['401(k) limit', usd(tax.limits.k401.limit)],
            ['IRA limit', usd(tax.limits.ira.limit)],
            ['HSA self / family', `${usd(tax.limits.hsa.self)} / ${usd(tax.limits.hsa.family)}`],
            ['Social Security wage base', usd(tax.federal.fica.socialSecurityWageBase)],
            ['Standard deduction (single)', usd(tax.federal.standardDeduction.single)],
            ['Standard deduction (joint)', usd(tax.federal.standardDeduction.mfj)],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-muted">{k}</dt>
              <dd className="font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card title="About">
        <p className="text-sm text-muted">
          A personal tool built around the Money Guy{' '}
          <a className="text-accent underline" href="https://moneyguy.com/?p=24602" target="_blank" rel="noreferrer">
            Financial Order of Operations
          </a>
          . Not affiliated with or endorsed by The Money Guy Show. Results are estimates for planning, not tax, legal, or investment advice.
        </p>
      </Card>
    </div>
  )
}
