// Tax data registry. A yearly update is a data change: add a folder for the
// new year, register it here, and nothing in the engine needs to change.
import type { TaxYear } from '../../engine/types'
import federal2026 from './2026/federal.json'
import ca2026 from './2026/CA.json'
import limits2026 from './2026/limits.json'

export const TAX_YEARS: Record<number, TaxYear> = {
  2026: {
    year: 2026,
    federal: federal2026 as TaxYear['federal'],
    states: { CA: ca2026 as TaxYear['states'][string] },
    limits: limits2026 as TaxYear['limits'],
  },
}

export const LATEST_TAX_YEAR = 2026

export function getTaxYear(year: number): TaxYear {
  return TAX_YEARS[year] ?? TAX_YEARS[LATEST_TAX_YEAR]
}
