/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// 複数の Packed スキーマが同じ意味で持つ列。スプレッドした位置が OpenAPI 出力のキー順になる。

export const entityHeaderProperties = {
	id: {
		type: 'string',
		optional: false,
		nullable: false,
		format: 'id',
		example: 'xxxxxxxxxx',
	},
	createdAt: {
		type: 'string',
		optional: false,
		nullable: false,
		format: 'date-time',
	},
} as const;

export const authorProperties = {
	userId: {
		type: 'string',
		optional: false,
		nullable: false,
		format: 'id',
	},
	user: {
		type: 'object',
		ref: 'UserLite',
		optional: false,
		nullable: false,
	},
} as const;

export const editableUserContentHeaderProperties = {
	...entityHeaderProperties,
	updatedAt: {
		type: 'string',
		optional: false,
		nullable: false,
		format: 'date-time',
	},
	...authorProperties,
} as const;

export const optionalAttachmentProperties = {
	fileIds: {
		type: 'array',
		optional: true,
		nullable: false,
		items: {
			type: 'string',
			optional: false,
			nullable: false,
			format: 'id',
		},
	},
	files: {
		type: 'array',
		optional: true,
		nullable: false,
		items: {
			type: 'object',
			optional: false,
			nullable: false,
			ref: 'DriveFile',
		},
	},
	tags: {
		type: 'array',
		optional: true,
		nullable: false,
		items: {
			type: 'string',
			optional: false,
			nullable: false,
		},
	},
} as const;

export const noteChannelSummaryProperty = {
	type: 'object',
	optional: true,
	nullable: true,
	properties: {
		id: {
			type: 'string',
			optional: false,
			nullable: false,
		},
		name: {
			type: 'string',
			optional: false,
			nullable: false,
		},
		color: {
			type: 'string',
			optional: false,
			nullable: false,
		},
		isSensitive: {
			type: 'boolean',
			optional: false,
			nullable: false,
		},
		allowRenoteToExternal: {
			type: 'boolean',
			optional: false,
			nullable: false,
		},
		userId: {
			type: 'string',
			optional: false,
			nullable: true,
		},
	},
} as const;
