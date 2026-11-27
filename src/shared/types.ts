import { z } from 'zod';

export type RoleName =
  | 'Owner'
  | 'Admin'
  | 'Marketing Manager'
  | 'Campaign Editor'
  | 'Analyst'
  | 'Viewer';

export type Permission =
  | 'org:manage'
  | 'org:delete'
  | 'team:manage'
  | 'workspace:manage'
  | 'integrations:manage'
  | 'campaign:create'
  | 'campaign:edit'
  | 'campaign:approve'
  | 'campaign:send'
  | 'social:create'
  | 'social:approve'
  | 'social:publish'
  | 'audience:read'
  | 'audience:write'
  | 'compliance:manage'
  | 'automation:manage'
  | 'brand:manage'
  | 'analytics:read'
  | 'ai:use';

export const ROLE_PERMISSIONS: Record<RoleName, Permission[]> = {
  Owner: [
    'org:manage',
    'org:delete',
    'team:manage',
    'workspace:manage',
    'integrations:manage',
    'campaign:create',
    'campaign:edit',
    'campaign:approve',
    'campaign:send',
    'social:create',
    'social:approve',
    'social:publish',
    'audience:read',
    'audience:write',
    'compliance:manage',
    'automation:manage',
    'brand:manage',
    'analytics:read',
    'ai:use',
  ],
  Admin: [
    'team:manage',
    'workspace:manage',
    'integrations:manage',
    'campaign:create',
    'campaign:edit',
    'campaign:approve',
    'campaign:send',
    'social:create',
    'social:approve',
    'social:publish',
    'audience:read',
    'audience:write',
    'compliance:manage',
    'automation:manage',
    'brand:manage',
    'analytics:read',
    'ai:use',
  ],
  'Marketing Manager': [
    'campaign:create',
    'campaign:edit',
    'campaign:approve',
    'campaign:send',
    'social:create',
    'social:approve',
    'social:publish',
    'audience:read',
    'audience:write',
    'compliance:manage',
    'automation:manage',
    'brand:manage',
    'analytics:read',
    'ai:use',
  ],
  'Campaign Editor': [
    'campaign:create',
    'campaign:edit',
    'social:create',
    'audience:read',
    'audience:write',
    'analytics:read',
    'ai:use',
  ],
  Analyst: ['audience:read', 'analytics:read'],
  Viewer: ['analytics:read'],
};

export function hasPermission(role: RoleName | undefined, perm: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(perm) ?? false;
}

export type NavSectionId =
  | 'overview'
  | 'campaigns'
  | 'email'
  | 'social'
  | 'audience'
  | 'leads'
  | 'studio'
  | 'calendar'
  | 'analytics'
  | 'crm'
  | 'automation'
  | 'approvals'
  | 'brand'
  | 'team'
  | 'settings';

export type CampaignType =
  | 'newsletter'
  | 'promotional'
  | 'announcement'
  | 'product_launch'
  | 'event_invitation'
  | 'welcome'
  | 'follow_up'
  | 'cold_outreach'
  | 're_engagement';

export type CampaignStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'scheduled'
  | 'sending'
  | 'paused'
  | 'sent'
  | 'rejected'
  | 'cancelled';

export type SocialPlatform = 'linkedin' | 'instagram' | 'facebook' | 'x' | 'youtube';

export type SocialPostStatus =
  | 'draft'
  | 'pending_approval'
  | 'needs_revision'
  | 'approved'
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'rejected'
  | 'failed'
  | 'cancelled';

export type SuppressionCategory =
  | 'unsubscribed'
  | 'hard_bounce'
  | 'spam_complaint'
  | 'invalid_email'
  | 'manual'
  | 'org_suppressed';

export type LifecycleStage = 'subscriber' | 'lead' | 'mql' | 'sql' | 'opportunity' | 'customer';

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'retry' | 'cancelled';

export interface User {
  id: string;
  email: string;
  name: string;
  title?: string;
  avatarUrl?: string;
  timezone: string;
  createdAt: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  industry: string;
  requireApprovalForPublish: boolean;
  dataRetentionDays: number;
  createdAt: string;
}

export interface Workspace {
  id: string;
  organizationId: string;
  name: string;
  type: 'brand' | 'client' | 'department' | 'project';
  description: string;
  createdAt: string;
}

export interface OrganizationMember {
  id: string;
  organizationId: string;
  userId: string;
  role: RoleName;
  userName: string;
  userEmail: string;
  userTitle?: string;
  joinedAt: string;
}

export interface Invitation {
  id: string;
  organizationId: string;
  email: string;
  role: RoleName;
  token: string;
  status: 'pending' | 'accepted' | 'revoked';
  invitedByName: string;
  createdAt: string;
}

