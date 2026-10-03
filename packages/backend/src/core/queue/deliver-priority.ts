/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Bull from 'bullmq';
import type * as Redis from 'ioredis';
import type { DeliverJobBulkInput, DeliverJobData } from '@/core/queue/types.js';

/**
 * 宛先ホストへの投入が 10 分間途切れたら投入数を数え直す。リセット直後のジョブは
 * 同じホストの滞留を追い越し得るため、短い投入間隔ではリセットしない。
 * 10 分はデフォルトの起動上限 128 件/秒で 76,800 件を起動する時間に相当する。
 */
export const DELIVER_HOST_IDLE_RESET_MS = 10 * 60 * 1000;

// 優先度は 1 + floor(log2(投入数)) で、投入数が 2 倍になるごとに 1 段下がる (1 が最優先)。
// 後続の Delete が先行する Create を優先度だけで追い越さないよう、リセットまでは優先度を戻さない。
// 同じ優先度では BullMQ の投入順で起動するが、完了順は保証しない。整数の除算で浮動小数の丸めを避ける。
const RESERVE_SCRIPT = `
local idle = tonumber(ARGV[1])
local priorities = {}
for i, key in ipairs(KEYS) do
	local count = redis.call('INCRBY', key, tonumber(ARGV[i + 1]))
	redis.call('PEXPIRE', key, idle)
	local priority = 1
	while count >= 2 do
		count = math.floor(count / 2)
		priority = priority + 1
	end
	priorities[i] = priority
end
return priorities
`;

const COMMAND_NAME = 'tonerikoReserveDeliverPriorities';
type ReserveCommander = {
	[COMMAND_NAME]: (numberOfKeys: number, ...args: (string | number)[]) => Promise<number[]>;
};
const definedClients = new WeakSet<Redis.Redis>();

/** ioredis の defineCommand は EVALSHA を試して NOSCRIPT なら EVAL に切り替える。接続ごとに 1 度だけ登録する。 */
function commander(client: Redis.Redis): ReserveCommander {
	if (!definedClients.has(client)) {
		client.defineCommand(COMMAND_NAME, { lua: RESERVE_SCRIPT });
		definedClients.add(client);
	}
	return client as unknown as ReserveCommander;
}

/**
 * 配送の起動上限はキュー全体で共有されるため、1 ホスト宛ての大量投入が先に積まれると、
 * 後から来た他ホスト宛てがその滞留の後ろで待つ。投入時にホストへの投入数から優先度を付け、
 * 投入の少ないホスト宛てが滞留を追い越せるようにする。起動上限と総処理量は変えない。
 * 優先度なしのジョブは優先度付きより常に先に処理されるので、全投入経路をこのキューに通す。
 */
export class HostFairDeliverQueue extends Bull.Queue<DeliverJobData> {
	override async add(name: string, data: DeliverJobData, opts?: Bull.JobsOptions) {
		const [priority] = await this.reserveHostPriorities([data]);
		return await super.add(name, data, { ...opts, priority: priority! });
	}

	override async addBulk(jobs: DeliverJobBulkInput[]) {
		if (jobs.length === 0) return [];
		const priorities = await this.reserveHostPriorities(jobs.map((job) => job.data));
		return await super.addBulk(
			jobs.map((job, index) => ({ ...job, opts: { ...job.opts, priority: priorities[index]! } })),
		);
	}

	/** 同じ投入内の同一ホストはまとめて数え、同じ優先度にする。 */
	private async reserveHostPriorities(dataList: DeliverJobData[]): Promise<number[]> {
		const counts = new Map<string, number>();
		const hosts = dataList.map((data) => {
			const host = new URL(data.to).host;
			counts.set(host, (counts.get(host) ?? 0) + 1);
			return host;
		});
		const keys = [...counts.keys()];
		const client = (await this.getBackend().client) as unknown as Redis.Redis;
		const priorities = await commander(client)[COMMAND_NAME](
			keys.length,
			...keys.map((host) => this.toKey(`host-enqueued:${host}`)),
			DELIVER_HOST_IDLE_RESET_MS,
			...keys.map((host) => counts.get(host)!),
		);
		const byHost = new Map(keys.map((host, index) => [host, priorities[index]!]));
		return hosts.map((host) => byHost.get(host)!);
	}
}
