/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { usersReportAbuseParamDef } from '@/server/rest/admin-abuse-reports.js';
import { usersClipsParamDef } from '@/server/rest/clips.js';
import { userListParamDef } from '@/server/rest/favorites.js';
import { usersFlashsParamDef } from '@/server/rest/flash.js';
import {
	usersFollowersOrFollowingParamDef,
	usersFollowingParamDef,
	usersGetFollowingUsersByBirthdayDocsParamDef,
} from '@/server/rest/following.js';
import { usersGalleryPostsParamDef } from '@/server/rest/gallery.js';
import { usersFeaturedNotesParamDef, usersNotesParamDef } from '@/server/rest/note.js';
import { usersPagesParamDef } from '@/server/rest/pages.js';
import { usersReactionsParamDef } from '@/server/rest/user-reactions.js';
import {
	usersGetFrequentlyRepliedUsersParamDef,
	usersParamDef,
	usersRecommendationParamDef,
	usersRelationParamDef,
	usersSearchByUsernameAndHostParamDef,
	usersSearchParamDef,
	usersShowParamDef,
	usersUpdateMemoParamDef,
} from '@/server/rest/user.js';
import {
	createFromPublicParamDef,
	createParamDef,
	getMembershipsParamDef,
	pullParamDef,
	pushParamDef,
	updateMembershipParamDef,
} from '@/server/rest/users-lists.js';
import {
	usersAchievementsParamDef,
	usersListsDeleteParamDef,
	usersListsListParamDef,
	usersListsShowParamDef,
	usersListsUpdateParamDef,
} from '@/server/rest/users.js';
import { HOUR } from '@/const.js';

