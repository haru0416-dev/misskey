/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Hono, type Context } from 'hono';
import type { Config } from '@/config.js';
import type { MiMeta } from '@/models/_.js';
import { BiosPage } from './web/views/bios.js';
import { CliPage } from './web/views/cli.js';
import { FlushPage } from './web/views/flush.js';
import { InfoCardPage } from './web/views/info-card.js';

export type WebUtilityDependencies = {
	config: Config;
	meta: MiMeta;
};

function htmlResponse(c: Context, html: unknown, options: {
	status?: number;
	xFrameOptions?: 'DENY' | null;
	headers?: Record<string, string>;
} = {}): Response {
	const headers = new Headers({
		'Content-Type': 'text/html; charset=utf-8',
		...(options.headers ?? {}),
	});

	if (options.xFrameOptions !== null) {
		headers.set('X-Frame-Options', options.xFrameOptions ?? 'DENY');
	}

	if (c.req.method === 'HEAD') {
		return new Response(null, {
			status: options.status ?? 200,
			headers,
		});
	}

	return new Response(String(html), {
		status: options.status ?? 200,
		headers,
	});
}

function shouldSendFlushHeader(origin: string | undefined, configUrl: URL): boolean {
	if (origin == null) return true;

	const originUrl = new URL(origin);
	return originUrl.protocol === 'https:' && originUrl.host === configUrl.host;
}

export function createWebUtilityApp(deps: WebUtilityDependencies): Hono {
	const app = new Hono();
	const configUrl = new URL(deps.config.instance.url);

	app.get('/_info_card_', (c) => htmlResponse(c, InfoCardPage({
		version: deps.config.runtime.version,
		config: deps.config,
		meta: deps.meta,
	}), {
		xFrameOptions: null,
	}));

	app.get('/bios', (c) => htmlResponse(c, BiosPage({
		version: deps.config.runtime.version,
	})));

	app.get('/cli', (c) => htmlResponse(c, CliPage({
		version: deps.config.runtime.version,
	})));

	app.get('/flush', (c) => {
		const headers: Record<string, string> = {
			'Set-Cookie': 'http-flush-failed=1; Path=/flush; Max-Age=60',
		};

		if (shouldSendFlushHeader(c.req.header('origin'), configUrl)) {
			headers['Clear-Site-Data'] = '"*"';
		}

		return htmlResponse(c, FlushPage(), {
			headers,
		});
	});

	app.get('/streaming', (c) => {
		c.header('Cache-Control', 'private, max-age=0');
		return c.body(null, 503);
	});

	return app;
}
