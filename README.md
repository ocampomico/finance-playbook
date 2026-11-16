# Finance Playbook

A personal finance tool that turns a salary into a take-home number, a monthly budget, a ranked answer to "what should my next dollar do?", a payday checklist, and a projection of where each account ends up.

Everything runs in the browser. Data is stored in `localStorage` only; nothing is sent to a server.

## Features

- **Paycheck**: take-home pay from salary after federal tax, FICA, California tax and SDI, and deductions. Bonus, RSUs, and ESPP are estimated separately.
- **Playbook**: progress through a nine-step order of operations, with the next action and a dollar amount.
- **Budget**: split take-home by percentage (presets or saved custom splits), add line items, see what is left to allocate.
- **Payday**: a checklist for each pay date with amounts filled in, a streak, and history.
- **Projection**: balances by account and age, following the plan versus current allocations.
- **Data**: JSON export and import, reset, and the tax tables in use.

## Develop

```sh
npm install
npm run dev     # http://localhost:5173
npm test        # engine unit tests
npm run build   # production build into dist/
```

Production builds assume the app is served from `/tools/financeplaybook/`. Set `BASE_PATH=/` to build for the site root.

## Structure

- `src/engine/`: pure TypeScript calculation engine (tax, order of operations, budget, checklist, projection). No UI imports; covered by `engine.test.ts`.
- `src/data/tax/<year>/`: versioned tax tables and contribution limits as JSON, each with a source and an "as of" date. A yearly update is a data change.
- `src/views/`: one file per tab.
- `src/state.tsx`: app state, persistence, and derived values.

## Notes

Results are estimates for planning, not tax, legal, or investment advice. The California 2026 brackets are estimated until the Franchise Tax Board publishes the final schedule; see `src/data/tax/2026/CA.json`.

Not affiliated with or endorsed by The Money Guy Show.
