Dataset Health Checker
=======================

Know your data quality in seconds and discover feature engineering ideas to accelerate model development.

## 🌐 Live Demo

- Vercel Deployment: _Add URL after your first deploy_

## 📊 What This App Does

Dataset Health Checker ingests CSV or Excel datasets and provides an interactive dashboard that surfaces:

- **Overall data quality scoring** (weighted completeness, duplicate ratio, outliers, data types, cardinality)
- **Completeness analysis** with per-column missing percentages and visual status indicators
- **Data issues** such as duplicate rows, IQR-based outliers, mixed-type columns, and high-cardinality fields
- **Statistical snapshots** for numeric and categorical columns, including histograms built with Recharts
- **Correlation heatmap** to highlight strongly correlated numeric features
- **Feature Engineering Ideas Generator** with AI-style suggestions, code snippets (Python / R / SQL), previews, selection workflow, and export options
- **Downloadable artifacts**: quality report, cleaned dataset, generated feature engineering script/checklist, and email-ready summary

## ✨ Key Features

| Area | Highlights |
| --- | --- |
| File Upload | Drag-and-drop zone, 5 MB validation, CSV (PapaParse) & Excel (SheetJS) parsing, sample dataset loader |
| Scorecard | Ready-for-modeling badge, health score badge (color-coded), dataset size summary |
| Completeness | Missing percentages, progress bars, warning/critical thresholds (>5%, >20%) |
| Data Quality | Duplicate inspection, outlier counts, mixed type detection, domain-aware recommendations |
| Statistics | Numeric stats (min/max/mean/median/std) with histograms; categorical unique counts and top values |
| Correlations | Heatmap with red↔green gradient, strong correlation callouts |
| Feature Engineering | 20+ rule-driven suggestions, priority filters (All/High/Quick Wins/Advanced), star ratings, complexity badges, code previews, preview modal, selection state, pipeline generation |
| Exports | Markdown data-quality report, deduplicated dataset CSV, email template, feature engineering script/checklist |
| UX | Gradient data-science theme, responsive Tailwind layout, lucide-react iconography, modals & smooth scrolling |

## 🗂️ Project Structure

```
.
├── src/
│   ├── App.tsx                  # Main UI and dashboard sections
│   ├── main.tsx                 # React entry point
│   ├── index.css                # Tailwind + global styles
│   ├── utils/
│   │   ├── analysis.ts          # Data quality calculations (missing, outliers, stats, correlations, scoring)
│   │   ├── featureEngineering.ts# Feature suggestion engine & scoring logic
│   │   └── sampleData.ts        # Sample dataset generator with mixed types & issues
│   └── components/              # (Optional) Reserve for future component extraction
├── public/                      # Static assets (if added)
├── package.json                 # Dependencies & scripts
├── tsconfig.json                # TypeScript configuration
├── tailwind.config.js           # Tailwind theme
└── vercel.json                  # Vercel deployment settings
```

## 🛠️ Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS, custom gradient background
- **Charts**: Recharts (histograms, correlation heatmap matrix)
- **State & Hooks**: React hooks + memoization for performance
- **Parsing**: PapaParse (CSV), SheetJS/xlsx (Excel)
- **Utilities**: Lodash (aggregation, grouping)
- **Icons**: lucide-react (Upload, Sparkles, Rocket, etc.)
- **Build**: Vite, SWC React plugin
- **Deployment**: Vercel (static build + dist output)

## 🚀 Getting Started

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Run type + production build check
npm run build

# Preview optimized build
npm run preview
```

- Dev server defaults to `http://localhost:5173/`. Use `npm run dev -- --host --port <port>` to expose publicly or change ports.
- The sample dataset button loads a synthetic 1000-row schema with numeric, categorical, datetime, and textual patterns (duplicates, missing values, outliers, mixed types) so you can test the dashboards immediately.

## 🧠 Feature Engineering Workflow

The generator produces ideas based on numeric/categorical/datetime/domain heuristics:

- Polynomial terms, ratios, aggregations, binning, skewness fixes
- Encoding strategies (one-hot, ordinal, target, frequency, rare-grouping)
- Text length features, categorical combinations
- Datetime extraction, cyclical encoding, time differences
- Domain-specific signals (e-commerce, real estate, finance, healthcare, time series, text/NLP)

Each suggestion includes:

- Priority badge (🔴 High, 🟡 Medium, 🟢 Low) determined by impact + complexity
- Impact stars and complexity labels (⚡ Quick Win, ⚙️ Standard, 🔬 Advanced)
- Explanation, example, and column references
- Code snippets in Python (pandas), R, and SQL
- Preview modal showing the first 5 rows with proposed transformations
- Apply button to mark selections and generate combined scripts/checklists

## 📦 Export Artifacts

- **Data Quality Report (Markdown)** – summary of completeness, duplicates, outliers
- **Cleaned Dataset CSV** – duplicate rows removed
- **Email Report** – auto-populated `mailto:` link with dataset highlights
- **Feature Engineering Script** – aggregated Python code for selected ideas
- **Feature Engineering Checklist** – Markdown list for documentation/reviews

## ☁️ Deploying to Vercel

1. Ensure `vercel.json` remains:
   ```json
   {
     "framework": "vite",
     "buildCommand": "npm run build",
     "outputDirectory": "dist"
   }
   ```
2. Commit and push to GitHub (`main` branch recommended).
3. In Vercel, import the repository (or redeploy if already connected). Every push triggers `npm install && npm run build` and publishes the `dist` folder.
4. Need a manual redeploy? Open your project dashboard → Deployments → ⋮ → Redeploy.

## ✅ Roadmap Ideas

- Extract dashboard sections into reusable components
- Add automated profiling tests (Vitest) for analysis utilities
- Support Parquet/JSON inputs or API uploads
- Integrate basic model training sandbox using cleaned + engineered features

## 🤝 Contributing

Issues and pull requests are welcome! Please open a discussion before large changes. Use conventional commits (`feat:`, `fix:`, `chore:`) to keep the history tidy.

## 📄 License

This project currently has no explicit license. Add one (e.g., MIT) before distributing publicly.

---

Questions or ideas? Open an issue or reach out via the GitHub repository. Happy data wrangling! ✨