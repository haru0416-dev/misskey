/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import push from 'web-push';
import { getNoteSummary } from '@/misc/get-note-summary.js';
import {
	deleteSwSubscriptionForPushEndpointFromDatabase,
	listSwSubscriptionsByUserIdFromDatabase,
} from '@/core/sw/SwSubscriptionStore.js';
import { StatusError } from '@/misc/status-error.js';
import type { Packed } from '@/misc/json-schema.js';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { HttpRequestService } from '@/core/net/HttpRequestService.js';
import type { MiMeta } from '@/models/_.js';
import type { MiUser } from '@/models/User.js';

// packages/sw/src/types.ts の pushNotificationDataMap と形式を揃える。
export type PushNotificationsTypes = {
	notification: Packed<'Notification'> | Record<string, unknown>;
	unreadAntennaNote: {
		antenna: { id: string; name: string };
		note: Packed<'Note'>;
	};
	readAllNotifications: undefined;
	newChatMessage: Packed<'ChatMessage'>;
};

export type PushNotificationDependencies = {
	config: Pick<Config, 'instance'>;
	meta: Pick<MiMeta, 'enableServiceWorker' | 'swPublicKey' | 'swPrivateKey'>;
	db: MiDrizzleDatabase;
	// 送信先は利用者が登録した任意 URL なので、SSRF 検査 (private/非ユニキャスト遮断・
	// 検査済み IP への pin) を持つ send を必ず経由する。web-push 内蔵の https 送信は使わない。
	httpRequestService: Pick<HttpRequestService, 'send'>;
};

function truncateNotificationBody<T extends keyof PushNotificationsTypes>(
	type: T,
	body: PushNotificationsTypes[T],
): PushNotificationsTypes[T] {
	if (typeof body !== 'object' || body == null) {
		return body;
	}

	return {
		...body,
		...('note' in body && body.note
			? {
					note: {
						...(body.note as Packed<'Note'>),
						text: getNoteSummary(
							'type' in body && body.type === 'renote'
								? ((body.note as Packed<'Note'>).renote as Packed<'Note'>)
								: (body.note as Packed<'Note'>),
						),

						cw: undefined,
						reply: undefined,
						renote: undefined,
						user: type === 'notification' ? undefined : (body.note as Packed<'Note'>).user,
					},
				}
			: {}),
	};
}

/**
 * web-push は暗号化 (RFC 8291) と VAPID ヘッダ (RFC 8292) の生成だけに使い、送信はしない。
 * 購読の鍵が不正などで生成できない購読は null を返して飛ばす。
 */
function buildPushRequest(
	subscription: push.PushSubscription,
	payload: unknown,
	vapidDetails: { subject: string; publicKey: string; privateKey: string },
): { endpoint: string; headers: Record<string, string>; body: Buffer } | null {
	let details: push.RequestDetails & { body: Buffer };
	try {
		details = push.generateRequestDetails(subscription, JSON.stringify(payload), { vapidDetails });
	} catch {
		return null;
	}

	// Content-Length は本文から fetch が付け直すので落とす。残りは文字列へ揃える (TTL は数値)。
	const headers: Record<string, string> = {};
	for (const [key, value] of Object.entries(details.headers)) {
		if (key.toLowerCase() === 'content-length') continue;
		headers[key] = String(value);
	}

	return { endpoint: details.endpoint, headers, body: details.body };
}

/**
 * 購読の読み出しは待つが、送信と失効した購読の削除の完了は待たない。
 * 通信失敗は呼び出し側へ返さないが、購読の読み出しに失敗すると reject する。
 */
export async function pushSwNotification<T extends keyof PushNotificationsTypes>(
	deps: PushNotificationDependencies,
	userId: MiUser['id'],
	type: T,
	body: PushNotificationsTypes[T],
): Promise<void> {
	const swPublicKey = deps.meta.swPublicKey;
	const swPrivateKey = deps.meta.swPrivateKey;
	if (!deps.meta.enableServiceWorker || swPublicKey == null || swPrivateKey == null) {
		return;
	}

	const subscriptions = await listSwSubscriptionsByUserIdFromDatabase(deps.db, userId);

	for (const subscription of subscriptions) {
		if (type === 'readAllNotifications' && !subscription.sendReadMessage) {
			continue;
		}

		const pushSubscription = {
			endpoint: subscription.endpoint,
			keys: {
				auth: subscription.auth,
				p256dh: subscription.publickey,
			},
		};

		const request = buildPushRequest(
			pushSubscription,
			{
				type,
				body: type === 'notification' || type === 'unreadAntennaNote' ? truncateNotificationBody(type, body) : body,
				userId,
				dateTime: Date.now(),
			},
			{
				subject: deps.config.instance.url,
				publicKey: swPublicKey,
				privateKey: swPrivateKey,
			},
		);
		if (request == null) {
			continue;
		}

		void deps.httpRequestService
			.send(request.endpoint, {
				method: 'POST',
				headers: request.headers,
				body: request.body,
				followRedirects: false,
			})
			.catch((err: unknown) => {
				// 失効した購読 (404/410) だけ削除する。それ以外の失敗 (SSRF 遮断・一時障害) は握りつぶす。
				const status = err instanceof StatusError ? err.statusCode : undefined;
				if (status === 404 || status === 410) {
					void deleteSwSubscriptionForPushEndpointFromDatabase(deps.db, {
						userId,
						endpoint: subscription.endpoint,
						auth: subscription.auth,
						publickey: subscription.publickey,
					});
				}
			});
	}
}
