/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { fetchEmojisHostTypes, fetchEmojisSortKeys } from '@/core/custom-emoji-types.js';
import { blockingListParamDef, userIdParamDef } from '@/server/rest/account-blocking.js';
import {
	muteCreateParamDef,
	muteListParamDef,
	userIdParamDef as userIdParamDef_2,
} from '@/server/rest/account-mutes.js';
import { announcementShowParamDef, announcementsParamDef } from '@/server/rest/announcements.js';
import { apGetParamDef, apShowParamDef } from '@/server/rest/ap.js';
import { appCreateParamDef, appShowParamDef, myAppsParamDef } from '@/server/rest/app.js';
import {
	authSessionGenerateParamDef,
	authSessionShowParamDef,
	authSessionUserkeyParamDef,
} from '@/server/rest/auth-session.js';
import { emailAddressAvailableParamDef, usernameAvailableParamDef } from '@/server/rest/availability.js';
import { getAvatarDecorationsParamDef } from '@/server/rest/avatar-decorations.js';
import { emojiParamDef } from '@/server/rest/emojis.js';
import { endpointParamDef } from '@/server/rest/endpoint-info.js';
import { fetchExternalResourcesParamDef } from '@/server/rest/fetch-external-resources.js';
import { fetchRssParamDef } from '@/server/rest/fetch-rss.js';
import { emptyParamDef, inviteDeleteParamDef, inviteListParamDef } from '@/server/rest/invite.js';
import { metaParamDef, testParamDef } from '@/server/rest/meta.js';
import { miauthGenTokenParamDef } from '@/server/rest/miauth.js';
import { notificationsCreateParamDef, notificationsDeleteParamDef } from '@/server/rest/notification.js';
import { pagePushParamDef } from '@/server/rest/page-push.js';
import { requestResetPasswordParamDef, resetPasswordParamDef } from '@/server/rest/password-reset.js';
import { promoReadParamDef } from '@/server/rest/promo.js';
import { resetDbParamDef } from '@/server/rest/reset-db.js';
import { retentionParamDef } from '@/server/rest/retention.js';
import { rolesListParamDef, rolesNotesParamDef, rolesShowParamDef, rolesUsersParamDef } from '@/server/rest/roles.js';
import { swRegisterParamDef, swShowRegistrationParamDef, swUpdateRegistrationParamDef } from '@/server/rest/sw.js';
import { pinnedUsersParamDef } from '@/server/rest/user.js';
import { verifyEmailParamDef } from '@/server/rest/verify-email.js';
import { z } from 'zod';
import { MINUTE, HOUR } from '@/const.js';

