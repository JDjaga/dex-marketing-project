import type { Contact } from '../../shared/types.ts';
import { demoStore } from '../store/demoStore.ts';
import { validateSafeExternalUrl } from '../utils/security.ts';

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface MCPJsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: 'initialize' | 'tools/list' | 'tools/call';
  params?: Record<string, unknown>;
}

export interface MCPJsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string };
}

const MOCK_CRM_TOOLS: MCPToolDefinition[] = [
  {
    name: 'search_contacts',
    description: 'Search external CRM contacts by query string, industry, or location',
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, industry: { type: 'string' }, limit: { type: 'number' } } },
  },
  {
    name: 'search_companies',
    description: 'Search companies in the connected CRM',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
  },
  {
    name: 'get_contact',
    description: 'Retrieve full authoritative CRM record by externalId',
    inputSchema: { type: 'object', properties: { externalId: { type: 'string' } }, required: ['externalId'] },
  },
  {
    name: 'create_contact',
    description: 'Create a new contact inside the CRM when authorized',
    inputSchema: { type: 'object', properties: { firstName: { type: 'string' }, lastName: { type: 'string' }, email: { type: 'string' }, company: { type: 'string' } }, required: ['email'] },
  },
  {
    name: 'update_contact',
    description: 'Update permitted CRM contact fields',
    inputSchema: { type: 'object', properties: { externalId: { type: 'string' }, jobTitle: { type: 'string' }, lifecycleStage: { type: 'string' } }, required: ['externalId'] },
  },
  {
    name: 'add_activity',
    description: 'Log a marketing engagement or campaign touchpoint in CRM timeline',
    inputSchema: { type: 'object', properties: { externalId: { type: 'string' }, note: { type: 'string' } }, required: ['externalId', 'note'] },
  },
  {
    name: 'get_crm_metadata',
    description: 'Fetch CRM custom fields and schema ownership metadata',
    inputSchema: { type: 'object', properties: {} },
  },
];

