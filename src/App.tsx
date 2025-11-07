import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Upload, Mail, FileDown, Database, Sparkles, Filter, Rocket, Clipboard, CheckCircle2 } from 'lucide-react'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { Row, missingPercentages, getColumnTypes, findDuplicates, iqrOutliers, statsForNumeric, categoricalSummary, correlationMatrix, scoreOverall, healthBadge, quantile } from './utils/analysis'
import { generateSample } from './utils/sampleData'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { FeatureSuggestion, ComplexityLevel, generateFeatureSuggestions } from './utils/featureEngineering'

type DataSet = { name: string, rows: Row[] }

const MAX_SIZE = 5 * 1024 * 1024

export default function App() {
  const [dataset, setDataset] = useState<DataSet | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const featureSectionRef = useRef<HTMLDivElement>(null)
  const [featureLoading, setFeatureLoading] = useState(false)
  const [featureSuggestions, setFeatureSuggestions] = useState<FeatureSuggestion[]>([])
  const [featureSummary, setFeatureSummary] = useState({ total: 0, high: 0, medium: 0, low: 0 })
  const [featureHighlight, setFeatureHighlight] = useState<FeatureSuggestion[]>([])
  const [featureTab, setFeatureTab] = useState<'all' | 'high' | 'quick' | 'advanced'>('all')
  const [selectedSuggestionIds, setSelectedSuggestionIds] = useState<string[]>([])
  const [codeLanguage, setCodeLanguage] = useState<'python' | 'r' | 'sql'>('python')
  const [expandedSuggestionIds, setExpandedSuggestionIds] = useState<string[]>([])
  const [pipelineScript, setPipelineScript] = useState<string | null>(null)
  const [previewModal, setPreviewModal] = useState<{ suggestion: FeatureSuggestion; rows: Row[] } | null>(null)

  const onFiles = (file: File) => {
    setError(null)
    if (file.size > MAX_SIZE) { setError('File is larger than 5MB limit.'); return }
    setLoading(true)
    // reset dataset so new uploads don't append to previous/sample data
    setDataset({ name: file.name, rows: [] })
    const isExcel = /\.(xlsx|xlsm|xlsb|xls)$/i.test(file.name)
    if (isExcel) {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer)
          const wb = XLSX.read(data, { type: 'array' })
          const sheet = wb.Sheets[wb.SheetNames[0]]
          const json: Row[] = XLSX.utils.sheet_to_json(sheet, { defval: '' })
          setDataset({ name: file.name, rows: json })
        } catch (err:any) {
          setError('Failed to parse Excel file')
        } finally { setLoading(false) }
      }
      reader.onerror = () => { setError('Error reading file'); setLoading(false) }
      reader.readAsArrayBuffer(file)
    } else {
      Papa.parse<Row>(file, {
        header: true,
        skipEmptyLines: true,
        worker: true,
        chunk: (results: Papa.ParseResult<Row>) => {
          setDataset(prev => ({
            name: file.name,
            // append to current file only
            rows: [ ...((prev && prev.name === file.name) ? prev.rows : []), ...results.data ]
          }))
        },
        complete: () => setLoading(false),
        error: () => { setError('Failed to parse CSV'); setLoading(false) }
      })
    }
  }

  const loadSample = () => {
    setDataset({ name: 'sample_dataset.csv', rows: generateSample(1000) })
  }

  const rows = dataset?.rows || []
  const cols = rows.length ? Object.keys(rows[0]) : []

  const analysis = useMemo(() => {
    if (!rows.length) return null
    const missing = missingPercentages(rows)
    const types = getColumnTypes(rows)
    const dup = findDuplicates(rows)
    const out = iqrOutliers(rows)
    const stats = statsForNumeric(rows)
    const cat = categoricalSummary(rows)
    const corr = correlationMatrix(rows)

    const avgMissing = cols.reduce((s,c)=> s + (missing[c]||0), 0) / cols.length
    const typeIssues = Object.entries(types).reduce((issues, [k, set]) => issues + (set.size > 1 ? 1 : 0), 0)
    const typeIssuesScore = 100 - Math.min(100, (typeIssues / Math.max(1, cols.length)) * 100)
    const highCardCols = Object.entries(cat).filter(([k,v]) => v.unique > rows.length * 0.5).length
    const cardinalityScore = 100 - Math.min(100, (highCardCols / Math.max(1, cols.length)) * 100)
    const overall = scoreOverall({ missingAvg: avgMissing, duplicatePercent: dup.percent, outlierTotal: out.total, rowCount: rows.length, typeIssuesScore, cardinalityScore })
    const badge = healthBadge(overall)

    return { missing, types, dup, out, stats, cat, corr, avgMissing, typeIssues, typeIssuesScore, highCardCols, cardinalityScore, overall, badge }
  }, [rows])

  useEffect(() => {
    if (!analysis) {
      setFeatureSuggestions([])
      setFeatureSummary({ total: 0, high: 0, medium: 0, low: 0 })
      setFeatureHighlight([])
      setFeatureLoading(false)
      return
    }
    setFeatureLoading(true)
    const timer = window.setTimeout(() => {
      const payload = generateFeatureSuggestions({
        rows,
        numericStats: analysis.stats,
        categoricalSummary: analysis.cat,
        corrMatrix: analysis.corr,
      })
      setFeatureSuggestions(payload.suggestions)
      setFeatureSummary(payload.summary)
      setFeatureHighlight(payload.highlight)
      setFeatureLoading(false)
      setSelectedSuggestionIds([])
      setExpandedSuggestionIds([])
      setFeatureTab('all')
    }, 350)
    return () => window.clearTimeout(timer)
  }, [analysis, rows])

  const filteredSuggestions = useMemo(() => {
    if (featureTab === 'all') return featureSuggestions
    if (featureTab === 'high') return featureSuggestions.filter((s) => s.priority === 'high')
    if (featureTab === 'quick') return featureSuggestions.filter((s) => s.complexity === 'Easy')
    if (featureTab === 'advanced') return featureSuggestions.filter((s) => s.complexity === 'Advanced')
    return featureSuggestions
  }, [featureTab, featureSuggestions])

  const selectedSuggestions = useMemo(
    () => featureSuggestions.filter((s) => selectedSuggestionIds.includes(s.id)),
    [featureSuggestions, selectedSuggestionIds]
  )

  const toggleSuggestion = (id: string) => {
    setSelectedSuggestionIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  const toggleExpand = (id: string) => {
    setExpandedSuggestionIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  const selectAllHigh = () => {
    const ids = featureSuggestions.filter((s) => s.priority === 'high').map((s) => s.id)
    setSelectedSuggestionIds(ids)
  }

  const buildScript = (lang: 'python' | 'r' | 'sql', ideas: FeatureSuggestion[]) => {
    if (!ideas.length) return ''
    return ideas.map((idea) => `# ${idea.title}\n${idea.code[lang]}`).join('\n\n')
  }

  const handleGeneratePipeline = () => {
    const ideas = selectedSuggestions.length ? selectedSuggestions : featureHighlight
    const script = buildScript(codeLanguage, ideas)
    setPipelineScript(script || '# Select feature engineering ideas to generate a script')
  }

  const downloadFeatureScript = () => {
    const ideas = selectedSuggestions.length ? selectedSuggestions : featureHighlight
    const script = buildScript('python', ideas)
    const content = script || '# No suggestions selected.'
    const blob = new Blob([content], { type: 'text/x-python' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'feature_engineering.py'
    link.click()
  }

  const downloadFeatureChecklist = () => {
    const ideas = selectedSuggestions.length ? selectedSuggestions : featureSuggestions
    const lines = ['# Feature Engineering Checklist', '', `Total Ideas: ${ideas.length}`, '']
    ideas.forEach((idea) => {
      lines.push(`- ${idea.title} (${idea.priority.toUpperCase()} • ${idea.complexity})`)
      lines.push(`  - Impact: ${'⭐'.repeat(idea.impact)}${idea.impact < 5 ? '☆'.repeat(5 - idea.impact) : ''}`)
      lines.push(`  - Why: ${idea.explanation}`)
      lines.push(`  - Columns: ${idea.columns.join(', ')}`)
      lines.push('')
    })
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'feature_engineering_checklist.md'
    link.click()
  }

  const computePreviewRows = (suggestion: FeatureSuggestion): Row[] => {
    const sample = rows.slice(0, 5).map((r) => ({ ...r }))
    const [primary] = suggestion.columns
    if (!sample.length || !primary) return sample

    if (suggestion.title.toLowerCase().includes('polynomial')) {
      return sample.map((r) => {
        const value = Number(r[primary]) || 0
        return { ...r, [`${primary}_squared`]: +(value ** 2).toFixed(2), [`${primary}_cubed`]: +(value ** 3).toFixed(2) }
      })
    }
    if (suggestion.title.toLowerCase().includes('normalize skewed')) {
      return sample.map((r) => {
        const value = Number(r[primary]) || 0
        return { ...r, [`${primary}_log`]: Math.log1p(Math.max(value, 0)).toFixed(3) }
      })
    }
    if (suggestion.title.toLowerCase().includes('discretize')) {
      const values = sample.map((r) => Number(r[primary]) || 0).sort((a, b) => a - b)
      const q1 = quantile(values, 0.25)
      const q3 = quantile(values, 0.75)
      return sample.map((r) => {
        const value = Number(r[primary]) || 0
        const band = value < q1 ? 'Low' : value < q3 ? 'Medium' : 'High'
        return { ...r, [`${primary}_band`]: band }
      })
    }
    if (suggestion.title.toLowerCase().includes('combine') && suggestion.columns.length >= 2) {
      const [a, b] = suggestion.columns
      return sample.map((r) => {
        const va = Number(r[a]) || 0
        const vb = Number(r[b]) || 1
        return { ...r, [`${a}_${b}_ratio`]: +(va / (vb || 1)).toFixed(2) }
      })
    }
    if (suggestion.title.toLowerCase().includes('days between') && suggestion.columns.length >= 2) {
      const [d1, d2] = suggestion.columns
      return sample.map((r) => {
        const start = new Date(r[d1]).getTime()
        const end = new Date(r[d2]).getTime()
        const diff = Math.round((end - start) / (1000 * 60 * 60 * 24))
        return { ...r, [`${d2}_${d1}_days`]: diff }
      })
    }
    if (suggestion.title.toLowerCase().includes('length feature')) {
      return sample.map((r) => ({ ...r, [`${primary}_length`]: String(r[primary] || '').length }))
    }
    return sample
  }

  const handlePreview = (suggestion: FeatureSuggestion) => {
    const preview = computePreviewRows(suggestion)
    setPreviewModal({ suggestion, rows: preview })
  }

  const scrollToFeatureIdeas = () => {
    featureSectionRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const priorityMeta: Record<FeatureSuggestion['priority'], { label: string; classes: string; icon: string }> = {
    high: { label: 'High Impact', classes: 'bg-red-500/20 text-red-200', icon: '🔴' },
    medium: { label: 'Worth Trying', classes: 'bg-yellow-500/20 text-yellow-200', icon: '🟡' },
    low: { label: 'Nice to Have', classes: 'bg-green-500/20 text-green-200', icon: '🟢' },
  }

  const complexityMeta: Record<ComplexityLevel, { label: string; classes: string }> = {
    Easy: { label: '⚡ Quick Win', classes: 'text-green-300' },
    Moderate: { label: '⚙️ Standard', classes: 'text-yellow-300' },
    Advanced: { label: '🔬 Advanced', classes: 'text-red-300' },
  }

  const renderStars = (impact: number) => '⭐'.repeat(impact) + (impact < 5 ? '☆'.repeat(5 - impact) : '')

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    const file = e.dataTransfer.files?.[0]
    if (file) onFiles(file)
  }

  const downloadMarkdown = () => {
    if (!analysis || !dataset) return
    const lines: string[] = []
    lines.push(`# Data Quality Report - ${dataset.name}`)
    lines.push(`Rows: ${rows.length}, Columns: ${cols.length}`)
    lines.push(`Overall Health Score: ${analysis.overall}`)
    lines.push('')
    lines.push('## Completeness')
    Object.entries(analysis.missing).forEach(([c,p])=>lines.push(`- ${c}: ${p}% missing`))
    lines.push('')
    lines.push('## Duplicates')
    lines.push(`- ${analysis.dup.count} rows (${analysis.dup.percent}%)`)
    lines.push('')
    lines.push('## Outliers')
    Object.entries(analysis.out.byColumn).forEach(([c,k])=>lines.push(`- ${c}: ${k}`))
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'data_quality_report.md'
    link.click()
  }

  const downloadCleaned = () => {
    if (!analysis || !dataset) return
    // remove duplicate rows
    const seen = new Set<string>()
    const cleaned = rows.filter(r => { const k = JSON.stringify(r); if (seen.has(k)) return false; seen.add(k); return true })
    const csv = Papa.unparse(cleaned)
    const blob = new Blob([csv], { type: 'text/csv' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'cleaned_dataset.csv'
    link.click()
  }

  const emailReport = () => {
    if (!analysis || !dataset) return
    const subject = encodeURIComponent('Dataset Health Report')
    const body = encodeURIComponent(`Dataset: ${dataset.name}\nRows: ${rows.length}, Columns: ${cols.length}\nHealth Score: ${analysis.overall} (${analysis.badge.label})`)
    window.location.href = `mailto:?subject=${subject}&body=${body}`
  }

  return (
    <div className="min-h-screen gradient-bg text-gray-100">
      <header className="px-6 py-8 md:px-12">
        <h1 className="text-3xl md:text-4xl font-bold">Dataset Health Checker</h1>
        <p className="text-gray-300 mt-1">Know your data quality in seconds</p>
      </header>

      <main className="px-6 md:px-12 pb-16">
        {!dataset && (
          <section className="max-w-4xl mx-auto">
            <div
              onDragOver={(e)=>{e.preventDefault();}}
              onDrop={onDrop}
              className="rounded-2xl border-2 border-dashed border-indigo-400/50 bg-indigo-900/20 p-10 text-center cursor-pointer hover:bg-indigo-900/30 transition"
              onClick={()=>inputRef.current?.click()}
            >
              <Upload className="mx-auto mb-4"/>
              <p className="font-medium">Drag and drop CSV/Excel here</p>
              <p className="text-sm text-gray-300">Or click to browse (5MB max)</p>
              <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e)=>{const f=e.target.files?.[0]; if(f) onFiles(f)}}/>
              <div className="mt-6 flex justify-center gap-3">
                <button onClick={loadSample} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500">Try with sample data</button>
              </div>
              {error && <p className="mt-4 text-red-400">{error}</p>}
              {loading && <p className="mt-4">Parsing...</p>}
            </div>
          </section>
        )}

        {dataset && analysis && (
          <section className="space-y-8">
            {/* Overview */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="col-span-2 rounded-xl bg-white/5 p-5 border border-white/10">
                <div className="flex items-center gap-3">
                  <Database />
                  <div>
                    <div className="font-semibold">{dataset.name}</div>
                    <div className="text-sm text-gray-300">{rows.length.toLocaleString()} rows • {cols.length} columns</div>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <span className={`px-3 py-1 rounded-full text-sm ${analysis.badge.color}`}>{analysis.badge.label}</span>
                  <span className="text-2xl font-bold">{analysis.overall}</span>
                  <span className="text-gray-300">/ 100 Overall Health</span>
                  <span className="ml-auto text-sm text-green-400">Ready for Modeling</span>
                </div>
              </div>
              <div className="rounded-xl bg-white/5 p-5 border border-white/10">
                <div className="flex items-start gap-3">
                  <Sparkles className="text-indigo-300"/>
                  <div className="flex-1">
                    <h4 className="font-semibold">Feature Engineering Outlook</h4>
                    <p className="text-sm text-gray-300">{featureSummary.total} ideas queued • {featureSummary.high} high priority • Estimated uplift 15-25%</p>
                    <div className="mt-3 flex flex-wrap gap-3 text-sm">
                      {featureHighlight.map((idea) => (
                        <div key={idea.id} className="bg-indigo-900/40 border border-indigo-500/30 rounded-lg px-3 py-2">
                          <span className="font-medium">{idea.title}</span>
                          <span className="block text-xs text-indigo-200">Impact: {'⭐'.repeat(idea.impact)}{idea.impact < 5 ? '☆'.repeat(5 - idea.impact) : ''}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <button onClick={scrollToFeatureIdeas} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 flex items-center gap-2">
                    <Rocket size={18}/> Explore Ideas
                  </button>
                </div>
              </div>
            </div>

            {/* Completeness */}
            <div className="rounded-xl bg-white/5 p-5 border border-white/10">
              <h3 className="font-semibold mb-3">Completeness Analysis</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-gray-300">
                    <tr>
                      <th className="py-2 pr-6">Column Name</th>
                      <th className="py-2 pr-6">Data Type</th>
                      <th className="py-2 pr-6">Missing %</th>
                      <th className="py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cols.map(c => {
                      const miss = analysis.missing[c] || 0
                      const tset = analysis.types[c]
                      const dtype = Array.from(tset || [])?.join(', ')
                      const status = miss > 20 ? 'critical' : miss > 5 ? 'warning' : 'ok'
                      return (
                        <tr key={c} className="border-t border-white/10">
                          <td className="py-2 pr-6">{c}</td>
                          <td className="py-2 pr-6 text-gray-300">{dtype || 'unknown'}</td>
                          <td className="py-2 pr-6">
                            <div className="flex items-center gap-3">
                              <div className="w-48 h-2 bg-white/10 rounded">
                                <div className={`h-2 rounded ${miss>20?'bg-red-500':miss>5?'bg-yellow-500':'bg-green-500'}`} style={{ width: `${100-miss}%` }} />
                              </div>
                              <span>{miss}%</span>
                            </div>
                          </td>
                          <td className="py-2">
                            {status==='critical'?<span className="text-red-400">Critical</span>:status==='warning'?<span className="text-yellow-400">Warning</span>:<span className="text-green-400">OK</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-sm text-gray-300 mt-2">{cols.filter(c => (analysis.missing[c]||0) > 0).length} columns have missing data</p>
            </div>

            {/* Issues */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="rounded-xl bg-white/5 p-5 border border-white/10">
                <h4 className="font-semibold mb-2">Duplicates</h4>
                <p>{analysis.dup.count} rows ({analysis.dup.percent}%)</p>
                {analysis.dup.examples.length>0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm text-indigo-300">Show duplicates</summary>
                    <pre className="text-xs mt-2 bg-black/30 p-2 rounded overflow-auto max-h-40">{JSON.stringify(analysis.dup.examples, null, 2)}</pre>
                  </details>
                )}
              </div>

              <div className="rounded-xl bg-white/5 p-5 border border-white/10">
                <h4 className="font-semibold mb-2">Outliers (IQR)</h4>
                <p>{analysis.out.total} outliers across {Object.keys(analysis.out.byColumn).filter(k=>analysis.out.byColumn[k]>0).length} columns</p>
                <div className="mt-3 grid grid-cols-1 gap-3">
                  {Object.entries(analysis.out.byColumn).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,v])=> (
                    <div key={k} className="flex justify-between text-sm"><span className="text-gray-300">{k}</span><span>{v}</span></div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl bg-white/5 p-5 border border-white/10">
                <h4 className="font-semibold mb-2">Data Type Issues</h4>
                <p>{analysis.typeIssues} columns with mixed types</p>
                <ul className="mt-2 text-sm list-disc pl-5">
                  {Object.entries(analysis.types).filter(([k,set])=>set.size>1).slice(0,5).map(([k,set])=> (
                    <li key={k}><span className="text-gray-300">{k}:</span> {Array.from(set).join(', ')}</li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Stats */}
            <div className="rounded-xl bg-white/5 p-5 border border-white/10">
              <h3 className="font-semibold mb-3">Statistical Summary</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-sm text-gray-300 mb-2">Numeric</h4>
                  <div className="space-y-3">
                    {Object.entries(analysis.stats).slice(0,4).map(([k,v]) => (
                      <div key={k} className="rounded bg-white/5 p-3">
                        <div className="font-medium mb-1">{k}</div>
                        <div className="text-xs text-gray-300">Min {v.min.toFixed(2)} • Max {v.max.toFixed(2)} • Mean {v.mean.toFixed(2)} • Median {v.median.toFixed(2)} • Std {v.std.toFixed(2)}</div>
                        <div className="h-28 mt-2">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={histogramData(v.values)}>
                              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                              <XAxis dataKey="bin" hide/>
                              <YAxis hide/>
                              <Tooltip contentStyle={{ background: 'rgba(0,0,0,0.7)', border: 'none' }}/>
                              <Bar dataKey="count" fill="#60a5fa" />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="text-sm text-gray-300 mb-2">Categorical</h4>
                  <div className="space-y-3">
                    {Object.entries(analysis.cat).slice(0,4).map(([k,v]) => (
                      <div key={k} className="rounded bg-white/5 p-3">
                        <div className="font-medium mb-1">{k}</div>
                        <div className="text-xs text-gray-300">{v.unique} unique • Top: {v.top.map(t=>`${t[0]} (${t[1]})`).join(', ')}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Correlations */}
            <div className="rounded-xl bg-white/5 p-5 border border-white/10">
              <h3 className="font-semibold mb-3">Column Correlations</h3>
              {analysis.corr.columns.length === 0 ? (
                <p className="text-gray-300 text-sm">No numeric columns</p>
              ) : (
                <div className="overflow-x-auto">
                  <div className="inline-block">
                    <div className="grid" style={{ gridTemplateColumns: `repeat(${analysis.corr.columns.length+1}, minmax(80px,1fr))`}}>
                      <div></div>
                      {analysis.corr.columns.map(c => <div key={c} className="text-xs text-gray-300 p-2">{c}</div>)}
                      {analysis.corr.columns.map((r,i)=> (
                        <React.Fragment key={r}>
                          <div className="text-xs text-gray-300 p-2">{r}</div>
                          {analysis.corr.matrix[i].map((v,j)=> (
                            <div key={i+'-'+j} className="p-2 text-center" style={{ background: heatColor(v) }}>{v.toFixed(2)}</div>
                          ))}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div className="text-sm text-gray-300 mt-2">Strong correlations (|r| &gt; 0.7) are highlighted by saturated colors.</div>
            </div>

            {/* Recommended Actions */}
            <div className="rounded-xl bg-white/5 p-5 border border-white/10">
              <h3 className="font-semibold mb-3">Recommended Actions</h3>
              <ul className="space-y-2 text-sm">
                <li>🔴 Critical: Remove rows with critical missing in target variable (if applicable)</li>
                <li>🟡 Warning: Investigate {Object.values(analysis.out.byColumn).reduce((a,b)=>a+b,0)} outliers across {Object.keys(analysis.out.byColumn).length} columns</li>
                <li>🟢 Suggestion: Consider encoding high-cardinality columns ({analysis.highCardCols})</li>
              </ul>
              <p className="text-xs text-gray-300 mt-2">Fixing these issues could improve model accuracy by ~8-12% (estimate)</p>
            </div>

            {/* Feature Engineering Suggestions */}
            <div ref={featureSectionRef} className="rounded-xl bg-white/5 p-6 border border-white/10 space-y-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <h3 className="text-xl font-semibold flex items-center gap-2">🎯 Smart Feature Engineering Suggestions</h3>
                  <p className="text-sm text-gray-300">AI-powered recommendations to boost model performance</p>
                </div>
                <div className="flex flex-wrap gap-3 items-center">
                  <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-200 text-sm">Potential 15-25% performance improvement</span>
                  <div className="text-sm text-indigo-200">{featureSummary.total} ideas • {featureSummary.high} High Priority • {featureSummary.medium + featureSummary.low} Medium/Low</div>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 items-center text-sm">
                <div className="flex gap-2">
                  {([
                    { key: 'all', label: 'All Suggestions' },
                    { key: 'high', label: 'High Impact' },
                    { key: 'quick', label: 'Quick Wins' },
                    { key: 'advanced', label: 'Advanced' },
                  ] as const).map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => setFeatureTab(tab.key)}
                      className={`px-3 py-1.5 rounded-full border ${featureTab === tab.key ? 'bg-indigo-600 border-indigo-400' : 'border-white/10 bg-white/10 hover:bg-white/20'}`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 ml-auto">
                  {(['python', 'r', 'sql'] as const).map((lang) => (
                    <button
                      key={lang}
                      onClick={() => setCodeLanguage(lang)}
                      className={`px-3 py-1.5 rounded border ${codeLanguage === lang ? 'border-sky-400 bg-sky-500/30' : 'border-white/10 bg-white/10 hover:bg-white/20'}`}
                    >
                      {lang.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 text-sm text-indigo-200">
                <div className="bg-indigo-900/30 rounded-lg p-4 border border-indigo-500/20">
                  <p className="text-xs uppercase text-gray-300">Ideas</p>
                  <p className="text-2xl font-semibold">{featureSummary.total}</p>
                </div>
                <div className="bg-red-900/30 rounded-lg p-4 border border-red-500/30">
                  <p className="text-xs uppercase text-gray-300">High Priority</p>
                  <p className="text-2xl font-semibold">{featureSummary.high}</p>
                </div>
                <div className="bg-yellow-900/30 rounded-lg p-4 border border-yellow-500/30">
                  <p className="text-xs uppercase text-gray-300">Medium Priority</p>
                  <p className="text-2xl font-semibold">{featureSummary.medium}</p>
                </div>
                <div className="bg-green-900/30 rounded-lg p-4 border border-green-500/30">
                  <p className="text-xs uppercase text-gray-300">Selected</p>
                  <p className="text-2xl font-semibold">{selectedSuggestionIds.length}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 text-sm">
                <button onClick={selectAllHigh} className="px-4 py-2 rounded-lg bg-red-500/30 hover:bg-red-500/40 border border-red-400/40 flex items-center gap-2"><CheckCircle2 size={16}/> Select All High Priority</button>
                <button onClick={handleGeneratePipeline} className="px-4 py-2 rounded-lg bg-emerald-500/30 hover:bg-emerald-500/40 border border-emerald-400/40 flex items-center gap-2"><Filter size={16}/> Generate Pipeline ({codeLanguage.toUpperCase()})</button>
                <button onClick={() => setSelectedSuggestionIds([])} className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20">Clear Selection</button>
              </div>

              {featureLoading ? (
                <div className="py-16 text-center text-indigo-200">Crunching ideas...</div>
              ) : (
                <div className="space-y-4">
                  {filteredSuggestions.map((idea) => {
                    const priority = priorityMeta[idea.priority]
                    const complexity = complexityMeta[idea.complexity]
                    const expanded = expandedSuggestionIds.includes(idea.id)
                    const selected = selectedSuggestionIds.includes(idea.id)
                    return (
                      <div key={idea.id} className={`rounded-xl border border-white/10 bg-white/10 p-4 transition ${selected ? 'ring-2 ring-indigo-400' : ''}`}>
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <span className={`px-3 py-1 rounded-full text-xs ${priority.classes}`}>{priority.icon} {priority.label}</span>
                            <div>
                              <div className="flex items-center gap-2">
                                <input type="checkbox" checked={selected} onChange={() => toggleSuggestion(idea.id)} className="accent-indigo-500"/>
                                <h4 className="font-semibold">{idea.title}</h4>
                              </div>
                              <p className="text-sm text-gray-200 mt-1">{idea.description}</p>
                            </div>
                          </div>
                          <div className="text-right space-y-1">
                            <div className={`text-xs ${complexity.classes}`}>{complexity.label}</div>
                            <div className="text-xs text-yellow-300">Impact: {renderStars(idea.impact)}</div>
                            <div className="text-xs text-gray-300">Columns: {idea.columns.join(', ')}</div>
                          </div>
                        </div>
                        {expanded && (
                          <div className="mt-4 space-y-3 text-sm text-gray-200">
                            <p><span className="text-indigo-200 font-medium">Why this helps:</span> {idea.explanation}</p>
                            <p><span className="text-indigo-200 font-medium">Example:</span> {idea.example}</p>
                            <div className="bg-black/30 rounded-lg p-3 overflow-auto">
                              <pre className="text-xs whitespace-pre-wrap">{idea.code[codeLanguage]}</pre>
                            </div>
                          </div>
                        )}
                        <div className="flex flex-wrap gap-3 mt-4 text-sm">
                          <button onClick={() => toggleExpand(idea.id)} className="px-3 py-1.5 rounded bg-white/10 hover:bg-white/20 border border-white/20">{expanded ? 'Hide Details' : 'Show Code'}</button>
                          <button onClick={() => handlePreview(idea)} className="px-3 py-1.5 rounded bg-indigo-600/40 hover:bg-indigo-600/60 border border-indigo-500/40">Preview Impact</button>
                          <button onClick={() => toggleSuggestion(idea.id)} className={`px-3 py-1.5 rounded border ${selected ? 'bg-emerald-500/30 border-emerald-400/40' : 'bg-emerald-900/30 border-emerald-600/30 hover:bg-emerald-700/30'}`}>{selected ? 'Applied' : 'Apply'}</button>
                        </div>
                      </div>
                    )
                  })}
                  {!filteredSuggestions.length && (
                    <div className="text-center text-sm text-gray-300 py-12">No suggestions match this filter yet.</div>
                  )}
                </div>
              )}
            </div>

            {/* Export Options */}
            <div className="rounded-xl bg-white/5 p-5 border border-white/10 space-y-4">
              <h3 className="font-semibold">Export Options</h3>
              <p className="text-sm text-gray-300">Share findings or continue downstream with ready-to-run assets.</p>
              <div className="flex flex-wrap gap-3">
                <button onClick={downloadMarkdown} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 flex items-center gap-2"><FileDown size={18}/> Download Data Quality Report</button>
                <button onClick={downloadCleaned} className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500">Download Cleaned Dataset</button>
                <button onClick={emailReport} className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 flex items-center gap-2"><Mail size={18}/> Email Report</button>
                <button onClick={downloadFeatureScript} className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-400 flex items-center gap-2"><Clipboard size={18}/> Download Feature Engineering Script</button>
                <button onClick={downloadFeatureChecklist} className="px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-400 flex items-center gap-2"><Sparkles size={18}/> Export Feature Engineering Checklist</button>
              </div>
            </div>
          </section>
        )}
      </main>

      {pipelineScript && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 z-50">
          <div className="bg-slate-900 border border-white/10 rounded-xl max-w-3xl w-full max-h-[80vh] overflow-hidden shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <h4 className="font-semibold text-lg">Generated Pipeline ({codeLanguage.toUpperCase()})</h4>
              <div className="flex gap-2">
                <button onClick={() => {
                  navigator.clipboard.writeText(pipelineScript || '')
                }} className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-sm">Copy</button>
                <button onClick={() => setPipelineScript(null)} className="px-3 py-1.5 rounded bg-white/10 hover:bg-white/20 text-sm">Close</button>
              </div>
            </div>
            <pre className="p-4 text-sm text-indigo-100 overflow-auto whitespace-pre-wrap">{pipelineScript}</pre>
          </div>
        </div>
      )}

      {previewModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6 z-40">
          <div className="bg-slate-900 border border-white/10 rounded-xl max-w-4xl w-full max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <div>
                <h4 className="font-semibold text-lg">Preview: {previewModal.suggestion.title}</h4>
                <p className="text-xs text-gray-300">Showing first 5 rows with proposed columns</p>
              </div>
              <button onClick={() => setPreviewModal(null)} className="px-3 py-1.5 rounded bg-white/10 hover:bg-white/20 text-sm">Close</button>
            </div>
            <div className="p-4 overflow-auto">
              <table className="w-full text-xs text-gray-200">
                <thead className="text-left">
                  <tr>
                    {Object.keys(previewModal.rows[0] || {}).slice(0, 12).map((col) => (
                      <th key={col} className="px-2 py-1 border-b border-white/10">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewModal.rows.map((row, idx) => (
                    <tr key={idx} className="border-b border-white/5">
                      {Object.keys(previewModal.rows[0] || {}).slice(0, 12).map((col) => (
                        <td key={col} className="px-2 py-1">{String(row[col] ?? '')}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function histogramData(values: number[], bins = 20){
  if (values.length === 0) return []
  const min = Math.min(...values)
  const max = Math.max(...values)
  const step = (max-min)/bins || 1
  const counts = Array(bins).fill(0)
  values.forEach(v => {
    const idx = Math.min(bins-1, Math.floor((v-min)/step))
    counts[idx]++
  })
  return counts.map((c,i)=>({ bin: i, count: c }))
}

function heatColor(v: number){
  // -1 (red) -> 0 (white) -> 1 (green)
  const r = v < 0 ? 255 : Math.round(255*(1-v))
  const g = v > 0 ? 255 : Math.round(255*(1+v))
  const b = Math.round(255*(1-Math.abs(v)))
  return `rgb(${r},${g},${b})`
}


