import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// ============================================================================
// 1. Authentication & Users
// ============================================================================

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  title: text('title'),
  passwordHash: text('password_hash').notNull(),
  timezone: text('timezone').notNull().default('UTC'),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('sessions_user_idx').on(table.userId)]
);

export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ============================================================================
// 2. Multi-Tenant Hierarchy (Organization -> Workspace -> Members)
// ============================================================================

export const organizations = pgTable('organizations', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  industry: text('industry').notNull().default('Technology'),
  requireApprovalForPublish: boolean('require_approval_for_publish').notNull().default(true),
  dataRetentionDays: integer('data_retention_days').notNull().default(730),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const workspaces = pgTable(
  'workspaces',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: text('type').notNull().default('brand'),
    description: text('description').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('workspaces_org_idx').on(table.organizationId)]
);

export const organizationMembers = pgTable(
  'organization_members',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('Viewer'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('org_member_unique_idx').on(table.organizationId, table.userId),
    index('org_members_org_idx').on(table.organizationId),
  ]
);

export const invitations = pgTable(
  'invitations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: text('role').notNull().default('Campaign Editor'),
    token: text('token').notNull().unique(),
    status: text('status').notNull().default('pending'),
    invitedByUserId: uuid('invited_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('invitations_org_idx').on(table.organizationId)]
);

// ============================================================================
// 3. Brand Kits & Content Assets
// ============================================================================

export const brandKits = pgTable(
  'brand_kits',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    logoUrl: text('logo_url'),
    primaryColor: text('primary_color').notNull().default('#1D63ED'),
    secondaryColor: text('secondary_color').notNull().default('#0A2472'),
    accentColor: text('accent_color').notNull().default('#F5B400'),
    headingFont: text('heading_font').notNull().default('Plus Jakarta Sans'),
    bodyFont: text('body_font').notNull().default('DM Sans'),
    voice: text('voice').notNull().default('Authoritative yet approachable'),
    tone: text('tone').notNull().default('Professional, concise, outcomes-focused'),
    targetAudience: text('target_audience').notNull().default(''),
    messagingGuidelines: text('messaging_guidelines').notNull().default(''),
    approvedCtas: jsonb('approved_ctas').$type<string[]>().notNull().default([]),
    prohibitedPhrases: jsonb('prohibited_phrases').$type<string[]>().notNull().default([]),
    description: text('description').notNull().default(''),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('brand_kits_org_idx').on(table.organizationId)]
);

export const contentAssets = pgTable(
  'content_assets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    folder: text('folder').notNull().default('General'),
    type: text('type').notNull().default('image'),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull().default(0),
    url: text('url').notNull(),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    storageProvider: text('storage_provider').notNull().default('local'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('content_assets_org_idx').on(table.organizationId)]
);

// ============================================================================
// 4. Audience, Contacts, Segments, Consent & Suppression
// ============================================================================

export const contacts = pgTable(
  'contacts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    externalCrmId: text('external_crm_id'),
    crmProvider: text('crm_provider'),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    email: text('email').notNull(),
    phone: text('phone'),
    company: text('company'),
    jobTitle: text('job_title'),
    industry: text('industry'),
    location: text('location'),
    state: text('state'),
    country: text('country'),
    customAttributes: jsonb('custom_attributes').$type<Record<string, string>>().notNull().default({}),
    source: text('source').notNull().default('Manual'),
    ownerName: text('owner_name'),
    lifecycleStage: text('lifecycle_stage').notNull().default('lead'),
    consentStatus: text('consent_status').notNull().default('opted_in'),
    subscriptionStatus: text('subscription_status').notNull().default('subscribed'),
    engagementScore: integer('engagement_score').notNull().default(50),
    lastEngagementAt: timestamp('last_engagement_at', { withTimezone: true }),
    crmOwnedFields: jsonb('crm_owned_fields').$type<string[]>().notNull().default([]),
    crmEditable: boolean('crm_editable').notNull().default(true),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('contacts_org_email_idx').on(table.organizationId, table.email),
    index('contacts_org_idx').on(table.organizationId),
  ]
);

