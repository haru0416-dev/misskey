/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { driveFilesUploadFromUrlParamDef } from '@/server/rest/drive-file-upload.js';

export const meta = {
	tags: ['drive'],

	limit: {
		duration: ms('1hour'),
		max: 60,
	},

	description: 'Request the server to download a new drive file from the specified URL.',

	requireCredential: true,

	prohibitMoved: true,

	kind: 'write:drive',
} as const;

export const paramDef = driveFilesUploadFromUrlParamDef;
