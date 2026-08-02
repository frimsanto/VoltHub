# VoltHub Design System

## Brand Identity
VoltHub is PLN's enterprise field operations intelligence platform.
Visual language: **Dark Intelligence** — confident, technical, quietly luxurious.
Inspired by: Linear (ultra-minimal precision) + Raycast (dark chrome + gradient
accents) + Sentry (data-dense dashboards).

Dark mode is the default. Tokens live in `src/styles.css` (oklch color system);
motion primitives in `src/styles/animations.css`, `src/components/v2/Animated.tsx`,
and `src/lib/lenis.ts`.

## Color Tokens (already in CSS, use these)
- Background: `oklch(0.14 0.03 252)` — near-black with blue tint (dark mode default)
- Surface/Card: `oklch(0.19 0.04 252)` — elevated panels
- Primary: `oklch(0.7 0.15 240)` — electric blue
- PLN Yellow: `oklch(0.86 0.17 90)` — accent, CTAs, brand moments only
- PLN Blue Dark: `oklch(0.32 0.14 255)` — deep brand blue
- Border: `oklch(1 0 0 / 10%)` — hairline white borders
- Muted text: `oklch(0.7 0.02 245)`

## Typography
- Font: Inter (already loaded via CSS)
- Display headings: 500–700 weight, -0.02em letter-spacing
- Body: 400 weight, comfortable line-height (1.6)
- Monospace labels (IDs, codes): font-mono, text-xs, tracking-wide

## Spacing & Radius
- Base radius: 1rem (16px) — from CSS `--radius`
- Cards: `rounded-2xl` (20px)
- Buttons: `rounded-xl` (12px)
- Badges/chips: `rounded-full`
- Generous whitespace: sections min 24px gap

## Component Rules
- Cards: `bg-card border border-border/50 shadow-soft` — no heavy shadows
- Borders: hairline (`border-white/10` on dark) — never chunky
- Buttons primary: PLN Blue with subtle glow on hover
- Sidebar: deep dark `oklch(0.16 0.04 252)`, yellow active indicators
- Modals: glassmorphism (`backdrop-blur-xl bg-background/90`)
- Tables: no outer border, subtle row separator only; status rows carry a
  2px left accent (`border-l-2` in the status color)
- Empty states: centered, soft illustration with dashed border

## Motion Principles
- Entrance: `fade-in` + slight translateY (8px → 0) over 200ms
- Hover: subtle scale (1.01) or translateY(-1px), 150ms ease-out — never a
  transform that shifts surrounding layout
- Page transitions: opacity fade, 200ms
- Loading: shimmer skeleton, not spinners (except button loading)
- Lenis smooth scroll: `duration: 1.2`, exponential ease-out, active on the app
  shell (list/detail pages); disabled automatically under `prefers-reduced-motion`
- NO: bouncy springs, overly dramatic slides, attention-seeking animations

## AI Assistant
- Personality: warm, conversational, professional bilingual (ID/EN)
- Can discuss anything (not just DB queries)
- Uses `llama-3.3-70b-versatile` via the Groq API (browser fetch,
  `VITE_GROQ_API_KEY`); graceful preview mode when no key is configured
- Animated typing indicator while a reply is in flight — feels like live
  intelligence
- UI: floating drawer, glassmorphism, gradient accent line, suggestion chips
