# DEX Marketing — Project Status

## Completed Modules
- **Phase 1–2 (Design System & Shell)**: Colakin (`companylogo1`) stacked above DeX (`companylogo2`) sidebar lockup, light ice-blue / royal blue / warm gold theme, responsive collapsible sidebar, mobile drawer, org & workspace switchers.
- **Phase 3 (Database & Multi-Tenant Auth)**: Complete 30+ table Drizzle PostgreSQL schema (`src/db/schema.ts`), baseline SQL migration (`drizzle/0000_initial.sql`), Neon pool (`src/db/index.ts`), `scrypt` password hashing, HMAC session tokens, password reset, and 6-role RBAC enforcement.
- **Phase 4–5 (Core, Audience, Email & Compliance)**: 12-KPI Overview dashboard, Contact directory with CRM-owned vs locally-owned fields, Visual AND/OR Segment Builder, 6-step Email Campaign Wizard, Desktop/Mobile live preview, open/click tracking routes, Suppression Registry, Consent Ledger, GDPR delete, and public Unsubscribe Center.
- **Phase 6 (Social, Calendar, Approvals & Brand Kit)**: Multi-platform composer, Connected Accounts capability matrix, Media Library uploads, UTC-to-local Calendar (Month/Week/Day/List), Approval queue with RBAC & revision history, and Brand Kit injection.
- **Phase 7–8 (AI & MCP CRM)**: Server-side Gemini (`gemini-4-hydrogen`) provider with automatic Demo fallback, Lead Intelligence with provenance & explainable scoring, and MCP JSON-RPC 2.0 CRM client + Mock MCP CRM server + HubSpot/Salesforce/Zoho/Dynamics adapters.
- **Phase 9–10 (Automation & Unified Analytics)**: Node-based Workflow Builder with real executing Trigger/Condition/Delay/Action nodes, execution history, background job tracking, unified analytics, and printable report view.
- **Phase 11–12 (Testing & Docs)**: Vitest unit, integration, tenant-isolation, RBAC, and E2E test suite (`tests/dexMarketing.test.ts`), `README.md`, `ARCHITECTURE.md`, and `PROJECT_STATUS.md`.

## Known Limitations (External Credentials Required for Live Mode)
- Live Neon PostgreSQL persistence activates when `DATABASE_URL` is configured in Secrets.
- Live email sending activates when `RESEND_API_KEY` or `SMTP_*` variables are configured.
- Live social publishing requires platform-specific OAuth app approvals.
