import type {
  AppNotification,
  ApprovalItem,
  AuditLog,
  AutomationRun,
  AutomationWorkflow,
  BrandKit,
  CRMIntegration,
  Campaign,
  CampaignMetrics,
  ConsentRecord,
  Contact,
  ContentAsset,
  EmailTemplate,
  Invitation,
  JwtSessionRecord,
  LeadCandidate,
  LeadSearch,
  Organization,
  OrganizationMember,
  RoleName,
  Segment,
  SocialAccount,
  SocialPost,
  SuppressionRecord,
  User,
  Workspace,
} from '../../shared/types.ts';

export interface AuthContext {
  user: User;
  organization: Organization;
  role: RoleName;
  workspaces: Workspace[];
  organizations: Array<{ organization: Organization; role: RoleName }>;
}

// Session JWT held strictly in JS memory (never localStorage/sessionStorage)
let inMemoryToken: string | null = null;
let activeOrgOverride: string | null = null;
let unauthorizedHandler: ((reason: string) => void) | null = null;

export function setAuthToken(token: string | null, orgId?: string) {
  inMemoryToken = token;
  if (orgId !== undefined) activeOrgOverride = orgId;
}

export function setActiveOrganizationId(orgId: string) {
  activeOrgOverride = orgId;
}

export function getAuthToken(): string | null {
  return inMemoryToken;
}

export function getActiveOrganizationId(): string | null {
  return activeOrgOverride;
}

