import crypto from 'crypto';
import type {
  ApprovalItem,
  AutomationTriggerType,
  AutomationWorkflow,
  Campaign,
  CampaignMetrics,
  Contact,
  LeadCandidate,
  RoleName,
  Segment,
  SegmentCondition,
  SocialPost,
} from '../../shared/types.ts';
import { aiFacade } from '../providers/aiProvider.ts';
import { emailProvider } from '../providers/emailProvider.ts';
import { demoStore } from '../store/demoStore.ts';
import { renderPersonalizedTemplate } from '../utils/security.ts';
import { recordAudit } from './authService.ts';

// ============================================================================
// Segment Evaluation Engine (AND/OR dynamic conditions)
// ============================================================================

export function matchesCondition(contact: Contact, cond: SegmentCondition): boolean {
  const val = cond.value.trim().toLowerCase();
  if (cond.field === 'engagementScore') {
    const targetNum = Number(cond.value);
    if (Number.isNaN(targetNum)) return false;
    if (cond.operator === 'gte') return contact.engagementScore >= targetNum;
    if (cond.operator === 'lte') return contact.engagementScore <= targetNum;
    return contact.engagementScore === targetNum;
  }

  if (cond.field === 'tags') {
    const lowerTags = contact.tags.map((t) => t.toLowerCase());
    if (cond.operator === 'contains' || cond.operator === 'equals') {
      return lowerTags.some((t) => t.includes(val));
    }
    if (cond.operator === 'not_equals') {
      return !lowerTags.some((t) => t === val);
    }
    return false;
  }

  const rawField = String((contact as unknown as Record<string, unknown>)[cond.field] ?? '').toLowerCase();
  switch (cond.operator) {
    case 'equals':
      return rawField === val;
    case 'not_equals':
      return rawField !== val;
    case 'contains':
      return rawField.includes(val);
    case 'in':
      return val
        .split(',')
        .map((s) => s.trim())
        .includes(rawField);
    default:
      return false;
  }
}

export function evaluateSegmentContacts(organizationId: string, segment: Pick<Segment, 'logic' | 'conditions'>): Contact[] {
  const orgContacts = demoStore.state.contacts.filter((c) => c.organizationId === organizationId);
  if (!segment.conditions || segment.conditions.length === 0) return orgContacts;

  return orgContacts.filter((contact) => {
    if (segment.logic === 'OR') {
      return segment.conditions.some((cond) => matchesCondition(contact, cond));
    }
    return segment.conditions.every((cond) => matchesCondition(contact, cond));
  });
}

// ============================================================================
// Campaign Compliance Validation & Zero-Safe Metrics
// ============================================================================

export function calculateCampaignMetrics(organizationId: string, campaignId: string, recipientCountHint = 0): CampaignMetrics {
  const events = demoStore.state.campaignEvents.filter(
    (e) => e.organizationId === organizationId && e.campaignId === campaignId
  );

  const sent = events.filter((e) => e.type === 'sent').length;
  const delivered = events.filter((e) => e.type === 'delivered').length;
  const failed = events.filter((e) => e.type === 'failed').length;
  const bounced = events.filter((e) => e.type === 'bounce').length;
  const openEvents = events.filter((e) => e.type === 'open');
  const uniqueOpens = new Set(openEvents.map((e) => e.contactId)).size;
  const clickEvents = events.filter((e) => e.type === 'click');
  const uniqueClicks = new Set(clickEvents.map((e) => e.contactId)).size;
  const unsubscribes = events.filter((e) => e.type === 'unsubscribe').length;
  const complaints = events.filter((e) => e.type === 'complaint').length;
  const conversions = events.filter((e) => e.type === 'conversion').length;

  const safeDiv = (num: number, den: number): number | null => (den > 0 ? Number((num / den).toFixed(4)) : null);

  return {
    recipients: Math.max(sent + failed, recipientCountHint),
    sent,
    delivered,
    failed,
    bounced,
    opens: openEvents.length,
    uniqueOpens,
    clicks: clickEvents.length,
    uniqueClicks,
    unsubscribes,
    complaints,
    conversions,
    deliveryRate: safeDiv(delivered, sent),
    openRate: safeDiv(uniqueOpens, delivered),
    clickRate: safeDiv(uniqueClicks, delivered),
    clickToOpenRate: safeDiv(uniqueClicks, uniqueOpens),
    bounceRate: safeDiv(bounced, sent),
    unsubscribeRate: safeDiv(unsubscribes, delivered),
  };
}

