/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { endpointMetas as adminEmojiContracts } from '@/server/api/metas/admin-emoji.js';
import { implementEndpoints } from '../endpoint-definition.js';
import type { ApiShellDependencies } from '../shell.js';
import {
	handleApiAdminEmojiAdd,
	handleApiAdminEmojiAddAliasesBulk,
	handleApiAdminEmojiCopy,
	handleApiAdminEmojiDelete,
	handleApiAdminEmojiDeleteBulk,
	handleApiAdminEmojiImportZip,
	handleApiAdminEmojiList,
	handleApiAdminEmojiListRemote,
	handleApiAdminEmojiRemoveAliasesBulk,
	handleApiAdminEmojiSetAliasesBulk,
	handleApiAdminEmojiSetCategoryBulk,
	handleApiAdminEmojiSetLicenseBulk,
	handleApiAdminEmojiUpdate,
} from '../emoji/emojis.js';

export const adminEmojiEndpoints = implementEndpoints<ApiShellDependencies>()(adminEmojiContracts, {
	'admin/emoji/add': async ({ deps, input, me }) => await handleApiAdminEmojiAdd(deps, me, input),
	'admin/emoji/add-aliases-bulk': async ({ deps, input }) => {
		await handleApiAdminEmojiAddAliasesBulk(deps, input);
	},
	'admin/emoji/copy': async ({ deps, input, me }) => await handleApiAdminEmojiCopy(deps, me, input),
	'admin/emoji/delete': async ({ deps, input, me }) => {
		await handleApiAdminEmojiDelete(deps, me, input);
	},
	'admin/emoji/delete-bulk': async ({ deps, input, me }) => {
		await handleApiAdminEmojiDeleteBulk(deps, me, input);
	},
	'admin/emoji/import-zip': async ({ deps, input, me }) => {
		await handleApiAdminEmojiImportZip(deps, me, input);
	},
	'admin/emoji/list': async ({ deps, input }) => await handleApiAdminEmojiList(deps, input),
	'admin/emoji/list-remote': async ({ deps, input }) => await handleApiAdminEmojiListRemote(deps, input),
	'admin/emoji/remove-aliases-bulk': async ({ deps, input }) => {
		await handleApiAdminEmojiRemoveAliasesBulk(deps, input);
	},
	'admin/emoji/set-aliases-bulk': async ({ deps, input }) => {
		await handleApiAdminEmojiSetAliasesBulk(deps, input);
	},
	'admin/emoji/set-category-bulk': async ({ deps, input }) => {
		await handleApiAdminEmojiSetCategoryBulk(deps, input);
	},
	'admin/emoji/set-license-bulk': async ({ deps, input }) => {
		await handleApiAdminEmojiSetLicenseBulk(deps, input);
	},
	'admin/emoji/update': async ({ deps, input, me }) => {
		await handleApiAdminEmojiUpdate(deps, me, input);
	},
});
