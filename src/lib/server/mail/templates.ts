import type { MailMessage } from './mailer';

/**
 * The two messages MotoSwipe sends. Plain text first, HTML as a courtesy: both
 * carry the same words, and neither loads a remote image or script.
 */

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}

function layout(
	title: string,
	paragraphs: string[],
	link: { href: string; label: string }
): string {
	const body = paragraphs.map((p) => `<p style="margin:0 0 16px">${escapeHtml(p)}</p>`).join('');
	const href = escapeHtml(link.href);
	const host = escapeHtml(new URL(link.href).host);
	return [
		'<!doctype html>',
		'<html lang="en">',
		'<body style="margin:0;background:#07080a;color:#eef0f3;font-family:ui-sans-serif,system-ui,Segoe UI,Roboto,Arial,sans-serif;font-size:15px;line-height:1.55">',
		'<div style="max-width:520px;margin:0 auto;padding:32px 24px">',
		'<p style="margin:0 0 24px;font-size:18px;font-weight:700;letter-spacing:-0.02em">Moto<span style="color:#ff6a1f">Swipe</span></p>',
		`<h1 style="margin:0 0 20px;font-size:22px;line-height:1.2">${escapeHtml(title)}</h1>`,
		body,
		`<p style="margin:24px 0"><a href="${href}" style="display:inline-block;background:#ff6a1f;color:#0a0a0a;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:8px">${escapeHtml(link.label)}</a></p>`,
		'<p style="margin:0 0 8px;color:#a8aeb8;font-size:13px">If the button does not work, copy this address into your browser:</p>',
		`<p style="margin:0 0 24px;word-break:break-all;font-size:13px"><a href="${href}" style="color:#35d6e8">${href}</a></p>`,
		`<p style="margin:0;color:#6d747f;font-size:12px">MotoSwipe is self-hosted. This message was sent by the instance at ${host}.</p>`,
		'</div>',
		'</body>',
		'</html>'
	].join('\n');
}

export function passwordResetMail(input: {
	to: string;
	displayName: string;
	resetUrl: string;
	expiresInMinutes: number;
}): MailMessage {
	const paragraphs = [
		`Hi ${input.displayName},`,
		'Somebody — hopefully you — asked to reset the password for this MotoSwipe account. Use the link below to choose a new one.',
		`The link works once and expires in ${input.expiresInMinutes} minutes.`,
		'If you did not ask for this, ignore the message. Your password stays as it is.'
	];
	return {
		to: input.to,
		subject: 'Reset your MotoSwipe password',
		text: [...paragraphs.slice(0, 2), '', input.resetUrl, '', ...paragraphs.slice(2)].join('\n'),
		html: layout('Reset your password', paragraphs, {
			href: input.resetUrl,
			label: 'Choose a new password'
		})
	};
}

export function verifyEmailMail(input: {
	to: string;
	displayName: string;
	verifyUrl: string;
	expiresInHours: number;
}): MailMessage {
	const paragraphs = [
		`Hi ${input.displayName},`,
		'Confirm that this address belongs to you, so a password reset can reach you later. Nothing in MotoSwipe is locked until you do; this just closes the loop.',
		`The link expires in ${input.expiresInHours} hours.`,
		'If you did not create a MotoSwipe account, ignore this message.'
	];
	return {
		to: input.to,
		subject: 'Confirm your email address for MotoSwipe',
		text: [...paragraphs.slice(0, 2), '', input.verifyUrl, '', ...paragraphs.slice(2)].join('\n'),
		html: layout('Confirm your email address', paragraphs, {
			href: input.verifyUrl,
			label: 'Confirm address'
		})
	};
}
