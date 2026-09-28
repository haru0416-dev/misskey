/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { open } from 'node:fs/promises';
import { crc32, deflateRawSync } from 'node:zlib';

export type ZipEntry = {
	name: string;
	data: Uint8Array;
	modifiedAt?: Date;
};

const LOCAL_FILE_HEADER_SIGNATURE = 0x04_03_4b_50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02_01_4b_50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06_05_4b_50;
const VERSION_NEEDED = 20;
// 名前を UTF-8 で書いたことを示す (一般用途ビット 11)。
const FLAG_UTF8_NAME = 0x08_00;
const METHOD_DEFLATE = 8;
// ZIP64 を持たないので、各サイズ・位置・件数はこの範囲に収める。超えたら黙って壊さず失敗させる。
const MAX_UINT32 = 0xff_ff_ff_ff;
const MAX_UINT16 = 0xff_ff;

type CentralRecord = {
	name: Buffer;
	crc: number;
	compressedSize: number;
	size: number;
	time: number;
	date: number;
	offset: number;
};

function toDosDateTime(value: Date): { time: number; date: number } {
	// DOS 日付は 1980 年より前を表せない。
	const year = Math.max(value.getFullYear(), 1980);
	return {
		time: (value.getHours() << 11) | (value.getMinutes() << 5) | (value.getSeconds() >> 1),
		date: ((year - 1980) << 9) | ((value.getMonth() + 1) << 5) | value.getDate(),
	};
}

/**
 * entries を順に zip として outPath へ書く。本文は deflate の level 0 (実質無圧縮) で格納する。
 * 各本文とは別に、中央ディレクトリ用のファイル名とメタデータを件数分保持する。
 */
export async function writeZip(outPath: string, entries: Iterable<ZipEntry> | AsyncIterable<ZipEntry>): Promise<void> {
	const file = await open(outPath, 'w');
	try {
		const central: CentralRecord[] = [];
		let offset = 0;

		for await (const entry of entries) {
			const name = Buffer.from(entry.name, 'utf8');
			if (name.length > MAX_UINT16) {
				throw new Error(`zip entry name is too long: ${entry.name}`);
			}
			const compressed = deflateRawSync(entry.data, { level: 0 });
			if (entry.data.length > MAX_UINT32 || compressed.length > MAX_UINT32 || offset > MAX_UINT32) {
				throw new Error('zip exceeds the 4 GiB limit without ZIP64');
			}
			const { time, date } = toDosDateTime(entry.modifiedAt ?? new Date());
			const crc = crc32(entry.data);

			const header = Buffer.alloc(30);
			header.writeUInt32LE(LOCAL_FILE_HEADER_SIGNATURE, 0);
			header.writeUInt16LE(VERSION_NEEDED, 4);
			header.writeUInt16LE(FLAG_UTF8_NAME, 6);
			header.writeUInt16LE(METHOD_DEFLATE, 8);
			header.writeUInt16LE(time, 10);
			header.writeUInt16LE(date, 12);
			header.writeUInt32LE(crc, 14);
			header.writeUInt32LE(compressed.length, 18);
			header.writeUInt32LE(entry.data.length, 22);
			header.writeUInt16LE(name.length, 26);
			header.writeUInt16LE(0, 28);
			await file.write(header);
			await file.write(name);
			await file.write(compressed);

			central.push({ name, crc, compressedSize: compressed.length, size: entry.data.length, time, date, offset });
			offset += header.length + name.length + compressed.length;
		}

		if (central.length > MAX_UINT16) {
			throw new Error('zip has too many entries without ZIP64');
		}

		const centralStart = offset;
		for (const record of central) {
			const header = Buffer.alloc(46);
			header.writeUInt32LE(CENTRAL_DIRECTORY_SIGNATURE, 0);
			header.writeUInt16LE(VERSION_NEEDED, 4);
			header.writeUInt16LE(VERSION_NEEDED, 6);
			header.writeUInt16LE(FLAG_UTF8_NAME, 8);
			header.writeUInt16LE(METHOD_DEFLATE, 10);
			header.writeUInt16LE(record.time, 12);
			header.writeUInt16LE(record.date, 14);
			header.writeUInt32LE(record.crc, 16);
			header.writeUInt32LE(record.compressedSize, 20);
			header.writeUInt32LE(record.size, 24);
			header.writeUInt16LE(record.name.length, 28);
			header.writeUInt32LE(record.offset, 42);
			await file.write(header);
			await file.write(record.name);
			offset += header.length + record.name.length;
		}
		const centralSize = offset - centralStart;
		if (centralStart > MAX_UINT32 || centralSize > MAX_UINT32) {
			throw new Error('zip exceeds the 4 GiB limit without ZIP64');
		}

		const end = Buffer.alloc(22);
		end.writeUInt32LE(END_OF_CENTRAL_DIRECTORY_SIGNATURE, 0);
		end.writeUInt16LE(central.length, 8);
		end.writeUInt16LE(central.length, 10);
		end.writeUInt32LE(centralSize, 12);
		end.writeUInt32LE(centralStart, 16);
		await file.write(end);
	} finally {
		await file.close();
	}
}