export const endpointMetas = {
	announcements: {
		meta: {
			tags: ['meta'],

			requireCredential: false,

			res: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					optional: false,
					nullable: false,
					ref: 'Announcement',
				},
			},
		} as const,
		paramDef: announcementsParamDef,
	},
	'announcements/show': {
		meta: {
			tags: ['meta'],

			requireCredential: false,

			res: {
				type: 'object',
				optional: false,
				nullable: false,
				ref: 'Announcement',
			},

			errors: {
				noSuchAnnouncement: {
					message: 'No such announcement.',
					code: 'NO_SUCH_ANNOUNCEMENT',
					id: 'b57b5e1d-4f49-404a-9edb-46b00268f121',
					httpStatusCode: 404,
				},
			},
		} as const,
		paramDef: announcementShowParamDef,
	},
	'ap/get': {
		meta: {
			tags: ['federation'],

			requireAdmin: true,
			requireCredential: true,
			kind: 'read:federation',

			limit: {
				duration: HOUR,
				max: 30,
			},

			errors: {},

			res: {
				type: 'object',
				optional: false,
				nullable: false,
			},
		} as const,
		paramDef: apGetParamDef,
	},
	'ap/show': {
		meta: {
			tags: ['federation'],

			requireCredential: true,
			kind: 'read:account',

			limit: {
				duration: HOUR,
				max: 30,
			},

			errors: {
				federationNotAllowed: {
					message: 'Federation for this host is not allowed.',
					code: 'FEDERATION_NOT_ALLOWED',
					id: '974b799e-1a29-4889-b706-18d4dd93e266',
				},
				uriInvalid: {
					message: 'URI is invalid.',
					code: 'URI_INVALID',
					id: '1a5eab56-e47b-48c2-8d5e-217b897d70db',
				},
				requestFailed: {
					message: 'Request failed.',
					code: 'REQUEST_FAILED',
					id: '81b539cf-4f57-4b29-bc98-032c33c0792e',
				},
				responseInvalid: {
					message: 'Response from remote server is invalid.',
					code: 'RESPONSE_INVALID',
					id: '70193c39-54f3-4813-82f0-70a680f7495b',
				},
				noSuchObject: {
					message: 'No such object.',
					code: 'NO_SUCH_OBJECT',
					id: 'dc94d745-1262-4e63-a17d-fecaa57efc82',
				},
			},

			res: {
				optional: false,
				nullable: false,
				oneOf: [
					{
						type: 'object',
						properties: {
							type: {
								type: 'string',
								optional: false,
								nullable: false,
								enum: ['User'],
							},
							object: {
								type: 'object',
								optional: false,
								nullable: false,
								ref: 'UserDetailedNotMe',
							},
						},
					},
					{
						type: 'object',
						properties: {
							type: {
								type: 'string',
								optional: false,
								nullable: false,
								enum: ['Note'],
							},
							object: {
								type: 'object',
								optional: false,
								nullable: false,
								ref: 'Note',
							},
						},
					},
				],
			},
		} as const,
		paramDef: apShowParamDef,
	},
	'app/create': {
		meta: {
			tags: ['app'],

			requireCredential: false,

			res: {
				type: 'object',
				optional: false,
				nullable: false,
				ref: 'App',
			},
		} as const,
		paramDef: appCreateParamDef,
	},
	'app/show': {
		meta: {
			tags: ['app'],

			errors: {
				noSuchApp: {
					message: 'No such app.',
					code: 'NO_SUCH_APP',
					id: 'dce83913-2dc6-4093-8a7b-71dbb11718a3',
				},
			},

			res: {
				type: 'object',
				optional: false,
				nullable: false,
				ref: 'App',
			},
		} as const,
		paramDef: appShowParamDef,
	},
	'auth/accept': {
		meta: {
			tags: ['auth'],

			requireCredential: true,

			secure: true,

			errors: {
				noSuchSession: {
					message: 'No such session.',
					code: 'NO_SUCH_SESSION',
					id: '9c72d8de-391a-43c1-9d06-08d29efde8df',
				},
			},
		} as const,
		paramDef: authSessionShowParamDef,
	},
	'auth/session/generate': {
		meta: {
			tags: ['auth'],

			requireCredential: false,

			res: {
				type: 'object',
				optional: false,
				nullable: false,
				properties: {
					token: {
						type: 'string',
						optional: false,
						nullable: false,
					},
					url: {
						type: 'string',
						optional: false,
						nullable: false,
						format: 'url',
					},
				},
			},

			errors: {
				noSuchApp: {
					message: 'No such app.',
					code: 'NO_SUCH_APP',
					id: '92f93e63-428e-4f2f-a5a4-39e1407fe998',
				},
			},
		} as const,
		paramDef: authSessionGenerateParamDef,
	},
	'auth/session/show': {
		meta: {
			tags: ['auth'],

			requireCredential: false,

			errors: {
				noSuchSession: {
					message: 'No such session.',
					code: 'NO_SUCH_SESSION',
					id: 'bd72c97d-eba7-4adb-a467-f171b8847250',
				},
			},

			res: {
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
					app: {
						type: 'object',
						optional: false,
						nullable: false,
						ref: 'App',
					},
					token: {
						type: 'string',
						optional: false,
						nullable: false,
					},
				},
			},
		} as const,
		paramDef: authSessionShowParamDef,
	},
	'auth/session/userkey': {
		meta: {
			tags: ['auth'],

			requireCredential: false,

			res: {
				type: 'object',
				optional: false,
				nullable: false,
				properties: {
					accessToken: {
						type: 'string',
						optional: false,
						nullable: false,
					},

					user: {
						type: 'object',
						optional: false,
						nullable: false,
						ref: 'UserDetailedNotMe',
					},
				},
			},

			errors: {
				noSuchApp: {
					message: 'No such app.',
					code: 'NO_SUCH_APP',
					id: 'fcab192a-2c5a-43b7-8ad8-9b7054d8d40d',
				},

				noSuchSession: {
					message: 'No such session.',
					code: 'NO_SUCH_SESSION',
					id: '5b5a1503-8bc8-4bd0-8054-dc189e8cdcb3',
				},

				pendingSession: {
					message: 'This session is not completed yet.',
					code: 'PENDING_SESSION',
					id: '8c8a4145-02cc-4cca-8e66-29ba60445a8e',
				},
			},
		} as const,
		paramDef: authSessionUserkeyParamDef,
	},
	'blocking/create': {
		meta: {
			tags: ['account'],

			limit: {
				duration: HOUR,
				max: 20,
			},

			requireCredential: true,

			kind: 'write:blocks',

			errors: {
				noSuchUser: {
					message: 'No such user.',
					code: 'NO_SUCH_USER',
					id: '7cc4f851-e2f1-4621-9633-ec9e1d00c01e',
				},

				blockeeIsYourself: {
					message: 'Blockee is yourself.',
					code: 'BLOCKEE_IS_YOURSELF',
					id: '88b19138-f28d-42c0-8499-6a31bbd0fdc6',
				},

				alreadyBlocking: {
					message: 'You are already blocking that user.',
					code: 'ALREADY_BLOCKING',
					id: '787fed64-acb9-464a-82eb-afbd745b9614',
				},
			},

			res: {
				type: 'object',
				optional: false,
				nullable: false,
				ref: 'UserDetailedNotMe',
			},
		} as const,
		paramDef: userIdParamDef,
	},
	'blocking/delete': {
		meta: {
			tags: ['account'],

			limit: {
				duration: HOUR,
				max: 100,
			},

			requireCredential: true,

			kind: 'write:blocks',

			errors: {
				noSuchUser: {
					message: 'No such user.',
					code: 'NO_SUCH_USER',
					id: '8621d8bf-c358-4303-a066-5ea78610eb3f',
				},

				blockeeIsYourself: {
					message: 'Blockee is yourself.',
					code: 'BLOCKEE_IS_YOURSELF',
					id: '06f6fac6-524b-473c-a354-e97a40ae6eac',
				},

				notBlocking: {
					message: 'You are not blocking that user.',
					code: 'NOT_BLOCKING',
					id: '291b2efa-60c6-45c0-9f6a-045c8f9b02cd',
				},
			},

			res: {
				type: 'object',
				optional: false,
				nullable: false,
				ref: 'UserDetailedNotMe',
			},
		} as const,
		paramDef: userIdParamDef,
	},
	'blocking/list': {
		meta: {
			tags: ['account'],

			requireCredential: true,

			kind: 'read:blocks',

			res: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					optional: false,
					nullable: false,
					ref: 'Blocking',
				},
			},
		} as const,
		paramDef: blockingListParamDef,
	},
	'email-address/available': {
		meta: {
			tags: ['users'],

			requireCredential: false,

			res: {
				type: 'object',
				optional: false,
				nullable: false,
				properties: {
					available: {
						type: 'boolean',
						optional: false,
						nullable: false,
					},
					reason: {
						type: 'string',
						optional: false,
						nullable: true,
					},
				},
			},
		} as const,
		paramDef: emailAddressAvailableParamDef,
	},
	emoji: {
		meta: {
			tags: ['meta'],

			requireCredential: false,
			allowGet: true,
			cacheSec: 3600,

			errors: {
				noSuchEmoji: {
					message: 'No such emoji.',
					code: 'NO_SUCH_EMOJI',
					id: 'e2785b66-dca3-4087-9cac-b93c541cc425',
					httpStatusCode: 404,
				},
			},

			res: {
				type: 'object',
				optional: false,
				nullable: false,
				ref: 'EmojiDetailed',
			},
		} as const,
		paramDef: emojiParamDef,
	},
	emojis: {
		meta: {
			tags: ['meta'],

			requireCredential: false,
			allowGet: true,
			cacheSec: 3600,

			res: {
				type: 'object',
				optional: false,
				nullable: false,
				properties: {
					emojis: {
						type: 'array',
						optional: false,
						nullable: false,
						items: {
							type: 'object',
							optional: false,
							nullable: false,
							ref: 'EmojiSimple',
						},
					},
				},
			},
		} as const,
		paramDef: z.object({}),
	},
	endpoint: {
		meta: {
			requireCredential: false,

			tags: ['meta'],

			res: {
				type: 'object',
				nullable: true,
				properties: {
					params: {
						type: 'array',
						items: {
							type: 'object',
							properties: {
								name: { type: 'string' },
								type: { type: 'string' },
							},
						},
					},
				},
			},
		} as const,
		paramDef: endpointParamDef,
	},
	endpoints: {
		meta: {
			requireCredential: false,

			tags: ['meta'],

			res: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'string',
					optional: false,
					nullable: false,
				},
				example: ['admin/abuse-user-reports', 'admin/accounts/create', 'admin/announcements/create', '...'],
			},
		} as const,
		paramDef: z.object({}),
	},
	'export-custom-emojis': {
		meta: {
			secure: true,
			requireCredential: true,
			limit: {
				duration: HOUR,
				max: 1,
			},
		} as const,
		paramDef: z.object({}),
	},
	'fetch-external-resources': {
		meta: {
			tags: ['meta'],

			requireCredential: true,
			secure: true,

			limit: {
				duration: HOUR,
				max: 50,
			},

			errors: {
				invalidSchema: {
					message: 'External resource returned invalid schema.',
					code: 'EXT_RESOURCE_RETURNED_INVALID_SCHEMA',
					id: 'bb774091-7a15-4a70-9dc5-6ac8cf125856',
				},
				hashUnmached: {
					message: 'Hash did not match.',
					code: 'EXT_RESOURCE_HASH_DIDNT_MATCH',
					id: '693ba8ba-b486-40df-a174-72f8279b56a4',
				},
			},

			res: {
				type: 'object',
				properties: {
					type: {
						type: 'string',
					},
					data: {
						type: 'string',
					},
				},
			},
		} as const,
		paramDef: fetchExternalResourcesParamDef,
	},
	'fetch-rss': {
		meta: {
			tags: ['meta'],

			requireCredential: false,
			allowGet: true,
			cacheSec: 60 * 3,
			limit: {
				duration: MINUTE,
				max: 30,
			},

			errors: {
				invalidUrl: {
					message: 'Invalid URL.',
					code: 'INVALID_URL',
					id: '89b7ee05-ccfc-4bdd-9b13-61172fd1e06c',
					httpStatusCode: 400,
				},
				fetchRssFailed: {
					message: 'Failed to fetch RSS.',
					code: 'FETCH_RSS_FAILED',
					id: '8db5d3d8-31d7-452f-b0cc-ca3b8925de12',
					kind: 'server',
					httpStatusCode: 422,
				},
				fetchRssUnavailable: {
					message: 'RSS fetching is temporarily unavailable.',
					code: 'FETCH_RSS_UNAVAILABLE',
					id: '91e6ff44-c63f-4725-9ad0-b7a40d7f7655',
					kind: 'server',
					httpStatusCode: 503,
				},
			},

			res: {
				type: 'object',
				properties: {
					image: {
						type: 'object',
						optional: true,
						properties: {
							link: {
								type: 'string',
								optional: true,
							},
							url: {
								type: 'string',
								optional: false,
							},
							title: {
								type: 'string',
								optional: true,
							},
						},
					},
					paginationLinks: {
						type: 'object',
						optional: true,
						properties: {
							self: {
								type: 'string',
								optional: true,
							},
							first: {
								type: 'string',
								optional: true,
							},
							next: {
								type: 'string',
								optional: true,
							},
							last: {
								type: 'string',
								optional: true,
							},
							prev: {
								type: 'string',
								optional: true,
							},
						},
					},
					link: {
						type: 'string',
						optional: true,
					},
					title: {
						type: 'string',
						optional: true,
					},
					items: {
						type: 'array',
						optional: false,
						items: {
							type: 'object',
							properties: {
								link: {
									type: 'string',
									optional: true,
								},
								guid: {
									type: 'string',
									optional: true,
								},
								title: {
									type: 'string',
									optional: true,
								},
								pubDate: {
									type: 'string',
									optional: true,
								},
								creator: {
									type: 'string',
									optional: true,
								},
								summary: {
									type: 'string',
									optional: true,
								},
								content: {
									type: 'string',
									optional: true,
								},
								isoDate: {
									type: 'string',
									optional: true,
								},
								categories: {
									type: 'array',
									optional: true,
									items: {
										type: 'string',
									},
								},
								contentSnippet: {
									type: 'string',
									optional: true,
								},
								enclosure: {
									type: 'object',
									optional: true,
									properties: {
										url: {
											type: 'string',
											optional: false,
										},
										length: {
											type: 'number',
											optional: true,
										},
										type: {
											type: 'string',
											optional: true,
										},
									},
								},
							},
						},
					},
					feedUrl: {
						type: 'string',
						optional: true,
					},
					description: {
						type: 'string',
						optional: true,
					},
					itunes: {
						type: 'object',
						optional: true,
						additionalProperties: true,
						properties: {
							image: {
								type: 'string',
								optional: true,
							},
							owner: {
								type: 'object',
								optional: true,
								properties: {
									name: {
										type: 'string',
										optional: true,
									},
									email: {
										type: 'string',
										optional: true,
									},
								},
							},
							author: {
								type: 'string',
								optional: true,
							},
							summary: {
								type: 'string',
								optional: true,
							},
							explicit: {
								type: 'string',
								optional: true,
							},
							categories: {
								type: 'array',
								optional: true,
								items: {
									type: 'string',
								},
							},
							keywords: {
								type: 'array',
								optional: true,
								items: {
									type: 'string',
								},
							},
						},
					},
				},
			},
		} as const,
		paramDef: fetchRssParamDef,
	},
	'get-avatar-decorations': {
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
					properties: {
						id: {
							type: 'string',
							optional: false,
							nullable: false,
							format: 'id',
							example: 'xxxxxxxxxx',
						},
						name: {
							type: 'string',
							optional: false,
							nullable: false,
						},
						description: {
							type: 'string',
							optional: false,
							nullable: false,
						},
						url: {
							type: 'string',
							optional: false,
							nullable: false,
						},
						roleIdsThatCanBeUsedThisDecoration: {
							type: 'array',
							optional: false,
							nullable: false,
							items: {
								type: 'string',
								optional: false,
								nullable: false,
								format: 'id',
							},
						},
						category: {
							type: 'string',
							optional: true,
							nullable: true,
						},
					},
				},
			},
		} as const,
		paramDef: getAvatarDecorationsParamDef,
	},
	'get-online-users-count': {
		meta: {
			tags: ['meta'],

			requireCredential: false,
			allowGet: true,
			cacheSec: 60 * 1,
			res: {
				type: 'object',
				optional: false,
				nullable: false,
				properties: {
					count: {
						type: 'number',
						nullable: false,
					},
				},
			},
		} as const,
		paramDef: z.object({}),
	},
	'invite/create': {
		meta: {
			tags: ['meta'],

			requireCredential: true,
			requiredRolePolicy: 'canInvite',
			kind: 'write:invite-codes',

			errors: {
				exceededCreateLimit: {
					message: 'You have exceeded the limit for creating an invitation code.',
					code: 'EXCEEDED_LIMIT_OF_CREATE_INVITE_CODE',
					id: '8b165dd3-6f37-4557-8db1-73175d63c641',
				},
			},

			res: {
				type: 'object',
				optional: false,
				nullable: false,
				ref: 'InviteCode',
			},
		} as const,
		paramDef: emptyParamDef,
	},
	'invite/delete': {
		meta: {
			tags: ['meta'],

			requireCredential: true,
			requiredRolePolicy: 'canInvite',
			kind: 'write:invite-codes',

			errors: {
				noSuchCode: {
					message: 'No such invite code.',
					code: 'NO_SUCH_INVITE_CODE',
					id: 'cd4f9ae4-7854-4e3e-8df9-c296f051e634',
				},

				cantDelete: {
					message: "You can't delete this invite code.",
					code: 'CAN_NOT_DELETE_INVITE_CODE',
					id: 'ff17af39-000c-4d4e-abdf-848fa30fc1ce',
				},

				accessDenied: {
					message: 'Access denied.',
					code: 'ACCESS_DENIED',
					id: '5eb8d909-2540-4970-90b8-dd6f86088121',
				},
			},
		} as const,
		paramDef: inviteDeleteParamDef,
	},
	'invite/limit': {
		meta: {
			tags: ['meta'],

			requireCredential: true,
			requiredRolePolicy: 'canInvite',
			kind: 'read:invite-codes',

			res: {
				type: 'object',
				optional: false,
				nullable: false,
				properties: {
					remaining: {
						type: 'integer',
						optional: false,
						nullable: true,
					},
				},
			},
		} as const,
		paramDef: emptyParamDef,
	},
	'invite/list': {
		meta: {
			tags: ['meta'],

			requireCredential: true,
			requiredRolePolicy: 'canInvite',
			kind: 'read:invite-codes',

			res: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					optional: false,
					nullable: false,
					ref: 'InviteCode',
				},
			},
		} as const,
		paramDef: inviteListParamDef,
	},
	meta: {
		meta: {
			tags: ['meta'],

			requireCredential: false,

			res: {
				type: 'object',
				oneOf: [
					{ type: 'object', ref: 'MetaLite' },
					{ type: 'object', ref: 'MetaDetailed' },
				],
			},
		} as const,
		paramDef: metaParamDef,
	},
	'miauth/gen-token': {
		meta: {
			tags: ['auth'],

			requireCredential: true,

			secure: true,

			res: {
				type: 'object',
				optional: false,
				nullable: false,
				properties: {
					token: {
						type: 'string',
						optional: false,
						nullable: false,
					},
				},
			},
		} as const,
		paramDef: miauthGenTokenParamDef,
	},
	'mute/create': {
		meta: {
			tags: ['account'],

			requireCredential: true,
			prohibitMoved: true,

			kind: 'write:mutes',

			limit: {
				duration: HOUR,
				max: 20,
			},

			errors: {
				noSuchUser: {
					message: 'No such user.',
					code: 'NO_SUCH_USER',
					id: '6fef56f3-e765-4957-88e5-c6f65329b8a5',
				},

				muteeIsYourself: {
					message: 'Mutee is yourself.',
					code: 'MUTEE_IS_YOURSELF',
					id: 'a4619cb2-5f23-484b-9301-94c903074e10',
				},

				alreadyMuting: {
					message: 'You are already muting that user.',
					code: 'ALREADY_MUTING',
					id: '7e7359cb-160c-4956-b08f-4d1c653cd007',
				},
			},
		} as const,
		paramDef: muteCreateParamDef,
	},
	'mute/delete': {
		meta: {
			tags: ['account'],

			requireCredential: true,

			kind: 'write:mutes',

			errors: {
				noSuchUser: {
					message: 'No such user.',
					code: 'NO_SUCH_USER',
					id: 'b851d00b-8ab1-4a56-8b1b-e24187cb48ef',
				},

				muteeIsYourself: {
					message: 'Mutee is yourself.',
					code: 'MUTEE_IS_YOURSELF',
					id: 'f428b029-6b39-4d48-a1d2-cc1ae6dd5cf9',
				},

				notMuting: {
					message: 'You are not muting that user.',
					code: 'NOT_MUTING',
					id: '5467d020-daa9-4553-81e1-135c0c35a96d',
				},
			},
		} as const,
		paramDef: userIdParamDef_2,
	},
	'mute/list': {
		meta: {
			tags: ['account'],

			requireCredential: true,

			kind: 'read:mutes',

			res: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					optional: false,
					nullable: false,
					ref: 'Muting',
				},
			},
		} as const,
		paramDef: muteListParamDef,
	},
	'my/apps': {
		meta: {
			tags: ['account', 'app'],

			requireCredential: true,
			kind: 'read:account',

			res: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					optional: false,
					nullable: false,
					ref: 'App',
				},
			},
		} as const,
		paramDef: myAppsParamDef,
	},
	'notifications/create': {
		meta: {
			tags: ['notifications'],

			requireCredential: true,

			kind: 'write:notifications',

			limit: {
				duration: 1000 * 60,
				max: 10,
			},

			errors: {},
		} as const,
		paramDef: notificationsCreateParamDef,
	},
	'notifications/delete': {
		meta: {
			tags: ['notifications', 'account'],

			requireCredential: true,

			kind: 'write:notifications',
		} as const,
		paramDef: notificationsDeleteParamDef,
	},
	'notifications/flush': {
		meta: {
			tags: ['notifications', 'account'],

			requireCredential: true,

			kind: 'write:notifications',
		} as const,
		paramDef: z.object({}),
	},
	'notifications/mark-all-as-read': {
		meta: {
			tags: ['notifications', 'account'],

			requireCredential: true,

			kind: 'write:notifications',
		} as const,
		paramDef: z.object({}),
	},
	'notifications/test-notification': {
		meta: {
			tags: ['notifications'],

			requireCredential: true,

			kind: 'write:notifications',

			limit: {
				duration: 1000 * 60,
				max: 10,
			},
		} as const,
		paramDef: z.object({}),
	},
	'page-push': {
		meta: {
			requireCredential: true,
			secure: true,

			errors: {
				noSuchPage: {
					message: 'No such page.',
					code: 'NO_SUCH_PAGE',
					id: '4a13ad31-6729-46b4-b9af-e86b265c2e74',
				},
			},
		} as const,
		paramDef: pagePushParamDef,
	},
	ping: {
		meta: {
			requireCredential: false,

			tags: ['meta'],

			res: {
				type: 'object',
				optional: false,
				nullable: false,
				properties: {
					pong: {
						type: 'number',
						optional: false,
						nullable: false,
					},
				},
			},
		} as const,
		paramDef: z.object({}),
	},
	'pinned-users': {
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
		paramDef: pinnedUsersParamDef,
	},
	'promo/read': {
		meta: {
			tags: ['notes'],

			requireCredential: true,
			kind: 'write:account',

			errors: {
				noSuchNote: {
					message: 'No such note.',
					code: 'NO_SUCH_NOTE',
					id: 'd785b897-fcd3-4fe9-8fc3-b85c26e6c932',
				},
			},
		} as const,
		paramDef: promoReadParamDef,
	},
	'renote-mute/create': {
		meta: {
			tags: ['account'],

			requireCredential: true,
			prohibitMoved: true,

			kind: 'write:mutes',

			limit: {
				duration: HOUR,
				max: 20,
			},

			errors: {
				noSuchUser: {
					message: 'No such user.',
					code: 'NO_SUCH_USER',
					id: '5e0a5dff-1e94-4202-87ae-4d9c89eb2271',
				},

				muteeIsYourself: {
					message: 'Mutee is yourself.',
					code: 'MUTEE_IS_YOURSELF',
					id: '37285718-52f7-4aef-b7de-c38b8e8a8420',
				},

				alreadyMuting: {
					message: 'You are already muting that user.',
					code: 'ALREADY_MUTING',
					id: 'ccfecbe4-1f1c-4fc2-8a3d-c3ffee61cb7b',
				},
			},
		} as const,
		paramDef: userIdParamDef_2,
	},
	'renote-mute/delete': {
		meta: {
			tags: ['account'],

			requireCredential: true,

			kind: 'write:mutes',

			errors: {
				noSuchUser: {
					message: 'No such user.',
					code: 'NO_SUCH_USER',
					id: '9b6728cf-638c-4aa1-bedb-e07d8101474d',
				},

				muteeIsYourself: {
					message: 'Mutee is yourself.',
					code: 'MUTEE_IS_YOURSELF',
					id: '619b1314-0850-4597-a242-e245f3da42af',
				},

				notMuting: {
					message: 'You are not muting that user.',
					code: 'NOT_MUTING',
					id: '2e4ef874-8bf0-4b4b-b069-4598f6d05817',
				},
			},
		} as const,
		paramDef: userIdParamDef_2,
	},
	'renote-mute/list': {
		meta: {
			tags: ['account'],

			requireCredential: true,

			kind: 'read:mutes',

			res: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					optional: false,
					nullable: false,
					ref: 'RenoteMuting',
				},
			},
		} as const,
		paramDef: muteListParamDef,
	},
	'request-reset-password': {
		meta: {
			tags: ['reset password'],

			requireCredential: false,

			description: 'Request a users password to be reset.',

			limit: {
				duration: HOUR,
				max: 3,
			},

			errors: {},
		} as const,
		paramDef: requestResetPasswordParamDef,
	},
	'reset-db': {
		meta: {
			tags: ['non-productive'],

			requireCredential: false,

			description:
				'Only available when running with <code>NODE_ENV=testing</code>. Reset the database and flush Valkey.',

			errors: {},
		} as const,
		paramDef: resetDbParamDef,
	},
	'reset-password': {
		meta: {
			tags: ['reset password'],

			requireCredential: false,

			description: 'Complete the password reset that was previously requested.',

			errors: {
				invalidToken: {
					message: 'Invalid or expired token.',
					code: 'INVALID_TOKEN',
					id: 'e04a2320-6ee2-4a11-8ad2-c9ea9e2ab84f',
				},
			},
		} as const,
		paramDef: resetPasswordParamDef,
	},
	retention: {
		meta: {
			tags: ['users'],

			requireCredential: false,

			res: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						createdAt: {
							type: 'string',
							format: 'date-time',
						},
						users: {
							type: 'number',
						},
						data: {
							type: 'object',
							additionalProperties: {
								anyOf: [
									{
										type: 'number',
									},
								],
							},
						},
					},
					required: ['createdAt', 'users', 'data'],
				},
			},

			allowGet: true,
			cacheSec: 60 * 60,
		} as const,
		paramDef: retentionParamDef,
	},
	'roles/list': {
		meta: {
			tags: ['role'],

			requireCredential: true,
			kind: 'read:account',

			res: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					optional: false,
					nullable: false,
					ref: 'Role',
				},
			},
		} as const,
		paramDef: rolesListParamDef,
	},
	'roles/notes': {
		meta: {
			tags: ['role', 'notes'],

			requireCredential: true,
			kind: 'read:account',

			errors: {
				noSuchRole: {
					message: 'No such role.',
					code: 'NO_SUCH_ROLE',
					id: 'eb70323a-df61-4dd4-ad90-89c83c7cf26e',
				},
			},

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
		paramDef: rolesNotesParamDef,
	},
	'roles/show': {
		meta: {
			tags: ['role', 'users'],

			requireCredential: false,

			errors: {
				noSuchRole: {
					message: 'No such role.',
					code: 'NO_SUCH_ROLE',
					id: 'de5502bf-009a-4639-86c1-fec349e46dcb',
				},
			},

			res: {
				type: 'object',
				optional: false,
				nullable: false,
				ref: 'Role',
			},
		} as const,
		paramDef: rolesShowParamDef,
	},
	'roles/users': {
		meta: {
			tags: ['role', 'users'],

			requireCredential: false,

			errors: {
				noSuchRole: {
					message: 'No such role.',
					code: 'NO_SUCH_ROLE',
					id: '30aaaee3-4792-48dc-ab0d-cf501a575ac5',
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
						user: {
							type: 'object',
							ref: 'UserDetailed',
						},
					},
					required: ['id', 'user'],
				},
			},
		} as const,
		paramDef: rolesUsersParamDef,
	},
	'server-info': {
		meta: {
			requireCredential: false,
			allowGet: true,
			cacheSec: 60 * 1,

			tags: ['meta'],
			res: {
				type: 'object',
				optional: false,
				nullable: false,
				properties: {
					machine: {
						type: 'string',
						nullable: false,
					},
					cpu: {
						type: 'object',
						nullable: false,
						properties: {
							model: {
								type: 'string',
								nullable: false,
							},
							cores: {
								type: 'number',
								nullable: false,
							},
						},
					},
					mem: {
						type: 'object',
						properties: {
							total: {
								type: 'number',
								nullable: false,
							},
						},
					},
					fs: {
						type: 'object',
						nullable: false,
						properties: {
							total: {
								type: 'number',
								nullable: false,
							},
							used: {
								type: 'number',
								nullable: false,
							},
						},
					},
				},
			},
		} as const,
		paramDef: z.object({}),
	},
	stats: {
		meta: {
			requireCredential: false,

			tags: ['meta'],

			res: {
				type: 'object',
				optional: false,
				nullable: false,
				properties: {
					notesCount: {
						type: 'number',
						optional: false,
						nullable: false,
					},
					originalNotesCount: {
						type: 'number',
						optional: false,
						nullable: false,
					},
					usersCount: {
						type: 'number',
						optional: false,
						nullable: false,
					},
					originalUsersCount: {
						type: 'number',
						optional: false,
						nullable: false,
					},
					reactionsCount: {
						type: 'number',
						optional: false,
						nullable: false,
					},
					instances: {
						type: 'number',
						optional: false,
						nullable: false,
					},
					driveUsageLocal: {
						type: 'number',
						optional: false,
						nullable: false,
					},
					driveUsageRemote: {
						type: 'number',
						optional: false,
						nullable: false,
					},
				},
			},
		} as const,
		paramDef: z.object({}),
	},
	'sw/register': {
		meta: {
			tags: ['account'],

			requireCredential: true,
			secure: true,

			description: 'Register to receive push notifications.',

			res: {
				type: 'object',
				optional: false,
				nullable: false,
				properties: {
					state: {
						type: 'string',
						optional: true,
						nullable: false,
						enum: ['already-subscribed', 'subscribed'],
					},
					key: {
						type: 'string',
						optional: false,
						nullable: true,
					},
					userId: {
						type: 'string',
						optional: false,
						nullable: false,
					},
					endpoint: {
						type: 'string',
						optional: false,
						nullable: false,
					},
					sendReadMessage: {
						type: 'boolean',
						optional: false,
						nullable: false,
					},
				},
			},
		} as const,
		paramDef: swRegisterParamDef,
	},
	'sw/show-registration': {
		meta: {
			tags: ['account'],

			requireCredential: true,
			secure: true,

			description: 'Check push notification registration exists.',

			res: {
				type: 'object',
				optional: false,
				nullable: true,
				properties: {
					userId: {
						type: 'string',
						optional: false,
						nullable: false,
					},
					endpoint: {
						type: 'string',
						optional: false,
						nullable: false,
					},
					sendReadMessage: {
						type: 'boolean',
						optional: false,
						nullable: false,
					},
				},
			},
		} as const,
		paramDef: swShowRegistrationParamDef,
	},
	'sw/unregister': {
		meta: {
			tags: ['account'],

			requireCredential: false,

			description: 'Unregister from receiving push notifications.',
		} as const,
		paramDef: swShowRegistrationParamDef,
	},
	'sw/update-registration': {
		meta: {
			tags: ['account'],

			requireCredential: true,
			secure: true,

			description: 'Update push notification registration.',

			res: {
				type: 'object',
				optional: false,
				nullable: false,
				properties: {
					userId: {
						type: 'string',
						optional: false,
						nullable: false,
					},
					endpoint: {
						type: 'string',
						optional: false,
						nullable: false,
					},
					sendReadMessage: {
						type: 'boolean',
						optional: false,
						nullable: false,
					},
				},
			},
			errors: {
				noSuchRegistration: {
					message: 'No such registration.',
					code: 'NO_SUCH_REGISTRATION',
					id: ' b09d8066-8064-5613-efb6-0e963b21d012',
				},
			},
		} as const,
		paramDef: swUpdateRegistrationParamDef,
	},
	test: {
		meta: {
			tags: ['non-productive'],

			description: 'Endpoint for testing input validation.',

			requireCredential: false,

			res: {
				type: 'object',
				properties: {
					id: {
						type: 'string',
						format: 'misskey:id',
						optional: true,
						nullable: false,
					},
					required: {
						type: 'boolean',
						optional: false,
						nullable: false,
					},
					string: {
						type: 'string',
						optional: true,
						nullable: false,
					},
					default: {
						type: 'string',
						optional: true,
						nullable: false,
					},
					nullableDefault: {
						type: 'string',
						default: 'hello',
						optional: true,
						nullable: true,
					},
				},
			},
		} as const,
		paramDef: testParamDef,
	},
	'username/available': {
		meta: {
			tags: ['users'],

			requireCredential: false,

			res: {
				type: 'object',
				optional: false,
				nullable: false,
				properties: {
					available: {
						type: 'boolean',
						optional: false,
						nullable: false,
					},
				},
			},
		} as const,
		paramDef: usernameAvailableParamDef,
	},
	'verify-email': {
		meta: {
			requireCredential: false,

			tags: ['account'],

			errors: {
				noSuchCode: {
					message: 'No such code.',
					code: 'NO_SUCH_CODE',
					id: '97c1f576-e4b8-4b8a-a6dc-9cb65e7f6f85',
				},
			},
		} as const,
		paramDef: verifyEmailParamDef,
	},
	'v2/admin/emoji/list': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requiredRolePolicy: 'canManageCustomEmojis',
			kind: 'read:admin:emoji',

			res: {
				type: 'object',
				properties: {
					emojis: {
						type: 'array',
						items: {
							type: 'object',
							ref: 'EmojiDetailedAdmin',
						},
					},
					count: { type: 'integer' },
					allCount: { type: 'integer' },
					allPages: { type: 'integer' },
				},
			},
		} as const,
		paramDef: {
			type: 'object',
			properties: {
				query: {
					type: 'object',
					nullable: true,
					properties: {
						updatedAtFrom: { type: 'string' },
						updatedAtTo: { type: 'string' },
						name: { type: 'string' },
						host: { type: 'string' },
						uri: { type: 'string' },
						publicUrl: { type: 'string' },
						originalUrl: { type: 'string' },
						type: { type: 'string' },
						aliases: { type: 'string' },
						category: { type: 'string' },
						license: { type: 'string' },
						isSensitive: { type: 'boolean' },
						localOnly: { type: 'boolean' },
						hostType: {
							type: 'string',
							enum: fetchEmojisHostTypes,
							default: 'all',
						},
						roleIds: {
							type: 'array',
							items: { type: 'string', format: 'misskey:id' },
						},
					},
				},
				sinceId: { type: 'string', format: 'misskey:id' },
				untilId: { type: 'string', format: 'misskey:id' },
				sinceDate: { type: 'integer' },
				untilDate: { type: 'integer' },
				limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
				page: { type: 'integer' },
				sortKeys: {
					type: 'array',
					default: ['-id'],
					items: {
						type: 'string',
						enum: fetchEmojisSortKeys,
					},
				},
			},
			required: [],
		} as const,
	},
} as const;
