/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import fc from 'fast-check';
import { decodePunycodeLabel, encodePunycodeLabel, toUnicodeHost } from '@shared/utility/punycode.js';

/** RFC 3492 §7.1 のテストベクタ (符号化後 → 元)。仕様そのものへの適合を見る。 */
const RFC3492_VECTORS: readonly (readonly [string, string])[] = [
	['egbpdaj6bu4bxfgehfvwxn', 'ليهمابتكلموشعربي؟'],
	['ihqwcrb4cv8a8dqg056pqjye', '他们为什么不说中文'],
	['ihqwctvzc91f659drss3x8bo0yb', '他們爲什麽不說中文'],
	['Proprostnemluvesky-uyb24dma41a', 'Pročprostěnemluvíčesky'],
	['4dbcagdahymbxekheh6e0a7fei0b', 'למההםפשוטלאמדבריםעברית'],
	['i1baa7eci9glrd9b2ae1bj0hfcgg6iyaf8o0a1dig0cd', 'यहलोगहिन्दीक्योंनहींबोलसकतेहैं'],
	['n8jok5ay5dzabd5bym9f0cm5685rrjetr6pdxa', 'なぜみんな日本語を話してくれないのか'],
	[
		'989aomsvi5e83db1d2a355cv1e0vak1dwrv93d5xbh15a0dt30a5jpsd879ccm6fea98c',
		'세계의모든사람들이한국어를이해한다면얼마나좋을까',
	],
	['b1abfaaepdrnnbgefbadotcwatmq2g4l', 'почемужеонинеговорятпорусски'],
	['PorqunopuedensimplementehablarenEspaol-fmd56a', 'PorquénopuedensimplementehablarenEspañol'],
	['3B-ww4c5e180e575a65lsy2b', '3年B組金八先生'],
	['-with-SUPER-MONKEYS-pc58ag80a8qai00g7n9n', '安室奈美恵-with-SUPER-MONKEYS'],
];

const PREFIX = 'xn--';
const HAS_NON_ASCII = /[^\u0000-\u007F]/u;

/**
 * script ごとの文字プール。すべて非 ASCII なので、生成したラベルは必ず Punycode 化される。
 * ランダムな Unicode を投げると大半が script 混在になり判定の本体に到達しないため、script 単位で生成する。
 */
const SCRIPT_SAMPLES = {
	Latin: 'àéîõüßçøæñ',
	Hiragana: 'あいうえおかきくけこ',
	Han: '日本語漢字例試験文',
	Cyrillic: 'абвгдежзиклмор',
} as const;

function singleScriptLabel(scripts: readonly (keyof typeof SCRIPT_SAMPLES)[]): fc.Arbitrary<string> {
	return fc
		.constantFrom(...scripts)
		.chain((script) =>
			fc.array(fc.constantFrom(...SCRIPT_SAMPLES[script]), { minLength: 1, maxLength: 12 }).map((cs) => cs.join('')),
		);
}

describe('punycode: RFC 3492 への適合', () => {
	test.each(RFC3492_VECTORS)('復号 (%s)', (encoded, decoded) => {
		expect(decodePunycodeLabel(encoded)).toBe(decoded);
	});

	test.each(RFC3492_VECTORS)('符号化 (%s)', (encoded, decoded) => {
		expect(encodePunycodeLabel(decoded)).toBe(encoded);
	});
});

describe('punycode: 生成した入力での性質', () => {
	test('符号化してから復号すると元に戻る', () => {
		// 早期 return で本体に到達しない「空振り」を防ぐため、非 ASCII を含む生成に絞り、
		// 実際に往復した回数の下限も見る。
		let roundTripped = 0;
		fc.assert(
			fc.property(
				fc
					.string({ unit: 'grapheme', minLength: 1, maxLength: 24 })
					.filter((s) => HAS_NON_ASCII.test(s) && !s.includes('.')),
				(input) => {
					const encoded = encodePunycodeLabel(input);
					expect(encoded).not.toBeNull();
					expect(decodePunycodeLabel(encoded as string)).toBe(input);
					roundTripped++;
				},
			),
			{ numRuns: 500 },
		);
		expect(roundTripped, '非 ASCII を含む入力で往復した回数').toBeGreaterThan(400);
	});

	test('どんな文字列を渡しても復号は例外を投げず string か null を返す', () => {
		fc.assert(
			fc.property(fc.string({ unit: 'grapheme', maxLength: 40 }), (input) => {
				const decoded = decodePunycodeLabel(input);
				expect(decoded === null || typeof decoded === 'string').toBe(true);
			}),
			{ numRuns: 500 },
		);
	});
});

