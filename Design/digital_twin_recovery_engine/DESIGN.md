---
name: MirrorWorld Pulse
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#3f4850'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#707881'
  outline-variant: '#bfc7d2'
  surface-tint: '#006398'
  primary: '#006194'
  on-primary: '#ffffff'
  primary-container: '#007bb9'
  on-primary-container: '#fdfcff'
  inverse-primary: '#93ccff'
  secondary: '#006591'
  on-secondary: '#ffffff'
  secondary-container: '#39b8fd'
  on-secondary-container: '#004666'
  tertiary: '#4648d4'
  on-tertiary: '#ffffff'
  tertiary-container: '#6063ee'
  on-tertiary-container: '#fffbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#cce5ff'
  primary-fixed-dim: '#93ccff'
  on-primary-fixed: '#001d31'
  on-primary-fixed-variant: '#004b73'
  secondary-fixed: '#c9e6ff'
  secondary-fixed-dim: '#89ceff'
  on-secondary-fixed: '#001e2f'
  on-secondary-fixed-variant: '#004c6e'
  tertiary-fixed: '#e1e0ff'
  tertiary-fixed-dim: '#c0c1ff'
  on-tertiary-fixed: '#07006c'
  on-tertiary-fixed-variant: '#2f2ebe'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
  surface-base: '#f4f6fb'
  surface-card: '#ffffff'
  surface-subtle: '#f8fafc'
  surface-border: '#e2e8f0'
  surface-hover: '#f1f5f9'
  slate-850: '#152033'
  slate-900: '#0f172a'
  critical-rose: '#e11d48'
  critical-rose-subtle: '#fff1f2'
  warning-amber: '#d97706'
  warning-amber-subtle: '#fffbeb'
  success-emerald: '#059669'
  success-emerald-subtle: '#ecfdf5'
  accent-cyan: '#22d3ee'
typography:
  headline-xl:
    fontFamily: Geist
    fontSize: 1.875rem
    fontWeight: '700'
    lineHeight: 2.25rem
    letterSpacing: -0.025em
  headline-lg:
    fontFamily: Geist
    fontSize: 1.5rem
    fontWeight: '700'
    lineHeight: 2rem
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Geist
    fontSize: 1.25rem
    fontWeight: '600'
    lineHeight: 1.75rem
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Geist
    fontSize: 0.875rem
    fontWeight: '700'
    lineHeight: 1.25rem
  body-md:
    fontFamily: Geist
    fontSize: 0.875rem
    fontWeight: '400'
    lineHeight: 1.25rem
  body-sm:
    fontFamily: Geist
    fontSize: 0.75rem
    fontWeight: '400'
    lineHeight: 1rem
  body-xs:
    fontFamily: Geist
    fontSize: 0.6875rem
    fontWeight: '400'
    lineHeight: 0.875rem
  label-mono-lg:
    fontFamily: JetBrains Mono
    fontSize: 0.875rem
    fontWeight: '600'
    lineHeight: 1.25rem
  label-mono-md:
    fontFamily: JetBrains Mono
    fontSize: 0.75rem
    fontWeight: '500'
    lineHeight: 1rem
  label-mono-sm:
    fontFamily: JetBrains Mono
    fontSize: 0.625rem
    fontWeight: '600'
    lineHeight: 0.875rem
    letterSpacing: 0.05em
  label-mono-xs:
    fontFamily: JetBrains Mono
    fontSize: 0.5625rem
    fontWeight: '700'
    lineHeight: 0.75rem
    letterSpacing: 0.06em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1.5rem
  margin: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
---

## Brand & Style
MirrorWorld Pulse delivers mission-critical campus telemetry, schedule optimization, and facility intelligence. Designed for university provosts, operational planners, and campus facility directors, the brand evokes calm precision, authoritative analytical depth, and responsiveness under operational stress.

The visual style is **Corporate / Modern High-Density Analytical SaaS** infused with subtle telemetry cues. It utilizes crisp white surfaces against a cool neutral backdrop (`#F4F6FB`), micro-metric typography via monospace tags, and energetic cyan-to-sky gradients for key heuristic solvers. Information hierarchy is prioritized above all: high-contrast typography, hairline dividers, structured KPI cards, and contextual alert states provide clear visibility during complex facility reallocations.

## Colors
The color architecture relies on a crisp light canvas with strategic functional accents:
- **Canvas & Surfaces:** Base canvas sits on `#F4F6FB` with card elevations on `#FFFFFF`. Interior containers and subtle rows use `#F8FAFC` bordered with `#E2E8F0`.
- **Primary & Actions:** Deep sky blue (`#0284C7`) and vibrant cyan-sky gradients (`#0EA5E9` to `#22D3EE`) anchor telemetry links, primary buttons, and live solving states.
- **Alert & Severity Semantics:**
  - *Critical / Thermal Runaway / Clash:* `#E11D48` text/fill on `#FFF1F2` tint.
  - *Warning / Caution / Medium:* `#D97706` text on `#FFFBEB`.
  - *Optimal / Free / Feasible:* `#059669` text on `#ECFDF5`.
- **Solver Dark Anchor:** High-priority compute widgets utilize `#0F172A` to `#152033` with glowing cyan accents (`#22D3EE`) to visually differentiate algorithmic processing engines from administrative tables.

## Typography
Typographic rhythm combines **Geist** for crisp, modern legibility across UI copy with **JetBrains Mono** for numerical telemetry, timestamps, solver statuses, and tags.

