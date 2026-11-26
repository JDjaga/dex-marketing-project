import type {
  AppNotification,
  ApprovalItem,
  AuditLog,
  AutomationRun,
  AutomationWorkflow,
  BackgroundJob,
  BrandKit,
  CRMIntegration,
  Campaign,
  CampaignEvent,
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

export interface StoredUser extends User {
  passwordHash: string;
}

export interface DemoDatabaseState {
  users: StoredUser[];
  organizations: Organization[];
  workspaces: Workspace[];
  members: OrganizationMember[];
  invitations: Invitation[];
  brandKits: BrandKit[];
  contacts: Contact[];
  segments: Segment[];
  consentRecords: ConsentRecord[];
  suppressionRecords: SuppressionRecord[];
  emailTemplates: EmailTemplate[];
  campaigns: Campaign[];
  campaignEvents: CampaignEvent[];
  socialAccounts: SocialAccount[];
  socialPosts: SocialPost[];
  contentAssets: ContentAsset[];
  approvals: ApprovalItem[];
  leadSearches: LeadSearch[];
  leadCandidates: LeadCandidate[];
  integrations: CRMIntegration[];
  automationWorkflows: AutomationWorkflow[];
  automationRuns: AutomationRun[];
  backgroundJobs: BackgroundJob[];
  notifications: AppNotification[];
  auditLogs: AuditLog[];
  resetTokens: Array<{ token: string; userId: string; expiresAt: number; used: boolean }>;
  jwtSessions: JwtSessionRecord[];
}

function createEmptyState(): DemoDatabaseState {
  return {
    users: [],
    organizations: [],
    workspaces: [],
    members: [],
    invitations: [],
    brandKits: [],
    contacts: [],
    segments: [],
    consentRecords: [],
    suppressionRecords: [],
    emailTemplates: [],
    campaigns: [],
    campaignEvents: [],
    socialAccounts: [],
    socialPosts: [],
    contentAssets: [],
    approvals: [],
    leadSearches: [],
    leadCandidates: [],
    integrations: [],
    automationWorkflows: [],
    automationRuns: [],
    backgroundJobs: [],
    notifications: [],
    auditLogs: [],
    resetTokens: [],
    jwtSessions: [],
  };
}

class StoreSingleton {
  public state: DemoDatabaseState;

  constructor() {
    this.state = createEmptyState();
  }

  resetForTests(): void {
    this.state = createEmptyState();
  }
}

export const demoStore = new StoreSingleton();
export type { RoleName };
