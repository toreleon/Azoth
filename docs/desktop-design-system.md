# Azoth Desktop Design System

This note defines the visual and interaction rules for the Electron desktop app
under `desktop/src/renderer`. New desktop features should follow this system
before adding new visual patterns.

## Goals

- Keep Azoth quiet, dense, and work-focused for repeated trading and research
  workflows.
- Make every feature feel native to the same product, including onboarding,
  chat, settings, agent runs, tool output, and approval prompts.
- Prefer reusable CSS tokens and named component classes over one-off utility
  class strings in JSX.

## Source Of Truth

The design system lives in `desktop/src/renderer/styles/globals.css`.

Use the existing CSS custom properties for all new surfaces:

- Color: `--bg`, `--surface`, `--surface-warm`, `--fg`, `--muted`, `--meta`,
  `--border`, `--accent`, `--success`, `--warn`, and `--danger`.
- Type: `--font-display`, `--font-body`, `--font-mono`, `--text-xs` through
  `--text-3xl`, `--leading-body`, and `--leading-tight`.
- Spacing: `--space-1` through `--space-8`.
- Shape: `--radius-sm`, `--radius-md`, `--radius-lg`, and `--radius-pill`.
- Effects: `--hairline`, `--elev-raised`, `--focus-ring`, `--motion-fast`,
  `--motion-base`, and `--ease-standard`.

Do not hard-code app colors in feature components unless the value represents a
real domain signal, such as candlestick up/down colors or macOS traffic lights.

## Core Primitives

Use these shared classes before adding feature-specific styles:

- `ds-card`: bordered 8px card container for repeated items, modals, tool cards,
  and compact framed surfaces.
- `ds-button`: default button. Add `primary` for primary actions and `danger`
  for destructive actions.
- `ds-input` and `ds-select`: standard form controls.
- `ds-field` and `ds-field-label`: labeled form field wrapper and label.
- `ds-title`, `ds-copy`, and `ds-kicker`: standard title, body copy, and
  uppercase metadata text.
- `ds-actions`: horizontal action row where buttons share available width.
- `full-width`: use only when a control intentionally fills its container.

Feature classes should layer on top of these primitives, for example
`className="consent-toast ds-card"` or
`className="ds-button primary full-width"`.

## Layout Rules

- The main app grid is sidebar, chat, and optional agent panel. Keep dense
  operational UI in these regions rather than introducing landing-page layouts.
- Use full-width sections or unframed layouts for page regions. Use cards only
  for repeated items, modals, tool cards, and genuinely framed controls.
- Cards use 8px radius unless a control is intentionally pill-shaped.
- Avoid nested cards. If content needs hierarchy inside a card, use borders,
  rows, headers, details, or metric grids.
- Use stable dimensions for fixed-format UI such as sidebars, tool rows, icon
  buttons, metrics, and charts so hover states and dynamic text do not shift the
  layout.
- Text must truncate or wrap deliberately. Use `min-width: 0`, ellipsis, and
  responsive grid tracks where long model names, tickers, session titles, or
  tool output can appear.

## Interaction Rules

- All keyboard-focusable controls must rely on the shared `--focus-ring`.
- Icon-only controls need `title` or `aria-label`.
- Disabled controls should keep their dimensions and use opacity, not layout
  changes.
- Use segmented controls for small mutually exclusive settings, switches for
  binary settings, sliders for bounded numeric settings, and menus/selects for
  longer option sets.
- Avoid visible instructional copy that explains obvious UI mechanics. Empty
  states can suggest useful first actions.

## Icons

Desktop icons should use the shared Codex-style icon set in
`desktop/src/renderer/components/Icon.tsx`.

- Use `Icon.tsx` exports before adding inline SVGs to feature components.
- Icons use a `24 x 24` viewBox, outline strokes, rounded caps and joins, and
  the shared `codex-icon` CSS class.
- Default icon color should inherit from the surrounding text. Feature CSS can
  set semantic state color on the containing control or icon class.
- Keep icon sizes controlled in CSS. Do not put Tailwind sizing classes on SVGs.
- Add a new icon to `Icon.tsx` only when an existing icon cannot express the
  action clearly.
- Data visualizations and brand marks may keep custom SVGs because they are not
  product control icons.

## Color And Tone

- The base palette is neutral with blue accent, green success, yellow warning,
  and red danger.
- Do not introduce decorative gradients, glow blobs, or one-off color themes.
- Use semantic colors only for state and risk: `--success`, `--warn`,
  `--danger`, and `--accent`.
- Both light and dark themes must work from the same token names. When adding a
  token, define it in both `:root` and `:root[data-theme="dark"]`.

## Typography

- Use `--font-body` for product UI, `--font-display` for major pane headings,
  and `--font-mono` for IDs, paths, numeric technical data, and tool metadata.
- Do not scale font sizes by viewport width.
- Keep letter spacing at `0` for normal text. Uppercase metadata may use
  positive letter spacing already established in the CSS.
- Compact panels, cards, settings rows, and sidebars should use `--text-xs`,
  `--text-sm`, or `--text-base`. Reserve larger type for pane headers and
  onboarding titles.

## JSX Guidelines

- Prefer named classes such as `settings-row`, `team-card`, or `agent-run`
  backed by `globals.css`.
- Avoid Tailwind utility strings in renderer components for product styling,
  especially `bg-*`, `text-*`, `border-*`, `rounded-*`, `px-*`, `py-*`,
  `shadow-*`, and `w-[...]`.
- It is fine to add a small feature-specific class when a primitive is not
  enough. Put the style near related feature CSS in `globals.css`.
- Reuse existing SVG icon patterns in nearby components. Keep icons sized by
  CSS classes rather than utility classes on each SVG.

## Feature Checklist

Before merging a desktop UI feature:

- It uses design-system tokens instead of hard-coded app colors.
- It uses existing primitives before adding new feature-specific CSS.
- It works in light and dark themes.
- It has keyboard focus states.
- Long labels, model names, tickers, paths, and tool text do not overflow.
- Cards, rows, buttons, and controls keep stable dimensions on hover and while
  data is loading.
- Renderer JSX does not introduce new Tailwind utility styling.
- `pnpm --dir desktop typecheck` passes.