export interface BrandKit {
  id: string;
  organizationId: string;
  workspaceId: string;
  name: string;
  logoUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  headingFont: string;
  bodyFont: string;
  voice: string;
  tone: string;
  targetAudience: string;
  messagingGuidelines: string;
  approvedCtas: string[];
  prohibitedPhrases: string[];
  description: string;
  updatedAt: string;
}

export interface Contact {
  id: string;
  organizationId: string;
  workspaceId: string;
  externalCrmId?: string;
  crmProvider?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  company?: string;
  jobTitle?: string;
  industry?: string;
  location?: string;
  state?: string;
  country?: string;
  tags: string[];
  customAttributes: Record<string, string>;
  source: string;
  ownerName?: string;
  lifecycleStage: LifecycleStage;
  consentStatus: 'opted_in' | 'pending' | 'opted_out' | 'legitimate_interest';
  subscriptionStatus: 'subscribed' | 'unsubscribed' | 'suppressed' | 'bounced';
  engagementScore: number;
  lastEngagementAt?: string;
  crmOwnedFields: string[];
  crmEditable: boolean;
  lastSyncedAt?: string;
  notes: Array<{ id: string; author: string; text: string; createdAt: string }>;
  createdAt: string;
}

export interface SegmentCondition {
  id: string;
  field:
    | 'location'
    | 'country'
    | 'state'
    | 'industry'
    | 'company'
    | 'jobTitle'
    | 'tags'
    | 'source'
    | 'lifecycleStage'
    | 'consentStatus'
    | 'subscriptionStatus'
    | 'engagementScore';
  operator: 'equals' | 'contains' | 'not_equals' | 'gte' | 'lte' | 'in';
  value: string;
}

export interface Segment {
  id: string;
  organizationId: string;
  workspaceId: string;
  name: string;
  description: string;
  logic: 'AND' | 'OR';
  isDynamic: boolean;
  conditions: SegmentCondition[];
  cachedCount: number;
  lastRefreshedAt: string;
  createdAt: string;
}

export interface SuppressionRecord {
  id: string;
  organizationId: string;
  contactId?: string;
  email: string;
  category: SuppressionCategory;
  reason: string;
  sourceCampaignId?: string;
  sourceCampaignName?: string;
  suppressedAt: string;
}

export interface ConsentRecord {
  id: string;
  organizationId: string;
  contactId: string;
  email: string;
  status: 'opted_in' | 'opted_out' | 'reconsented';
  source: string;
  lawfulBasis: string;
  recordedAt: string;
}

export interface EmailTemplate {
  id: string;
  organizationId: string;
  workspaceId: string;
  name: string;
  category: CampaignType;
  subject: string;
  previewText: string;
  htmlBody: string;
  textBody: string;
  updatedAt: string;
}

