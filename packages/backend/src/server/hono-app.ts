/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Hono } from 'hono';
import type { Config } from '@/config.js';
import type { MiMeta } from '@/models/_.js';
import { createHealthApp, type HealthDependencies } from './health.js';
import { createNodeinfoApp, type NodeinfoDependencies } from './hono-nodeinfo.js';
import { createRootRoutes, type RootRouteDependencies } from './hono-root-routes.js';
import { createWellKnownApp, type WellKnownDependencies } from './hono-well-known.js';

export type HttpMiddlewareDependencies = {
	config: Config;
	meta: MiMeta;
};

export type MisskeyHonoAppDependencies = {
	http: HttpMiddlewareDependencies;
	health: HealthDependencies;
	nodeinfo: NodeinfoDependencies;
	root: RootRouteDependencies;
	wellKnown: WellKnownDependencies;
};

const maybeApLookupRegex = /application\/activity\+json|application\/ld\+json.+activitystreams/i;

function isInternalActivityPubRedirect(location: string, config: Config): boolean {
	const effectiveLocation = process.env.NODE_ENV === 'production' ? location : location.replace(/^http:\/\//, 'https://');
	return effectiveLocation.startsWith(`https://${config.host}/`);
}

function activityPubRedirectRefusal(location: string, headers: Headers): Response {
	const nextHeaders = new Headers(headers);
	nextHeaders.delete('location');
	nextHeaders.set('content-type', 'text/plain; charset=utf-8');
	nextHeaders.set('link', `<${encodeURI(location)}>; rel="canonical"`);

	return new Response([
		'Refusing to relay remote ActivityPub object lookup.',
		'',
		`Please remove 'application/activity+json' and 'application/ld+json' from the Accept header or fetch using the authoritative URL at ${location}.`,
	].join('\n'), {
		status: 406,
		headers: nextHeaders,
	});
}

function registerHttpMiddleware(app: Hono, deps: HttpMiddlewareDependencies): void {
	if (deps.config.url.startsWith('https') && !deps.config.disableHsts) {
		app.use('*', async (c, next) => {
			c.header('strict-transport-security', 'max-age=15552000; preload');
			await next();
		});
	}

	if (!deps.meta.allowExternalApRedirect) {
		app.use('*', async (c, next) => {
			await next();

			const location = c.res.headers.get('location');
			if (c.res.status < 300 || c.res.status >= 400 || location == null) return;
			if (!maybeApLookupRegex.test(c.req.header('accept') ?? '')) return;
			if (isInternalActivityPubRedirect(location, deps.config)) return;

			c.res = activityPubRedirectRefusal(location, c.res.headers);
			c.res.headers.delete('location');
		});
	}
}

export function createMisskeyHonoApp(deps: MisskeyHonoAppDependencies): Hono {
	const app = new Hono();

	registerHttpMiddleware(app, deps.http);
	app.route('/healthz', createHealthApp(deps.health));
	app.route('/', createNodeinfoApp(deps.nodeinfo));
	app.route('/', createWellKnownApp(deps.wellKnown));
	app.route('/', createRootRoutes(deps.root));

	return app;
}
