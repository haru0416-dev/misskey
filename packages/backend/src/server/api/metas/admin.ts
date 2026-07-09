/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { supportedCaptchaProviders } from '@/core/CaptchaLogic.js';
import { notificationRecieveConfig } from '@/models/json-schema/user.js';
import { adminUpdateMetaJsonSchema } from '@/server/rest/AdminUpdateMetaLogic.js';
import { adminAbuseUserReportsParamDef, adminForwardAbuseUserReportParamDef, adminResolveAbuseUserReportParamDef, adminUpdateAbuseUserReportParamDef } from '@/server/rest/admin-abuse-reports.js';
import { adminAccountCreateParamDef, adminAccountDeleteParamDef, adminAccountsFindByEmailParamDef, adminUpdateProxyAccountParamDef } from '@/server/rest/admin-accounts.js';
import { adminAdCreateParamDef, adminAdDeleteParamDef, adminAdListParamDef, adminAdUpdateParamDef } from '@/server/rest/admin-ad.js';
import { adminAnnouncementsCreateParamDef, adminAnnouncementsDeleteParamDef, adminAnnouncementsListParamDef, adminAnnouncementsUpdateParamDef } from '@/server/rest/admin-announcements.js';
import { adminAvatarDecorationsCreateParamDef, adminAvatarDecorationsDeleteParamDef, adminAvatarDecorationsListParamDef, adminAvatarDecorationsUpdateParamDef } from '@/server/rest/admin-avatar-decorations.js';
import { adminDriveFilesParamDef, adminDriveShowFileDocsParamDef, adminDriveUserParamDef } from '@/server/rest/admin-drive.js';
import { adminSendEmailParamDef } from '@/server/rest/admin-email.js';
import { adminRelaysListParamDef, adminRelaysWriteParamDef } from '@/server/rest/admin-relays.js';
import { adminServerInfoParamDef } from '@/server/rest/admin-server-info.js';
import { adminStatsParamDef } from '@/server/rest/admin-stats.js';
import { adminGetUserIpsParamDef } from '@/server/rest/admin-user-ips.js';
import { adminUpdateUserNoteParamDef, adminUserMaintenanceParamDef } from '@/server/rest/admin-user-maintenance.js';
import { adminUserSuspensionParamDef } from '@/server/rest/admin-user-suspension.js';
import { adminShowUserParamDef, adminShowUsersParamDef } from '@/server/rest/admin-users.js';
import { captchaCurrentParamDef, captchaSaveParamDef } from '@/server/rest/captcha.js';
import { adminFederationHostParamDef, adminFederationUpdateInstanceParamDef } from '@/server/rest/federation.js';
import { adminInviteCreateParamDef, adminInviteListParamDef } from '@/server/rest/invite.js';
import { adminShowModerationLogsParamDef } from '@/server/rest/moderation-log.js';
import { adminPromoCreateParamDef } from '@/server/rest/promo.js';
import { URL } from 'node:url';
import { z } from 'zod';
import * as os from 'node:os';

