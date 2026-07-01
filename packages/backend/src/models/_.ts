/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import {
	FindOneOptions,
	ObjectLiteral,
	Repository,
} from 'typeorm';
import { MiAbuseReportNotificationRecipient } from '@/models/AbuseReportNotificationRecipient.js';
import { MiAbuseUserReport } from '@/models/AbuseUserReport.js';
import { MiAccessToken } from '@/models/AccessToken.js';
import { MiAd } from '@/models/Ad.js';
import { MiAnnouncement } from '@/models/Announcement.js';
import { MiAnnouncementRead } from '@/models/AnnouncementRead.js';
import { MiAntenna } from '@/models/Antenna.js';
import { MiApp } from '@/models/App.js';
import { MiAuthSession } from '@/models/AuthSession.js';
import { MiAvatarDecoration } from '@/models/AvatarDecoration.js';
import { MiBlocking } from '@/models/Blocking.js';
import { MiChannel } from '@/models/Channel.js';
import { MiChatMessage } from '@/models/ChatMessage.js';
import { MiChatRoom } from '@/models/ChatRoom.js';
import { MiChatRoomInvitation } from '@/models/ChatRoomInvitation.js';
import { MiChatRoomMembership } from '@/models/ChatRoomMembership.js';
import { MiClip } from '@/models/Clip.js';
import { MiClipNote } from '@/models/ClipNote.js';
import { MiDriveFile } from '@/models/DriveFile.js';
import { MiDriveFolder } from '@/models/DriveFolder.js';
import { MiEmoji } from '@/models/Emoji.js';
import { MiFlash } from '@/models/Flash.js';
import { MiFollowing } from '@/models/Following.js';
import { MiFollowRequest } from '@/models/FollowRequest.js';
import { MiGalleryPost } from '@/models/GalleryPost.js';
import { MiHashtag } from '@/models/Hashtag.js';
import { MiInstance } from '@/models/Instance.js';
import { MiMeta } from '@/models/Meta.js';
import { MiMuting } from '@/models/Muting.js';
import { MiNote } from '@/models/Note.js';
import { MiNoteDraft } from '@/models/NoteDraft.js';
import { MiNoteFavorite } from '@/models/NoteFavorite.js';
import { MiNoteReaction } from '@/models/NoteReaction.js';
import { MiPage } from '@/models/Page.js';
import { MiPoll } from '@/models/Poll.js';
import { MiPollVote } from '@/models/PollVote.js';
import { MiRegistrationTicket } from '@/models/RegistrationTicket.js';
import { MiRenoteMuting } from '@/models/RenoteMuting.js';
import { MiRole } from '@/models/Role.js';
import { MiRoleAssignment } from '@/models/RoleAssignment.js';
import { MiSystemWebhook } from '@/models/SystemWebhook.js';
import { MiUser } from '@/models/User.js';
import { MiUserList } from '@/models/UserList.js';
import { MiUserListMembership } from '@/models/UserListMembership.js';
import { MiUserNotePining } from '@/models/UserNotePining.js';
import { MiUserProfile } from '@/models/UserProfile.js';
import { MiUserSecurityKey } from '@/models/UserSecurityKey.js';
import { MiWebhook } from '@/models/Webhook.js';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity.js';

export interface MiRepository<T extends ObjectLiteral> {
	insertOne(this: Repository<T> & MiRepository<T>, entity: QueryDeepPartialEntity<T>, findOptions?: Pick<FindOneOptions<T>, 'relations'>): Promise<T>;
}

export const miRepository = {
	async insertOne(entity, findOptions?) {
		return await this.insert(entity).then(x => this.findOneOrFail({ where: x.identifiers[0], ...findOptions }));
	},
} satisfies MiRepository<ObjectLiteral>;

export {
	MiAbuseUserReport,
	MiAbuseReportNotificationRecipient,
	MiAccessToken,
	MiAd,
	MiAnnouncement,
	MiAnnouncementRead,
	MiAntenna,
	MiApp,
	MiAvatarDecoration,
	MiAuthSession,
	MiBlocking,
	MiClip,
	MiClipNote,
	MiDriveFile,
	MiDriveFolder,
	MiEmoji,
	MiFollowing,
	MiFollowRequest,
	MiGalleryPost,
	MiHashtag,
	MiInstance,
	MiMeta,
	MiMuting,
	MiRenoteMuting,
	MiNote,
	MiNoteDraft,
	MiNoteFavorite,
	MiNoteReaction,
	MiPage,
	MiPoll,
	MiPollVote,
	MiRegistrationTicket,
	MiUser,
	MiUserList,
	MiUserListMembership,
	MiUserNotePining,
	MiUserProfile,
	MiUserSecurityKey,
	MiWebhook,
	MiSystemWebhook,
	MiChannel,
	MiRole,
	MiRoleAssignment,
	MiFlash,
	MiChatMessage,
	MiChatRoom,
	MiChatRoomMembership,
	MiChatRoomInvitation,
};

