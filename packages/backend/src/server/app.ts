/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Hono } from 'hono';
import type { Config } from '@/config.js';
import type Logger from '@/logger.js';
import type { MiMeta } from '@/models/_.js';
import { createApiShellApp, type ApiShellDependencies } from './rest/shell.js';
import { createClientBaseApp, type ClientBaseDependencies } from './web/client-base.js';
import { createFeedApp, type FeedDependencies } from './web/feed.js';
import { createHealthApp, type HealthDependencies } from './health.js';
import { createFileServerApp, type FileServerDependencies } from './file/routes.js';
import { createNodeinfoApp, type NodeinfoDependencies } from './nodeinfo.js';
import { createOAuthApp, type OAuthDependencies } from './oauth/routes.js';
import { createOpenApiApp, type OpenApiDependencies } from './openapi.js';
import { createRootRoutes, type RootRouteDependencies } from './root-routes.js';
import { createStaticAssetsApp, type StaticAssetsDependencies } from './static-assets.js';
import { createUrlPreviewApp, type UrlPreviewDependencies } from './web/url-preview.js';
import { createWebUtilityApp, type WebUtilityDependencies } from './web-utility.js';
import { createWebMetadataApp, type WebMetadataDependencies } from './web/web-metadata.js';
import { createWellKnownApp, type WellKnownDependencies } from './well-known.js';
import { createInboxApp, type InboxEndpointDependencies } from './activitypub/inbox-endpoint.js';
import { createApObjectRoutesApp, type ApObjectRoutesDependencies } from './activitypub/object-routes.js';
import { createClientPagesApp, type ClientPagesDependencies } from './web/client-pages.js';

export type HttpMiddlewareDependencies = {
	config: Config;
	meta: MiMeta;
	logger?: Logger;
};

export type MisskeyHonoAppDependencies = {
	http: HttpMiddlewareDependencies;
	apiShell: ApiShellDependencies;
	clientBase: ClientBaseDependencies;
	feed: FeedDependencies;
	file: FileServerDependencies;
	health: HealthDependencies;
	nodeinfo: NodeinfoDependencies;
	oauth: OAuthDependencies;
	openApi: OpenApiDependencies;
	root: RootRouteDependencies;
	staticAssets: StaticAssetsDependencies;
	urlPreview: UrlPreviewDependencies;
	webUtility: WebUtilityDependencies;
	webMetadata: WebMetadataDependencies;
	wellKnown: WellKnownDependencies;
	inbox: InboxEndpointDependencies;
	apObject: ApObjectRoutesDependencies;
	clientPages: ClientPagesDependencies;
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

	// API シェルは runApiEndpoint が例外を捕捉するが、それ以外のルート (web SSR / file /
	// well-known / oauth 等) の未捕捉例外は Hono デフォルトだとログ無しの 500 テキストになる。
	// サーバーログに残るように onError で明示的にハンドリングする。
	app.onError((err, c) => {
		deps.http.logger?.error(err instanceof Error ? err : new Error(String(err)), { path: c.req.path });
		return new Response('Internal Server Error', {
			status: 500,
			headers: { 'Content-Type': 'text/plain; charset=utf-8' },
		});
	});

	registerHttpMiddleware(app, deps.http);
	app.route('/api', createApiShellApp(deps.apiShell));
	app.route('/healthz', createHealthApp(deps.health));
	app.route('/', createNodeinfoApp(deps.nodeinfo));
	app.route('/', createOpenApiApp(deps.openApi));
	app.route('/', createWellKnownApp(deps.wellKnown));
	app.route('/oauth', createOAuthApp(deps.oauth));
	app.route('/', createFileServerApp(deps.file));
	app.route('/', createStaticAssetsApp(deps.staticAssets));
	app.route('/', createWebMetadataApp(deps.webMetadata));
	app.route('/', createWebUtilityApp(deps.webUtility));
	app.route('/', createFeedApp(deps.feed));
	app.route('/', createUrlPreviewApp(deps.urlPreview));
	app.route('/', createRootRoutes(deps.root));
	app.route('/', createInboxApp(deps.inbox));
	app.route('/', createApObjectRoutesApp(deps.apObject));
	app.route('/', createClientPagesApp(deps.clientPages));
	app.route('/', createClientBaseApp(deps.clientBase));

	return app;
}
