/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import * as Misskey from 'misskey-js';
import { readServerContext } from '@shared/utility/server-context.js';

export { assertServerContext } from '@shared/utility/server-context.js';

export type ServerContext = {
	clip?: Misskey.entities.Clip;
	note?: Misskey.entities.Note;
	user?: Misskey.entities.UserLite;
} | null;

// 開発モード以外ではembedCtxが必ず設定される。
export const serverContext: ServerContext = readServerContext<NonNullable<ServerContext>>('misskey_embedCtx');