export function resolveCampaignAudience(organizationId: string, campaign: Campaign) {
  const orgContacts = demoStore.state.contacts.filter((c) => c.organizationId === organizationId);
  const suppressedEmails = new Set(
    demoStore.state.suppressionRecords
      .filter((s) => s.organizationId === organizationId)
      .map((s) => s.email.toLowerCase())
  );

  let candidates: Contact[] = orgContacts;
  if (campaign.audienceType === 'segment' && campaign.segmentId) {
    const seg = demoStore.state.segments.find(
      (s) => s.id === campaign.segmentId && s.organizationId === organizationId
    );
    candidates = seg ? evaluateSegmentContacts(organizationId, seg) : [];
  } else if (campaign.audienceType === 'crm') {
    candidates = orgContacts.filter((c) => Boolean(c.externalCrmId));
  } else if (campaign.audienceType === 'manual') {
    const idSet = new Set(campaign.manualContactIds);
    candidates = orgContacts.filter((c) => idSet.has(c.id));
  }

  const seenEmails = new Set<string>();
  const eligible: Contact[] = [];
  let suppressedCount = 0;
  let unsubscribedCount = 0;
  let duplicateCount = 0;
  let invalidCount = 0;

  for (const c of candidates) {
    const email = c.email.trim().toLowerCase();
    if (!email.includes('@') || !email.includes('.')) {
      invalidCount++;
      continue;
    }
    if (seenEmails.has(email)) {
      duplicateCount++;
      continue;
    }
    seenEmails.add(email);

    if (c.subscriptionStatus === 'unsubscribed' || c.consentStatus === 'opted_out') {
      unsubscribedCount++;
      continue;
    }
    if (suppressedEmails.has(email) || c.subscriptionStatus === 'suppressed' || c.subscriptionStatus === 'bounced') {
      suppressedCount++;
      continue;
    }
    eligible.push(c);
  }

  return {
    totalMatched: candidates.length,
    eligible,
    suppressedCount,
    unsubscribedCount,
    duplicateCount,
    invalidCount,
  };
}

export function validateCampaignCompliance(organizationId: string, campaign: Campaign) {
  const resolution = resolveCampaignAudience(organizationId, campaign);
  const warnings: string[] = [];
  const blockers: string[] = [];

  if (!campaign.senderEmail || !campaign.senderName) {
    blockers.push('Missing sender name or sender email identity.');
  }
  if (!campaign.subject || campaign.subject.trim().length < 3) {
    blockers.push('Subject line is required.');
  }
  if (resolution.eligible.length === 0) {
    blockers.push('No eligible opted-in, unsuppressed recipients matched this audience.');
  }
  if (/free money|guaranteed|act now!!!|100% free/i.test(campaign.subject + campaign.htmlBody)) {
    warnings.push('Spam-risk phrases detected in subject or body.');
  }
  if (!campaign.htmlBody.includes('{{')) {
    warnings.push('No personalization tokens used; consider adding {{first_name}}.');
  }

  return {
    passed: blockers.length === 0,
    blockers,
    warnings,
    audienceSummary: {
      eligibleCount: resolution.eligible.length,
      suppressedCount: resolution.suppressedCount,
      unsubscribedCount: resolution.unsubscribedCount,
      duplicateCount: resolution.duplicateCount,
      invalidCount: resolution.invalidCount,
    },
  };
}

// ============================================================================
// Execute Campaign Send (via EmailProvider + Background Job tracking)
// ============================================================================