export const endpointMetas = {
	'admin/abuse-user-reports': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'read:admin:abuse-user-reports',

			res: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					properties: {
						id: {
							type: 'string',
							nullable: false, optional: false,
							format: 'id',
							example: 'xxxxxxxxxx',
						},
						createdAt: {
							type: 'string',
							nullable: false, optional: false,
							format: 'date-time',
						},
						comment: {
							type: 'string',
							nullable: false, optional: false,
						},
						resolved: {
							type: 'boolean',
							nullable: false, optional: false,
							example: false,
						},
						reporterId: {
							type: 'string',
							nullable: false, optional: false,
							format: 'id',
						},
						targetUserId: {
							type: 'string',
							nullable: false, optional: false,
							format: 'id',
						},
						assigneeId: {
							type: 'string',
							nullable: true, optional: false,
							format: 'id',
						},
						reporter: {
							type: 'object',
							nullable: false, optional: false,
							ref: 'UserDetailedNotMe',
						},
						targetUser: {
							type: 'object',
							nullable: false, optional: false,
							ref: 'UserDetailedNotMe',
						},
						assignee: {
							type: 'object',
							nullable: true, optional: false,
							ref: 'UserDetailedNotMe',
						},
						forwarded: {
							type: 'boolean',
							nullable: false, optional: false,
						},
						resolvedAs: {
							type: 'string',
							nullable: true, optional: false,
							enum: ['accept', 'reject', null],
						},
						moderationNote: {
							type: 'string',
							nullable: false, optional: false,
						},
					},
				},
			},
		} as const,
		paramDef: adminAbuseUserReportsParamDef,
	},
	'admin/accounts/create': {
		meta: {
			tags: ['admin'],

			errors: {
				accessDenied: {
					message: 'Access denied.',
					code: 'ACCESS_DENIED',
					id: '1fb7cb09-d46a-4fff-b8df-057708cce513',
				},

				wrongInitialPassword: {
					message: 'Initial password is incorrect.',
					code: 'INCORRECT_INITIAL_PASSWORD',
					id: '97147c55-1ae1-4f6f-91d6-e1c3e0e76d62',
				},
			},

			res: {
				type: 'object',
				optional: false, nullable: false,
				allOf: [
					{
						type: 'object',
						ref: 'MeDetailed',
					},
					{
						type: 'object',
						optional: false, nullable: false,
						properties: {
							token: {
								type: 'string',
								optional: false, nullable: false,
							},
						},
					}
				],
			},
		} as const,
		paramDef: adminAccountCreateParamDef,
	},
	'admin/accounts/delete': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireAdmin: true,
			kind: 'write:admin:account',
		} as const,
		paramDef: adminAccountDeleteParamDef,
	},
	'admin/accounts/find-by-email': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireAdmin: true,
			kind: 'read:admin:account',

			errors: {
				userNotFound: {
					message: 'No such user who has the email address.',
					code: 'USER_NOT_FOUND',
					id: 'cb865949-8af5-4062-a88c-ef55e8786d1d',
				},
			},
			res: {
				type: 'object',
				optional: false, nullable: false,
				ref: 'UserDetailedNotMe',
			},
		} as const,
		paramDef: adminAccountsFindByEmailParamDef,
	},
	'admin/ad/create': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'write:admin:ad',
			res: {
				type: 'object',
				optional: false,
				nullable: false,
				ref: 'Ad',
			},
		} as const,
		paramDef: adminAdCreateParamDef,
	},
	'admin/ad/delete': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'write:admin:ad',

			errors: {
				noSuchAd: {
					message: 'No such ad.',
					code: 'NO_SUCH_AD',
					id: 'ccac9863-3a03-416e-b899-8a64041118b1',
				},
			},
		} as const,
		paramDef: adminAdDeleteParamDef,
	},
	'admin/ad/list': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'read:admin:ad',
			res: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					optional: false,
					nullable: false,
					ref: 'Ad',
				},
			},
		} as const,
		paramDef: adminAdListParamDef,
	},
	'admin/ad/update': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'write:admin:ad',

			errors: {
				noSuchAd: {
					message: 'No such ad.',
					code: 'NO_SUCH_AD',
					id: 'b7aa1727-1354-47bc-a182-3a9c3973d300',
				},
			},
		} as const,
		paramDef: adminAdUpdateParamDef,
	},
	'admin/announcements/create': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'write:admin:announcements',

			res: {
				type: 'object',
				optional: false, nullable: false,
				properties: {
					id: {
						type: 'string',
						optional: false, nullable: false,
						format: 'id',
						example: 'xxxxxxxxxx',
					},
					createdAt: {
						type: 'string',
						optional: false, nullable: false,
						format: 'date-time',
					},
					updatedAt: {
						type: 'string',
						optional: false, nullable: true,
						format: 'date-time',
					},
					title: {
						type: 'string',
						optional: false, nullable: false,
					},
					text: {
						type: 'string',
						optional: false, nullable: false,
					},
					imageUrl: {
						type: 'string',
						optional: false, nullable: true,
					},
				},
			},
		} as const,
		paramDef: adminAnnouncementsCreateParamDef,
	},
	'admin/announcements/delete': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'write:admin:announcements',

			errors: {
				noSuchAnnouncement: {
					message: 'No such announcement.',
					code: 'NO_SUCH_ANNOUNCEMENT',
					id: 'ecad8040-a276-4e85-bda9-015a708d291e',
				},
			},
		} as const,
		paramDef: adminAnnouncementsDeleteParamDef,
	},
	'admin/announcements/list': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'read:admin:announcements',

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
							example: 'xxxxxxxxxx',
						},
						createdAt: {
							type: 'string',
							optional: false, nullable: false,
							format: 'date-time',
						},
						updatedAt: {
							type: 'string',
							optional: false, nullable: true,
							format: 'date-time',
						},
						text: {
							type: 'string',
							optional: false, nullable: false,
						},
						title: {
							type: 'string',
							optional: false, nullable: false,
						},
						icon: {
							type: 'string',
							optional: false, nullable: false,
							enum: ['info', 'warning', 'error', 'success'],
						},
						display: {
							type: 'string',
							optional: false, nullable: false,
							enum: ['normal', 'banner', 'dialog'],
						},
						isActive: {
							type: 'boolean',
							optional: false, nullable: false,
						},
						forExistingUsers: {
							type: 'boolean',
							optional: false, nullable: false,
						},
						silence: {
							type: 'boolean',
							optional: false, nullable: false,
						},
						needConfirmationToRead: {
							type: 'boolean',
							optional: false, nullable: false,
						},
						userId: {
							type: 'string',
							optional: false, nullable: true,
						},
						imageUrl: {
							type: 'string',
							optional: false, nullable: true,
						},
						reads: {
							type: 'number',
							optional: false, nullable: false,
						},
					},
				},
			},
		} as const,
		paramDef: adminAnnouncementsListParamDef,
	},
	'admin/announcements/update': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'write:admin:announcements',

			errors: {
				noSuchAnnouncement: {
					message: 'No such announcement.',
					code: 'NO_SUCH_ANNOUNCEMENT',
					id: 'd3aae5a7-6372-4cb4-b61c-f511ffc2d7cc',
				},
			},
		} as const,
		paramDef: adminAnnouncementsUpdateParamDef,
	},
	'admin/avatar-decorations/create': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requiredRolePolicy: 'canManageAvatarDecorations',
			kind: 'write:admin:avatar-decorations',

			res: {
				type: 'object',
				optional: false, nullable: false,
				properties: {
					id: {
						type: 'string',
						optional: false, nullable: false,
						format: 'id',
					},
					createdAt: {
						type: 'string',
						optional: false, nullable: false,
						format: 'date-time',
					},
					updatedAt: {
						type: 'string',
						optional: false, nullable: true,
						format: 'date-time',
					},
					name: {
						type: 'string',
						optional: false, nullable: false,
					},
					description: {
						type: 'string',
						optional: false, nullable: false,
					},
					url: {
						type: 'string',
						optional: false, nullable: false,
					},
					roleIdsThatCanBeUsedThisDecoration: {
						type: 'array',
						optional: false, nullable: false,
						items: {
							type: 'string',
							optional: false, nullable: false,
							format: 'id',
						},
					},
					category: {
						type: 'string',
						optional: false, nullable: true,
					},
				},
			},
		} as const,
		paramDef: adminAvatarDecorationsCreateParamDef,
	},
	'admin/avatar-decorations/delete': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requiredRolePolicy: 'canManageAvatarDecorations',
			kind: 'write:admin:avatar-decorations',
			errors: {
			},
		} as const,
		paramDef: adminAvatarDecorationsDeleteParamDef,
	},
	'admin/avatar-decorations/list': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requiredRolePolicy: 'canManageAvatarDecorations',
			kind: 'read:admin:avatar-decorations',

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
							example: 'xxxxxxxxxx',
						},
						createdAt: {
							type: 'string',
							optional: false, nullable: false,
							format: 'date-time',
						},
						updatedAt: {
							type: 'string',
							optional: false, nullable: true,
							format: 'date-time',
						},
						name: {
							type: 'string',
							optional: false, nullable: false,
						},
						description: {
							type: 'string',
							optional: false, nullable: false,
						},
						url: {
							type: 'string',
							optional: false, nullable: false,
						},
						roleIdsThatCanBeUsedThisDecoration: {
							type: 'array',
							optional: false, nullable: false,
							items: {
								type: 'string',
								optional: false, nullable: false,
								format: 'id',
							},
						},
						category: {
							type: 'string',
							optional: true, nullable: true,
						},
					},
				},
			},
		} as const,
		paramDef: adminAvatarDecorationsListParamDef,
	},
	'admin/avatar-decorations/update': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requiredRolePolicy: 'canManageAvatarDecorations',
			kind: 'write:admin:avatar-decorations',

			errors: {
			},
		} as const,
		paramDef: adminAvatarDecorationsUpdateParamDef,
	},
	'admin/captcha/current': {
		meta: {
			tags: ['admin', 'captcha'],

			requireCredential: true,
			requireAdmin: true,

			// 実態はmetaの取得であるため
			kind: 'read:admin:meta',

			res: {
				type: 'object',
				properties: {
					provider: {
						type: 'string',
						enum: supportedCaptchaProviders,
					},
					hcaptcha: {
						type: 'object',
						properties: {
							siteKey: { type: 'string', nullable: true },
							secretKey: { type: 'string', nullable: true },
						},
					},
					mcaptcha: {
						type: 'object',
						properties: {
							siteKey: { type: 'string', nullable: true },
							secretKey: { type: 'string', nullable: true },
							instanceUrl: { type: 'string', nullable: true },
						},
					},
					recaptcha: {
						type: 'object',
						properties: {
							siteKey: { type: 'string', nullable: true },
							secretKey: { type: 'string', nullable: true },
						},
					},
					turnstile: {
						type: 'object',
						properties: {
							siteKey: { type: 'string', nullable: true },
							secretKey: { type: 'string', nullable: true },
						},
					},
				},
			},
		} as const,
		paramDef: captchaCurrentParamDef,
	},
	'admin/captcha/save': {
		meta: {
			tags: ['admin', 'captcha'],

			requireCredential: true,
			requireAdmin: true,

			// 実態はmetaの更新であるため
			kind: 'write:admin:meta',

			errors: {
				invalidProvider: {
					message: 'Invalid provider.',
					code: 'INVALID_PROVIDER',
					id: '14bf7ae1-80cc-4363-acb2-4fd61d086af0',
					httpStatusCode: 400,
				},
				invalidParameters: {
					message: 'Invalid parameters.',
					code: 'INVALID_PARAMETERS',
					id: '26654194-410e-44e2-b42e-460ff6f92476',
					httpStatusCode: 400,
				},
				noResponseProvided: {
					message: 'No response provided.',
					code: 'NO_RESPONSE_PROVIDED',
					id: '40acbba8-0937-41fb-bb3f-474514d40afe',
					httpStatusCode: 400,
				},
				requestFailed: {
					message: 'Request failed.',
					code: 'REQUEST_FAILED',
					id: '0f4fe2f1-2c15-4d6e-b714-efbfcde231cd',
					httpStatusCode: 500,
				},
				verificationFailed: {
					message: 'Verification failed.',
					code: 'VERIFICATION_FAILED',
					id: 'c41c067f-24f3-4150-84b2-b5a3ae8c2214',
					httpStatusCode: 400,
				},
				unknown: {
					message: 'unknown',
					code: 'UNKNOWN',
					id: 'f868d509-e257-42a9-99c1-42614b031a97',
					httpStatusCode: 500,
				},
			},
		} as const,
		paramDef: captchaSaveParamDef,
	},
	'admin/delete-account': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireAdmin: true,
			kind: 'write:admin:delete-account',
		} as const,
		paramDef: adminAccountDeleteParamDef,
	},
	'admin/delete-all-files-of-a-user': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireAdmin: true,
			kind: 'write:admin:delete-all-files-of-a-user',
		} as const,
		paramDef: adminDriveUserParamDef,
	},
	'admin/drive/clean-remote-files': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'write:admin:drive',
		} as const,
		paramDef: z.object({}),
	},
	'admin/drive/cleanup': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'write:admin:drive',
		} as const,
		paramDef: z.object({}),
	},
	'admin/drive/files': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'read:admin:drive',

			res: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					ref: 'DriveFile',
				},
			},
		} as const,
		paramDef: adminDriveFilesParamDef,
	},
	'admin/drive/show-file': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'read:admin:drive',

			errors: {
				noSuchFile: {
					message: 'No such file.',
					code: 'NO_SUCH_FILE',
					id: 'caf3ca38-c6e5-472e-a30c-b05377dcc240',
				},
			},

			res: {
				type: 'object',
				optional: false, nullable: false,
				properties: {
					id: {
						type: 'string',
						optional: false, nullable: false,
						format: 'id',
						example: 'xxxxxxxxxx',
					},
					createdAt: {
						type: 'string',
						optional: false, nullable: false,
						format: 'date-time',
					},
					userId: {
						type: 'string',
						optional: false, nullable: true,
						format: 'id',
						example: 'xxxxxxxxxx',
					},
					userHost: {
						type: 'string',
						optional: false, nullable: true,
						description: 'The local host is represented with `null`.',
					},
					md5: {
						type: 'string',
						optional: false, nullable: false,
						format: 'md5',
						example: '15eca7fba0480996e2245f5185bf39f2',
					},
					name: {
						type: 'string',
						optional: false, nullable: false,
						example: '192.jpg',
					},
					type: {
						type: 'string',
						optional: false, nullable: false,
						example: 'image/jpeg',
					},
					size: {
						type: 'number',
						optional: false, nullable: false,
						example: 51469,
					},
					comment: {
						type: 'string',
						optional: false, nullable: true,
					},
					blurhash: {
						type: 'string',
						optional: false, nullable: true,
					},
					properties: {
						type: 'object',
						optional: false, nullable: false,
						properties: {
							width: {
								type: 'number',
								optional: true, nullable: false,
							},
							height: {
								type: 'number',
								optional: true, nullable: false,
							},
							orientation: {
								type: 'number',
								optional: true, nullable: false,
							},
							avgColor: {
								type: 'string',
								optional: true, nullable: false,
							},
						},
					},
					storedInternal: {
						type: 'boolean',
						optional: false, nullable: true,
						example: true,
					},
					url: {
						type: 'string',
						optional: false, nullable: true,
						format: 'url',
					},
					thumbnailUrl: {
						type: 'string',
						optional: false, nullable: true,
						format: 'url',
					},
					webpublicUrl: {
						type: 'string',
						optional: false, nullable: true,
						format: 'url',
					},
					accessKey: {
						type: 'string',
						optional: false, nullable: true,
					},
					thumbnailAccessKey: {
						type: 'string',
						optional: false, nullable: true,
					},
					webpublicAccessKey: {
						type: 'string',
						optional: false, nullable: true,
					},
					uri: {
						type: 'string',
						optional: false, nullable: true,
					},
					src: {
						type: 'string',
						optional: false, nullable: true,
					},
					folderId: {
						type: 'string',
						optional: false, nullable: true,
						format: 'id',
						example: 'xxxxxxxxxx',
					},
					isSensitive: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					isLink: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					maybeSensitive: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					maybePorn: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					requestIp: {
						type: 'string',
						optional: false, nullable: true,
					},
					requestHeaders: {
						type: 'object',
						optional: false, nullable: true,
					},
				},
			},
		} as const,
		paramDef: adminDriveShowFileDocsParamDef,
	},
	'admin/federation/delete-all-files': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'write:admin:federation',
		} as const,
		paramDef: adminFederationHostParamDef,
	},
	'admin/federation/refresh-remote-instance-metadata': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'write:admin:federation',
		} as const,
		paramDef: adminFederationHostParamDef,
	},
	'admin/federation/remove-all-following': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'write:admin:federation',
		} as const,
		paramDef: adminFederationHostParamDef,
	},
	'admin/federation/update-instance': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'write:admin:federation',
		} as const,
		paramDef: adminFederationUpdateInstanceParamDef,
	},
	'admin/forward-abuse-user-report': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'write:admin:resolve-abuse-user-report',

			errors: {
				noSuchAbuseReport: {
					message: 'No such abuse report.',
					code: 'NO_SUCH_ABUSE_REPORT',
					id: '8763e21b-d9bc-40be-acf6-54c1a6986493',
					kind: 'server',
					httpStatusCode: 404,
				},
			},
		} as const,
		paramDef: adminForwardAbuseUserReportParamDef,
	},
	'admin/get-index-stats': {
		meta: {
			requireCredential: true,
			requireAdmin: true,
			kind: 'read:admin:index-stats',

			tags: ['admin'],
			res: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						tablename: { type: 'string' },
						indexname: { type: 'string' },
					},
				},
			},
		} as const,
		paramDef: adminStatsParamDef,
	},
	'admin/get-table-stats': {
		meta: {
			requireCredential: true,
			requireAdmin: true,
			kind: 'read:admin:table-stats',

			tags: ['admin'],

			res: {
				type: 'object',
				optional: false, nullable: false,
				additionalProperties: {
					type: 'object',
					properties: {
						count: {
							type: 'number',
						},
						size: {
							type: 'number',
						},
					},
					required: ['count', 'size'],
				},
				example: {
					migrations: {
						count: 66,
						size: 32768,
					},
				},
			},
		} as const,
		paramDef: adminStatsParamDef,
	},
	'admin/get-user-ips': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireAdmin: true,
			kind: 'read:admin:user-ips',
			res: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					optional: false,
					nullable: false,
					properties: {
						ip: { type: 'string' },
						createdAt: {
							type: 'string',
							optional: false,
							nullable: false,
							format: 'date-time',
						},
					},
				},
			},
		} as const,
		paramDef: adminGetUserIpsParamDef,
	},
	'admin/invite/create': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'write:admin:invite-codes',

			errors: {
				invalidDateTime: {
					message: 'Invalid date-time format',
					code: 'INVALID_DATE_TIME',
					id: 'f1380b15-3760-4c6c-a1db-5c3aaf1cbd49',
				},
			},

			res: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					ref: 'InviteCode',
				},
			},
		} as const,
		paramDef: adminInviteCreateParamDef,
	},
	'admin/invite/list': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'read:admin:invite-codes',

			res: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					ref: 'InviteCode',
				},
			},
		} as const,
		paramDef: adminInviteListParamDef,
	},
	'admin/meta': {
		meta: {
			tags: ['meta'],

			requireCredential: true,
			requireAdmin: true,
			kind: 'read:admin:meta',

			res: {
				type: 'object',
				optional: false, nullable: false,
				properties: {
					cacheRemoteFiles: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					cacheRemoteSensitiveFiles: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					emailRequiredForSignup: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					enableHcaptcha: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					hcaptchaSiteKey: {
						type: 'string',
						optional: false, nullable: true,
					},
					enableMcaptcha: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					mcaptchaSiteKey: {
						type: 'string',
						optional: false, nullable: true,
					},
					mcaptchaInstanceUrl: {
						type: 'string',
						optional: false, nullable: true,
					},
					enableRecaptcha: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					recaptchaSiteKey: {
						type: 'string',
						optional: false, nullable: true,
					},
					enableTurnstile: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					turnstileSiteKey: {
						type: 'string',
						optional: false, nullable: true,
					},
					enableTestcaptcha: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					googleAnalyticsMeasurementId: {
						type: 'string',
						optional: false, nullable: true,
					},
					swPublickey: {
						type: 'string',
						optional: false, nullable: true,
					},
					mascotImageUrl: {
						type: 'string',
						optional: false, nullable: true,
						default: '/assets/ai.png',
					},
					bannerUrl: {
						type: 'string',
						optional: false, nullable: true,
					},
					serverErrorImageUrl: {
						type: 'string',
						optional: false, nullable: true,
					},
					infoImageUrl: {
						type: 'string',
						optional: false, nullable: true,
					},
					notFoundImageUrl: {
						type: 'string',
						optional: false, nullable: true,
					},
					iconUrl: {
						type: 'string',
						optional: false, nullable: true,
					},
					app192IconUrl: {
						type: 'string',
						optional: false, nullable: true,
					},
					app512IconUrl: {
						type: 'string',
						optional: false, nullable: true,
					},
					enableEmail: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					enableServiceWorker: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					translatorAvailable: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					silencedHosts: {
						type: 'array',
						optional: true,
						nullable: false,
						items: {
							type: 'string',
							optional: false,
							nullable: false,
						},
					},
					mediaSilencedHosts: {
						type: 'array',
						optional: false,
						nullable: false,
						items: {
							type: 'string',
							optional: false,
							nullable: false,
						},
					},
					pinnedUsers: {
						type: 'array',
						optional: false, nullable: false,
						items: {
							type: 'string',
						},
					},
					hiddenTags: {
						type: 'array',
						optional: false, nullable: false,
						items: {
							type: 'string',
						},
					},
					blockedHosts: {
						type: 'array',
						optional: false, nullable: false,
						items: {
							type: 'string',
						},
					},
					sensitiveWords: {
						type: 'array',
						optional: false, nullable: false,
						items: {
							type: 'string',
						},
					},
					prohibitedWords: {
						type: 'array',
						optional: false, nullable: false,
						items: {
							type: 'string',
						},
					},
					prohibitedWordsForNameOfUser: {
						type: 'array',
						optional: false, nullable: false,
						items: {
							type: 'string',
						},
					},
					bannedEmailDomains: {
						type: 'array',
						optional: true, nullable: false,
						items: {
							type: 'string',
							optional: false, nullable: false,
						},
					},
					preservedUsernames: {
						type: 'array',
						optional: false, nullable: false,
						items: {
							type: 'string',
						},
					},
					hcaptchaSecretKey: {
						type: 'string',
						optional: false, nullable: true,
					},
					mcaptchaSecretKey: {
						type: 'string',
						optional: false, nullable: true,
					},
					recaptchaSecretKey: {
						type: 'string',
						optional: false, nullable: true,
					},
					turnstileSecretKey: {
						type: 'string',
						optional: false, nullable: true,
					},
					sensitiveMediaDetection: {
						type: 'string',
						optional: false, nullable: false,
						enum: ['none', 'all', 'local', 'remote'],
					},
					sensitiveMediaDetectionSensitivity: {
						type: 'string',
						optional: false, nullable: false,
						enum: ['medium', 'low', 'high', 'veryLow', 'veryHigh'],
					},
					setSensitiveFlagAutomatically: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					enableSensitiveMediaDetectionForVideos: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					sensitiveMediaDetectionApiUrl: {
						type: 'string',
						optional: false, nullable: true,
					},
					sensitiveMediaDetectionApiKey: {
						type: 'string',
						optional: false, nullable: true,
					},
					sensitiveMediaDetectionTimeout: {
						type: 'number',
						optional: false, nullable: false,
					},
					sensitiveMediaDetectionMaxImagesPerRequest: {
						type: 'number',
						optional: false, nullable: false,
					},
					proxyAccountId: {
						type: 'string',
						optional: false, nullable: false,
						format: 'id',
					},
					email: {
						type: 'string',
						optional: false, nullable: true,
					},
					smtpSecure: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					smtpHost: {
						type: 'string',
						optional: false, nullable: true,
					},
					smtpPort: {
						type: 'number',
						optional: false, nullable: true,
					},
					smtpUser: {
						type: 'string',
						optional: false, nullable: true,
					},
					smtpPass: {
						type: 'string',
						optional: false, nullable: true,
					},
					swPrivateKey: {
						type: 'string',
						optional: false, nullable: true,
					},
					useObjectStorage: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					objectStorageBaseUrl: {
						type: 'string',
						optional: false, nullable: true,
					},
					objectStorageBucket: {
						type: 'string',
						optional: false, nullable: true,
					},
					objectStoragePrefix: {
						type: 'string',
						optional: false, nullable: true,
					},
					objectStorageEndpoint: {
						type: 'string',
						optional: false, nullable: true,
					},
					objectStorageRegion: {
						type: 'string',
						optional: false, nullable: true,
					},
					objectStoragePort: {
						type: 'number',
						optional: false, nullable: true,
					},
					objectStorageAccessKey: {
						type: 'string',
						optional: false, nullable: true,
					},
					objectStorageSecretKey: {
						type: 'string',
						optional: false, nullable: true,
					},
					objectStorageUseSSL: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					objectStorageUseProxy: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					objectStorageSetPublicRead: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					enableIpLogging: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					enableActiveEmailValidation: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					enableVerifymailApi: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					verifymailAuthKey: {
						type: 'string',
						optional: false, nullable: true,
					},
					enableTruemailApi: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					truemailInstance: {
						type: 'string',
						optional: false, nullable: true,
					},
					truemailAuthKey: {
						type: 'string',
						optional: false, nullable: true,
					},
					enableChartsForRemoteUser: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					enableChartsForFederatedInstances: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					enableStatsForFederatedInstances: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					enableServerMachineStats: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					enableIdenticonGeneration: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					manifestJsonOverride: {
						type: 'string',
						optional: false, nullable: false,
					},
					policies: {
						type: 'object',
						optional: false, nullable: false,
					},
					enableFanoutTimeline: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					enableFanoutTimelineDbFallback: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					perLocalUserUserTimelineCacheMax: {
						type: 'number',
						optional: false, nullable: false,
					},
					perRemoteUserUserTimelineCacheMax: {
						type: 'number',
						optional: false, nullable: false,
					},
					perUserHomeTimelineCacheMax: {
						type: 'number',
						optional: false, nullable: false,
					},
					perUserListTimelineCacheMax: {
						type: 'number',
						optional: false, nullable: false,
					},
					enableReactionsBuffering: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					notesPerOneAd: {
						type: 'number',
						optional: false, nullable: false,
					},
					backgroundImageUrl: {
						type: 'string',
						optional: false, nullable: true,
					},
					deeplAuthKey: {
						type: 'string',
						optional: false, nullable: true,
					},
					deeplIsPro: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					defaultDarkTheme: {
						type: 'string',
						optional: false, nullable: true,
					},
					defaultLightTheme: {
						type: 'string',
						optional: false, nullable: true,
					},
					clientOptions: {
						ref: 'MetaClientOptions',
					},
					description: {
						type: 'string',
						optional: false, nullable: true,
					},
					disableRegistration: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					impressumUrl: {
						type: 'string',
						optional: false, nullable: true,
					},
					maintainerEmail: {
						type: 'string',
						optional: false, nullable: true,
					},
					maintainerName: {
						type: 'string',
						optional: false, nullable: true,
					},
					name: {
						type: 'string',
						optional: false, nullable: true,
					},
					shortName: {
						type: 'string',
						optional: false, nullable: true,
					},
					objectStorageS3ForcePathStyle: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					privacyPolicyUrl: {
						type: 'string',
						optional: false, nullable: true,
					},
					inquiryUrl: {
						type: 'string',
						optional: false, nullable: true,
					},
					repositoryUrl: {
						type: 'string',
						optional: false, nullable: true,
					},
					feedbackUrl: {
						type: 'string',
						optional: false, nullable: true,
					},
					themeColor: {
						type: 'string',
						optional: false, nullable: true,
					},
					tosUrl: {
						type: 'string',
						optional: false, nullable: true,
					},
					uri: {
						type: 'string',
						optional: false, nullable: false,
					},
					version: {
						type: 'string',
						optional: false, nullable: false,
					},
					urlPreviewEnabled: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					urlPreviewAllowRedirect: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					urlPreviewTimeout: {
						type: 'number',
						optional: false, nullable: false,
					},
					urlPreviewMaximumContentLength: {
						type: 'number',
						optional: false, nullable: false,
					},
					urlPreviewRequireContentLength: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					urlPreviewUserAgent: {
						type: 'string',
						optional: false, nullable: true,
					},
					urlPreviewSummaryProxyUrl: {
						type: 'string',
						optional: false, nullable: true,
					},
					federation: {
						type: 'string',
						enum: ['all', 'specified', 'none'],
						optional: false, nullable: false,
					},
					federationHosts: {
						type: 'array',
						optional: false, nullable: false,
						items: {
							type: 'string',
							optional: false, nullable: false,
						},
					},
					deliverSuspendedSoftware: {
						type: 'array',
						optional: false, nullable: false,
						items: {
							type: 'object',
							optional: false, nullable: false,
							properties: {
								software: {
									type: 'string',
									optional: false, nullable: false,
								},
								versionRange: {
									type: 'string',
									optional: false, nullable: false,
								},
							},
						},
					},
					singleUserMode: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					ugcVisibilityForVisitor: {
						type: 'string',
						enum: ['all', 'local', 'none'],
						optional: false, nullable: false,
					},
					proxyRemoteFiles: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					signToActivityPubGet: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					allowExternalApRedirect: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					enableRemoteNotesCleaning: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					remoteNotesCleaningExpiryDaysForEachNotes: {
						type: 'number',
						optional: false, nullable: false,
					},
					remoteNotesCleaningMaxProcessingDurationInMinutes: {
						type: 'number',
						optional: false, nullable: false,
					},
					showRoleBadgesOfRemoteUsers: {
						type: 'boolean',
						optional: false, nullable: false,
					},
				},
			},
		} as const,
		paramDef: z.object({}),
	},
	'admin/promo/create': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'write:admin:promo',

			errors: {
				noSuchNote: {
					message: 'No such note.',
					code: 'NO_SUCH_NOTE',
					id: 'ee449fbe-af2a-453b-9cae-cf2fe7c895fc',
				},

				alreadyPromoted: {
					message: 'The note has already promoted.',
					code: 'ALREADY_PROMOTED',
					id: 'ae427aa2-7a41-484f-a18c-2c1104051604',
				},
			},
		} as const,
		paramDef: adminPromoCreateParamDef,
	},
	'admin/relays/add': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'write:admin:relays',

			errors: {
				invalidUrl: {
					message: 'Invalid URL',
					code: 'INVALID_URL',
					id: 'fb8c92d3-d4e5-44e7-b3d4-800d5cef8b2c',
				},
			},

			res: {
				type: 'object',
				optional: false, nullable: false,
				properties: {
					id: {
						type: 'string',
						optional: false, nullable: false,
						format: 'id',
					},
					inbox: {
						type: 'string',
						optional: false, nullable: false,
						format: 'url',
					},
					status: {
						type: 'string',
						optional: false, nullable: false,
						default: 'requesting',
						enum: [
							'requesting',
							'accepted',
							'rejected',
						],
					},
				},
			},
		} as const,
		paramDef: adminRelaysWriteParamDef,
	},
	'admin/relays/list': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'read:admin:relays',

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
						inbox: {
							type: 'string',
							optional: false, nullable: false,
							format: 'url',
						},
						status: {
							type: 'string',
							optional: false, nullable: false,
							default: 'requesting',
							enum: [
								'requesting',
								'accepted',
								'rejected',
							],
						},
					},
				},
			},
		} as const,
		paramDef: adminRelaysListParamDef,
	},
	'admin/relays/remove': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'write:admin:relays',
		} as const,
		paramDef: adminRelaysWriteParamDef,
	},
	'admin/reset-password': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'write:admin:reset-password',

			errors: {
				noSuchUser: {
					message: 'No such user.',
					code: 'NO_SUCH_USER',
					id: 'ccafc7fe-5074-4edd-9dc0-8ef9ef6a701d',
				},
				cannotResetPasswordOfRootUser: {
					message: 'Cannot reset password of the root user.',
					code: 'CANNOT_RESET_PASSWORD_OF_ROOT_USER',
					id: 'f28fc207-42ca-44c7-a577-44b4f0ec5999',
				},
			},

			res: {
				type: 'object',
				optional: false, nullable: false,
				properties: {
					password: {
						type: 'string',
						optional: false, nullable: false,
						minLength: 8,
						maxLength: 8,
					},
				},
			},
		} as const,
		paramDef: adminUserMaintenanceParamDef,
	},
	'admin/resolve-abuse-user-report': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'write:admin:resolve-abuse-user-report',

			errors: {
				noSuchAbuseReport: {
					message: 'No such abuse report.',
					code: 'NO_SUCH_ABUSE_REPORT',
					id: 'ac3794dd-2ce4-d878-e546-73c60c06b398',
					kind: 'server',
					httpStatusCode: 404,
				},
			},
		} as const,
		paramDef: adminResolveAbuseUserReportParamDef,
	},
	'admin/send-email': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'write:admin:send-email',
		} as const,
		paramDef: adminSendEmailParamDef,
	},
	'admin/server-info': {
		meta: {
			requireCredential: true,
			requireModerator: true,
			kind: 'read:admin:server-info',

			tags: ['admin', 'meta'],

			res: {
				type: 'object',
				optional: false, nullable: false,
				properties: {
					machine: {
						type: 'string',
						optional: false, nullable: false,
					},
					os: {
						type: 'string',
						optional: false, nullable: false,
						example: 'linux',
					},
					node: {
						type: 'string',
						optional: false, nullable: false,
					},
					psql: {
						type: 'string',
						optional: false, nullable: false,
					},
					cpu: {
						type: 'object',
						optional: false, nullable: false,
						properties: {
							model: {
								type: 'string',
								optional: false, nullable: false,
							},
							cores: {
								type: 'number',
								optional: false, nullable: false,
							},
						},
					},
					mem: {
						type: 'object',
						optional: false, nullable: false,
						properties: {
							total: {
								type: 'number',
								optional: false, nullable: false,
								format: 'bytes',
							},
						},
					},
					fs: {
						type: 'object',
						optional: false, nullable: false,
						properties: {
							total: {
								type: 'number',
								optional: false, nullable: false,
								format: 'bytes',
							},
							used: {
								type: 'number',
								optional: false, nullable: false,
								format: 'bytes',
							},
						},
					},
					net: {
						type: 'object',
						optional: false, nullable: false,
						properties: {
							interface: {
								type: 'string',
								optional: false, nullable: false,
								example: 'eth0',
							},
						},
					},
				},
			},
		} as const,
		paramDef: adminServerInfoParamDef,
	},
	'admin/show-moderation-logs': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireAdmin: true,
			kind: 'read:admin:show-moderation-log',

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
						createdAt: {
							type: 'string',
							optional: false, nullable: false,
							format: 'date-time',
						},
						type: {
							type: 'string',
							optional: false, nullable: false,
						},
						info: {
							type: 'object',
							optional: false, nullable: false,
						},
						userId: {
							type: 'string',
							optional: false, nullable: false,
							format: 'id',
						},
						user: {
							type: 'object',
							optional: false, nullable: false,
							ref: 'UserDetailedNotMe',
						},
					},
				},
			},
		} as const,
		paramDef: adminShowModerationLogsParamDef,
	},
	'admin/show-user': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'read:admin:show-user',

			res: {
				type: 'object',
				nullable: false, optional: false,
				properties: {
					email: {
						type: 'string',
						optional: false, nullable: true,
					},
					emailVerified: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					followedMessage: {
						type: 'string',
						optional: false, nullable: true,
					},
					autoAcceptFollowed: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					noCrawle: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					preventAiLearning: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					alwaysMarkNsfw: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					autoSensitive: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					carefulBot: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					injectFeaturedNote: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					receiveAnnouncementEmail: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					mutedWords: {
						type: 'array',
						optional: false, nullable: false,
						items: {
							anyOf: [
								{
									type: 'string',
								},
								{
									type: 'array',
									items: {
										type: 'string',
									},
								},
							],
						},
					},
					mutedInstances: {
						type: 'array',
						optional: false, nullable: false,
						items: {
							type: 'string',
						},
					},
					notificationRecieveConfig: {
						type: 'object',
						optional: false, nullable: false,
						properties: {
							note: { optional: true, ...notificationRecieveConfig },
							follow: { optional: true, ...notificationRecieveConfig },
							mention: { optional: true, ...notificationRecieveConfig },
							reply: { optional: true, ...notificationRecieveConfig },
							renote: { optional: true, ...notificationRecieveConfig },
							quote: { optional: true, ...notificationRecieveConfig },
							reaction: { optional: true, ...notificationRecieveConfig },
							pollEnded: { optional: true, ...notificationRecieveConfig },
							scheduledNotePosted: { optional: true, ...notificationRecieveConfig },
							scheduledNotePostFailed: { optional: true, ...notificationRecieveConfig },
							receiveFollowRequest: { optional: true, ...notificationRecieveConfig },
							followRequestAccepted: { optional: true, ...notificationRecieveConfig },
							roleAssigned: { optional: true, ...notificationRecieveConfig },
							chatRoomInvitationReceived: { optional: true, ...notificationRecieveConfig },
							achievementEarned: { optional: true, ...notificationRecieveConfig },
							app: { optional: true, ...notificationRecieveConfig },
							test: { optional: true, ...notificationRecieveConfig },
						},
					},
					isModerator: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					isSilenced: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					isSuspended: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					isHibernated: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					lastActiveDate: {
						type: 'string',
						optional: false, nullable: true,
					},
					moderationNote: {
						type: 'string',
						optional: false, nullable: false,
					},
					signins: {
						type: 'array',
						optional: false, nullable: false,
						items: {
							ref: 'Signin',
						},
					},
					policies: {
						type: 'object',
						optional: false, nullable: false,
						ref: 'RolePolicies',
					},
					roles: {
						type: 'array',
						optional: false, nullable: false,
						items: {
							type: 'object',
							ref: 'Role',
						},
					},
					roleAssigns: {
						type: 'array',
						optional: false, nullable: false,
						items: {
							type: 'object',
							properties: {
								createdAt: {
									type: 'string',
									optional: false, nullable: false,
								},
								expiresAt: {
									type: 'string',
									optional: false, nullable: true,
								},
								roleId: {
									type: 'string',
									optional: false, nullable: false,
								},
							},
						},
					},
				},
			},
		} as const,
		paramDef: adminShowUserParamDef,
	},
	'admin/show-users': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'read:admin:show-user',

			res: {
				type: 'array',
				nullable: false, optional: false,
				items: {
					type: 'object',
					nullable: false, optional: false,
					ref: 'UserDetailed',
				},
			},
		} as const,
		paramDef: adminShowUsersParamDef,
	},
	'admin/suspend-user': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'write:admin:suspend-user',
		} as const,
		paramDef: adminUserSuspensionParamDef,
	},
	'admin/unset-mfa': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'write:admin:unset-mfa',

			errors: {
				noSuchUser: {
					message: 'No such user.',
					code: 'NO_SUCH_USER',
					id: 'ccafc7fe-5074-4edd-9dc0-8ef9ef6a701d',
				},
			},
		} as const,
		paramDef: adminUserMaintenanceParamDef,
	},
	'admin/unset-user-avatar': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'write:admin:unset-user-avatar',
		} as const,
		paramDef: adminUserMaintenanceParamDef,
	},
	'admin/unset-user-banner': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'write:admin:unset-user-banner',
		} as const,
		paramDef: adminUserMaintenanceParamDef,
	},
	'admin/unsuspend-user': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'write:admin:unsuspend-user',
		} as const,
		paramDef: adminUserSuspensionParamDef,
	},
	'admin/update-abuse-user-report': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'write:admin:resolve-abuse-user-report',

			errors: {
				noSuchAbuseReport: {
					message: 'No such abuse report.',
					code: 'NO_SUCH_ABUSE_REPORT',
					id: '15f51cf5-46d1-4b1d-a618-b35bcbed0662',
					kind: 'server',
					httpStatusCode: 404,
				},
			},
		} as const,
		paramDef: adminUpdateAbuseUserReportParamDef,
	},
	'admin/update-meta': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireAdmin: true,
			kind: 'write:admin:meta',
		} as const,
		paramDef: adminUpdateMetaJsonSchema,
	},
	'admin/update-proxy-account': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'write:admin:account',

			res: {
				type: 'object',
				nullable: false, optional: false,
				ref: 'UserDetailed',
			},
		} as const,
		paramDef: adminUpdateProxyAccountParamDef,
	},
	'admin/update-user-note': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'write:admin:user-note',
		} as const,
		paramDef: adminUpdateUserNoteParamDef,
	},
} as const;
