/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as crypto from 'node:crypto';
import { parseRequestSignature } from '@/core/activitypub/http-signature.js';
import type { ParsedSignature } from '@/core/activitypub/http-signature.js';
import { Hono } from 'hono';
import type { Config } from '@/config.js';
import type { MiMeta } from '@/models/_.js';
import type { InboxQueue } from '@/core/queue/queues.js';
import type { IActivity } from '@/core/activitypub/type.js';
import type { InboxJobData } from '@/queue/types.js';
import { queueRetentionOptions } from '@/queue/const.js';
import { readRequestBodyWithLimit } from '../body-limit.js';

export type InboxEndpointDependencies = {
	config: Config;
	meta: Pick<MiMeta, 'federation'>;
	inboxQueue: InboxQueue;
};

function rawStatus(status: number): Response {
	return new Response(null, { status });
}

const INBOX_BODY_LIMIT_BYTES = 1024 * 64;
class InboxBodyLimitExceeded extends Error {}

function enqueueInboxJob(deps: InboxEndpointDependencies, activity: IActivity, signature: ParsedSignature) {
	const data: InboxJobData = { activity, signature };
	const label = (activity.id ?? '').replace('https://', '').replace('/activity', '');
	return deps.inboxQueue.add(label, data, {
		attempts: deps.config.queues.inbox.maximumAttempts ?? 8,
		backoff: {
			type: 'custom',
		},
		...queueRetentionOptions(deps.config),
	});
}

/**
 * `POST /inbox` / `POST /users/:user/inbox` では署名パラメータの構造と Digest だけを検証してキューに積む。
 * 署名者の解決と署名検証は、キューが混雑していても受付を速く返せるよう queue/handlers/inbox.ts で行う。
 */
export async function handleInboxRequest(deps: InboxEndpointDependencies, request: Request): Promise<Response> {
	if (deps.meta.federation === 'none') {
		return rawStatus(403);
	}

	let rawBody: Uint8Array;
	try {
		rawBody = await readRequestBodyWithLimit(request, INBOX_BODY_LIMIT_BYTES, () => new InboxBodyLimitExceeded());
	} catch (error) {
		if (error instanceof InboxBodyLimitExceeded) {
			return rawStatus(413);
		}
		throw error;
	}
	const headers = Object.fromEntries(request.headers.entries());
	const url = new URL(request.url);

	let signature: ParsedSignature;
	try {
		signature = parseRequestSignature({
			method: request.method,
			url: url.pathname + url.search,
			headers,
		});
		for (const required of ['(request-target)', 'host', 'date']) {
			if (!signature.headers.includes(required)) {
				return rawStatus(401);
			}
		}
	} catch {
		return rawStatus(401);
	}

	if (headers['host'] !== deps.config.runtime.host) {
		// Host が署名対象に含まれない、または設定値と一致しない。
		return rawStatus(401);
	}

	if (!signature.headers.includes('digest')) {
		// Digest が署名対象に含まれない。
		return rawStatus(401);
	}

	const digest = headers['digest'];
	if (typeof digest !== 'string') {
		return rawStatus(401);
	}

	const digestMatch = digest.match(/^([a-zA-Z0-9-]+)=(.+)$/);
	if (digestMatch == null) {
		return rawStatus(401);
	}

	const algo = digestMatch[1]!.toUpperCase();
	const digestValue = digestMatch[2]!;
	if (algo !== 'SHA-256') {
		return rawStatus(401);
	}

	const hash = crypto.createHash('sha256').update(rawBody).digest('base64');
	if (hash !== digestValue) {
		return rawStatus(401);
	}

	let body: unknown;
	try {
		body = JSON.parse(Buffer.from(rawBody).toString('utf-8'));
	} catch {
		return rawStatus(400);
	}

	// actor のない Activity は認証できないため、inbox processor 内で失敗させずここで拒否する。
	if (typeof body !== 'object' || body == null || !('actor' in body) || (body as { actor?: unknown }).actor == null) {
		return rawStatus(400);
	}

	await enqueueInboxJob(deps, body as IActivity, signature);

	return rawStatus(202);
}

export function createInboxApp(deps: InboxEndpointDependencies): Hono {
	const app = new Hono();

	app.post('/inbox', async (c) => handleInboxRequest(deps, c.req.raw));
	app.post('/users/:user/inbox', async (c) => handleInboxRequest(deps, c.req.raw));

	return app;
}
