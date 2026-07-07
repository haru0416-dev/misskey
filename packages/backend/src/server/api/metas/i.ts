/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { webhookEventTypes } from '@/models/Webhook.js';
import { iMoveParamDef } from '@/server/rest/account-move.js';
import { iPinOrUnpinParamDef } from '@/server/rest/account-pin.js';
import { changePasswordParamDef, deleteAccountParamDef, regenerateTokenParamDef, updateEmailParamDef } from '@/server/rest/account-security.js';
import { iUpdateParamDef } from '@/server/rest/account-update.js';
import { readAnnouncementParamDef } from '@/server/rest/announcements.js';
import { iAppsParamDef, iAuthorizedAppsParamDef, iRevokeTokenParamDef } from '@/server/rest/app.js';
import { exportFollowingParamDef } from '@/server/rest/export-jobs.js';
import { iFavoritesParamDef } from '@/server/rest/favorites.js';
import { iGalleryLikesParamDef, iGalleryPostsParamDef } from '@/server/rest/gallery.js';
import { i2faDoneParamDef, i2faKeyDoneParamDef, i2faPasswordLessParamDef, i2faRegisterKeyParamDef, i2faRegisterParamDef, i2faRemoveKeyParamDef, i2faUnregisterParamDef, i2faUpdateKeyParamDef } from '@/server/rest/i-2fa.js';
import { iSigninHistoryParamDef } from '@/server/rest/i.js';
import { importAntennasParamDef, importBlockingParamDef, importFollowingParamDef, importMutingParamDef, importUserListsParamDef } from '@/server/rest/import-jobs.js';
import { claimAchievementParamDef } from '@/server/rest/notification.js';
import { notificationsParamDef } from '@/server/rest/notifications-list.js';
import { iPageLikesParamDef, iPagesParamDef } from '@/server/rest/pages.js';
import { registryGetParamDef, registryScopeParamDef, registryScopesWithDomainParamDef, registrySetParamDef } from '@/server/rest/registry.js';
import { webhooksCreateParamDef, webhooksDeleteParamDef, webhooksListParamDef, webhooksShowParamDef, webhooksTestParamDef, webhooksUpdateParamDef } from '@/server/rest/webhooks.js';
import { z } from 'zod';
import { MINUTE, HOUR, DAY } from '@/const.js';

