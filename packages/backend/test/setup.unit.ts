/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export default async function setup() {
	// DB のタイムゾーンに合わせてテスト側も UTC に設定する。
	process.env['TZ'] = 'UTC';
	process.env['NODE_ENV'] = 'test';

	const { initTestDb } = await import('./utils.js');
	const db = await initTestDb();
	await db.destroy();
}
