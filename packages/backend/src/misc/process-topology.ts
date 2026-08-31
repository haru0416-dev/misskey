/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as os from 'node:os';
import type { Config } from '@/config.js';
import { envOption } from '@/env.js';

export type HostProcessCounts = {
	/** HTTP を捌くプロセス数 */
	http: number;
	/** ジョブキューを捌くプロセス数 */
	queue: number;
	/** このホストで起動するプロセスの総数 */
	total: number;
};

/**
 * このホストで何プロセス起動するかを求める。
 *
 * プロセス配置 (boot/master.ts) と、1プロセスあたりのDBプール上限 (drizzle.ts / db/bun-sql.ts) の
 * 両方がこの数を必要とするので、二重に数えないようここへ集約する。
 *
 * `MK_ONLY_SERVER` / `MK_ONLY_QUEUE` は「このホストでは片方だけ動かす」指定として、
 * もう片方のプロセス数を 0 に落とす形で解釈する (HTTP用ホストとキュー用ホストの分離)。
 */
export function resolveHostProcessCounts(config: Config): HostProcessCounts {
	if (envOption.disableClustering) {
		// cluster 無効時はこのプロセス 1 つが両方を担う。
		return { http: envOption.onlyQueue ? 0 : 1, queue: envOption.onlyServer ? 0 : 1, total: 1 };
	}

	const limit = os.cpus().length;
	const requestedHttp = envOption.onlyQueue ? 0 : Math.min(config.server.process.httpWorkers, limit);
	const queue = envOption.onlyServer ? 0 : Math.min(config.server.process.queueWorkers, limit);
	// 両方 0 の場合も HTTP プロセスを 1 つ起動する。
	const http = requestedHttp === 0 && queue === 0 ? 1 : requestedHttp;

	// HTTP が 2 プロセス以上なら、listen せず fork 専任となるメインプロセスを加える。
	const forkOnlyMaster = http >= 2 ? 1 : 0;

	return { http, queue, total: http + queue + forkOnlyMaster };
}

/**
 * このプロセスが張ってよいDB接続数を求める。
 *
 * `maximumConnectionsPerHost` はホスト全体の予算なので、DBプールを持つプロセス数で割る。
 * fork専任のメインプロセスはDBを触らないので割る数から外れ、逆に cluster 無効時は
 * 1プロセスがHTTPとキューを兼ねる (プールも1つ) ので、その1つが予算を丸ごと使う。
 *
 * これを怠って各プロセスが上限いっぱい張ると、`httpWorkers: 3` + キュー1 で 30×4 = 120 接続を要求し、
 * PostgreSQL の既定 `max_connections = 100` に張り付いて溢れる (実測で確認済)。
 */
export function resolveDatabasePoolSize(config: Config): number {
	const counts = resolveHostProcessCounts(config);
	const databaseUsers = Math.max(Math.min(counts.http + counts.queue, counts.total), 1);
	return Math.max(Math.floor(config.database.pool.maximumConnectionsPerHost / databaseUsers), 1);
}
