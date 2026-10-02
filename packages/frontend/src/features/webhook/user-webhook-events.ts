/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { reactive } from 'vue';
import type * as Misskey from 'misskey-js';

type UserWebhookEvent = Misskey.entities.UserWebhook['on'][number];

// 送信する on の並びはこの順序になる。
const USER_WEBHOOK_EVENTS = [
	'follow',
	'followed',
	'note',
	'reply',
	'renote',
	'reaction',
	'mention',
] as const satisfies readonly UserWebhookEvent[];

export function useUserWebhookEventToggles(initial: (event: UserWebhookEvent) => boolean) {
	const events = reactive(
		Object.fromEntries(USER_WEBHOOK_EVENTS.map((event) => [event, initial(event)])) as Record<
			(typeof USER_WEBHOOK_EVENTS)[number],
			boolean
		>,
	);

	function selectedEvents(): Misskey.entities.UserWebhook['on'] {
		return USER_WEBHOOK_EVENTS.filter((event) => events[event]);
	}

	return { events, selectedEvents };
}