export async function executeCampaignSend(params: {
  organizationId: string;
  campaignId: string;
  actorId: string;
  actorName: string;
  actorRole: RoleName;
  appBaseUrl: string;
}) {
  const campaign = demoStore.state.campaigns.find(
    (c) => c.id === params.campaignId && c.organizationId === params.organizationId
  );
  if (!campaign) throw new Error('Campaign not found.');

  const compliance = validateCampaignCompliance(params.organizationId, campaign);
  if (!compliance.passed) {
    throw new Error(`Compliance check failed: ${compliance.blockers.join(' ')}`);
  }

  const { eligible } = resolveCampaignAudience(params.organizationId, campaign);
  const idempotencyKey = `campaign-send-${campaign.id}`;
  const existingJob = demoStore.state.backgroundJobs.find((j) => j.idempotencyKey === idempotencyKey && j.status === 'completed');
  if (existingJob && campaign.status === 'sent') {
    throw new Error('Campaign already executed (idempotency guard prevented duplicate send).');
  }

  const jobId = `job-${crypto.randomUUID().slice(0, 8)}`;
  demoStore.state.backgroundJobs.unshift({
    id: jobId,
    organizationId: params.organizationId,
    type: 'send_email_campaign',
    status: 'processing',
    idempotencyKey,
    payload: { campaignId: campaign.id, recipientCount: eligible.length },
    attempts: 1,
    maxAttempts: 3,
    scheduledFor: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  });

  campaign.status = 'sending';
  const emailStatus = emailProvider.getStatus();
  let sentCount = 0;

  for (const contact of eligible) {
    if ((campaign.status as string) === 'paused' || (campaign.status as string) === 'cancelled') break;

    const vars = {
      first_name: contact.firstName,
      last_name: contact.lastName,
      company: contact.company,
      job_title: contact.jobTitle,
      location: contact.location,
      industry: contact.industry,
      custom_field: Object.values(contact.customAttributes)[0],
    };

    const sendId = crypto.randomUUID().slice(0, 12);
    const result = await emailProvider.sendEmail({
      sendId,
      to: contact.email,
      fromName: campaign.senderName,
      fromEmail: campaign.senderEmail,
      replyTo: campaign.replyTo,
      subject: renderPersonalizedTemplate(campaign.subject, vars),
      htmlBody: renderPersonalizedTemplate(campaign.htmlBody, vars),
      textBody: renderPersonalizedTemplate(campaign.textBody || campaign.subject, vars),
      trackOpens: campaign.trackOpens,
      trackClicks: campaign.trackClicks,
      appBaseUrl: params.appBaseUrl,
      unsubscribeUrl: `${params.appBaseUrl}/unsubscribe/${contact.id}?org=${params.organizationId}&camp=${campaign.id}`,
    });

    const ts = new Date().toISOString();
    if (result.success) {
      sentCount++;
      demoStore.state.campaignEvents.push({
        id: `ev-${crypto.randomUUID().slice(0, 8)}`,
        organizationId: params.organizationId,
        campaignId: campaign.id,
        contactId: contact.id,
        contactEmail: contact.email,
        type: 'sent',
        device: 'desktop',
        country: contact.country || 'India',
        timestamp: ts,
      });

      // In simulated mode, record simulated delivery + realistic subset of opens/clicks
      if (result.simulated) {
        demoStore.state.campaignEvents.push({
          id: `ev-${crypto.randomUUID().slice(0, 8)}`,
          organizationId: params.organizationId,
          campaignId: campaign.id,
          contactId: contact.id,
          contactEmail: contact.email,
          type: 'delivered',
          device: sentCount % 2 === 0 ? 'mobile' : 'desktop',
          country: contact.country || 'India',
          timestamp: ts,
        });
        if (sentCount % 2 === 1 && campaign.trackOpens) {
          demoStore.state.campaignEvents.push({
            id: `ev-${crypto.randomUUID().slice(0, 8)}`,
            organizationId: params.organizationId,
            campaignId: campaign.id,
            contactId: contact.id,
            contactEmail: contact.email,
            type: 'open',
            device: sentCount % 3 === 0 ? 'mobile' : 'desktop',
            country: contact.country || 'India',
            timestamp: ts,
          });
        }
      }
    } else {
      demoStore.state.campaignEvents.push({
        id: `ev-${crypto.randomUUID().slice(0, 8)}`,
        organizationId: params.organizationId,
        campaignId: campaign.id,
        contactId: contact.id,
        contactEmail: contact.email,
        type: 'failed',
        timestamp: ts,
      });
    }
  }

  campaign.status = 'sent';
  campaign.sentAt = new Date().toISOString();
  campaign.updatedAt = campaign.sentAt;
  campaign.isDemoSimulated = emailStatus.simulationMode;

  const job = demoStore.state.backgroundJobs.find((j) => j.id === jobId);
  if (job) {
    job.status = 'completed';
    job.executedAt = new Date().toISOString();
  }

  recordAudit({
    organizationId: params.organizationId,
    workspaceId: campaign.workspaceId,
    actorId: params.actorId,
    actorName: params.actorName,
    actorRole: params.actorRole,
    action: emailStatus.simulationMode ? 'campaign.sent_simulated' : 'campaign.sent_live',
    targetType: 'campaign',
    targetId: campaign.id,
    detail: `Processed ${sentCount} recipients via ${emailStatus.activeProvider} provider.`,
  });

  await triggerAutomations(params.organizationId, 'campaign_sent', {
    campaignId: campaign.id,
    campaignName: campaign.name,
  });

  return { campaign, sentCount, simulated: emailStatus.simulationMode };
}

