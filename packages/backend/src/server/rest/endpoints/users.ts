/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { endpointMetas as usersContracts } from '@/server/api/metas/users.js';
import { implementEndpoints } from '../endpoint-definition.js';
import type { ApiShellDependencies } from '../shell.js';
import { handleApiUsersReportAbuse } from '../admin/admin-abuse-reports.js';
import { handleApiUsersClips } from '../clip/clips.js';
import { handleApiUsersListsFavorite, handleApiUsersListsUnfavorite } from '../favorite/favorites.js';
import { handleApiUsersFlashs } from '../flash/flash.js';
import { handleApiUsersGalleryPosts } from '../gallery/gallery.js';
import { handleApiUsersFeaturedNotes, handleApiUsersNotes } from '../note/note.js';
import { handleApiUsersPages } from '../page/pages.js';
import {
	handleApiUsersFollowers,
	handleApiUsersFollowing,
	handleApiUsersGetFollowingUsersByBirthday,
} from '../user/following.js';
import { handleApiUsersReactions } from '../user/user-reactions.js';
import {
	handleApiUsers,
	handleApiUsersGetFrequentlyRepliedUsers,
	handleApiUsersRecommendation,
	handleApiUsersRelation,
	handleApiUsersSearch,
	handleApiUsersSearchByUsernameAndHost,
	handleApiUsersShow,
	handleApiUsersUpdateMemo,
} from '../user/user.js';
import {
	handleApiUsersListsCreate,
	handleApiUsersListsCreateFromPublic,
	handleApiUsersListsGetMemberships,
	handleApiUsersListsPull,
	handleApiUsersListsPush,
	handleApiUsersListsUpdateMembership,
} from '../user/users-lists.js';
import {
	handleApiUsersAchievements,
	handleApiUsersListsDelete,
	handleApiUsersListsList,
	handleApiUsersListsShow,
	handleApiUsersListsUpdate,
} from '../user/users.js';
import { resolveUserForApi } from '../activitypub/ap-person.js';

export const usersEndpoints = implementEndpoints<ApiShellDependencies>()(usersContracts, {
	users: async ({ deps, input, me }) => await handleApiUsers(deps, me, input),
	'users/achievements': async ({ deps, input }) => await handleApiUsersAchievements(deps, input),
	'users/clips': async ({ deps, input, me }) => await handleApiUsersClips(deps, me, input),
	'users/featured-notes': async ({ deps, input, me }) => await handleApiUsersFeaturedNotes(deps, me, input),
	'users/flashs': async ({ deps, input }) => await handleApiUsersFlashs(deps, input),
	'users/followers': async ({ deps, input, me }) => await handleApiUsersFollowers(deps, me, input),
	'users/following': async ({ deps, input, me }) => await handleApiUsersFollowing(deps, me, input),
	'users/get-following-users-by-birthday': async ({ deps, input, me }) =>
		await handleApiUsersGetFollowingUsersByBirthday(deps, me, input),
	'users/gallery/posts': async ({ deps, input, me }) => await handleApiUsersGalleryPosts(deps, me, input),
	'users/get-frequently-replied-users': async ({ deps, errors, input, me }) =>
		await handleApiUsersGetFrequentlyRepliedUsers(deps, me, input, errors),
	'users/lists/create': async ({ deps, input, me }) => await handleApiUsersListsCreate(deps, me, input),
	'users/lists/create-from-public': async ({ deps, input, me }) =>
		await handleApiUsersListsCreateFromPublic(deps, me, input),
	'users/lists/delete': async ({ deps, input, me }) => {
		await handleApiUsersListsDelete(deps, me, input);
	},
	'users/lists/favorite': async ({ deps, input, me }) => {
		await handleApiUsersListsFavorite(deps, me, input);
	},
	'users/lists/get-memberships': async ({ deps, input, me }) =>
		await handleApiUsersListsGetMemberships(deps, me, input),
	'users/lists/list': async ({ deps, input, me }) => await handleApiUsersListsList(deps, me, input),
	'users/lists/pull': async ({ deps, input, me }) => {
		await handleApiUsersListsPull(deps, me, input);
	},
	'users/lists/push': async ({ deps, input, me }) => {
		await handleApiUsersListsPush(deps, me, input);
	},
	'users/lists/show': async ({ deps, input, me }) => await handleApiUsersListsShow(deps, me, input),
	'users/lists/unfavorite': async ({ deps, input, me }) => {
		await handleApiUsersListsUnfavorite(deps, me, input);
	},
	'users/lists/update': async ({ deps, input, me }) => await handleApiUsersListsUpdate(deps, me, input),
	'users/lists/update-membership': async ({ deps, input, me }) => {
		await handleApiUsersListsUpdateMembership(deps, me, input);
	},
	'users/notes': async ({ deps, errors, input, me }) => await handleApiUsersNotes(deps, me, input, errors),
	'users/pages': async ({ deps, input }) => await handleApiUsersPages(deps, input),
	'users/reactions': async ({ deps, errors, input, me }) => await handleApiUsersReactions(deps, me, input, errors),
	'users/recommendation': async ({ deps, input, me }) => await handleApiUsersRecommendation(deps, me, input),
	'users/relation': async ({ deps, input, me }) => await handleApiUsersRelation(deps, me, input),
	'users/report-abuse': async ({ deps, errors, input, me }) => {
		await handleApiUsersReportAbuse(deps, me, input, errors);
	},
	'users/search': async ({ deps, input, me }) => await handleApiUsersSearch(deps, me, input),
	'users/search-by-username-and-host': async ({ deps, input, me }) =>
		await handleApiUsersSearchByUsernameAndHost(deps, me, input),
	'users/update-memo': async ({ deps, errors, input, me }) => {
		await handleApiUsersUpdateMemo(deps, me, input, errors);
	},
	'users/show': async ({ deps, me, input, requestIp }) =>
		await handleApiUsersShow(
			{ ...deps, resolveUser: (username, host) => resolveUserForApi(deps, username, host) },
			me,
			input,
			requestIp(),
		),
});