export interface Campaign {
  id: string;
  organizationId: string;
  workspaceId: string;
  name: string;
  description: string;
  type: CampaignType;
  objective: string;
  ownerId: string;
  ownerName: string;
  status: CampaignStatus;
  segmentId?: string;
  audienceType: 'segment' | 'crm' | 'all_subscribed' | 'manual';
  manualContactIds: string[];
  subject: string;
  previewText: string;
  senderName: string;
  senderEmail: string;
  replyTo: string;
  htmlBody: string;
  textBody: string;
  trackOpens: boolean;
  trackClicks: boolean;
  trackDeliveries: boolean;
  scheduledAt?: string;
  sentAt?: string;
  isDemoSimulated: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignEvent {
  id: string;
  organizationId: string;
  campaignId: string;
  contactId: string;
  contactEmail: string;
  type: 'sent' | 'delivered' | 'open' | 'click' | 'bounce' | 'unsubscribe' | 'complaint' | 'conversion' | 'failed';
  bounceType?: 'hard' | 'soft';
  linkUrl?: string;
  device?: 'desktop' | 'mobile' | 'tablet';
  country?: string;
  timestamp: string;
}

export interface CampaignMetrics {
  recipients: number;
  sent: number;
  delivered: number;
  failed: number;
  bounced: number;
  opens: number;
  uniqueOpens: number;
  clicks: number;
  uniqueClicks: number;
  unsubscribes: number;
  complaints: number;
  conversions: number;
  deliveryRate: number | null;
  openRate: number | null;
  clickRate: number | null;
  clickToOpenRate: number | null;
  bounceRate: number | null;
  unsubscribeRate: number | null;
}

export interface SocialAccount {
  id: string;
  organizationId: string;
  workspaceId: string;
  platform: SocialPlatform;
  handle: string;
  displayName: string;
  accountType: string;
  status: 'connected' | 'expired' | 'disconnected' | 'demo_simulated';
  scopes: string[];
  capabilities: {
    publishText: boolean;
    publishImage: boolean;
    publishVideo: boolean;
    scheduleNative: boolean;
    fetchAnalytics: boolean;
    limitationNote?: string;
  };
  tokenExpiresAt?: string;
  accessToken?: string;
  tokenType?: string;
  externalAccountId?: string;
  externalEmail?: string;
  connectedAt: string;
}

export interface SocialPost {
  id: string;
  organizationId: string;
  workspaceId: string;
  title: string;
  baseIdea: string;
  platforms: SocialPlatform[];
  variations: Record<
    SocialPlatform,
    {
      content: string;
      hashtags: string[];
      cta: string;
    }
  >;
  mediaAssetIds: string[];
  linkUrl?: string;
  status: SocialPostStatus;
  authorId: string;
  authorName: string;
  scheduledAt?: string;
  publishedAt?: string;
  isDemoSimulated: boolean;
  metricsAvailable: boolean;
  metrics?: {
    reach: number | null;
    impressions: number | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
    clicks: number | null;
  };
  createdAt: string;
  updatedAt: string;
}

export interface ContentAsset {
  id: string;
  organizationId: string;
  workspaceId: string;
  name: string;
  folder: string;
  type: 'image' | 'video' | 'document';
  mimeType: string;
  sizeBytes: number;
  url: string;
  tags: string[];
  storageProvider: 'local' | 'cloudinary' | 's3';
  createdAt: string;
}

export interface ApprovalItem {
  id: string;
  organizationId: string;
  workspaceId: string;
  entityType: 'email_campaign' | 'social_post';
  entityId: string;
  entityTitle: string;
  requestedById: string;
  requestedByName: string;
  reviewerId?: string;
  reviewerName?: string;
  status: 'pending' | 'approved' | 'rejected' | 'changes_requested';
  dueAt?: string;
  comments: Array<{
    id: string;
    authorId: string;
    authorName: string;
    role: RoleName;
    body: string;
    createdAt: string;
  }>;
  history: Array<{
    id: string;
    action: string;
    actorName: string;
    note?: string;
    timestamp: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface LeadCandidate {
  id: string;
  organizationId: string;
  workspaceId: string;
  searchId: string;
  companyName: string;
  website: string;
  industry: string;
  companySize: string;
  location: string;
  contactName?: string;
  contactTitle?: string;
  publicEmail?: string;
  summary: string;
  sourceUrl: string;
  sourceProvider: string;
  confidence: number;
  enrichmentStatus: 'verified_public' | 'ai_assisted_review' | 'crm_matched';
  lastVerifiedAt: string;
  matchedCrmId?: string;
  savedToContacts: boolean;
  score: number;
  scoreBreakdown: {
    icpMatch: number;
    industryMatch: number;
    locationMatch: number;
    sizeMatch: number;
    dataQuality: number;
    explanation: string;
    recommendedAction: string;
  };
}

export interface LeadSearch {
  id: string;
  organizationId: string;
  workspaceId: string;
  prompt: string;
  parsedCriteria: {
    industries: string[];
    geography: string[];
    companySize: string;
    jobTitles: string[];
    keywords: string[];
  };
  providerUsed: string;
  createdAt: string;
}

export interface CRMIntegration {
  id: string;
  organizationId: string;
  provider: 'mcp_mock_crm' | 'hubspot' | 'salesforce' | 'zoho' | 'dynamics365' | 'custom_mcp';
  name: string;
  protocol: 'mcp_json_rpc' | 'rest_adapter';
  endpointUrl?: string;
  status: 'connected' | 'simulated' | 'disconnected' | 'error';
  healthMessage: string;
  scopes: string[];
  discoveredTools: Array<{
    name: string;
    description: string;
    authorized: boolean;
  }>;
  lastSyncAt?: string;
  syncLogs: Array<{
    id: string;
    action: string;
    status: 'success' | 'warning' | 'error';
    recordsProcessed: number;
    message: string;
    timestamp: string;
  }>;
}

export type AutomationTriggerType =
  | 'contact_created'
  | 'segment_changed'
  | 'campaign_sent'
  | 'email_opened'
  | 'link_clicked'
  | 'contact_unsubscribed'
  | 'social_published'
  | 'approval_completed'
  | 'scheduled_time';

export type AutomationActionType =
  | 'add_tag'
  | 'update_lifecycle'
  | 'create_notification'
  | 'add_to_campaign'
  | 'send_email'
  | 'sync_crm'
  | 'trigger_ai';

export interface AutomationNode {
  id: string;
  kind: 'trigger' | 'condition' | 'delay' | 'branch' | 'action';
  label: string;
  config: Record<string, string>;
  x: number;
  y: number;
}

export interface AutomationEdge {
  id: string;
  sourceId: string;
  targetId: string;
  branchLabel?: 'true' | 'false' | 'next';
}

export interface AutomationWorkflow {
  id: string;
  organizationId: string;
  workspaceId: string;
  name: string;
  description: string;
  status: 'active' | 'paused' | 'draft';
  triggerType: AutomationTriggerType;
  nodes: AutomationNode[];
  edges: AutomationEdge[];
  runCount: number;
  lastRunAt?: string;
  createdAt: string;
}

export interface AutomationRun {
  id: string;
  organizationId: string;
  workflowId: string;
  workflowName: string;
  status: 'completed' | 'failed' | 'running';
  triggerEvent: string;
  steps: Array<{
    nodeId: string;
    nodeLabel: string;
    status: 'executed' | 'skipped' | 'failed';
    detail: string;
    timestamp: string;
  }>;
  startedAt: string;
  completedAt?: string;
}

export interface BackgroundJob {
  id: string;
  organizationId: string;
  type:
    | 'send_email_campaign'
    | 'publish_social_post'
    | 'crm_sync'
    | 'lead_enrichment'
    | 'automation_step';
  status: JobStatus;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  scheduledFor: string;
  executedAt?: string;
  errorDetail?: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  organizationId: string;
  workspaceId?: string;
  actorId: string;
  actorName: string;
  actorRole: RoleName;
  action: string;
  targetType: string;
  targetId?: string;
  detail: string;
  timestamp: string;
}

export interface AppNotification {
  id: string;
  organizationId: string;
  userId?: string;
  title: string;
  message: string;
  category: 'approval' | 'campaign' | 'crm' | 'automation' | 'compliance';
  read: boolean;
  createdAt: string;
}

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const RegisterSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(8).max(120),
  organizationName: z.string().min(2).max(100),
});

export const CreateContactSchema = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  email: z.string().email(),
  phone: z.string().max(40).optional().default(''),
  company: z.string().max(120).optional().default(''),
  jobTitle: z.string().max(120).optional().default(''),
  industry: z.string().max(80).optional().default(''),
  location: z.string().max(120).optional().default(''),
  state: z.string().max(80).optional().default(''),
  country: z.string().max(80).optional().default(''),
  tags: z.array(z.string()).optional().default([]),
  lifecycleStage: z
    .enum(['subscriber', 'lead', 'mql', 'sql', 'opportunity', 'customer'])
    .optional()
    .default('lead'),
  consentStatus: z
    .enum(['opted_in', 'pending', 'opted_out', 'legitimate_interest'])
    .optional()
    .default('opted_in'),
  source: z.string().max(80).optional().default('Manual entry'),
});

