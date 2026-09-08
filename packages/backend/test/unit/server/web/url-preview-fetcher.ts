/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { loadConfig } from '@/config.js';
import { createHttpRequestService } from '@/core/net/HttpRequestService.js';
import { fetchUrlPreview } from '@/server/web/UrlPreviewFetcher.js';

const options = {
	lang: 'ja-JP',
	userAgent: 'PreviewTest',
	followRedirects: true,
	operationTimeout: 2000,
	contentLengthLimit: 4096,
	contentLengthRequired: false,
};

const clients: ReturnType<typeof createHttpRequestService>[] = [];

function service(allowedNetworks: string[] = ['127.0.0.0/8']) {
	const config = loadConfig();
	const proxy = { ...config.outboundNetwork.proxy };
	delete proxy.url;
	const client = createHttpRequestService(
		{
			...config,
			outboundNetwork: {
				...config.outboundNetwork,
				proxy,
				privateNetworkAccess: { ...config.outboundNetwork.privateNetworkAccess, allowedNetworks },
			},
		},
		true,
	);
	clients.push(client);
	return client;
}

describe('URL preview fetcher', () => {
	let origin: string;
	let html = '';
	let embed = '';
	const requests: { path: string; agent: string | undefined; language: string | undefined }[] = [];
	const server = createServer((req, res) => {
		const path = req.url!;
		requests.push({ path, agent: req.headers['user-agent'], language: req.headers['accept-language'] });
		if (path === '/redirect') {
			res.writeHead(302, { location: '/page' }).end();
			return;
		}
		if (path === '/private') {
			res.writeHead(302, { location: 'http://127.0.0.2/' }).end();
			return;
		}
		if (path === '/missing') {
			res.writeHead(404).end();
			return;
		}
		if (path === '/slow') {
			return;
		}
		if (path === '/chunked') {
			res.writeHead(200, { 'content-type': 'text/html' });
			res.write(html);
			res.end();
			return;
		}
		if (path === '/sjis') {
			const body = Buffer.concat([
				Buffer.from('<title>'),
				...Array.from({ length: 4 }, () => Buffer.from([0x93, 0xfa, 0x96, 0x7b, 0x8c, 0xea])),
				Buffer.from('</title><meta charset="Shift_JIS">'),
			]);
			res.writeHead(200, { 'content-type': 'text/html', 'content-length': body.length }).end(body);
			return;
		}
		const body = path === '/embed' ? embed : path === '/favicon.ico' ? '' : html;
		res.writeHead(200, {
			'content-type': path === '/embed' || path === '/json' ? 'application/json' : 'text/html',
			'content-length': Buffer.byteLength(body),
		});
		res.end(req.method === 'HEAD' ? '' : body);
	});
	beforeAll(async () => {
		await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
		origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	});
	afterEach(() => {
		vi.unstubAllEnvs();
		for (const client of clients.splice(0)) client.dispose();
		html = '';
		embed = '';
		requests.length = 0;
	});
	afterAll(async () => {
		server.closeAllConnections();
		await new Promise<void>((resolve) => server.close(() => resolve()));
	});

	test('extracts OGP, author, ActivityPub, rating, and relative assets', async () => {
		html =
			'<title>Fallback</title><meta property="og:title" content="Article - Site"><meta property="og:site_name" content="Site"><meta name="twitter:title" content="Lower priority"><meta property="og:description" content="A &amp;amp; B"><meta property="og:image" content="/image.png"><meta name="twitter:card" content="summary_large_image"><meta name="rating" content="adult"><meta name="fediverse:creator" content="@user@example.test"><link rel="alternate" type="application/activity+json" href="/actor">';
		const result = await fetchUrlPreview(service(), `${origin}/page`, options);
		expect(result).toMatchObject({
			title: 'Article',
			description: 'A & B',
			sitename: 'Site',
			thumbnail: `${origin}/image.png`,
			icon: `${origin}/favicon.ico`,
			thumbnailStyle: 'summary_large_image',
			sensitive: true,
			activityPub: '/actor',
			fediverseCreator: '@user@example.test',
		});
		expect(requests.every((request) => request.agent === 'PreviewTest' && request.language === 'ja-JP')).toBe(true);
	});
	test('decodes legacy Japanese encoding', async () => {
		expect((await fetchUrlPreview(service(), `${origin}/sjis`, options)).title).toBe('日本語'.repeat(4));
	});
	test('keeps raw title text and decodes character references', async () => {
		html = '<title>A<title>B &amp; C</title>';
		expect((await fetchUrlPreview(service(), `${origin}/page`, options)).title).toBe('A<title>B & C');
	});
	test('follows redirects only when enabled', async () => {
		html = '<title>Destination</title>';
		expect((await fetchUrlPreview(service(), `${origin}/redirect`, options)).url).toBe(`${origin}/page`);
		requests.length = 0;
		await expect(
			fetchUrlPreview(service(), `${origin}/redirect`, { ...options, followRedirects: false }),
		).rejects.toThrow();
		expect(requests.map((request) => request.path)).toEqual(['/redirect']);
	});
	test.each(['/missing', '/json'])('rejects unsuccessful or non-HTML responses: %s', async (path) => {
		await expect(fetchUrlPreview(service(), origin + path, options)).rejects.toThrow();
	});
	test('enforces declared and streamed size limits', async () => {
		html = '<title>' + 'x'.repeat(5000) + '</title>';
		for (const path of ['/page', '/chunked'])
			await expect(fetchUrlPreview(service(), origin + path, options)).rejects.toThrow(/size limit/);
	});
	test('enforces required content length', async () => {
		html = '<title>Chunked</title>';
		await expect(
			fetchUrlPreview(service(), `${origin}/chunked`, { ...options, contentLengthRequired: true }),
		).rejects.toThrow(/content-length/);
	});
	test('aborts a stalled response', async () => {
		await expect(
			fetchUrlPreview(service(), `${origin}/slow`, { ...options, followRedirects: false, operationTimeout: 30 }),
		).rejects.toThrow();
	});
	test('extracts only permitted HTTPS oEmbed player attributes', async () => {
		html = '<link type="application/json+oembed" href="/embed">';
		embed = JSON.stringify({
			version: '1.0',
			type: 'video',
			html: '<iframe src="https://player.test/" width="640" height="1500" allow="autoplay; gyroscope" allowfullscreen></iframe>',
		});
		expect((await fetchUrlPreview(service(), `${origin}/page`, options)).player).toEqual({
			url: 'https://player.test/',
			width: 640,
			height: 1024,
			allow: ['autoplay', 'fullscreen'],
		});
	});
	test.each([
		'<iframe src="javascript:alert(1)" height="100"></iframe>',
		'<iframe src="http://player.test/" height="100"></iframe>',
		'<iframe src="https://player.test/" height="100" allow="camera"></iframe>',
		'<iframe src="https://player.test/" height="100"></iframe><iframe src="https://other.test/"></iframe>',
	])('rejects unsafe oEmbed players: %s', async (frame) => {
		html = '<link type="application/json+oembed" href="/embed">';
		embed = JSON.stringify({ version: '1.0', type: 'video', html: frame });
		expect((await fetchUrlPreview(service(), `${origin}/page`, options)).player.url).toBeNull();
	});
	test('blocks private addresses in production for pages and redirects', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		await expect(fetchUrlPreview(service([]), `${origin}/page`, options)).rejects.toThrow(/Blocked/);
		expect(requests).toHaveLength(0);
		await expect(fetchUrlPreview(service(['127.0.0.1/32']), `${origin}/private`, options)).rejects.toThrow(/Blocked/);
	});
	test('blocks private oEmbed and favicon requests before connecting', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		html =
			'<link type="application/json+oembed" href="http://127.0.0.2/embed"><link rel="icon" href="http://127.0.0.2/icon">';
		const result = await fetchUrlPreview(service(['127.0.0.1/32']), `${origin}/page`, options);
		expect(result.icon).toBeNull();
		expect(result.player.url).toBeNull();
		expect(requests.map((request) => request.path)).toEqual(['/page', '/page']);
	});
	test('rejects non-HTTP schemes', async () => {
		await expect(fetchUrlPreview(service(), 'file:///etc/passwd', options)).rejects.toThrow(/protocol/);
	});
});

