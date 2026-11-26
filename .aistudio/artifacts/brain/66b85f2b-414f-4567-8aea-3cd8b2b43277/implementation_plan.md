# DEX Marketing by Colakin — Enterprise AI Marketing Operations Platform

An end-to-end, multi-tenant B2B marketing operations SaaS platform uniting email marketing, MCP-first CRM integration, AI-assisted lead intelligence, social media publishing, approval governance, workflow automation, and unified analytics under the Colakin and DeX brand system.

## User Review & Critical Decisions

> [!IMPORTANT]
> **Neon PostgreSQL Connection & Zero-Config Demo Readiness**: We will build the full relational database schema and migrations using **Drizzle ORM** targeting **Neon PostgreSQL** (`DATABASE_URL`). Because your Neon connection string is not yet configured in the environment, the backend will include a **PostgreSQL-parity Demo Store fallback** seeded with realistic multi-tenant data so every workflow executes immediately on first launch. Once you add your free Neon `DATABASE_URL` in **Settings > Secrets**, the application automatically uses Neon PostgreSQL for persistent storage with zero code changes.

- **Confirmed Decision 1 (End-to-End Scope & MCP Priority)**: Full start-to-end delivery executed cleanly phase-by-phase, including a real MCP-compatible CRM connector layer (`tools/list`, `tools/call`, external ID tracking, sync diagnostics) alongside mock/live adapter modes.
- **Confirmed Decision 2 (Database & Runtime Stack)**: Adapted cleanly to the workspace's **React + Vite + Express + TypeScript** full-stack architecture with **Drizzle ORM** for **Neon PostgreSQL**, custom session-based multi-tenant authentication (password hashing via `scrypt` + bearer token / secure session verification), and a Postgres-backed / in-process background job queue.
- **Confirmed Decision 3 (Brand Hierarchy & Visual Identity)**: Sidebar lockup places **Colakin** (`companylogo1`) on top with **DeX** (`companylogo2`) positioned cleanly directly beneath it as the sub-brand, styled in the light ice-blue, royal blue, warm gold, and crisp white surface palette from your reference UI.
- **Confirmed Decision 4 (AI & External Providers)**: Real server-side **Gemini AI** (`@google/genai` using `gemini-4-hydrogen`) behind a provider-agnostic `AIProvider` interface (supporting Groq, OpenRouter, Ollama, and automatic Demo Fallback if a quota or key is unavailable), paired with adapter + transparent simulation modes for Email (Resend / SMTP / Preview), Social (OAuth-ready platform adapters), and CRM (MCP / HubSpot / Salesforce / Zoho / Dynamics 365).

> [!NOTE]
> **Transparent Capability Boundaries**: Social platforms (LinkedIn, Instagram, Facebook, X, YouTube) and external CRMs require verified OAuth apps and API approvals to publish or sync live externally. All adapters will implement authentic OAuth popup/callback flows, capability checks, and explicit `"Demo Simulation"` indicators when running without external credentials—never disguising simulated deliveries as real external actions.

---

## 1. Overview & Core Concept

- **What It Does**: DEX Marketing eliminates tool sprawl by unifying the complete marketing lifecycle inside one multi-tenant workspace:
  `Lead Discovery → Enrichment → Audience Segmentation → Campaign Creation → AI Content → Review & Approval → Calendar Scheduling → Background Execution → Tracking & Compliance → Analytics & Automation`.
- **Target Audience / Persona**: Marketing agencies managing multiple client workspaces, growth teams, marketing managers, campaign editors, analysts, and operations leads.
- **Key Value**: Organizations share one secure multi-tenant platform with strict server-side role and tenant boundaries, MCP-native CRM sync (keeping external CRMs as the source of truth), automated compliance/suppression checks, and explainable AI assistance grounded in each workspace's Brand Kit.

---

## 2. User Experience & Visual Design