- **KPI Metric Numbers:** Rendered in bold, compact sizes (`1.875rem` / `30px`) with tight tracking.
- **Section & Widget Headers:** Set in Geist Semibold/Bold at `0.875rem` (14px) to sustain high-density analytical dashboards without wasting vertical space.
- **Metadata & Subtext:** Set at `0.6875rem` (11px) to `0.75rem` (12px) in muted slate tones (`#64748B`).
- **Telemetry Tags:** Uppercase JetBrains Mono at `9px` to `10px` ensures unambiguous distinction between codes, solver runtimes, and SLA status counters.

## Layout & Spacing
The layout follows a persistent navigation shell structure:
- **Global Structure:** A fixed 256px (`16rem`) sidebar on the left paired with a sticky 64px (`4rem`) top header.
- **Main Canvas:** Max width constrained to `1600px` centered within the primary viewport with responsive horizontal gutters (`1.5rem` to `2rem`).
- **Grid Structure:** The analytical core utilizes a 12-column grid (`gap-6` / `1.5rem`). Analytics bars and timetable matrices span 7 columns, while algorithmic solvers, triage queues, and stress drills span 5 columns.
- **Responsive Adaptations:**
  - *Mobile (<640px):* Sidebar off-canvas; 4 KPI metric cards collapse into a single column; 12-col layout drops to a single stacked column.
  - *Tablet (640px - 1024px):* 2-column KPI grid; panels stack vertically; timetable matrices enable horizontal scroll overflow.
  - *Desktop (>1024px):* Full dual-column 7/5 dashboard layout with persistent real-time solver widgets.

## Elevation & Depth
Depth is established primarily through **ambient micro-shadows** and **crisp surface borders** rather than heavy blurred elevations:
- **Level 0 (Canvas):** Underlying canvas sits on flat `#F4F6FB`.
- **Level 1 (Cards & Sidebars):** Pure white `#FFFFFF` bounded by a 1px border of `#E2E8F0` and accompanied by a delicate micro-shadow: `0 1px 3px 0 rgba(15, 23, 42, 0.05), 0 1px 2px -1px rgba(15, 23, 42, 0.04)`.
- **Level 2 (Hover & Focus States):** Cards elevate softly with `0 4px 6px -1px rgba(15, 23, 42, 0.07)`.
- **Level 3 (Dark Feature Blocks & Solver Engines):** Deep slate containers (`#0F172A`) use `0 10px 15px -3px rgba(15, 23, 42, 0.08)` complemented by internal border highlights (`border-white/10`) and radial cyan ambient glows.
- **Level 4 (Toasts & Overlays):** Fixed toasts use high-elevation deep slate styling with `0 25px 50px -12px rgba(15, 23, 42, 0.25)` and 1px `#334155` border containment.

## Shapes
The design system operates with **Soft (Level 1)** geometry, calibrated for institutional and developer tools:
- **Base Components & Inputs:** `0.5rem` (`rounded-lg`) for buttons, inputs, context switchers, and list items.
- **Cards & Primary Containers:** `0.75rem` (`rounded-xl`) for main metric tiles, charts, and modal panels.
- **Pills & Status Badges:** `9999px` (`rounded-full`) or `0.25rem` (`rounded`) for monospace telemetry badges (`LIVE`, `DIFF`, `CORE`).
- **Progress & Heatmap Cells:** `0.375rem` (`rounded-md`) for calendar heatmap cells, with rounded-full geometry for linear capacity meters.

## Components

### Buttons
- **Primary Gradient Button:** `bg-gradient-to-r from-sky-500 to-cyan-500` hover `from-sky-600 to-cyan-600`, white text, `0.75rem` font size, semibold weight, rounded-lg, subtle shadow, active scale `0.95`.
- **Dark Tactical Button:** Solid `#0F172A` with `#FFFFFF` text and cyan icon accents (`text-cyan-400`), padding `8px 16px`.
- **Semantic Action Buttons:** Rose outlined or solid (`#E11D48`) for immediate mitigation workflows (`Resolve in Solver`).
- **Context/Ghost Buttons:** Background `#F8FAFC`, border `#E2E8F0`, slate text (`#334155`) with hover to `#F1F5F9`.

### Badges & Status Chips
- Monospace label tags (`9px` / `10px` JetBrains Mono) with light-tinted backgrounds and matching border outlines.
- *Status variants:*
  - `bg-sky-50 text-sky-700 border-sky-100` (Information / Live)
  - `bg-emerald-50 text-emerald-700 border-emerald-100` (Optimal / SLA Passed)
  - `bg-amber-50 text-amber-800 border-amber-200` (Medium Overcapacity)
  - `bg-rose-50 text-rose-700 border-rose-100` or solid `bg-rose-600 text-white` (Disruption / Overheat)

### Input Fields & Search
- Low-contrast background `#F8FAFC` transitioning to `#FFFFFF` on active focus.
- 1px border `#E2E8F0` expanding to `#0EA5E9` with 1px ring on focus.
- Integrated keyboard shortcuts (`⌘K`) housed in dedicated white pill boxes with subtle borders.

### Cards & Telemetry KPI Tiles
- Pure white background, `p-5` to `p-6`, rounded-xl, bordered with `#E2E8F0`.
- Metric numbers positioned alongside categorical badges and border-top dividers summarizing department capacities.
- Accent severity indicators use a 4px left-border strip (e.g., `border-l-rose-500` for schedule clash indicators).

### Timetable Heatmap Matrix
- Responsive grid containing 11 temporal columns (Day/Hr).
- Color-coded percentage cells scaled through light neutral (<30%), sky tint (30-70%), saturated sky (70-90%), and deep rose (>90% saturation).

### Disruption Triage Lists
- Segmented notification cards within an operational queue with left badge codes (`INC #D-408`), inline action links (`Simulate Recovery`), and sub-label impact statements.