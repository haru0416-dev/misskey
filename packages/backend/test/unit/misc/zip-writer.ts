/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fc from 'fast-check';
import { ZipArchiveReader } from 'slacc';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { writeZip } from '@/misc/zip-writer.js';
import type { ZipEntry } from '@/misc/zip-writer.js';

// 自前の書き出しを、取り込み側 (slacc の ZipArchiveReader) だけでなく、別実装の unzip でも読めることで確かめる。
// 自分の reader とだけ照合すると、両者が同じ誤りを持っていても通ってしまう。
describe('misc:zip-writer', () => {
	let dir = '';
	let seq = 0;

	beforeAll(() => {
		dir = mkdtempSync(join(tmpdir(), 'zip-writer-'));
	});

	afterAll(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	async function roundTrip(entries: ZipEntry[]): Promise<string> {
		const zipPath = join(dir, `${seq++}.zip`);
		await writeZip(zipPath, entries);
		return zipPath;
	}

	function assertReadable(zipPath: string, entries: ZipEntry[]): void {
		// unzip -t は各エントリを展開して CRC まで検査し、壊れていれば非 0 で終わる。
		execFileSync('unzip', ['-tq', zipPath]);
		const reader = ZipArchiveReader.fromBuffer(readFileSync(zipPath));
		for (const entry of entries) {
			const expected = Buffer.from(entry.data);
			expect(reader.readFile(entry.name, expected.length + 1)).toStrictEqual(expected);
		}
		// unzip へ名前を引数で渡すと、非 ASCII の名前の照合が unzip の版・ロケールで変わる (CI の Ubuntu 24.04 は
		// 照合できない)。名前を渡さず全エントリを書いた順に連結して取り出し、内容を比べる。
		expect(execFileSync('unzip', ['-p', zipPath])).toStrictEqual(Buffer.concat(entries.map((entry) => entry.data)));
	}

	test('空・複数ブロックにまたがる大きさ・UTF-8 の名前を書いて読める', async () => {
		const entries: ZipEntry[] = [
			{ name: 'empty.bin', data: new Uint8Array(0) },
			// deflate の無圧縮ブロックは 65535 バイトごとに分かれる。境界をまたぐ大きさにする。
			{ name: 'large.bin', data: Buffer.alloc(200_000, 7) },
			{ name: 'meta.json', data: Buffer.from(JSON.stringify({ emojis: [] })) },
			{ name: '絵文字.png', data: Buffer.from('89504e470d0a1a0a', 'hex') },
		];
		assertReadable(await roundTrip(entries), entries);
	});

	test('任意の内容の組を書いても同じ内容で読める', async () => {
		let checked = 0;
		await fc.assert(
			fc.asyncProperty(
				fc.uniqueArray(
					fc.record({
						name: fc.stringMatching(/^[a-z0-9_]{1,24}\.(png|gif|json)$/),
						data: fc.uint8Array({ maxLength: 70_000 }),
					}),
					{ minLength: 1, maxLength: 6, selector: (entry) => entry.name },
				),
				async (entries) => {
					assertReadable(await roundTrip(entries), entries);
					checked++;
				},
			),
			{ numRuns: 40 },
		);
		// 生成が偏って本体に届かないまま通ることを防ぐ。
		expect(checked).toBe(40);
	});

	test('途中で失敗したら止まらずに投げる', async () => {
		async function* failing(): AsyncGenerator<ZipEntry> {
			yield { name: 'a.bin', data: new Uint8Array([1, 2, 3]) };
			throw new Error('source failed');
		}
		await expect(writeZip(join(dir, 'failing.zip'), failing())).rejects.toThrow('source failed');
	});
});