export const tags = pgTable(
  'tags',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('tags_org_name_idx').on(table.organizationId, table.name)]
);

export const contactTags = pgTable(
  'contact_tags',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (table) => [uniqueIndex('contact_tag_unique_idx').on(table.contactId, table.tagId)]
);

export const segments = pgTable(
  'segments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    logic: text('logic').notNull().default('AND'),
    isDynamic: boolean('is_dynamic').notNull().default(true),
    cachedCount: integer('cached_count').notNull().default(0),
    lastRefreshedAt: timestamp('last_refreshed_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('segments_org_idx').on(table.organizationId)]
);

export const segmentConditions = pgTable(
  'segment_conditions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    segmentId: uuid('segment_id')
      .notNull()
      .references(() => segments.id, { onDelete: 'cascade' }),
    field: text('field').notNull(),
    operator: text('operator').notNull(),
    value: text('value').notNull(),
  },
  (table) => [index('segment_conditions_seg_idx').on(table.segmentId)]
);

export const consentRecords = pgTable(
  'consent_records',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    status: text('status').notNull(),
    source: text('source').notNull(),
    lawfulBasis: text('lawful_basis').notNull().default('Explicit Consent'),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('consent_org_idx').on(table.organizationId)]
);

export const suppressionRecords = pgTable(
  'suppression_records',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    email: text('email').notNull(),
    category: text('category').notNull(),
    reason: text('reason').notNull(),
    sourceCampaignId: uuid('source_campaign_id'),
    suppressedAt: timestamp('suppressed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('suppression_org_email_idx').on(table.organizationId, table.email),
    index('suppression_org_idx').on(table.organizationId),
  ]
);

// ============================================================================
// 5. Email Marketing, Templates, Tracking & Analytics
// ============================================================================

export const emailTemplates = pgTable(
  'email_templates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    category: text('category').notNull().default('newsletter'),
    subject: text('subject').notNull(),
    previewText: text('preview_text').notNull().default(''),
    htmlBody: text('html_body').notNull(),
    textBody: text('text_body').notNull().default(''),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('email_templates_org_idx').on(table.organizationId)]
);

export const campaigns = pgTable(
  'campaigns',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    type: text('type').notNull().default('newsletter'),
    objective: text('objective').notNull().default(''),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
    status: text('status').notNull().default('draft'),
    audienceType: text('audience_type').notNull().default('all_subscribed'),
    segmentId: uuid('segment_id').references(() => segments.id, { onDelete: 'set null' }),
    subject: text('subject').notNull(),
    previewText: text('preview_text').notNull().default(''),
    senderName: text('sender_name').notNull(),
    senderEmail: text('sender_email').notNull(),
    replyTo: text('reply_to').notNull(),
    htmlBody: text('html_body').notNull(),
    textBody: text('text_body').notNull().default(''),
    trackOpens: boolean('track_opens').notNull().default(true),
    trackClicks: boolean('track_clicks').notNull().default(true),
    trackDeliveries: boolean('track_deliveries').notNull().default(true),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    isDemoSimulated: boolean('is_demo_simulated').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('campaigns_org_idx').on(table.organizationId)]
);

export const emailSends = pgTable(
  'email_sends',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('queued'),
    providerMessageId: text('provider_message_id'),
    attempts: integer('attempts').notNull().default(0),
    errorDetail: text('error_detail'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
  },
  (table) => [index('email_sends_campaign_idx').on(table.campaignId)]
);

export const emailLinks = pgTable(
  'email_links',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    targetUrl: text('target_url').notNull(),
    clickCount: integer('click_count').notNull().default(0),
  },
  (table) => [index('email_links_campaign_idx').on(table.campaignId)]
);

export const campaignEvents = pgTable(
  'campaign_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    bounceType: text('bounce_type'),
    linkUrl: text('link_url'),
    device: text('device'),
    country: text('country'),
    timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('campaign_events_org_idx').on(table.organizationId),
    index('campaign_events_campaign_idx').on(table.campaignId),
  ]
);

