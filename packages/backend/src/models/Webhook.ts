/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MiUser } from './User.js';

export const webhookEventTypes = [
	'mention',
	'unfollow',
	'follow',
	'followed',
	'note',
	'reply',
	'renote',
	'reaction',
] as const;
export type WebhookEventTypes = (typeof webhookEventTypes)[number];

export class MiWebhook {
	public id: string;

	public userId: MiUser['id'];

	public user: MiUser | null;

	public name: string;

	public on: (typeof webhookEventTypes)[number][];

	public url: string;

	public secret: string;

	public active: boolean;

	public latestSentAt: Date | null;

	public latestStatus: number | null;
}
