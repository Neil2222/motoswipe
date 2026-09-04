import { describe, expect, it } from 'vitest';
import { passwordResetMail, verifyEmailMail } from './templates';

describe('mail templates', () => {
	it('puts the reset link in both the text and the html body', () => {
		const mail = passwordResetMail({
			to: 'rider@example.test',
			displayName: 'Rider',
			resetUrl: 'https://moto.example/reset-password/abc123',
			expiresInMinutes: 60
		});
		expect(mail.to).toBe('rider@example.test');
		expect(mail.text).toContain('https://moto.example/reset-password/abc123');
		expect(mail.html).toContain('href="https://moto.example/reset-password/abc123"');
		expect(mail.text).toContain('60 minutes');
	});

	it('escapes html in names so a display name cannot inject markup', () => {
		const mail = verifyEmailMail({
			to: 'rider@example.test',
			displayName: '<script>alert(1)</script>',
			verifyUrl: 'https://moto.example/verify-email/tok',
			expiresInHours: 72
		});
		expect(mail.html).not.toContain('<script>');
		expect(mail.html).toContain('&lt;script&gt;');
		expect(mail.text).toContain('72 hours');
	});

	it('names the sending host rather than a hard-coded one', () => {
		const mail = verifyEmailMail({
			to: 'a@b.test',
			displayName: 'A',
			verifyUrl: 'https://motoswipe.example.org/verify-email/x',
			expiresInHours: 1
		});
		expect(mail.html).toContain('motoswipe.example.org');
	});
});
