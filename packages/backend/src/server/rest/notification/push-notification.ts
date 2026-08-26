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
import type { Packed } from '@/misc/json-schema.js';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
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

export type HonoApiPushNotificationDependencies = {
	config: Pick<Config, 'instance' | 'outboundNetwork'>;
	meta: Pick<MiMeta, 'enableServiceWorker' | 'swPublicKey' | 'swPrivateKey'>;
	db: MiDrizzleDatabase;
};

function truncateNotificationBody<T extends keyof PushNotificationsTypes>(
	type: T,
	body: PushNotificationsTypes[T],
): PushNotificationsTypes[T] {
	if (typeof body !== 'object' || body == null) return body;

	return {
		...body,
		...('note' in body && body.note
			? {
					note: {
						...(body.note as Packed<'Note'>),
						// textをgetNoteSummaryしたものに置き換える
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
 * fire-and-forget (配信失敗はエンドポイント失効時の購読削除以外は握りつぶす) なので await 不要。
 */
export async function pushSwNotificationForHonoApi<T extends keyof PushNotificationsTypes>(
	deps: HonoApiPushNotificationDependencies,
	userId: MiUser['id'],
	type: T,
	body: PushNotificationsTypes[T],
): Promise<void> {
	if (!deps.meta.enableServiceWorker || deps.meta.swPublicKey == null || deps.meta.swPrivateKey == null) return;

	push.setVapidDetails(deps.config.instance.url, deps.meta.swPublicKey, deps.meta.swPrivateKey);

	const subscriptions = await listSwSubscriptionsByUserIdFromDatabase(deps.db, userId);

	for (const subscription of subscriptions) {
		// 「通知が既読になったことを送信する」をオフにしている購読には readAllNotifications を送らない
		if (type === 'readAllNotifications' && !subscription.sendReadMessage) continue;

		const pushSubscription = {
			endpoint: subscription.endpoint,
			keys: {
				auth: subscription.auth,
				p256dh: subscription.publickey,
			},
		};

		push
			.sendNotification(
				pushSubscription,
				JSON.stringify({
					type,
					body: type === 'notification' || type === 'unreadAntennaNote' ? truncateNotificationBody(type, body) : body,
					userId,
					dateTime: Date.now(),
				}),
				{
					proxy: deps.config.outboundNetwork.proxy.url,
				},
			)
			.catch((err: push.WebPushError) => {
				if (err.statusCode === 410) {
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
