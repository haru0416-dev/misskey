/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const MAX_NOTE_TEXT_LENGTH = 3000;

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export const USER_ONLINE_THRESHOLD = 1000 * 60 * 10;
const USER_ACTIVE_THRESHOLD = 1000 * 60 * 60 * 24 * 3;

export const PER_NOTE_REACTION_USER_PAIR_CACHE_MAX = 16;

// DB_* の値は DB スキーマと一致させる。

/**
 * DB に保存できるノート本文の最大文字数。サロゲートペアは1文字として数える。
 */
export const DB_MAX_NOTE_TEXT_LENGTH = 8192;

/**
 * DB に保存できる画像説明文の最大文字数。サロゲートペアは1文字として数える。
 */
export const DB_MAX_IMAGE_COMMENT_LENGTH = 512;

export const FILE_TYPE_IMAGE = [
	'image/png',
	'image/gif',
	'image/jpeg',
	'image/webp',
	'image/avif',
	'image/apng',
	'image/bmp',
	'image/tiff',
	'image/x-icon',
];

// ブラウザで直接表示することを許可するファイルの種類のリスト
// ここに含まれないものは application/octet-stream としてレスポンスされる
// SVGはXSSを生むので許可しない
export const FILE_TYPE_BROWSERSAFE = [
	// 画像
	'image/png',
	'image/gif',
	'image/jpeg',
	'image/webp',
	'image/avif',
	'image/apng',
	'image/bmp',
	'image/tiff',
	'image/x-icon',

	// OggS
	'audio/opus',
	'video/ogg',
	'audio/ogg',
	'application/ogg',

	// ISO/IEC base media file format
	'video/quicktime',
	'video/mp4',
	'audio/mp4',
	'video/x-m4v',
	'audio/x-m4a',
	'video/3gpp',
	'video/3gpp2',

	'video/mpeg',
	'audio/mpeg',

	'video/webm',
	'audio/webm',

	'audio/aac',

	// https://github.com/misskey-dev/misskey/pull/10686
	'audio/flac',
	'audio/wav',
];
/*
https://github.com/sindresorhus/file-type/blob/main/supported.js
https://github.com/sindresorhus/file-type/blob/main/core.js
https://developer.mozilla.org/en-US/docs/Web/Media/Formats/Containers
*/
