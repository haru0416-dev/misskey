/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { eq, inArray } from 'drizzle-orm';
import { loadConfig } from '@/config.js';
import * as AbuseUserReportStore from '@/core/abuse/AbuseUserReportStore.js';
import * as AnnouncementReadStore from '@/core/announcement/AnnouncementReadStore.js';
import * as AnnouncementStore from '@/core/announcement/AnnouncementStore.js';
import * as AntennaStore from '@/core/antenna/AntennaStore.js';
import * as AvatarDecorationStore from '@/core/avatar-decoration/AvatarDecorationStore.js';
import * as BlockingStore from '@/core/user/BlockingStore.js';
import * as ChannelFavoriteStore from '@/core/channel/ChannelFavoriteStore.js';
import * as ChannelFollowingStore from '@/core/channel/ChannelFollowingStore.js';
import * as ChannelMutingStore from '@/core/channel/ChannelMutingStore.js';
import * as ChannelStore from '@/core/channel/ChannelStore.js';
import * as ClipFavoriteStore from '@/core/clip/ClipFavoriteStore.js';
import * as ClipStore from '@/core/clip/ClipStore.js';
import * as DriveFileStore from '@/core/drive/DriveFileStore.js';
import * as DriveFolderStore from '@/core/drive/DriveFolderStore.js';
import * as EmojiStore from '@/core/emoji/EmojiStore.js';
import * as FlashLikeStore from '@/core/flash/FlashLikeStore.js';
import * as FlashStore from '@/core/flash/FlashStore.js';
import * as FollowRequestStore from '@/core/user/FollowRequestStore.js';
import * as FollowingStore from '@/core/user/FollowingStore.js';
import * as GalleryPostStore from '@/core/gallery/GalleryPostStore.js';
import * as InstanceStore from '@/core/instance/InstanceStore.js';
import * as MetaStore from '@/core/meta/MetaStore.js';
import * as ModerationLogStore from '@/core/moderation/ModerationLogStore.js';
import * as MutingStore from '@/core/user/MutingStore.js';
import * as NoteDraftStore from '@/core/note/NoteDraftStore.js';
import * as NoteReactionStore from '@/core/note/NoteReactionStore.js';
import * as NoteStore from '@/core/note/NoteStore.js';
import * as PageLikeStore from '@/core/page/PageLikeStore.js';
import * as PageStore from '@/core/page/PageStore.js';
import * as PasswordResetRequestStore from '@/core/account/PasswordResetRequestStore.js';
import * as PollStore from '@/core/note/PollStore.js';
import * as PollVoteStore from '@/core/note/PollVoteStore.js';
import * as PromoNoteStore from '@/core/note/PromoNoteStore.js';
import * as PromoReadStore from '@/core/note/PromoReadStore.js';
import * as QueueOutboxStore from '@/core/queue/QueueOutboxStore.js';
import * as RegistrationTicketStore from '@/core/invite/RegistrationTicketStore.js';
import * as RelayStore from '@/core/relay/RelayStore.js';
import * as RenoteMutingStore from '@/core/user/RenoteMutingStore.js';
import * as RetentionAggregationStore from '@/core/retention/RetentionAggregationStore.js';
import * as RoleAssignmentStore from '@/core/role/RoleAssignmentStore.js';
import * as RoleStore from '@/core/role/RoleStore.js';
import * as SigninStore from '@/core/account/SigninStore.js';
import * as SwSubscriptionStore from '@/core/sw/SwSubscriptionStore.js';
import * as SystemWebhookStore from '@/core/webhook/SystemWebhookStore.js';
import * as UserListFavoriteStore from '@/core/user/UserListFavoriteStore.js';
import * as UserListMembershipStore from '@/core/user/UserListMembershipStore.js';
import * as UserListStore from '@/core/user/UserListStore.js';
import * as UserNotePiningStore from '@/core/user/UserNotePiningStore.js';
import * as UserPendingStore from '@/core/account/UserPendingStore.js';
import * as UserProfileStore from '@/core/user/UserProfileStore.js';
import * as UserSecurityKeyStore from '@/core/account/UserSecurityKeyStore.js';
import * as UserStore from '@/core/user/UserStore.js';
import * as WebhookStore from '@/core/webhook/WebhookStore.js';
import { hashtag, type HashtagInsert } from '@/db/schema/hashtag.js';
import { queueOutbox, type QueueOutboxInsert } from '@/db/schema/queue-outbox.js';
import { userIp, type UserIpInsert } from '@/db/schema/user-ip.js';
import { createDrizzleDatabase, createDrizzlePool, type MiDrizzleDatabase } from '@/drizzle.js';
import { resetDatabase, runMigrations } from '@/migration-runner.js';
import { createLocalSignupAccount as createLocalSignupAccountImpl } from '@/server/rest/signup.js';

