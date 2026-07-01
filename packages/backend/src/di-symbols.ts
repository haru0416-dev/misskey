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
	userProfilesRepository: Symbol('userProfilesRepository'),
	userListsRepository: Symbol('userListsRepository'),
	userListMembershipsRepository: Symbol('userListMembershipsRepository'),
	followingsRepository: Symbol('followingsRepository'),
	instancesRepository: Symbol('instancesRepository'),
	driveFilesRepository: Symbol('driveFilesRepository'),
	mutingsRepository: Symbol('mutingsRepository'),
	blockingsRepository: Symbol('blockingsRepository'),
	pagesRepository: Symbol('pagesRepository'),
	galleryPostsRepository: Symbol('galleryPostsRepository'),
	channelsRepository: Symbol('channelsRepository'),
	rolesRepository: Symbol('rolesRepository'),
	//#endregion
};
