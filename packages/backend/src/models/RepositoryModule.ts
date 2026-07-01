/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Module } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import {
	MiAbuseUserReport,
	MiAccessToken,
	MiAnnouncement,
	MiAntenna,
	MiApp,
	MiBlocking,
	MiChannel,
	MiClip,
	MiClipNote,
	MiDriveFile,
	MiDriveFolder,
	MiEmoji,
	MiFlash,
	MiFollowing,
	MiFollowRequest,
	MiGalleryPost,
	MiInstance,
	MiMuting,
	MiNote,
	MiNoteFavorite,
	MiNoteReaction,
	MiNoteDraft,
	MiPage,
	MiPoll,
	MiRegistrationTicket,
	MiRepository,
	miRepository,
	MiRole,
	MiRoleAssignment,
	MiUser,
	MiUserList,
	MiUserListMembership,
	MiUserNotePining,
	MiUserProfile,
	MiUserSecurityKey,
	MiWebhook,
	MiChatMessage,
	MiChatRoom,
	MiChatRoomMembership,
	MiChatRoomInvitation,
} from './_.js';
import type { Provider } from '@nestjs/common';
import type { DataSource } from 'typeorm';

const $usersRepository: Provider = {
	provide: DI.usersRepository,
	useFactory: (db: DataSource) => db.getRepository(MiUser).extend(miRepository as MiRepository<MiUser>),
	inject: [DI.db],
};

const $notesRepository: Provider = {
	provide: DI.notesRepository,
	useFactory: (db: DataSource) => db.getRepository(MiNote).extend(miRepository as MiRepository<MiNote>),
	inject: [DI.db],
};

const $announcementsRepository: Provider = {
	provide: DI.announcementsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiAnnouncement).extend(miRepository as MiRepository<MiAnnouncement>),
	inject: [DI.db],
};

const $appsRepository: Provider = {
	provide: DI.appsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiApp).extend(miRepository as MiRepository<MiApp>),
	inject: [DI.db],
};

const $noteFavoritesRepository: Provider = {
	provide: DI.noteFavoritesRepository,
	useFactory: (db: DataSource) => db.getRepository(MiNoteFavorite).extend(miRepository as MiRepository<MiNoteFavorite>),
	inject: [DI.db],
};

const $noteReactionsRepository: Provider = {
	provide: DI.noteReactionsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiNoteReaction).extend(miRepository as MiRepository<MiNoteReaction>),
	inject: [DI.db],
};

const $noteDraftsRepository: Provider = {
	provide: DI.noteDraftsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiNoteDraft).extend(miRepository as MiRepository<MiNoteDraft>),
	inject: [DI.db],
};

const $pollsRepository: Provider = {
	provide: DI.pollsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiPoll).extend(miRepository as MiRepository<MiPoll>),
	inject: [DI.db],
};

const $userProfilesRepository: Provider = {
	provide: DI.userProfilesRepository,
	useFactory: (db: DataSource) => db.getRepository(MiUserProfile).extend(miRepository as MiRepository<MiUserProfile>),
	inject: [DI.db],
};

const $userSecurityKeysRepository: Provider = {
	provide: DI.userSecurityKeysRepository,
	useFactory: (db: DataSource) => db.getRepository(MiUserSecurityKey).extend(miRepository as MiRepository<MiUserSecurityKey>),
	inject: [DI.db],
};

const $userListsRepository: Provider = {
	provide: DI.userListsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiUserList).extend(miRepository as MiRepository<MiUserList>),
	inject: [DI.db],
};

const $userListMembershipsRepository: Provider = {
	provide: DI.userListMembershipsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiUserListMembership).extend(miRepository as MiRepository<MiUserListMembership>),
	inject: [DI.db],
};

const $userNotePiningsRepository: Provider = {
	provide: DI.userNotePiningsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiUserNotePining).extend(miRepository as MiRepository<MiUserNotePining>),
	inject: [DI.db],
};

