/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { WebhookEventTypes } from '@/models/Webhook.js';
import type { Packed } from '@/misc/json-schema.js';

export type UserWebhookPayload<T extends WebhookEventTypes> = T extends 'note' | 'reply' | 'renote' | 'mention'
	? {
			note: Packed<'Note'>;
		}
	: T extends 'follow' | 'unfollow'
		? {
				user: Packed<'UserDetailedNotMe'>;
			}
		: T extends 'followed'
			? {
					user: Packed<'UserLite'>;
				}
			: T extends 'reaction'
				? {
						note: Packed<'Note'>;
						reaction: string;
						user: Packed<'UserLite'>;
					}
				: never;