export function setOnUnauthorized(handler: ((reason: string) => void) | null) {
  unauthorizedHandler = handler;
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  if (inMemoryToken) {
    headers['Authorization'] = `Bearer ${inMemoryToken}`;
  }
  if (activeOrgOverride) {
    headers['X-Organization-Id'] = activeOrgOverride;
  }

  const res = await fetch(path, {
    ...options,
    headers,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = (data as { error?: string }).error || `Request failed (${res.status})`;
    if (res.status === 401 && inMemoryToken && unauthorizedHandler && !path.startsWith('/api/auth/login')) {
      unauthorizedHandler(message);
    }
    throw new Error(message);
  }
  return data as T;
}

export const api = {
  getAuthStatus: () =>
    apiRequest<{
      initialized: boolean;
      databaseMode: string;
      realTimeJwt: boolean;
      wsPath: string;
    }>('/api/auth/status'),

  login: (email: string, password: string) =>
    apiRequest<{ token: string; context: AuthContext; session: JwtSessionRecord; ttlSeconds: number }>(
      '/api/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }
    ),

  register: (payload: { name: string; email: string; password: string; organizationName: string }) =>
    apiRequest<{ token: string; context: AuthContext; session: JwtSessionRecord; ttlSeconds: number }>(
      '/api/auth/register',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  acceptInvite: (payload: { token: string; name: string; password: string }) =>
    apiRequest<{ token: string; context: AuthContext; session: JwtSessionRecord; ttlSeconds: number }>(
      '/api/auth/accept-invite',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  verifyJwt: () =>
    apiRequest<{
      valid: boolean;
      ttlSeconds: number;
      serverTime: string;
      session: JwtSessionRecord;
    }>('/api/auth/verify', { method: 'POST' }),

  logout: () =>
    apiRequest<{ signedOut: boolean }>('/api/auth/logout', { method: 'POST' }),

  getSessions: () =>
    apiRequest<{ sessions: Array<JwtSessionRecord & { isCurrent: boolean }> }>('/api/auth/sessions'),

  revokeSession: (jti: string) =>
    apiRequest<{ revoked: boolean; jti: string }>(`/api/auth/sessions/${encodeURIComponent(jti)}`, {
      method: 'DELETE',
    }),

  forgotPassword: (email: string) =>
    apiRequest<{ message: string; resetToken?: string }>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  resetPassword: (token: string, password: string) =>
    apiRequest<{ message: string }>('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    }),

  me: () =>
    apiRequest<{ context: AuthContext; jti?: string; exp?: number; ttlSeconds?: number }>('/api/auth/me'),

  getDashboard: () =>
    apiRequest<{
      kpis: {
        totalAudience: number;
        activeCampaigns: number;
        emailsSent: number;
        deliveryRate: number;
        openRate: number;
        clickRate: number;
        bounceRate: number;
        unsubscribeRate: number;
        leadsGenerated: number;
        socialEngagement: number;
        scheduledPosts: number;
        conversionRate: number;
        pendingApprovals: number;
      };
      campaignComparison: Array<{
        id: string;
        name: string;
        type: string;
        status: string;
        sent: number;
        delivered: number;
        openRate: number | null;
        clickRate: number | null;
        conversions: number;
      }>;
      recentActivity: AuditLog[];
      upcomingScheduled: Array<{
        id: string;
        kind: string;
        title: string;
        scheduledAt: string;
        status: string;
      }>;
      notifications: AppNotification[];
      isDemoMode: boolean;
    }>('/api/dashboard'),

  getContacts: (q = '') =>
    apiRequest<{ contacts: Contact[] }>(`/api/contacts${q ? `?q=${encodeURIComponent(q)}` : ''}`),

  createContact: (payload: Record<string, unknown>) =>
    apiRequest<{ contact: Contact }>('/api/contacts', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateContact: (id: string, payload: Record<string, unknown>) =>
    apiRequest<{ contact: Contact }>(`/api/contacts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteContact: (id: string) =>
    apiRequest<{ deleted: boolean }>(`/api/contacts/${id}`, { method: 'DELETE' }),

  getSegments: () => apiRequest<{ segments: Segment[] }>('/api/segments'),

  createSegment: (payload: Record<string, unknown>) =>
    apiRequest<{ segment: Segment }>('/api/segments', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  previewSegment: (logic: 'AND' | 'OR', conditions: unknown[]) =>
    apiRequest<{ count: number; contacts: Contact[] }>('/api/segments/preview', {
      method: 'POST',
      body: JSON.stringify({ logic, conditions }),
    }),

  getCompliance: () =>
    apiRequest<{ suppressionRecords: SuppressionRecord[]; consentRecords: ConsentRecord[] }>('/api/compliance'),

  suppressEmail: (payload: { email: string; category: string; reason: string }) =>
    apiRequest<{ record: SuppressionRecord }>('/api/compliance/suppress', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getCampaigns: () =>
    apiRequest<{
      campaigns: Array<Campaign & { metrics: CampaignMetrics }>;
      templates: EmailTemplate[];
    }>('/api/campaigns'),

  createCampaign: (payload: Record<string, unknown>) =>
    apiRequest<{ campaign: Campaign }>('/api/campaigns', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  checkCampaignCompliance: (id: string) =>
    apiRequest<{
      passed: boolean;
      blockers: string[];
      warnings: string[];
      audienceSummary: {
        eligibleCount: number;
        suppressedCount: number;
        unsubscribedCount: number;
        duplicateCount: number;
        invalidCount: number;
      };
    }>(`/api/campaigns/${id}/compliance-check`, { method: 'POST' }),

  submitCampaignApproval: (id: string) =>
    apiRequest<{ approval: ApprovalItem; campaign: Campaign }>(`/api/campaigns/${id}/submit-approval`, {
      method: 'POST',
    }),

  scheduleCampaign: (id: string, scheduledAt: string) =>
    apiRequest<{ campaign: Campaign }>(`/api/campaigns/${id}/schedule`, {
      method: 'POST',
      body: JSON.stringify({ scheduledAt }),
    }),

  sendCampaign: (id: string) =>
    apiRequest<{ campaign: Campaign; sentCount: number; simulated: boolean }>(`/api/campaigns/${id}/send`, {
      method: 'POST',
    }),

  pauseCampaign: (id: string) =>
    apiRequest<{ campaign: Campaign }>(`/api/campaigns/${id}/pause`, { method: 'POST' }),

  getCampaignAnalytics: (id: string) =>
    apiRequest<{
      campaign: Campaign;
      metrics: CampaignMetrics;
      links: Array<{ url: string; clicks: number }>;
      devices: Array<{ device: string; count: number }>;
    }>(`/api/campaigns/${id}/analytics`),

  getSocial: () =>
    apiRequest<{ accounts: SocialAccount[]; posts: SocialPost[]; assets: ContentAsset[] }>('/api/social'),

  createSocialAccount: (payload: {
    workspaceId?: string;
    platform: string;
    displayName: string;
    handle: string;
    accountType?: string;
  }) =>
    apiRequest<{ account: SocialAccount }>('/api/social/accounts', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  toggleSocialAccount: (id: string) =>
    apiRequest<{ account: SocialAccount }>(`/api/social/accounts/${id}/toggle`, { method: 'POST' }),

  linkedinConnect: (workspaceId?: string) =>
    apiRequest<{ authUrl: string; redirectUri: string }>(
      `/api/social/linkedin/connect${workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : ''}`
    ),

  createSocialPost: (payload: Record<string, unknown>) =>
    apiRequest<{ post: SocialPost }>('/api/social/posts', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  submitSocialApproval: (id: string) =>
    apiRequest<{ approval: ApprovalItem; post: SocialPost }>(`/api/social/posts/${id}/submit-approval`, {
      method: 'POST',
    }),

  publishSocialPost: (id: string) =>
    apiRequest<{ post: SocialPost }>(`/api/social/posts/${id}/publish`, { method: 'POST' }),

  scheduleSocialPost: (id: string, scheduledAt: string) =>
    apiRequest<{ post: SocialPost }>(`/api/social/posts/${id}/schedule`, {
      method: 'PATCH',
      body: JSON.stringify({ scheduledAt }),
    }),

  createAsset: (payload: Record<string, unknown>) =>
    apiRequest<{ asset: ContentAsset }>('/api/assets', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getApprovals: () => apiRequest<{ approvals: ApprovalItem[] }>('/api/approvals'),

  decideApproval: (id: string, decision: 'approved' | 'rejected' | 'changes_requested', note?: string) =>
    apiRequest<{ approval: ApprovalItem }>(`/api/approvals/${id}/decide`, {
      method: 'POST',
      body: JSON.stringify({ decision, note }),
    }),

  getBrandKits: () => apiRequest<{ brandKits: BrandKit[] }>('/api/brand-kits'),

  updateBrandKit: (id: string, payload: Partial<BrandKit>) =>
    apiRequest<{ brandKit: BrandKit }>(`/api/brand-kits/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  generateAI: (payload: {
    kind: 'email_body' | 'email_subject' | 'email_rewrite' | 'social_variations' | 'campaign_ideas';
    prompt: string;
    tone?: string;
    objective?: string;
  }) =>
    apiRequest<{ text: string; provider: string; model: string; isSimulated: boolean }>('/api/ai/generate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  analyzeCampaignAI: (campaignId: string) =>
    apiRequest<{ text: string; provider: string; model: string; isSimulated: boolean }>(
      `/api/ai/analyze-campaign/${campaignId}`,
      { method: 'POST' }
    ),

  getLeads: () => apiRequest<{ searches: LeadSearch[]; candidates: LeadCandidate[] }>('/api/leads'),

  discoverLeads: (prompt: string, workspaceId?: string) =>
    apiRequest<{ search: LeadSearch; candidates: LeadCandidate[] }>('/api/leads/discover', {
      method: 'POST',
      body: JSON.stringify({ prompt, workspaceId }),
    }),

  saveLeadToAudience: (id: string) =>
    apiRequest<{ contact: Contact; candidate: LeadCandidate }>(`/api/leads/${id}/save-to-audience`, {
      method: 'POST',
    }),

  getIntegrations: () => apiRequest<{ integrations: CRMIntegration[] }>('/api/integrations'),

  testIntegration: (id: string) =>
    apiRequest<{ integration: CRMIntegration; note?: string }>(`/api/integrations/${id}/test`, {
      method: 'POST',
    }),

  addBuiltinMcp: (name?: string) =>
    apiRequest<{ integration: CRMIntegration }>('/api/integrations/mcp-builtin', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  addCustomMcp: (name: string, endpointUrl: string) =>
    apiRequest<{ integration: CRMIntegration }>('/api/integrations/mcp-custom', {
      method: 'POST',
      body: JSON.stringify({ name, endpointUrl }),
    }),

  queryMcpTool: (id: string, toolName: string, args: Record<string, unknown>) =>
    apiRequest<{ result?: unknown; error?: { message: string } }>(`/api/integrations/${id}/mcp-query`, {
      method: 'POST',
      body: JSON.stringify({ toolName, arguments: args }),
    }),

  getAutomations: () =>
    apiRequest<{ workflows: AutomationWorkflow[]; runs: AutomationRun[] }>('/api/automations'),

  createAutomation: (payload: Record<string, unknown>) =>
    apiRequest<{ workflow: AutomationWorkflow }>('/api/automations', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  toggleAutomation: (id: string) =>
    apiRequest<{ workflow: AutomationWorkflow }>(`/api/automations/${id}/toggle`, { method: 'POST' }),

  executeAutomation: (id: string, contactId?: string) =>
    apiRequest<{ run: AutomationRun; workflow: AutomationWorkflow }>(`/api/automations/${id}/execute`, {
      method: 'POST',
      body: JSON.stringify({ contactId }),
    }),

  getTeam: () =>
    apiRequest<{ members: OrganizationMember[]; invitations: Invitation[]; auditLogs: AuditLog[] }>('/api/team'),

  inviteMember: (email: string, role: RoleName) =>
    apiRequest<{ invitation: Invitation }>('/api/team/invitations', {
      method: 'POST',
      body: JSON.stringify({ email, role }),
    }),

  changeMemberRole: (memberId: string, role: RoleName) =>
    apiRequest<{ member: OrganizationMember }>(`/api/team/members/${memberId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),

  removeMember: (memberId: string) =>
    apiRequest<{ removed: OrganizationMember }>(`/api/team/members/${memberId}`, { method: 'DELETE' }),

  createOrganization: (name: string, industry: string) =>
    apiRequest<{ organization: Organization; context: AuthContext }>('/api/organizations', {
      method: 'POST',
      body: JSON.stringify({ name, industry }),
    }),

  updateOrganization: (payload: Partial<Organization>) =>
    apiRequest<{ organization: Organization }>('/api/organizations/current', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  createWorkspace: (payload: { name: string; type: string; description: string }) =>
    apiRequest<{ workspace: Workspace }>('/api/workspaces', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getDiagnostics: () =>
    apiRequest<{
      database: { engine: string; connected: boolean; neonConfigured: boolean };
      ai: { preferredProvider: string; providers: Array<{ id: string; name: string; configured: boolean; freeTier: boolean }> };
      email: { activeProvider: string; resendConfigured: boolean; smtpConfigured: boolean; simulationMode: boolean };
      storage: { activeProvider: string; cloudinaryConfigured: boolean };
      secretsPreview: { databaseUrl: string; resendKey: string; hubspotToken: string };
      queue: { total: number; pending: number; completed: number; failed: number; recentJobs: Array<{ id: string; type: string; status: string; attempts: number; createdAt: string }> };
      crmCount: number;
      socialConnectedCount: number;
    }>('/api/diagnostics'),
};
