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
		// zod 等が ESM 経由で `node:process` を import すると、facade 生成の副作用で
		// process.stdin が実体化され open socket として残り、プロセスが自然終了しない
		// (Node の既知の挙動)。明示的に exit してハングを防ぐ。
		process.exit(0);
	})
	.catch((e) => {
		console.error(e);
		process.exit(1);
	});