const $followingsRepository: Provider = {
	provide: DI.followingsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiFollowing).extend(miRepository as MiRepository<MiFollowing>),
	inject: [DI.db],
};

const $followRequestsRepository: Provider = {
	provide: DI.followRequestsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiFollowRequest).extend(miRepository as MiRepository<MiFollowRequest>),
	inject: [DI.db],
};

const $instancesRepository: Provider = {
	provide: DI.instancesRepository,
	useFactory: (db: DataSource) => db.getRepository(MiInstance).extend(miRepository as MiRepository<MiInstance>),
	inject: [DI.db],
};

const $emojisRepository: Provider = {
	provide: DI.emojisRepository,
	useFactory: (db: DataSource) => db.getRepository(MiEmoji).extend(miRepository as MiRepository<MiEmoji>),
	inject: [DI.db],
};

const $driveFilesRepository: Provider = {
	provide: DI.driveFilesRepository,
	useFactory: (db: DataSource) => db.getRepository(MiDriveFile).extend(miRepository as MiRepository<MiDriveFile>),
	inject: [DI.db],
};

const $driveFoldersRepository: Provider = {
	provide: DI.driveFoldersRepository,
	useFactory: (db: DataSource) => db.getRepository(MiDriveFolder).extend(miRepository as MiRepository<MiDriveFolder>),
	inject: [DI.db],
};

const $mutingsRepository: Provider = {
	provide: DI.mutingsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiMuting).extend(miRepository as MiRepository<MiMuting>),
	inject: [DI.db],
};

const $blockingsRepository: Provider = {
	provide: DI.blockingsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiBlocking).extend(miRepository as MiRepository<MiBlocking>),
	inject: [DI.db],
};

const $abuseUserReportsRepository: Provider = {
	provide: DI.abuseUserReportsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiAbuseUserReport).extend(miRepository as MiRepository<MiAbuseUserReport>),
	inject: [DI.db],
};

const $registrationTicketsRepository: Provider = {
	provide: DI.registrationTicketsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiRegistrationTicket).extend(miRepository as MiRepository<MiRegistrationTicket>),
	inject: [DI.db],
};

const $accessTokensRepository: Provider = {
	provide: DI.accessTokensRepository,
	useFactory: (db: DataSource) => db.getRepository(MiAccessToken).extend(miRepository as MiRepository<MiAccessToken>),
	inject: [DI.db],
};

const $pagesRepository: Provider = {
	provide: DI.pagesRepository,
	useFactory: (db: DataSource) => db.getRepository(MiPage).extend(miRepository as MiRepository<MiPage>),
	inject: [DI.db],
};

const $galleryPostsRepository: Provider = {
	provide: DI.galleryPostsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiGalleryPost).extend(miRepository as MiRepository<MiGalleryPost>),
	inject: [DI.db],
};

const $clipsRepository: Provider = {
	provide: DI.clipsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiClip).extend(miRepository as MiRepository<MiClip>),
	inject: [DI.db],
};

const $clipNotesRepository: Provider = {
	provide: DI.clipNotesRepository,
	useFactory: (db: DataSource) => db.getRepository(MiClipNote).extend(miRepository as MiRepository<MiClipNote>),
	inject: [DI.db],
};

const $antennasRepository: Provider = {
	provide: DI.antennasRepository,
	useFactory: (db: DataSource) => db.getRepository(MiAntenna).extend(miRepository as MiRepository<MiAntenna>),
	inject: [DI.db],
};

const $channelsRepository: Provider = {
	provide: DI.channelsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiChannel).extend(miRepository as MiRepository<MiChannel>),
	inject: [DI.db],
};

const $webhooksRepository: Provider = {
	provide: DI.webhooksRepository,
	useFactory: (db: DataSource) => db.getRepository(MiWebhook).extend(miRepository as MiRepository<MiWebhook>),
	inject: [DI.db],
};