### Key User Flows
1. **Authentication & Multi-Tenant Onboarding**: Users sign in via email/password (or quick-switch between pre-seeded Demo Accounts for `Owner`, `Admin`, `Marketing Manager`, `Campaign Editor`, `Analyst`, and `Viewer`), choose or create an Organization and Workspace in the header switcher, and immediately see tenant-scoped data with a clear Demo Mode banner when simulated providers are active.
2. **Unified Dashboard & Quick Actions**: View database-computed KPIs (Audience, Active Campaigns, Delivery/Open/Click/Bounce/Unsubscribe rates, Leads, Social Engagement, Scheduled Posts, Conversion), performance charts, recent audit activity, upcoming calendar items, and 1-click quick actions.
3. **Email Campaign Wizard & Compliance**: 6-step wizard (`Details → Audience & Suppression Check → Rich Content + AI Rewrite + Variable Preview → Tracking Config → Compliance Review → Schedule / Test / Send`) followed by dedicated per-campaign analytics and a public-safe Unsubscribe Center.
4. **Lead Intelligence & MCP CRM Sync**: Natural-language ICP prompt parsed by Gemini AI into structured filters, multi-provider search abstraction, provenance-backed enrichment cards (`Source · Confidence · Last Checked`), explainable lead scoring, and 1-click push/match to connected MCP CRM connectors.
5. **Social Studio, Calendar & Approvals**: Multi-platform composer generating tailored copy per network, Brand Kit voice injection, asset library, interactive Month/Week/Day/List UTC-to-local calendar, and role-gated Approval Queue (`Draft → Review → Approved/Rejected → Scheduled → Published`).
6. **Visual Automation & Analytics**: Interactive node workflow builder where every supported node (`Trigger`, `Condition`, `Delay`, `Branch`, `Action`) executes through the job engine with full run logs, paired with unified cross-channel analytics and printable reports.

### Visual Identity & Theme (Colakin + DeX Design System)
- **Aesthetic Direction**: Crisp, light-mode enterprise SaaS inspired directly by the Colakin & DeX workspace UI—airy architectural surfaces, subtle blue-to-warm-cream dot-matrix ambient backdrop, and high-density scannable workspaces without clutter or "AI slop."
- **Color Palette & Mood**:
  - *60% Dominant Canvas*: Crisp white (`#FFFFFF`) cards on a subtle cool ice-blue canvas (`#F4F7FE`) accented softly by the signature Colakin dot-grid header backdrop (`#EAF1FF` transitioning gently toward `#FDF7E7`).
  - *30% Structural Surfaces*: Cool slate hairline borders (`#E2E8F0`), muted secondary panels (`#F8FAFC`), and deep navy ink (`#0F172A` / `#0A2472`) for authoritative legibility.
  - *10% Primary & Brand Accents*: DeX Royal Blue (`#1D63ED`) for primary CTAs and active navigation states, paired with DeX Amber Gold (`#F5B400`) used intentionally as a crisp **top accent bar** on active workspace tabs and subtle brand markers (matching your reference screenshot).
  - *Semantic States*: Forest Green (`#16A34A`) for active/healthy, Amber (`#D97706`) for pending/warning, Crimson (`#DC2626`) for suppressed/failed—always paired with explicit text labels.
- **Typography & Hierarchy**:
  - *Display & Navigation*: `Plus Jakarta Sans` (SemiBold/Bold 600–700) with `text-wrap: balance` on headings.
  - *Body & Dense Tables*: `DM Sans` (Regular 400 / Medium 500) at 13px–15px for crisp readability.
  - *Metrics, IDs & Timestamps*: `JetBrains Mono` with strict `tabular-nums` alignment across all KPIs, rates, and tables.
- **Component & Anti-Clutter Discipline**:
  - Collapsible desktop sidebar (`256px` expanded / `72px` collapsed) with **Colakin logo** stacked cleanly above **DeX sub-brand**, plus mobile drawer navigation.
  - Single-elevation flat cards with `1px` hairline borders (zero nested card-inside-card stacks, zero thick left `border-l-4` stripes, zero pulsing decorative dots).
  - Unboxed typographic metadata (`Email · Product Launch · Updated 2h ago`) instead of cluttered pill capsules.
  - Responsive states everywhere: populated tables, helpful empty states with primary CTAs, skeleton loaders, error boundaries, and confirmation dialogs.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Express + Vite Full-Stack Architecture vs. Next.js**
  - *Chosen Approach*: Build a clean modular Express API + background worker backend integrated with Vite/React SPA on port 3000.
  - *Why*: Matches the container runtime directly (`server.ts` + `vite.middlewares`), ensures fast builds, clean service/repository separation, and zero framework friction.
  - *Alternatives Considered*: Porting the workspace to Next.js App Router, which would break container preview assumptions.
