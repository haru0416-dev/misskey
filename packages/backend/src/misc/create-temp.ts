/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function makeCleanup(dir: string): () => void {
	// 本番環境以外ではデバッグ用に一時ファイルを残す。
	if (process.env['NODE_ENV'] !== 'production') return () => {};
	return () => {
		rm(dir, { recursive: true, force: true }).catch(() => {});
	};
}

export async function createTemp(): Promise<[string, () => void]> {
	const dir = await mkdtemp(join(tmpdir(), 'tmp-'));
	const path = join(dir, 'file');
	await writeFile(path, '');
	return [path, makeCleanup(dir)];
}

export async function createTempDir(): Promise<[string, () => void]> {
	const dir = await mkdtemp(join(tmpdir(), 'tmp-'));
	return [dir, makeCleanup(dir)];
}
