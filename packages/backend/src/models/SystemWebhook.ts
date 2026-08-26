/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Serialized } from '@/types.js';

export const systemWebhookEventTypes = [
	'abuseReport',
	'abuseReportResolved',
	'userCreated',
	'inactiveModeratorsWarning',
	'inactiveModeratorsInvitationOnlyChanged',
] as const;
export type SystemWebhookEventType = (typeof systemWebhookEventTypes)[number];

export class MiSystemWebhook {
	public id: string;

	public isActive: boolean;

	public updatedAt: Date;

	public latestSentAt: Date | null;

	public latestStatus: number | null;

	public name: string;

	public on: SystemWebhookEventType[];

	public url: string;

	public secret: string;

	static deserialize(obj: Serialized<MiSystemWebhook>): MiSystemWebhook {
		return {
			...obj,
			updatedAt: new Date(obj.updatedAt),
			latestSentAt: obj.latestSentAt ? new Date(obj.latestSentAt) : null,
		};
	}
}
