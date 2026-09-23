/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { deepStrictEqual, strictEqual } from 'assert';
import { readFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createHash, sign } from 'node:crypto';
import { request as httpsRequest } from 'node:https';
import { Pool } from 'pg';
import { Redis } from 'ioredis';
import { Object as FedifyObject } from '@fedify/vocab';
import * as Misskey from 'misskey-js';
import { WebSocket } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const ADMIN_PARAMS = { username: 'admin', password: 'admin' };
const ADMIN_CACHE = new Map<Host, SigninResponse>();

await Promise.all([fetchAdmin('a.test'), fetchAdmin('b.test')]);

type SigninResponse = Omit<Misskey.entities.SigninFlowResponse & { finished: true }, 'finished'>;

export type LoginUser = SigninResponse & {
	client: Misskey.api.APIClient;
	username: string;
	password: string;
};

/** オーバーロードと一部 endpoint の呼び出しに対応するための型。 */
export type Request = <E extends keyof Misskey.Endpoints, P extends Misskey.Endpoints[E]['req']>(
	endpoint: E,
	params: P,
	credential?: string | null,
) => Promise<Misskey.api.SwitchCaseResponseType<E, P>>;

export type Host = 'a.test' | 'b.test';

export function hostKind(host: Host): 'fork' | 'upstream' {
	const kind = process.env['FEDERATION_PEER_B_KIND'] ?? 'fork';
	if (kind !== 'fork' && kind !== 'upstream') throw new Error(`Invalid FEDERATION_PEER_B_KIND: ${kind}`);
	return host === 'b.test' ? kind : 'fork';
}

export async function fetchActivityPubObject(uri: string): Promise<FedifyObject> {
	const response = await fetch(uri, {
		headers: {
			accept: 'application/activity+json',
		},
	});
	strictEqual(response.status, 200);
	strictEqual(response.headers.get('content-type')?.startsWith('application/activity+json'), true);

	return await FedifyObject.fromJsonLd(await response.json());
}

export async function sleep(ms = 250): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitFor(
	condition: () => boolean | Promise<boolean>,
	timeoutMs = 5000,
	intervalMs = 100,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	do {
		if (await condition()) {
			return;
		}
		await sleep(intervalMs);
	} while (Date.now() < deadline);

	throw new Error(`Condition was not met within ${timeoutMs}ms`);
}

async function signin(host: Host, params: Misskey.entities.SigninFlowRequest): Promise<SigninResponse> {
	// IP ごとに1時間10回の制限があるため、テスト専用 proxy 越しのログインを独立したクライアントとして扱う。
	const clientIp = `2001:db8:${crypto.randomUUID().replaceAll('-', '').slice(0, 24).match(/.{4}/g)!.join(':')}`;
	const client = new Misskey.api.APIClient({
		origin: `https://${host}`,
		fetch: (input, init) =>
			fetch(input, {
				...init,
				headers: { ...init?.headers, 'x-forwarded-for': clientIp },
				signal: AbortSignal.timeout(10_000),
			}),
	});
	const res = await (client.request as Request)('signin-flow', params);
	strictEqual(res.finished, true);
	if (params.username === ADMIN_PARAMS.username) {
		ADMIN_CACHE.set(host, res);
	}
	return { id: res.id, i: res.i };
}

async function createAdmin(host: Host): Promise<Misskey.entities.SignupResponse | undefined> {
	const client = new Misskey.api.APIClient({ origin: `https://${host}` });
	return await client
		.request('admin/accounts/create', {
			...ADMIN_PARAMS,
			...(hostKind(host) === 'upstream' ? { setupPassword: 'federation-upstream-setup' } : {}),
		})
		.then((res) => {
			ADMIN_CACHE.set(host, {
				id: res.id,
				i: res.token,
			});
			return res as Misskey.entities.SignupResponse;
		})
		.then(async (res) => {
			await client.request(
				'admin/roles/update-default-policies',
				{
					policies: {
						// misskey-js の型に rateLimitFactor が反映されていない。
						rateLimitFactor: 0 as never,
					},
				},
				res.token,
			);
			await client.request(
				'admin/update-meta',
				{
					federation: 'all',
				},
				res.token,
			);
			return res;
		})
		.catch((err) => {
			if (err.code === 'ACCESS_DENIED') {
				return undefined;
			}
			throw err;
		});
}

