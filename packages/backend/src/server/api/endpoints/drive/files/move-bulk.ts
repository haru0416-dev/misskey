/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { driveFilesMoveBulkParamDef } from '@/server/rest/drive-files.js';

export const meta = {
	tags: ['drive'],

	requireCredential: true,

	kind: 'write:drive',

	errors: {
	},
} as const;

export const paramDef = driveFilesMoveBulkParamDef;
