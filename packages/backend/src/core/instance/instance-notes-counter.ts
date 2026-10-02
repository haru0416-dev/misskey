/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiInstance } from '@/models/Instance.js';
import { adjustInstanceNotesCountFromDatabase } from './InstanceStore.js';

/**
 * リモートの投稿数 (instance.notesCount) を、投稿のトランザクションの外でサーバーごとにまとめて反映する。
 * 同じサーバーからの投稿は同じ行を更新するので、トランザクションの中で +1 すると行ロックを確定まで持ち続け、
 * 並行した受信がここで直列になる。
 * 数は統計なので反映を遅延できる。終了時に flush を試みるが、強制終了では未反映の増分を失う。
 * DB 障害時は増分を戻して再試行するため、未反映期間は FLUSH_DELAY_MS より長くなり得る。
 */
const FLUSH_DELAY_MS = process.env['NODE_ENV'] === 'test' ? 0 : 5_000;

/** 反映に失敗したとき (DB の一時的な停止など) に、次を試すまでの間隔。 */
const RETRY_DELAY_MS = 10_000;

const pending = new Map<MiInstance['id'], number>();
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let flushDb: MiDrizzleDatabase | undefined;
let inflight: Promise<void> = Promise.resolve();

function scheduleFlush(): void {
	flushTimer ??= setTimeout(() => {
		flushTimer = undefined;
		// 失敗した増分は pending に戻っているので、次の反映をもう一度予約する。
		flushInstanceNoteCounts().catch(() => setTimeout(scheduleFlush, RETRY_DELAY_MS));
	}, FLUSH_DELAY_MS);
}

/** 投稿のトランザクションが確定した後に呼ぶ。 */
export function countInstanceNote(db: MiDrizzleDatabase, instanceId: MiInstance['id']): void {
	flushDb = db;
	pending.set(instanceId, (pending.get(instanceId) ?? 0) + 1);
	scheduleFlush();
}

/** たまっている増分を反映する。終了処理とテストから呼ぶ。失敗した増分は次の反映に回す。 */
export async function flushInstanceNoteCounts(): Promise<void> {
	if (flushTimer != null) {
		clearTimeout(flushTimer);
		flushTimer = undefined;
	}
	const db = flushDb;
	if (db == null || pending.size === 0) {
		return await inflight;
	}
	const entries = [...pending];
	pending.clear();
	const run = inflight.then(async () => {
		const results = await Promise.allSettled(
			entries.map(([id, delta]) => adjustInstanceNotesCountFromDatabase(db, id, delta)),
		);
		results.forEach((result, index) => {
			if (result.status === 'rejected') {
				const [id, delta] = entries[index]!;
				pending.set(id, (pending.get(id) ?? 0) + delta);
			}
		});
		const failed = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
		if (failed != null) throw failed.reason;
	});
	inflight = run.catch(() => {});
	await run;
}
