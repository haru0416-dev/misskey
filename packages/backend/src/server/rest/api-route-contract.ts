/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Hono } from 'hono';
import { endpointMetas } from '@/server/api/endpoint-metas.js';

const metadataFreeRoutes = new Set([
	'GET /v1/instance/peers',
	'POST /signup',
	'POST /signup-pending',
	'POST /signin-flow',
	'POST /signin-with-passkey',
	'POST /miauth/*',
	'ALL /clear-browser-cache',
]);

type ApiRoute = {
	method: string;
	path: string;
};

export function assertApiRouteContract(app: Pick<Hono, 'routes'>): void {
	const routes = app.routes.filter((route) => route.path !== '/*' && route.path !== '*' && route.method !== 'OPTIONS');
	const routeKeys = routes.map((route) => `${route.method} ${route.path}`);
	const routeKeySet = new Set(routeKeys);
	const errors: string[] = [];

	for (const routeKey of routeKeySet) {
		if (routeKeys.indexOf(routeKey) !== routeKeys.lastIndexOf(routeKey)) {
			errors.push(`Duplicate API route: ${routeKey}`);
		}
	}

	for (const [name, definition] of Object.entries(endpointMetas)) {
		const path = `/${name}`;
		if (!routeKeySet.has(`POST ${path}`)) {
			errors.push(`Endpoint metadata has no POST route: ${name}`);
		}

		const hasGetRoute = routeKeySet.has(`GET ${path}`);
		const allowsGet = 'allowGet' in definition.meta && definition.meta.allowGet === true;
		if (allowsGet && !hasGetRoute) {
			errors.push(`Endpoint metadata allows GET but no GET route exists: ${name}`);
		} else if (!allowsGet && hasGetRoute) {
			errors.push(`GET route exists without allowGet metadata: ${name}`);
		}
	}

	for (const route of routes as ApiRoute[]) {
		const routeKey = `${route.method} ${route.path}`;
		if (metadataFreeRoutes.has(routeKey)) continue;
		if (route.method !== 'GET' && route.method !== 'POST') {
			errors.push(`Unexpected API route method: ${routeKey}`);
			continue;
		}

		const endpointName = route.path.slice(1);
		if (!Object.hasOwn(endpointMetas, endpointName)) {
			errors.push(`API route has no endpoint metadata: ${routeKey}`);
		}
	}

	for (const routeKey of metadataFreeRoutes) {
		if (!routeKeySet.has(routeKey)) {
			errors.push(`Stale metadata-free API route exception: ${routeKey}`);
		}
	}

	if (errors.length > 0) {
		throw new Error(`API route contract violation:\n${errors.join('\n')}`);
	}
}
