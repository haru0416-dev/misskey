/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeAll } from 'vitest';
import { sendEnvResetRequest } from './utils.js';

// CI 負荷で時間が延びる DB リセット・アプリ再起動には、個別の hookTimeout を設定する。
beforeAll(async () => {
	await sendEnvResetRequest();
}, 60_000);