describe('site-specific URL previews', () => {
	function fixtureHttp(body: string, contentType = 'text/html') {
		const send = vi.fn(async (url: string) => ({
			ok: true,
			status: 200,
			statusText: 'OK',
			url,
			headers: new Headers({ 'content-type': contentType, 'content-length': String(Buffer.byteLength(body)) }),
			text: async () => body,
			bytes: async () => new TextEncoder().encode(body),
			json: async () => JSON.parse(body),
		}));
		return { send };
	}
	test('uses Amazon product fields', async () => {
		const http = fixtureHttp(
			'<div id="title"> Product </div><div id="productDescription"> Description </div><img id="landingImage" src="https://images.test/product.jpg"><meta property="twitter:player" content="https://player.test/"><meta property="twitter:player:width" content="640">',
		);
		expect(await fetchUrlPreview(http, 'https://www.amazon.co.jp/product', options)).toMatchObject({
			title: 'Product',
			description: 'Description',
			thumbnail: 'https://images.test/product.jpg',
			sitename: 'Amazon',
			player: { url: 'https://player.test/', width: 640, allow: ['fullscreen', 'encrypted-media'] },
		});
	});
	test('uses Wikipedia extracts', async () => {
		const http = fixtureHttp(
			JSON.stringify({ query: { pages: { '1': { title: 'Article', extract: 'x'.repeat(301) } } } }),
			'application/json',
		);
		expect(await fetchUrlPreview(http, 'https://ja.wikipedia.org/wiki/Article', options)).toMatchObject({
			title: 'Article',
			description: 'x'.repeat(300) + '...',
			sitename: 'Wikipedia',
			thumbnail: 'https://wikipedia.org/static/images/project-logos/jawiki.png',
		});
		expect(http.send.mock.calls.some(([url]) => url.includes('/w/api.php?') && url.endsWith('titles=Article'))).toBe(
			true,
		);
	});
	test('reads Bluesky UTF-8 metadata', async () => {
		const http = fixtureHttp(
			'<meta property="og:title" content="日本語の投稿"><meta property="og:description" content="投稿内容">',
		);
		expect(await fetchUrlPreview(http, 'https://bsky.app/profile/example.test/post/1', options)).toMatchObject({
			title: '日本語の投稿',
			description: '投稿内容',
		});
	});
	test.each(['https://spotify.link/abc', 'https://example.app.link/abc'])(
		'requests the web destination of %s',
		async (url) => {
			const http = fixtureHttp('<title>Web destination</title>');
			expect((await fetchUrlPreview(http, url, options)).url).toBe(url);
			expect(
				http.send.mock.calls.some(([requested]) => new URL(requested).searchParams.get('$web_only') === 'true'),
			).toBe(true);
		},
	);
});
