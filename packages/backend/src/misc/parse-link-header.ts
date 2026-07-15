/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * HTTP Link ヘッダ (RFC 8288) から、指定した rel を持つリンクの URI を抽出する。
 * 旧依存 `http-link-header` の置き換えで、必要だった機能 (parse().get('rel', x)) のみ実装。
 * rel 属性は空白区切りの複数値を取れ、比較は大文字小文字を区別しない。
 */
export function extractLinkHeaderUrisByRel(header: string, rel: string): string[] {
	const wanted = rel.toLowerCase();
	const uris: string[] = [];

	for (const value of splitTopLevel(header, ',')) {
		const match = /^\s*<([^>]*)>\s*(.*)$/s.exec(value);
		if (match == null) continue;
		const [, uri, rest] = match;
		if (uri == null || rest == null) continue;

		// RFC 8288 3.3: 同名パラメータが複数ある場合は最初の出現のみ有効
		let relValue: string | null = null;
		for (const param of splitTopLevel(rest, ';')) {
			const eq = param.indexOf('=');
			if (eq === -1) continue;
			const name = param.slice(0, eq).trim().toLowerCase();
			if (name !== 'rel' || relValue != null) continue;
			let raw = param.slice(eq + 1).trim();
			if (raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2) {
				raw = raw.slice(1, -1).replaceAll(/\\(.)/g, '$1');
			}
			relValue = raw;
		}

		if (relValue != null && relValue.toLowerCase().split(/\s+/).includes(wanted)) {
			uris.push(uri);
		}
	}

	return uris;
}

/** 引用符 ("...") と <...> の内側を無視して separator で分割する。 */
function splitTopLevel(input: string, separator: ',' | ';'): string[] {
	const parts: string[] = [];
	let current = '';
	let inQuote = false;
	let inAngle = false;

	for (let i = 0; i < input.length; i++) {
		const ch = input[i];
		if (inQuote) {
			if (ch === '\\' && i + 1 < input.length) {
				current += ch + input[++i];
				continue;
			}
			if (ch === '"') inQuote = false;
		} else if (inAngle) {
			if (ch === '>') inAngle = false;
		} else if (ch === '"') {
			inQuote = true;
		} else if (ch === '<') {
			inAngle = true;
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
