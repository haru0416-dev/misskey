/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Hono } from 'hono';
import type { Config } from '@/config.js';
import { DEFAULT_POLICIES } from '@/core/role-policies.js';
import { countNotesByUserHostFromDatabase } from '@/core/NoteStore.js';
import { fetchOrCreateSystemAccount } from '@/core/system-account-runtime.js';
import { countUsersByHostFromDatabase } from '@/core/UserStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { MemorySingleCache } from '@/misc/cache.js';
import { MAX_NOTE_TEXT_LENGTH } from '@/const.js';
import type { MiMeta } from '@/models/_.js';
import { nodeinfo2_0path, nodeinfo2_1path } from './nodeinfo-links.js';

export type NodeinfoDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	meta: MiMeta;
};

function nodeinfoHeaders(version: '2.0' | '2.1'): Headers {
	return new Headers({
		'Content-Type': `application/json; profile="http://nodeinfo.diaspora.software/ns/schema/${version}#"`,
		'Cache-Control': 'public, max-age=600',
		'Access-Control-Allow-Headers': 'Accept',
		'Access-Control-Allow-Methods': 'GET, OPTIONS',
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Expose-Headers': 'Vary',
	});
}

function jsonResponse(value: unknown, headers: Headers): Response {
	return new Response(JSON.stringify(value), {
		status: 200,
		headers,
	});
}

async function createNodeinfoDocument(deps: NodeinfoDependencies, version: '2.0' | '2.1'): Promise<Record<string, unknown>> {
	const [localPosts, total, proxyAccount] = await Promise.all([
		countNotesByUserHostFromDatabase(deps.db, null),
		countUsersByHostFromDatabase(deps.db, null),
		fetchOrCreateSystemAccount(deps.db, deps.config, deps.meta, 'proxy'),
	]);

	const meta = deps.meta;
	const basePolicies = { ...DEFAULT_POLICIES, ...meta.policies };
	const software: Record<string, unknown> & {
		name: string;
		version: string;
		homepage: string | null;
		repository?: string | null;
	} = {
		name: 'erebia',
		version: deps.config.runtime.version,
		homepage: meta.repositoryUrl,
		repository: meta.repositoryUrl,
	};

	if (version === '2.1') {
		software.repository = meta.repositoryUrl;
		software.homepage = meta.repositoryUrl;
	} else {
		delete software.repository;
	}

	return {
		version,
		software,
		protocols: ['activitypub'],
		services: {
			inbound: [],
			outbound: ['atom1.0', 'rss2.0'],
		},
		openRegistrations: !meta.disableRegistration,
		usage: {
			users: { total, activeHalfyear: null, activeMonth: null },
			localPosts,
			localComments: 0,
		},
		metadata: {
			nodeName: meta.name,
			nodeDescription: meta.description,
			nodeAdmins: [{
				name: meta.maintainerName,
				email: meta.maintainerEmail,
			}],
			maintainer: {
				name: meta.maintainerName,
				email: meta.maintainerEmail,
			},
			langs: meta.langs,
			tosUrl: meta.termsOfServiceUrl,
			privacyPolicyUrl: meta.privacyPolicyUrl,
			inquiryUrl: meta.inquiryUrl,
			impressumUrl: meta.impressumUrl,
			repositoryUrl: meta.repositoryUrl,
			feedbackUrl: meta.feedbackUrl,
			disableRegistration: meta.disableRegistration,
			disableLocalTimeline: !basePolicies.ltlAvailable,
			disableGlobalTimeline: !basePolicies.gtlAvailable,
			emailRequiredForSignup: meta.emailRequiredForSignup,
			enableHcaptcha: meta.enableHcaptcha,
			enableRecaptcha: meta.enableRecaptcha,
			enableMcaptcha: meta.enableMcaptcha,
			enableTurnstile: meta.enableTurnstile,
			maxNoteTextLength: MAX_NOTE_TEXT_LENGTH,
			enableEmail: meta.enableEmail,
			enableServiceWorker: meta.enableServiceWorker,
			proxyAccountName: proxyAccount.username,
			themeColor: meta.themeColor ?? '#5c62d8',
		},
	};
}

export function createNodeinfoApp(deps: NodeinfoDependencies): Hono {
	const app = new Hono();
	const cache20 = new MemorySingleCache<Record<string, unknown>>(1000 * 60 * 10);
	const cache21 = new MemorySingleCache<Record<string, unknown>>(1000 * 60 * 10);

	app.get(nodeinfo2_1path, async () => {
		const document = await cache21.fetch(() => createNodeinfoDocument(deps, '2.1'));
		return jsonResponse(document, nodeinfoHeaders('2.1'));
	});

	app.get(nodeinfo2_0path, async () => {
		const document = await cache20.fetch(() => createNodeinfoDocument(deps, '2.0'));
		return jsonResponse(document, nodeinfoHeaders('2.0'));
	});

	return app;
}
