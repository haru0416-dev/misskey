/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { endpointMetas as driveContracts } from '@/server/api/metas/drive.js';
import { pickContracts } from '../endpoint-contract.js';
import { implementEndpoints } from '../endpoint-definition.js';
import type { ApiShellDependencies } from '../shell.js';
import {
	handleApiDriveFilesAttachedChatMessages,
	handleApiDriveFilesAttachedNotes,
	handleApiDriveFilesDelete,
	handleApiDriveFilesFind,
	handleApiDriveFilesFindByHash,
	handleApiDriveFilesList,
	handleApiDriveFilesMoveBulk,
	handleApiDriveFilesShow,
	handleApiDriveFilesUpdate,
	handleApiDriveStream,
} from '../drive/drive-files.js';
import {
	handleApiDrive,
	handleApiDriveFilesCheckExistence,
	handleApiDriveFolders,
	handleApiDriveFoldersCreate,
	handleApiDriveFoldersDelete,
	handleApiDriveFoldersFind,
	handleApiDriveFoldersShow,
	handleApiDriveFoldersUpdate,
} from '../drive/drive.js';
import { handleApiDriveFilesUploadFromUrl } from '../drive/drive-file-upload.js';

export const driveEndpoints = implementEndpoints<ApiShellDependencies>()(
	pickContracts(driveContracts, [
		'drive',
		'drive/files',
		'drive/files/attached-notes',
		'drive/files/attached-chat-messages',
		'drive/files/check-existence',
		'drive/files/delete',
		'drive/files/find',
		'drive/files/find-by-hash',
		'drive/files/show',
		'drive/files/update',
		'drive/files/move-bulk',
		'drive/files/upload-from-url',
		'drive/folders',
		'drive/folders/create',
		'drive/folders/delete',
		'drive/folders/find',
		'drive/folders/show',
		'drive/folders/update',
		'drive/stream',
	]),
	{
		'drive/files': async ({ deps, input, me }) => await handleApiDriveFilesList(deps, me, input),
		'drive/files/attached-notes': async ({ deps, input, me }) =>
			await handleApiDriveFilesAttachedNotes(deps, me, input),
		'drive/files/attached-chat-messages': async ({ deps, input, me }) =>
			await handleApiDriveFilesAttachedChatMessages(deps, me, input),
		'drive/files/check-existence': async ({ deps, input, me }) =>
			await handleApiDriveFilesCheckExistence(deps, me, input),
		'drive/files/delete': async ({ deps, input, me }) => {
			await handleApiDriveFilesDelete(deps, me, input);
		},
		'drive/files/find': async ({ deps, input, me }) => await handleApiDriveFilesFind(deps, me, input),
		'drive/files/find-by-hash': async ({ deps, input, me }) => await handleApiDriveFilesFindByHash(deps, me, input),
		'drive/files/show': async ({ deps, input, me }) => await handleApiDriveFilesShow(deps, me, input),
		'drive/files/update': async ({ deps, input, me }) => await handleApiDriveFilesUpdate(deps, me, input),
		'drive/files/move-bulk': async ({ deps, input, me }) => {
			await handleApiDriveFilesMoveBulk(deps, me, input);
		},
		'drive/folders': async ({ deps, input, me }) => await handleApiDriveFolders(deps, me, input),
		'drive/folders/create': async ({ deps, errors, input, me }) =>
			await handleApiDriveFoldersCreate(deps, me, input, errors),
		'drive/folders/delete': async ({ deps, errors, input, me }) => {
			await handleApiDriveFoldersDelete(deps, me, input, errors);
		},
		'drive/folders/find': async ({ deps, input, me }) => await handleApiDriveFoldersFind(deps, me, input),
		'drive/folders/show': async ({ deps, errors, input, me }) =>
			await handleApiDriveFoldersShow(deps, me, input, errors),
		'drive/folders/update': async ({ deps, errors, input, me }) =>
			await handleApiDriveFoldersUpdate(deps, me, input, errors),
		'drive/stream': async ({ deps, input, me }) => await handleApiDriveStream(deps, me, input),
		drive: async ({ deps, me }) => await handleApiDrive(deps, me),
		'drive/files/upload-from-url': async ({ deps, me, input, requestIp, requestHeaders }) => {
			handleApiDriveFilesUploadFromUrl(deps, me, input, requestIp(), requestHeaders());
		},
	},
);
