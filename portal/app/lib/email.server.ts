import { env } from '~/lib/env.server';

/** Escape a string for interpolation into HTML text or attribute values. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Best-effort notices; required verification delivery fails visibly instead of pretending success. */
export async function sendEmail(opts: { to: string; subject: string; html: string; required?: boolean }): Promise<void> {
  const { resendApiKey, emailFrom } = env();
  if (!resendApiKey) {
    if (opts.required) throw new Error('Email verification is temporarily unavailable. Please contact support.');
    console.info('[email] skipped (no RESEND_API_KEY):', opts.to, opts.subject);
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: emailFrom,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
    }),
  });
  if (!res.ok) {
    console.warn('[email] Resend failed', res.status);
    if (opts.required) throw new Error('Could not send the verification email. Please try again.');
  }
}

export async function sendInviteEmail(to: string, inviteUrl: string, orgName: string) {
  await sendEmail({
    to,
    subject: `Join ${orgName} on CanCoder`,
    html: `<p>You have been invited to <strong>${escapeHtml(orgName)}</strong> on CanCoder.</p>
           <p><a href="${escapeHtml(inviteUrl)}">Accept invitation</a></p>`,
  });
}

export async function sendFuseWarningEmail(to: string, count: number, limit: number) {
  await sendEmail({
    to,
    subject: 'CanCoder usage fuse warning',
    html: `<p>Your organization used <strong>${count}</strong> of <strong>${limit}</strong> Billable units this UTC month.</p>
           <p>Hard-block fuse is active unless soft-warn is enabled in the portal.</p>`,
  });
}
