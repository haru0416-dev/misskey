/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { lang } from 'sugar-high/lang';
import type { LanguageId } from 'sugar-high/lang';
import type { LanguageConfig, ParsedCode, TokenType } from 'sugar-high/core';

type ColoredLanguageId = Exclude<LanguageId, 'plaintext'>;

// 言語ごとに別のチャンクにするため、import は 1 言語ずつ文字列のまま書く。
// 最初のコードブロックで読むのは、解析器と、そのブロックの言語の分だけになる。
const LANGUAGE_LOADERS: Record<ColoredLanguageId, () => Promise<{ default: LanguageConfig }>> = {
	aiscript: () => import('sugar-high/lang/aiscript'),
	c: () => import('sugar-high/lang/c'),
	cpp: () => import('sugar-high/lang/cpp'),
	csharp: () => import('sugar-high/lang/csharp'),
	css: () => import('sugar-high/lang/css'),
	diff: () => import('sugar-high/lang/diff'),
	dockerfile: () => import('sugar-high/lang/dockerfile'),
	go: () => import('sugar-high/lang/go'),
	graphql: () => import('sugar-high/lang/graphql'),
	hcl: () => import('sugar-high/lang/hcl'),
	html: () => import('sugar-high/lang/html'),
	java: () => import('sugar-high/lang/java'),
	javascript: () => import('sugar-high/lang/javascript'),
	json: () => import('sugar-high/lang/json'),
	kotlin: () => import('sugar-high/lang/kotlin'),
	lua: () => import('sugar-high/lang/lua'),
	markdown: () => import('sugar-high/lang/markdown'),
	php: () => import('sugar-high/lang/php'),
	powershell: () => import('sugar-high/lang/powershell'),
	python: () => import('sugar-high/lang/python'),
	ruby: () => import('sugar-high/lang/ruby'),
	rust: () => import('sugar-high/lang/rust'),
	shell: () => import('sugar-high/lang/shell'),
	sql: () => import('sugar-high/lang/sql'),
	svelte: () => import('sugar-high/lang/svelte'),
	swift: () => import('sugar-high/lang/swift'),
	toml: () => import('sugar-high/lang/toml'),
	typescript: () => import('sugar-high/lang/typescript'),
	vue: () => import('sugar-high/lang/vue'),
	yaml: () => import('sugar-high/lang/yaml'),
	zig: () => import('sugar-high/lang/zig'),
};

/** コードブロックの言語名 (別名・拡張子を含む) を、色を付ける言語に解決する。知らない言語と未指定は null (色を付けない)。 */
export function resolveCodeLanguage(name: string | undefined): ColoredLanguageId | null {
	const id = name == null ? undefined : lang(name);
	return id == null || id === 'plaintext' ? null : id;
}

type Highlighter = {
	parse: (code: string, config: LanguageConfig) => ParsedCode;
	config: LanguageConfig;
};

// 読み込みに失敗したとき (オフラインや、更新で古いチャンクが消えたとき) は覚えず、次の表示で読み直す
const highlighterCache = new Map<ColoredLanguageId, Promise<Highlighter | null>>();
// 読み込み済みの言語は、入力のたびに Promise を待たずに同期で色を付けられるよう別に持つ
const loadedHighlighters = new Map<ColoredLanguageId, Highlighter>();

function loadHighlighter(id: ColoredLanguageId): Promise<Highlighter | null> {
	let promise = highlighterCache.get(id);
	if (promise == null) {
		promise = Promise.all([import('sugar-high/core'), LANGUAGE_LOADERS[id]()]).then(
			([core, language]) => {
				const highlighter = { parse: core.parse, config: language.default };
				loadedHighlighters.set(id, highlighter);
				return highlighter;
			},
			() => {
				highlighterCache.delete(id);
				return null;
			},
		);
		highlighterCache.set(id, promise);
	}
	return promise;
}

const ESCAPED: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
const escapeHtml = (text: string) => text.replaceAll(/[&<>"']/g, (char) => ESCAPED[char] ?? char);

// sugar-high は \n だけで行を分けるので、CRLF の \r が行末のトークンに残る。HTML として読むと
// その \r も改行になり空行が増えるため、先に \n へそろえる。
const normalizeNewlines = (code: string) => code.replaceAll(/\r\n?/g, '\n');

/** 色を付けない HTML を返す。言語を読み込むまでの間と、色を付けない言語に使う。行は `\n` で区切り、文字はすべてエスケープ済み。 */
export function renderPlainCode(code: string): string {
	return normalizeNewlines(code)
		.split('\n')
		.map((line) => `<span class="sh__line">${escapeHtml(line)}</span>`)
		.join('\n');
}

function renderParsedCode(parsed: ParsedCode): string {
	return parsed.lines
		.map((line) => {
			const tokens = line.tokens
				.map(({ type, value }) =>
					type === 'space' ? escapeHtml(value) : `<span style="color: var(--sh-${type})">${escapeHtml(value)}</span>`,
				)
				.join('');
			// 差分の追加・削除の行などに付く印 (diff-add、diff-remove、diff-hunk、diff-meta など)。見た目は MkCode.Core が決める。
			const annotations =
				line.annotations.length > 0 ? ` data-annotations="${escapeHtml(line.annotations.join(' '))}"` : '';
			return `<span class="sh__line"${annotations}>${tokens}</span>`;
		})
		.join('\n');
}

/** 色付けした HTML を返す。行は `\n` で区切り、文字はすべてエスケープ済み。色を付けない言語と読み込みの失敗では色なしで返す。 */
export async function highlightCode(code: string, language: string | undefined): Promise<string> {
	const id = resolveCodeLanguage(language);
	const highlighter = id == null ? null : await loadHighlighter(id);
	if (highlighter == null) {
		return renderPlainCode(code);
	}
	return renderParsedCode(highlighter.parse(normalizeNewlines(code), highlighter.config));
}

/** 言語を読み込み済みなら、色付けした HTML を同期で返す。読み込む前は null。色を付けない言語では色なしの HTML を返す。 */
export function highlightCodeIfLoaded(code: string, language: string | undefined): string | null {
	const id = resolveCodeLanguage(language);
	if (id == null) {
		return renderPlainCode(code);
	}
	const highlighter = loadedHighlighters.get(id);
	return highlighter == null ? null : renderParsedCode(highlighter.parse(normalizeNewlines(code), highlighter.config));
}

export type CodeToken = { content: string; type: TokenType; color: string };

/** 行ごとのトークンを返す。色は `--sh-*` の CSS 変数で、テーマの codeBlock* から決まる。色を付けない言語では null。 */
export async function tokenizeCodeLines(code: string, language: string | undefined): Promise<CodeToken[][] | null> {
	const id = resolveCodeLanguage(language);
	const highlighter = id == null ? null : await loadHighlighter(id);
	if (highlighter == null) {
		return null;
	}
	return highlighter
		.parse(code, highlighter.config)
		.lines.map((line) => line.tokens.map(({ type, value }) => ({ content: value, type, color: `var(--sh-${type})` })));
}
