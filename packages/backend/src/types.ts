/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { moderationLogTypes } from 'misskey-js/consts.js';
import type {
	MiAbuseUserReport,
	MiAnnouncement,
	MiEmoji,
	MiFlash,
	MiGalleryPost,
	MiMeta,
	MiNote,
	MiPage,
	MiRole,
} from '@/models/_.js';
import type { MiAbuseReportNotificationRecipient } from '@/models/AbuseReportNotificationRecipient.js';
import type { MiAd } from '@/models/Ad.js';
import type { MiChatRoom } from '@/models/ChatRoom.js';
import type { MiSystemWebhook } from '@/models/SystemWebhook.js';
import type { AvatarDecorationRow } from '@/db/schema/avatar-decoration.js';
import type { RegistrationTicketRow } from '@/db/schema/registration-ticket.js';

export { moderationLogTypes };

/**
 * note - 通知オンにしているユーザーが投稿した
 * follow - フォローされた
 * mention - 投稿で自分が言及された
 * reply - 投稿に返信された
 * renote - 投稿がRenoteされた
 * quote - 投稿が引用Renoteされた
 * reaction - 投稿にリアクションされた
 * pollEnded - 自分のアンケートもしくは自分が投票したアンケートが終了した
 * scheduledNotePosted - 予約したノートが投稿された
 * scheduledNotePostFailed - 予約したノートの投稿に失敗した
 * receiveFollowRequest - フォローリクエストされた
 * followRequestAccepted - 自分の送ったフォローリクエストが承認された
 * roleAssigned - ロールが付与された
 * chatRoomInvitationReceived - チャットルームに招待された
 * achievementEarned - 実績を獲得
 * exportCompleted - エクスポートが完了
 * login - ログイン
 * createToken - トークン作成
 * app - アプリ通知
 * test - テスト通知（サーバー側）
 */
export const notificationTypes = [
	'note',
	'follow',
	'mention',
	'reply',
	'renote',
	'quote',
	'reaction',
	'pollEnded',
	'scheduledNotePosted',
	'scheduledNotePostFailed',
	'receiveFollowRequest',
	'followRequestAccepted',
	'roleAssigned',
	'chatRoomInvitationReceived',
	'achievementEarned',
	'exportCompleted',
	'login',
	'createToken',
	'app',
	'test',
] as const;

export const groupedNotificationTypes = [
	...notificationTypes,
	'reaction:grouped',
	'renote:grouped',
] as const;

export const obsoleteNotificationTypes = ['pollVote', 'groupInvited'] as const;

export const noteVisibilities = ['public', 'home', 'followers', 'specified'] as const;

export const noteReactionAcceptances = ['likeOnly', 'likeOnlyForRemote', 'nonSensitiveOnly', 'nonSensitiveOnlyForLocalLikeOnlyForRemote', null] as const;

export const mutedNoteReasons = ['word', 'manual', 'spam', 'other'] as const;

export const followingVisibilities = ['public', 'followers', 'private'] as const;
export const followersVisibilities = ['public', 'followers', 'private'] as const;

/**
 * ユーザーがエクスポートできるものの種類
 *
 * （主にエクスポート完了通知で使用するものであり、既存のDBの名称等と必ずしも一致しない）
 */
export const userExportableEntities = ['antenna', 'blocking', 'clip', 'customEmoji', 'favorite', 'following', 'muting', 'note', 'userList'] as const;

/**
 * ユーザーがインポートできるものの種類
 *
 * （主にインポート完了通知で使用するものであり、既存のDBの名称等と必ずしも一致しない）
 */
export const userImportableEntities = ['antenna', 'blocking', 'customEmoji', 'following', 'muting', 'userList'] as const;

