/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as crypto from 'node:crypto';
import { describe, expect, test } from 'vitest';
import fc from 'fast-check';
import {
	HttpSignatureError,
	parseRequestSignature,
	verifyRequestSignature,
	type SignatureTargetRequest,
} from '@/core/activitypub/http-signature.js';

const SIGNING_TARGET = '(request-target) host date digest';

function signatureHeader(params: Record<string, string>): string {
	return Object.entries(params)
		.map(([k, v]) => `${k}="${v}"`)
		.join(',');
}

function requestOf(overrides: Partial<SignatureTargetRequest> = {}): SignatureTargetRequest {
	return {
		method: 'POST',
		url: '/inbox',
		headers: {
			host: 'example.com',
			date: 'Wed, 27 Aug 2026 00:00:00 GMT',
			digest: 'SHA-256=abc',
			...overrides.headers,
		},
		...(overrides.method == null ? {} : { method: overrides.method }),
		...(overrides.url == null ? {} : { url: overrides.url }),
	};
}

describe('core:activitypub:http-signature', () => {
	describe('parseRequestSignature', () => {
		test('署名対象の文字列を仕様どおり組み立てる', () => {
			const request = requestOf({
				headers: {
					signature: signatureHeader({
						keyId: 'https://remote.example/users/a#main-key',
						algorithm: 'rsa-sha256',
						headers: SIGNING_TARGET,
						signature: 'AAAA',
					}),
				},
			});

			const parsed = parseRequestSignature(request);
			expect(parsed.keyId).toBe('https://remote.example/users/a#main-key');
			expect(parsed.headers).toStrictEqual(['(request-target)', 'host', 'date', 'digest']);
			expect(parsed.signingString).toBe(
				[
					'(request-target): post /inbox',
					'host: example.com',
					'date: Wed, 27 Aug 2026 00:00:00 GMT',
					'digest: SHA-256=abc',
				].join('\n'),
			);
		});

		test('(request-target) にはクエリまで含める', () => {
			const parsed = parseRequestSignature(
				requestOf({
					url: '/inbox?sharedInbox=true',
					headers: {
						signature: signatureHeader({
							keyId: 'k',
							algorithm: 'rsa-sha256',
							headers: '(request-target)',
							signature: 'A',
						}),
					},
				}),
			);
			expect(parsed.signingString).toBe('(request-target): post /inbox?sharedInbox=true');
		});

		test('headers を省略すると date だけが対象になる', () => {
			const parsed = parseRequestSignature(
				requestOf({ headers: { signature: signatureHeader({ keyId: 'k', algorithm: 'rsa-sha256', signature: 'A' }) } }),
			);
			expect(parsed.headers).toStrictEqual(['date']);
			expect(parsed.signingString).toBe('date: Wed, 27 Aug 2026 00:00:00 GMT');
		});

		test('必須パラメータが欠けていれば弾く', () => {
			for (const params of [
				{ algorithm: 'rsa-sha256', signature: 'A' },
				{ keyId: 'k', signature: 'A' },
				{ keyId: 'k', algorithm: 'rsa-sha256' },
			]) {
				expect(() => parseRequestSignature(requestOf({ headers: { signature: signatureHeader(params) } }))).toThrow(
					HttpSignatureError,
				);
			}
		});

		test('署名ヘッダが無ければ弾く', () => {
			expect(() => parseRequestSignature(requestOf())).toThrow(HttpSignatureError);
			expect(() => parseRequestSignature(requestOf({ headers: { signature: '' } }))).toThrow(HttpSignatureError);
		});

		test('知らないアルゴリズムは弾く', () => {
			// 弱いアルゴリズムを名乗られて通してしまわないこと。
			for (const algorithm of ['rsa-md5', 'hmac-sha256', 'none', 'rsa-sha1']) {
				expect(() =>
					parseRequestSignature(
						requestOf({ headers: { signature: signatureHeader({ keyId: 'k', algorithm, signature: 'A' }) } }),
					),
				).toThrow(HttpSignatureError);
			}
		});

		test('署名対象に挙げたヘッダがリクエストに無ければ弾く', () => {
			// 送信側が署名した内容と検証側が組み立てる内容がずれるのを防ぐ。
			expect(() =>
				parseRequestSignature(
					requestOf({
						headers: {
							signature: signatureHeader({
								keyId: 'k',
								algorithm: 'rsa-sha256',
								headers: 'date x-missing',
								signature: 'A',
							}),
						},
					}),
				),
			).toThrow(HttpSignatureError);
		});

		test('どんな署名ヘッダでも例外以外で壊れない', () => {
			fc.assert(
				fc.property(fc.string({ maxLength: 200 }), (header) => {
					try {
						parseRequestSignature(requestOf({ headers: { signature: header } }));
					} catch (err) {
						expect(err).toBeInstanceOf(HttpSignatureError);
					}
				}),
				{ numRuns: 500 },
			);
		});
	});

	describe('verifyRequestSignature', () => {
		const sign = (pem: crypto.KeyObject, signingString: string, ed = false) =>
			crypto.sign(ed ? null : 'sha256', Buffer.from(signingString), pem).toString('base64');

		test('RSA の正しい署名を通す', async () => {
			const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
			const pem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
			const signingString = 'date: Wed, 27 Aug 2026 00:00:00 GMT';

			const parsed = {
				keyId: 'k',
				algorithm: 'rsa-sha256',
				headers: ['date'],
				signingString,
				signature: sign(privateKey, signingString),
			};
			await expect(verifyRequestSignature(parsed, pem)).resolves.toBe(true);
		});

		test('Ed25519 の署名も通す', async () => {
			const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
			const pem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
			const signingString = 'date: Wed, 27 Aug 2026 00:00:00 GMT';

			const parsed = {
				keyId: 'k',
				algorithm: 'ed25519',
				headers: ['date'],
				signingString,
				signature: sign(privateKey, signingString, true),
			};
			await expect(verifyRequestSignature(parsed, pem)).resolves.toBe(true);
		});

		test('署名対象を 1 文字でも変えたら通さない', async () => {
			const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
			const pem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
			const signingString = 'date: Wed, 27 Aug 2026 00:00:00 GMT';
			const signature = sign(privateKey, signingString);

			await expect(
				verifyRequestSignature(
					{ keyId: 'k', algorithm: 'rsa-sha256', headers: ['date'], signingString: signingString + ' ', signature },
					pem,
				),
			).resolves.toBe(false);
		});

		test('別の鍵の署名は通さない', async () => {
			const a = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
			const b = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
			const signingString = 'date: Wed, 27 Aug 2026 00:00:00 GMT';

			const parsed = {
				keyId: 'k',
				algorithm: 'rsa-sha256',
				headers: ['date'],
				signingString,
				signature: sign(a.privateKey, signingString),
			};
			await expect(
				verifyRequestSignature(parsed, b.publicKey.export({ type: 'spki', format: 'pem' }) as string),
			).resolves.toBe(false);
		});

		test('壊れた署名や鍵では例外を投げず false を返す', async () => {
			const { publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
			const pem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
			const base = { keyId: 'k', algorithm: 'rsa-sha256', headers: ['date'], signingString: 'date: x' };

			await expect(verifyRequestSignature({ ...base, signature: 'not-base64!!' }, pem)).resolves.toBe(false);
			await expect(verifyRequestSignature({ ...base, signature: '' }, pem)).resolves.toBe(false);
			await expect(verifyRequestSignature({ ...base, signature: 'AAAA' }, 'not a pem')).resolves.toBe(false);
		});
	});
});
