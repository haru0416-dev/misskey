/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { execSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import { createRequire } from 'node:module';

const __dirname = import.meta.dirname;
const require = createRequire(import.meta.url);

// clean.mjs のビルド成果物削除に加えて、全 workspace + root の node_modules と
// bun のグローバルキャッシュも消す
const { workspaces } = require('../package.json');

execSync('bun run clean', {
	cwd: `${__dirname}/../`,
	stdio: 'inherit',
});

await Promise.all(
	[...workspaces, '.'].map((dir) => fs.rm(`${__dirname}/../${dir}/node_modules`, { recursive: true, force: true })),
);

execSync('bun pm cache rm', {
	cwd: `${__dirname}/../`,
	stdio: 'inherit',
});
