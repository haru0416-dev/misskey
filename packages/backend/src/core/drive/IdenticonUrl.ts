/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Config } from '@/config.js';
import type { MiMeta } from '@/models/_.js';
import type { MiUser } from '@/models/User.js';

/** アバター未設定ユーザーのフォールバック画像 URL。ドット入りユーザー名のローカルユーザーは instance icon を使う。 */
export function getIdenticonUrl(config: Config, meta: MiMeta, user: MiUser): string {
	if ((user.host == null || user.host === config.runtime.host) && user.username.includes('.') && meta.iconUrl) {
		return meta.iconUrl;
	}

	return `${config.instance.url}/identicon/${user.username.toLowerCase()}@${user.host ?? config.runtime.host}`;
}
