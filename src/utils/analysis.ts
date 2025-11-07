export type Row = Record<string, any>

export function inferType(value: any): 'number' | 'string' | 'boolean' | 'date' | 'null' {
  if (value === null || value === undefined || value === '') return 'null'
  if (typeof value === 'boolean') return 'boolean'
  const num = Number(value)
  if (!Number.isNaN(num) && value !== '' && typeof value !== 'boolean') return 'number'
  // rudimentary date detection
  const d = new Date(value)
  if (!isNaN(d.getTime()) && /[-:/]/.test(String(value))) return 'date'
  return 'string'
}

export function getColumnTypes(rows: Row[]): Record<string, Set<string>> {
  const types: Record<string, Set<string>> = {}
  rows.forEach(r => {
    Object.entries(r).forEach(([k, v]) => {
      types[k] = types[k] || new Set()
      types[k].add(inferType(v))
    })
  })
  return types
}

export function missingPercentages(rows: Row[]): Record<string, number> {
  if (rows.length === 0) return {}
  const cols = Object.keys(rows[0])
  const counts: Record<string, number> = Object.fromEntries(cols.map(c => [c, 0]))
  rows.forEach(r => cols.forEach(c => {
    const v = r[c]
    if (v === null || v === undefined || v === '') counts[c]++
  }))
  const total = rows.length
  const res: Record<string, number> = {}
  cols.forEach(c => res[c] = +(counts[c] * 100 / total).toFixed(2))
  return res
}

export function findDuplicates(rows: Row[]): { count: number, percent: number, examples: Row[] } {
  const seen = new Map<string, Row>()
  const dups: Row[] = []
  rows.forEach(r => {
    const key = JSON.stringify(r)
    if (seen.has(key)) dups.push(r)
    else seen.set(key, r)
  })
  const count = dups.length
  const percent = rows.length ? +(count * 100 / rows.length).toFixed(2) : 0
  return { count, percent, examples: dups.slice(0, 5) }
}

export function numericColumns(rows: Row[]): string[] {
  if (rows.length === 0) return []
  const cols = Object.keys(rows[0])
  return cols.filter(c => rows.some(r => inferType(r[c]) === 'number'))
}

export function toNumber(v: any): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function iqrOutliers(rows: Row[]): { byColumn: Record<string, number>, total: number } {
  const cols = numericColumns(rows)
  const byColumn: Record<string, number> = {}
  let total = 0
  cols.forEach(c => {
    const values = rows.map(r => toNumber(r[c])).filter((v): v is number => v !== null).sort((a,b)=>a-b)
    if (values.length < 5) { byColumn[c] = 0; return }
    const q1 = quantile(values, 0.25)
    const q3 = quantile(values, 0.75)
    const iqr = q3 - q1
    const lo = q1 - 1.5 * iqr
    const hi = q3 + 1.5 * iqr
    const count = values.filter(v => v < lo || v > hi).length
    byColumn[c] = count
    total += count
  })
  return { byColumn, total }
}

export function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q
  const base = Math.floor(pos)
  const rest = pos - base
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base])
  } else {
    return sorted[base]
  }
}

export function statsForNumeric(rows: Row[]): Record<string, { min:number, max:number, mean:number, median:number, std:number, values:number[] }>{
  const cols = numericColumns(rows)
  const res: Record<string, any> = {}
  cols.forEach(c => {
    const values = rows.map(r => toNumber(r[c])).filter((v): v is number => v !== null)
    if (values.length === 0) return
    const min = Math.min(...values)
    const max = Math.max(...values)
    const mean = values.reduce((a,b)=>a+b,0)/values.length
    const median = quantile([...values].sort((a,b)=>a-b), 0.5)
    const variance = values.reduce((acc,v)=>acc+(v-mean)**2,0)/values.length
    const std = Math.sqrt(variance)
    res[c] = { min, max, mean, median, std, values }
  })
  return res
}

export function categoricalSummary(rows: Row[]): Record<string, { unique:number, top:[string, number][] }>{
  if (rows.length === 0) return {}
  const cols = Object.keys(rows[0])
  const res: Record<string, any> = {}
  cols.forEach(c => {
    const vals = rows.map(r => r[c]).filter(v => inferType(v) !== 'number' && v !== '' && v !== null && v !== undefined)
    const map = new Map<string, number>()
    vals.forEach(v => map.set(String(v), (map.get(String(v))||0)+1))
    const unique = map.size
    const top = Array.from(map.entries()).sort((a,b)=>b[1]-a[1]).slice(0,5)
    res[c] = { unique, top }
  })
  return res
}

export function correlationMatrix(rows: Row[]): { matrix:number[][], columns:string[] }{
  const cols = numericColumns(rows)
  const data = cols.map(c => rows.map(r => toNumber(r[c])).filter((v): v is number => v !== null))
  const n = cols.length
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0))
  for (let i=0;i<n;i++){
    for (let j=i;j<n;j++){
      const r = pearson(data[i], data[j])
      matrix[i][j] = matrix[j][i] = r
    }
  }
  return { matrix, columns: cols }
}

export function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length)
  if (n === 0) return 0
  const x = a.slice(0, n)
  const y = b.slice(0, n)
  const meanX = x.reduce((s,v)=>s+v,0)/n
  const meanY = y.reduce((s,v)=>s+v,0)/n
  let num = 0, denX = 0, denY = 0
  for (let i=0;i<n;i++){
    const dx = x[i]-meanX
    const dy = y[i]-meanY
    num += dx*dy
    denX += dx*dx
    denY += dy*dy
  }
  const den = Math.sqrt(denX*denY)
  return den === 0 ? 0 : +(num/den).toFixed(3)
}

export function scoreOverall(opts: {
  missingAvg: number,
  duplicatePercent: number,
  outlierTotal: number,
  rowCount: number,
  typeIssuesScore: number, // 0-100
  cardinalityScore: number // 0-100
}): number {
  const completeness = 100 - opts.missingAvg
  const duplicates = 100 - opts.duplicatePercent
  const outlierPenalty = Math.max(0, 100 - Math.min(100, (opts.outlierTotal / Math.max(1, opts.rowCount)) * 100))
  const score = 
    0.35 * completeness +
    0.20 * duplicates +
    0.15 * outlierPenalty +
    0.15 * opts.typeIssuesScore +
    0.15 * opts.cardinalityScore
  return Math.max(0, Math.min(100, +score.toFixed(1)))
}

export function healthBadge(score: number): { label: string, color: string }{
  if (score >= 90) return { label: 'Excellent', color: 'bg-green-600' }
  if (score >= 70) return { label: 'Good', color: 'bg-yellow-500' }
  if (score >= 50) return { label: 'Fair', color: 'bg-orange-500' }
  return { label: 'Poor', color: 'bg-red-600' }
}


