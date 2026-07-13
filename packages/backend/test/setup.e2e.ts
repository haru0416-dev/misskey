/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeAll } from 'vitest';
import { sendEnvResetRequest } from './utils.js';

// DBリセット + アプリ再起動はCIランナーの負荷次第でvitest既定のhookTimeout (10秒) を超えることがあり、
// 超えるとそのファイルの全テストがskipされてしまうため、余裕を持ったタイムアウトを指定する
beforeAll(async () => {
	await sendEnvResetRequest();
}, 60_000);
