/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { verifyRequestSignature, type ParsedSignature } from '@/core/activitypub/http-signature.js';

import { genRsaKeyPair } from '@/misc/gen-key-pair.js';
import { ApRequestCreator } from '@/core/activitypub/ap-request.js';
import { assertActivityMatchesUrl, FetchAllowSoftFailMask } from '@/core/activitypub/misc/check-against-url.js';
import { IObject } from '@/core/activitypub/type.js';

export const buildParsedSignature = (signingString: string, signature: string, algorithm: string): ParsedSignature => {
	return {
		keyId: 'KeyID', // 署名検証では使わないダミー値
		algorithm,
		headers: ['(request-target)', 'date', 'host', 'digest'], // 署名検証では使わないダミー値
		signature,
		signingString,
	};
};

function cartesianProduct<T, U>(a: T[], b: U[]): [T, U][] {
	return a.flatMap((a) => b.map((b) => [a, b] as [T, U]));
}

describe('ap-request', () => {
	test('createSignedPost with verify', async () => {
		const keypair = await genRsaKeyPair();
		const key = { keyId: 'x', privateKeyPem: keypair.privateKey };
		const url = 'https://example.com/inbox?sharedInbox=true';
		const activity = { a: 1 };
		const body = JSON.stringify(activity);
		const headers = {
			'User-Agent': 'UA',
		};

		const req = await ApRequestCreator.createSignedPost({ key, url, body, additionalHeaders: headers });

		const parsed = buildParsedSignature(req.signingString, req.signature, 'rsa-sha256');

		const result = await verifyRequestSignature(parsed, keypair.publicKey);
		expect(result).toStrictEqual(true);
		expect(req.signingString).toMatch(/^\(request-target\): post \/inbox\?sharedInbox=true$/m);
	});

	test('createSignedGet with verify', async () => {
		const keypair = await genRsaKeyPair();
		const key = { keyId: 'x', privateKeyPem: keypair.privateKey };
		const url = 'https://example.com/outbox?page=true';
		const headers = {
			'User-Agent': 'UA',
		};

		const req = await ApRequestCreator.createSignedGet({ key, url, additionalHeaders: headers });

		const parsed = buildParsedSignature(req.signingString, req.signature, 'rsa-sha256');

		const result = await verifyRequestSignature(parsed, keypair.publicKey);
		expect(result).toStrictEqual(true);
		expect(req.signingString).toMatch(/^\(request-target\): get \/outbox\?page=true$/m);
	});

	test('rejects non matching domain', () => {
		expect(
			() =>
				assertActivityMatchesUrl(
					'https://alice.example.com/abc',
					{ id: 'https://alice.example.com/abc' } as IObject,
					'https://alice.example.com/abc',
					FetchAllowSoftFailMask.Strict,
				),
			'validation should pass base case',
		).not.toThrow();
		expect(
			() =>
				assertActivityMatchesUrl(
					'https://alice.example.com/abc',
					{ id: 'https://bob.example.com/abc' } as IObject,
					'https://alice.example.com/abc',
					FetchAllowSoftFailMask.Any,
				),
			'validation should fail no matter what if the response URL is inconsistent with the object ID',
		).toThrow();

		expect(
			() =>
				assertActivityMatchesUrl(
					'https://alice.example.com/abc#test',
					{ id: 'https://alice.example.com/abc' } as IObject,
					'https://alice.example.com/abc',
					FetchAllowSoftFailMask.Strict,
				),
			'validation should pass with hash in request URL',
		).not.toThrow();

		// www サブドメインを含む URL の組合せを検証する。
		// https://github.com/misskey-dev/misskey/issues/15039
		const withOrWithoutWWW = ['https://alice.example.com/abc', 'https://www.alice.example.com/abc'];

		cartesianProduct(cartesianProduct(withOrWithoutWWW, withOrWithoutWWW), withOrWithoutWWW).forEach(([[a, b], c]) => {
			expect(
				() => assertActivityMatchesUrl(a, { id: b } as IObject, c, FetchAllowSoftFailMask.Strict),
				'validation should pass with or without www. subdomain',
			).not.toThrow();
		});
	});

	test('cross origin lookup', () => {
		expect(
			() =>
				assertActivityMatchesUrl(
					'https://alice.example.com/abc',
					{ id: 'https://bob.example.com/abc' } as IObject,
					'https://bob.example.com/abc',
					FetchAllowSoftFailMask.CrossOrigin | FetchAllowSoftFailMask.NonCanonicalId,
				),
			'validation should pass if the response is otherwise consistent and cross-origin is allowed',
		).not.toThrow();
		expect(
			() =>
				assertActivityMatchesUrl(
					'https://alice.example.com/abc',
					{ id: 'https://bob.example.com/abc' } as IObject,
					'https://bob.example.com/abc',
					FetchAllowSoftFailMask.Strict,
				),
			'validation should fail if the response is otherwise consistent and cross-origin is not allowed',
		).toThrow();
	});

	test('rejects non-canonical ID', () => {
		expect(
			() =>
				assertActivityMatchesUrl(
					'https://alice.example.com/@alice',
					{ id: 'https://alice.example.com/users/alice' } as IObject,
					'https://alice.example.com/users/alice',
					FetchAllowSoftFailMask.Strict,
				),
			'throws if the response ID did not exactly match the expected ID',
		).toThrow();
		expect(
			() =>
				assertActivityMatchesUrl(
					'https://alice.example.com/@alice',
					{ id: 'https://alice.example.com/users/alice' } as IObject,
					'https://alice.example.com/users/alice',
					FetchAllowSoftFailMask.NonCanonicalId,
				),
			'does not throw if non-canonical ID is allowed',
		).not.toThrow();
	});

	test('origin relaxed alignment', () => {
		expect(
			() =>
				assertActivityMatchesUrl(
					'https://alice.example.com/abc',
					{ id: 'https://ap.alice.example.com/abc' } as IObject,
					'https://ap.alice.example.com/abc',
					FetchAllowSoftFailMask.MisalignedOrigin | FetchAllowSoftFailMask.NonCanonicalId,
				),
			'validation should pass if response is a subdomain of the expected origin',
		).not.toThrow();
		expect(
			() =>
				assertActivityMatchesUrl(
					'https://alice.multi-tenant.example.com/abc',
					{ id: 'https://alice.multi-tenant.example.com/abc' } as IObject,
					'https://bob.multi-tenant.example.com/abc',
					FetchAllowSoftFailMask.MisalignedOrigin | FetchAllowSoftFailMask.NonCanonicalId,
				),
			'validation should fail if response is a disjoint domain of the expected origin',
		).toThrow();
		expect(
			() =>
				assertActivityMatchesUrl(
					'https://alice.example.com/abc',
					{ id: 'https://ap.alice.example.com/abc' } as IObject,
					'https://ap.alice.example.com/abc',
					FetchAllowSoftFailMask.Strict,
				),
			'throws if relaxed origin is forbidden',
		).toThrow();
	});

	test('resist HTTP downgrade', () => {
		expect(
			() =>
				assertActivityMatchesUrl(
					'https://alice.example.com/abc',
					{ id: 'https://alice.example.com/abc' } as IObject,
					'http://alice.example.com/abc',
					FetchAllowSoftFailMask.Strict,
				),
			'throws if HTTP downgrade is detected',
		).toThrow();
	});
});
