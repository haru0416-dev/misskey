/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env['NODE_ENV'] = 'test';

import { describe, expect, test } from 'vitest';
import { JsonLd, canonicalizeSignatureOptions } from '@/core/activitypub/json-ld.js';
import type { HttpRequestService } from '@/core/HttpRequestService.js';

// 署名オプションの正規化は jsonld.normalize を通さない近道を持つ。近道が本物と1バイトでも
// 違えば署名が壊れ、リレー購読側で検証に失敗する。壊れても例外は出ず連合が黙って劣化するため、
// 両者の一致をテストで固定する。
describe('LD signature option canonicalization', () => {
	// 近道は外部リクエストを行わないので、HttpRequestService は使われない。
	const service = new JsonLd(null as unknown as HttpRequestService);

	const creators = [
		'https://example.com/users/9abc#main-key',
		'https://example.com:8443/users/x#main-key',
		'https://example.com/users/a?b=1&c=2#main-key',
		'https://ドメイン.jp/users/x#main-key',
	];
	const domains = [undefined, 'example.com', 'ドメイン.jp', 'x"quote', 'back\\slash'];
	const dates = ['2026-08-25T12:34:56.789Z', '1970-01-01T00:00:00.000Z'];

	for (const creator of creators) {
		for (const domain of domains) {
			for (const created of dates) {
				const label = `creator=${creator} domain=${String(domain)} created=${created}`;

				test(`近道と jsonld.normalize が一致する: ${label}`, async () => {
					const transformed: Record<string, unknown> = {
						'@context': 'https://w3id.org/identity/v1',
						creator,
						nonce: 'deadbeefdeadbeefdeadbeefdeadbeef',
						created,
						...(domain === undefined ? {} : { domain }),
					};

					const shortcut = canonicalizeSignatureOptions(transformed);
					const canonical = await service.normalize(transformed as never);

					expect(shortcut).not.toBeNull();
					expect(shortcut).toBe(canonical.toString());
				});
			}
		}
	}
});