export async function fetchAdmin(host: Host): Promise<LoginUser> {
	const admin =
		ADMIN_CACHE.get(host) ??
		(await signin(host, ADMIN_PARAMS).catch(async (err) => {
			const errorId = hostKind(host) === 'upstream' ? err.error?.id : err.id;
			if (errorId === '6cc579cc-885d-43d8-95c2-b8c7fc963280') {
				await createAdmin(host);
				return await signin(host, ADMIN_PARAMS);
			}
			throw err;
		}));

	return {
		...admin,
		client: new Misskey.api.APIClient({ origin: `https://${host}`, credential: admin.i }),
		...ADMIN_PARAMS,
	};
}

export async function createAccount(host: Host): Promise<LoginUser> {
	const username = crypto.randomUUID().replaceAll('-', '').substring(0, 20);
	const password = crypto.randomUUID().replaceAll('-', '');
	const admin = await fetchAdmin(host);
	const created = await admin.client.request('admin/accounts/create', { username, password });
	const signinRes = { id: created.id, i: created.token };

	return {
		...signinRes,
		client: new Misskey.api.APIClient({ origin: `https://${host}`, credential: signinRes.i }),
		username,
		password,
	};
}

export async function createModerator(host: Host): Promise<LoginUser> {
	const user = await createAccount(host);
	const role = await createRole(host, {
		name: 'Moderator',
		isModerator: true,
	});
	const admin = await fetchAdmin(host);
	await admin.client.request('admin/roles/assign', { roleId: role.id, userId: user.id });
	return user;
}

export async function createRole(
	host: Host,
	params: Partial<Misskey.entities.AdminRolesCreateRequest> = {},
): Promise<Misskey.entities.Role> {
	const admin = await fetchAdmin(host);
	return await admin.client.request('admin/roles/create', {
		name: 'Some role',
		description: 'Role for testing',
		color: null,
		iconUrl: null,
		target: 'conditional',
		condFormula: {},
		isPublic: true,
		isModerator: false,
		isAdministrator: false,
		isExplorable: true,
		asBadge: false,
		canEditMembersByModerator: false,
		displayOrder: 0,
		policies: {},
		...params,
	});
}

export async function resolveRemoteUser(
	host: Host,
	id: string,
	from: LoginUser,
): Promise<Misskey.entities.UserDetailedNotMe> {
	const uri = `https://${host}/users/${id}`;
	return await from.client.request('ap/show', { uri }).then((res) => {
		strictEqual(res.type, 'User');
		strictEqual(res.object.uri, uri);
		return res.object;
	});
}

export async function resolveRemoteNote(host: Host, id: string, from: LoginUser): Promise<Misskey.entities.Note> {
	const uri = `https://${host}/notes/${id}`;
	return await from.client.request('ap/show', { uri }).then((res) => {
		strictEqual(res.type, 'Note');
		strictEqual(res.object.uri, uri);
		return res.object;
	});
}

export async function uploadFile(
	host: Host,
	user: { i: string },
	path = '../../test/resources/192.jpg',
): Promise<Misskey.entities.DriveFile> {
	const filename = path.split('/').pop() ?? 'untitled';
	const buffer = await readFile(join(__dirname, path));
	const blob = new Blob([new Uint8Array(buffer)]);

	const body = new FormData();
	body.append('i', user.i);
	body.append('force', 'true');
	body.append('file', blob);
	body.append('name', filename);

	const response = await fetch(`https://${host}/api/drive/files/create`, {
		method: 'POST',
		body,
		signal: AbortSignal.timeout(30_000),
	});
	const result = await response.json();
	strictEqual(response.status, 200, `${host} upload failed: ${JSON.stringify(result)}`);
	return result;
}

