/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/*
 * Operations
 * 各種操作
 */
import { APIClient } from 'misskey-js/api.js';
import type * as Misskey from 'misskey-js';
import type { SwMessage, SwMessageOrderType } from '@/types.js';
import { getAccountFromId } from '@/scripts/get-account-from-id.js';
import { getUrlWithLoginId } from '@/scripts/login-id.js';

export const cli = new APIClient({ origin, fetch: (...args): Promise<Response> => fetch(...args) });

type ApiArgs<E extends keyof Misskey.Endpoints, P extends Misskey.Endpoints[E]['req']> =
	Misskey.Endpoints[E] extends { reqOptional: true }
		? [userId?: string, params?: P]
		: [userId: string | undefined, params: P];

export async function api<
	E extends keyof Misskey.Endpoints,
	P extends Misskey.Endpoints[E]['req'] = never,
>(endpoint: E, ...[userId, params]: ApiArgs<E, P>): Promise<Misskey.api.SwitchCaseResponseType<E, P> | undefined> {
	let account: Pick<Misskey.entities.SignupResponse, 'id' | 'token'> | undefined;

	if (userId) {
		account = await getAccountFromId(userId);
		if (!account) return;
	}

	const requestParams = params ?? {} as P;
	return (cli.request as <E extends keyof Misskey.Endpoints, P extends Misskey.Endpoints[E]['req']>(
		endpoint: E,
		params?: P,
		credential?: string | null,
	) => Promise<Misskey.api.SwitchCaseResponseType<E, P>>)(endpoint, requestParams, account?.token);
}

// mark-all-as-read送出を1秒間隔に制限する
const readBlockingStatus = new Map<string, boolean>();
export function sendMarkAllAsRead(userId: string): Promise<null | undefined | void> {
	if (readBlockingStatus.get(userId)) return Promise.resolve();
	readBlockingStatus.set(userId, true);
	return new Promise(resolve => {
		setTimeout(() => {
			readBlockingStatus.set(userId, false);
			(api('notifications/mark-all-as-read', userId) as Promise<void>).then(resolve, resolve);
		}, 1000);
	});
}

// rendered acctからユーザーを開く
export function openUser(acct: string, loginId?: string): ReturnType<typeof openClient> {
	return openClient('push', `/@${acct}`, loginId, { acct });
}

// noteIdからノートを開く
export function openNote(noteId: string, loginId?: string): ReturnType<typeof openClient> {
	return openClient('push', `/notes/${noteId}`, loginId, { noteId });
}

// antennaIdからアンテナタイムラインを開く
export function openAntenna(antennaId: string, loginId: string): ReturnType<typeof openClient> {
	return openClient('push', `/timeline/antenna/${antennaId}`, loginId, { antennaId });
}

export function openChat(body: Misskey.entities.ChatMessage, loginId: string): ReturnType<typeof openClient> {
	if (body.toRoomId != null) {
		return openClient('push', `/chat/room/${body.toRoomId}`, loginId, { body });
	} else {
		return openClient('push', `/chat/user/${body.toUserId}`, loginId, { body });
	}
}

// post-formのオプションから投稿フォームを開く
export async function openPost(options: { initialText?: string; reply?: Misskey.entities.Note; renote?: Misskey.entities.Note }, loginId?: string): ReturnType<typeof openClient> {
	// クエリを作成しておく
	const url = '/share';
	const query = new URLSearchParams();
	if (options.initialText) query.set('text', options.initialText);
	if (options.reply) query.set('replyId', options.reply.id);
	if (options.renote) query.set('renoteId', options.renote.id);

	return openClient('post', `${url}?${query}`, loginId, { options });
}

export async function openClient(order: SwMessageOrderType, url: string, loginId?: string, query: Record<string, SwMessage[string]> = {}): Promise<WindowClient | null> {
	const client = await findClient();

	if (client) {
		client.postMessage({ type: 'order', ...query, order, ...(loginId === undefined ? {} : { loginId }), url } satisfies SwMessage);
		return client;
	}

	return globalThis.clients.openWindow(loginId ? getUrlWithLoginId(url, loginId) : url);
}

export async function findClient(): Promise<WindowClient | null> {
	const clients = await globalThis.clients.matchAll({
		type: 'window',
	});
	return clients.find(c => !(new URL(c.url)).searchParams.has('zen')) ?? null;
}