- **Decision 2: Dual-Engine Persistence (Neon PostgreSQL via Drizzle + Parity Demo Store)**
  - *Chosen Approach*: Define the complete normalized Drizzle PostgreSQL schema (30+ tables covering auth, multi-tenancy, campaigns, contacts, segments, suppression, MCP CRM, social, assets, brand kits, approvals, automations, jobs, analytics, and audit logs) plus SQL migrations, backed by a repository factory that uses Neon PostgreSQL when `DATABASE_URL` is configured and a stateful seeded Demo Store when unconfigured.
  - *Why*: Satisfies Neon PostgreSQL + Drizzle ORM requirements cleanly while guaranteeing stakeholders can run every workflow immediately without external setup.
- **Decision 3: MCP-First CRM Abstraction (Source-of-Truth Preservation)**
  - *Chosen Approach*: Implement a genuine Model Context Protocol (MCP) JSON-RPC client adapter + built-in simulated MCP CRM server endpoint (`/api/mcp/mock-crm`) alongside HubSpot/Salesforce/Zoho/Dynamics 365 connector schemas. Contacts store external CRM IDs, sync timestamps, and field ownership (`CRM-owned` vs `Locally-owned`).
  - *Why*: Keeps external CRMs as the source of truth without forcing CSV imports or duplicating full external contact tables.
- **Decision 4: Layered Security & Server-Side Isolation**
  - *Chosen Approach*: Every `/api/*` request passes through Zod schema validation, session token verification, organization/workspace membership lookup, and server-side RBAC policy checks before reaching business services.
  - *Why*: Prevents cross-tenant data leakage and enforces approval rules (`Campaign Editor` cannot bypass approval to publish; `Analyst`/`Viewer` cannot mutate records) at the API boundary, not merely in UI buttons.

---

## 4. Technical Architecture & Data Strategy

### System & Layer Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    React + TypeScript SPA (Tailwind)                    │
│  Sidebar (Colakin + DeX) · Org/Workspace Switcher · 15 Feature Modules  │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │ HTTPS / JSON + SSE + Bearer Token
┌───────────────────────────────────▼─────────────────────────────────────┐
│                      Express API & Security Gateway                     │
│  Zod Validation · Auth Middleware · Tenant Isolation · RBAC Guards      │
│  Public Tracking (/t/open/:id, /t/click/:id) · Unsubscribe (/unsub/:id) │
└───────┬───────────────────────────┬───────────────────────────┬─────────┘
        │                           │                           │
┌───────▼───────────┐     ┌─────────▼─────────┐     ┌───────────▼─────────┐
│ Business Services │     │ Provider Adapters │     │  Background Worker  │
│ · CampaignService │────▶│ · AI (Gemini/Demo)│     │ · Job Queue Engine  │
│ · AudienceService │     │ · Email (Resend/  │     │ · Exponential Retry │
│ · LeadService     │     │   SMTP / Mock)    │     │ · Idempotency Keys  │
│ · SocialService   │     │ · Social OAuth    │     │ · Automation Runner │
│ · ApprovalService │     │ · MCP CRM Client  │     │ · Dead-Letter Log   │
│ · ComplianceSvc   │     │ · Storage Adapter │     └───────────┬─────────┘
└───────┬───────────┘     └───────────────────┘                 │
        │                                                       │