export async function addCustomEmoji(
	host: Host,
	param?: Partial<Misskey.entities.AdminEmojiAddRequest>,
	path?: string,
): Promise<Misskey.entities.EmojiDetailed> {
	const admin = await fetchAdmin(host);
	const name = crypto.randomUUID().replaceAll('-', '');
	const file = await uploadFile(host, admin, path);
	return await admin.client.request('admin/emoji/add', { name, fileId: file.id, ...param });
}

export function deepStrictEqualWithExcludedFields<T>(actual: T, expected: T, excludedFields: (keyof T)[]) {
	const _actual = structuredClone(actual);
	const _expected = structuredClone(expected);
	for (const obj of [_actual, _expected]) {
		for (const field of excludedFields) {
			delete obj[field];
		}
	}
	deepStrictEqual(_actual, _expected);
}

export async function isFired<C extends keyof Misskey.Channels, T extends keyof Misskey.Channels[C]['events']>(
	host: Host,
	user: { i: string },
	channel: C,
	trigger: () => Promise<unknown>,
	type: T,
	// @ts-expect-error チャンネルイベントのジェネリックな引数型を TypeScript が解決できない。
	cond: (msg: Parameters<Misskey.Channels[C]['events'][T]>[0]) => boolean,
	params?: Misskey.Channels[C]['params'],
	timeoutMs = 1500,
): Promise<boolean> {
	const stream = new Misskey.Stream(`wss://${host}`, { token: user.i }, { WebSocket });
	try {
		const connection = stream.useChannel(channel, params);

		const receivePromise = new Promise<boolean>((resolve) => {
			connection.on(
				type as never,
				((msg: any) => {
					if (cond(msg)) {
						resolve(true);
					}
				}) as any,
			);
		});

		await connection.ready;
		await trigger();
		let timeout: ReturnType<typeof setTimeout> | undefined;
		try {
			return await Promise.race([
				receivePromise,
				new Promise<boolean>((resolve) => {
					timeout = setTimeout(() => resolve(false), timeoutMs);
				}),
			]);
		} finally {
			if (timeout != null) {
				clearTimeout(timeout);
			}
		}
	} finally {
		stream.close();
	}
}

export async function isNoteUpdatedEventFired(
	host: Host,
	user: { i: string },
	noteId: string,
	trigger: () => Promise<unknown>,
	cond: (msg: Parameters<Misskey.StreamEvents['noteUpdated']>[0]) => boolean,
): Promise<boolean> {
	const stream = new Misskey.Stream(`wss://${host}`, { token: user.i }, { WebSocket });
	try {
		if (stream.state !== 'connected') {
			await new Promise<void>((resolve) => stream.once('_connected_', resolve));
		}
		stream.send('s', { id: noteId });

		const receivePromise = new Promise<boolean>((resolve) => {
			stream.on('noteUpdated', (msg) => {
				if (cond(msg)) {
					resolve(true);
				}
			});
		});

		await trigger();

		let timeout: ReturnType<typeof setTimeout> | undefined;
		try {
			return await Promise.race([
				receivePromise,
				new Promise<boolean>((resolve) => {
					timeout = setTimeout(() => resolve(false), 2000);
				}),
			]);
		} finally {
			if (timeout != null) {
				clearTimeout(timeout);
			}
		}
	} finally {
		stream.close();
	}
}

export async function assertNotificationReceived(
	receiverHost: Host,
	receiver: LoginUser,
	trigger: () => Promise<unknown>,
	cond: (notification: Misskey.entities.Notification) => boolean,
	expect: boolean,
) {
	const streamingFired = await isFired(
		receiverHost,
		receiver,
		'main',
		async () => {
			await trigger();
			await deliveryBarrier(receiverHost);
		},
		'notification',
		cond,
		undefined,
		expect ? 1500 : 750,
	);
	strictEqual(streamingFired, expect);

	const endpointFired = await receiver.client
		.request('i/notifications', {})
		.then(([notification]) => (notification != null ? cond(notification) : false));
	strictEqual(endpointFired, expect);
}

