/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ZipArchiveReader } from 'slacc';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { writeZip } from '@/misc/zip-writer.js';

// 絵文字パックの書き出し (misc/zip-writer) と取り込み (slacc の ZipArchiveReader) の噛み合わせ。ZipArchiveReader は deflate
// だけを持ち bzip2 や lzma は持たないので、自前の書き出しと一般的な zip が読めることと、持たない方式が黙って壊れず
// 明示的に失敗することを見る。取り込みはアップロードされた zip を読むので、通常ファイル以外と上限超えも拒否する。
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

	const open = (zipPath: string) => ZipArchiveReader.fromBuffer(readFileSync(zipPath));
	const zipCli = (args: string[]) => execFileSync('zip', ['-q', ...args], { cwd: dir });

	test('書き出したパックをそのまま取り込める', async () => {
		// エクスポートと同じ書き出し (deflate の level 0 = 実質無圧縮)。
		const zipPath = join(dir, 'exported.zip');
		await writeZip(zipPath, [
			{ name: 'a.png', data: readFileSync(join(dir, 'a.png')) },
			{ name: 'meta.json', data: Buffer.from(JSON.stringify({ emojis: [] })) },
		]);

		const zip = open(zipPath);
		expect(zip.readFile('a.png', 1024 * 1024)).toStrictEqual(payload);
		expect(JSON.parse(zip.readFile('meta.json', 1024)!.toString('utf-8'))).toStrictEqual({ emojis: [] });
	});

	test('圧縮された一般的な zip も取り込める', () => {
		zipCli(['-9', 'deflated.zip', 'a.png']);
		expect(open(join(dir, 'deflated.zip')).readFile('a.png', 1024 * 1024)).toStrictEqual(payload);
	});

	test('持っていない圧縮方式は明示的に失敗する', () => {
		zipCli(['-Z', 'bzip2', 'bzip2.zip', 'a.png']);
		expect(() => open(join(dir, 'bzip2.zip')).readFile('a.png', 1024 * 1024)).toThrow(
			/compression method not supported/i,
		);
	});

	test('無いエントリは null を返す', () => {
		zipCli(['plain.zip', 'a.png']);
		expect(open(join(dir, 'plain.zip')).readFile('meta.json', 1024)).toBeNull();
	});

	// symlink のまま格納された meta.json を読ませると、展開していた頃はサーバー上の任意のファイルが取り込まれた。
	test('symlink のエントリは読まない', () => {
		symlinkSync('/etc/hostname', join(dir, 'link.json'));
		zipCli(['--symlinks', 'symlink.zip', 'link.json']);
		expect(() => open(join(dir, 'symlink.zip')).readFile('link.json', 1024 * 1024)).toThrow(/not a regular file/);
	});

	test('ディレクトリのエントリは読まない', () => {
		mkdirSync(join(dir, 'sub'));
		zipCli(['dir.zip', 'sub']);
		expect(() => open(join(dir, 'dir.zip')).readFile('sub/', 1024)).toThrow(/not a regular file/);
	});

	test('暗号化されたエントリは読まない', () => {
		zipCli(['-P', 'secret', 'encrypted.zip', 'a.png']);
		expect(() => open(join(dir, 'encrypted.zip')).readFile('a.png', 1024 * 1024)).toThrow(/password|encrypted/i);
	});

	test('上限を超えるエントリは読まない', () => {
		zipCli(['-9', 'large.zip', 'a.png']);
		const zip = open(join(dir, 'large.zip'));
		expect(() => zip.readFile('a.png', payload.length - 1)).toThrow(/too large/);
		expect(zip.readFile('a.png', payload.length)).toStrictEqual(payload);
	});
});
