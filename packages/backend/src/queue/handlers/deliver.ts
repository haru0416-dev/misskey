/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Bull from 'bullmq';
import { fetchInstanceMetadataWithSideEffects } from '@/core/instance/FetchInstanceMetadataLogic.js';
import { listSuspendedInstancesFromDatabase } from '@/core/instance/InstanceStore.js';
import type { HttpRequestService } from '@/core/net/HttpRequestService.js';
import { MemorySingleCache } from '@/misc/cache.js';
import { StatusError } from '@/misc/status-error.js';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiMeta } from '@/models/_.js';
import type { DeliverJobData } from '@/queue/types.js';
import { fetchUserByIdFromDatabase } from '@/core/user/UserStore.js';
import MisskeyLogger from '@/logger.js';
import { isFederationAllowedUri, signedPostForApi } from '@/server/rest/activitypub/ap-resolve.js';
import {
	fetchFederatedInstance,
	fetchOrRegisterFederatedInstance,
	isDeliverSuspendedSoftware,
	toPuny,
	tryLockFetchInstanceMetadata,
	unlockFetchInstanceMetadata,
	updateFederatedInstance,
} from '@/server/rest/activitypub/federation.js';
import type { ChartWriters } from '../../server/chart-runtime.js';

export type QueueDeliverDependencies = {
	config: Pick<Config, 'instance' | 'runtime'>;
	db: MiDrizzleDatabase;
	meta: Pick<
		MiMeta,
		| 'enableStatsForFederatedInstances'
		| 'enableChartsForFederatedInstances'
		| 'federation'
		| 'federationHosts'
		| 'blockedHosts'
		| 'deliverSuspendedSoftware'
	>;
	redis: Pick<import('ioredis').Redis, 'set' | 'del'>;
	httpRequestService: Pick<HttpRequestService, 'getJson' | 'getHtml' | 'send'>;
	chartWriters: Pick<ChartWriters, 'instanceChart' | 'apRequestChart' | 'federationChart'>;
};

// キュー処理関数はプロセスごとに1つだけ生成されるため、停止ホストキャッシュをモジュールスコープで共有する。
// Set<string> で保持し、ジョブ毎の .map().includes() (配列再構築+線形探索) を避けてO(1)判定にする。
const suspendedHostsCache = new MemorySingleCache<Set<string>>(1000 * 60 * 60);

// 配送後のインスタンス情報更新は非同期のため、失敗を unhandled rejection にしない。
const logger = new MisskeyLogger('queue').createSubLogger('deliver');
const logBackgroundInstanceUpdateError = (error: unknown): void => {
	logger.error('background federated-instance update failed', { error });
};

export async function handleQueueDeliver(
	deps: QueueDeliverDependencies,
	job: Bull.Job<DeliverJobData>,
): Promise<string> {
	if (job.data.userStateGuard != null) {
		const guard = job.data.userStateGuard;
		const guardedUser = await fetchUserByIdFromDatabase(deps.db, guard.userId);
		if (
			guardedUser == null ||
			guardedUser.isSuspended !== guard.isSuspended ||
			guardedUser.suspensionTransitionId !== guard.transitionId
		) {
			return 'skip (stale user state)';
		}
	}
	const { host } = new URL(job.data.to);

	if (!isFederationAllowedUri(deps.config, deps.meta, job.data.to)) {
		return 'skip (blocked)';
	}

	// isSuspendedなら中断
	let suspendedHosts = suspendedHostsCache.get();
	if (suspendedHosts == null) {
		suspendedHosts = new Set((await listSuspendedInstancesFromDatabase(deps.db)).map((x) => x.host));
		suspendedHostsCache.set(suspendedHosts);
	}
	if (suspendedHosts.has(toPuny(host))) {
		return 'skip (suspended)';
	}

	const i = await (deps.meta.enableStatsForFederatedInstances
		? fetchOrRegisterFederatedInstance(deps, host)
		: fetchFederatedInstance(deps, host));

	if (i != null && isDeliverSuspendedSoftware(deps.meta, i)) {
		return 'skip (software suspended)';
	}

	try {
		await signedPostForApi(deps, job.data.user, job.data.to, job.data.content, job.data.digest);

		void deps.chartWriters.apRequestChart.deliverSucc();
		void deps.chartWriters.federationChart.deliverd(host, true);

		process.nextTick(
			() =>
				void (async () => {
					if (i == null) return;

					if (i.isNotResponding) {
						await updateFederatedInstance(deps, i.id, {
							isNotResponding: false,
							notRespondingSince: null,
						});
					}

					if (deps.meta.enableStatsForFederatedInstances) {
						await fetchInstanceMetadataWithSideEffects(
							{
								httpRequestService: deps.httpRequestService,
								logger: { error: () => {}, info: () => {} },
								tryLock: (h) => tryLockFetchInstanceMetadata(deps, h),
								unlock: (h) => unlockFetchInstanceMetadata(deps, h),
								fetchOrRegisterInstance: (h) => fetchOrRegisterFederatedInstance(deps, h),
								updateInstance: (id, updates) => updateFederatedInstance(deps, id, updates).then(() => {}),
							},
							i,
						);
					}

					if (deps.meta.enableChartsForFederatedInstances) {
						void deps.chartWriters.instanceChart.requestSent(i.host, true);
					}
				})().catch(logBackgroundInstanceUpdateError),
		);

		return 'Success';
	} catch (res) {
		void deps.chartWriters.apRequestChart.deliverFail();
		void deps.chartWriters.federationChart.deliverd(host, false);

		fetchOrRegisterFederatedInstance(deps, host)
			.then(async (i2) => {
				if (!i2.isNotResponding) {
					await updateFederatedInstance(deps, i2.id, {
						isNotResponding: true,
						notRespondingSince: new Date(),
					});
				} else if (i2.notRespondingSince) {
					if (
						i2.suspensionState === 'none' &&
						i2.notRespondingSince.getTime() <= Date.now() - 1000 * 60 * 60 * 24 * 7
					) {
						await updateFederatedInstance(deps, i2.id, {
							suspensionState: 'autoSuspendedForNotResponding',
						});
					}
				} else {
					// isNotResponding=true かつ notRespondingSince=NULL の既存行を許容する。
					await updateFederatedInstance(deps, i2.id, {
						notRespondingSince: new Date(),
					});
				}

				if (deps.meta.enableChartsForFederatedInstances) {
					void deps.chartWriters.instanceChart.requestSent(i2.host, false);
				}
			})
			.catch(logBackgroundInstanceUpdateError);

		if (res instanceof StatusError) {
			// 4xx
			if (!res.isRetryable) {
				// 相手が閉鎖していることを明示しているため、配送停止する
				if (job.data.isSharedInbox && res.statusCode === 410) {
					fetchOrRegisterFederatedInstance(deps, host)
						.then((i2) =>
							updateFederatedInstance(deps, i2.id, {
								suspensionState: 'goneSuspended',
							}),
						)
						.catch(logBackgroundInstanceUpdateError);
					throw new Bull.UnrecoverableError(`${host} is gone`);
				}
				throw new Bull.UnrecoverableError(`${res.statusCode} ${res.statusMessage}`);
			}

			// 5xx etc.
			throw new Error(`${res.statusCode} ${res.statusMessage}`, { cause: res });
		} else {
			// DNS エラー、ソケットエラー、タイムアウトなど。
			throw res;
		}
	}
}
