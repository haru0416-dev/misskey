/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs';
import * as Path from 'node:path';
import type { Config } from '@/config.js';

export function createInternalStorageService(config: Config) {
	const path = Path.resolve(config.rootDir, 'files');

	function resolvePath(key: string) {
		return Path.resolve(path, key);
	}

	function read(key: string) {
		return fs.createReadStream(resolvePath(key));
	}

	function saveFromPath(key: string, srcPath: string) {
		fs.mkdirSync(path, { recursive: true });
		fs.copyFileSync(srcPath, resolvePath(key));
		return `${config.url}/files/${key}`;
	}

	function saveFromBuffer(key: string, data: Buffer) {
		fs.mkdirSync(path, { recursive: true });
		fs.writeFileSync(resolvePath(key), data);
		return `${config.url}/files/${key}`;
	}

	async function del(key: string): Promise<void> {
		try {
			await fs.promises.unlink(resolvePath(key));
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
		}
	}

	return { resolvePath, read, saveFromPath, saveFromBuffer, del };
}

export type InternalStorageService = ReturnType<typeof createInternalStorageService>;