const config = loadConfig();
const testDatabase = Symbol('testDatabase');

export { DEFAULT_POLICIES } from '@/core/role/role-policies.js';
export { RootUserAlreadyAssignedError } from '@/core/account/SignupStore.js';
export { genId } from '@/misc/id/gen-id.js';

export const fixtureConfig = config;

export type TestDatabase = {
	readonly [testDatabase]: MiDrizzleDatabase;
	close: () => Promise<void>;
};

function bindDatabaseOperation<Args extends unknown[], Result>(
	operation: (db: MiDrizzleDatabase, ...args: Args) => Result,
): (database: TestDatabase, ...args: Args) => Result {
	return (database, ...args) => operation(database[testDatabase], ...args);
}

export function openTestDatabase(): TestDatabase {
	const pool = createDrizzlePool(config);
	return {
		[testDatabase]: createDrizzleDatabase(pool, config),
		close: async () => {
			await pool.end();
		},
	};
}

export async function resetTestDatabase(): Promise<void> {
	const pool = createDrizzlePool(config);
	try {
		await resetDatabase(pool);
		await runMigrations(pool);
	} finally {
		await pool.end();
	}
}

export async function insertHashtags(database: TestDatabase, values: HashtagInsert[]): Promise<void> {
	await database[testDatabase].insert(hashtag).values(values);
}

export async function findHashtagsByName(database: TestDatabase, name: string) {
	return database[testDatabase].select().from(hashtag).where(eq(hashtag.name, name));
}

export async function insertUserIps(database: TestDatabase, values: UserIpInsert[]) {
	return database[testDatabase].insert(userIp).values(values).returning({
		id: userIp.id,
		ip: userIp.ip,
		createdAt: userIp.createdAt,
	});
}

export async function insertQueueOutboxes(database: TestDatabase, values: QueueOutboxInsert[]): Promise<void> {
	await database[testDatabase].insert(queueOutbox).values(values);
}

export async function deleteQueueOutboxesByIds(database: TestDatabase, ids: string[]): Promise<void> {
	await database[testDatabase].delete(queueOutbox).where(inArray(queueOutbox.id, ids));
}

export function createLocalSignupAccount(
	database: TestDatabase,
	meta: Parameters<typeof createLocalSignupAccountImpl>[0]['meta'],
	params: Parameters<typeof createLocalSignupAccountImpl>[1],
) {
	return createLocalSignupAccountImpl(
		{
			config,
			db: database[testDatabase],
			meta,
		},
		params,
	);
}

