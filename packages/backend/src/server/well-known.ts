/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Hono } from 'hono';
import { permissions as kinds } from 'misskey-js';
import type { Config } from '@/config.js';
import { fetchUserByIdFromDatabase, fetchUserByUsernameAndHostFromDatabase } from '@/core/UserStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import * as Acct from '@/misc/acct.js';
import { escapeAttribute, escapeValue } from '@/misc/prelude/xml.js';
import type { MiMeta } from '@/models/_.js';
import type { MiUser } from '@/models/User.js';
import { getNodeinfoLinks } from './nodeinfo-links.js';

const webFingerPath = '/.well-known/webfinger';
const jrd = 'application/jrd+json';
const xrd = 'application/xrd+xml';

export type WellKnownDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	meta: MiMeta;
};

function corsHeaders(): Headers {
	return new Headers({
		'Access-Control-Allow-Headers': 'Accept',
		'Access-Control-Allow-Methods': 'GET, OPTIONS',
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Expose-Headers': 'Vary',
	});
}

function jsonResponse(value: unknown, headers = corsHeaders()): Response {
	if (!headers.has('Content-Type')) {
		headers.set('Content-Type', 'application/json; charset=utf-8');
	}

	return new Response(JSON.stringify(value), {
		status: 200,
		headers,
	});
}

function textResponse(value: string, contentType: string, headers = corsHeaders()): Response {
	headers.set('Content-Type', contentType);
	return new Response(value, {
		status: 200,
		headers,
	});
}

function emptyResponse(status: number, headers = corsHeaders()): Response {
	return new Response(null, {
		status,
		headers,
	});
}

function XRD(...x: { element: string, value?: string, attributes?: Record<string, string> }[]): string {
	return `<?xml version="1.0" encoding="UTF-8"?><XRD xmlns="http://docs.oasis-open.org/ns/xri/xrd-1.0">${x.map(({ element, value, attributes }) =>
		`<${
			Object.entries(typeof attributes === 'object' && attributes || {}).reduce((a, [k, v]) => `${a} ${k}="${escapeAttribute(v)}"`, element)
		}${
			typeof value === 'string' ? `>${escapeValue(value)}</${element}` : '/'
		}>`).reduce((a, c) => a + c, '')}</XRD>`;
}

function wantsXrd(accept: string | undefined): boolean {
	if (accept == null) return false;

	let xrdQ = -1;
	let jrdQ = -1;
	for (const raw of accept.split(',')) {
		const [type, ...params] = raw.trim().toLowerCase().split(';').map(x => x.trim());
		const q = Number(params.find(param => param.startsWith('q='))?.slice(2) ?? '1');
		if (!Number.isFinite(q) || q <= 0) continue;
		if (type === xrd || type === 'application/xml' || type === 'text/xml') xrdQ = Math.max(xrdQ, q);
		if (type === jrd || type === 'application/json' || type === '*/*' || type === 'application/*') jrdQ = Math.max(jrdQ, q);
	}

	return xrdQ > jrdQ;
}

function generateOAuthAuthorizationServerMetadata(config: Config): Record<string, unknown> {
	return {
		issuer: config.url,
		authorization_endpoint: new URL('/oauth/authorize', config.url).toString(),
		token_endpoint: new URL('/oauth/token', config.url).toString(),
		scopes_supported: kinds,
		response_types_supported: ['code'],
		grant_types_supported: ['authorization_code'],
		service_documentation: 'https://misskey-hub.net',
		code_challenge_methods_supported: ['S256'],
		authorization_response_iss_parameter_supported: true,
	};
}

function genLocalUserUri(config: Config, userId: MiUser['id']): string {
	return `${config.url}/users/${userId}`;
}

async function resolveWebFingerUser(deps: WellKnownDependencies, resource: string): Promise<MiUser | null | number> {
	const normalized = resource.toLowerCase();

	if (normalized.startsWith(`${deps.config.url.toLowerCase()}/users/`)) {
		const user = await fetchUserByIdFromDatabase(deps.db, normalized.split('/').pop()!);
		if (user == null || user.host !== null || user.isSuspended) return null;
		return user;
	}

	const acct = Acct.parse(
		normalized.startsWith(`${deps.config.url.toLowerCase()}/@`) ? normalized.split('/').pop()! :
		normalized.startsWith('acct:') ? normalized.slice('acct:'.length) :
		normalized,
	);
	if (acct.host && acct.host !== deps.config.host.toLowerCase()) return 422;

	const user = await fetchUserByUsernameAndHostFromDatabase(deps.db, acct.username, null);
	if (user == null || user.isSuspended) return null;
	return user;
}

function webFingerResponse(deps: WellKnownDependencies, user: MiUser, accept: string | undefined): Response {
	const headers = corsHeaders();
	headers.set('Cache-Control', 'public, max-age=180');
	headers.set('Vary', 'Accept');

	const subject = `acct:${user.username}@${deps.config.host}`;
	const self = {
		rel: 'self',
		type: 'application/activity+json',
		href: genLocalUserUri(deps.config, user.id),
	};
	const profilePage = {
		rel: 'http://webfinger.net/rel/profile-page',
		type: 'text/html',
		href: `${deps.config.url}/@${user.username}`,
	};
	if (wantsXrd(accept)) {
		return textResponse(XRD(
			{ element: 'Subject', value: subject },
			{ element: 'Link', attributes: self },
			{ element: 'Link', attributes: profilePage },
		), xrd, headers);
	}

	headers.set('Content-Type', jrd);
	return jsonResponse({
		subject,
		links: [self, profilePage],
	}, headers);
}

export function createWellKnownApp(deps: WellKnownDependencies): Hono {
	const app = new Hono();

	app.options('/.well-known/*', () => emptyResponse(204));

	app.get('/.well-known/host-meta', () => {
		if (deps.meta.federation === 'none') return emptyResponse(403);

		return textResponse(XRD({ element: 'Link', attributes: {
			rel: 'lrdd',
			type: xrd,
			template: `${deps.config.url}${webFingerPath}?resource={uri}`,
		} }), xrd);
	});

	app.get('/.well-known/host-meta.json', () => {
		if (deps.meta.federation === 'none') return emptyResponse(403);

		return jsonResponse({
			links: [{
				rel: 'lrdd',
				type: jrd,
				template: `${deps.config.url}${webFingerPath}?resource={uri}`,
			}],
		});
	});

	app.get('/.well-known/nodeinfo', () => {
		if (deps.meta.federation === 'none') return emptyResponse(403);

		return jsonResponse({ links: getNodeinfoLinks(deps.config) });
	});

	app.get('/.well-known/oauth-authorization-server', () => {
		return jsonResponse(generateOAuthAuthorizationServerMetadata(deps.config));
	});

	app.get(webFingerPath, async (c) => {
		if (deps.meta.federation === 'none') return emptyResponse(403);

		const resource = c.req.query('resource');
		if (resource == null) return emptyResponse(400);

		const user = await resolveWebFingerUser(deps, resource);
		if (typeof user === 'number') return emptyResponse(user);
		if (user == null) return emptyResponse(404);

		return webFingerResponse(deps, user, c.req.header('accept'));
	});

	return app;
}