describe('toUnicodeHost: 入力を壊さないこと', () => {
	const locales = ['ja-JP', 'en-US'];

	test('ラベルの数を変えない', () => {
		fc.assert(
			fc.property(
				fc.array(
					fc.string({ unit: 'grapheme', minLength: 1, maxLength: 12 }).filter((s) => !s.includes('.')),
					{
						minLength: 1,
						maxLength: 4,
					},
				),
				(labels) => {
					const host = labels.join('.');
					expect(toUnicodeHost(host, locales).split('.').length).toBe(labels.length);
				},
			),
			{ numRuns: 300 },
		);
	});

	test('xn-- で始まらないラベルには一切触れない', () => {
		let checked = 0;
		fc.assert(
			fc.property(
				fc
					.array(fc.string({ unit: 'grapheme', minLength: 1, maxLength: 12 }), { minLength: 1, maxLength: 4 })
					.filter((labels) => labels.every((l) => !l.includes('.') && !l.toLowerCase().startsWith(PREFIX))),
				(labels) => {
					const host = labels.join('.');
					expect(toUnicodeHost(host, locales)).toBe(host);
					checked++;
				},
			),
			{ numRuns: 300 },
		);
		expect(checked, 'xn-- を含まないホストを検査した回数').toBeGreaterThan(200);
	});

	test('書き換えたラベルは、符号化し直すと必ず元のラベルに戻る', () => {
		// 「復号できたものをそのまま出す」以外のことをしていないことの保証。
		let rewritten = 0;
		fc.assert(
			fc.property(singleScriptLabel(['Latin', 'Hiragana', 'Han']), (unicodeLabel) => {
				const encoded = encodePunycodeLabel(unicodeLabel);
				if (encoded == null) return;

				// DNS のラベルは大小を区別しないので、判定は小文字化した形で行われる。
				const original = `${PREFIX}${encoded}`.toLowerCase();
				const [shown] = toUnicodeHost(`${original}.example`, locales).split('.');
				if (shown === original) return; // 安全でないと判断されたものは対象外

				expect(`${PREFIX}${encodePunycodeLabel(shown as string)}`).toBe(original);
				rewritten++;
			}),
			{ numRuns: 300 },
		);
		expect(rewritten, '実際に Unicode へ戻した回数').toBeGreaterThan(200);
	});
});

describe('toUnicodeHost: 表示ポリシーの性質', () => {
	const locales = ['ja-JP', 'en-US'];

	const asHost = (label: string): string => `${PREFIX}${encodePunycodeLabel(label) as string}.example`;

	test('閲覧者の言語で自然な script だけのラベルは必ず Unicode で見せる', () => {
		let shown = 0;
		fc.assert(
			fc.property(singleScriptLabel(['Latin', 'Hiragana', 'Han']), (label) => {
				expect(toUnicodeHost(asHost(label), locales)).toBe(`${label}.example`);
				shown++;
			}),
			{ numRuns: 300 },
		);
		expect(shown, '判定を通した回数').toBeGreaterThan(200);
	});

	test('閲覧者が読まない script のラベルは必ず Punycode のまま見せる', () => {
		// キリル文字だけのラベルは単一 script なので「混在」では弾けない。
		// apple.com に化ける類の入力がここで止まる。
		let kept = 0;
		fc.assert(
			fc.property(singleScriptLabel(['Cyrillic']), (label) => {
				const host = asHost(label);
				expect(toUnicodeHost(host, locales)).toBe(host);
				kept++;
			}),
			{ numRuns: 300 },
		);
		expect(kept, '判定を通した回数').toBeGreaterThan(200);
	});

	test('script が混ざるラベルは必ず Punycode のまま見せる', () => {
		let kept = 0;
		fc.assert(
			fc.property(singleScriptLabel(['Hiragana']), fc.constantFrom(...SCRIPT_SAMPLES.Cyrillic), (label, intruder) => {
				const host = asHost(label + intruder);
				expect(toUnicodeHost(host, locales)).toBe(host);
				kept++;
			}),
			{ numRuns: 300 },
		);
		expect(kept, '判定を通した回数').toBeGreaterThan(200);
	});
});

describe('toUnicodeHost: 表示してよいかの判定', () => {
	test('閲覧者の言語で自然な script は Unicode に戻す', () => {
		expect(toUnicodeHost('xn--wgv71a119e.jp', ['ja'])).toBe('日本語.jp');
		expect(toUnicodeHost('xn--80ak6aa92e.com', ['ru'])).toBe('аррӏе.com');
	});

	test('閲覧者が読まない script は Punycode のまま見せる', () => {
		// 全てキリル文字で apple.com と見分けが付かない。ブラウザも同じ理由で xn-- のまま出す。
		expect(toUnicodeHost('xn--80ak6aa92e.com', ['ja'])).toBe('xn--80ak6aa92e.com');
		expect(toUnicodeHost('xn--80ak6aa92e.com', ['en'])).toBe('xn--80ak6aa92e.com');
		expect(toUnicodeHost('xn--wgv71a119e.jp', ['en'])).toBe('xn--wgv71a119e.jp');
	});

	test('Latin は言語によらず戻す', () => {
		expect(toUnicodeHost('xn--mnchen-3ya.de', ['ja'])).toBe('münchen.de');
	});

	test('script が混ざるラベルは戻さない', () => {
		// 「日本語」に見えてキリル文字が 1 字混ざっているような入力。
		const mixed = encodePunycodeLabel('日本а語') as string;
		expect(toUnicodeHost(`${PREFIX}${mixed}.jp`, ['ja'])).toBe(`${PREFIX}${mixed}.jp`);
	});

	test('復号できないラベルはそのまま', () => {
		expect(toUnicodeHost('xn--!!!.com', ['ja'])).toBe('xn--!!!.com');
	});
});