// Built-in simulated MCP CRM JSON-RPC server handler (handles tenant-scoped CRM queries without CSV export)
export function handleMockMcpRpc(organizationId: string, rpc: MCPJsonRpcRequest): MCPJsonRpcResponse {
  if (rpc.method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id: rpc.id,
      result: {
        protocolVersion: '2025-03-26',
        serverInfo: { name: 'dex-mock-crm-mcp', version: '1.0.0' },
        capabilities: { tools: {} },
      },
    };
  }

  if (rpc.method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id: rpc.id,
      result: { tools: MOCK_CRM_TOOLS },
    };
  }

  if (rpc.method === 'tools/call') {
    const toolName = String(rpc.params?.name || '');
    const args = (rpc.params?.arguments || {}) as Record<string, unknown>;
    const orgContacts = demoStore.state.contacts.filter((c) => c.organizationId === organizationId);

    switch (toolName) {
      case 'search_contacts': {
        const q = String(args.query || '').toLowerCase();
        const industry = String(args.industry || '').toLowerCase();
        const matches = orgContacts
          .filter((c) => {
            const hay = `${c.firstName} ${c.lastName} ${c.email} ${c.company || ''} ${c.jobTitle || ''} ${c.location || ''}`.toLowerCase();
            const qMatch = !q || hay.includes(q);
            const indMatch = !industry || (c.industry || '').toLowerCase().includes(industry);
            return qMatch && indMatch;
          })
          .slice(0, Number(args.limit || 25))
          .map((c) => ({
            externalId: c.externalCrmId || `crm_${c.id.slice(0, 8)}`,
            firstName: c.firstName,
            lastName: c.lastName,
            email: c.email,
            company: c.company,
            jobTitle: c.jobTitle,
            industry: c.industry,
            location: c.location,
            lifecycleStage: c.lifecycleStage,
            sourceOfTruth: 'DeX Mock CRM (MCP)',
          }));

        return {
          jsonrpc: '2.0',
          id: rpc.id,
          result: { content: [{ type: 'text', text: JSON.stringify(matches) }], records: matches },
        };
      }

      case 'search_companies': {
        const q = String(args.query || '').toLowerCase();
        const companies = Array.from(
          new Set(orgContacts.map((c) => c.company).filter((v): v is string => Boolean(v)))
        )
          .filter((name) => !q || name.toLowerCase().includes(q))
          .map((name) => {
            const sample = orgContacts.find((c) => c.company === name);
            return {
              name,
              industry: sample?.industry || 'Technology',
              location: sample?.location || 'Global',
              linkedContacts: orgContacts.filter((c) => c.company === name).length,
            };
          });
        return {
          jsonrpc: '2.0',
          id: rpc.id,
          result: { content: [{ type: 'text', text: JSON.stringify(companies) }], records: companies },
        };
      }

      case 'get_contact': {
        const extId = String(args.externalId || '');
        const found = orgContacts.find((c) => c.externalCrmId === extId || c.id === extId);
        if (!found) {
          return { jsonrpc: '2.0', id: rpc.id, error: { code: -32004, message: 'CRM contact not found' } };
        }
        return {
          jsonrpc: '2.0',
          id: rpc.id,
          result: {
            record: {
              externalId: found.externalCrmId || found.id,
              fullName: `${found.firstName} ${found.lastName}`,
              email: found.email,
              company: found.company,
              jobTitle: found.jobTitle,
              lifecycleStage: found.lifecycleStage,
              crmOwnedFields: found.crmOwnedFields,
              lastSyncedAt: new Date().toISOString(),
            },
          },
        };
      }

      case 'add_activity': {
        const extId = String(args.externalId || '');
        const note = String(args.note || '');
        const found = orgContacts.find((c) => c.externalCrmId === extId || c.id === extId);
        if (found) {
          found.notes.unshift({
            id: `crm-act-${Date.now()}`,
            author: 'MCP CRM Connector',
            text: `[CRM Timeline] ${note}`,
            createdAt: new Date().toISOString(),
          });
          found.lastSyncedAt = new Date().toISOString();
        }
        return {
          jsonrpc: '2.0',
          id: rpc.id,
          result: { logged: true, externalId: extId, timestamp: new Date().toISOString() },
        };
      }

      case 'get_crm_metadata': {
        return {
          jsonrpc: '2.0',
          id: rpc.id,
          result: {
            sourceOfTruthPolicy: 'External CRM owns email, company, jobTitle, lifecycleStage unless writeback enabled.',
            customFields: ['arr_tier', 'crm_stage', 'compliance', 'employee_band'],
          },
        };
      }

      default:
        return {
          jsonrpc: '2.0',
          id: rpc.id,
          error: { code: -32601, message: `Unknown MCP tool: ${toolName}` },
        };
    }
  }

  return {
    jsonrpc: '2.0',
    id: rpc.id,
    error: { code: -32601, message: `Unsupported MCP method: ${rpc.method}` },
  };
}

// External MCP / REST CRM Client Abstraction
export class MCPCRMClient {
  async callRemoteOrMockMcp(
    organizationId: string,
    endpointUrl: string | undefined,
    rpc: MCPJsonRpcRequest
  ): Promise<MCPJsonRpcResponse> {
    if (!endpointUrl || endpointUrl === '/api/mcp/mock-crm') {
      return handleMockMcpRpc(organizationId, rpc);
    }

    const urlCheck = validateSafeExternalUrl(endpointUrl);
    if (!urlCheck.valid) {
      return {
        jsonrpc: '2.0',
        id: rpc.id,
        error: { code: -32000, message: urlCheck.reason || 'Blocked unsafe MCP endpoint URL' },
      };
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(endpointUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rpc),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) {
        return {
          jsonrpc: '2.0',
          id: rpc.id,
          error: { code: res.status, message: `Remote MCP server returned HTTP ${res.status}` },
        };
      }
      const data = (await res.json()) as MCPJsonRpcResponse;
      return data;
    } catch (err) {
      return {
        jsonrpc: '2.0',
        id: rpc.id,
        error: { code: -32001, message: err instanceof Error ? err.message : 'MCP connection timeout/error' },
      };
    }
  }
}

export const mcpCrmClient = new MCPCRMClient();
export type { Contact };
