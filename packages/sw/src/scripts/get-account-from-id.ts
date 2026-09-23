/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { get } from 'idb-keyval';
import type * as Misskey from 'misskey-js';

type SavedAccount = Pick<Misskey.entities.SignupResponse, 'id' | 'token'>;

async function getAccountTokens(): Promise<Record<string, string>> {
	// Pinia base の device 保存が正本。別ホストの資格情報はこの SW で使わない。
	const state = await get<{ accountTokens?: Record<string, string> }>('pinia::base::device');
	return state?.accountTokens ?? {};
}

export async function getAccountFromId(id: string): Promise<SavedAccount | undefined> {
	const tokens = await getAccountTokens();
	const token = tokens[`${globalThis.location.host}/${id}`];
	return typeof token === 'string' && token.length > 0 ? { id, token } : undefined;
}

export async function getLocalAccounts(): Promise<SavedAccount[]> {
	const prefix = `${globalThis.location.host}/`;
	const accounts: SavedAccount[] = [];
	for (const [key, token] of Object.entries(await getAccountTokens())) {
		if (key.startsWith(prefix) && key.length > prefix.length && typeof token === 'string' && token.length > 0) {
			accounts.push({ id: key.slice(prefix.length), token });
		}
	}
	return accounts;
}
