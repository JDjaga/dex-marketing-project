import { logSafe, sanitizeEmailHtml, validateSafeExternalUrl } from '../utils/security.ts';

export interface OutboundEmailPayload {
  sendId: string;
  to: string;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  trackOpens: boolean;
  trackClicks: boolean;
  appBaseUrl: string;
  unsubscribeUrl: string;
}

export interface EmailSendResult {
  success: boolean;
  simulated: boolean;
  provider: 'mock' | 'resend' | 'smtp';
  providerMessageId: string;
  error?: string;
}

export function instrumentEmailHtml(payload: OutboundEmailPayload): string {
  let html = sanitizeEmailHtml(payload.htmlBody);

  // Wrap validated https/http links with click tracking redirect
  if (payload.trackClicks) {
    html = html.replace(/href="(https?:\/\/[^"]+)"/gi, (_m, rawUrl: string) => {
      const check = validateSafeExternalUrl(rawUrl);
      if (!check.valid) return 'href="#blocked-unsafe-url"';
      const encoded = encodeURIComponent(rawUrl);
      return `href="${payload.appBaseUrl}/t/click/${payload.sendId}?url=${encoded}"`;
    });
  }

  // Append required compliance unsubscribe footer
  const unsubFooter = `<hr style="margin-top:24px;border:none;border-top:1px solid #e2e8f0;" /><p style="font-size:12px;color:#64748b;">Sent via DEX Marketing by Colakin. <a href="${payload.unsubscribeUrl}">Unsubscribe or manage preferences</a>.</p>`;
  html = `${html}\n${unsubFooter}`;

  // Append 1x1 tracking pixel when open tracking is enabled
  if (payload.trackOpens) {
    html += `\n<img src="${payload.appBaseUrl}/t/open/${payload.sendId}.png" width="1" height="1" alt="" style="display:none;" />`;
  }

  return html;
}

export class EmailProviderRouter {
  getStatus() {
    const provider = (process.env.EMAIL_PROVIDER || 'mock').toLowerCase();
    const resendReady = Boolean(process.env.RESEND_API_KEY);
    const smtpReady = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER);
    return {
      activeProvider:
        provider === 'resend' && resendReady
          ? 'resend'
          : provider === 'smtp' && smtpReady
            ? 'smtp'
            : 'mock',
      resendConfigured: resendReady,
      smtpConfigured: smtpReady,
      simulationMode: !(
        (provider === 'resend' && resendReady) ||
        (provider === 'smtp' && smtpReady)
      ),
    };
  }

  async sendEmail(payload: OutboundEmailPayload): Promise<EmailSendResult> {
    const status = this.getStatus();
    const finalHtml = instrumentEmailHtml(payload);

    if (status.activeProvider === 'resend' && process.env.RESEND_API_KEY) {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: `${payload.fromName} <${payload.fromEmail}>`,
            to: [payload.to],
            reply_to: payload.replyTo,
            subject: payload.subject,
            html: finalHtml,
            text: payload.textBody,
            headers: {
              'List-Unsubscribe': `<${payload.unsubscribeUrl}>`,
            },
          }),
        });
        if (!res.ok) {
          const text = await res.text();
          return {
            success: false,
            simulated: false,
            provider: 'resend',
            providerMessageId: '',
            error: `Resend API error ${res.status}: ${text}`,
          };
        }
        const data = (await res.json()) as { id?: string };
        return {
          success: true,
          simulated: false,
          provider: 'resend',
          providerMessageId: data.id || `resend_${payload.sendId}`,
        };
      } catch (err) {
        logSafe('error', 'email.resend_failed', { error: err instanceof Error ? err.message : 'unknown' });
        return {
          success: false,
          simulated: false,
          provider: 'resend',
          providerMessageId: '',
          error: err instanceof Error ? err.message : 'Resend request failed',
        };
      }
    }

    // Transparent simulation mode (never claims real external delivery)
    return {
      success: true,
      simulated: true,
      provider: 'mock',
      providerMessageId: `sim_msg_${payload.sendId}`,
    };
  }
}

export const emailProvider = new EmailProviderRouter();
