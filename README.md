# DEX Marketing by Colakin

Enterprise-grade, multi-tenant AI marketing operations SaaS platform uniting email marketing, MCP-first CRM integrations, AI-assisted lead intelligence, social media publishing, approval governance, workflow automation, and unified analytics.

## Key Capabilities

- **Multi-Tenant Organization & Workspace Hierarchy**: Organizations → Workspaces → Members with 6 server-enforced RBAC roles (`Owner`, `Admin`, `Marketing Manager`, `Campaign Editor`, `Analyst`, `Viewer`) and strict tenant isolation.
- **Email Marketing & 6-Step Wizard**: Campaign creation, safe `{{variable|fallback}}` personalization, Desktop/Mobile live preview, open pixel & SSRF-safe click tracking redirects, pre-send compliance validation, pause/schedule controls, and per-campaign analytics.
- **Audience, Visual Segment Builder & Compliance Center**: CRM-owned vs. locally-owned field distinction, dynamic AND/OR segment evaluation, centralized suppression registry, consent audit ledger, GDPR deletion, and one-click public Unsubscribe Center.
- **MCP-First CRM Integrations**: JSON-RPC 2.0 Model Context Protocol client (`initialize`, `tools/list`, `tools/call`) + built-in simulated MCP CRM server (`/api/mcp/mock-crm`) + connector architecture for HubSpot, Salesforce, Zoho, Dynamics 365, and custom MCP endpoints without CSV dependency.
- **AI Lead Intelligence & Content Studio**: Provider-agnostic AI facade powered by server-side Gemini (`gemini-4-hydrogen`) with Groq/OpenRouter/Ollama adapters and deterministic Demo Fallback. Includes Brand Kit injection, provenance-tracked lead discovery, and explainable lead scoring.
- **Social Media, Calendar, Approvals & Automation**: Multi-platform composer, platform capability matrix, media asset library, UTC-to-local unified calendar, RBAC-enforced approval queue, and executable node-based automation workflows.

## Quick Start

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the full-stack Express + Vite application on port `3000`:
   ```bash
   npm run dev
   ```
3. Run type checking, tests, and production build:
   ```bash
   npm run lint
   npm test
   npm run build
   ```

## Database Setup (Neon PostgreSQL + Drizzle ORM)

The application ships with a complete normalized Drizzle schema (`src/db/schema.ts`) and baseline SQL migration (`drizzle/0000_initial.sql`).

- **Zero-Config Demo Mode**: If `DATABASE_URL` is not configured, the server boots seamlessly with a PostgreSQL-parity Demo Store so stakeholders can explore every workflow immediately.
- **Connecting Neon PostgreSQL**:
  1. Provision a free PostgreSQL database at Neon and copy your connection string.
  2. Set `DATABASE_URL` in your environment secrets (see `.env.example`).
  3. Push or generate migrations:
     ```bash
     npm run db:push
     ```

## Demo Accounts

Default password for seeded demo accounts: `DemoPass2026!` (or use one-click Stakeholder Demo Access on the Sign-In screen):
- `owner@colakin-dex.demo` — Owner (`Colakin Global Growth Agency`)
- `admin@colakin-dex.demo` — Admin (`Colakin Global Growth Agency`)
- `manager@colakin-dex.demo` — Marketing Manager (`Colakin Global Growth Agency`)
- `editor@colakin-dex.demo` — Campaign Editor (`Colakin Global Growth Agency`)
- `analyst@colakin-dex.demo` — Analyst (`Colakin Global Growth Agency`)
- `viewer@colakin-dex.demo` — Viewer (`Colakin Global Growth Agency`)
- `director@vertexhealth.demo` — Owner (`Vertex Health Systems` — isolated second tenant)
