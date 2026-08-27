/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

//#region RFC 3492 (Punycode)
const BASE = 36;
const T_MIN = 1;
const T_MAX = 26;
const SKEW = 38;
const DAMP = 700;
const INITIAL_BIAS = 72;
const INITIAL_N = 128;
const DELIMITER = '-';
const MAX_CODE_POINT = 0x10ffff;

function digitOf(codePoint: number): number {
	if (codePoint >= 0x30 && codePoint <= 0x39) return codePoint - 0x30 + 26; // 0-9
	if (codePoint >= 0x41 && codePoint <= 0x5a) return codePoint - 0x41; // A-Z
	if (codePoint >= 0x61 && codePoint <= 0x7a) return codePoint - 0x61; // a-z
	return BASE;
}

function charOf(digit: number): string {
	return String.fromCharCode(digit + (digit < 26 ? 97 : 22)); // a-z / 0-9
}

function adaptBias(delta: number, numPoints: number, firstTime: boolean): number {
	let d = firstTime ? Math.floor(delta / DAMP) : delta >> 1;
	d += Math.floor(d / numPoints);

	let k = 0;
	while (d > ((BASE - T_MIN) * T_MAX) >> 1) {
		d = Math.floor(d / (BASE - T_MIN));
		k += BASE;
	}
	return k + Math.floor(((BASE - T_MIN + 1) * d) / (d + SKEW));
}

/** 1 ラベル分の Punycode を復号する。仕様に反する入力では null。 */
export function decodePunycodeLabel(input: string): string | null {
	const output: number[] = [];
	const delimiterIndex = input.lastIndexOf(DELIMITER);

	// 区切りより前は ASCII のまま残る部分。
	if (delimiterIndex > 0) {
		for (let i = 0; i < delimiterIndex; i++) {
			const code = input.charCodeAt(i);
			if (code >= 0x80) return null;
			output.push(code);
		}
	}

	let n = INITIAL_N;
	let bias = INITIAL_BIAS;
	let i = 0;

	for (let index = delimiterIndex > 0 ? delimiterIndex + 1 : 0; index < input.length;) {
		const oldI = i;

		for (let w = 1, k = BASE; ; k += BASE) {
			if (index >= input.length) return null;

			const digit = digitOf(input.charCodeAt(index++));
			if (digit >= BASE) return null;
			if (digit > Math.floor((Number.MAX_SAFE_INTEGER - i) / w)) return null;

			i += digit * w;
			const t = k <= bias ? T_MIN : k >= bias + T_MAX ? T_MAX : k - bias;
			if (digit < t) break;

			if (w > Math.floor(Number.MAX_SAFE_INTEGER / (BASE - t))) return null;
			w *= BASE - t;
		}

		const out = output.length + 1;
		bias = adaptBias(i - oldI, out, oldI === 0);

		if (Math.floor(i / out) > Number.MAX_SAFE_INTEGER - n) return null;
		n += Math.floor(i / out);
		i %= out;

		if (n > MAX_CODE_POINT || (n >= 0xd800 && n <= 0xdfff)) return null;
		output.splice(i++, 0, n);
	}

	return String.fromCodePoint(...output);
}

/** 1 ラベルを Punycode へ符号化する。非 ASCII を含まない場合はそのまま返す。 */
export function encodePunycodeLabel(input: string): string | null {
	const codePoints = Array.from(input, (c) => c.codePointAt(0) as number);
	const basic = codePoints.filter((c) => c < 0x80);
	let handled = basic.length;
	const basicLength = handled;

	let output = basic.map((c) => String.fromCharCode(c)).join('');
	if (basicLength > 0) output += DELIMITER;

	let n = INITIAL_N;
	let bias = INITIAL_BIAS;
	let delta = 0;

	while (handled < codePoints.length) {
		let m = MAX_CODE_POINT;
		for (const c of codePoints) {
			if (c >= n && c < m) m = c;
		}

		if (m - n > Math.floor((Number.MAX_SAFE_INTEGER - delta) / (handled + 1))) return null;
		delta += (m - n) * (handled + 1);
		n = m;

		for (const c of codePoints) {
			if (c < n && ++delta > Number.MAX_SAFE_INTEGER) return null;
			if (c !== n) continue;

			let q = delta;
			for (let k = BASE; ; k += BASE) {
				const t = k <= bias ? T_MIN : k >= bias + T_MAX ? T_MAX : k - bias;
				if (q < t) break;
				output += charOf(t + ((q - t) % (BASE - t)));
				q = Math.floor((q - t) / (BASE - t));
			}

			output += charOf(q);
			bias = adaptBias(delta, handled + 1, handled === basicLength);
			delta = 0;
			handled++;
		}

		delta++;
		n++;
	}

	return output;
}
//#endregion

