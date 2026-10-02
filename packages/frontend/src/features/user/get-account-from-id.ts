/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { host } from '@shared/utility/config.js';
import { store } from '@/store.js';

export async function getAccountFromId(id: string) {
	await store.$persistReady;
	const token = store.accountTokens[`${host}/${id}`];
	return token ? { id, token } : undefined;
}