// ============================================================================
// 6. Social Media & Approvals
// ============================================================================

export const socialAccounts = pgTable(
  'social_accounts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    platform: text('platform').notNull(),
    handle: text('handle').notNull(),
    displayName: text('display_name').notNull(),
    accountType: text('account_type').notNull().default('Business'),
    status: text('status').notNull().default('demo_simulated'),
    scopes: jsonb('scopes').$type<string[]>().notNull().default([]),
    capabilities: jsonb('capabilities').$type<Record<string, unknown>>().notNull().default({}),
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
    connectedAt: timestamp('connected_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('social_accounts_org_idx').on(table.organizationId)]
);

export const socialPosts = pgTable(
  'social_posts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    baseIdea: text('base_idea').notNull().default(''),
    platforms: jsonb('platforms').$type<string[]>().notNull().default([]),
    variations: jsonb('variations').$type<Record<string, unknown>>().notNull().default({}),
    mediaAssetIds: jsonb('media_asset_ids').$type<string[]>().notNull().default([]),
    linkUrl: text('link_url'),
    status: text('status').notNull().default('draft'),
    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    isDemoSimulated: boolean('is_demo_simulated').notNull().default(true),
    metrics: jsonb('metrics').$type<Record<string, number | null>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('social_posts_org_idx').on(table.organizationId)]
);

export const approvals = pgTable(
  'approvals',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    entityTitle: text('entity_title').notNull(),
    requestedById: uuid('requested_by_id').references(() => users.id, { onDelete: 'set null' }),
    reviewerId: uuid('reviewer_id').references(() => users.id, { onDelete: 'set null' }),
    status: text('status').notNull().default('pending'),
    dueAt: timestamp('due_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('approvals_org_idx').on(table.organizationId)]
);

export const approvalComments = pgTable(
  'approval_comments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    approvalId: uuid('approval_id')
      .notNull()
      .references(() => approvals.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    authorName: text('author_name').notNull(),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('approval_comments_app_idx').on(table.approvalId)]
);

export const approvalHistory = pgTable(
  'approval_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    approvalId: uuid('approval_id')
      .notNull()
      .references(() => approvals.id, { onDelete: 'cascade' }),
    action: text('action').notNull(),
    actorName: text('actor_name').notNull(),
    note: text('note'),
    timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('approval_history_app_idx').on(table.approvalId)]
);

// ============================================================================
// 7. Lead Intelligence, CRM / MCP Connectors & Automation
// ============================================================================

export const leadSearches = pgTable(
  'lead_searches',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    prompt: text('prompt').notNull(),
    parsedCriteria: jsonb('parsed_criteria').$type<Record<string, unknown>>().notNull(),
    providerUsed: text('provider_used').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('lead_searches_org_idx').on(table.organizationId)]
);

export const leadCandidates = pgTable(
  'lead_candidates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    searchId: uuid('search_id')
      .notNull()
      .references(() => leadSearches.id, { onDelete: 'cascade' }),
    companyName: text('company_name').notNull(),
    website: text('website').notNull(),
    industry: text('industry').notNull(),
    companySize: text('company_size').notNull(),
    location: text('location').notNull(),
    contactName: text('contact_name'),
    contactTitle: text('contact_title'),
    publicEmail: text('public_email'),
    summary: text('summary').notNull(),
    sourceUrl: text('source_url').notNull(),
    sourceProvider: text('source_provider').notNull(),
    confidence: integer('confidence').notNull(),
    enrichmentStatus: text('enrichment_status').notNull(),
    lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }).defaultNow().notNull(),
    matchedCrmId: text('matched_crm_id'),
    savedToContacts: boolean('saved_to_contacts').notNull().default(false),
    score: integer('score').notNull(),
    scoreBreakdown: jsonb('score_breakdown').$type<Record<string, unknown>>().notNull(),
  },
  (table) => [index('lead_candidates_org_idx').on(table.organizationId)]
);

