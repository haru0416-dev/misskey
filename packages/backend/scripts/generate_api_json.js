/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { writeFileSync, existsSync } from 'node:fs';
import { spawnChecked } from '../../../scripts/spawn-checked.mjs';

async function main() {
	if (!process.argv.includes('--no-build')) {
		await spawnChecked([process.execPath, 'run', 'build']);
	}

	if (!existsSync('./built')) {
		throw new Error('`built` directory does not exist.');
	}

	/** @type {import('../src/config.js')} */
	const { loadConfig } = await import('../built/config.js');

	/** @type {import('../src/server/api/openapi/gen-spec.js')} */
	const { genOpenapiSpec } = await import('../built/gen-spec.js');

	const config = loadConfig();
	const spec = genOpenapiSpec(config, true);

	writeFileSync('./built/api.json', JSON.stringify(spec), 'utf-8');
}

main()
	.then(() => {
		// 生成完了後に依存モジュールのハンドルで待ち続けないよう、明示的に終了する。
		process.exit(0);
	})
	.catch((e) => {
		console.error(e);
		process.exit(1);
	});