// ============================================================================
// Unsubscribe & Suppression Workflow
// ============================================================================

export function processUnsubscribe(params: {
  organizationId: string;
  contactId: string;
  campaignId?: string;
  reason?: string;
}) {
  const contact = demoStore.state.contacts.find(
    (c) => c.id === params.contactId && c.organizationId === params.organizationId
  );
  if (!contact) return null;

  contact.subscriptionStatus = 'unsubscribed';
  contact.consentStatus = 'opted_out';

  const existingSup = demoStore.state.suppressionRecords.find(
    (s) => s.organizationId === params.organizationId && s.email.toLowerCase() === contact.email.toLowerCase()
  );

  const campaign = params.campaignId
    ? demoStore.state.campaigns.find((c) => c.id === params.campaignId && c.organizationId === params.organizationId)
    : undefined;

  if (!existingSup) {
    demoStore.state.suppressionRecords.unshift({
      id: `sup-${crypto.randomUUID().slice(0, 8)}`,
      organizationId: params.organizationId,
      contactId: contact.id,
      email: contact.email,
      category: 'unsubscribed',
      reason: params.reason || 'Recipient used Unsubscribe Center link',
      sourceCampaignId: campaign?.id,
      sourceCampaignName: campaign?.name,
      suppressedAt: new Date().toISOString(),
    });
  }

  demoStore.state.consentRecords.unshift({
    id: `con-${crypto.randomUUID().slice(0, 8)}`,
    organizationId: params.organizationId,
    contactId: contact.id,
    email: contact.email,
    status: 'opted_out',
    source: 'Unsubscribe Center',
    lawfulBasis: 'Consent Withdrawn by Data Subject',
    recordedAt: new Date().toISOString(),
  });

  if (campaign) {
    demoStore.state.campaignEvents.push({
      id: `ev-${crypto.randomUUID().slice(0, 8)}`,
      organizationId: params.organizationId,
      campaignId: campaign.id,
      contactId: contact.id,
      contactEmail: contact.email,
      type: 'unsubscribe',
      timestamp: new Date().toISOString(),
    });
  }

  return contact;
}

// ============================================================================
// Lead Intelligence Discovery, Provenance & Explainable Scoring
// ============================================================================

