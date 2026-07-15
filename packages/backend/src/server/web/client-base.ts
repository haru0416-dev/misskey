/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Hono } from 'hono';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiMeta } from '@/models/Meta.js';
import type { CommonData } from './views/_.js';
import { BasePage } from './views/base.js';
import { createClientCommonDataLoader } from './client-common-data.js';

export type ClientBaseDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	meta: MiMeta;
	getCommonData?: () => Promise<CommonData>;
};

function htmlResponse(html: unknown, options: {
	status?: number;
	noBody?: boolean;
	headers?: Record<string, string>;
} = {}): Response {
	const headers = new Headers({
		'Content-Type': 'text/html; charset=utf-8',
		'X-Frame-Options': 'DENY',
		...(options.headers ?? {}),
	});

	return new Response(options.noBody ? null : String(html), {
		status: options.status ?? 200,
		headers,
	});
}

export function createClientBaseApp(deps: ClientBaseDependencies): Hono {
	const app = new Hono();
	const getCommonData = deps.getCommonData ?? createClientCommonDataLoader(deps);

	async function renderBase(options: {
		noindex?: boolean;
		noBody?: boolean;
	} = {}): Promise<Response> {
		return htmlResponse(BasePage({
			...(deps.meta.bannerUrl == null ? {} : { img: deps.meta.bannerUrl }),
			title: deps.meta.name ?? 'Erebia',
			...(deps.meta.description == null ? {} : { desc: deps.meta.description }),
			...(await getCommonData()),
			...(options.noindex === undefined ? {} : { noindex: options.noindex }),
		}), {
			...(options.noBody === undefined ? {} : { noBody: options.noBody }),
			headers: {
				'Cache-Control': 'public, max-age=30',
			},
		});
	}

	app.on('HEAD', '*', async () => await renderBase({ noBody: true }));
	app.get('/tags/:tag', async () => await renderBase({ noindex: true }));
	app.get('/user-tags/:tag', async () => await renderBase({ noindex: true }));
	app.get('*', async () => await renderBase());

	return app;
}
