/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const DI = {
	config: Symbol('config'),
	db: Symbol('db'),
	drizzle: Symbol('drizzle'),
	drizzlePool: Symbol('drizzlePool'),
	meta: Symbol('meta'),
	meilisearch: Symbol('meilisearch'),
	redis: Symbol('redis'),
	redisForPub: Symbol('redisForPub'),
	redisForSub: Symbol('redisForSub'),
	redisForTimelines: Symbol('redisForTimelines'),
	redisForReactions: Symbol('redisForReactions'),

	//#region Repositories
	usersRepository: Symbol('usersRepository'),
	notesRepository: Symbol('notesRepository'),
	announcementsRepository: Symbol('announcementsRepository'),
	appsRepository: Symbol('appsRepository'),
	noteReactionsRepository: Symbol('noteReactionsRepository'),
	pollsRepository: Symbol('pollsRepository'),
	userProfilesRepository: Symbol('userProfilesRepository'),
	userSecurityKeysRepository: Symbol('userSecurityKeysRepository'),
	userListsRepository: Symbol('userListsRepository'),
	userListMembershipsRepository: Symbol('userListMembershipsRepository'),
	followingsRepository: Symbol('followingsRepository'),
	followRequestsRepository: Symbol('followRequestsRepository'),
	instancesRepository: Symbol('instancesRepository'),
	emojisRepository: Symbol('emojisRepository'),
	driveFilesRepository: Symbol('driveFilesRepository'),
	driveFoldersRepository: Symbol('driveFoldersRepository'),
	mutingsRepository: Symbol('mutingsRepository'),
	blockingsRepository: Symbol('blockingsRepository'),
	abuseUserReportsRepository: Symbol('abuseUserReportsRepository'),
	registrationTicketsRepository: Symbol('registrationTicketsRepository'),
	accessTokensRepository: Symbol('accessTokensRepository'),
	pagesRepository: Symbol('pagesRepository'),
	galleryPostsRepository: Symbol('galleryPostsRepository'),
	clipsRepository: Symbol('clipsRepository'),
	antennasRepository: Symbol('antennasRepository'),
	channelsRepository: Symbol('channelsRepository'),
	webhooksRepository: Symbol('webhooksRepository'),
	rolesRepository: Symbol('rolesRepository'),
	roleAssignmentsRepository: Symbol('roleAssignmentsRepository'),
	flashsRepository: Symbol('flashsRepository'),
	chatMessagesRepository: Symbol('chatMessagesRepository'),
	noteDraftsRepository: Symbol('noteDraftsRepository'),
	//#endregion
};
