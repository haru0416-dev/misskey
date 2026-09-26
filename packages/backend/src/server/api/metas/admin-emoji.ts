/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import {
	adminEmojiAddParamDef,
	adminEmojiAliasesBulkParamDef,
	adminEmojiCopyParamDef,
	adminEmojiDeleteBulkParamDef,
	adminEmojiDeleteParamDef,
	adminEmojiImportZipParamDef,
	adminEmojiListParamDef,
	adminEmojiListRemoteParamDef,
	adminEmojiSetCategoryBulkParamDef,
	adminEmojiSetLicenseBulkParamDef,
	adminEmojiUpdateParamDef,
} from '@/server/rest/emoji/emojis.js';
import { defineContract } from '@/server/rest/endpoint-contract.js';

export const endpointMetas = {
	'admin/emoji/add': defineContract({
		meta: {
			requireRolePolicy: 'canManageCustomEmojis',
			tags: ['admin'],

			requireCredential: true,
			requiredRolePolicy: 'canManageCustomEmojis',
			kind: 'write:admin:emoji',

			errors: {
				noSuchFile: {
					message: 'No such file.',
					code: 'NO_SUCH_FILE',
					id: 'fc46b5a4-6b92-4c33-ac66-b806659bb5cf',
				},
				unsupportedFileType: {
					message: 'Unsupported file type.',
					code: 'UNSUPPORTED_FILE_TYPE',
					id: 'f7599d96-8750-af68-1633-9575d625c1a7',
				},
				duplicateName: {
					message: 'Duplicate name.',
					code: 'DUPLICATE_NAME',
					id: 'f7a3462c-4e6e-4069-8421-b9bd4f4c3975',
				},
			},

			res: {
				type: 'object',
				ref: 'EmojiDetailed',
			},
		},
		paramDef: adminEmojiAddParamDef,
	}),
	'admin/emoji/add-aliases-bulk': defineContract({
		meta: {
			requireRolePolicy: 'canManageCustomEmojis',
			tags: ['admin'],

			requireCredential: true,
			requiredRolePolicy: 'canManageCustomEmojis',
			kind: 'write:admin:emoji',

			errors: {
				noSuchEmoji: {
					message: 'No such emoji.',
					code: 'NO_SUCH_EMOJI',
					id: '756e37b2-8e81-421c-9d18-740a6932d57f',
				},
			},
		},
		paramDef: adminEmojiAliasesBulkParamDef,
	}),
	'admin/emoji/copy': defineContract({
		meta: {
			requireRolePolicy: 'canManageCustomEmojis',
			tags: ['admin'],

			requireCredential: true,
			requiredRolePolicy: 'canManageCustomEmojis',
			kind: 'write:admin:emoji',

			errors: {
				noSuchEmoji: {
					message: 'No such emoji.',
					code: 'NO_SUCH_EMOJI',
					id: 'e2785b66-dca3-4087-9cac-b93c541cc425',
				},
				duplicateName: {
					message: 'Duplicate name.',
					code: 'DUPLICATE_NAME',
					id: 'f7a3462c-4e6e-4069-8421-b9bd4f4c3975',
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
				},
			},
		},
		paramDef: adminEmojiCopyParamDef,
	}),
	'admin/emoji/delete': defineContract({
		meta: {
			requireRolePolicy: 'canManageCustomEmojis',
			tags: ['admin'],

			requireCredential: true,
			requiredRolePolicy: 'canManageCustomEmojis',
			kind: 'write:admin:emoji',

			errors: {
				noSuchEmoji: {
					message: 'No such emoji.',
					code: 'NO_SUCH_EMOJI',
					id: 'be83669b-773a-44b7-b1f8-e5e5170ac3c2',
				},
			},
		},
		paramDef: adminEmojiDeleteParamDef,
	}),
	'admin/emoji/delete-bulk': defineContract({
		meta: {
			requireRolePolicy: 'canManageCustomEmojis',
			tags: ['admin'],

			requireCredential: true,
			requiredRolePolicy: 'canManageCustomEmojis',
			kind: 'write:admin:emoji',
		},
		paramDef: adminEmojiDeleteBulkParamDef,
	}),
	'admin/emoji/import-zip': defineContract({
		meta: {
			requireRolePolicy: 'canManageCustomEmojis',
			secure: true,
			requireCredential: true,
			requiredRolePolicy: 'canManageCustomEmojis',
		},
		paramDef: adminEmojiImportZipParamDef,
	}),
	'admin/emoji/list': defineContract({
		meta: {
			requireRolePolicy: 'canManageCustomEmojis',
			allowQuery: true,
			tags: ['admin'],

			requireCredential: true,
			requiredRolePolicy: 'canManageCustomEmojis',
			kind: 'read:admin:emoji',

			res: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					ref: 'EmojiDetailed',
				},
			},
		},
		paramDef: adminEmojiListParamDef,
	}),
	'admin/emoji/list-remote': defineContract({
		meta: {
			requireRolePolicy: 'canManageCustomEmojis',
			allowQuery: true,
			tags: ['admin'],

			requireCredential: true,
			requiredRolePolicy: 'canManageCustomEmojis',
			kind: 'read:admin:emoji',

			res: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					ref: 'EmojiDetailed',
				},
			},
		},
		paramDef: adminEmojiListRemoteParamDef,
	}),
	'admin/emoji/remove-aliases-bulk': defineContract({
		meta: {
			requireRolePolicy: 'canManageCustomEmojis',
			tags: ['admin'],

			requireCredential: true,
			requiredRolePolicy: 'canManageCustomEmojis',
			kind: 'write:admin:emoji',

			errors: {
				noSuchEmoji: {
					message: 'No such emoji.',
					code: 'NO_SUCH_EMOJI',
					id: '756e37b2-8e81-421c-9d18-740a6932d57f',
				},
			},
		},
		paramDef: adminEmojiAliasesBulkParamDef,
	}),
	'admin/emoji/set-aliases-bulk': defineContract({
		meta: {
			requireRolePolicy: 'canManageCustomEmojis',
			tags: ['admin'],

			requireCredential: true,
			requiredRolePolicy: 'canManageCustomEmojis',
			kind: 'write:admin:emoji',

			errors: {
				noSuchEmoji: {
					message: 'No such emoji.',
					code: 'NO_SUCH_EMOJI',
					id: '756e37b2-8e81-421c-9d18-740a6932d57f',
				},
			},
		},
		paramDef: adminEmojiAliasesBulkParamDef,
	}),
	'admin/emoji/set-category-bulk': defineContract({
		meta: {
			requireRolePolicy: 'canManageCustomEmojis',
			tags: ['admin'],

			requireCredential: true,
			requiredRolePolicy: 'canManageCustomEmojis',
			kind: 'write:admin:emoji',

			errors: {
				noSuchEmoji: {
					message: 'No such emoji.',
					code: 'NO_SUCH_EMOJI',
					id: '756e37b2-8e81-421c-9d18-740a6932d57f',
				},
			},
		},
		paramDef: adminEmojiSetCategoryBulkParamDef,
	}),
	'admin/emoji/set-license-bulk': defineContract({
		meta: {
			requireRolePolicy: 'canManageCustomEmojis',
			tags: ['admin'],

			requireCredential: true,
			requiredRolePolicy: 'canManageCustomEmojis',
			kind: 'write:admin:emoji',

			errors: {
				noSuchEmoji: {
					message: 'No such emoji.',
					code: 'NO_SUCH_EMOJI',
					id: '756e37b2-8e81-421c-9d18-740a6932d57f',
				},
			},
		},
		paramDef: adminEmojiSetLicenseBulkParamDef,
	}),
	'admin/emoji/update': defineContract({
		meta: {
			requireRolePolicy: 'canManageCustomEmojis',
			tags: ['admin'],

			requireCredential: true,
			requiredRolePolicy: 'canManageCustomEmojis',
			kind: 'write:admin:emoji',

			errors: {
				noSuchEmoji: {
					message: 'No such emoji.',
					code: 'NO_SUCH_EMOJI',
					id: '684dec9d-a8c2-4364-9aa8-456c49cb1dc8',
				},
				noSuchFile: {
					message: 'No such file.',
					code: 'NO_SUCH_FILE',
					id: '14fb9fd9-0731-4e2f-aeb9-f09e4740333d',
				},
				sameNameEmojiExists: {
					message: 'Emoji that have same name already exists.',
					code: 'SAME_NAME_EMOJI_EXISTS',
					id: '7180fe9d-1ee3-bff9-647d-fe9896d2ffb8',
				},
			},
		},
		paramDef: adminEmojiUpdateParamDef,
	}),
};
