/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Misskey from 'misskey-js';
import { readServerContext } from '@shared/utility/server-context.js';
import { misskeyApi } from '@/misskey-api.js';

const _serverMetadata = readServerContext<Misskey.entities.MetaDetailed>('misskey_meta');

// NOTE: devモードのときしか _serverMetadata が null になることは無い
export const serverMetadata: Misskey.entities.MetaDetailed = _serverMetadata ?? await misskeyApi('meta', {
	detail: true,
});
