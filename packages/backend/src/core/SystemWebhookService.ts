/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { type SystemWebhookEventType } from '@/models/SystemWebhook.js';
import { Packed } from '@/misc/json-schema.js';
import { AbuseReportResolveType } from '@/models/AbuseUserReport.js';

export type AbuseReportPayload = {
	id: string;
	targetUserId: string;
	targetUser: Packed<'UserLite'> | null;
	targetUserHost: string | null;
	reporterId: string;
	reporter: Packed<'UserLite'> | null;
	reporterHost: string | null;
	assigneeId: string | null;
	assignee: Packed<'UserLite'> | null;
	resolved: boolean;
	forwarded: boolean;
	comment: string;
	moderationNote: string;
	resolvedAs: AbuseReportResolveType | null;
};

export type ModeratorInactivityRemainingTime = {
	time: number;
	asHours: number;
	asDays: number;
};

export type InactiveModeratorsWarningPayload = {
	remainingTime: ModeratorInactivityRemainingTime;
};

export type SystemWebhookPayload<T extends SystemWebhookEventType> =
	T extends 'abuseReport' | 'abuseReportResolved' ? AbuseReportPayload :
	T extends 'userCreated' ? Packed<'UserLite'> :
	T extends 'inactiveModeratorsWarning' ? InactiveModeratorsWarningPayload :
	T extends 'inactiveModeratorsInvitationOnlyChanged' ? Record<string, never> :
		never;
