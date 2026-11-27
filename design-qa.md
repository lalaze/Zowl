# Web design QA — Zowl owl storybook

This records the visual QA for the web's move to the Zowl owl storybook look,
the same design the Android app ships.

## Design reference

- Source of truth: the Flutter theme in `mobile/lib/core/theme.dart`. Web tokens
  live in `src/app/globals.css`; accents are defined in `src/lib/accent-theme.ts`
  with a comment to keep both in sync.
- Surfaces: warm paper `#f6f1e8` (light) and `#15151b` (dark), white / `#1f1f27`
  cards, large rounded corners and 2 px hairline borders. Cards carry no shadow;
  soft shadows are reserved for floating layers (tooltips, menus, the + add menu).
- Type: Nunito, bundled locally from `src/app/fonts/` (SIL OFL), with PingFang SC
  as the CJK fallback.
- Accents: Amber `#f2b33d` (default), Night owl `#3d4a8f`, Forest `#2f7a57`,
  Berry `#b8436f`, each with its own dark-mode variant. Accents saved by the
  previous design (`orange`, `blue`, `violet`, `emerald`, `rose`) migrate on load.
- Brand: the geometric owl in `src/components/brand/owl.tsx`; the sky, branch and
  owl scene in `src/components/brand/story-scene.tsx` heads the home page and the
  desktop dashboard. The owl speaks the monthly insight on Insights.
- Navigation: desktop sidebar Home / Activity / Import / Insights / Categories /
  Settings; mobile bottom bar Home / Activity / + / Insights / Me.
- Theme mode defaults to following the system, like the app's `ThemeMode.system`.

## 2026-11-13 sweep

### Method

- Isolated preview: `next dev` on port 3200 with its own SQLite database, storage
  root and dist directory, seeded by `npm run db:setup`; no real data involved.
- Seeded states: a confirmed Alipay file import (result page), an unconfirmed
  file import (review page), an unconfirmed Mock screenshot recognition (review
  page), and a transaction for the detail and edit pages.
- Viewports: 1440 × 900 desktop and 390 × 844 mobile (iPhone 12, 3× pixels),
  each in light and dark: 19 routes × 4 combinations = 76 captures.
- Routes: `/login`, `/`, `/transactions`, `/transactions/new`,
  `/transactions/[id]`, `/transactions/[id]/edit`, `/statistics`, `/imports`,
  `/imports/files`, `/imports/files/[batchId]/review`,
  `/imports/files/[batchId]/result`, `/imports/screenshots`,
  `/imports/screenshots/[jobId]/review`, `/categories`, `/categories/ai-review`,
  `/settings`, `/settings/admin`, `/android`, and a missing route (404 page).

### Automated checks on every capture

| Check | Result |
| --- | --- |
| Horizontal overflow (`scrollWidth` beyond the viewport, or any visible element past the right edge outside a scroll container) | None |
| Old Dango palette in computed `color`, `background-color`, `border-color`, `fill`, `stroke` (coral, butter, lilac, peach, mint, cocoa and their dark variants, from the previous `globals.css`) | None outside user data (see below) |
| Body font | Nunito everywhere |
| Images from removed assets (`dango-*`, `ze-money-brand-mark*`) | None |
| Visible text "Dango", "团子", "三花" | None |
| Console errors and failed requests | None, apart from the intended 404 status of the missing-route page |

### Manual review

Downscaled captures were reviewed for home, transactions and Insights (390,
light), Settings, file review and Categories (390, dark), the bottom of the
review and edit forms (390), and the desktop dashboard, Categories and Settings
(1440). All use the paper surfaces, Nunito, amber primary actions, the owl brand
and the shared bottom navigation; category glyphs render their chosen icons.
The sticky confirmation card on the file review page floats above the bottom
navigation and never hides the last row.

### Fixed in this pass

- The desktop dashboard's spending donut still hard-coded the Dango pastels
  (`#ff9f68`, `#ffc9d6`, `#9ed8b5`, `#ffe08f`). It now uses each category's own
  color, like the Insights donut and the app.
- `CategoryGlyph` loaded icons through Lucide's `DynamicIcon`, which creates one
  async chunk per icon (~2,000) for every route that shows a category. A cold dev
  compile of `/categories` took 15–20 s and the dev server grew past 16 GB, which
  is what failed the Playwright suite. Icons now come from one lazily loaded
  chunk, and the icon name list is a static JSON file guarded by a unit test.

### Intentional or out of scope

- `/android` mentions zeMoney on purpose: it tells existing users of the old
  zeMoney Android app how to move to Zowl.
- Default category colors (`src/lib/default-categories.ts`) are per-user data
  that predates the Dango look; some share hex values with old tokens (for
  example `#f97316`) and were left as they are.
- The new-category form labels its icon field "icon" in lowercase; the
  Playwright suite selects that control by the same accessible name.

### Engineering verification

- TypeScript (`npm run typecheck`): passed.
- ESLint (`npm run lint`): passed.
- Vitest (`npm test`): 51 files, 337 tests passed.
- Playwright (`npm run test:e2e`, dev server): 18 of 18 passed.

final result: passed
