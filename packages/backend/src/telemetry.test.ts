/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createServer } from 'node:http';
import type { AddressInfo, Server } from 'node:net';
import { context, propagation, trace } from '@opentelemetry/api';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { initializeTelemetry, recordException, shutdownTelemetry, traceHttpRequest } from '@/telemetry.js';
import type { Config } from '@/config.js';

type Received = { path: string; spans: string[] };

function captureServer(received: Received[]): Server {
	return createServer((req, res) => {
		const chunks: Buffer[] = [];
		req.on('data', (chunk: Buffer) => chunks.push(chunk));
		req.on('end', () => {
			let spans: string[] = [];
			try {
				const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
					resourceSpans?: { scopeSpans?: { spans?: { name: string }[] }[] }[];
				};
				spans = (body.resourceSpans ?? []).flatMap((r) =>
					(r.scopeSpans ?? []).flatMap((s) => (s.spans ?? []).map((span) => span.name)),
				);
			} catch {
				// JSON 以外の OTLP ペイロードからは span 名を抽出できない。
			}
			received.push({ path: req.url ?? '', spans });
			res.setHeader('content-type', 'application/json');
			res.end('{}');
		});
	});
}

async function listen(server: Server): Promise<number> {
	await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
	return (server.address() as AddressInfo).port;
}

const tracesReceived: Received[] = [];
const metricsReceived: Received[] = [];
const tracesServer = captureServer(tracesReceived);
const metricsServer = captureServer(metricsReceived);

beforeAll(async () => {
	const tracesPort = await listen(tracesServer);
	const metricsPort = await listen(metricsServer);
	await initializeTelemetry({
		runtime: { version: 'test', hostname: 'telemetry-test' },
		observability: {
			telemetry: {
				backend: {
					endpoint: `http://127.0.0.1:${tracesPort}/v1/traces`,
					metricsEndpoint: `http://127.0.0.1:${metricsPort}/v1/metrics`,
					tracesSampleRatio: 1,
				},
			},
		},
	} as unknown as Config);
});

afterAll(async () => {
	// unit は同じワーカーで他のテストと共有するので、登録したグローバルを戻す。
	trace.disable();
	context.disable();
	propagation.disable();
	await new Promise<void>((r) => tracesServer.close(() => r()));
	await new Promise<void>((r) => metricsServer.close(() => r()));
});

test('traces と metrics はそれぞれ設定した送り先へ届く', async () => {
	await traceHttpRequest(new Request('http://telemetry.test/api/x', { method: 'POST' }), () => new Response('ok'));
	recordException(new Error('telemetry test'));
	// shutdown で traces の batch と metrics の周期送信を送り切る。
	await shutdownTelemetry();

	const spanNames = tracesReceived.flatMap((r) => r.spans);
	expect(spanNames).toContain('HTTP POST');
	expect(spanNames).toContain('unhandled exception');
	expect(tracesReceived.every((r) => r.path === '/v1/traces')).toBe(true);

	expect(metricsReceived.length).toBeGreaterThan(0);
	expect(metricsReceived.every((r) => r.path === '/v1/metrics')).toBe(true);
});
