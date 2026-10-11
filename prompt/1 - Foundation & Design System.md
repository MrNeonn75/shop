ROLE: Act as a senior frontend architect and UI/UX engineer.

PROJECT: BRAND HOUSE ERP — multi-branch retail ERP (clothing, shoes, accessories; sections: Kişi, Qadın, Uşaq, Digər). This prompt covers ONLY the frontend foundation. Do not build business modules yet.

TECH STACK (pin stable versions, document them in README):
- React 18 + TypeScript (strict mode), Vite
- React Router, TanStack Query (server state), Zustand (UI/session state)
- React Hook Form + Zod (forms and validation)
- Tailwind CSS + Radix UI primitives (shadcn/ui style components)
- TanStack Table (data tables), Recharts (charts)
- i18next (react-i18next)
- Vitest + React Testing Library + Playwright, ESLint, Prettier, Husky

DEFAULTS:
- UI language: Azerbaijani (az). Architecture must allow adding en and ru without code changes: all strings in /locales/{az,en,ru}/*.json, only az filled now.
- Currency AZN, display format "34.90 ₼". Timezone Asia/Baku. Date format DD.MM.YYYY, 24h time.
- Use Intl APIs for number/date/currency formatting. Create shared formatters: formatMoney, formatDate, formatDateTime, formatQty.
- Money must never be handled as floating-point in logic; use integer qəpik or a decimal library.

BRAND & DESIGN TOKENS:
- Logo: https://brendhouse.az/uploads/2026/03/logo-icon.svg (download into /public/brand/, use as SVG; provide a text-wordmark fallback "BRAND HOUSE").
- Visual style: premium, minimalist, black-and-white foundation, generous whitespace, clear typography, retail-professional look.
- Define ALL colors as CSS variables in one file (src/styles/tokens.css) and map them in Tailwind config. Never hardcode hex values in components.
  --bh-black, --bh-white, --bh-gray-50…900, --bh-accent (PLACEHOLDER: brand accent color from brendhouse.az — I will provide the exact HEX; until then use neutral #111111), semantic: --success, --warning, --danger, --info.
- Light theme is default; implement dark theme through the same tokens (toggle in header).
- Typography: pick one readable sans-serif with full Azerbaijani glyph support (ə, ı, ö, ü, ç, ş, ğ, İ). Verify those characters render correctly, including uppercase "İ".
- 4/8px spacing scale, radius scale, soft shadows, consistent focus rings.

COMPONENT LIBRARY (build in src/components/ui, each with stories or a /dev/ui showcase page):
Button (variants, loading), Input, NumberInput, MoneyInput, Select, Combobox (async search), DatePicker + DateRangePicker, Checkbox, Radio, Switch, Textarea, FormField (label, hint, error), Modal, Drawer, ConfirmDialog (with reason field option), Tabs, Tooltip, Dropdown menu, Toast, Badge/StatusPill, Avatar, Card, KPI card, Skeleton, EmptyState, ErrorState, Pagination, DataTable (sorting, column visibility, server-side pagination, row selection, sticky header, CSV export hook, saved filters), FilterBar (branch, date range, search), FileUpload (type/size validation), Breadcrumbs, PageHeader, PermissionGate component.

ARCHITECTURE:
- Feature-based folders: src/features/<module>/{api,components,hooks,pages,schemas,types}, plus src/shared, src/app (router, providers), src/locales.
- API LAYER: a typed HTTP client (axios or fetch wrapper) with interceptors: auth token, refresh, Idempotency-Key header for POST on sales/payments, standardized error mapping (validation, 401, 403, 409 conflict, 5xx), request cancellation.
- ADAPTER PATTERN: every module talks to an interface (e.g. ProductRepository). Provide two implementations: MockAdapter (realistic seeded data, in-memory, simulated latency) and HttpAdapter (REST, OpenAPI-based). Switch via env VITE_DATA_SOURCE=mock|http. Leave a clearly marked, EMPTY "BrendHouseLegacyAdapter" folder for a future integration with the existing brendhouse.az store API — do NOT invent endpoints; if config is missing show an explicit "Integration not configured" state.
- Seed data must mirror the real store taxonomy: sections Kişi/Qadın/Uşaq/Digər; types Geyim/Ayaqqabı/Aksesuar; categories such as Köynək, Şalvar, Kazak, Sweatshirt, Tshirt, Bluz, Don, Dəst, Jilet, Palto, Ayaqqabı, Çanta və pulqabı; brands such as Tommy Hilfiger, Massimo Dutti, Zara, Adidas; prices in AZN with 2 decimals. Clearly label all mock data as demo; never present it as real.
- Environment: .env.example, no secrets in code, runtime config validation with Zod.
- Global ErrorBoundary, 404/403/500 pages, loading and empty states everywhere.

QUALITY RULES:
- Responsive (desktop-first for back-office, tablet-friendly for warehouse, touch-friendly for POS later).
- Accessibility: WCAG 2.1 AA, keyboard navigation, aria labels, visible focus.
- Frontend permission checks are only UX; assume the backend enforces real authorization (note this in code comments).
- No console errors, no any types, no dead code.

DELIVERABLES:
1) Working project that runs with `npm run dev` and `npm test`.
2) /dev/ui showcase page for all components in light and dark themes.
3) README: stack and versions, folder structure, how to swap mock/http adapter, how to set brand colors, how to add a language.
4) Brief list of assumptions and open questions at the end.