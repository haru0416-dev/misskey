/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/*!
The MIT License (MIT)

Copyright (c) 2016-2024 syuilo

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

import { detect } from 'chardet';
import { parse, TextNode } from 'node-html-parser';
import type { HTMLElement } from 'node-html-parser';
import type { UrlPreviewSummary } from 'misskey-js/entities.js';
import type { HttpRequestService, HttpRequestSendResponse } from '@/core/net/HttpRequestService.js';

type PreviewOptions = {
	lang: string;
	userAgent: string;
	followRedirects: boolean;
	operationTimeout: number;
	contentLengthLimit: number;
	contentLengthRequired: boolean;
};

const amazonHosts = new Set([
	'www.amazon.com',
	'www.amazon.co.jp',
	'www.amazon.ca',
	'www.amazon.com.br',
	'www.amazon.com.mx',
	'www.amazon.co.uk',
	'www.amazon.de',
	'www.amazon.fr',
	'www.amazon.it',
	'www.amazon.es',
	'www.amazon.nl',
	'www.amazon.cn',
	'www.amazon.in',
	'www.amazon.au',
]);
const playerPermissions = new Set([
	'autoplay',
	'clipboard-write',
	'fullscreen',
	'encrypted-media',
	'picture-in-picture',
	'web-share',
]);

function clip(value: string, length: number): string {
	if (value.trim() === '') return value;
	const trimmed = value.trim();
	return trimmed.length > length ? `${trimmed.slice(0, length)}...` : trimmed;
}

function decode(value: string): string {
	return new TextNode(value).text;
}

function attribute(root: HTMLElement, selectors: string[], name = 'content'): string | undefined {
	for (const selector of selectors) {
		const value = root.querySelector(selector)?.getAttribute(name);
		if (value) return value;
	}
	return undefined;
}

function isWikipedia(url: URL): boolean {
	return url.hostname.endsWith('.wikipedia.org');
}

function dimension(value: string | undefined): number | null {
	const number = Number.parseInt(value ?? '', 10);
	return Number.isNaN(number) ? null : number;
}

/** TextDecoder が知っているラベルなら正規化した名前を返す。 */
function supportedEncoding(label: string | null | undefined): string | null {
	if (!label) return null;
	try {
		return new TextDecoder(label.trim()).encoding;
	} catch {
		return null;
	}
}

function bomEncoding(bytes: Uint8Array): string | null {
	if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return 'utf-8';
	if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be';
	if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le';
	return null;
}

function isUtf8(bytes: Uint8Array): boolean {
	try {
		new TextDecoder('utf-8', { fatal: true }).decode(bytes);
		return true;
	} catch {
		return false;
	}
}

/**
 * ブラウザと同じ優先順位で文字コードを決める: BOM → HTTP ヘッダ → 先頭 1024 バイトの meta → 正しい UTF-8 → 推定。
 * 推定を先にすると、文字コードを宣言した短い Shift_JIS のページ (538 バイト) が windows-1252 (確信度 33、Shift_JIS は 10) と判定されて化ける。
 */
