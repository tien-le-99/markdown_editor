export const DEFAULT_MARKDOWN = `# Strategic Executive Overview 2026

Welcome to the **Interactive Markdown Workspace**. This environment provides bidirectional synchronization between rich WYSIWYG editing, interactive data visualization, architectural diagrams, and clean GitHub Flavored Markdown (GFM).

---

## 1. Key Performance Metrics

The table below summarizes quarterly revenue benchmarks and customer acquisition figures across our primary product lines.

| Quarter | Revenue ($M) | Active Subscribers | Growth Rate (%) |
| :--- | :--- | :--- | :--- |
| **Q1 2026** | 42.8 | 320,000 | +18.4% |
| **Q2 2026** | 51.2 | 385,000 | +19.6% |
| **Q3 2026** | 63.5 | 470,000 | +24.0% |
| **Q4 2026** | 78.9 | 590,000 | +24.2% |

---

## 2. Interactive Revenue & Growth Visualizer

The chart below is powered by **Apache ECharts**. You can zoom using the mouse wheel, pan across dates, and use the visual slider to inspect specific quarters. Click **Edit Chart** to customize the JSON configuration or switch chart types.

\`\`\`echarts
{
  "title": {
    "text": "Monthly ARR Trend (2025 - 2026)",
    "left": "center",
    "textStyle": {
      "color": "#1e293b",
      "fontSize": 16,
      "fontWeight": 600
    }
  },
  "tooltip": {
    "trigger": "axis",
    "backgroundColor": "rgba(255, 255, 255, 0.95)",
    "borderColor": "#e2e8f0",
    "textStyle": {
      "color": "#0f172a"
    }
  },
  "legend": {
    "data": ["Enterprise ARR", "SMB Revenue"],
    "top": 32
  },
  "grid": {
    "left": "4%",
    "right": "4%",
    "bottom": "15%",
    "containLabel": true
  },
  "dataZoom": [
    {
      "type": "inside",
      "start": 0,
      "end": 100
    },
    {
      "type": "slider",
      "start": 0,
      "end": 100,
      "height": 22,
      "bottom": "2%"
    }
  ],
  "xAxis": {
    "type": "category",
    "boundaryGap": false,
    "data": ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  },
  "yAxis": {
    "type": "value",
    "axisLabel": {
      "formatter": "\${value}M"
    }
  },
  "series": [
    {
      "name": "Enterprise ARR",
      "type": "line",
      "smooth": true,
      "itemStyle": {
        "color": "#0284c7"
      },
      "areaStyle": {
        "color": "rgba(2, 132, 199, 0.15)"
      },
      "data": [12.4, 14.8, 17.5, 21.0, 25.6, 29.8, 35.2, 41.0, 48.3, 56.1, 64.9, 78.9]
    },
    {
      "name": "SMB Revenue",
      "type": "line",
      "smooth": true,
      "itemStyle": {
        "color": "#10b981"
      },
      "areaStyle": {
        "color": "rgba(16, 185, 129, 0.15)"
      },
      "data": [8.2, 9.1, 10.4, 12.0, 14.2, 16.5, 19.3, 22.8, 26.5, 30.2, 34.8, 41.5]
    }
  ]
}
\`\`\`

---

## 3. Distributed Architecture Sequence Flow

Below is an interactive **Mermaid.js** diagram illustrating real-time synchronization between the client editor, AST parser, and headless PDF compilation service. Use the **Panzoom** controls to zoom in/out, pan, or reset the viewport. Double-click or click **Edit Diagram** to modify the source syntax.

\`\`\`mermaid
sequenceDiagram
    autonumber
    actor User as Engineer / Editor
    participant Canvas as WYSIWYG Canvas
    participant AST as AST & Markdown Engine
    participant Drawer as Raw Markdown Drawer
    participant Server as Server-Side Playwright

    User->>Canvas: Type markdown / format text
    Canvas->>AST: Dispatch ProseMirror Transaction
    AST->>Drawer: Real-Time GFM Sync
    User->>Drawer: Edit raw table or code fences
    Drawer->>Canvas: Two-Way Bidirectional Hydration
    User->>Canvas: Click Export PDF
    Canvas->>Server: POST export-pdf Sanitized HTML
    Server->>Server: Emulate Print Media and Normalize
    Server-->>User: Stream A4 Vector PDF Document
\`\`\`

---

## 4. Mathematical Modeling & Formulas

This workspace provides native **KaTeX LaTeX** rendering for inline equations like $E = mc^2$ and transition vectors like $S_t \\rightarrow S_{t+1}$. Display formulas can be edited live with built-in presets:

$$
x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}
$$

Double-click the formula or click **Edit Formula** to select presets (such as Euler's identity $e^{i\\pi} + 1 = 0$ or Gaussian integrals) or write custom formulas.

---

## 5. Next Steps

* [x] Integrate Apache ECharts with mousewheel dataZoom
* [x] Integrate Mermaid.js with Panzoom (pinch, pan, reset)
* [x] Native LaTeX display for inline ($...$) and block ($$...$$) math with KaTeX
* [x] Bidirectional WYSIWYG & GFM split-view synchronization
* [x] Headless Playwright server-side A4 PDF engine
`;
