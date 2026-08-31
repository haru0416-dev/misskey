/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { promises as dns } from 'node:dns';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { validateEmailDeliverability } from '@/core/email/EmailService.js';

describe('core:email:validateEmailDeliverability', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	const spyMx = (impl: () => Promise<{ exchange: string; priority: number }[]>) =>
		vi.spyOn(dns, 'resolveMx').mockImplementation(impl as unknown as typeof dns.resolveMx);

	test('使い捨てドメインは弾く', async () => {
		const mx = spyMx(async () => [{ exchange: 'mx.example.com', priority: 10 }]);
		await expect(validateEmailDeliverability('a@mailinator.com')).resolves.toStrictEqual({
			valid: false,
			reason: 'disposable',
		});
		// 一覧で弾けた時点で返る。相手側へ問い合わせを飛ばさない。
		expect(mx).not.toHaveBeenCalled();
	});

	test('大文字混じりのドメインでも使い捨てとして弾く', async () => {
		// 照合先の正規化に依存せず、不正なサブドメインを拒否することを検証する。
		spyMx(async () => [{ exchange: 'mx.example.com', priority: 10 }]);
		for (const address of ['a@MAILINATOR.COM', 'a@MailInator.Com']) {
			await expect(validateEmailDeliverability(address)).resolves.toStrictEqual({
				valid: false,
				reason: 'disposable',
			});
		}
	});

	test('使い捨てでなければ MX の有無で判定する', async () => {
		spyMx(async () => [{ exchange: 'mx.example.com', priority: 10 }]);
		await expect(validateEmailDeliverability('a@example.com')).resolves.toStrictEqual({
			valid: true,
			reason: null,
		});

		spyMx(async () => []);
		await expect(validateEmailDeliverability('a@example.com')).resolves.toStrictEqual({
			valid: false,
			reason: 'mx',
		});

		spyMx(async () => {
			throw new Error('ENOTFOUND');
		});
		await expect(validateEmailDeliverability('a@example.com')).resolves.toStrictEqual({
			valid: false,
			reason: 'mx',
		});
	});

	test('ドメインを取り出せない入力は mx 扱いにする', async () => {
		const mx = spyMx(async () => [{ exchange: 'mx.example.com', priority: 10 }]);
		for (const address of ['not-an-address', 'a@', '']) {
			await expect(validateEmailDeliverability(address)).resolves.toStrictEqual({ valid: false, reason: 'mx' });
		}
		expect(mx).not.toHaveBeenCalled();
	});
});
