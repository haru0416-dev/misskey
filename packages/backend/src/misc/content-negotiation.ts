/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Accept ヘッダのコンテンツネゴシエーション (RFC 7231 §5.3.2)。
 * 旧依存 `accepts` ライブラリの `.type(candidates)` 相当の必要最小限:
 * q 値・ワイルドカード (type/* と *slash*)・specificity を解釈し、
 * 候補のうちクライアントの品質値が最大のもの (同点はサーバー優先順 = candidates の先頭側)
 * を返す。どれも受理されない (q=0 含む) 場合は null。
 * Accept ヘッダ自体が無い場合は全て受理とみなし candidates の先頭を返す。
 */

type AcceptRange = {
	type: string;
	subtype: string;
	q: number;
	specificity: number;
	headerIndex: number;
};

function parseAcceptHeader(header: string): AcceptRange[] {
	const ranges: AcceptRange[] = [];

	let headerIndex = -1;
	for (const part of splitQuoted(header, ',')) {
		headerIndex++;
		const segments = splitQuoted(part, ';');
		const mediaType = segments[0]?.trim().toLowerCase();
		if (!mediaType) continue;

		const slash = mediaType.indexOf('/');
		if (slash === -1) continue;
		const type = mediaType.slice(0, slash);
		const subtype = mediaType.slice(slash + 1);

		let q = 1;
		for (const param of segments.slice(1)) {
			const eq = param.indexOf('=');
			if (eq === -1) continue;
			if (param.slice(0, eq).trim().toLowerCase() !== 'q') continue;
			const parsed = Number(param.slice(eq + 1).trim());
			if (Number.isFinite(parsed)) q = Math.min(Math.max(parsed, 0), 1);
			break; // q 以降は accept-ext (media type のパラメータではない)
		}

		const specificity =
			type === '*' ? 0 :
			subtype === '*' ? 1 :
			2;

		ranges.push({ type, subtype, q, specificity, headerIndex });
	}

	return ranges;
}

/** 引用符 ("...") の内側を無視して separator で分割する。 */
function splitQuoted(input: string, separator: ',' | ';'): string[] {
	const parts: string[] = [];
	let current = '';
	let inQuote = false;

	for (let i = 0; i < input.length; i++) {
		const ch = input[i];
		if (inQuote) {
			if (ch === '\\' && i + 1 < input.length) {
				current += ch + input[++i];
				continue;
			}
			if (ch === '"') inQuote = false;
		} else if (ch === '"') {
			inQuote = true;
		} else if (ch === separator) {
			parts.push(current);
			current = '';
			continue;
		}
		current += ch;
	}
	if (current.trim() !== '') parts.push(current);

	return parts;
}

/** candidate ('application/activity+json; charset=utf-8' 等、パラメータ付き可) に最も specific にマッチする range を返す (RFC 7231 §5.3.2)。 */
function matchRange(ranges: AcceptRange[], candidate: string): AcceptRange | null {
	const mediaType = candidate.split(';', 1)[0]?.trim().toLowerCase();
	if (mediaType == null) return null;
	const slash = mediaType.indexOf('/');
	if (slash === -1) return null;
	const type = mediaType.slice(0, slash);
	const subtype = mediaType.slice(slash + 1);

	let best: AcceptRange | null = null;
	for (const range of ranges) {
		const matches =
			(range.type === '*' && range.subtype === '*') ||
			(range.type === type && range.subtype === '*') ||
			(range.type === type && range.subtype === subtype);
		if (!matches) continue;
		if (best == null || range.specificity > best.specificity) best = range;
	}

	return best;
}

export function preferredMediaType<T extends string>(acceptHeader: string | undefined | null, candidates: readonly T[]): T | null {
	if (acceptHeader == null || acceptHeader.trim() === '') {
		return candidates[0] ?? null;
	}

	const ranges = parseAcceptHeader(acceptHeader);
	if (ranges.length === 0) return candidates[0] ?? null;

	// negotiator (旧 accepts ライブラリの実体) と同じ優先順で比較する:
	// q 値 → マッチした range の specificity (exact > type/* > */*) → Accept ヘッダ内の出現順 →
	// candidates の順 (サーバー優先順)。specificity を無視すると
	// `Accept: application/activity+json, */*` で */* 経由の先頭候補が同点勝ちしてしまう。
	let best: T | null = null;
	let bestRange: AcceptRange | null = null;
	for (const candidate of candidates) {
		const range = matchRange(ranges, candidate);
		if (range == null || range.q === 0) continue;
		if (
			bestRange == null ||
			range.q > bestRange.q ||
			(range.q === bestRange.q && range.specificity > bestRange.specificity) ||
			(range.q === bestRange.q && range.specificity === bestRange.specificity && range.headerIndex < bestRange.headerIndex)
		) {
			best = candidate;
			bestRange = range;
		}
	}

	return best;
}