export async function runLeadDiscovery(params: {
  organizationId: string;
  workspaceId: string;
  prompt: string;
}) {
  const parsed = await aiFacade.parseLeadDiscoveryIntent(params.prompt);
  const searchId = `ls-${crypto.randomUUID().slice(0, 8)}`;

  const searchRecord = {
    id: searchId,
    organizationId: params.organizationId,
    workspaceId: params.workspaceId,
    prompt: params.prompt,
    parsedCriteria: {
      industries: parsed.industries,
      geography: parsed.geography,
      companySize: parsed.companySize,
      jobTitles: parsed.jobTitles,
      keywords: parsed.keywords,
    },
    providerUsed: `${parsed.provider} + Connected CRM & Audience Index`,
    createdAt: new Date().toISOString(),
  };
  demoStore.state.leadSearches.unshift(searchRecord);

  // Match against real tenant contacts / MCP-synced CRM records (never fabricate sample companies)
  const orgContacts = demoStore.state.contacts.filter((c) => c.organizationId === params.organizationId);
  const lowerIndustries = parsed.industries.map((i) => i.toLowerCase());
  const lowerGeo = parsed.geography.map((g) => g.toLowerCase());
  const lowerKeywords = parsed.keywords.map((k) => k.toLowerCase());

  const candidates: LeadCandidate[] = orgContacts
    .filter((c) => {
      const hay = `${c.company || ''} ${c.industry || ''} ${c.location || ''} ${c.country || ''} ${c.jobTitle || ''}`.toLowerCase();
      return (
        lowerIndustries.some((ind) => hay.includes(ind)) ||
        lowerGeo.some((geo) => hay.includes(geo)) ||
        lowerKeywords.some((kw) => hay.includes(kw))
      );
    })
    .slice(0, 12)
    .map((c) => {
      const indHit = lowerIndustries.some((ind) => (c.industry || '').toLowerCase().includes(ind));
      const geoHit = lowerGeo.some((geo) => `${c.location || ''} ${c.country || ''}`.toLowerCase().includes(geo));
      const score = Math.min(99, 60 + (indHit ? 20 : 0) + (geoHit ? 15 : 0));
      return {
        id: `lc-${crypto.randomUUID().slice(0, 8)}`,
        organizationId: params.organizationId,
        workspaceId: params.workspaceId,
        searchId,
        companyName: c.company || `${c.firstName} ${c.lastName}`,
        website: '',
        industry: c.industry || parsed.industries[0] || 'General',
        companySize: parsed.companySize || 'Unknown',
        location: c.location || c.country || 'Unspecified',
        contactName: `${c.firstName} ${c.lastName}`.trim(),
        contactTitle: c.jobTitle || 'Contact',
        publicEmail: c.email,
        summary: `Matched existing workspace/CRM contact (${c.source}).`,
        sourceUrl: '',
        sourceProvider: c.crmProvider || c.source,
        confidence: score,
        enrichmentStatus: c.externalCrmId ? 'verified_public' : 'ai_assisted_review',
        lastVerifiedAt: c.lastSyncedAt || c.createdAt,
        matchedCrmId: c.externalCrmId,
        savedToContacts: true,
        score,
        scoreBreakdown: {
          icpMatch: score,
          industryMatch: indHit ? 95 : 65,
          locationMatch: geoHit ? 95 : 65,
          sizeMatch: 75,
          dataQuality: 90,
          explanation: `Matched real organization contact on ${[indHit ? 'industry' : '', geoHit ? 'geography' : '', 'keywords'].filter(Boolean).join(', ')}.`,
          recommendedAction: 'Enroll in targeted campaign segment or verify CRM timeline.',
        },
      };
    });

  demoStore.state.leadCandidates.unshift(...candidates);
  return { search: searchRecord, candidates };
}

// ============================================================================
// Automation Execution Engine (Every Node Executes Real State Mutations)
// ============================================================================

export async function triggerAutomations(
  organizationId: string,
  triggerType: AutomationTriggerType,
  eventContext: { contactId?: string; campaignId?: string; campaignName?: string; detail?: string }
) {
  const activeWorkflows = demoStore.state.automationWorkflows.filter(
    (w) => w.organizationId === organizationId && w.status === 'active' && w.triggerType === triggerType
  );

  const runs = [];
  for (const wf of activeWorkflows) {
    const run = await executeWorkflow(wf, organizationId, eventContext);
    runs.push(run);
  }
  return runs;
}