export const endpointMetas = {
	'i': {
		meta: {
			tags: ['account'],

			requireCredential: true,
			kind: "read:account",

			res: {
				type: 'object',
				optional: false, nullable: false,
				ref: 'MeDetailed',
			},

			errors: {
				userIsDeleted: {
					message: 'User is deleted.',
					code: 'USER_IS_DELETED',
					id: 'e5b3b9f0-2b8f-4b9f-9c1f-8c5c1b2e1b1a',
					kind: 'permission',
				},
			},
		} as const,
		paramDef: z.object({}),
	},
	'i/2fa/done': {
		meta: {
			requireCredential: true,

			secure: true,

			res: {
				type: 'object',
				properties: {
					backupCodes: {
						type: 'array',
						optional: false,
						items: {
							type: 'string',
						},
					},
				},
			},
		} as const,
		paramDef: i2faDoneParamDef,
	},
	'i/2fa/key-done': {
		meta: {
			requireCredential: true,

			secure: true,

			errors: {
				incorrectPassword: {
					message: 'Incorrect password.',
					code: 'INCORRECT_PASSWORD',
					id: '0d7ec6d2-e652-443e-a7bf-9ee9a0cd77b0',
				},

				twoFactorNotEnabled: {
					message: '2fa not enabled.',
					code: 'TWO_FACTOR_NOT_ENABLED',
					id: '798d6847-b1ed-4f9c-b1f9-163c42655995',
				},
			},

			res: {
				type: 'object',
				nullable: false,
				optional: false,
				properties: {
					id: { type: 'string' },
					name: { type: 'string' },
				},
			},
		} as const,
		paramDef: i2faKeyDoneParamDef,
	},
	'i/2fa/password-less': {
		meta: {
			requireCredential: true,

			secure: true,

			errors: {
				noKey: {
					message: 'No security key.',
					code: 'NO_SECURITY_KEY',
					id: 'f9c54d7f-d4c2-4d3c-9a8g-a70daac86512',
				},
			},
		} as const,
		paramDef: i2faPasswordLessParamDef,
	},
	'i/2fa/register': {
		meta: {
			requireCredential: true,

			secure: true,

			errors: {
				incorrectPassword: {
					message: 'Incorrect password.',
					code: 'INCORRECT_PASSWORD',
					id: '78d6c839-20c9-4c66-b90a-fc0542168b48',
				},
			},

			res: {
				type: 'object',
				nullable: false,
				optional: false,
				properties: {
					qr: { type: 'string' },
					url: { type: 'string' },
					secret: { type: 'string' },
					label: { type: 'string' },
					issuer: { type: 'string' },
				},
			},
		} as const,
		paramDef: i2faRegisterParamDef,
	},
	'i/2fa/register-key': {
		meta: {
			requireCredential: true,

			secure: true,

			errors: {
				userNotFound: {
					message: 'User not found.',
					code: 'USER_NOT_FOUND',
					id: '652f899f-66d4-490e-993e-6606c8ec04c3',
				},

				incorrectPassword: {
					message: 'Incorrect password.',
					code: 'INCORRECT_PASSWORD',
					id: '38769596-efe2-4faf-9bec-abbb3f2cd9ba',
				},

				twoFactorNotEnabled: {
					message: '2fa not enabled.',
					code: 'TWO_FACTOR_NOT_ENABLED',
					id: 'bf32b864-449b-47b8-974e-f9a5468546f1',
				},
			},

			res: {
				type: 'object',
			},
		} as const,
		paramDef: i2faRegisterKeyParamDef,
	},
	'i/2fa/remove-key': {
		meta: {
			requireCredential: true,

			secure: true,

			errors: {
				incorrectPassword: {
					message: 'Incorrect password.',
					code: 'INCORRECT_PASSWORD',
					id: '141c598d-a825-44c8-9173-cfb9d92be493',
				},
			},
		} as const,
		paramDef: i2faRemoveKeyParamDef,
	},
	'i/2fa/unregister': {
		meta: {
			requireCredential: true,

			secure: true,

			errors: {
				incorrectPassword: {
					message: 'Incorrect password.',
					code: 'INCORRECT_PASSWORD',
					id: '7add0395-9901-4098-82f9-4f67af65f775',
				},
			},
		} as const,
		paramDef: i2faUnregisterParamDef,
	},
	'i/2fa/update-key': {
		meta: {
			requireCredential: true,

			secure: true,

			errors: {
				noSuchKey: {
					message: 'No such key.',
					code: 'NO_SUCH_KEY',
					id: 'f9c5467f-d492-4d3c-9a8g-a70dacc86512',
				},

				accessDenied: {
					message: 'You do not have edit privilege of this key.',
					code: 'ACCESS_DENIED',
					id: '1fb7cb09-d46a-4fff-b8df-057708cce513',
				},
			},
		} as const,
		paramDef: i2faUpdateKeyParamDef,
	},
	'i/apps': {
		meta: {
			requireCredential: true,

			secure: true,

			res: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						id: {
							type: 'string',
							optional: false,
							format: 'misskey:id',
						},
						name: {
							type: 'string',
							optional: true,
						},
						createdAt: {
							type: 'string',
							optional: false,
							format: 'date-time',
						},
						lastUsedAt: {
							type: 'string',
							optional: true,
							format: 'date-time',
						},
						permission: {
							type: 'array',
							optional: false,
							uniqueItems: true,
							items: {
								type: 'string',
							},
						},
						iconUrl: {
							type: 'string',
							optional: true, nullable: true,
						},
						description: {
							type: 'string',
							optional: true, nullable: true,
						},
					},
				},
			},
		} as const,
		paramDef: iAppsParamDef,
	},
	'i/authorized-apps': {
		meta: {
			requireCredential: true,

			secure: true,

			res: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						id: {
							type: 'string',
							format: 'misskey:id',
							optional: false,
						},
						name: {
							type: 'string',
							optional: false,
						},
						callbackUrl: {
							type: 'string',
							optional: false, nullable: true,
						},
						permission: {
							type: 'array',
							optional: false,
							uniqueItems: true,
							items: {
								type: 'string',
							},
						},
						isAuthorized: {
							type: 'boolean',
							optional: true,
						},
					},
				},
			},
		} as const,
		paramDef: iAuthorizedAppsParamDef,
	},
	'i/change-password': {
		meta: {
			requireCredential: true,

			secure: true,
		} as const,
		paramDef: changePasswordParamDef,
	},
	'i/claim-achievement': {
		meta: {
			requireCredential: true,
			prohibitMoved: true,
			kind: 'write:account',
		} as const,
		paramDef: claimAchievementParamDef,
	},
	'i/delete-account': {
		meta: {
			requireCredential: true,

			secure: true,
		} as const,
		paramDef: deleteAccountParamDef,
	},
	'i/export-antennas': {
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
	'i/export-blocking': {
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
	'i/export-clips': {
		meta: {
			secure: true,
			requireCredential: true,
			limit: {
				duration: DAY,
				max: 1,
			},
		} as const,
		paramDef: z.object({}),
	},
	'i/export-favorites': {
		meta: {
			secure: true,
			requireCredential: true,
			limit: {
				duration: DAY,
				max: 1,
			},
		} as const,
		paramDef: z.object({}),
	},
	'i/export-following': {
		meta: {
			secure: true,
			requireCredential: true,
			limit: {
				duration: HOUR,
				max: 1,
			},
		} as const,
		paramDef: exportFollowingParamDef,
	},
	'i/export-mute': {
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
	'i/export-notes': {
		meta: {
			secure: true,
			requireCredential: true,
			limit: {
				duration: DAY,
				max: 1,
			},
		} as const,
		paramDef: z.object({}),
	},
	'i/export-user-lists': {
		meta: {
			secure: true,
			requireCredential: true,
			limit: {
				duration: MINUTE,
				max: 1,
			},
		} as const,
		paramDef: z.object({}),
	},
	'i/favorites': {
		meta: {
			tags: ['account', 'notes', 'favorites'],

			requireCredential: true,

			kind: 'read:favorites',

			res: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					ref: 'NoteFavorite',
				},
			},
		} as const,
		paramDef: iFavoritesParamDef,
	},
	'i/gallery/likes': {
		meta: {
			tags: ['account', 'gallery'],

			requireCredential: true,

			kind: 'read:gallery-likes',

			res: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					properties: {
						id: {
							type: 'string',
							optional: false, nullable: false,
							format: 'id',
						},
						post: {
							type: 'object',
							optional: false, nullable: false,
							ref: 'GalleryPost',
						},
					},
				},
			},
		} as const,
		paramDef: iGalleryLikesParamDef,
	},
	'i/gallery/posts': {
		meta: {
			tags: ['account', 'gallery'],

			requireCredential: true,

			kind: 'read:gallery',

			res: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					ref: 'GalleryPost',
				},
			},
		} as const,
		paramDef: iGalleryPostsParamDef,
	},
	'i/import-antennas': {
		meta: {
			secure: true,
			requireCredential: true,
			requiredRolePolicy: 'canImportAntennas',
			prohibitMoved: true,

			limit: {
				duration: HOUR,
				max: 1,
			},
			errors: {
				noSuchFile: {
					message: 'No such file.',
					code: 'NO_SUCH_FILE',
					id: '3b71d086-c3fa-431c-b01d-ded65a777172',
				},
				noSuchUser: {
					message: 'No such user.',
					code: 'NO_SUCH_USER',
					id: 'e842c379-8ac7-4cf7-b07a-4d4de7e4671c',
				},
				emptyFile: {
					message: 'That file is empty.',
					code: 'EMPTY_FILE',
					id: '7f60115d-8d93-4b0f-bd0e-3815dcbb389f',
				},
				tooManyAntennas: {
					message: 'You cannot create antenna any more.',
					code: 'TOO_MANY_ANTENNAS',
					id: '600917d4-a4cb-4cc5-8ba8-7ac8ea3c7779',
				},
			},
		} as const,
		paramDef: importAntennasParamDef,
	},
	'i/import-blocking': {
		meta: {
			secure: true,
			requireCredential: true,
			requiredRolePolicy: 'canImportBlocking',
			prohibitMoved: true,

			limit: {
				duration: HOUR,
				max: 1,
			},

			errors: {
				noSuchFile: {
					message: 'No such file.',
					code: 'NO_SUCH_FILE',
					id: 'ebb53e5f-6574-9c0c-0b92-7ca6def56d7e',
				},

				unexpectedFileType: {
					message: 'We need csv file.',
					code: 'UNEXPECTED_FILE_TYPE',
					id: 'b6fab7d6-d945-d67c-dfdb-32da1cd12cfe',
				},

				tooBigFile: {
					message: 'That file is too big.',
					code: 'TOO_BIG_FILE',
					id: 'b7fbf0b1-aeef-3b21-29ef-fadd4cb72ccf',
				},

				emptyFile: {
					message: 'That file is empty.',
					code: 'EMPTY_FILE',
					id: '6f3a4dcc-f060-a707-4950-806fbdbe60d6',
				},
			},
		} as const,
		paramDef: importBlockingParamDef,
	},
	'i/import-following': {
		meta: {
			secure: true,
			requireCredential: true,
			requiredRolePolicy: 'canImportFollowing',
			prohibitMoved: true,
			limit: {
				duration: HOUR,
				max: 1,
			},

			errors: {
				noSuchFile: {
					message: 'No such file.',
					code: 'NO_SUCH_FILE',
					id: 'b98644cf-a5ac-4277-a502-0b8054a709a3',
				},

				unexpectedFileType: {
					message: 'We need csv file.',
					code: 'UNEXPECTED_FILE_TYPE',
					id: '660f3599-bce0-4f95-9dde-311fd841c183',
				},

				tooBigFile: {
					message: 'That file is too big.',
					code: 'TOO_BIG_FILE',
					id: 'dee9d4ed-ad07-43ed-8b34-b2856398bc60',
				},

				emptyFile: {
					message: 'That file is empty.',
					code: 'EMPTY_FILE',
					id: '31a1b42c-06f7-42ae-8a38-a661c5c9f691',
				},
			},
		} as const,
		paramDef: importFollowingParamDef,
	},
	'i/import-muting': {
		meta: {
			secure: true,
			requireCredential: true,
			requiredRolePolicy: 'canImportMuting',
			prohibitMoved: true,

			limit: {
				duration: HOUR,
				max: 1,
			},

			errors: {
				noSuchFile: {
					message: 'No such file.',
					code: 'NO_SUCH_FILE',
					id: 'e674141e-bd2a-ba85-e616-aefb187c9c2a',
				},

				unexpectedFileType: {
					message: 'We need csv file.',
					code: 'UNEXPECTED_FILE_TYPE',
					id: '568c6e42-c86c-ba09-c004-517f83f9f1a8',
				},

				tooBigFile: {
					message: 'That file is too big.',
					code: 'TOO_BIG_FILE',
					id: '9b4ada6d-d7f7-0472-0713-4f558bd1ec9c',
				},

				emptyFile: {
					message: 'That file is empty.',
					code: 'EMPTY_FILE',
					id: 'd2f12af1-e7b4-feac-86a3-519548f2728e',
				},
			},
		} as const,
		paramDef: importMutingParamDef,
	},
	'i/import-user-lists': {
		meta: {
			secure: true,
			requireCredential: true,
			requiredRolePolicy: 'canImportUserLists',
			prohibitMoved: true,
			limit: {
				duration: HOUR,
				max: 1,
			},

			errors: {
				noSuchFile: {
					message: 'No such file.',
					code: 'NO_SUCH_FILE',
					id: 'ea9cc34f-c415-4bc6-a6fe-28ac40357049',
				},

				unexpectedFileType: {
					message: 'We need csv file.',
					code: 'UNEXPECTED_FILE_TYPE',
					id: 'a3c9edda-dd9b-4596-be6a-150ef813745c',
				},

				tooBigFile: {
					message: 'That file is too big.',
					code: 'TOO_BIG_FILE',
					id: 'ae6e7a22-971b-4b52-b2be-fc0b9b121fe9',
				},

				emptyFile: {
					message: 'That file is empty.',
					code: 'EMPTY_FILE',
					id: '99efe367-ce6e-4d44-93f8-5fae7b040356',
				},
			},
		} as const,
		paramDef: importUserListsParamDef,
	},
	'i/move': {
		meta: {
			tags: ['users'],

			secure: true,
			requireCredential: true,
			prohibitMoved: true,
			limit: {
				duration: DAY,
				max: 5,
			},

			errors: {
				destinationAccountForbids: {
					message:
						'Destination account doesn\'t have proper \'Known As\' alias, or has already moved.',
					code: 'DESTINATION_ACCOUNT_FORBIDS',
					id: 'b5c90186-4ab0-49c8-9bba-a1f766282ba4',
				},
				rootForbidden: {
					message: 'The root can\'t migrate.',
					code: 'NOT_ROOT_FORBIDDEN',
					id: '4362e8dc-731f-4ad8-a694-be2a88922a24',
				},
				noSuchUser: {
					message: 'No such user.',
					code: 'NO_SUCH_USER',
					id: 'fcd2eef9-a9b2-4c4f-8624-038099e90aa5',
				},
				uriNull: {
					message: 'User ActivityPup URI is null.',
					code: 'URI_NULL',
					id: 'bf326f31-d430-4f97-9933-5d61e4d48a23',
				},
				localUriNull: {
					message: 'Local User ActivityPup URI is null.',
					code: 'URI_NULL',
					id: '95ba11b9-90e8-43a5-ba16-7acc1ab32e71',
				},
				alreadyMoved: {
					message: 'Account was already moved to another account.',
					code: 'ALREADY_MOVED',
					id: 'b234a14e-9ebe-4581-8000-074b3c215962',
				},
			},

			res: {
				type: 'object',
			},
		} as const,
		paramDef: iMoveParamDef,
	},
	'i/notifications': {
		meta: {
			tags: ['account', 'notifications'],

			requireCredential: true,

			limit: {
				duration: 30000,
				max: 30,
			},

			kind: 'read:notifications',

			res: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					ref: 'Notification',
				},
			},
		} as const,
		paramDef: notificationsParamDef,
	},
	'i/notifications-grouped': {
		meta: {
			tags: ['account', 'notifications'],

			requireCredential: true,

			limit: {
				duration: 30000,
				max: 30,
			},

			kind: 'read:notifications',

			res: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					ref: 'Notification',
				},
			},
		} as const,
		paramDef: notificationsParamDef,
	},
	'i/page-likes': {
		meta: {
			tags: ['account', 'pages'],

			requireCredential: true,

			kind: 'read:page-likes',

			res: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					properties: {
						id: {
							type: 'string',
							optional: false, nullable: false,
							format: 'id',
						},
						page: {
							type: 'object',
							optional: false, nullable: false,
							ref: 'Page',
						},
					},
				},
			},
		} as const,
		paramDef: iPageLikesParamDef,
	},
	'i/pages': {
		meta: {
			tags: ['account', 'pages'],

			requireCredential: true,

			kind: 'read:pages',

			res: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					ref: 'Page',
				},
			},
		} as const,
		paramDef: iPagesParamDef,
	},
	'i/pin': {
		meta: {
			tags: ['account', 'notes'],

			requireCredential: true,
			prohibitMoved: true,

			kind: 'write:account',

			errors: {
				noSuchNote: {
					message: 'No such note.',
					code: 'NO_SUCH_NOTE',
					id: '56734f8b-3928-431e-bf80-6ff87df40cb3',
				},

				pinLimitExceeded: {
					message: 'You can not pin notes any more.',
					code: 'PIN_LIMIT_EXCEEDED',
					id: '72dab508-c64d-498f-8740-a8eec1ba385a',
				},

				alreadyPinned: {
					message: 'That note has already been pinned.',
					code: 'ALREADY_PINNED',
					id: '8b18c2b7-68fe-4edb-9892-c0cbaeb6c913',
				},
			},

			res: {
				type: 'object',
				optional: false, nullable: false,
				ref: 'MeDetailed',
			},
		} as const,
		paramDef: iPinOrUnpinParamDef,
	},
	'i/read-announcement': {
		meta: {
			tags: ['account'],

			requireCredential: true,

			kind: 'write:account',

			errors: {
			},
		} as const,
		paramDef: readAnnouncementParamDef,
	},
	'i/regenerate-token': {
		meta: {
			requireCredential: true,

			secure: true,
		} as const,
		paramDef: regenerateTokenParamDef,
	},
	'i/registry/get': {
		meta: {
			requireCredential: true,
			kind: 'read:account',

			errors: {
				noSuchKey: {
					message: 'No such key.',
					code: 'NO_SUCH_KEY',
					id: 'ac3ed68a-62f0-422b-a7bc-d5e09e8f6a6a',
				},
			},

			res: {
				type: 'object',
			}
		} as const,
		paramDef: registryGetParamDef,
	},
	'i/registry/get-all': {
		meta: {
			requireCredential: true,
			kind: 'read:account',

			res: {
				type: 'object',
			},
		} as const,
		paramDef: registryScopeParamDef,
	},
	'i/registry/get-detail': {
		meta: {
			requireCredential: true,
			kind: 'read:account',

			errors: {
				noSuchKey: {
					message: 'No such key.',
					code: 'NO_SUCH_KEY',
					id: '97a1e8e7-c0f7-47d2-957a-92e61256e01a',
				},
			},

			res: {
				type: 'object',
				properties: {
					updatedAt: {
						type: 'string',
						optional: false,
					},
					value: {
						optional: false,
					},
				},
			},
		} as const,
		paramDef: registryGetParamDef,
	},
	'i/registry/keys': {
		meta: {
			requireCredential: true,
			kind: 'read:account',

			res: {
				type: 'array',
				items: {
					type: 'string',
				},
			},
		} as const,
		paramDef: registryScopeParamDef,
	},
	'i/registry/keys-with-type': {
		meta: {
			requireCredential: true,
			kind: 'read:account',

			res: {
				type: 'object',
				additionalProperties: {
					type: 'string',
				},
			},
		} as const,
		paramDef: registryScopeParamDef,
	},
	'i/registry/remove': {
		meta: {
			requireCredential: true,
			kind: 'write:account',

			errors: {
				noSuchKey: {
					message: 'No such key.',
					code: 'NO_SUCH_KEY',
					id: '1fac4e8a-a6cd-4e39-a4a5-3a7e11f1b019',
				},
			},
		} as const,
		paramDef: registryGetParamDef,
	},
	'i/registry/scopes-with-domain': {
		meta: {
			requireCredential: true,
			secure: true,

			res: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						scopes: {
							type: 'array',
							items: {
								type: 'array',
								items: {
									type: 'string',
								}
							}
						},
						domain: {
							type: 'string',
							nullable: true,
						},
					},
				},
			}
		} as const,
		paramDef: registryScopesWithDomainParamDef,
	},
	'i/registry/set': {
		meta: {
			requireCredential: true,
			kind: 'write:account',
		} as const,
		paramDef: registrySetParamDef,
	},
	'i/revoke-token': {
		meta: {
			requireCredential: true,

			secure: true,
		} as const,
		paramDef: iRevokeTokenParamDef,
	},
	'i/signin-history': {
		meta: {
			requireCredential: true,
			secure: true,

			res: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					ref: 'Signin',
				},
			},
		} as const,
		paramDef: iSigninHistoryParamDef,
	},
	'i/unpin': {
		meta: {
			tags: ['account', 'notes'],

			requireCredential: true,

			kind: 'write:account',

			errors: {
				noSuchNote: {
					message: 'No such note.',
					code: 'NO_SUCH_NOTE',
					id: '454170ce-9d63-4a43-9da1-ea10afe81e21',
				},
			},

			res: {
				type: 'object',
				optional: false, nullable: false,
				ref: 'MeDetailed',
			},
		} as const,
		paramDef: iPinOrUnpinParamDef,
	},
	'i/update': {
		meta: {
			tags: ['account'],

			requireCredential: true,

			kind: 'write:account',

			limit: {
				duration: HOUR,
				max: 20,
			},

			errors: {
				noSuchAvatar: {
					message: 'No such avatar file.',
					code: 'NO_SUCH_AVATAR',
					id: '539f3a45-f215-4f81-a9a8-31293640207f',
				},

				noSuchBanner: {
					message: 'No such banner file.',
					code: 'NO_SUCH_BANNER',
					id: '0d8f5629-f210-41c2-9433-735831a58595',
				},

				avatarNotAnImage: {
					message: 'The file specified as an avatar is not an image.',
					code: 'AVATAR_NOT_AN_IMAGE',
					id: 'f419f9f8-2f4d-46b1-9fb4-49d3a2fd7191',
				},

				bannerNotAnImage: {
					message: 'The file specified as a banner is not an image.',
					code: 'BANNER_NOT_AN_IMAGE',
					id: '75aedb19-2afd-4e6d-87fc-67941256fa60',
				},

				noSuchPage: {
					message: 'No such page.',
					code: 'NO_SUCH_PAGE',
					id: '8e01b590-7eb9-431b-a239-860e086c408e',
				},

				invalidRegexp: {
					message: 'Invalid Regular Expression.',
					code: 'INVALID_REGEXP',
					id: '0d786918-10df-41cd-8f33-8dec7d9a89a5',
				},

				tooManyMutedWords: {
					message: 'Too many muted words.',
					code: 'TOO_MANY_MUTED_WORDS',
					id: '010665b1-a211-42d2-bc64-8f6609d79785',
				},

				noSuchUser: {
					message: 'No such user.',
					code: 'NO_SUCH_USER',
					id: 'fcd2eef9-a9b2-4c4f-8624-038099e90aa5',
				},

				uriNull: {
					message: 'User ActivityPup URI is null.',
					code: 'URI_NULL',
					id: 'bf326f31-d430-4f97-9933-5d61e4d48a23',
				},

				forbiddenToSetYourself: {
					message: 'You can\'t set yourself as your own alias.',
					code: 'FORBIDDEN_TO_SET_YOURSELF',
					id: '25c90186-4ab0-49c8-9bba-a1fa6c202ba4',
				},

				restrictedByRole: {
					message: 'This feature is restricted by your role.',
					code: 'RESTRICTED_BY_ROLE',
					id: '8feff0ba-5ab5-585b-31f4-4df816663fad',
				},

				nameContainsProhibitedWords: {
					message: 'Your new name contains prohibited words.',
					code: 'YOUR_NAME_CONTAINS_PROHIBITED_WORDS',
					id: '0b3f9f6a-2f4d-4b1f-9fb4-49d3a2fd7191',
					httpStatusCode: 422,
				},
			},

			res: {
				type: 'object',
				optional: false, nullable: false,
				ref: 'MeDetailed',
			},
		} as const,
		paramDef: iUpdateParamDef,
	},
	'i/update-email': {
		meta: {
			requireCredential: true,

			secure: true,

			limit: {
				duration: HOUR,
				max: 3,
			},

			errors: {
				incorrectPassword: {
					message: 'Incorrect password.',
					code: 'INCORRECT_PASSWORD',
					id: 'e54c1d7e-e7d6-4103-86b6-0a95069b4ad3',
				},

				unavailable: {
					message: 'Unavailable email address.',
					code: 'UNAVAILABLE',
					id: 'a2defefb-f220-8849-0af6-17f816099323',
				},

				emailRequired: {
					message: 'Email address is required.',
					code: 'EMAIL_REQUIRED',
					id: '324c7a88-59f2-492f-903f-89134f93e47e',
				},
			},

			res: {
				type: 'object',
				ref: 'MeDetailed',
			},
		} as const,
		paramDef: updateEmailParamDef,
	},
	'i/webhooks/create': {
		meta: {
			tags: ['webhooks'],

			requireCredential: true,

			kind: 'write:account',

			errors: {
				tooManyWebhooks: {
					message: 'You cannot create webhook any more.',
					code: 'TOO_MANY_WEBHOOKS',
					id: '87a9bb19-111e-4e37-81d3-a3e7426453b0',
				},
			},

			res: {
				type: 'object',
				properties: {
					id: {
						type: 'string',
						format: 'misskey:id',
					},
					userId: {
						type: 'string',
						format: 'misskey:id',
					},
					name: { type: 'string' },
					on: {
						type: 'array',
						items: {
							type: 'string',
							enum: webhookEventTypes,
						},
					},
					url: { type: 'string' },
					secret: { type: 'string' },
					active: { type: 'boolean' },
					latestSentAt: { type: 'string', format: 'date-time', nullable: true },
					latestStatus: { type: 'integer', nullable: true },
				},
			},
		} as const,
		paramDef: webhooksCreateParamDef,
	},
	'i/webhooks/delete': {
		meta: {
			tags: ['webhooks'],

			requireCredential: true,

			kind: 'write:account',

			errors: {
				noSuchWebhook: {
					message: 'No such webhook.',
					code: 'NO_SUCH_WEBHOOK',
					id: 'bae73e5a-5522-4965-ae19-3a8688e71d82',
				},
			},
		} as const,
		paramDef: webhooksDeleteParamDef,
	},
	'i/webhooks/list': {
		meta: {
			tags: ['webhooks', 'account'],

			requireCredential: true,

			kind: 'read:account',

			res: {
				type: 'array',
				items: {
					type: 'object',
					ref: 'UserWebhook',
				},
			},
		} as const,
		paramDef: webhooksListParamDef,
	},
	'i/webhooks/show': {
		meta: {
			tags: ['webhooks'],

			requireCredential: true,

			kind: 'read:account',

			errors: {
				noSuchWebhook: {
					message: 'No such webhook.',
					code: 'NO_SUCH_WEBHOOK',
					id: '50f614d9-3047-4f7e-90d8-ad6b2d5fb098',
				},
			},

			res: {
				type: 'object',
				ref: 'UserWebhook',
			},
		} as const,
		paramDef: webhooksShowParamDef,
	},
	'i/webhooks/test': {
		meta: {
			tags: ['webhooks'],

			requireCredential: true,
			secure: true,
			kind: 'read:account',

			limit: {
				duration: 15 * MINUTE,
				max: 60,
			},

			errors: {
				noSuchWebhook: {
					message: 'No such webhook.',
					code: 'NO_SUCH_WEBHOOK',
					id: '0c52149c-e913-18f8-5dc7-74870bfe0cf9',
				},
			},
		} as const,
		paramDef: webhooksTestParamDef,
	},
	'i/webhooks/update': {
		meta: {
			tags: ['webhooks'],

			requireCredential: true,

			kind: 'write:account',

			errors: {
				noSuchWebhook: {
					message: 'No such webhook.',
					code: 'NO_SUCH_WEBHOOK',
					id: 'fb0fea69-da18-45b1-828d-bd4fd1612518',
				},
			},

		} as const,
		paramDef: webhooksUpdateParamDef,
	},
} as const;