export const endpointMetas = {
	users: {
		meta: {
			tags: ['users'],

			requireCredential: false,

			res: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					optional: false,
					nullable: false,
					ref: 'UserDetailed',
				},
			},
		} as const,
		paramDef: usersParamDef,
	},
	'users/achievements': {
		meta: {
			requireCredential: false,

			res: {
				type: 'array',
				items: {
					ref: 'Achievement',
				},
			},
		} as const,
		paramDef: usersAchievementsParamDef,
	},
	'users/clips': {
		meta: {
			tags: ['users', 'clips'],

			description: 'Show all clips this user owns.',

			res: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					optional: false,
					nullable: false,
					ref: 'Clip',
				},
			},
		} as const,
		paramDef: usersClipsParamDef,
	},
	'users/featured-notes': {
		meta: {
			tags: ['notes'],

			requireCredential: false,
			allowGet: true,
			cacheSec: 3600,

			res: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					optional: false,
					nullable: false,
					ref: 'Note',
				},
			},
		} as const,
		paramDef: usersFeaturedNotesParamDef,
	},
	'users/flashs': {
		meta: {
			tags: ['users', 'flashs'],

			description: 'Show all flashs this user created.',

			res: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					optional: false,
					nullable: false,
					ref: 'Flash',
				},
			},
		} as const,
		paramDef: usersFlashsParamDef,
	},
	'users/followers': {
		meta: {
			tags: ['users'],

			requireCredential: false,

			description: 'Show everyone that follows this user.',

			res: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					optional: false,
					nullable: false,
					ref: 'Following',
				},
			},

			errors: {
				noSuchUser: {
					message: 'No such user.',
					code: 'NO_SUCH_USER',
					id: '27fa5435-88ab-43de-9360-387de88727cd',
				},

				forbidden: {
					message: 'Forbidden.',
					code: 'FORBIDDEN',
					id: '3c6a84db-d619-26af-ca14-06232a21df8a',
				},
			},
		} as const,
		paramDef: usersFollowersOrFollowingParamDef,
	},
	'users/following': {
		meta: {
			tags: ['users'],

			requireCredential: false,

			description: 'Show everyone that this user is following.',

			res: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					optional: false,
					nullable: false,
					ref: 'Following',
				},
			},

			errors: {
				noSuchUser: {
					message: 'No such user.',
					code: 'NO_SUCH_USER',
					id: '63e4aba4-4156-4e53-be25-c9559e42d71b',
				},

				forbidden: {
					message: 'Forbidden.',
					code: 'FORBIDDEN',
					id: 'f6cdb0df-c19f-ec5c-7dbb-0ba84a1f92ba',
				},

				birthdayInvalid: {
					message: 'Birthday date format is invalid.',
					code: 'BIRTHDAY_DATE_FORMAT_INVALID',
					id: 'a2b007b9-4782-4eba-abd3-93b05ed4130d',
				},
			},
		} as const,
		paramDef: usersFollowingParamDef,
	},
	'users/get-following-users-by-birthday': {
		meta: {
			tags: ['users'],

			requireCredential: true,
			kind: 'read:account',

			description: 'Retrieve users who have a birthday on the specified range.',

			res: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					optional: false,
					nullable: false,
					properties: {
						id: {
							type: 'string',
							optional: false,
							nullable: false,
							format: 'misskey:id',
						},
						birthday: {
							type: 'string',
							optional: false,
							nullable: false,
						},
						user: {
							type: 'object',
							optional: false,
							nullable: false,
							ref: 'UserLite',
						},
					},
				},
			},
		} as const,
		paramDef: usersGetFollowingUsersByBirthdayDocsParamDef,
	},
	'users/gallery/posts': {
		meta: {
			tags: ['users', 'gallery'],

			description: 'Show all gallery posts by the given user.',

			res: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					optional: false,
					nullable: false,
					ref: 'GalleryPost',
				},
			},
		} as const,
		paramDef: usersGalleryPostsParamDef,
	},
	'users/get-frequently-replied-users': {
		meta: {
			tags: ['users'],

			requireCredential: false,

			description: 'Get a list of other users that the specified user frequently replies to.',

			res: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					optional: false,
					nullable: false,
					properties: {
						user: {
							type: 'object',
							optional: false,
							nullable: false,
							ref: 'UserDetailed',
						},
						weight: {
							type: 'number',
							optional: false,
							nullable: false,
						},
					},
				},
			},

			errors: {
				noSuchUser: {
					message: 'No such user.',
					code: 'NO_SUCH_USER',
					id: 'e6965129-7b2a-40a4-bae2-cd84cd434822',
				},
			},
		} as const,
		paramDef: usersGetFrequentlyRepliedUsersParamDef,
	},
	'users/lists/create': {
		meta: {
			tags: ['lists'],

			requireCredential: true,

			prohibitMoved: true,

			kind: 'write:account',

			description: 'Create a new list of users.',

			res: {
				type: 'object',
				optional: false,
				nullable: false,
				ref: 'UserList',
			},

			errors: {
				tooManyUserLists: {
					message: 'You cannot create user list any more.',
					code: 'TOO_MANY_USERLISTS',
					id: '0cf21a28-7715-4f39-a20d-777bfdb8d138',
				},
			},
		} as const,
		paramDef: createParamDef,
	},
	'users/lists/create-from-public': {
		meta: {
			requireCredential: true,
			prohibitMoved: true,
			kind: 'write:account',
			res: {
				type: 'object',
				optional: false,
				nullable: false,
				ref: 'UserList',
			},

			errors: {
				tooManyUserLists: {
					message: 'You cannot create user list any more.',
					code: 'TOO_MANY_USERLISTS',
					id: 'e9c105b2-c595-47de-97fb-7f7c2c33e92f',
				},
				noSuchList: {
					message: 'No such list.',
					code: 'NO_SUCH_LIST',
					id: '9292f798-6175-4f7d-93f4-b6742279667d',
				},
				noSuchUser: {
					message: 'No such user.',
					code: 'NO_SUCH_USER',
					id: '13c457db-a8cb-4d88-b70a-211ceeeabb5f',
				},

				youHaveBeenBlocked: {
					message: 'You cannot push this user because you have been blocked by this user.',
					code: 'YOU_HAVE_BEEN_BLOCKED',
					id: 'a2497f2a-2389-439c-8626-5298540530f4',
				},

				tooManyUsers: {
					message: 'You can not push users any more.',
					code: 'TOO_MANY_USERS',
					id: '1845ea77-38d1-426e-8e4e-8b83b24f5bd7',
				},
			},
		} as const,
		paramDef: createFromPublicParamDef,
	},
	'users/lists/delete': {
		meta: {
			tags: ['lists'],

			requireCredential: true,

			kind: 'write:account',

			description: 'Delete an existing list of users.',

			errors: {
				noSuchList: {
					message: 'No such list.',
					code: 'NO_SUCH_LIST',
					id: '78436795-db79-42f5-b1e2-55ea2cf19166',
				},
			},
		} as const,
		paramDef: usersListsDeleteParamDef,
	},
	'users/lists/favorite': {
		meta: {
			requireCredential: true,
			kind: 'write:account',
			errors: {
				noSuchList: {
					message: 'No such user list.',
					code: 'NO_SUCH_USER_LIST',
					id: '7dbaf3cf-7b42-4b8f-b431-b3919e580dbe',
				},

				alreadyFavorited: {
					message: 'The list has already been favorited.',
					code: 'ALREADY_FAVORITED',
					id: '6425bba0-985b-461e-af1b-518070e72081',
				},
			},
		} as const,
		paramDef: userListParamDef,
	},
	'users/lists/get-memberships': {
		meta: {
			allowQuery: true,
			tags: ['lists', 'account'],

			requireCredential: false,

			kind: 'read:account',

			errors: {
				noSuchList: {
					message: 'No such list.',
					code: 'NO_SUCH_LIST',
					id: '7bc05c21-1d7a-41ae-88f1-66820f4dc686',
				},
			},

			res: {
				type: 'array',
				items: {
					type: 'object',
					nullable: false,
					properties: {
						id: {
							type: 'string',
							format: 'misskey:id',
						},
						createdAt: {
							type: 'string',
							format: 'date-time',
						},
						userId: {
							type: 'string',
							format: 'misskey:id',
						},
						user: {
							type: 'object',
							ref: 'UserLite',
						},
						withReplies: {
							type: 'boolean',
						},
					},
				},
			},
		} as const,
		paramDef: getMembershipsParamDef,
	},
	'users/lists/list': {
		meta: {
			allowQuery: true,
			tags: ['lists', 'account'],

			requireCredential: false,

			kind: 'read:account',

			description: 'Show all lists that the authenticated user has created.',

			res: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					optional: false,
					nullable: false,
					ref: 'UserList',
				},
			},
			errors: {
				noSuchUser: {
					message: 'No such user.',
					code: 'NO_SUCH_USER',
					id: 'a8af4a82-0980-4cc4-a6af-8b0ffd54465e',
				},
				remoteUser: {
					message: "Not allowed to load the remote user's list",
					code: 'REMOTE_USER_NOT_ALLOWED',
					id: '53858f1b-3315-4a01-81b7-db9b48d4b79a',
				},
				invalidParam: {
					message: 'Invalid param.',
					code: 'INVALID_PARAM',
					id: 'ab36de0e-29e9-48cb-9732-d82f1281620d',
				},
			},
		} as const,
		paramDef: usersListsListParamDef,
	},
	'users/lists/pull': {
		meta: {
			tags: ['lists', 'users'],

			requireCredential: true,

			prohibitMoved: true,

			kind: 'write:account',

			description: 'Remove a user from a list.',

			errors: {
				noSuchList: {
					message: 'No such list.',
					code: 'NO_SUCH_LIST',
					id: '7f44670e-ab16-43b8-b4c1-ccd2ee89cc02',
				},

				noSuchUser: {
					message: 'No such user.',
					code: 'NO_SUCH_USER',
					id: '588e7f72-c744-4a61-b180-d354e912bda2',
				},
			},
		} as const,
		paramDef: pullParamDef,
	},
	'users/lists/push': {
		meta: {
			tags: ['lists', 'users'],

			requireCredential: true,

			prohibitMoved: true,

			kind: 'write:account',

			description: 'Add a user to an existing list.',

			limit: {
				duration: HOUR,
				max: 30,
			},

			errors: {
				noSuchList: {
					message: 'No such list.',
					code: 'NO_SUCH_LIST',
					id: '2214501d-ac96-4049-b717-91e42272a711',
				},

				noSuchUser: {
					message: 'No such user.',
					code: 'NO_SUCH_USER',
					id: 'a89abd3d-f0bc-4cce-beb1-2f446f4f1e6a',
				},

				alreadyAdded: {
					message: 'That user has already been added to that list.',
					code: 'ALREADY_ADDED',
					id: '1de7c884-1595-49e9-857e-61f12f4d4fc5',
				},

				youHaveBeenBlocked: {
					message: 'You cannot push this user because you have been blocked by this user.',
					code: 'YOU_HAVE_BEEN_BLOCKED',
					id: '990232c5-3f9d-4d83-9f3f-ef27b6332a4b',
				},

				tooManyUsers: {
					message: 'You can not push users any more.',
					code: 'TOO_MANY_USERS',
					id: '2dd9752e-a338-413d-8eec-41814430989b',
				},
			},
		} as const,
		paramDef: pushParamDef,
	},
	'users/lists/show': {
		meta: {
			allowQuery: true,
			tags: ['lists', 'account'],

			requireCredential: false,

			kind: 'read:account',

			description: 'Show the properties of a list.',

			res: {
				type: 'object',
				optional: false,
				nullable: false,
				allOf: [
					{
						type: 'object',
						ref: 'UserList',
					},
					{
						type: 'object',
						optional: false,
						nullable: false,
						properties: {
							likedCount: {
								type: 'number',
								optional: true,
								nullable: false,
							},
							isLiked: {
								type: 'boolean',
								optional: true,
								nullable: false,
							},
						},
					},
				],
			},

			errors: {
				noSuchList: {
					message: 'No such list.',
					code: 'NO_SUCH_LIST',
					id: '7bc05c21-1d7a-41ae-88f1-66820f4dc686',
				},
			},
		} as const,
		paramDef: usersListsShowParamDef,
	},
	'users/lists/unfavorite': {
		meta: {
			requireCredential: true,
			kind: 'write:account',
			errors: {
				noSuchList: {
					message: 'No such user list.',
					code: 'NO_SUCH_USER_LIST',
					id: 'baedb33e-76b8-4b0c-86a8-9375c0a7b94b',
				},

				notFavorited: {
					message: 'You have not favorited the list.',
					code: 'ALREADY_FAVORITED',
					id: '835c4b27-463d-4cfa-969b-a9058678d465',
				},
			},
		} as const,
		paramDef: userListParamDef,
	},
	'users/lists/update': {
		meta: {
			tags: ['lists'],

			requireCredential: true,

			kind: 'write:account',

			description: 'Update the properties of a list.',

			res: {
				type: 'object',
				optional: false,
				nullable: false,
				ref: 'UserList',
			},

			errors: {
				noSuchList: {
					message: 'No such list.',
					code: 'NO_SUCH_LIST',
					id: '796666fe-3dff-4d39-becb-8a5932c1d5b7',
				},
			},
		} as const,
		paramDef: usersListsUpdateParamDef,
	},
	'users/lists/update-membership': {
		meta: {
			tags: ['lists', 'users'],

			requireCredential: true,

			prohibitMoved: true,

			kind: 'write:account',

			errors: {
				noSuchList: {
					message: 'No such list.',
					code: 'NO_SUCH_LIST',
					id: '7f44670e-ab16-43b8-b4c1-ccd2ee89cc02',
				},

				noSuchUser: {
					message: 'No such user.',
					code: 'NO_SUCH_USER',
					id: '588e7f72-c744-4a61-b180-d354e912bda2',
				},
			},
		} as const,
		paramDef: updateMembershipParamDef,
	},
	'users/notes': {
		meta: {
			tags: ['users', 'notes'],

			res: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					optional: false,
					nullable: false,
					ref: 'Note',
				},
			},

			errors: {
				bothWithRepliesAndWithFiles: {
					message: 'Specifying both withReplies and withFiles is not supported',
					code: 'BOTH_WITH_REPLIES_AND_WITH_FILES',
					id: '91c8cb9f-36ed-46e7-9ca2-7df96ed6e222',
				},
			},
		} as const,
		paramDef: usersNotesParamDef,
	},
	'users/pages': {
		meta: {
			tags: ['users', 'pages'],

			description: 'Show all pages this user created.',

			res: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					optional: false,
					nullable: false,
					ref: 'Page',
				},
			},
		} as const,
		paramDef: usersPagesParamDef,
	},
	'users/reactions': {
		meta: {
			tags: ['users', 'reactions'],

			requireCredential: false,

			description: 'Show all reactions this user made.',

			res: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					optional: false,
					nullable: false,
					ref: 'NoteReactionWithNote',
				},
			},

			errors: {
				reactionsNotPublic: {
					message: 'Reactions of the user is not public.',
					code: 'REACTIONS_NOT_PUBLIC',
					id: '673a7dd2-6924-1093-e0c0-e68456ceae5c',
				},
				isRemoteUser: {
					message:
						'Currently unavailable to display reactions of remote users. See https://github.com/misskey-dev/misskey/issues/12964',
					code: 'IS_REMOTE_USER',
					id: '6b95fa98-8cf9-2350-e284-f0ffdb54a805',
				},
			},
		} as const,
		paramDef: usersReactionsParamDef,
	},
	'users/recommendation': {
		meta: {
			tags: ['users'],

			requireCredential: true,

			kind: 'read:account',

			description: 'Show users that the authenticated user might be interested to follow.',

			res: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					optional: false,
					nullable: false,
					ref: 'UserDetailed',
				},
			},
		} as const,
		paramDef: usersRecommendationParamDef,
	},
	'users/relation': {
		meta: {
			tags: ['users'],

			requireCredential: true,
			kind: 'read:account',

			description: 'Show the different kinds of relations between the authenticated user and the specified user(s).',

			res: {
				optional: false,
				nullable: false,
				oneOf: [
					{
						type: 'object',
						properties: {
							id: {
								type: 'string',
								optional: false,
								nullable: false,
								format: 'id',
							},
							isFollowing: {
								type: 'boolean',
								optional: false,
								nullable: false,
							},
							hasPendingFollowRequestFromYou: {
								type: 'boolean',
								optional: false,
								nullable: false,
							},
							hasPendingFollowRequestToYou: {
								type: 'boolean',
								optional: false,
								nullable: false,
							},
							isFollowed: {
								type: 'boolean',
								optional: false,
								nullable: false,
							},
							isBlocking: {
								type: 'boolean',
								optional: false,
								nullable: false,
							},
							isBlocked: {
								type: 'boolean',
								optional: false,
								nullable: false,
							},
							isMuted: {
								type: 'boolean',
								optional: false,
								nullable: false,
							},
							isRenoteMuted: {
								type: 'boolean',
								optional: false,
								nullable: false,
							},
						},
					},
					{
						type: 'array',
						items: {
							type: 'object',
							optional: false,
							nullable: false,
							properties: {
								id: {
									type: 'string',
									optional: false,
									nullable: false,
									format: 'id',
								},
								isFollowing: {
									type: 'boolean',
									optional: false,
									nullable: false,
								},
								hasPendingFollowRequestFromYou: {
									type: 'boolean',
									optional: false,
									nullable: false,
								},
								hasPendingFollowRequestToYou: {
									type: 'boolean',
									optional: false,
									nullable: false,
								},
								isFollowed: {
									type: 'boolean',
									optional: false,
									nullable: false,
								},
								isBlocking: {
									type: 'boolean',
									optional: false,
									nullable: false,
								},
								isBlocked: {
									type: 'boolean',
									optional: false,
									nullable: false,
								},
								isMuted: {
									type: 'boolean',
									optional: false,
									nullable: false,
								},
								isRenoteMuted: {
									type: 'boolean',
									optional: false,
									nullable: false,
								},
							},
						},
					},
				],
			},
		} as const,
		paramDef: usersRelationParamDef,
	},
	'users/report-abuse': {
		meta: {
			tags: ['users'],

			requireCredential: true,
			kind: 'write:report-abuse',

			description: 'File a report.',

			errors: {
				noSuchUser: {
					message: 'No such user.',
					code: 'NO_SUCH_USER',
					id: '1acefcb5-0959-43fd-9685-b48305736cb5',
				},

				cannotReportYourself: {
					message: 'Cannot report yourself.',
					code: 'CANNOT_REPORT_YOURSELF',
					id: '1e13149e-b1e8-43cf-902e-c01dbfcb202f',
				},

				cannotReportAdmin: {
					message: 'Cannot report the admin.',
					code: 'CANNOT_REPORT_THE_ADMIN',
					id: '35e166f5-05fb-4f87-a2d5-adb42676d48f',
				},
			},
		} as const,
		paramDef: usersReportAbuseParamDef,
	},
	'users/search': {
		meta: {
			allowQuery: true,
			tags: ['users'],

			requireCredential: false,
			requiredRolePolicy: 'canSearchUsers',

			description: 'Search for users.',

			res: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					optional: false,
					nullable: false,
					ref: 'User',
				},
			},
		} as const,
		paramDef: usersSearchParamDef,
	},
	'users/search-by-username-and-host': {
		meta: {
			tags: ['users'],

			requireCredential: false,

			description: 'Search for a user by username and/or host.',

			res: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					optional: false,
					nullable: false,
					ref: 'User',
				},
			},
		} as const,
		paramDef: usersSearchByUsernameAndHostParamDef,
	},
	'users/show': {
		meta: {
			tags: ['users'],

			requireCredential: false,

			description: 'Show the properties of a user.',

			res: {
				optional: false,
				nullable: false,
				oneOf: [
					{
						type: 'object',
						ref: 'UserDetailed',
					},
					{
						type: 'array',
						items: {
							type: 'object',
							ref: 'UserDetailed',
						},
					},
				],
			},

			errors: {
				failedToResolveRemoteUser: {
					message: 'Failed to resolve remote user.',
					code: 'FAILED_TO_RESOLVE_REMOTE_USER',
					id: 'ef7b9be4-9cba-4e6f-ab41-90ed171c7d3c',
					httpStatusCode: 500,
					kind: 'server',
				},

				noSuchUser: {
					message: 'No such user.',
					code: 'NO_SUCH_USER',
					id: '4362f8dc-731f-4ad8-a694-be5a88922a24',
					httpStatusCode: 404,
				},
			},
		} as const,
		paramDef: usersShowParamDef,
	},
	'users/update-memo': {
		meta: {
			tags: ['account'],

			requireCredential: true,

			kind: 'write:account',

			errors: {
				noSuchUser: {
					message: 'No such user.',
					code: 'NO_SUCH_USER',
					id: '6fef56f3-e765-4957-88e5-c6f65329b8a5',
				},
			},
		} as const,
		paramDef: usersUpdateMemoParamDef,
	},
} as const;
