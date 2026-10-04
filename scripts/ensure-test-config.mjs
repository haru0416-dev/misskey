/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { constants, copyFileSync, mkdirSync } from 'node:fs';

const source = process.argv[2] ?? '.github/misskey/test.yml';
mkdirSync('.config', { recursive: true });
try {
	// 同時に起動した別プロセスや既存の設定を上書きしない。
	copyFileSync(source, '.config/test.yml', constants.COPYFILE_EXCL);
} catch (error) {
	if (error.code !== 'EEXIST') throw error;
}
