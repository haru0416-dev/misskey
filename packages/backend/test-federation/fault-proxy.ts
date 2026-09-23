/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createServer, request } from 'node:http';

type Mode = 'pass' | 'outage' | 'response-loss';
type Observation = {
	sequence: number;
	id?: string;
	type?: string;
	actor?: string;
	objectUri?: string;
	uris: string[];
	mode: Mode;
	status?: number;
	outcome: 'pending' | 'rejected' | 'lost' | 'acknowledged' | 'error';
};
type State = {
	mode: Mode;
	activityType?: string;
	matched: number;
	forwarded: number;
	lost: number;
	rejected: number;
	active: number;
	lastSequence: number;
	observations: Observation[];
};
const states: Record<string, State | undefined> = {
	'a.test': {
		mode: 'pass',
		matched: 0,
		forwarded: 0,
		lost: 0,
		rejected: 0,
		active: 0,
		lastSequence: 0,
		observations: [],
	},
	'b.test': {
		mode: 'pass',
		matched: 0,
		forwarded: 0,
		lost: 0,
		rejected: 0,
		active: 0,
		lastSequence: 0,
		observations: [],
	},
};

function collectUris(value: unknown, uris: Set<string>): void {
	if (typeof value === 'string') {
		if (/^https?:\/\//.test(value)) uris.add(value);
	} else if (Array.isArray(value)) {
		for (const item of value) collectUris(item, uris);
	} else if (value != null && typeof value === 'object') {
		for (const item of Object.values(value)) collectUris(item, uris);
	}
}

createServer(async (incoming, outgoing) => {
	const host = String(incoming.headers['x-federation-target'] ?? incoming.headers.host ?? '');
	const state = states[host];
	if (!state || incoming.method !== 'POST' || !/^\/(?:users\/[^/]+\/)?inbox(?:\?.*)?$/.test(incoming.url ?? '')) {
		outgoing.writeHead(400).end();
		return;
	}
	const downstream = incoming.socket;
	const chunks: Buffer[] = [];
	for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
	const body = Buffer.concat(chunks);
	let activity: { type?: string; id?: string; actor?: string; object?: string | { id?: string } } = {};
	try {
		activity = JSON.parse(body.toString());
	} catch {
		/* 不正 JSON も本物の inbox で判定する。 */
	}
	const matches = state.activityType == null || activity.type === state.activityType;
	const mode = matches ? state.mode : 'pass';
	const uris = new Set<string>();
	collectUris(activity, uris);
	const observation: Observation = {
		sequence: ++state.lastSequence,
		id: activity.id,
		type: activity.type,
		actor: activity.actor,
		objectUri: typeof activity.object === 'string' ? activity.object : activity.object?.id,
		uris: [...uris],
		mode,
		outcome: 'pending',
	};
	// 受信側が拒否した本文も境界を越えているため、転送前から記録する。
	state.observations.push(observation);
	if (matches) state.matched++;
	if (mode === 'outage') {
		state.rejected++;
		observation.status = 503;
		observation.outcome = 'rejected';
		outgoing.writeHead(503).end('Federation test outage');
		return;
	}
	state.active++;
	const upstream = request(
		{ hostname: `misskey.${host}`, port: 3000, path: incoming.url, method: 'POST', headers: incoming.headers },
		(response) => {
			const received: Buffer[] = [];
			response.on('data', (chunk: Buffer) => received.push(chunk));
			response.on('end', () => {
				state.active--;
				if (matches) state.forwarded++;
				observation.status = response.statusCode;
				console.log(JSON.stringify({ host, type: activity.type, id: activity.id, status: response.statusCode, mode }));
				const successful = response.statusCode != null && response.statusCode >= 200 && response.statusCode < 300;
				if (mode === 'response-loss' && successful) {
					state.lost++;
					observation.outcome = 'lost';
					// Bun 1.4.0 の非同期応答破棄は 200 を返すため、TCP 接続を直接閉じる。
					downstream.destroy();
				} else {
					outgoing.once('finish', () => {
						observation.outcome = successful ? 'acknowledged' : 'rejected';
					});
					outgoing.writeHead(response.statusCode ?? 502, response.headers).end(Buffer.concat(received));
				}
			});
		},
	);
	upstream.on('error', (error) => {
		state.active--;
		observation.outcome = 'error';
		console.error(error);
		outgoing.writeHead(502).end();
	});
	upstream.end(body);
}).listen(8080, '0.0.0.0');

// 制御ポートは compose の内部ネットワークだけに置き、公開 nginx からは到達させない。
createServer(async (incoming, outgoing) => {
	const url = new URL(incoming.url ?? '/', 'http://control');
	const state = states[url.pathname.slice(1)];
	if (!state) {
		outgoing.writeHead(404).end();
		return;
	}
	if (incoming.method === 'POST') {
		const chunks: Buffer[] = [];
		for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
		let value: { mode?: string; activityType?: string };
		try {
			value = JSON.parse(Buffer.concat(chunks).toString());
		} catch {
			outgoing.writeHead(400).end();
			return;
		}
		if (!['pass', 'outage', 'response-loss'].includes(value.mode ?? '')) {
			outgoing.writeHead(400).end();
			return;
		}
		state.mode = value.mode as Mode;
		state.activityType = value.activityType;
		if (state.mode !== 'pass') {
			state.matched = 0;
			state.forwarded = 0;
			state.lost = 0;
			state.rejected = 0;
		}
	}
	const after = Number(url.searchParams.get('after') ?? 0);
	if (!Number.isSafeInteger(after) || after < 0) {
		outgoing.writeHead(400).end();
		return;
	}
	outgoing.setHeader('content-type', 'application/json');
	outgoing.end(JSON.stringify({ ...state, observations: state.observations.filter((item) => item.sequence > after) }));
}).listen(8081, '0.0.0.0');