export const countAntennasByUserIdFromDatabase = bindDatabaseOperation(AntennaStore.countAntennasByUserIdFromDatabase);
export const updateAntennaInDatabase = bindDatabaseOperation(AntennaStore.updateAntennaInDatabase);
export const createAvatarDecorationInDatabase = bindDatabaseOperation(
	AvatarDecorationStore.createAvatarDecorationInDatabase,
);
export const announcementReadExistsInDatabase = bindDatabaseOperation(
	AnnouncementReadStore.announcementReadExistsInDatabase,
);
export const createAnnouncementReadInDatabase = bindDatabaseOperation(
	AnnouncementReadStore.createAnnouncementReadInDatabase,
);
export const createAnnouncementInDatabase = bindDatabaseOperation(AnnouncementStore.createAnnouncementInDatabase);
export const createAbuseUserReportInDatabase = bindDatabaseOperation(
	AbuseUserReportStore.createAbuseUserReportInDatabase,
);
export const fetchAbuseUserReportByIdOrFailFromDatabase = bindDatabaseOperation(
	AbuseUserReportStore.fetchAbuseUserReportByIdOrFailFromDatabase,
);
export const createBlockingInDatabase = bindDatabaseOperation(BlockingStore.createBlockingInDatabase);
export const deleteBlockingByIdFromDatabase = bindDatabaseOperation(BlockingStore.deleteBlockingByIdFromDatabase);
export const fetchBlockingByBlockerIdAndBlockeeIdFromDatabase = bindDatabaseOperation(
	BlockingStore.fetchBlockingByBlockerIdAndBlockeeIdFromDatabase,
);
export const channelFavoriteExistsInDatabase = bindDatabaseOperation(
	ChannelFavoriteStore.channelFavoriteExistsInDatabase,
);
export const createChannelFavoriteInDatabase = bindDatabaseOperation(
	ChannelFavoriteStore.createChannelFavoriteInDatabase,
);
export const channelFollowingExistsInDatabase = bindDatabaseOperation(
	ChannelFollowingStore.channelFollowingExistsInDatabase,
);
export const createChannelFollowingInDatabase = bindDatabaseOperation(
	ChannelFollowingStore.createChannelFollowingInDatabase,
);
export const channelMutingExistsInDatabase = bindDatabaseOperation(ChannelMutingStore.channelMutingExistsInDatabase);
export const createChannelMutingInDatabase = bindDatabaseOperation(ChannelMutingStore.createChannelMutingInDatabase);
export const createChannelInDatabase = bindDatabaseOperation(ChannelStore.createChannelInDatabase);
export const updateChannelInDatabase = bindDatabaseOperation(ChannelStore.updateChannelInDatabase);
export const clipFavoriteExistsInDatabase = bindDatabaseOperation(ClipFavoriteStore.clipFavoriteExistsInDatabase);
export const createClipInDatabase = bindDatabaseOperation(ClipStore.createClipInDatabase);
export const createDriveFileInDatabase = bindDatabaseOperation(DriveFileStore.createDriveFileInDatabase);
export const fetchDriveFileByIdFromDatabase = bindDatabaseOperation(DriveFileStore.fetchDriveFileByIdFromDatabase);
export const fetchDriveFileByUrlFromDatabase = bindDatabaseOperation(DriveFileStore.fetchDriveFileByUrlFromDatabase);
export const updateDriveFileInDatabase = bindDatabaseOperation(DriveFileStore.updateDriveFileInDatabase);
export const createDriveFolderInDatabase = bindDatabaseOperation(DriveFolderStore.createDriveFolderInDatabase);
export const fetchDriveFolderByIdFromDatabase = bindDatabaseOperation(
	DriveFolderStore.fetchDriveFolderByIdFromDatabase,
);
export const fetchEmojiByIdFromDatabase = bindDatabaseOperation(EmojiStore.fetchEmojiByIdFromDatabase);
export const fetchEmojiByIdOrFailFromDatabase = bindDatabaseOperation(EmojiStore.fetchEmojiByIdOrFailFromDatabase);
export const insertEmojiInDatabase = bindDatabaseOperation(EmojiStore.insertEmojiInDatabase);
export const flashLikeExistsInDatabase = bindDatabaseOperation(FlashLikeStore.flashLikeExistsInDatabase);
export const createFlashInDatabase = bindDatabaseOperation(FlashStore.createFlashInDatabase);
export const fetchFlashByIdFromDatabase = bindDatabaseOperation(FlashStore.fetchFlashByIdFromDatabase);
export const createFollowRequestInDatabase = bindDatabaseOperation(FollowRequestStore.createFollowRequestInDatabase);
export const fetchFollowRequestFromDatabase = bindDatabaseOperation(FollowRequestStore.fetchFollowRequestFromDatabase);
export const fetchGalleryPostByIdFromDatabase = bindDatabaseOperation(
	GalleryPostStore.fetchGalleryPostByIdFromDatabase,
);
export const createFollowingInDatabase = bindDatabaseOperation(FollowingStore.createFollowingInDatabase);
export const fetchFollowingByFollowerIdAndFolloweeIdFromDatabase = bindDatabaseOperation(
	FollowingStore.fetchFollowingByFollowerIdAndFolloweeIdFromDatabase,
);
export const createInstanceInDatabase = bindDatabaseOperation(InstanceStore.createInstanceInDatabase);
export const fetchInstanceByHostFromDatabase = bindDatabaseOperation(InstanceStore.fetchInstanceByHostFromDatabase);
export const createModerationLogInDatabase = bindDatabaseOperation(ModerationLogStore.createModerationLogInDatabase);
export const listModerationLogsFromDatabase = bindDatabaseOperation(ModerationLogStore.listModerationLogsFromDatabase);
export const fetchMetaFromDatabase = bindDatabaseOperation(MetaStore.fetchMetaFromDatabase);
export const fetchMutingByMuterIdAndMuteeIdFromDatabase = bindDatabaseOperation(
	MutingStore.fetchMutingByMuterIdAndMuteeIdFromDatabase,
);
export const createNoteDraftInDatabase = bindDatabaseOperation(NoteDraftStore.createNoteDraftInDatabase);
export const fetchNoteDraftByIdFromDatabase = bindDatabaseOperation(NoteDraftStore.fetchNoteDraftByIdFromDatabase);
export const createNoteReactionInDatabase = bindDatabaseOperation(NoteReactionStore.createNoteReactionInDatabase);
export const createNoteInDatabase = bindDatabaseOperation(NoteStore.createNoteInDatabase);
export const fetchNoteByIdFromDatabase = bindDatabaseOperation(NoteStore.fetchNoteByIdFromDatabase);
export const pageLikeExistsInDatabase = bindDatabaseOperation(PageLikeStore.pageLikeExistsInDatabase);
export const createPageInDatabase = bindDatabaseOperation(PageStore.createPageInDatabase);
export const createPollInDatabase = bindDatabaseOperation(PollStore.createPollInDatabase);
export const fetchPollByNoteIdOrFailFromDatabase = bindDatabaseOperation(PollStore.fetchPollByNoteIdOrFailFromDatabase);
export const listPollVotesByNoteAndUserFromDatabase = bindDatabaseOperation(
	PollVoteStore.listPollVotesByNoteAndUserFromDatabase,
);
export const createRelayInDatabase = bindDatabaseOperation(RelayStore.createRelayInDatabase);
export const fetchRelayByInboxFromDatabase = bindDatabaseOperation(RelayStore.fetchRelayByInboxFromDatabase);
export const fetchRenoteMutingFromDatabase = bindDatabaseOperation(RenoteMutingStore.fetchRenoteMutingFromDatabase);
export const createRetentionAggregationInDatabase = bindDatabaseOperation(
	RetentionAggregationStore.createRetentionAggregationInDatabase,
);
export const createRegistrationTicketInDatabase = bindDatabaseOperation(
	RegistrationTicketStore.createRegistrationTicketInDatabase,
);
export const createRoleAssignmentInDatabase = bindDatabaseOperation(RoleAssignmentStore.createRoleAssignmentInDatabase);
export const fetchRoleAssignmentByUserIdAndRoleIdFromDatabase = bindDatabaseOperation(
	RoleAssignmentStore.fetchRoleAssignmentByUserIdAndRoleIdFromDatabase,
);
export const createRoleInDatabase = bindDatabaseOperation(RoleStore.createRoleInDatabase);
export const createPasswordResetRequestInDatabase = bindDatabaseOperation(
	PasswordResetRequestStore.createPasswordResetRequestInDatabase,
);
export const isPromoNoteExists = bindDatabaseOperation(PromoNoteStore.isPromoNoteExists);
export const isPromoReadExists = bindDatabaseOperation(PromoReadStore.isPromoReadExists);
export const createSigninInDatabase = bindDatabaseOperation(SigninStore.createSigninInDatabase);
export const createSwSubscriptionInDatabase = bindDatabaseOperation(SwSubscriptionStore.createSwSubscriptionInDatabase);
export const fetchSystemWebhookByIdFromDatabase = bindDatabaseOperation(
	SystemWebhookStore.fetchSystemWebhookByIdFromDatabase,
);
export const createUserInDatabase = bindDatabaseOperation(UserStore.createUserInDatabase);
export const createUserWithProfileAndPublickeyInDatabase = bindDatabaseOperation(
	UserStore.createUserWithProfileAndPublickeyInDatabase,
);
export const fetchLocalUserByUsernameFromDatabase = bindDatabaseOperation(
	UserStore.fetchLocalUserByUsernameFromDatabase,
);
export const fetchUserByIdOrFailFromDatabase = bindDatabaseOperation(UserStore.fetchUserByIdOrFailFromDatabase);
export const updateUserInDatabase = bindDatabaseOperation(UserStore.updateUserInDatabase);
export const userListFavoriteExistsInDatabase = bindDatabaseOperation(
	UserListFavoriteStore.userListFavoriteExistsInDatabase,
);
export const createUserListMembershipInDatabase = bindDatabaseOperation(
	UserListMembershipStore.createUserListMembershipInDatabase,
);
export const userListMembershipExistsInDatabase = bindDatabaseOperation(
	UserListMembershipStore.userListMembershipExistsInDatabase,
);
export const createUserListInDatabase = bindDatabaseOperation(UserListStore.createUserListInDatabase);
export const deleteUserListByIdInDatabase = bindDatabaseOperation(UserListStore.deleteUserListByIdInDatabase);
export const fetchUserListByIdAndUserIdFromDatabase = bindDatabaseOperation(
	UserListStore.fetchUserListByIdAndUserIdFromDatabase,
);
export const fetchUserListByNameAndUserIdFromDatabase = bindDatabaseOperation(
	UserListStore.fetchUserListByNameAndUserIdFromDatabase,
);
export const listUserNotePiningsByUserIdFromDatabase = bindDatabaseOperation(
	UserNotePiningStore.listUserNotePiningsByUserIdFromDatabase,
);
export const fetchUserProfileByUserIdOrFailFromDatabase = bindDatabaseOperation(
	UserProfileStore.fetchUserProfileByUserIdOrFailFromDatabase,
);
export const updateUserProfileInDatabase = bindDatabaseOperation(UserProfileStore.updateUserProfileInDatabase);
export const createUserSecurityKeyInDatabase = bindDatabaseOperation(
	UserSecurityKeyStore.createUserSecurityKeyInDatabase,
);
export const createUserPendingInDatabase = bindDatabaseOperation(UserPendingStore.createUserPendingInDatabase);
export const createWebhookInDatabase = bindDatabaseOperation(WebhookStore.createWebhookInDatabase);
export const fetchWebhookByIdAndUserIdFromDatabase = bindDatabaseOperation(
	WebhookStore.fetchWebhookByIdAndUserIdFromDatabase,
);
export const dispatchQueueOutbox = bindDatabaseOperation(QueueOutboxStore.dispatchQueueOutbox);
export const fetchQueueOutboxByIdFromDatabase = bindDatabaseOperation(
	QueueOutboxStore.fetchQueueOutboxByIdFromDatabase,
);
