/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiNote } from '@/models/Note.js';
import type { SystemWebhookEventType } from '@/models/SystemWebhook.js';
import type { MiUser } from '@/models/User.js';
import type { MiWebhook, WebhookEventTypes } from '@/models/Webhook.js';
import type { IActivity } from '@/core/activitypub/type.js';
import type { SystemWebhookPayload } from '@/core/webhook/system-webhook-types.js';
import type { UserWebhookPayload } from '@/core/webhook/user-webhook-types.js';
import type httpSignature from '@peertube/http-signature';

export type DeliverJobData = {
	user: ThinUser;
	content: string;
	digest: string;
	to: string;
	isSharedInbox: boolean;
	userStateGuard?: UserStateGuard;
};

export type InboxJobData = {
	activity: IActivity;
	signature: httpSignature.IParsedSignature;
};

export type RelationshipJobData = {
	from: ThinUser;
	to: ThinUser;
	silent?: boolean;
	requestId?: string;
	withReplies?: boolean;
	userStateGuard?: UserStateGuard;
};

type UserStateGuard = {
	userId: MiUser['id'];
	isSuspended: boolean;
	transitionedAt: string;
	transitionId: string;
};

export type DbJobData<T extends keyof DbJobMap> = DbJobMap[T];

export type DbJobMap = {
	deleteDriveFile: DbDeleteDriveFileJobData;
	deleteDriveFiles: DbJobDataWithUser;
	exportCustomEmojis: DbJobDataWithUser;
	exportAntennas: DBExportAntennasData;
	exportNotes: DbJobDataWithUser;
	exportClips: DbJobDataWithUser;
	exportFavorites: DbJobDataWithUser;
	exportFollowing: DbExportFollowingData;
	exportMuting: DbJobDataWithUser;
	exportBlocking: DbJobDataWithUser;
	exportUserLists: DbJobDataWithUser;
	importFollowing: DbUserImportJobData;
	importFollowingToDb: DbUserImportToDbJobData;
	importMuting: DbUserImportJobData;
	importBlocking: DbUserImportJobData;
	importBlockingToDb: DbUserImportToDbJobData;
	importUserLists: DbUserImportJobData;
	importCustomEmojis: DbUserImportJobData;
	deleteAccount: DbUserDeleteJobData;
	userSuspensionPostEffects: DbUserSuspensionPostEffectsJobData;
	notePostCreate: DbNotePostCreateJobData;
};

export type DbJobName = keyof DbJobMap;

export type DbJobDataWithUser = {
	user: ThinUser;
};

export type DbExportFollowingData = {
	user: ThinUser;
	excludeMuting: boolean;
	excludeInactive: boolean;
};

export type DBExportAntennasData = {
	user: ThinUser;
};

export type DbUserDeleteJobData = {
	user: ThinUser;
	soft?: boolean;
	accountDeleteCoordinatorId?: string;
};

export type DbDeleteDriveFileJobData = {
	operationId: string;
	file: Pick<
		MiDriveFile,
		| 'id'
		| 'userId'
		| 'userHost'
		| 'size'
		| 'uri'
		| 'storedInternal'
		| 'isLink'
		| 'accessKey'
		| 'thumbnailUrl'
		| 'thumbnailAccessKey'
		| 'webpublicUrl'
		| 'webpublicAccessKey'
	> & { userUsername: MiUser['username'] | null };
	isExpired: boolean;
	replacementKeys?: {
		accessKey: string;
		thumbnailAccessKey: string;
		webpublicAccessKey: string;
	};
	deleterId?: MiUser['id'];
};

export type DbUserSuspensionPostEffectsJobData = {
	userId: MiUser['id'];
	isSuspended: boolean;
	transitionedAt: string;
	transitionId: string;
};

export type DbNotePostCreateJobData = {
	noteId: MiNote['id'];
	mentionedUserIds: MiUser['id'][];
	reply: {
		id: MiNote['id'];
		userId: MiUser['id'];
		userHost: MiUser['host'];
		threadId: MiNote['threadId'];
	} | null;
	renote: {
		id: MiNote['id'];
		userId: MiUser['id'];
		userHost: MiUser['host'];
		uri: MiNote['uri'];
	} | null;
	silent: boolean;
	stage: DbNotePostCreateStage;
};

export type DbNotePostCreateStage =
	| 'analytics'
	| 'fanout'
	| 'antennas'
	| 'followerNotifications'
	| 'poll'
	| 'streamsAndRole'
	| 'notifications'
	| 'webhooks'
	| 'federation';

export type DbUserImportJobData = {
	user: ThinUser;
	fileId: MiDriveFile['id'];
	withReplies?: boolean;
};

export type DbUserImportToDbJobData = {
	user: ThinUser;
	target: string;
	withReplies?: boolean;
};

export type ObjectStorageJobData = ObjectStorageFileJobData | Record<string, unknown>;

export type ObjectStorageFileJobData = {
	key: string;
};

export type EndedPollNotificationJobData = {
	noteId: MiNote['id'];
};

export type PostScheduledNoteJobData = {
	noteDraftId: string;
	scheduledAt?: number;
};

export type SystemWebhookDeliverJobData<T extends SystemWebhookEventType = SystemWebhookEventType> = {
	type: T;
	content: SystemWebhookPayload<T>;
	webhookId: MiWebhook['id'];
	to: string;
	secret: string;
	createdAt: number;
	eventId: string;
};

export type UserWebhookDeliverJobData<T extends WebhookEventTypes = WebhookEventTypes> = {
	type: T;
	content: UserWebhookPayload<T>;
	webhookId: MiWebhook['id'];
	userId: MiUser['id'];
	to: string;
	secret: string;
	createdAt: number;
	eventId: string;
};

export type ThinUser = {
	id: MiUser['id'];
};
