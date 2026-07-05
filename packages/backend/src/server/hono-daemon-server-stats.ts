/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import Xev from 'xev';
import * as osUtils from 'os-utils';
import type { MiMeta } from '@/models/_.js';

const ev = new Xev();

const INTERVAL_MS = 2000;

const roundCpu = (num: number) => Math.round(num * 1000) / 1000;
const round = (num: number) => Math.round(num * 10) / 10;

function cpuUsage(): Promise<number> {
	return new Promise(resolve => {
		osUtils.cpuUsage(usage => resolve(usage));
	});
}

async function mem() {
	const si = await import('systeminformation');
	return await si.mem();
}

async function net() {
	const si = await import('systeminformation');
	const iface = await si.networkInterfaceDefault();
	const data = await si.networkStats(iface);
	return data[0];
}

async function fs() {
	const si = await import('systeminformation');
	return await si.disksIO().catch(() => ({ rIO_sec: 0, wIO_sec: 0 }));
}

export type HonoDaemonServerStatsDependencies = {
	meta: Pick<MiMeta, 'enableServerMachineStats'>;
};

/** ServerStatsService.start 相当。サーバーのCPU/メモリ/ネットワーク/ディスク使用状況を定期的にXev経由でブロードキャストする。 */
export function startHonoServerStatsDaemon(deps: HonoDaemonServerStatsDependencies): { dispose: () => void } {
	if (!deps.meta.enableServerMachineStats) {
		return { dispose: () => {} };
	}

	const log: unknown[] = [];

	const onRequestLog = (x: { id: string; length?: number }) => {
		ev.emit(`serverStatsLog:${x.id}`, log.slice(0, x.length));
	};
	ev.on('requestServerStatsLog', onRequestLog);

	const tick = async () => {
		const [cpu, memStats, netStats, fsStats] = await Promise.all([cpuUsage(), mem(), net(), fs()]);

		const stats = {
			cpu: roundCpu(cpu),
			mem: {
				used: round(memStats.total - memStats.available),
				active: round(memStats.active),
			},
			net: {
				rx: round(Math.max(0, netStats?.rx_sec ?? 0)),
				tx: round(Math.max(0, netStats?.tx_sec ?? 0)),
			},
			fs: {
				r: round(Math.max(0, fsStats.rIO_sec ?? 0)),
				w: round(Math.max(0, fsStats.wIO_sec ?? 0)),
			},
		};
		ev.emit('serverStats', stats);
		log.unshift(stats);
		if (log.length > 200) log.pop();
	};

	void tick();
	const intervalId = setInterval(() => void tick(), INTERVAL_MS);

	return {
		dispose: () => {
			clearInterval(intervalId);
			ev.off('requestServerStatsLog', onRequestLog);
		},
	};
}
