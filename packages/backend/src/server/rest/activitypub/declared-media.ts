/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { DeclaredRemoteFile } from '../drive/drive-file-upload.js';

const BASE83 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~';

// 前後の空白を除去した type/subtype だけを受け付ける (パラメータ付きや内部の空白は不可)。列は varchar(128)。
const MIME_PATTERN = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,62}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,62}$/;

// 画面の blurhash デコーダは形式の正しさを前提にするので、文字種と「先頭 1 文字が決める成分数」と全体の長さを照合する。
function isValidBlurhash(value: string): boolean {
	if (value.length < 6 || value.length > 4 + 2 * 81) return false;
	for (const char of value) {
		if (!BASE83.includes(char)) return false;
	}
	const size = BASE83.indexOf(value[0]!);
	const componentsX = (size % 9) + 1;
	const componentsY = Math.floor(size / 9) + 1;
	return value.length === 4 + 2 * componentsX * componentsY;
}

function dimension(value: unknown): number | null {
	return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 100_000 ? value : null;
}

/**
 * ActivityPub の Document が申告する種類・寸法・blurhash を検証して取り出す。種類が無いか不正なら null
 * (呼び出し元は中身を取得して判定する経路に戻す)。寸法と blurhash は不正なら捨てるだけにする。
 */
export function parseDeclaredMedia(document: {
	mediaType?: unknown;
	width?: unknown;
	height?: unknown;
	blurhash?: unknown;
}): DeclaredRemoteFile | null {
	if (typeof document.mediaType !== 'string') return null;
	const mime = document.mediaType.trim().toLowerCase();
	if (!MIME_PATTERN.test(mime)) return null;
	const width = dimension(document.width);
	const height = dimension(document.height);
	return {
		mime,
		width: width != null && height != null ? width : null,
		height: width != null && height != null ? height : null,
		blurhash: typeof document.blurhash === 'string' && isValidBlurhash(document.blurhash) ? document.blurhash : null,
	};
}
