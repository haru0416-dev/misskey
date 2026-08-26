/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { JsonLd, canonicalizeSignatureOptions } from '@/core/activitypub/json-ld.js';
import type { HttpRequestService } from '@/core/HttpRequestService.js';
import fc from 'fast-check';

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

/*
 * 署名オプションの正規化は jsonld.normalize を通さない近道を持つ。createVerifyData は署名生成
 * だけでなく検証にも使われ、検証側の options はリモートが送ってきた signature ブロックそのもの
 * なので、近道の入力は相手が自由に選べる。
 *
 * 近道が本物と1バイトでも違えば署名検証が壊れる。手で選んだ入力では網羅できないため、生成した
 * 入力で両者を突き合わせる。近道が null を返す入力は呼び出し側が jsonld.normalize へ落とすので
 * 何も主張しないが、そればかりになると検査が空振りするので、近道を通った回数に下限を課す。
 */
describe('LD signature option canonicalization (property)', () => {
	// 近道も normalize も外部リクエストを行わない入力しか与えない。
	const service = new JsonLd(null as unknown as HttpRequestService);

	// N-Quads の区切り文字・エスケープ対象・制御文字・非BMP。近道が素通しすると本物と食い違う。
	const hostileChar = fc.constantFrom(
		'>',
		'<',
		'"',
		'\\',
		'\n',
		'\r',
		'\t',
		' ',
		String.fromCharCode(1),
		String.fromCharCode(0x7f),
		'\u{1F600}',
		'%20',
		'#',
		'?',
		'&',
		'_:c14n0',
		'^^',
	);
	const hostile = fc
		.array(fc.oneof(fc.string({ maxLength: 6 }), hostileChar), { minLength: 1, maxLength: 5 })
		.map((parts) => parts.join(''));

	// 実際に飛んでくる形。これらは近道を通り、本物と一致しなければならない。
	const realisticSegment = fc.stringMatching(/^[A-Za-z0-9._~-]{1,16}$/u);
	const realisticCreator = fc.oneof(
		realisticSegment.map((s) => `https://example.com/users/${s}#main-key`),
		realisticSegment.map((s) => `https://ドメイン.jp/users/${s}#main-key`),
		realisticSegment.map((s) => `http://example.com:8443/users/${s}?a=1&b=2#main-key`),
	);
	const realisticNonce = fc.stringMatching(/^[0-9a-f]{32}$/u);
	// 既定の fc.date は西暦 ±27万年まで振り、toISOString が拡張年表記 (+275760-09-13T…) になる。
	// 署名の created は常に現在時刻近傍なので、その範囲に絞る。
	const realisticCreated = fc
		.date({ min: new Date('2000-01-01T00:00:00.000Z'), max: new Date('2100-01-01T00:00:00.000Z'), noInvalidDate: true })
		.map((d) => d.toISOString());
	const realisticDomain = fc.oneof(fc.constant('example.com'), fc.constant('ドメイン.jp'));

	const mix = <T>(realistic: fc.Arbitrary<T>, weird: fc.Arbitrary<T>): fc.Arbitrary<T> =>
		fc.oneof({ weight: 3, arbitrary: realistic }, { weight: 1, arbitrary: weird });

	test('近道が値を返すなら jsonld.normalize と一致する', async () => {
		let fastPath = 0;
		let total = 0;

		await fc.assert(
			fc.asyncProperty(
				mix(realisticCreator, hostile),
				mix(realisticNonce, hostile),
				mix(realisticCreated, hostile),
				fc.option(mix(realisticDomain, hostile), { nil: undefined }),
				async (creator, nonce, created, domain) => {
					const options: Record<string, unknown> = {
						'@context': 'https://w3id.org/identity/v1',
						creator,
						nonce,
						created,
						...(domain === undefined ? {} : { domain }),
					};

					total++;
					const shortcut = canonicalizeSignatureOptions(options);
					if (shortcut === null) return;
					fastPath++;

					// 近道を通した入力で normalize が例外を投げるなら、それも食い違い (ここで落ちる)。
					const canonical = await service.normalize(options as never);
					expect(shortcut).toBe(canonical.toString());
				},
			),
			{ numRuns: 1000 },
		);

		// 門を締めすぎて近道が死んでも、上の主張は真のまま通ってしまう。
		expect({ fastPathAtLeast: fastPath >= total * 0.2, total }).toStrictEqual({ fastPathAtLeast: true, total: 1000 });
	});
});