export async function fault(
	host: Host,
	mode: 'pass' | 'outage' | 'response-loss',
	activityType?: string,
): Promise<void> {
	const response = await fetch(`${faultUrl()}/${host}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ mode, activityType }),
	});
	strictEqual(response.status, 200);
}

function faultUrl(): string {
	const url = process.env['FEDERATION_FAULT_URL'];
	if (!url) throw new Error('Fault scenarios require compose.matrix.yml and FEDERATION_FAULT_URL');
	return url;
}

export type IngressObservation = {
	sequence: number;
	id?: string;
	type?: string;
	actor?: string;
	objectUri?: string;
	uris: string[];
	mode: 'pass' | 'outage' | 'response-loss';
	status?: number;
	outcome: 'pending' | 'rejected' | 'lost' | 'acknowledged' | 'error';
};

export async function faultStats(
	host: Host,
	afterSequence = 0,
): Promise<{
	matched: number;
	forwarded: number;
	lost: number;
	rejected: number;
	active: number;
	lastSequence: number;
	observations: IngressObservation[];
}> {
	const response = await fetch(`${faultUrl()}/${host}?after=${afterSequence}`);
	strictEqual(response.status, 200);
	return await response.json();
}

async function peerQuery(host: Host, text: string, values: unknown[] = []) {
	// compose の専用 DB だけに接続する。鍵や観測用 SQL を本番 API に公開しない。
	const pool = new Pool({
		host: `db.${host}`,
		port: 5432,
		database: 'misskey',
		user: 'postgres',
		password: 'postgres',
		max: 1,
	});
	try {
		return await pool.query(text, values);
	} finally {
		await pool.end();
	}
}

export async function deliveryBarrier(senderHost: Host): Promise<void> {
	const receiverHost = senderHost === 'a.test' ? 'b.test' : 'a.test';
	let lastState: unknown;
	const idle = async (host: Host) => {
		const admin = await fetchAdmin(host);
		const stats = await admin.client.request('admin/queue/stats', {});
		const relationship = await admin.client.request('admin/queue/queue-stats', { queue: 'relationship' });
		let pendingOutbox = 0;
		if (hostKind(host) === 'fork') {
			const result = await peerQuery(host, 'SELECT state, count(*)::int AS count FROM queue_outbox GROUP BY state');
			for (const row of result.rows) {
				if (row.state === 'deadLetter') throw new Error(`${host}: unexpected dead-letter outbox (${row.count})`);
				pendingOutbox += row.count;
			}
		}
		const proxy = process.env['FEDERATION_FAULT_URL'] ? await faultStats(host, Number.MAX_SAFE_INTEGER) : { active: 0 };
		lastState = { host, stats, relationship, pendingOutbox, proxy };
		return (
			!relationship.isPaused &&
			pendingOutbox === 0 &&
			proxy.active === 0 &&
			[stats.deliver, stats.inbox, stats.db, relationship.counts].every((queue) =>
				Object.entries(queue).every(
					([key, count]) =>
						!['active', 'waiting', 'wait', 'delayed', 'prioritized', 'waiting-children', 'paused'].includes(key) ||
						count === 0,
				),
			)
		);
	};
	try {
		// 受信処理が配送を追加するので、往復後に送信側をもう一度読む。
		await waitFor(
			async () => (await idle(senderHost)) && (await idle(receiverHost)) && (await idle(senderHost)),
			360_000,
			100,
		);
	} catch (error) {
		throw new Error(`Federation did not settle: ${JSON.stringify(lastState)}`, { cause: error });
	}
}

export type DeliveryCompletion = {
	jobIds: string[];
	outboxIds: string[];
	waitForSuccess: () => Promise<void>;
	close: () => void;
};

export async function observeDeliverySuccess(
	senderHost: Host,
	receiverHost: Host,
	activityId: string,
): Promise<DeliveryCompletion> {
	const admin = await fetchAdmin(senderHost);
	const stats = await admin.client.request('admin/queue/queue-stats', { queue: 'deliver' });
	const jobs = await admin.client.request('admin/queue/jobs', {
		queue: 'deliver',
		state: ['active', 'wait', 'delayed', 'completed', 'failed'],
		search: activityId,
	});
	const jobIds = jobs
		.filter((job) => {
			const data = job.data as { content?: string; to?: string };
			return (
				typeof data.content === 'string' &&
				typeof data.to === 'string' &&
				new URL(data.to).host === receiverHost &&
				JSON.parse(data.content).id === activityId
			);
		})
		.map((job) => job.id);
	strictEqual(jobIds.length > 0, true, `No sender delivery job for ${activityId}`);
	const outbox =
		hostKind(senderHost) === 'fork'
			? await peerQuery(
					senderHost,
					`SELECT id FROM queue_outbox WHERE COALESCE("externalJobId", 'outbox-' || id) = ANY($1::text[])`,
					[jobIds],
				)
			: { rows: [] };
	const outboxIds = outbox.rows.map((row) => row.id as string);
	const redis = new Redis({ host: hostKind(senderHost) === 'upstream' ? 'valkey.b.test' : 'valkey.test', port: 6379 });
	try {
		const eventsKey = `${stats.qualifiedName}:events`;
		const latest = await redis.xrevrange(eventsKey, '+', '-', 'COUNT', 1);
		let cursor = latest[0]?.[0] ?? '0-0';
		const completed = new Set<string>();
		for (const id of jobIds) {
			strictEqual(
				await redis.zscore(`${stats.qualifiedName}:failed`, id),
				null,
				`Sender abandoned ${activityId}, job ${id}`,
			);
		}
		return {
			jobIds,
			outboxIds,
			async waitForSuccess() {
				await waitFor(
					async () => {
						const events = await redis.xrange(eventsKey, `(${cursor}`, '+', 'COUNT', 1000);
						for (const [eventId, fields] of events) {
							cursor = eventId;
							const event: Record<string, string> = {};
							for (let index = 0; index < fields.length; index += 2) event[fields[index]!] = fields[index + 1]!;
							if (!event['jobId'] || !jobIds.includes(event['jobId'])) continue;
							if (event['event'] === 'failed')
								throw new Error(`Sender failed ${activityId}, job ${event['jobId']}: ${event['failedReason']}`);
							if (event['event'] === 'completed') completed.add(event['jobId']);
						}
						if (!jobIds.every((id) => completed.has(id))) return false;
						if (outboxIds.length === 0) return true;
						// published は BullMQ 投入済みであり、配送完了ではない。突合後の行削除まで待つ。
						const remaining = await peerQuery(
							senderHost,
							'SELECT id, state FROM queue_outbox WHERE id = ANY($1::text[])',
							[outboxIds],
						);
						for (const row of remaining.rows) {
							if (row.state === 'deadLetter') throw new Error(`Sender dead-lettered ${activityId}, outbox ${row.id}`);
						}
						return remaining.rows.length === 0;
					},
					360_000,
					100,
				);
			},
			close() {
				redis.disconnect();
			},
		};
	} catch (error) {
		redis.disconnect();
		throw error;
	}
}

export async function signedRequest(
	host: Host,
	userId: string,
	path: string,
	options: { method?: 'GET' | 'POST'; body?: string; tamper?: 'body' | 'actor' | 'id' | 'host' } = {},
): Promise<Response> {
	const signerHost: Host = host === 'a.test' ? 'b.test' : 'a.test';
	const key = await peerQuery(signerHost, 'SELECT "privateKey" FROM user_keypair WHERE "userId" = $1', [userId]);
	strictEqual(key.rows.length, 1);
	const method = options.method ?? 'GET';
	const date = new Date().toUTCString();
	const body = options.body ?? '';
	const digest = `SHA-256=${createHash('sha256').update(body).digest('base64')}`;
	const names = method === 'POST' ? '(request-target) host date digest' : '(request-target) host date';
	const signingString = `(request-target): ${method.toLowerCase()} ${path}\nhost: ${host}\ndate: ${date}${method === 'POST' ? `\ndigest: ${digest}` : ''}`;
	const signature = sign('RSA-SHA256', Buffer.from(signingString), key.rows[0].privateKey).toString('base64');
	const headers: Record<string, string> = {
		accept: 'application/activity+json',
		host: options.tamper === 'host' ? signerHost : host,
		date,
		signature: `keyId="https://${signerHost}/users/${userId}#main-key",algorithm="rsa-sha256",headers="${names}",signature="${signature}"`,
	};
	let sentBody = body;
	if (method === 'POST') {
		headers['content-type'] = 'application/activity+json';
		headers['digest'] = digest;
		if (options.tamper === 'body') sentBody = `${body} `;
		if (options.tamper === 'actor' || options.tamper === 'id') {
			const value = JSON.parse(body);
			value[options.tamper] = `https://${host}/users/${userId}`;
			sentBody = JSON.stringify(value);
		}
	}
	return await new Promise<Response>((resolve, reject) => {
		// HTTP Host の改変とは独立に、接続先の名前で TLS 証明書を検証する。CA は実行環境の信頼設定を使う。
		const request = httpsRequest(
			`https://${host}${path}`,
			{ method, headers, servername: host, rejectUnauthorized: true },
			async (response) => {
				try {
					const responseHeaders = new Headers();
					for (let index = 0; index < response.rawHeaders.length; index += 2) {
						responseHeaders.append(response.rawHeaders[index]!, response.rawHeaders[index + 1]!);
					}
					const chunks: Buffer[] = [];
					// 途中切断も読み取り失敗として reject し、不完全な本文を成功応答にしない。
					for await (const chunk of response) chunks.push(chunk);
					if (!response.complete) throw new Error('Incomplete signed request response');
					const status = response.statusCode;
					if (status == null) throw new Error('Missing signed request response status');
					resolve(
						new Response(status === 204 || status === 205 || status === 304 ? null : Buffer.concat(chunks), {
							status,
							statusText: response.statusMessage ?? '',
							headers: responseHeaders,
						}),
					);
				} catch (error) {
					reject(error);
				}
			},
		);
		request.on('error', reject);
		request.end(method === 'POST' ? sentBody : undefined);
	});
}

export function assertNoteContent(actual: Misskey.entities.Note, expected: Misskey.entities.Note): void {
	for (const field of ['text', 'cw', 'visibility', 'localOnly', 'createdAt'] as const) {
		strictEqual(actual[field], expected[field], `Note.${field}`);
	}
	deepStrictEqual(actual.poll, expected.poll);
}

export function assertUserProfile(
	actual: Misskey.entities.UserDetailedNotMe,
	expected: Misskey.entities.UserDetailedNotMe,
): void {
	for (const field of [
		'username',
		'name',
		'description',
		'isBot',
		'isCat',
		'isLocked',
		'followersCount',
		'followingCount',
	] as const) {
		strictEqual(actual[field], expected[field], `User.${field}`);
	}
	deepStrictEqual(actual.fields, expected.fields);
}

export function assertAttachment(actual: Misskey.entities.DriveFile, expected: Misskey.entities.DriveFile): void {
	for (const field of ['name', 'type', 'isSensitive', 'blurhash'] as const) {
		strictEqual(actual[field], expected[field], `Attachment.${field}`);
	}
	strictEqual(actual.properties.width, expected.properties.width);
	strictEqual(actual.properties.height, expected.properties.height);
}