const $flashsRepository: Provider = {
	provide: DI.flashsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiFlash).extend(miRepository as MiRepository<MiFlash>),
	inject: [DI.db],
};

const $rolesRepository: Provider = {
	provide: DI.rolesRepository,
	useFactory: (db: DataSource) => db.getRepository(MiRole).extend(miRepository as MiRepository<MiRole>),
	inject: [DI.db],
};

const $roleAssignmentsRepository: Provider = {
	provide: DI.roleAssignmentsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiRoleAssignment).extend(miRepository as MiRepository<MiRoleAssignment>),
	inject: [DI.db],
};

const $chatMessagesRepository: Provider = {
	provide: DI.chatMessagesRepository,
	useFactory: (db: DataSource) => db.getRepository(MiChatMessage).extend(miRepository as MiRepository<MiChatMessage>),
	inject: [DI.db],
};

const $chatRoomsRepository: Provider = {
	provide: DI.chatRoomsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiChatRoom).extend(miRepository as MiRepository<MiChatRoom>),
	inject: [DI.db],
};

const $chatRoomMembershipsRepository: Provider = {
	provide: DI.chatRoomMembershipsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiChatRoomMembership).extend(miRepository as MiRepository<MiChatRoomMembership>),
	inject: [DI.db],
};

const $chatRoomInvitationsRepository: Provider = {
	provide: DI.chatRoomInvitationsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiChatRoomInvitation).extend(miRepository as MiRepository<MiChatRoomInvitation>),
	inject: [DI.db],
};

@Module({
	imports: [],
	providers: [
		$usersRepository,
		$notesRepository,
		$announcementsRepository,
		$appsRepository,
		$noteFavoritesRepository,
		$noteReactionsRepository,
		$noteDraftsRepository,
		$pollsRepository,
		$userProfilesRepository,
		$userSecurityKeysRepository,
		$userListsRepository,
		$userListMembershipsRepository,
		$userNotePiningsRepository,
		$followingsRepository,
		$followRequestsRepository,
		$instancesRepository,
		$emojisRepository,
		$driveFilesRepository,
		$driveFoldersRepository,
		$mutingsRepository,
		$blockingsRepository,
		$abuseUserReportsRepository,
		$registrationTicketsRepository,
		$accessTokensRepository,
		$pagesRepository,
		$galleryPostsRepository,
		$clipsRepository,
		$clipNotesRepository,
		$antennasRepository,
		$channelsRepository,
		$webhooksRepository,
		$rolesRepository,
		$roleAssignmentsRepository,
		$flashsRepository,
		$chatMessagesRepository,
		$chatRoomsRepository,
		$chatRoomMembershipsRepository,
		$chatRoomInvitationsRepository,
	],
	exports: [
		$usersRepository,
		$notesRepository,
		$announcementsRepository,
		$appsRepository,
		$noteFavoritesRepository,
		$noteReactionsRepository,
		$noteDraftsRepository,
		$pollsRepository,
		$userProfilesRepository,
		$userSecurityKeysRepository,
		$userListsRepository,
		$userListMembershipsRepository,
		$userNotePiningsRepository,
		$followingsRepository,
		$followRequestsRepository,
		$instancesRepository,
		$emojisRepository,
		$driveFilesRepository,
		$driveFoldersRepository,
		$mutingsRepository,
		$blockingsRepository,
		$abuseUserReportsRepository,
		$registrationTicketsRepository,
		$accessTokensRepository,
		$pagesRepository,
		$galleryPostsRepository,
		$clipsRepository,
		$clipNotesRepository,
		$antennasRepository,
		$channelsRepository,
		$webhooksRepository,
		$rolesRepository,
		$roleAssignmentsRepository,
		$flashsRepository,
		$chatMessagesRepository,
		$chatRoomsRepository,
		$chatRoomMembershipsRepository,
		$chatRoomInvitationsRepository,
	],
})
export class RepositoryModule {
}