┌───────▼───────────────────────────────────────────────────────▼─────────┐
│            Repository Layer (Drizzle ORM / Parity Demo Store)           │
│         Neon PostgreSQL (DATABASE_URL)  ◄──►  Seeded Demo Store         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Core Data Model & Tenant Scoping
Every domain record is scoped by `organizationId` (and `workspaceId` where applicable):
- **Identity & Tenancy**: `users`, `sessions`, `organizations`, `workspaces`, `organizationMembers`, `invitations`, `auditLogs`, `notifications`.
- **Audience & Compliance**: `contacts` (with `externalCrmId`, `crmProvider`, `fieldOwnership`), `tags`, `contactTags`, `segments`, `segmentConditions`, `consentRecords`, `suppressionRecords`.
- **Email & Tracking**: `campaigns`, `emailTemplates`, `emailLinks`, `emailSends`, `campaignEvents` (`sent`, `delivered`, `open`, `click`, `bounce`, `unsubscribe`, `complaint`).
- **Social, Calendar & Governance**: `socialAccounts`, `socialPosts`, `socialPostPlatforms`, `contentAssets`, `brandKits`, `approvals`, `approvalComments`, `approvalHistory`.
- **AI, Leads, CRM & Automation**: `leadSearches`, `leadCandidates` (with provenance & score breakdown), `integrations`, `integrationTools`, `syncLogs`, `automationWorkflows`, `automationNodes`, `automationEdges`, `automationRuns`, `backgroundJobs`.

### Security & Trust Boundaries
- **Server-Side Secrets & Key Isolation**: `GEMINI_API_KEY`, `DATABASE_URL`, `AUTH_SECRET`, SMTP/Resend, and CRM/OAuth credentials live exclusively in server-side `process.env` or masked integration records—never exposed to browser code or returned after saving.
- **Tenant & Role Enforcement**: Every repository query filters strictly by the authenticated user's verified `organizationId` and validates role permissions (`Owner`, `Admin`, `Marketing Manager`, `Campaign Editor`, `Analyst`, `Viewer`) on every mutation and read endpoint.
- **Input, URL & Untrusted MCP Protection**: All request payloads pass strict Zod schemas; dynamic URLs for click tracking, webhooks, and MCP endpoints validate `http:`/`https:` schemes and block private/loopback SSRF targets; HTML email previews render safely with sanitized templates.

### Phased Build Sequence
1. **Foundation & Schema**: Environment template, Drizzle PostgreSQL schema & migrations, Repository abstraction (Neon + Demo Store), Auth + RBAC + Tenant Isolation tests.
2. **DEX / Colakin Design System & Shell**: Theme tokens, fonts (`Plus Jakarta Sans`, `DM Sans`, `JetBrains Mono`), collapsible sidebar (`Colakin` logo above `DeX`), Org/Workspace switcher, header breadcrumbs, and all 15 route views wired.
3. **Core Modules (Dashboard, Audience, Compliance, Team, Settings)**: Live KPI aggregation, Contact detail with CRM field distinction, Visual AND/OR Segment Builder, Suppression & Unsubscribe Center, Team invitations & Audit logs.
4. **Email Marketing & Analytics**: 6-step Campaign Wizard, variable substitution with safe fallbacks, tracking pixel & redirect endpoints, background send queue, per-campaign analytics with zero-safe formulas.
5. **Social Media, Calendar, Approvals & Brand Kit**: Multi-platform composer, Media Library, UTC-to-local Calendar (Month/Week/Day/List), Approval workflow with revision history & RBAC enforcement, Brand Kit context injection.
6. **Gemini AI & Lead Intelligence**: Server-side `@google/genai` (`gemini-4-hydrogen`) service with demo fallback, natural-language lead discovery, provenance-tracked enrichment, explainable lead scoring.
7. **MCP CRM Integrations & Automation Engine**: MCP JSON-RPC client + Mock MCP CRM server (`tools/list`, `tools/call`), HubSpot/Salesforce/Zoho/Dynamics adapters, functional Visual Automation Builder with executing nodes & run history.
8. **QA, Automated Tests & Documentation**: Unit, integration, tenant-isolation, and E2E flow tests; `README.md`, `ARCHITECTURE.md`, `PROJECT_STATUS.md`; full build, TypeScript, and test verification.
