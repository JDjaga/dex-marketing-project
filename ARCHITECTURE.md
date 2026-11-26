# DEX Marketing — System Architecture

## 1. Layered Application Architecture

```
React + TypeScript SPA (Tailwind CSS + Recharts)
        │  Authorization: Bearer <HMAC-SHA256 Token> (In-Memory)
        ▼
Express API & Security Gateway (server.ts)
        ├─ Zod Input Validation
        ├─ Auth & Tenant Isolation Middleware (organizationId + RBAC)
        ├─ Public Tracking (/t/open/:id.png, /t/click/:id, /unsubscribe/:id)
        └─ Built-in MCP CRM JSON-RPC Endpoint (/api/mcp/mock-crm)
        │
        ├──► Business Services (authService, marketingService)
        │       ├─ Segment AND/OR Engine & Compliance Validator
        │       ├─ Campaign Send & Zero-Safe Analytics Calculator
        │       ├─ Approval Workflow & Social Governance
        │       └─ Automation Node Execution Engine & Job Queue
        │
        └──► Provider Abstractions
                ├─ AIProvider (Gemini gemini-4-hydrogen / Demo Fallback)
                ├─ EmailProvider (Resend / SMTP / Mock Simulation)
                ├─ MCPCRMClient (JSON-RPC 2.0 + SSRF URL Guard)
                └─ StorageProvider (Local / Cloudinary / S3)
```

## 2. Multi-Tenancy & RBAC Isolation

- Every tenant-owned record carries `organizationId` (and `workspaceId` where applicable).
- `requireAuth` validates the HMAC-signed session token and verifies membership in the active `organizationId` before attaching `req.auth`. Cross-tenant `X-Organization-Id` spoofing returns HTTP `403`.
- `requirePermission(permission)` checks the server-side `ROLE_PERMISSIONS` matrix across `Owner`, `Admin`, `Marketing Manager`, `Campaign Editor`, `Analyst`, and `Viewer`.

## 3. Known Free-Tier & External API Boundaries

- **Social Media Publishing**: LinkedIn, Instagram, Facebook, X, and YouTube require verified developer apps and OAuth approvals for live external posting. Platform capability matrices explicitly surface what each API supports (e.g., X Free tier analytics unavailability).
- **Email Delivery**: Operates transparently in simulated mode unless `RESEND_API_KEY` or SMTP credentials are configured.
- **Neon PostgreSQL**: Schema and migrations (`src/db/schema.ts`, `drizzle/0000_initial.sql`) target Neon PostgreSQL via `DATABASE_URL`; when unset, the parity Demo Store ensures full functional exploration.
