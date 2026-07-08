/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Misskey from 'misskey-js';
import { readServerContext } from '@@/js/server-context.js';

export { assertServerContext } from '@@/js/server-context.js';

export type ServerContext = {
	clip?: Misskey.entities.Clip;
	note?: Misskey.entities.Note;
	user?: Misskey.entities.UserDetailed;
} | null;

export const serverContext: ServerContext = readServerContext<NonNullable<ServerContext>>('misskey_clientCtx');
