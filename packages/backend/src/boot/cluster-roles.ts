/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * fork したプロセスに「HTTPを捌くのかキューを捌くのか」「デーモンの持ち主か」を伝える。
 *
 * 以前は `MK_ONLY_SERVER` の有無だけで役割が決まっていたため、HTTPを複数プロセスにすると
 * キューを一切動かせなかった (master は fork しかせず、worker は全部 HTTP になる)。
 * 役割をプロセス単位で持たせることで「HTTP を N プロセス + キューを M プロセス」を表現できる。
 */
export type WorkerRole = 'server' | 'queue';

export type WorkerAssignment = {
	role: WorkerRole;
	/**
	 * queue-stats / server-stats デーモンをこのプロセスが持つか。
	 * どちらもホスト全体で1つあれば足り、複数プロセスで動かすと同じ統計が
	 * プロセス数ぶん重複して全ストリームへ配信されてしまう。
	 */
	ownsDaemons: boolean;
};

const ROLE_ENV = 'MK_WORKER_ROLE';
const DAEMONS_ENV = 'MK_WORKER_OWNS_DAEMONS';

/**
 * master が fork 済みワーカーへ割り当てた役割。
 * ワーカーが落ちて再 fork するときに同じ役割で復帰させるために保持する。
 */
export const assignmentByWorkerId = new Map<number, WorkerAssignment>();

export function workerEnvFor(assignment: WorkerAssignment): Record<string, string> {
	return {
		[ROLE_ENV]: assignment.role,
		...(assignment.ownsDaemons ? { [DAEMONS_ENV]: '1' } : {}),
	};
}

export function assignmentFromEnv(): WorkerAssignment {
	return {
		role: process.env[ROLE_ENV] === 'server' ? 'server' : 'queue',
		ownsDaemons: process.env[DAEMONS_ENV] === '1',
	};
}