export type AbuseUserReportsRepository = Repository<MiAbuseUserReport> & MiRepository<MiAbuseUserReport>;
export type AbuseReportNotificationRecipientRepository =
	Repository<MiAbuseReportNotificationRecipient>
	& MiRepository<MiAbuseReportNotificationRecipient>;
export type AccessTokensRepository = Repository<MiAccessToken> & MiRepository<MiAccessToken>;
export type AdsRepository = Repository<MiAd> & MiRepository<MiAd>;
export type AnnouncementsRepository = Repository<MiAnnouncement> & MiRepository<MiAnnouncement>;
export type AnnouncementReadsRepository = Repository<MiAnnouncementRead> & MiRepository<MiAnnouncementRead>;
export type AntennasRepository = Repository<MiAntenna> & MiRepository<MiAntenna>;
export type AppsRepository = Repository<MiApp> & MiRepository<MiApp>;
export type AuthSessionsRepository = Repository<MiAuthSession> & MiRepository<MiAuthSession>;
export type BlockingsRepository = Repository<MiBlocking> & MiRepository<MiBlocking>;
export type ClipsRepository = Repository<MiClip> & MiRepository<MiClip>;
export type ClipNotesRepository = Repository<MiClipNote> & MiRepository<MiClipNote>;
export type DriveFilesRepository = Repository<MiDriveFile> & MiRepository<MiDriveFile>;
export type DriveFoldersRepository = Repository<MiDriveFolder> & MiRepository<MiDriveFolder>;
export type EmojisRepository = Repository<MiEmoji> & MiRepository<MiEmoji>;
export type FollowingsRepository = Repository<MiFollowing> & MiRepository<MiFollowing>;
export type FollowRequestsRepository = Repository<MiFollowRequest> & MiRepository<MiFollowRequest>;
export type GalleryPostsRepository = Repository<MiGalleryPost> & MiRepository<MiGalleryPost>;
export type HashtagsRepository = Repository<MiHashtag> & MiRepository<MiHashtag>;
export type InstancesRepository = Repository<MiInstance> & MiRepository<MiInstance>;
export type MutingsRepository = Repository<MiMuting> & MiRepository<MiMuting>;
export type RenoteMutingsRepository = Repository<MiRenoteMuting> & MiRepository<MiRenoteMuting>;
export type NotesRepository = Repository<MiNote> & MiRepository<MiNote>;
export type NoteDraftsRepository = Repository<MiNoteDraft> & MiRepository<MiNoteDraft>;
export type NoteFavoritesRepository = Repository<MiNoteFavorite> & MiRepository<MiNoteFavorite>;
export type NoteReactionsRepository = Repository<MiNoteReaction> & MiRepository<MiNoteReaction>;
export type PagesRepository = Repository<MiPage> & MiRepository<MiPage>;
export type PollsRepository = Repository<MiPoll> & MiRepository<MiPoll>;
export type PollVotesRepository = Repository<MiPollVote> & MiRepository<MiPollVote>;
export type RegistrationTicketsRepository = Repository<MiRegistrationTicket> & MiRepository<MiRegistrationTicket>;
export type UsersRepository = Repository<MiUser> & MiRepository<MiUser>;
export type UserListsRepository = Repository<MiUserList> & MiRepository<MiUserList>;
export type UserListMembershipsRepository = Repository<MiUserListMembership> & MiRepository<MiUserListMembership>;
export type UserNotePiningsRepository = Repository<MiUserNotePining> & MiRepository<MiUserNotePining>;
export type UserProfilesRepository = Repository<MiUserProfile> & MiRepository<MiUserProfile>;
export type UserSecurityKeysRepository = Repository<MiUserSecurityKey> & MiRepository<MiUserSecurityKey>;
export type WebhooksRepository = Repository<MiWebhook> & MiRepository<MiWebhook>;
export type SystemWebhooksRepository = Repository<MiSystemWebhook> & MiRepository<MiWebhook>;
export type ChannelsRepository = Repository<MiChannel> & MiRepository<MiChannel>;
export type RolesRepository = Repository<MiRole> & MiRepository<MiRole>;
export type RoleAssignmentsRepository = Repository<MiRoleAssignment> & MiRepository<MiRoleAssignment>;
export type FlashsRepository = Repository<MiFlash> & MiRepository<MiFlash>;
export type ChatMessagesRepository = Repository<MiChatMessage> & MiRepository<MiChatMessage>;
export type ChatRoomsRepository = Repository<MiChatRoom> & MiRepository<MiChatRoom>;
export type ChatRoomMembershipsRepository = Repository<MiChatRoomMembership> & MiRepository<MiChatRoomMembership>;
export type ChatRoomInvitationsRepository = Repository<MiChatRoomInvitation> & MiRepository<MiChatRoomInvitation>;
