/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Hono } from 'hono';
import type { Config } from '@/config.js';
import type { MiMeta } from '@/models/_.js';

export type WebMetadataDependencies = {
	config: Config;
	meta: MiMeta;
};

function createManifest(deps: WebMetadataDependencies): Record<string, unknown> {
	const manifest = {
		short_name: deps.meta.shortName || deps.meta.name || deps.config.runtime.host,
		name: deps.meta.name || deps.config.runtime.host,
		start_url: '/',
		display: 'standalone',
		background_color: '#313a42',
		theme_color: deps.meta.themeColor || '#86b300',
		icons: [{
			src: deps.meta.app192IconUrl || '/client-assets/erebia-icon-192.png',
			sizes: '192x192',
			type: 'image/png',
			purpose: 'maskable',
		}, {
			src: deps.meta.app512IconUrl || '/client-assets/erebia-icon.png',
			sizes: '512x512',
			type: 'image/png',
			purpose: 'maskable',
		}, {
			src: '/client-assets/erebia-icon.svg',
			sizes: 'any',
			type: 'image/svg+xml',
			purpose: 'any',
		}],
		share_target: {
			action: '/share/',
			method: 'GET',
			enctype: 'application/x-www-form-urlencoded',
			params: {
				title: 'title',
				text: 'text',
				url: 'url',
			},
		},
		shortcuts: [{
			name: 'Safemode',
			url: '/?safemode=true',
		}],
	};

	return {
		...manifest,
		...JSON.parse(deps.meta.manifestJsonOverride === '' ? '{}' : deps.meta.manifestJsonOverride),
	};
}

function createRobotsTxt(meta: MiMeta): string {
	const disallowedPaths = [
		'/settings',
		'/admin',
		'/custom-emojis-manager',
		'/avatar-decorations',
		'/share',
		'/my',
		'/api',
		'/inbox',
		'/oauth',
		'/proxy',
		'/url',
	];

	if (meta.ugcVisibilityForVisitor === 'none') {
		disallowedPaths.push(
			'/@',
			'/notes',
		);
	}

	let content = 'User-agent: *\n';
	content += `${disallowedPaths.map((path) => `Disallow: ${path}`).join('\n')}\n`;
	content += 'Allow: /\n';
	content += '\n# todo: sitemap\n';
	return content;
}

function createOpenSearchXml(deps: WebMetadataDependencies): string {
	const name = deps.meta.name ?? 'Erebia';
	let content = '';
	content += '<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/" xmlns:moz="http://www.mozilla.org/2006/browser/search/">';
	content += `<ShortName>${name}</ShortName>`;
	content += `<Description>${name} Search</Description>`;
	content += '<InputEncoding>UTF-8</InputEncoding>';
	content += `<Image width="16" height="16" type="image/x-icon">${deps.config.instance.url}/favicon.ico</Image>`;
	content += `<Url type="text/html" template="${deps.config.instance.url}/search?q={searchTerms}"/>`;
	content += '</OpenSearchDescription>';
	return content;
}

export function createWebMetadataApp(deps: WebMetadataDependencies): Hono {
	const app = new Hono();

	app.get('/manifest.json', () => {
		return new Response(JSON.stringify(createManifest(deps)), {
			status: 200,
			headers: {
				'Cache-Control': 'max-age=300',
				'Content-Type': 'application/json; charset=utf-8',
			},
		});
	});

	app.get('/robots.txt', () => {
		return new Response(createRobotsTxt(deps.meta), {
			status: 200,
			headers: {
				'Content-Type': 'text/plain; charset=utf-8',
			},
		});
	});

	app.get('/opensearch.xml', () => {
		return new Response(createOpenSearchXml(deps), {
			status: 200,
			headers: {
				'Content-Type': 'application/opensearchdescription+xml',
			},
		});
	});

	return app;
}
