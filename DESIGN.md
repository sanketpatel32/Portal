---
name: AuraFlow Design System
description: A high-contrast, distraction-free developer workspace featuring flat surfaces, sharp borders, and zero gradients.
colors:
  primary: "#9d4edd"
  secondary: "#00f5d4"
  neutral-bg: "#09090e"
  neutral-card: "#12121d"
  neutral-border: "#222235"
  text-main: "#f1f3f9"
  text-muted: "#8e94a9"
typography:
  display:
    fontFamily: "Outfit, sans-serif"
    fontSize: "clamp(2rem, 5vw, 3.5rem)"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Plus Jakarta Sans, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.6
rounded:
  sm: "6px"
  md: "10px"
spacing:
  sm: "12px"
  md: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.neutral-bg}"
    rounded: "{rounded.sm}"
    padding: "10px 16px"
  card:
    backgroundColor: "{colors.neutral-card}"
    rounded: "{rounded.md}"
    padding: "24px"
---

# Design System: AuraFlow

## 1. Overview

**Creative North Star: "The Terminal Native Workspace"**

AuraFlow's visual design is optimized for high readability, clean density, and distraction-free utility. Designed specifically for developers managing tasks and monitoring performance diagnostics, it rejects all decorative AI clutter—such as neon gradients, glowing blurs, and glassmorphism—in favor of solid high-contrast surfaces, crisp borders, and monospaced telemetry.

### Key Characteristics:
*   **Zero Gradients**: Headings and backgrounds are rendered in solid colors for clear, honest contrast.
*   **High-Contrast Borders**: Layout grids and widgets are separated by distinct solid outlines rather than floating shadows or drop shadows.
*   **Technical Densities**: Layouts use monospaced typography and condensed tabular lists for structured diagnostic data.

---

## 2. Colors

A strictly limited, focused palette emphasizing readability, with solid accents used only to signal system events or connection states.

### Primary
*   **Developer Violet** (#9d4edd): Used exclusively for primary buttons and interactive hover focus highlights.

### Secondary
*   **Terminal Cyan** (#00f5d4): Used as a secondary highlight color to represent active processes or WebSocket connection indicators.

### Neutral
*   **Deep Cyber-Dark** (#09090e): The main background color of the workspace.
*   **Surface Charcoal** (#12121d): The background for containers, cards, and input panels.
*   **Console Border** (#222235): The solid outline used to separate containers and panels.
*   **High-Contrast White** (#f1f3f9): Main reading text.
*   **Steel Muted Gray** (#8e94a9): Subtext and secondary labels.

### Named Rules
**The Accents-Only Rule.** Secondary and primary colors are utilized strictly as solid highlights. They must represent less than 5% of any screen surface.

---

## 3. Typography

**Display Font:** Outfit
**Body Font:** Plus Jakarta Sans
**Label/Mono Font:** monospace

Typography pairing provides contrast between Outfit's sharp geometric headers and Plus Jakarta Sans' clean, legible prose.

### Hierarchy
*   **Display** (700, 2.5rem, 1.1): Hero headlines, dashboard titles.
*   **Headline** (600, 1.5rem, 1.2): Section headings.
*   **Title** (600, 1.1rem, 1.3): Card headers, modal titles.
*   **Body** (400, 15px, 1.6): Standard text, task descriptions. Maximum line length is capped at 75ch.
*   **Label** (700, 11px, 0.05em, uppercase): Priorities, state labels, buttons.

---

## 4. Elevation

Depth is conveyed through solid borders (`#222235`) and distinct background fills rather than shadows or blurs.

### Named Rules
**The Flat-By-Default Rule.** All cards, modals, and dropdowns are rendered flat at rest. No box-shadows or blurs are allowed. Focus states or hovers are signaled by shifting border colors or background fills.

---

## 5. Components

### Buttons
*   **Shape:** Sharp corners (6px radius).
*   **Primary:** Solid purple background (`#9d4edd`), white text, no gradient.
*   **Hover:** Background shifts to a solid lighter purple, with a 1px border.

### Cards / Containers
*   **Corner Style:** Rounded corners (10px radius).
*   **Background:** Solid surface charcoal (`#12121d`).
*   **Border:** Solid outline (`1px solid #222235`).
*   **Shadow:** None.

### Inputs / Fields
*   **Style:** Dark charcoal fill (`#0d0d17`) with a solid outline (`#222235`).
*   **Focus:** Border shifts to solid purple (`#9d4edd`).

---

## 6. Do's and Don'ts

### Do:
*   **Do** use solid, clean colors for all typography.
*   **Do** display server telemetry in a clean, legible, monospaced layout.
*   **Do** use sharp 1px solid outlines (`#222235`) to partition layout regions.

### Don't:
*   **Don't** use text gradients (`background-clip: text`) or gradient button backgrounds.
*   **Don't** use glassmorphic blurs or backdrop-filters.
*   **Don't** use decorative shadows under cards or containers.