export const CreateCampaignSchema = z.object({
  name: z.string().min(2).max(140),
  description: z.string().max(500).optional().default(''),
  type: z.enum([
    'newsletter',
    'promotional',
    'announcement',
    'product_launch',
    'event_invitation',
    'welcome',
    'follow_up',
    'cold_outreach',
    're_engagement',
  ]),
  objective: z.string().max(240).optional().default('Drive engagement and conversions'),
  workspaceId: z.string().min(1),
  audienceType: z.enum(['segment', 'crm', 'all_subscribed', 'manual']).default('all_subscribed'),
  segmentId: z.string().optional(),
  manualContactIds: z.array(z.string()).optional().default([]),
  subject: z.string().min(2).max(200),
  previewText: z.string().max(240).optional().default(''),
  senderName: z.string().min(2).max(100),
  senderEmail: z.string().email(),
  replyTo: z.string().email(),
  htmlBody: z.string().min(10),
  textBody: z.string().optional().default(''),
  trackOpens: z.boolean().default(true),
  trackClicks: z.boolean().default(true),
  trackDeliveries: z.boolean().default(true),
});

export interface JwtSessionRecord {
  jti: string;
  userId: string;
  email: string;
  organizationId: string;
  role: RoleName;
  userAgent: string;
  issuedAt: string;
  expiresAt: string;
  lastVerifiedAt: string;
  revoked: boolean;
  revokedReason?: string;
}

export interface JwtRealtimeStatus {
  state: 'connecting' | 'verified' | 'revoked' | 'expired';
  jti?: string;
  ttlSeconds?: number;
  lastVerifiedAt?: string;
  expiresAt?: string;
  reason?: string;
}

