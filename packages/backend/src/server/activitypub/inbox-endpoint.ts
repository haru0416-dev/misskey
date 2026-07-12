/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as crypto from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { Hono } from 'hono';
import httpSignature from '@peertube/http-signature';
import type { Config } from '@/config.js';
import type { MiMeta } from '@/models/_.js';
import type { InboxQueue } from '@/core/queues.js';
import type { IActivity } from '@/core/activitypub/type.js';
import type { InboxJobData } from '@/queue/types.js';

export type InboxEndpointDependencies = {
	config: Config;
	meta: Pick<MiMeta, 'federation'>;
	inboxQueue: InboxQueue;
};

function rawStatus(status: number): Response {
	return new Response(null, { status });
}

// ActivityPubServerService の inbox ルート登録時の bodyLimit: 1024 * 64 相当。
const INBOX_BODY_LIMIT_BYTES = 1024 * 64;

/**
 * QueueService.inbox 相当。ジョブ名はアクティビティIDから生成する。
 */
function enqueueInboxJob(deps: InboxEndpointDependencies, activity: IActivity, signature: httpSignature.IParsedSignature) {
	const data: InboxJobData = { activity, signature };
	const label = (activity.id ?? '').replace('https://', '').replace('/activity', '');
	return deps.inboxQueue.add(label, data, {
		attempts: deps.config.inboxJobMaxAttempts ?? 8,
		backoff: {
			type: 'custom',
		},
		removeOnComplete: {
			age: 3600 * 24 * 7,
			count: 30,
		},
		removeOnFail: {
			age: 3600 * 24 * 7,
			count: 100,
		},
	});
}

/**
 * ActivityPubServerService#inbox 相当。`POST /inbox` / `POST /users/:user/inbox` の
 * HTTP-Signature検証(のうち、リクエスト構造上のパラメータ検証部分)とDigest検証を行い、
 * 妥当なアクティビティのみ inboxQueue に積む。実際の署名者解決・署名検証自体は
 * (キューが混雑していても受付だけは高速に返せるよう) キュー処理側 (hono-queue-inbox.ts) で行う。
 */
export async function handleInboxRequest(deps: InboxEndpointDependencies, request: Request): Promise<Response> {
	if (deps.meta.federation === 'none') {
		return rawStatus(403);
	}

	const contentLength = request.headers.get('content-length');
	if (contentLength != null && Number(contentLength) > INBOX_BODY_LIMIT_BYTES) {
		return rawStatus(413);
	}

	const rawBody = await request.arrayBuffer();
	if (rawBody.byteLength > INBOX_BODY_LIMIT_BYTES) {
		return rawStatus(413);
	}
	const headers = Object.fromEntries(request.headers.entries());
	const url = new URL(request.url);

	let signature: httpSignature.IParsedSignature;
	try {
		// httpSignature.parseRequest の型定義はNode標準の IncomingMessage を要求するが、
		// 実装が実際に参照するのは method/url/headers のみ (Fetch API の Request からの最小限のシム)。
		const requestShim = {
			method: request.method,
			url: url.pathname + url.search,
			headers,
		} as unknown as IncomingMessage;
		signature = httpSignature.parseRequest(requestShim, { headers: ['(request-target)', 'host', 'date'], authorizationHeaderName: 'signature' });
	} catch {
		return rawStatus(401);
	}

	if (signature.params.headers.indexOf('host') === -1 || headers.host !== deps.config.host) {
		// Host not specified or not match.
		return rawStatus(401);
	}

	if (signature.params.headers.indexOf('digest') === -1) {
		// Digest not found.
		return rawStatus(401);
	}

	const digest = headers.digest;
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

	const hash = crypto.createHash('sha256').update(Buffer.from(rawBody)).digest('base64');
	if (hash !== digestValue) {
		return rawStatus(401);
	}

	let body: unknown;
	try {
		body = JSON.parse(Buffer.from(rawBody).toString('utf-8'));
	} catch {
		return rawStatus(400);
	}

	// Reject structurally invalid activities (e.g. missing actor) here instead
	// of letting them fail deep inside the inbox processor. An actor-less
	// activity can never be authenticated, so there is no point enqueueing it.
	if (typeof body !== 'object' || body == null || !('actor' in body) || (body as { actor?: unknown }).actor == null) {
		return rawStatus(400);
	}

	await enqueueInboxJob(deps, body as IActivity, signature);

	return rawStatus(202);
}

export function createInboxApp(deps: InboxEndpointDependencies): Hono {
	const app = new Hono();

	app.post('/inbox', async c => handleInboxRequest(deps, c.req.raw));
	app.post('/users/:user/inbox', async c => handleInboxRequest(deps, c.req.raw));

	return app;
}