export const integrations = pgTable(
  'integrations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    name: text('name').notNull(),
    protocol: text('protocol').notNull().default('mcp_json_rpc'),
    endpointUrl: text('endpoint_url'),
    encryptedCredential: text('encrypted_credential'),
    status: text('status').notNull().default('disconnected'),
    healthMessage: text('health_message').notNull().default('Not configured'),
    scopes: jsonb('scopes').$type<string[]>().notNull().default([]),
    lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('integrations_org_idx').on(table.organizationId)]
);

export const integrationTools = pgTable(
  'integration_tools',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    integrationId: uuid('integration_id')
      .notNull()
      .references(() => integrations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull(),
    authorized: boolean('authorized').notNull().default(true),
  },
  (table) => [index('integration_tools_int_idx').on(table.integrationId)]
);

export const syncLogs = pgTable(
  'sync_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    integrationId: uuid('integration_id')
      .notNull()
      .references(() => integrations.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    action: text('action').notNull(),
    status: text('status').notNull(),
    recordsProcessed: integer('records_processed').notNull().default(0),
    message: text('message').notNull(),
    timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('sync_logs_org_idx').on(table.organizationId)]
);

export const automationWorkflows = pgTable(
  'automation_workflows',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    status: text('status').notNull().default('draft'),
    triggerType: text('trigger_type').notNull(),
    runCount: integer('run_count').notNull().default(0),
    lastRunAt: timestamp('last_run_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('automation_workflows_org_idx').on(table.organizationId)]
);

export const automationNodes = pgTable(
  'automation_nodes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workflowId: uuid('workflow_id')
      .notNull()
      .references(() => automationWorkflows.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    label: text('label').notNull(),
    config: jsonb('config').$type<Record<string, string>>().notNull().default({}),
    x: integer('x').notNull().default(0),
    y: integer('y').notNull().default(0),
  },
  (table) => [index('automation_nodes_wf_idx').on(table.workflowId)]
);

export const automationEdges = pgTable(
  'automation_edges',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workflowId: uuid('workflow_id')
      .notNull()
      .references(() => automationWorkflows.id, { onDelete: 'cascade' }),
    sourceId: uuid('source_id').notNull(),
    targetId: uuid('target_id').notNull(),
    branchLabel: text('branch_label'),
  },
  (table) => [index('automation_edges_wf_idx').on(table.workflowId)]
);

export const automationRuns = pgTable(
  'automation_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workflowId: uuid('workflow_id')
      .notNull()
      .references(() => automationWorkflows.id, { onDelete: 'cascade' }),
    status: text('status').notNull(),
    triggerEvent: text('trigger_event').notNull(),
    steps: jsonb('steps').$type<Array<Record<string, unknown>>>().notNull().default([]),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [index('automation_runs_org_idx').on(table.organizationId)]
);

// ============================================================================
// 8. Background Jobs, Notifications, Audit Logs & Webhooks
// ============================================================================

export const backgroundJobs = pgTable(
  'background_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    status: text('status').notNull().default('pending'),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }).defaultNow().notNull(),
    executedAt: timestamp('executed_at', { withTimezone: true }),
    errorDetail: text('error_detail'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('background_jobs_org_idx').on(table.organizationId)]
);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    message: text('message').notNull(),
    category: text('category').notNull(),
    read: boolean('read').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('notifications_org_idx').on(table.organizationId)]
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id'),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    actorName: text('actor_name').notNull(),
    actorRole: text('actor_role').notNull(),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id'),
    detail: text('detail').notNull(),
    timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('audit_logs_org_idx').on(table.organizationId)]
);

export const webhooks = pgTable(
  'webhooks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    targetUrl: text('target_url').notNull(),
    events: jsonb('events').$type<string[]>().notNull().default([]),
    signingSecretHash: text('signing_secret_hash').notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('webhooks_org_idx').on(table.organizationId)]
);