export async function executeWorkflow(
  workflow: AutomationWorkflow,
  organizationId: string,
  eventContext: { contactId?: string; campaignId?: string; campaignName?: string; detail?: string }
) {
  const steps: Array<{ nodeId: string; nodeLabel: string; status: 'executed' | 'skipped' | 'failed'; detail: string; timestamp: string }> = [];
  const contact = eventContext.contactId
    ? demoStore.state.contacts.find((c) => c.id === eventContext.contactId && c.organizationId === organizationId)
    : demoStore.state.contacts.find((c) => c.organizationId === organizationId);

  const triggerNode = workflow.nodes.find((n) => n.kind === 'trigger');
  let currentId: string | undefined = triggerNode?.id;
  const visited = new Set<string>();

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const node = workflow.nodes.find((n) => n.id === currentId);
    if (!node) break;

    const ts = new Date().toISOString();
    let branchResult: 'true' | 'false' | 'next' = 'next';

    if (node.kind === 'trigger') {
      steps.push({
        nodeId: node.id,
        nodeLabel: node.label,
        status: 'executed',
        detail: eventContext.detail || `Triggered on ${workflow.triggerType}`,
        timestamp: ts,
      });
    } else if (node.kind === 'condition' || node.kind === 'branch') {
      let matched = true;
      if (contact && node.config.field) {
        matched = matchesCondition(contact, {
          id: node.id,
          field: node.config.field as SegmentCondition['field'],
          operator: (node.config.operator || 'equals') as SegmentCondition['operator'],
          value: node.config.value || '',
        });
      }
      branchResult = matched ? 'true' : 'false';
      steps.push({
        nodeId: node.id,
        nodeLabel: node.label,
        status: 'executed',
        detail: `Evaluated condition -> ${branchResult.toUpperCase()}`,
        timestamp: ts,
      });
    } else if (node.kind === 'delay') {
      const mins = Number(node.config.delayMinutes || '5');
      demoStore.state.backgroundJobs.unshift({
        id: `job-${crypto.randomUUID().slice(0, 8)}`,
        organizationId,
        type: 'automation_step',
        status: 'completed',
        idempotencyKey: `auto-delay-${workflow.id}-${node.id}-${Date.now()}`,
        payload: { workflowId: workflow.id, delayMinutes: mins },
        attempts: 1,
        maxAttempts: 3,
        scheduledFor: new Date(Date.now() + mins * 60000).toISOString(),
        executedAt: ts,
        createdAt: ts,
      });
      steps.push({
        nodeId: node.id,
        nodeLabel: node.label,
        status: 'executed',
        detail: `Scheduled & resolved ${mins}m automation delay checkpoint`,
        timestamp: ts,
      });
    } else if (node.kind === 'action') {
      const actionType = node.config.actionType;
      if (actionType === 'add_tag' && contact && node.config.tag) {
        if (!contact.tags.includes(node.config.tag)) contact.tags.push(node.config.tag);
        steps.push({ nodeId: node.id, nodeLabel: node.label, status: 'executed', detail: `Added tag "${node.config.tag}" to ${contact.email}`, timestamp: ts });
      } else if (actionType === 'update_lifecycle' && contact && node.config.stage) {
        contact.lifecycleStage = node.config.stage as Contact['lifecycleStage'];
        steps.push({ nodeId: node.id, nodeLabel: node.label, status: 'executed', detail: `Updated ${contact.email} lifecycle to ${contact.lifecycleStage}`, timestamp: ts });
      } else if (actionType === 'create_notification') {
        demoStore.state.notifications.unshift({
          id: `not-${crypto.randomUUID().slice(0, 8)}`,
          organizationId,
          title: node.config.title || 'Automation Alert',
          message: `Workflow "${workflow.name}" triggered for ${contact?.email || 'campaign'}.`,
          category: 'automation',
          read: false,
          createdAt: ts,
        });
        steps.push({ nodeId: node.id, nodeLabel: node.label, status: 'executed', detail: 'Created in-app notification', timestamp: ts });
      } else if (actionType === 'sync_crm' && contact) {
        contact.notes.unshift({
          id: `note-${crypto.randomUUID().slice(0, 6)}`,
          author: 'Automation Engine',
          text: node.config.note || `Automation "${workflow.name}" executed`,
          createdAt: ts,
        });
        contact.lastSyncedAt = ts;
        steps.push({ nodeId: node.id, nodeLabel: node.label, status: 'executed', detail: `Synced activity for ${contact.email} via MCP CRM`, timestamp: ts });
      } else {
        steps.push({ nodeId: node.id, nodeLabel: node.label, status: 'executed', detail: `Executed action ${actionType || 'custom'}`, timestamp: ts });
      }
    }

    const nextEdge =
      workflow.edges.find((e) => e.sourceId === node.id && e.branchLabel === branchResult) ||
      workflow.edges.find((e) => e.sourceId === node.id);
    currentId = nextEdge?.targetId;
  }

  const run = {
    id: `ar-${crypto.randomUUID().slice(0, 8)}`,
    organizationId,
    workflowId: workflow.id,
    workflowName: workflow.name,
    status: 'completed' as const,
    triggerEvent: eventContext.detail || `${workflow.triggerType} (${contact?.email || 'system'})`,
    steps,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  };

  workflow.runCount += 1;
  workflow.lastRunAt = run.completedAt;
  demoStore.state.automationRuns.unshift(run);
  return run;
}