async function decodeHtml(response: HttpRequestSendResponse): Promise<string> {
	const bytes = await response.bytes();
	const head = new TextDecoder('windows-1252').decode(bytes.subarray(0, 1024));
	const encoding =
		bomEncoding(bytes) ??
		supportedEncoding(/charset\s*=\s*["']?([^"';\s]+)/i.exec(response.headers.get('content-type') ?? '')?.[1]) ??
		supportedEncoding(/<meta\s[^>]*?charset\s*=\s*["']?\s*([\w.:-]+)/i.exec(head)?.[1]) ??
		(isUtf8(bytes) ? 'utf-8' : null) ??
		supportedEncoding(detect(bytes)) ??
		'utf-8';
	return new TextDecoder(encoding).decode(bytes);
}

export async function fetchUrlPreview(
	http: Pick<HttpRequestService, 'send'>,
	input: string,
	options: PreviewOptions,
): Promise<UrlPreviewSummary> {
	const headers = {
		Accept: 'text/html,application/xhtml+xml',
		'User-Agent': options.userAgent,
		...(/^[\w-]+(\s*,\s*[\w-]+)*$/.test(options.lang) ? { 'Accept-Language': options.lang } : {}),
	};
	async function request(url: string, method = 'GET', html = false): Promise<HttpRequestSendResponse> {
		const response = await http.send(
			url,
			{
				method,
				headers: { ...headers, Accept: html ? headers.Accept : '*/*' },
				followRedirects: options.followRedirects,
				timeout: options.operationTimeout,
				size: options.contentLengthLimit,
			},
			{ throwErrorWhenResponseNotOk: false },
		);
		if (response.status >= 400) throw new Error(`Preview request failed: ${response.status}`);
		if (
			html &&
			method !== 'HEAD' &&
			!/^(text\/html|application\/xhtml\+xml)/.test(response.headers.get('content-type') ?? '')
		) {
			throw new Error('Preview response is not HTML');
		}
		if (method !== 'HEAD' && options.contentLengthRequired && !response.headers.get('content-length')) {
			throw new Error('Preview response requires content-length');
		}
		return response;
	}

	async function fetchWikipedia(url: URL, reportedUrl: string): Promise<UrlPreviewSummary> {
		const lang = url.host.split('.')[0];
		const response = await request(
			`https://${lang}.wikipedia.org/w/api.php?format=json&action=query&prop=extracts&exintro=&explaintext=&titles=${url.pathname.split('/')[2]}`,
		);
		const body = (await response.json()) as { query: { pages: Record<string, { title: string; extract: string }> } };
		const page = Object.values(body.query.pages)[0]!;
		return {
			url: reportedUrl,
			title: page.title,
			description: clip(page.extract, 300),
			icon: 'https://wikipedia.org/static/favicon/wikipedia.ico',
			thumbnail: `https://wikipedia.org/static/images/project-logos/${lang}wiki.png`,
			sitename: 'Wikipedia',
			activityPub: null,
			fediverseCreator: null,
			player: { url: null, width: null, height: null, allow: [] },
		};
	}

	// リダイレクトは本文の取得で追い、最終 URL は応答から取る。先に HEAD で解決すると、ボット UA に 1 往復 2〜3 秒かける
	// サイト (NHK/Akamai で実測) では往復の数だけ遅れて 10 秒の制限を超える。
	const requested = new URL(input);
	if (isWikipedia(requested)) return await fetchWikipedia(requested, input);
	if (/^[a-zA-Z0-9]+\.app\.link$/.test(requested.hostname) || requested.hostname === 'spotify.link') {
		requested.searchParams.append('$web_only', 'true');
	}
	const response = await request(requested.href, 'GET', true);
	const actualUrl = response.url === requested.href ? input : response.url;
	const url = new URL(actualUrl);
	if (isWikipedia(url)) return await fetchWikipedia(url, actualUrl);
	const root = parse(url.hostname === 'bsky.app' ? await response.text() : await decodeHtml(response), {
		blockTextElements: { script: true, noscript: true, style: true, pre: true, title: true },
	});
	if (amazonHosts.has(url.hostname)) {
		const title = root.querySelector('#title')?.text ?? '';
		const description =
			root.querySelector('#productDescription')?.text || attribute(root, ['meta[name="description"]']);
		const thumbnail = root.querySelector('#landingImage')?.getAttribute('src');
		const playerUrl = attribute(root, ['meta[property="twitter:player"]', 'meta[name="twitter:player"]']);
		return {
			url: actualUrl,
			title: title ? title.trim() : null,
			description: description ? description.trim() : null,
			thumbnail: thumbnail ? thumbnail.trim() : null,
			icon: 'https://www.amazon.com/favicon.ico',
			sitename: 'Amazon',
			activityPub: null,
			fediverseCreator: null,
			player: {
				url: playerUrl || null,
				width: dimension(
					attribute(root, ['meta[property="twitter:player:width"]', 'meta[name="twitter:player:width"]']),
				),
				height: dimension(
					attribute(root, ['meta[property="twitter:player:height"]', 'meta[name="twitter:player:height"]']),
				),
				allow: playerUrl ? ['fullscreen', 'encrypted-media'] : [],
			},
		};
	}

	const card = attribute(root, ['meta[name="twitter:card"]', 'meta[property="twitter:card"]']);
	let title = clip(
		decode(
			attribute(root, ['meta[property="og:title"]', 'meta[name="twitter:title"]', 'meta[property="twitter:title"]']) ??
				root
					.querySelectorAll('title')
					.map((element) => element.text)
					.join(''),
		),
		100,
	);
	const descriptionValue = attribute(root, [
		'meta[property="og:description"]',
		'meta[name="twitter:description"]',
		'meta[property="twitter:description"]',
		'meta[name="description"]',
	]);
	let description = descriptionValue ? clip(decode(descriptionValue), 300) : null;
	if (description === title) description = null;
	const siteName = decode(
		attribute(root, ['meta[property="og:site_name"]', 'meta[name="application-name"]']) || url.host,
	);
	const escapedSiteName = siteName.trim().replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
	title = new RegExp(`^(.+?)\\s?[\\-\\|:・]\\s?${escapedSiteName}$`).exec(title.trim())?.[1] ?? title.trim();
	if (!title) title = siteName;
	const image =
		attribute(root, ['meta[property="og:image"]', 'meta[name="twitter:image"]', 'meta[property="twitter:image"]']) ||
		attribute(
			root,
			['link[rel="image_src"]', 'link[rel="apple-touch-icon"]', 'link[rel="apple-touch-icon image_src"]'],
			'href',
		);
	const favicon = attribute(root, ['link[rel="shortcut icon"]', 'link[rel="icon"]'], 'href') || '/favicon.ico';
	const iconUrl = new URL(favicon, url).href;
	const [icon, embeddedPlayer] = await Promise.all([
		request(iconUrl, 'HEAD')
			.then(() => iconUrl)
			.catch(() => null),
		getOEmbedPlayer(root, url, request),
	]);
	const rating = response.headers.get('rating')?.toLowerCase();
	const metaRating = root.querySelector('meta[name="rating"]')?.getAttribute('content');
	return {
		url: actualUrl,
		title: title || null,
		description: description || null,
		icon,
		thumbnail: image ? new URL(image, url).href : null,
		thumbnailStyle: card === 'summary_large_image' || card === 'summary' ? card : null,
		sitename: siteName || null,
		activityPub: attribute(root, ['link[rel="alternate"][type="application/activity+json"]'], 'href') || null,
		fediverseCreator: attribute(root, ['meta[name="fediverse:creator"]']) || null,
		sensitive:
			root.querySelector('meta[property="mixi:content-rating"]')?.getAttribute('content') === '1' ||
			rating === 'adult' ||
			rating === 'rta-5042-1996-1400-1577-rta' ||
			metaRating === 'adult' ||
			metaRating?.toUpperCase() === 'RTA-5042-1996-1400-1577-RTA',
		player: embeddedPlayer ?? {
			url:
				(card !== 'summary_large_image' &&
					attribute(root, ['meta[name="twitter:player"]', 'meta[property="twitter:player"]'])) ||
				attribute(root, [
					'meta[property="og:video"]',
					'meta[property="og:video:secure_url"]',
					'meta[property="og:video:url"]',
				]) ||
				null,
			width: dimension(
				attribute(root, [
					'meta[name="twitter:player:width"]',
					'meta[property="twitter:player:width"]',
					'meta[property="og:video:width"]',
				]),
			),
			height: dimension(
				attribute(root, [
					'meta[name="twitter:player:height"]',
					'meta[property="twitter:player:height"]',
					'meta[property="og:video:height"]',
				]),
			),
			allow: ['autoplay', 'encrypted-media', 'fullscreen'],
		},
	};
}

async function getOEmbedPlayer(
	root: HTMLElement,
	url: URL,
	request: (url: string) => Promise<HttpRequestSendResponse>,
): Promise<UrlPreviewSummary['player'] | null> {
	const href = root.querySelector('link[type="application/json+oembed"]')?.getAttribute('href');
	if (!href) return null;
	try {
		const body = (await (await request(new URL(href, url).href)).json()) as {
			version: string;
			type: string;
			html: string;
			width?: number;
			height?: number;
		};
		if (
			body.version !== '1.0' ||
			!['rich', 'video'].includes(body.type) ||
			!body.html.startsWith('<iframe ') ||
			!body.html.endsWith('</iframe>')
		)
			return null;
		const fragment = parse(body.html);
		const frames = fragment.querySelectorAll('iframe');
		const frame = frames[0];
		// 埋め込みHTMLは返さず、単独のHTTPS iframeから許可した属性だけを取り出す。
		if (frames.length !== 1 || !frame || frame.parentNode !== fragment || fragment.childNodes.length !== 1) return null;
		const src = frame.getAttribute('src');
		if (!src || new URL(src).protocol !== 'https:') return null;
		const width = Number(frame.getAttribute('width') ?? body.width);
		const height = Math.min(Number(frame.getAttribute('height') ?? body.height), 1024);
		if (Number.isNaN(height)) return null;
		const allow = (frame.getAttribute('allow') ?? '')
			.split(/\s*;\s*/)
			.filter((permission) => permission && !['gyroscope', 'accelerometer'].includes(permission));
		if (frame.getAttribute('allowfullscreen') === '') allow.push('fullscreen');
		if (allow.some((permission) => !playerPermissions.has(permission))) return null;
		return { url: src, width: Number.isNaN(width) ? null : width, height, allow };
	} catch {
		return null;
	}
}
