import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type { BrandKit, CampaignMetrics } from '../../shared/types.ts';
import { logSafe } from '../utils/security.ts';

export interface AIGenerationResult {
  text: string;
  provider: string;
  model: string;
  isSimulated: boolean;
}

export interface LeadCriteriaResult {
  industries: string[];
  geography: string[];
  companySize: string;
  jobTitles: string[];
  keywords: string[];
  provider: string;
  isSimulated: boolean;
}

export interface AIProvider {
  readonly name: string;
  isConfigured(): boolean;
  generateMarketingCopy(input: {
    kind: 'email_body' | 'email_subject' | 'email_rewrite' | 'social_variations' | 'campaign_ideas';
    prompt: string;
    tone?: string;
    objective?: string;
    brandKit?: BrandKit | null;
  }): Promise<AIGenerationResult>;
  parseLeadDiscoveryIntent(prompt: string): Promise<LeadCriteriaResult>;
  explainCampaignPerformance(input: {
    campaignName: string;
    metrics: CampaignMetrics;
  }): Promise<AIGenerationResult>;
}

function buildBrandContext(brandKit?: BrandKit | null): string {
  if (!brandKit) {
    return 'Brand: DEX Marketing by Colakin. Voice: Authoritative, clear B2B SaaS. Avoid exaggerated hype.';
  }
  return [
    `Brand: ${brandKit.name}`,
    `Voice: ${brandKit.voice}`,
    `Tone: ${brandKit.tone}`,
    `Target Audience: ${brandKit.targetAudience}`,
    `Messaging Guidelines: ${brandKit.messagingGuidelines}`,
    brandKit.approvedCtas.length ? `Approved CTAs: ${brandKit.approvedCtas.join(', ')}` : '',
    brandKit.prohibitedPhrases.length ? `Prohibited Phrases (NEVER USE): ${brandKit.prohibitedPhrases.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export class GeminiAIProvider implements AIProvider {
  public readonly name = 'gemini';

  isConfigured(): boolean {
    return Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0);
  }

  private getClient(): GoogleGenAI {
    return new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }

  async generateMarketingCopy(input: {
    kind: 'email_body' | 'email_subject' | 'email_rewrite' | 'social_variations' | 'campaign_ideas';
    prompt: string;
    tone?: string;
    objective?: string;
    brandKit?: BrandKit | null;
  }): Promise<AIGenerationResult> {
    const ai = this.getClient();
    const model = 'gemini-4-hydrogen';
    const systemInstruction = [
      'You are the DEX Marketing AI Assistant inside an enterprise B2B marketing operations platform.',
      'Produce crisp, publication-ready marketing copy strictly following the brand guidelines.',
      'When generating email HTML, use clean semantic HTML (<p>, <h2>, <ul>, <a>) with {{first_name}} and {{company}} personalization placeholders where natural. Do not wrap in markdown code fences.',
      buildBrandContext(input.brandKit),
    ].join('\n\n');

    const userPrompt = [
      `Task Type: ${input.kind}`,
      input.tone ? `Desired Tone: ${input.tone}` : '',
      input.objective ? `Campaign Objective: ${input.objective}` : '',
      `Instructions: ${input.prompt}`,
    ]
      .filter(Boolean)
      .join('\n');

    const response = await ai.models.generateContent({
      model,
      contents: userPrompt,
      config: {
        systemInstruction,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    return {
      text: (response.text ?? '').trim(),
      provider: 'gemini',
      model,
      isSimulated: false,
    };
  }

  async parseLeadDiscoveryIntent(prompt: string): Promise<LeadCriteriaResult> {
    const ai = this.getClient();
    const model = 'gemini-4-hydrogen';
    const response = await ai.models.generateContent({
      model,
      contents: `Convert this B2B lead discovery query into structured targeting filters:\n"${prompt}"`,
      config: {
        systemInstruction: 'Extract structured B2B targeting criteria accurately without inventing companies.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            industries: { type: Type.ARRAY, items: { type: Type.STRING } },
            geography: { type: Type.ARRAY, items: { type: Type.STRING } },
            companySize: { type: Type.STRING },
            jobTitles: { type: Type.ARRAY, items: { type: Type.STRING } },
            keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
        },
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim()) as Partial<LeadCriteriaResult>;
    return {
      industries: parsed.industries ?? ['Technology'],
      geography: parsed.geography ?? ['Global'],
      companySize: parsed.companySize ?? '20-200 employees',
      jobTitles: parsed.jobTitles ?? ['Marketing Director', 'VP Engineering'],
      keywords: parsed.keywords ?? ['B2B', 'SaaS'],
      provider: 'gemini',
      isSimulated: false,
    };
  }

  async explainCampaignPerformance(input: {
    campaignName: string;
    metrics: CampaignMetrics;
  }): Promise<AIGenerationResult> {
    const ai = this.getClient();
    const model = 'gemini-4-hydrogen';
    const response = await ai.models.generateContent({
      model,
      contents: `Analyze this email campaign performance strictly from the provided metrics (never invent numbers):\nCampaign: ${input.campaignName}\nMetrics: ${JSON.stringify(input.metrics)}`,
      config: {
        systemInstruction: 'Provide 3 concise, actionable marketing ops observations grounded solely in the provided numbers.',
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });
    return {
      text: (response.text ?? '').trim(),
      provider: 'gemini',
      model,
      isSimulated: false,
    };
  }
}

export class DemoAIProvider implements AIProvider {
  public readonly name = 'demo-fallback';

  isConfigured(): boolean {
    return true;
  }

  async generateMarketingCopy(input: {
    kind: 'email_body' | 'email_subject' | 'email_rewrite' | 'social_variations' | 'campaign_ideas';
    prompt: string;
    tone?: string;
    objective?: string;
    brandKit?: BrandKit | null;
  }): Promise<AIGenerationResult> {
    const brandName = input.brandKit?.name ?? 'Colakin DeX';
    const cta = input.brandKit?.approvedCtas?.[0] ?? 'Book an Architecture Walkthrough';
    const toneNote = input.tone ? ` (${input.tone} tone)` : '';

    if (input.kind === 'email_subject') {
      return {
        text: [
          `1. How {{company}} can streamline ${input.prompt.slice(0, 36)} with ${brandName}`,
          `2. {{first_name}}, a practical workflow brief for {{company}}`,
          `3. Measurable results for {{job_title|leaders}} in {{location}}`,
        ].join('\n'),
        provider: 'demo-fallback',
        model: 'deterministic-template-v1',
        isSimulated: true,
      };
    }

    if (input.kind === 'social_variations') {
      return {
        text: JSON.stringify(
          {
            linkedin: {
              content: `${input.prompt}\n\nInside ${brandName}, teams connect MCP CRM records, compliant email workflows, and human-reviewed publishing in one platform.${toneNote}`,
              hashtags: ['#MarketingOps', '#Colakin', '#DeXPlatform', '#B2BGrowth'],
              cta,
            },
            instagram: {
              content: `Smarter campaign workflows for modern teams. ${input.prompt.slice(0, 90)}`,
              hashtags: ['#ColakinDeX', '#MarketingAutomation', '#SaaS'],
              cta: 'Learn more via link in bio',
            },
            x: {
              content: `${input.prompt.slice(0, 140)} — unified governance & analytics in DeX Marketing. #MarketingOps`,
              hashtags: ['#MarketingOps', '#DeX'],
              cta,
            },
            facebook: {
              content: `${input.prompt} Built with enterprise compliance and role-based approvals.`,
              hashtags: ['#Colakin', '#DigitalMarketing'],
              cta,
            },
            youtube: {
              content: `Overview: ${input.prompt}\n\nExplore how DEX Marketing by Colakin unifies multi-tenant campaigns, MCP CRM connectors, and analytics.`,
              hashtags: ['#ColakinDeX', '#MarketingOps'],
              cta,
            },
          },
          null,
          2
        ),
        provider: 'demo-fallback',
        model: 'deterministic-template-v1',
        isSimulated: true,
      };
    }

    return {
      text: `<h2>Hello {{first_name}},</h2>\n<p>We prepared a focused update for <strong>{{company}}</strong> regarding ${input.prompt}.</p>\n<p>Using ${brandName}, teams coordinate audience segmentation, consent compliance, and multi-channel execution without brittle spreadsheets.</p>\n<p><a href="https://colakin.com/dex-marketing">${cta}</a></p>`,
      provider: 'demo-fallback',
      model: 'deterministic-template-v1',
      isSimulated: true,
    };
  }

  async parseLeadDiscoveryIntent(prompt: string): Promise<LeadCriteriaResult> {
    const lower = prompt.toLowerCase();
    const industries: string[] = [];
    if (lower.includes('saas') || lower.includes('tech') || lower.includes('software')) industries.push('B2B SaaS');
    if (lower.includes('health') || lower.includes('med')) industries.push('Healthcare');
    if (lower.includes('fin')) industries.push('FinTech');
    if (industries.length === 0) industries.push('B2B Services', 'Technology');

    const geography: string[] = [];
    if (lower.includes('chennai')) geography.push('Chennai');
    if (lower.includes('bengaluru') || lower.includes('bangalore')) geography.push('Bengaluru');
    if (lower.includes('india')) geography.push('India');
    if (lower.includes('usa') || lower.includes('us')) geography.push('United States');
    if (geography.length === 0) geography.push('India', 'APAC');

    const jobTitles: string[] = [];
    if (lower.includes('founder') || lower.includes('ceo')) jobTitles.push('Founder & CEO');
    if (lower.includes('marketing')) jobTitles.push('Head of Marketing', 'Marketing Manager');
    if (jobTitles.length === 0) jobTitles.push('VP of Growth', 'Marketing Director');

    const sizeMatch = prompt.match(/\d+\s*[-–to]+\s*\d+/i);

    return {
      industries,
      geography,
      companySize: sizeMatch ? `${sizeMatch[0]} employees` : '20-100 employees',
      jobTitles,
      keywords: prompt
        .split(/\s+/)
        .filter((w) => w.length > 4)
        .slice(0, 5),
      provider: 'demo-fallback',
      isSimulated: true,
    };
  }

  async explainCampaignPerformance(input: {
    campaignName: string;
    metrics: CampaignMetrics;
  }): Promise<AIGenerationResult> {
    const m = input.metrics;
    const delivery = m.deliveryRate !== null ? `${(m.deliveryRate * 100).toFixed(1)}%` : 'N/A';
    const open = m.openRate !== null ? `${(m.openRate * 100).toFixed(1)}%` : 'N/A';
    const click = m.clickRate !== null ? `${(m.clickRate * 100).toFixed(1)}%` : 'N/A';

    return {
      text: [
        `Campaign "${input.campaignName}" Summary (Demo Analysis):`,
        `• Delivery efficiency stands at ${delivery} (${m.delivered}/${m.sent} delivered, ${m.bounced} bounced).`,
        `• Engagement reached ${open} unique open rate and ${click} unique click rate (note: pixel-based opens may be affected by privacy proxies).`,
        `• Recommendation: Follow up with high-intent clickers via the MCP CRM workflow and prune bounced addresses in the Compliance Center.`,
      ].join('\n'),
      provider: 'demo-fallback',
      model: 'deterministic-template-v1',
      isSimulated: true,
    };
  }
}