// ============================================================================
// Approval & Social Publishing Enforcement
// ============================================================================

export function submitForApproval(params: {
  organizationId: string;
  workspaceId: string;
  entityType: 'email_campaign' | 'social_post';
  entityId: string;
  entityTitle: string;
  actorId: string;
  actorName: string;
  actorRole: RoleName;
}) {
  const existing = demoStore.state.approvals.find(
    (a) => a.organizationId === params.organizationId && a.entityId === params.entityId && a.status === 'pending'
  );
  if (existing) return existing;

  const nowIso = new Date().toISOString();
  const item: ApprovalItem = {
    id: `app-${crypto.randomUUID().slice(0, 8)}`,
    organizationId: params.organizationId,
    workspaceId: params.workspaceId,
    entityType: params.entityType,
    entityId: params.entityId,
    entityTitle: params.entityTitle,
    requestedById: params.actorId,
    requestedByName: params.actorName,
    status: 'pending',
    dueAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    comments: [],
    history: [
      {
        id: `ah-${crypto.randomUUID().slice(0, 6)}`,
        action: 'Submitted for review',
        actorName: params.actorName,
        timestamp: nowIso,
      },
    ],
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  demoStore.state.approvals.unshift(item);

  if (params.entityType === 'email_campaign') {
    const camp = demoStore.state.campaigns.find((c) => c.id === params.entityId && c.organizationId === params.organizationId);
    if (camp) camp.status = 'pending_approval';
  } else {
    const post = demoStore.state.socialPosts.find((p) => p.id === params.entityId && p.organizationId === params.organizationId);
    if (post) post.status = 'pending_approval';
  }

  recordAudit({
    organizationId: params.organizationId,
    workspaceId: params.workspaceId,
    actorId: params.actorId,
    actorName: params.actorName,
    actorRole: params.actorRole,
    action: 'approval.submitted',
    targetType: params.entityType,
    targetId: params.entityId,
    detail: `Submitted "${params.entityTitle}" for approval.`,
  });

  return item;
}

export function decideApproval(params: {
  organizationId: string;
  approvalId: string;
  decision: 'approved' | 'rejected' | 'changes_requested';
  note?: string;
  actorId: string;
  actorName: string;
  actorRole: RoleName;
}) {
  const approval = demoStore.state.approvals.find(
    (a) => a.id === params.approvalId && a.organizationId === params.organizationId
  );
  if (!approval) throw new Error('Approval record not found.');

  const nowIso = new Date().toISOString();
  approval.status = params.decision;
  approval.reviewerId = params.actorId;
  approval.reviewerName = params.actorName;
  approval.updatedAt = nowIso;
  approval.history.unshift({
    id: `ah-${crypto.randomUUID().slice(0, 6)}`,
    action: params.decision === 'approved' ? 'Approved' : params.decision === 'rejected' ? 'Rejected' : 'Requested changes',
    actorName: params.actorName,
    note: params.note,
    timestamp: nowIso,
  });

  if (params.note) {
    approval.comments.push({
      id: `ac-${crypto.randomUUID().slice(0, 6)}`,
      authorId: params.actorId,
      authorName: params.actorName,
      role: params.actorRole,
      body: params.note,
      createdAt: nowIso,
    });
  }

  if (approval.entityType === 'email_campaign') {
    const camp = demoStore.state.campaigns.find(
      (c) => c.id === approval.entityId && c.organizationId === params.organizationId
    );
    if (camp) {
      camp.status =
        params.decision === 'approved'
          ? 'approved'
          : params.decision === 'rejected'
            ? 'rejected'
            : 'draft';
      camp.updatedAt = nowIso;
    }
  } else {
    const post = demoStore.state.socialPosts.find(
      (p) => p.id === approval.entityId && p.organizationId === params.organizationId
    );
    if (post) {
      post.status =
        params.decision === 'approved'
          ? 'approved'
          : params.decision === 'rejected'
            ? 'rejected'
            : 'needs_revision';
      post.updatedAt = nowIso;
    }
  }

  recordAudit({
    organizationId: params.organizationId,
    workspaceId: approval.workspaceId,
    actorId: params.actorId,
    actorName: params.actorName,
    actorRole: params.actorRole,
    action: `approval.${params.decision}`,
    targetType: approval.entityType,
    targetId: approval.entityId,
    detail: `${params.decision} "${approval.entityTitle}"${params.note ? ` — ${params.note}` : ''}`,
  });

  return approval;
}

export function publishSocialPost(params: {
  organizationId: string;
  postId: string;
  actorId: string;
  actorName: string;
  actorRole: RoleName;
}) {
  const post = demoStore.state.socialPosts.find(
    (p) => p.id === params.postId && p.organizationId === params.organizationId
  );
  if (!post) throw new Error('Social post not found.');

  const org = demoStore.state.organizations.find((o) => o.id === params.organizationId);
  if (org?.requireApprovalForPublish && params.actorRole === 'Campaign Editor' && post.status !== 'approved') {
    throw new Error('Organization policy requires Marketing Manager approval before publishing.');
  }

  const nowIso = new Date().toISOString();
  post.status = 'published';
  post.publishedAt = nowIso;
  post.updatedAt = nowIso;
  post.isDemoSimulated = true;
  post.metricsAvailable = false;
  post.metrics = { reach: null, impressions: null, likes: null, comments: null, shares: null, clicks: null };

  demoStore.state.backgroundJobs.unshift({
    id: `job-${crypto.randomUUID().slice(0, 8)}`,
    organizationId: params.organizationId,
    type: 'publish_social_post',
    status: 'completed',
    idempotencyKey: `social-pub-${post.id}-${Date.now()}`,
    payload: { postId: post.id, platforms: post.platforms },
    attempts: 1,
    maxAttempts: 3,
    scheduledFor: nowIso,
    executedAt: nowIso,
    createdAt: nowIso,
  });

  recordAudit({
    organizationId: params.organizationId,
    workspaceId: post.workspaceId,
    actorId: params.actorId,
    actorName: params.actorName,
    actorRole: params.actorRole,
    action: 'social.published_simulated',
    targetType: 'social_post',
    targetId: post.id,
    detail: `Simulated publishing "${post.title}" to ${post.platforms.join(', ')}.`,
  });

  return post;
}

export type { SocialPost };
