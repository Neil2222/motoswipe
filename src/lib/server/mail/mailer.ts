import { env } from '../env';

/**
 * Outbound email.
 *
 * MotoSwipe sends exactly two kinds of message — a password-reset link and an
 * address-verification link — and neither is worth an SMTP server on a NAS.
 * Delivery goes through Resend's HTTP API when a key is configured; otherwise
 * messages are printed to the server log in development and dropped, loudly,
 * in production. Nothing else in the codebase knows which of the three it is:
 * callers ask `mailer.enabled` and call `send`.
 *
 * The Resend client is a single `fetch`; their SDK would add a dependency for
 * one POST and tie the app to a package that tracks their whole product.
 */

export interface MailMessage {
	to: string;
	subject: string;
	/** Plain-text body. Always present: it is what a text-only client shows. */
	text: string;
	/** Optional HTML alternative. */
	html?: string;
}

export interface MailResult {
	ok: boolean;
	/** Provider message id when available. */
	id?: string;
	error?: string;
}

export type MailProvider = 'resend' | 'console' | 'none';

export interface Mailer {
	readonly provider: MailProvider;
	/** False when sending would silently do nothing; UI hides email features. */
	readonly enabled: boolean;
	send(message: MailMessage): Promise<MailResult>;
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

class ResendMailer implements Mailer {
	readonly provider = 'resend' as const;
	readonly enabled = true;

	constructor(
		private readonly apiKey: string,
		private readonly from: string
	) {}

	async send(message: MailMessage): Promise<MailResult> {
		let response: Response;
		try {
			response = await fetch(RESEND_ENDPOINT, {
				method: 'POST',
				headers: {
					authorization: `Bearer ${this.apiKey}`,
					'content-type': 'application/json'
				},
				body: JSON.stringify({
					from: this.from,
					to: [message.to],
					subject: message.subject,
					text: message.text,
					...(message.html ? { html: message.html } : {})
				})
			});
		} catch (error) {
			return { ok: false, error: error instanceof Error ? error.message : String(error) };
		}

		if (!response.ok) {
			// Resend answers with a JSON body describing the problem; keep that
			// but never the key or the recipient in the log line.
			const detail = await response.text().catch(() => '');
			return {
				ok: false,
				error: `Resend responded ${response.status}: ${detail.slice(0, 300)}`
			};
		}

		const body = (await response.json().catch(() => ({}))) as { id?: string };
		return { ok: true, id: body.id };
	}
}

/** Development: the message goes to stdout so the link can be clicked. */
class ConsoleMailer implements Mailer {
	readonly provider = 'console' as const;
	readonly enabled = true;

	async send(message: MailMessage): Promise<MailResult> {
		const indented = message.text
			.split('\n')
			.map((line) => `  ${line}`)
			.join('\n');
		console.log(
			`[motoswipe] mail (console provider — not delivered)\n  to:      ${message.to}\n  subject: ${message.subject}\n\n${indented}\n`
		);
		return { ok: true, id: `console-${Date.now()}` };
	}
}

/** No delivery configured. Features that need email hide themselves. */
class NullMailer implements Mailer {
	readonly provider = 'none' as const;
	readonly enabled = false;

	async send(): Promise<MailResult> {
		return { ok: false, error: 'No mail provider is configured (set RESEND_API_KEY).' };
	}
}

function build(): Mailer {
	const provider = env.mailProvider;
	if (provider === 'resend') return new ResendMailer(env.resendApiKey, env.mailFrom);
	if (provider === 'console') return new ConsoleMailer();
	return new NullMailer();
}

let instance: Mailer | null = null;

/** The configured mailer. Built lazily so importing this module never throws. */
export function getMailer(): Mailer {
	instance ??= build();
	return instance;
}

/** Tests swap a recording mailer in; production never calls this. */
export function setMailerForTests(mailer: Mailer | null): void {
	instance = mailer;
}
