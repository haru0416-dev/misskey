/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as os from 'node:os';
import { adminServerInfoParamDef } from '@/server/rest/admin-server-info.js';

export const meta = {
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
} as const;

export const paramDef = adminServerInfoParamDef;
