import { countBy, groupBy, uniq, sum, mean } from 'lodash'
import { Row, quantile } from './analysis'

export type ComplexityLevel = 'Easy' | 'Moderate' | 'Advanced'
export type PriorityLevel = 'high' | 'medium' | 'low'

export interface FeatureSuggestion {
  id: string
  title: string
  description: string
  example: string
  columns: string[]
  category: 'numeric' | 'categorical' | 'datetime' | 'domain'
  priority: PriorityLevel
  impact: number // 1-5
  complexity: ComplexityLevel
  explanation: string
  code: {
    python: string
    r: string
    sql: string
  }
}

export interface FeatureSuggestionPayload {
  suggestions: FeatureSuggestion[]
  summary: {
    total: number
    high: number
    medium: number
    low: number
  }
  highlight: FeatureSuggestion[]
}

const priorityFromImpact = (impact: number, complexity: ComplexityLevel): PriorityLevel => {
  if (impact >= 4 && (complexity === 'Easy' || complexity === 'Moderate')) return 'high'
  if (impact <= 2) return 'low'
  return 'medium'
}

export function generateFeatureSuggestions({
  rows,
  numericStats,
  categoricalSummary,
  corrMatrix,
}: {
  rows: Row[]
  numericStats: Record<string, { values: number[]; mean: number; std: number }>
  categoricalSummary: Record<string, { unique: number; top: [string, number][] }>
  corrMatrix: { columns: string[]; matrix: number[][] }
}): FeatureSuggestionPayload {
  if (!rows.length) {
    return { suggestions: [], summary: { total: 0, high: 0, medium: 0, low: 0 }, highlight: [] }
  }

  const suggestions: FeatureSuggestion[] = []
  const columns = Object.keys(rows[0])
  const numericColumns = Object.keys(numericStats)
  const categoricalColumns = Object.keys(categoricalSummary)

  const addSuggestion = (s: Omit<FeatureSuggestion, 'id' | 'priority'> & { priority?: PriorityLevel }) => {
    const priority = s.priority ?? priorityFromImpact(s.impact, s.complexity)
    suggestions.push({ ...s, id: `${s.category}-${suggestions.length + 1}`, priority })
  }

  // Numeric: polynomial
  numericColumns.forEach((col) => {
    const uniqueCount = uniq(numericStats[col].values).length
    if (uniqueCount > 100) {
      addSuggestion({
        category: 'numeric',
        title: `Polynomial features for ${col}`,
        description: `Create squared and cubed versions of ${col} to capture non-linear relationships in models.`,
        example: `${col}² and ${col}³ for richer signal`,
        columns: [col],
        impact: 4,
        complexity: 'Easy',
        explanation: `${col} has ${uniqueCount} unique values. Higher-order terms often improve tree-based and linear models when curves exist.`,
        code: {
          python: `df['${col}_squared'] = df['${col}'] ** 2\ndf['${col}_cubed'] = df['${col}'] ** 3`,
          r: `df$${col}_squared <- df$${col}^2\ndf$${col}_cubed <- df$${col}^3`,
          sql: `ALTER TABLE dataset ADD COLUMN ${col}_squared FLOAT;\nUPDATE dataset SET ${col}_squared = POWER(${col}, 2);` +
            `\nALTER TABLE dataset ADD COLUMN ${col}_cubed FLOAT;\nUPDATE dataset SET ${col}_cubed = POWER(${col}, 3);`
        }
      })
    }
  })

  // Numeric: binning
  numericColumns.forEach((col) => {
    const uniqueCount = uniq(numericStats[col].values).length
    if (uniqueCount > 50) {
      const values = numericStats[col].values
      const min = Math.min(...values)
      const max = Math.max(...values)
      const q1 = quantile([...values].sort((a, b) => a - b), 0.25)
      const q3 = quantile([...values].sort((a, b) => a - b), 0.75)
      addSuggestion({
        category: 'numeric',
        title: `Discretize ${col}`,
        description: `Convert ${col} into categorical bins to capture non-linear thresholds.`,
        example: `${col} grouped into quartiles or business-friendly ranges`,
        columns: [col],
        impact: 3,
        complexity: 'Easy',
        explanation: `${col} spans ${min.toFixed(1)} to ${max.toFixed(1)} with many unique values. Binning simplifies modeling.`,
        code: {
          python: `df['${col}_quartile'] = pd.qcut(df['${col}'], q=4, labels=False)`,
          r: `df$${col}_quartile <- cut(df$${col}, breaks=quantile(df$${col}, probs=seq(0,1,0.25)), include.lowest=TRUE)`,
          sql: `CASE\n  WHEN ${col} < ${q1.toFixed(2)} THEN 'Low'\n  WHEN ${col} < ${q3.toFixed(2)} THEN 'Medium'\n  ELSE 'High'\nEND AS ${col}_band`
        }
      })
    }
  })

  // Numeric: skewness transforms & scaling
  numericColumns.forEach((col) => {
    const values = numericStats[col].values
    if (values.length < 5) return
    const avg = mean(values)
    const std = Math.sqrt(mean(values.map((v) => (v - avg) ** 2)))
    if (!std) return
    const skewness = mean(values.map((v) => ((v - avg) ** 3))) / (std ** 3)
    if (Math.abs(skewness) > 1) {
      addSuggestion({
        category: 'numeric',
        title: `Normalize skewed ${col}`,
        description: `Apply log transform to ${col}. Current skewness ${skewness.toFixed(2)}.`,
        example: `Log-transform ${col} to stabilize variance`,
        columns: [col],
        impact: 4,
        complexity: 'Easy',
        explanation: `${col} displays high skew (${skewness.toFixed(2)}). Log transforms reduce heavy tails.`,
        code: {
          python: `df['${col}_log'] = np.log1p(df['${col}'])`,
          r: `df$${col}_log <- log1p(df$${col})`,
          sql: `SELECT LOG(${col} + 1) AS ${col}_log FROM dataset;`
        }
      })
    }
    if (Math.max(...values) - Math.min(...values) > 1000) {
      addSuggestion({
        category: 'numeric',
        title: `Scale ${col}`,
        description: `Standardize ${col} to zero mean and unit variance.`,
        example: `${col}_zscore = (${col} - μ) / σ`,
        columns: [col],
        impact: 3,
        complexity: 'Easy',
        explanation: `${col} range is large. Scaling keeps models stable across magnitudes.`,
        code: {
          python: `df['${col}_z'] = (df['${col}'] - df['${col}'].mean()) / df['${col}'].std()`,
          r: `df$${col}_z <- scale(df$${col})`,
          sql: `(${col} - AVG(${col})) / STDDEV(${col}) AS ${col}_z`
        }
      })
    }
  })

  // Numeric combinations & ratios
  const combos: Array<[string, string, string, string]> = [
    ['price', 'quantity', 'total_value', `df['total_value'] = df['price'] * df['quantity']`],
    ['distance', 'time', 'speed', `df['speed'] = df['distance'] / df['time']`],
    ['weight', 'height', 'bmi', `df['bmi'] = df['weight'] / (df['height'] ** 2)`],
    ['price', 'total_price', 'price_per_unit', `df['price_per_unit'] = df['total_price'] / df['quantity']`],
  ]
  combos.forEach(([a, b, feature, pythonCode]) => {
    if (columns.includes(a) && columns.includes(b)) {
      addSuggestion({
        category: 'numeric',
        title: `Combine ${a} & ${b}`,
        description: `Derive ${feature} from ${a} and ${b} to capture domain insight.`,
        example: `Create ${feature} = ${a} / ${b}`,
        columns: [a, b],
        impact: 4,
        complexity: 'Easy',
        explanation: `Columns ${a} and ${b} suggest a business ratio.`,
        code: {
          python: pythonCode,
          r: pythonCode.replace(/df\['/g, "df$").replace(/'\]/g, ''),
          sql: `(${feature.includes('per') ? `${a} / NULLIF(${b},0)` : `${a} * ${b}`}) AS ${feature}`
        }
      })
    }
  })

  // Aggregations (detect groups with prefixes)
  const prefixGroups = groupBy(numericColumns, (col) => col.split('_')[0])
  Object.entries(prefixGroups).forEach(([prefix, cols]) => {
    if (cols.length >= 3) {
      addSuggestion({
        category: 'numeric',
        title: `Aggregate ${prefix} metrics`,
        description: `Combine ${cols.length} related ${prefix} metrics into average/sum/min/max features.`,
        example: `Create average_${prefix} = mean(${cols.join(', ')})`,
        columns: cols,
        impact: 3,
        complexity: 'Easy',
        explanation: `Grouping ${cols.length} ${prefix} columns reduces noise and highlights composite signals.`,
        code: {
          python: `df['${prefix}_mean'] = df[${JSON.stringify(cols)}].mean(axis=1)\ndf['${prefix}_sum'] = df[${JSON.stringify(cols)}].sum(axis=1)`,
          r: `df$${prefix}_mean <- rowMeans(df[, c(${cols.map((c) => `'${c}'`).join(', ')})])`,
          sql: `${cols.map((c) => c).join(' + ')} AS ${prefix}_sum`
        }
      })
    }
  })

  // Ratio features for columns sharing units
  numericColumns.forEach((a, idx) => {
    numericColumns.slice(idx + 1).forEach((b) => {
      if (a.includes('price') && b.includes('quantity')) {
        addSuggestion({
          category: 'numeric',
          title: `Ratio ${a}/${b}`,
          description: `Ratio reveals efficiency (price per quantity).`,
          example: `${a}_per_${b}`,
          columns: [a, b],
          impact: 4,
          complexity: 'Easy',
          explanation: `Price and quantity pairs are classic for margin analysis.`,
          code: {
            python: `df['${a}_per_${b}'] = df['${a}'] / df['${b}']`,
            r: `df$${a}_per_${b} <- df$${a} / df$${b}`,
            sql: `${a} / NULLIF(${b}, 0) AS ${a}_per_${b}`
          }
        })
      }
    })
  })

  // Categorical encoding recommendations
  Object.entries(categoricalSummary).forEach(([col, info]) => {
    if (!columns.includes(col)) return
    const unique = info.unique
    let encoding = 'Frequency Encoding'
    let reason = 'Very high cardinality'
    if (unique <= 10) {
      encoding = 'One-Hot Encoding'
      reason = 'Low cardinality nominal feature'
    } else if (unique <= 20) {
      encoding = 'Ordinal Encoding'
      reason = 'Manageable cardinality with potential order cues'
    } else if (unique <= 50) {
      encoding = 'Target Encoding'
      reason = 'Balanced trade-off between signal and dimensionality'
    } else {
      encoding = 'Frequency Encoding'
    }

    addSuggestion({
      category: 'categorical',
      title: `Encode ${col}`,
      description: `${encoding} recommended for ${col} (${unique} unique values).`,
      example: `${col} → ${encoding}`,
      columns: [col],
      impact: 5,
      complexity: unique <= 10 ? 'Easy' : 'Moderate',
      explanation: reason,
      code: {
        python: encoding === 'One-Hot Encoding'
          ? `df = pd.get_dummies(df, columns=['${col}'], prefix='${col}')`
          : encoding === 'Ordinal Encoding'
            ? `mapping = {value: idx for idx, value in enumerate(df['${col}'].dropna().unique())}\ndf['${col}_ordinal'] = df['${col}'].map(mapping)`
            : encoding === 'Target Encoding'
              ? `means = df.groupby('${col}')['target'].mean()\ndf['${col}_te'] = df['${col}'].map(means)`
              : `freq = df['${col}'].value_counts(normalize=True)\ndf['${col}_freq'] = df['${col}'].map(freq)`,
        r: `# encoding strategy: ${encoding}\n# apply using tidyverse or data.table accordingly`,
        sql: `-- Encoding ${col} with ${encoding} typically done in ETL pipeline`
      }
    })

    const counts = countBy(rows.map((r) => r[col]))
    const rare = Object.entries(counts).filter(([, count]) => count / rows.length < 0.01)
    if (rare.length) {
      addSuggestion({
        category: 'categorical',
        title: `Group rare ${col} categories`,
        description: `Combine ${rare.length} infrequent values into 'Other'.`,
        example: `Collapse rare ${col} categories`,
        columns: [col],
        impact: 3,
        complexity: 'Easy',
        explanation: `Rare categories increase dimensionality without signal.`,
        code: {
          python: `rare = [${rare.map(([value]) => `'${value}'`).join(', ')}]\ndf['${col}_grouped'] = df['${col}'].apply(lambda v: v if v not in rare else 'Other_${col}')`,
          r: `rare <- c(${rare.map(([value]) => `'${value}'`).join(', ')})\ndf$${col}_grouped <- ifelse(df$${col} %in% rare, 'Other_${col}', df$${col})`,
          sql: `CASE WHEN ${col} IN (${rare.map(([value]) => `'${value}'`).join(', ')}) THEN 'Other_${col}' ELSE ${col} END AS ${col}_grouped`
        }
      })
    }

    const avgLength = mean(rows.map((r) => String(r[col] || '').length))
    if (avgLength > 5 && avgLength < 80) {
      addSuggestion({
        category: 'categorical',
        title: `Length feature for ${col}`,
        description: `Capture text length of ${col}.`,
        example: `${col}_length`,
        columns: [col],
        impact: 2,
        complexity: 'Easy',
        explanation: `Length encodes information density for ${col}.`,
        code: {
          python: `df['${col}_length'] = df['${col}'].astype(str).str.len()`,
          r: `df$${col}_length <- nchar(as.character(df$${col}))`,
          sql: `LENGTH(${col}) AS ${col}_length`
        }
      })
    }
  })

  if (categoricalColumns.length >= 2) {
    const [c1, c2] = categoricalColumns
    addSuggestion({
      category: 'categorical',
      title: `Combine ${c1} & ${c2}`,
      description: `Interaction captures joint distribution between categories.`,
      example: `${c1}_${c2}`,
      columns: [c1, c2],
      impact: 3,
      complexity: 'Moderate',
      explanation: `Combining top categorical features often boosts performance.`,
      code: {
        python: `df['${c1}_${c2}'] = df['${c1}'].astype(str) + '_' + df['${c2}'].astype(str)`,
        r: `df$${c1}_${c2} <- paste(df$${c1}, df$${c2}, sep = '_')`,
        sql: `${c1} || '_' || ${c2} AS ${c1}_${c2}`
      }
    })
  }

  // Datetime detection
  const dateColumns = columns.filter((col) => rows.some((r) => /\d{4}-\d{2}-\d{2}/.test(String(r[col]))))
  dateColumns.forEach((col) => {
    addSuggestion({
      category: 'datetime',
      title: `Extract components from ${col}`,
      description: `Derive year, month, day, weekday, weekend flags.`,
      example: `${col} → ${col}_year, ${col}_month, ${col}_dow`,
      columns: [col],
      impact: 5,
      complexity: 'Easy',
      explanation: `Datetime expands into seasonal and weekly signals.`,
      code: {
        python: `df['${col}'] = pd.to_datetime(df['${col}'])\ndf['${col}_month'] = df['${col}'].dt.month\ndf['${col}_dow'] = df['${col}'].dt.dayofweek`,
        r: `df$${col} <- as.Date(df$${col})\ndf$${col}_month <- lubridate::month(df$${col})`,
        sql: `EXTRACT(MONTH FROM ${col}) AS ${col}_month`
      }
    })

    addSuggestion({
      category: 'datetime',
      title: `Cyclical encoding for ${col}`,
      description: `Map month/day to sine-cosine to preserve cyclic structure.`,
      example: `${col}_month_sin/cos`,
      columns: [col],
      impact: 4,
      complexity: 'Moderate',
      explanation: `Cyclical encoding maintains wrap-around relationships.`,
      code: {
        python: `df['${col}_month_sin'] = np.sin(2 * np.pi * df['${col}'].dt.month/12)`,
        r: `df$${col}_month_sin <- sin(2 * pi * lubridate::month(df$${col})/12)`,
        sql: `SIN(2 * PI() * EXTRACT(MONTH FROM ${col}) / 12) AS ${col}_month_sin`
      }
    })
  })

  if (dateColumns.length >= 2) {
    const [d1, d2] = dateColumns
    addSuggestion({
      category: 'datetime',
      title: `Days between ${d1} & ${d2}`,
      description: `Time-to-event reveals churn and recency.`,
      example: `${d2}_${d1}_days`,
      columns: [d1, d2],
      impact: 4,
      complexity: 'Easy',
      explanation: `Interval between ${d1} and ${d2} indicates engagement intensity.`,
      code: {
        python: `df['${d2}_${d1}_days'] = (pd.to_datetime(df['${d2}']) - pd.to_datetime(df['${d1}'])).dt.days`,
        r: `df$${d2}_${d1}_days <- as.numeric(as.Date(df$${d2}) - as.Date(df$${d1}))`,
        sql: `DATEDIFF(day, ${d1}, ${d2}) AS ${d2}_${d1}_days`
      }
    })
  }

  // Domain heuristics
  const lowerCols = columns.map((c) => c.toLowerCase())
  const containsKeyword = (keywords: string[]) => keywords.some((kw) => lowerCols.some((c) => c.includes(kw)))

  if (containsKeyword(['price', 'order', 'product', 'customer', 'quantity'])) {
    addSuggestion({
      category: 'domain',
      title: 'E-commerce basket insights',
      description: 'Create discount %, average basket size, and customer lifetime value features.',
      example: `discount_pct = (original_price - sale_price) / original_price`,
      columns: columns.filter((c) => /price|quantity|order/i.test(c)),
      impact: 4,
      complexity: 'Moderate',
      explanation: 'E-commerce signals like discounts and CLV are predictive for retention.',
      code: {
        python: `df['discount_pct'] = (df['price'] - df['total_price']) / df['price']\ndf['basket_size'] = df['quantity']`,
        r: `df$discount_pct <- (df$price - df$total_price) / df$price`,
        sql: `(price - total_price) / NULLIF(price,0) AS discount_pct`
      }
    })
  }

  if (containsKeyword(['sqft', 'bedroom', 'bathroom', 'lot', 'property'])) {
    addSuggestion({
      category: 'domain',
      title: 'Real estate structural ratios',
      description: 'Price per square foot, bedroom ratio, property age.',
      example: `price_per_sqft = price / sqft`,
      columns: columns.filter((c) => /price|sqft|bed|bath|year/i.test(c)),
      impact: 5,
      complexity: 'Easy',
      explanation: 'Real estate valuation heavily relies on area and room ratios.',
      code: {
        python: `df['price_per_sqft'] = df['price'] / df['sqft']`,
        r: `df$price_per_sqft <- df$price / df$sqft`,
        sql: `price / NULLIF(sqft,0) AS price_per_sqft`
      }
    })
  }

  if (containsKeyword(['amount', 'balance', 'account', 'transaction'])) {
    addSuggestion({
      category: 'domain',
      title: 'Financial velocity features',
      description: 'Compute transaction counts and rolling averages to capture spend velocity.',
      example: `monthly_transaction_count`,
      columns: columns.filter((c) => /amount|transaction|balance/i.test(c)),
      impact: 4,
      complexity: 'Advanced',
      explanation: 'Velocity metrics uncover anomalous or high-value clients.',
      code: {
        python: `df['txn_per_customer'] = df.groupby('customer_id')['transaction_id'].transform('count')`,
        r: `df$txn_per_customer <- ave(df$transaction_id, df$customer_id, FUN=length)`,
        sql: `COUNT(*) OVER(PARTITION BY customer_id) AS txn_per_customer`
      }
    })
  }

  if (containsKeyword(['patient', 'diagnosis', 'treatment', 'age', 'symptom'])) {
    addSuggestion({
      category: 'domain',
      title: 'Healthcare BMI & age groups',
      description: 'Derive BMI, age bins, symptom counts.',
      example: `BMI = weight / (height_m^2)`
      ,
      columns: columns.filter((c) => /weight|height|age|symptom/i.test(c)),
      impact: 5,
      complexity: 'Easy',
      explanation: 'Clinical derived metrics are highly predictive.',
      code: {
        python: `df['BMI'] = df['weight_kg'] / (df['height_cm']/100) ** 2`,
        r: `df$BMI <- df$weight_kg / ( (df$height_cm/100)^2 )`,
        sql: `weight_kg / POWER(height_cm/100, 2) AS BMI`
      }
    })
  }

  if (dateColumns.length && numericColumns.length) {
    addSuggestion({
      category: 'domain',
      title: 'Time-based rolling metrics',
      description: 'Create rolling 7-day/30-day aggregates for key metrics.',
      example: `rolling_7day_sales`,
      columns: [...dateColumns, ...numericColumns.slice(0, 2)],
      impact: 4,
      complexity: 'Advanced',
      explanation: 'Rolling windows expose trend and seasonality.',
      code: {
        python: `df = df.sort_values('${dateColumns[0]}')\ndf['rolling_7'] = df['${numericColumns[0]}'].rolling(window=7, min_periods=1).mean()`,
        r: `df <- df[order(df$${dateColumns[0]}), ]\ndf$rolling_7 <- zoo::rollapply(df$${numericColumns[0]}, 7, mean, fill=NA, align='right')`,
        sql: `AVG(${numericColumns[0]}) OVER (ORDER BY ${dateColumns[0]} ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS rolling_7`
      }
    })
  }

  // Summary
  const summary = suggestions.reduce((acc, s) => {
    acc.total++
    if (s.priority === 'high') acc.high++
    else if (s.priority === 'medium') acc.medium++
    else acc.low++
    return acc
  }, { total: 0, high: 0, medium: 0, low: 0 })

  const highlight = suggestions.filter((s) => s.priority === 'high').slice(0, 3)

  return { suggestions, summary, highlight }
}

