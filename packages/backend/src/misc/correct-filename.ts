/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const targetExtsToSkip = new Set(['.gz', '.tar', '.tgz', '.bz2', '.xz', '.zip', '.7z']);

const extRegExp = /\.[0-9a-zA-Z]+$/;

/**
 * file-type が判定した拡張子をファイル名に補う。圧縮形式と PE の別名は既存名を優先し、
 * 判定結果が無い場合は既存の拡張子を維持する。
 */
export function correctFilename(filename: string, ext: string | null) {
	const dotExt = ext ? (ext[0] === '.' ? ext : `.${ext}`) : '.unknown';

	const match = extRegExp.exec(filename);
	if (!match || !match[0]) {
		return `${filename}${dotExt}`;
	}

	const filenameExt = match[0].toLowerCase();
	if (
		ext === null ||
		filenameExt === dotExt ||
		// JPEG と TIFF の同義拡張子は同一視する。
		(dotExt === '.jpg' && filenameExt === '.jpeg') ||
		(dotExt === '.tif' && filenameExt === '.tiff') ||
		// DLL と EXE は同じ Portable Executable 形式なので、判定結果だけでは区別できない。
		(dotExt === '.exe' && filenameExt === '.dll') ||
		// 圧縮形式と推定できる場合は拡張子を変更しない。
		// https://github.com/misskey-dev/misskey/issues/11482
		targetExtsToSkip.has(dotExt)
	) {
		return filename;
	}

	return `${filename}${dotExt}`;
}
