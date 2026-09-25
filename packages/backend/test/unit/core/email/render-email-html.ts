/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { renderEmailHtml } from '@/core/email/EmailService.js';

// admin/send-email はモデレーターが書いた本文と件名をそのまま渡すので、サーバー名義のメールに
// 任意の HTML を混ぜられないことを見る。
describe('renderEmailHtml', () => {
	const render = (subject: string, html: string) =>
		renderEmailHtml({
			subject,
			html,
			logoUrl: 'https://example.com/logo.png',
			emailSettingUrl: 'https://example.com/settings/email',
			instanceUrl: 'https://example.com',
			host: 'example.com',
		});

	test('通知メールが使う改行とリンクは残す', () => {
		const out = render('Password reset requested', 'click:<br><a href="https://example.com/reset/abc">link</a>');
		expect(out).toContain('<br />');
		expect(out).toMatch(/<a href="https:\/\/example\.com\/reset\/abc" style="[^"]*">link<\/a>/);
	});

	test('本文のスクリプト・イベント属性・javascript: リンク・外部画像は落とす', () => {
		const out = render(
			'hi',
			'<script>alert(1)</script><img src="https://evil.example/x.png" onerror="alert(1)"><a href="javascript:alert(1)">x</a><form action="https://evil.example"><input name="password"></form>',
		);
		const body = out.slice(out.indexOf('<article'), out.indexOf('</article>'));
		expect(body).not.toMatch(/<script|<img|onerror|javascript:|<form|<input/);
	});

	test('件名は HTML として解釈させない', () => {
		const out = render('<img src=x onerror=alert(1)>', 'body');
		expect(out).not.toContain('<img src=x');
		expect(out).toContain('&lt;img src=x onerror=alert(1)&gt;');
	});
});
