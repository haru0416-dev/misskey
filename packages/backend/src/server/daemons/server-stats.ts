/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { globalEventBus } from '@/misc/global-event-bus.js';
import os from 'node:os';
import type { MiMeta } from '@/models/_.js';

const ev = globalEventBus;

const INTERVAL_MS = 2000;
const CPU_SAMPLE_MS = 1000;

const roundCpu = (num: number) => Math.round(num * 1000) / 1000;
const round = (num: number) => Math.round(num * 10) / 10;

function cpuTicks() {
	let idle = 0;
	let total = 0;
	for (const cpu of os.cpus()) {
		idle += cpu.times.idle;
		total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
	}
	return { idle, total };
}

/** os-utils の cpuUsage() 相当。CPU_SAMPLE_MS 間隔でtickを2回サンプリングし、idle以外の割合を返す。 */
function cpuUsage(): Promise<number> {
	const start = cpuTicks();
	return new Promise((resolve) => {
		setTimeout(() => {
			const end = cpuTicks();
			const idleDelta = end.idle - start.idle;
			const totalDelta = end.total - start.total;
			resolve(totalDelta === 0 ? 0 : 1 - idleDelta / totalDelta);
		}, CPU_SAMPLE_MS);
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

/** ServerStatsService.start 相当。サーバーのCPU/メモリ/ネットワーク/ディスク使用状況を定期的にglobalEventBus経由でブロードキャストする。 */
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
