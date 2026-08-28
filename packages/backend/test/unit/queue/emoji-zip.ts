/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { execFileSync } from 'node:child_process';
import { createWriteStream, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ZipArchive } from 'archiver';
import { ZipReader } from 'slacc';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

/**
 * 絵文字パックの書き出し (archiver) と取り込み (slacc の ZipReader) の噛み合わせ。
 *
 * ZipReader は展開に要る deflate だけを積んでおり、bzip2 や lzma といった方式は
 * 持たない。自前の書き出しと一般的な zip が読めること、持たない方式は黙って
 * 壊れず明示的に失敗することを見る。
 */
describe('queue:emoji-zip', () => {
	let dir = '';
	const payload = Buffer.alloc(8192, 3);

	beforeAll(() => {
		dir = mkdtempSync(join(tmpdir(), 'emoji-zip-'));
		writeFileSync(join(dir, 'a.png'), payload);
		writeFileSync(join(dir, 'meta.json'), JSON.stringify({ emojis: [] }));
	});

	afterAll(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	const extractTo = (zipPath: string) => {
		const out = mkdtempSync(join(dir, 'out-'));
		ZipReader.withDestinationPath(out).viaBuffer(readFileSync(zipPath));
		return out;
	};

	test('書き出したパックをそのまま取り込める', async () => {
		// エクスポート側と同じ設定 (zlib level 0 = 無圧縮の deflate)。
		const zipPath = join(dir, 'exported.zip');
		const stream = createWriteStream(zipPath);
		const archive = new ZipArchive({ zlib: { level: 0 } });
		archive.pipe(stream);
		archive.file(join(dir, 'a.png'), { name: 'a.png' });
		archive.append(Buffer.from(JSON.stringify({ emojis: [] })), { name: 'meta.json' });
		await new Promise<void>((resolve) => {
			stream.on('close', () => resolve());
			void archive.finalize();
		});

		const out = extractTo(zipPath);
		expect(readdirSync(out).sort()).toStrictEqual(['a.png', 'meta.json']);
		expect(readFileSync(join(out, 'a.png'))).toStrictEqual(payload);
	});

	test('圧縮された一般的な zip も取り込める', () => {
		execFileSync('zip', ['-q', '-9', join(dir, 'deflated.zip'), 'a.png'], { cwd: dir });
		const out = extractTo(join(dir, 'deflated.zip'));
		expect(readFileSync(join(out, 'a.png'))).toStrictEqual(payload);
	});

	test('持っていない圧縮方式は明示的に失敗する', () => {
		execFileSync('zip', ['-q', '-Z', 'bzip2', join(dir, 'bzip2.zip'), 'a.png'], { cwd: dir });
		expect(() => extractTo(join(dir, 'bzip2.zip'))).toThrow(/compression method not supported/i);
	});
});