export type ModerationLogPayloads = {
	updateServerSettings: {
		// meta.tsではMiMeta全体、admin-roles.tsではpolicies部分のみが渡される
		before: (MiMeta | MiMeta['policies']) | null;
		after: (MiMeta | MiMeta['policies']) | null;
	};
	suspend: {
		userId: string;
		userUsername: string;
		userHost: string | null;
	};
	unsuspend: {
		userId: string;
		userUsername: string;
		userHost: string | null;
	};
	updateUserNote: {
		userId: string;
		userUsername: string;
		userHost: string | null;
		before: string | null;
		after: string | null;
	};
	addCustomEmoji: {
		emojiId: string;
		emoji: MiEmoji;
	};
	updateCustomEmoji: {
		emojiId: string;
		before: MiEmoji;
		after: MiEmoji;
	};
	deleteCustomEmoji: {
		emojiId: string;
		emoji: MiEmoji;
	};
	assignRole: {
		userId: string;
		userUsername: string;
		userHost: string | null;
		roleId: string;
		roleName: string;
		expiresAt: string | null;
	};
	unassignRole: {
		userId: string;
		userUsername: string;
		userHost: string | null;
		roleId: string;
		roleName: string;
	};
	createRole: {
		roleId: string;
		role: MiRole;
	};
	updateRole: {
		roleId: string;
		before: MiRole;
		after: MiRole;
	};
	deleteRole: {
		roleId: string;
		role: MiRole;
	};
	clearQueue: Record<string, never>;
	promoteQueue: Record<string, never>;
	pauseQueue: Record<string, never>;
	resumeQueue: Record<string, never>;
	deleteDriveFile: {
		fileId: string;
		fileUserId: string | null;
		fileUserUsername: string | null;
		fileUserHost: string | null;
	};
	deleteNote: {
		noteId: string;
		noteUserId: string;
		noteUserUsername: string;
		noteUserHost: string | null;
		note: MiNote;
	};
	createGlobalAnnouncement: {
		announcementId: string;
		announcement: MiAnnouncement;
	};
	createUserAnnouncement: {
		announcementId: string;
		announcement: MiAnnouncement;
		userId: string;
		userUsername: string;
		userHost: string | null;
	};
	updateGlobalAnnouncement: {
		announcementId: string;
		before: MiAnnouncement;
		after: MiAnnouncement;
	};
	updateUserAnnouncement: {
		announcementId: string;
		before: MiAnnouncement;
		after: MiAnnouncement;
		userId: string;
		userUsername: string;
		userHost: string | null;
	};
	deleteGlobalAnnouncement: {
		announcementId: string;
		announcement: MiAnnouncement;
	};
	deleteUserAnnouncement: {
		announcementId: string;
		announcement: MiAnnouncement;
		userId: string;
		userUsername: string;
		userHost: string | null;
	};
	resetPassword: {
		userId: string;
		userUsername: string;
		userHost: string | null;
	};
	suspendRemoteInstance: {
		id: string;
		host: string;
	};
	unsuspendRemoteInstance: {
		id: string;
		host: string;
	};
	updateRemoteInstanceNote: {
		id: string;
		host: string;
		before: string | null;
		after: string | null;
	};
	markSensitiveDriveFile: {
		fileId: string;
		fileUserId: string | null;
		fileUserUsername: string | null;
		fileUserHost: string | null;
	};
	unmarkSensitiveDriveFile: {
		fileId: string;
		fileUserId: string | null;
		fileUserUsername: string | null;
		fileUserHost: string | null;
	};
	resolveAbuseReport: {
		reportId: string;
		report: MiAbuseUserReport;
		forwarded?: boolean;
		resolvedAs?: string | null;
	};
	forwardAbuseReport: {
		reportId: string;
		report: MiAbuseUserReport;
	};
	updateAbuseReportNote: {
		reportId: string;
		report: MiAbuseUserReport;
		before: string;
		after: string;
	};
	createInvitation: {
		invitations: RegistrationTicketRow[];
	};
	createAd: {
		adId: string;
		ad: MiAd;
	};
	updateAd: {
		adId: string;
		before: MiAd;
		after: MiAd;
	};
	deleteAd: {
		adId: string;
		ad: MiAd;
	};
	createAvatarDecoration: {
		avatarDecorationId: string;
		avatarDecoration: AvatarDecorationRow;
	};
	updateAvatarDecoration: {
		avatarDecorationId: string;
		before: AvatarDecorationRow;
		after: AvatarDecorationRow;
	};
	deleteAvatarDecoration: {
		avatarDecorationId: string;
		avatarDecoration: AvatarDecorationRow;
	};
	unsetMfa: {
		userId: string;
		userUsername: string;
		userHost: string | null;
	};
	unsetUserAvatar: {
		userId: string;
		userUsername: string;
		userHost: string | null;
		fileId: string;
	};
	unsetUserBanner: {
		userId: string;
		userUsername: string;
		userHost: string | null;
		fileId: string;
	};
	createSystemWebhook: {
		systemWebhookId: string;
		webhook: MiSystemWebhook;
	};
	updateSystemWebhook: {
		systemWebhookId: string;
		before: MiSystemWebhook;
		after: MiSystemWebhook;
	};
	deleteSystemWebhook: {
		systemWebhookId: string;
		webhook: MiSystemWebhook;
	};
	createAbuseReportNotificationRecipient: {
		recipientId: string;
		recipient: MiAbuseReportNotificationRecipient;
	};
	updateAbuseReportNotificationRecipient: {
		recipientId: string;
		before: MiAbuseReportNotificationRecipient;
		after: MiAbuseReportNotificationRecipient;
	};
	deleteAbuseReportNotificationRecipient: {
		recipientId: string;
		// 呼び出し元(AbuseReportNotificationService.deleteRecipient / admin-abuse-report-notification-recipient.ts)が
		// 削除前に listAbuseReportNotificationRecipientsFromDatabase({ ids: [id] }) の結果(配列)をそのまま渡している
		recipient: MiAbuseReportNotificationRecipient[];
	};
	deleteAccount: {
		userId: string;
		userUsername: string;
		userHost: string | null;
	};
	deletePage: {
		pageId: string;
		pageUserId: string;
		pageUserUsername: string;
		page: MiPage;
	};
	deleteFlash: {
		flashId: string;
		flashUserId: string;
		flashUserUsername: string;
		flash: MiFlash;
	};
	deleteGalleryPost: {
		postId: string;
		postUserId: string;
		postUserUsername: string;
		post: MiGalleryPost;
	};
	deleteChatRoom: {
		roomId: string;
		room: MiChatRoom;
	};
	updateProxyAccountDescription: {
		before: string | null;
		after: string | null;
	};
};

export type Serialized<T> = {
	[K in keyof T]:
	T[K] extends Date
		? string
		: T[K] extends (Date | null)
			? (string | null)
			: T[K] extends Record<string, any>
				? Serialized<T[K]>
				: T[K] extends (Record<string, any> | null)
					? (Serialized<T[K]> | null)
					: T[K] extends (Record<string, any> | undefined)
						? (Serialized<T[K]> | undefined)
						: T[K];
};

export type FilterUnionByProperty<
	Union,
	Property extends string | number | symbol,
	Condition,
> = Union extends Record<Property, Condition> ? Union : never;

export type Awaitable<T> = T | Promise<T>;
