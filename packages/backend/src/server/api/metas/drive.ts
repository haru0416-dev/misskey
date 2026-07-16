/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { driveFilesCreateParamDef, driveFilesUploadFromUrlParamDef } from '@/server/rest/drive-file-upload.js';
import { driveFilesAttachedChatMessagesParamDef, driveFilesAttachedNotesParamDef, driveFilesDeleteParamDef, driveFilesFindByHashParamDef, driveFilesFindParamDef, driveFilesMoveBulkParamDef, driveFilesParamDef, driveFilesShowParamDef, driveFilesUpdateParamDef, driveStreamParamDef } from '@/server/rest/drive-files.js';
import { driveFilesCheckExistenceParamDef, driveFoldersCreateParamDef, driveFoldersDeleteParamDef, driveFoldersFindParamDef, driveFoldersParamDef, driveFoldersShowParamDef, driveFoldersUpdateParamDef } from '@/server/rest/drive.js';
import { z } from 'zod';
import { HOUR } from '@/const.js';

export const endpointMetas = {
	'drive': {
		meta: {
			tags: ['drive', 'account'],

			requireCredential: true,

			kind: 'read:drive',

			res: {
				type: 'object',
				optional: false, nullable: false,
				properties: {
					capacity: {
						type: 'number',
						optional: false, nullable: false,
					},
					usage: {
						type: 'number',
						optional: false, nullable: false,
					},
				},
			},
		} as const,
		paramDef: z.object({}),
	},
	'drive/files': {
		meta: {
			tags: ['drive'],

			requireCredential: true,

			kind: 'read:drive',

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
		paramDef: driveFilesParamDef,
	},
	'drive/files/attached-notes': {
		meta: {
			tags: ['drive', 'notes'],

			requireCredential: true,

			kind: 'read:drive',

			description: 'Find the notes to which the given file is attached.',

			res: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					ref: 'Note',
				},
			},

			errors: {
				noSuchFile: {
					message: 'No such file.',
					code: 'NO_SUCH_FILE',
					id: 'c118ece3-2e4b-4296-99d1-51756e32d232',
				},
			},
		} as const,
		paramDef: driveFilesAttachedNotesParamDef,
	},
	'drive/files/attached-chat-messages': {
		meta: {
			tags: ['drive', 'chat'],

			requireCredential: true,

			kind: 'read:drive',

			res: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					ref: 'ChatMessage',
				},
			},

			errors: {
				noSuchFile: {
					message: 'No such file.',
					code: 'NO_SUCH_FILE',
					id: '485ce26d-f5d2-4313-9783-e689d131eafb',
				},
			},
		} as const,
		paramDef: driveFilesAttachedChatMessagesParamDef,
	},
	'drive/files/check-existence': {
		meta: {
			tags: ['drive'],

			requireCredential: true,

			kind: 'read:drive',

			description: 'Check if a given file exists.',

			res: {
				type: 'boolean',
				optional: false, nullable: false,
			},
		} as const,
		paramDef: driveFilesCheckExistenceParamDef,
	},
	'drive/files/create': {
		meta: {
			tags: ['drive'],

			requireCredential: true,

			prohibitMoved: true,

			limit: {
				duration: HOUR,
				max: 120,
			},

			requireFile: true,

			kind: 'write:drive',

			description: 'Upload a new drive file.',

			res: {
				type: 'object',
				optional: false, nullable: false,
				ref: 'DriveFile',
			},

			errors: {
				invalidFileName: {
					message: 'Invalid file name.',
					code: 'INVALID_FILE_NAME',
					id: 'f449b209-0c60-4e51-84d5-29486263bfd4',
				},

				noSuchFolder: {
					message: 'No such folder.',
					code: 'NO_SUCH_FOLDER',
					id: '12e7caa8-224f-471d-978a-653a81cf4c90',
				},

				noFreeSpace: {
					message: 'Cannot upload the file because you have no free space of drive.',
					code: 'NO_FREE_SPACE',
					id: 'd08dbc37-a6a9-463a-8c47-96c32ab5f064',
				},

				maxFileSizeExceeded: {
					message: 'Cannot upload the file because it exceeds the maximum file size.',
					code: 'MAX_FILE_SIZE_EXCEEDED',
					id: 'b9d8c348-33f0-4673-b9a9-5d4da058977a',
					httpStatusCode: 413,
				},

				unallowedFileType: {
					message: 'Cannot upload the file because it is an unallowed file type.',
					code: 'UNALLOWED_FILE_TYPE',
					id: '4becd248-7f2c-48c4-a9f0-75edc4f9a1ea',
				},
			},
		} as const,
		paramDef: driveFilesCreateParamDef,
	},
	'drive/files/delete': {
		meta: {
			tags: ['drive'],

			requireCredential: true,

			kind: 'write:drive',

			description: 'Delete an existing drive file.',

			errors: {
				noSuchFile: {
					message: 'No such file.',
					code: 'NO_SUCH_FILE',
					id: '908939ec-e52b-4458-b395-1025195cea58',
				},

				accessDenied: {
					message: 'Access denied.',
					code: 'ACCESS_DENIED',
					id: '5eb8d909-2540-4970-90b8-dd6f86088121',
				},
			},
		} as const,
		paramDef: driveFilesDeleteParamDef,
	},
	'drive/files/find': {
		meta: {
			requireCredential: true,

			tags: ['drive'],

			kind: 'read:drive',

			description: 'Search for a drive file by the given parameters.',

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
		paramDef: driveFilesFindParamDef,
	},
	'drive/files/find-by-hash': {
		meta: {
			tags: ['drive'],

			requireCredential: true,

			kind: 'read:drive',

			description: 'Search for a drive file by a hash of the contents.',

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
		paramDef: driveFilesFindByHashParamDef,
	},
	'drive/files/show': {
		meta: {
			tags: ['drive'],

			requireCredential: true,

			kind: 'read:drive',

			description: 'Show the properties of a drive file.',

			res: {
				type: 'object',
				optional: false, nullable: false,
				ref: 'DriveFile',
			},

			errors: {
				noSuchFile: {
					message: 'No such file.',
					code: 'NO_SUCH_FILE',
					id: '067bc436-2718-4795-b0fb-ecbe43949e31',
				},

				accessDenied: {
					message: 'Access denied.',
					code: 'ACCESS_DENIED',
					id: '25b73c73-68b1-41d0-bad1-381cfdf6579f',
				},
			},
		} as const,
		paramDef: driveFilesShowParamDef,
	},
	'drive/files/update': {
		meta: {
			tags: ['drive'],

			requireCredential: true,

			kind: 'write:drive',

			description: 'Update the properties of a drive file.',

			errors: {
				invalidFileName: {
					message: 'Invalid file name.',
					code: 'INVALID_FILE_NAME',
					id: '395e7156-f9f0-475e-af89-53c3c23080c2',
				},

				noSuchFile: {
					message: 'No such file.',
					code: 'NO_SUCH_FILE',
					id: 'e7778c7e-3af9-49cd-9690-6dbc3e6c972d',
				},

				accessDenied: {
					message: 'Access denied.',
					code: 'ACCESS_DENIED',
					id: '01a53b27-82fc-445b-a0c1-b558465a8ed2',
				},

				noSuchFolder: {
					message: 'No such folder.',
					code: 'NO_SUCH_FOLDER',
					id: 'ea8fb7a5-af77-4a08-b608-c0218176cd73',
				},

				restrictedByRole: {
					message: 'This feature is restricted by your role.',
					code: 'RESTRICTED_BY_ROLE',
					id: '7f59dccb-f465-75ab-5cf4-3ce44e3282f7',
				},
			},
			res: {
				type: 'object',
				optional: false, nullable: false,
				ref: 'DriveFile',
			},
		} as const,
		paramDef: driveFilesUpdateParamDef,
	},
	'drive/files/move-bulk': {
		meta: {
			tags: ['drive'],

			requireCredential: true,

			kind: 'write:drive',

			errors: {
				noSuchFolder: {
					message: 'No such folder.',
					code: 'NO_SUCH_FOLDER',
					id: 'abdd73a9-6225-4140-a3e4-8089c77168bc',
				},
			},
		} as const,
		paramDef: driveFilesMoveBulkParamDef,
	},
	'drive/files/upload-from-url': {
		meta: {
			tags: ['drive'],

			limit: {
				duration: HOUR,
				max: 60,
			},

			description: 'Request the server to download a new drive file from the specified URL.',

			requireCredential: true,

			prohibitMoved: true,

			kind: 'write:drive',
		} as const,
		paramDef: driveFilesUploadFromUrlParamDef,
	},
	'drive/folders': {
		meta: {
			tags: ['drive'],

			requireCredential: true,

			kind: 'read:drive',

			res: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					ref: 'DriveFolder',
				},
			},
		} as const,
		paramDef: driveFoldersParamDef,
	},
	'drive/folders/create': {
		meta: {
			tags: ['drive'],

			requireCredential: true,

			kind: 'write:drive',

			limit: {
				duration: HOUR,
				max: 10,
			},

			errors: {
				noSuchFolder: {
					message: 'No such folder.',
					code: 'NO_SUCH_FOLDER',
					id: '53326628-a00d-40a6-a3cd-8975105c0f95',
				},
			},

			res: {
				type: 'object' as const,
				optional: false as const, nullable: false as const,
				ref: 'DriveFolder',
			},
		} as const,
		paramDef: driveFoldersCreateParamDef,
	},
	'drive/folders/delete': {
		meta: {
			tags: ['drive'],

			requireCredential: true,

			kind: 'write:drive',

			errors: {
				noSuchFolder: {
					message: 'No such folder.',
					code: 'NO_SUCH_FOLDER',
					id: '1069098f-c281-440f-b085-f9932edbe091',
				},

				hasChildFilesOrFolders: {
					message: 'This folder has child files or folders.',
					code: 'HAS_CHILD_FILES_OR_FOLDERS',
					id: 'b0fc8a17-963c-405d-bfbc-859a487295e1',
				},
			},
		} as const,
		paramDef: driveFoldersDeleteParamDef,
	},
	'drive/folders/find': {
		meta: {
			tags: ['drive'],

			requireCredential: true,

			kind: 'read:drive',

			res: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					ref: 'DriveFolder',
				},
			},
		} as const,
		paramDef: driveFoldersFindParamDef,
	},
	'drive/folders/show': {
		meta: {
			tags: ['drive'],

			requireCredential: true,

			kind: 'read:drive',

			res: {
				type: 'object',
				optional: false, nullable: false,
				ref: 'DriveFolder',
			},

			errors: {
				noSuchFolder: {
					message: 'No such folder.',
					code: 'NO_SUCH_FOLDER',
					id: 'd74ab9eb-bb09-4bba-bf24-fb58f761e1e9',
				},
			},
		} as const,
		paramDef: driveFoldersShowParamDef,
	},
	'drive/folders/update': {
		meta: {
			tags: ['drive'],

			requireCredential: true,

			kind: 'write:drive',

			errors: {
				noSuchFolder: {
					message: 'No such folder.',
					code: 'NO_SUCH_FOLDER',
					id: 'f7974dac-2c0d-4a27-926e-23583b28e98e',
				},

				noSuchParentFolder: {
					message: 'No such parent folder.',
					code: 'NO_SUCH_PARENT_FOLDER',
					id: 'ce104e3a-faaf-49d5-b459-10ff0cbbcaa1',
				},

				recursiveNesting: {
					message: 'It can not be structured like nesting folders recursively.',
					code: 'RECURSIVE_NESTING',
					id: 'dbeb024837894013aed44279f9199740',
				},
			},

			res: {
				type: 'object',
				optional: false, nullable: false,
				ref: 'DriveFolder',
			},
		} as const,
		paramDef: driveFoldersUpdateParamDef,
	},
	'drive/stream': {
		meta: {
			tags: ['drive'],

			requireCredential: true,

			kind: 'read:drive',

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
		paramDef: driveStreamParamDef,
	},
} as const;