export class AIServiceFacade {
  private gemini = new GeminiAIProvider();
  private demo = new DemoAIProvider();

  getStatus() {
    const preferred = (process.env.AI_PROVIDER || 'gemini').toLowerCase();
    return {
      preferredProvider: preferred,
      providers: [
        { id: 'gemini', name: 'Google Gemini (gemini-4-hydrogen)', configured: this.gemini.isConfigured(), freeTier: true },
        { id: 'groq', name: 'Groq Free Tier', configured: Boolean(process.env.GROQ_API_KEY), freeTier: true },
        { id: 'openrouter', name: 'OpenRouter Free Models', configured: Boolean(process.env.OPENROUTER_API_KEY), freeTier: true },
        { id: 'ollama', name: 'Ollama Local LLM', configured: Boolean(process.env.OLLAMA_BASE_URL), freeTier: true },
        { id: 'demo-fallback', name: 'Deterministic Demo Assistant', configured: true, freeTier: true },
      ],
    };
  }

  private async runWithFallback<T>(
    liveFn: () => Promise<T>,
    fallbackFn: () => Promise<T>
  ): Promise<T> {
    if (this.gemini.isConfigured()) {
      try {
        return await liveFn();
      } catch (err) {
        logSafe('warn', 'ai.gemini_fallback', {
          reason: err instanceof Error ? err.message : 'Gemini call failed',
        });
      }
    }
    return fallbackFn();
  }

  generateMarketingCopy(input: Parameters<AIProvider['generateMarketingCopy']>[0]) {
    return this.runWithFallback(
      () => this.gemini.generateMarketingCopy(input),
      () => this.demo.generateMarketingCopy(input)
    );
  }

  parseLeadDiscoveryIntent(prompt: string) {
    return this.runWithFallback(
      () => this.gemini.parseLeadDiscoveryIntent(prompt),
      () => this.demo.parseLeadDiscoveryIntent(prompt)
    );
  }

  explainCampaignPerformance(input: Parameters<AIProvider['explainCampaignPerformance']>[0]) {
    return this.runWithFallback(
      () => this.gemini.explainCampaignPerformance(input),
      () => this.demo.explainCampaignPerformance(input)
    );
  }
}

export const aiFacade = new AIServiceFacade();