//#region 表示してよいかの判定
const PREFIX = 'xn--';

/**
 * ISO 15924 (Intl.Locale が返す script) から、その言語で自然に現れる Unicode script 名へ。
 * ここに無い script は「読めない文字」として Punycode のまま見せる。
 */
const SCRIPTS_OF_ISO15924: Record<string, readonly string[]> = {
	Latn: ['Latin'],
	Cyrl: ['Cyrillic'],
	Grek: ['Greek'],
	Arab: ['Arabic'],
	Hebr: ['Hebrew'],
	Thai: ['Thai'],
	Deva: ['Devanagari'],
	Jpan: ['Han', 'Hiragana', 'Katakana'],
	Hans: ['Han'],
	Hant: ['Han'],
	Kore: ['Hangul', 'Han'],
};

const SCRIPT_PATTERNS: readonly (readonly [string, RegExp])[] = [
	['Latin', /\p{Script=Latin}/u],
	['Cyrillic', /\p{Script=Cyrillic}/u],
	['Greek', /\p{Script=Greek}/u],
	['Arabic', /\p{Script=Arabic}/u],
	['Hebrew', /\p{Script=Hebrew}/u],
	['Thai', /\p{Script=Thai}/u],
	['Devanagari', /\p{Script=Devanagari}/u],
	['Han', /\p{Script=Han}/u],
	['Hiragana', /\p{Script=Hiragana}/u],
	['Katakana', /\p{Script=Katakana}/u],
	['Hangul', /\p{Script=Hangul}/u],
];

// 数字・ハイフン等はどの言語にも現れるので、script の判定から除く。
const NEUTRAL = /[\p{Script=Common}\p{Script=Inherited}]/u;

function scriptsOf(label: string): Set<string> | null {
	const found = new Set<string>();
	for (const char of label) {
		if (NEUTRAL.test(char)) continue;
		const match = SCRIPT_PATTERNS.find(([, pattern]) => pattern.test(char));
		// 表に無い script が 1 文字でもあれば判定できない。
		if (match == null) return null;
		found.add(match[0]);
	}
	return found;
}

function allowedScriptsFor(locales: readonly string[]): Set<string> {
	// ASCII と地続きの Latin は常に許可する。
	const allowed = new Set<string>(['Latin']);
	for (const locale of locales) {
		let iso: string | undefined;
		try {
			iso = new Intl.Locale(locale).maximize().script;
		} catch {
			continue;
		}
		for (const script of (iso == null ? undefined : SCRIPTS_OF_ISO15924[iso]) ?? []) allowed.add(script);
	}
	return allowed;
}

function defaultLocales(): readonly string[] {
	if (typeof navigator === 'undefined') return ['en'];
	return navigator.languages.length > 0 ? navigator.languages : [navigator.language];
}

/**
 * ホスト名の Punycode ラベルを、表示しても紛らわしくない場合に限って Unicode へ戻す。
 *
 * ブラウザのアドレスバーが `xn--` のまま見せることがあるのと同じ理由で、無条件には戻さない。
 * 例えば `xn--80ak6aa92e.com` は全てキリル文字の `аррӏе.com` に戻り、`apple.com` と見分けが付かない。
 * 判定は次の 3 つを全て満たすことを条件にする:
 *
 * 1. 復号したものを符号化し直すと元に戻る (非正規な符号化を弾く)
 * 2. ラベル内の文字が単一の script に収まっている (script の混在を弾く)
 * 3. その script が、閲覧者の言語から見て自然なものである
 *
 * DNS のラベルは大小を区別しないため、判定も出力も小文字化した形で行う。
 */
export function toUnicodeHost(host: string, locales: readonly string[] = defaultLocales()): string {
	if (!host.includes(PREFIX)) return host;

	const allowed = allowedScriptsFor(locales);

	return host
		.split('.')
		.map((label) => {
			const lower = label.toLowerCase();
			if (!lower.startsWith(PREFIX)) return label;

			const decoded = decodePunycodeLabel(lower.slice(PREFIX.length));
			if (decoded == null || decoded === '') return label;
			if (encodePunycodeLabel(decoded) !== lower.slice(PREFIX.length)) return label;

			const scripts = scriptsOf(decoded);
			if (scripts == null || scripts.size !== 1) return label;

			const [script] = scripts;
			return script != null && allowed.has(script) ? decoded : label;
		})
		.join('.');
}
//#endregion
