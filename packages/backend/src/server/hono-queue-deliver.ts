/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Bull from 'bullmq';
import { fetchInstanceMetadataWithSideEffects } from '@/core/FetchInstanceMetadataLogic.js';
import { listSuspendedInstancesFromDatabase } from '@/core/InstanceStore.js';
import type { HttpRequestService } from '@/core/HttpRequestService.js';
import { MemorySingleCache } from '@/misc/cache.js';
import { StatusError } from '@/misc/status-error.js';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiInstance } from '@/models/Instance.js';
import type { MiMeta } from '@/models/_.js';
import type { DeliverJobData } from '@/queue/types.js';
import { isFederationAllowedUri, signedPostForHonoApi } from './hono-api-ap-resolve.js';
import {
	fetchFederatedInstance,
	fetchOrRegisterFederatedInstance,
	isDeliverSuspendedSoftware,
	toPuny,
	tryLockFetchInstanceMetadata,
	unlockFetchInstanceMetadata,
	updateFederatedInstanceAndCache,
} from './hono-api-federation.js';
import type { HonoChartWriters } from './hono-chart-runtime.js';

export type HonoQueueDeliverDependencies = {
	config: Pick<Config, 'id' | 'url' | 'host'>;
	db: MiDrizzleDatabase;
	meta: Pick<MiMeta, 'enableStatsForFederatedInstances' | 'enableChartsForFederatedInstances' | 'federation' | 'federationHosts' | 'blockedHosts' | 'deliverSuspendedSoftware'>;
	redis: Pick<import('ioredis').Redis, 'set' | 'del'>;
	httpRequestService: Pick<HttpRequestService, 'getJson' | 'getHtml' | 'send'>;
	chartWriters: Pick<HonoChartWriters, 'instanceChart' | 'apRequestChart' | 'federationChart'>;
};

// DeliverProcessorService はプロセス内に1インスタンスのみ生成される前提で
// suspendedHostsCache をインスタンスフィールドとして保持していた。Hono側では
// キュー処理関数自体がプロセスごとに1つしか生成されないため、モジュールスコープの
// シングルトンとして同じ役割を持たせる。
const suspendedHostsCache = new MemorySingleCache<MiInstance[]>(1000 * 60 * 60); // 1h

/** DeliverProcessorService.process 相当。 */
export async function handleHonoQueueDeliver(deps: HonoQueueDeliverDependencies, job: Bull.Job<DeliverJobData>): Promise<string> {
	const { host } = new URL(job.data.to);

	if (!isFederationAllowedUri(deps.config, deps.meta, job.data.to)) {
		return 'skip (blocked)';
	}

	// isSuspendedなら中断
	let suspendedHosts = suspendedHostsCache.get();
	if (suspendedHosts == null) {
		suspendedHosts = await listSuspendedInstancesFromDatabase(deps.db);
		suspendedHostsCache.set(suspendedHosts);
	}
	if (suspendedHosts.map(x => x.host).includes(toPuny(host))) {
		return 'skip (suspended)';
	}

	const i = await (deps.meta.enableStatsForFederatedInstances
		? fetchOrRegisterFederatedInstance(deps, host)
		: fetchFederatedInstance(deps, host));

	// suspend server by software
	if (i != null && isDeliverSuspendedSoftware(deps.meta, i)) {
		return 'skip (software suspended)';
	}

	try {
		await signedPostForHonoApi(deps, job.data.user, job.data.to, job.data.content, job.data.digest);

		void deps.chartWriters.apRequestChart.deliverSucc();
		void deps.chartWriters.federationChart.deliverd(host, true);

		// Update instance stats
		process.nextTick(async () => {
			if (i == null) return;

			if (i.isNotResponding) {
				await updateFederatedInstanceAndCache(deps, i.id, {
					isNotResponding: false,
					notRespondingSince: null,
				});
			}

			if (deps.meta.enableStatsForFederatedInstances) {
				await fetchInstanceMetadataWithSideEffects({
					httpRequestService: deps.httpRequestService,
					logger: { error: () => {}, info: () => {} },
					tryLock: h => tryLockFetchInstanceMetadata(deps, h),
					unlock: h => unlockFetchInstanceMetadata(deps, h),
					fetchOrRegisterInstance: h => fetchOrRegisterFederatedInstance(deps, h),
					updateInstance: (id, updates) => updateFederatedInstanceAndCache(deps, id, updates).then(() => {}),
				}, i);
			}

			if (deps.meta.enableChartsForFederatedInstances) {
				void deps.chartWriters.instanceChart.requestSent(i.host, true);
			}
		});

		return 'Success';
	} catch (res) {
		void deps.chartWriters.apRequestChart.deliverFail();
		void deps.chartWriters.federationChart.deliverd(host, false);

		// Update instance stats
		fetchOrRegisterFederatedInstance(deps, host).then(async i2 => {
			if (!i2.isNotResponding) {
				await updateFederatedInstanceAndCache(deps, i2.id, {
					isNotResponding: true,
					notRespondingSince: new Date(),
				});
			} else if (i2.notRespondingSince) {
				// 1週間以上不通ならサスペンド
				if (i2.suspensionState === 'none' && i2.notRespondingSince.getTime() <= Date.now() - (1000 * 60 * 60 * 24 * 7)) {
					await updateFederatedInstanceAndCache(deps, i2.id, {
						suspensionState: 'autoSuspendedForNotResponding',
					});
				}
			} else {
				// isNotRespondingがtrueでnotRespondingSinceがnullの場合はnotRespondingSinceをセット
				// notRespondingSinceは新たな機能なので、それ以前のデータにはnotRespondingSinceがない場合がある
				await updateFederatedInstanceAndCache(deps, i2.id, {
					notRespondingSince: new Date(),
				});
			}

			if (deps.meta.enableChartsForFederatedInstances) {
				void deps.chartWriters.instanceChart.requestSent(i2.host, false);
			}
		});

		if (res instanceof StatusError) {
			// 4xx
			if (!res.isRetryable) {
				// 相手が閉鎖していることを明示しているため、配送停止する
				if (job.data.isSharedInbox && res.statusCode === 410) {
					fetchOrRegisterFederatedInstance(deps, host).then(i2 => updateFederatedInstanceAndCache(deps, i2.id, {
						suspensionState: 'goneSuspended',
					}));
					throw new Bull.UnrecoverableError(`${host} is gone`);
				}
				throw new Bull.UnrecoverableError(`${res.statusCode} ${res.statusMessage}`);
			}

			// 5xx etc.
			throw new Error(`${res.statusCode} ${res.statusMessage}`);
		} else {
			// DNS error, socket error, timeout ...
			throw res;
		}
	}
}
