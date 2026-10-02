/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Bull from 'bullmq';
import { fetchInstanceMetadataWithSideEffects } from '@/core/instance/fetch-instance-metadata-logic.js';
import type { HttpRequestService } from '@/core/net/http-request-service.js';
import { StatusError } from '@/misc/status-error.js';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiMeta } from '@/models/_.js';
import type { DeliverJobData } from '@/core/queue/types.js';
import { fetchUserByIdFromDatabase } from '@/core/user/user-store.js';
import { fetchFollowingByFollowerIdAndFolloweeIdFromDatabase } from '@/core/user/following-store.js';
import MisskeyLogger from '@/logger.js';
import { isFederationAllowedUri, signedPost } from '@/server/rest/activitypub/ap-resolve.js';
import {
	fetchFederatedInstance,
	fetchOrRegisterFederatedInstance,
	isDeliverSuspendedSoftware,
	tryLockFetchInstanceMetadata,
	unlockFetchInstanceMetadata,
	updateFederatedInstance,
} from '@/server/rest/activitypub/federation.js';
import type { ChartWriters } from '../../core/chart/chart-runtime.js';

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

// 配送後のインスタンス情報更新は非同期のため、失敗を unhandled rejection にしない。
const logger = new MisskeyLogger('queue').createSubLogger('deliver');
const logBackgroundInstanceUpdateError = (error: unknown): void => {
	logger.error('background federated-instance update failed', { error });
};

export async function handleQueueDeliver(deps: QueueDeliverDependencies, data: DeliverJobData): Promise<string> {
	if (data.userStateGuard != null) {
		const guard = data.userStateGuard;
		const guardedUser = await fetchUserByIdFromDatabase(deps.db, guard.userId);
		if (
			guardedUser == null ||
			guardedUser.isSuspended !== guard.isSuspended ||
			guardedUser.suspensionTransitionId !== guard.transitionId
		) {
			return 'skip (stale user state)';
		}
	}
	if (data.followStateGuard != null) {
		const guard = data.followStateGuard;
		const relationship = await fetchFollowingByFollowerIdAndFolloweeIdFromDatabase(
			deps.db,
			guard.followerId,
			guard.followeeId,
		);
		if (relationship?.id !== guard.followingId) return 'skip (stale follow acceptance)';
	}
	const { host } = new URL(data.to);

	if (!isFederationAllowedUri(deps.config, deps.meta, data.to)) {
		return 'skip (blocked)';
	}

	const i = await (deps.meta.enableStatsForFederatedInstances
		? fetchOrRegisterFederatedInstance(deps, host)
		: fetchFederatedInstance(deps, host));

	if (i != null && i.suspensionState !== 'none') {
		return 'skip (suspended)';
	}

	if (i != null && isDeliverSuspendedSoftware(deps.meta, i)) {
		return 'skip (software suspended)';
	}

	try {
		await signedPost(deps, data.user, data.to, data.content, data.digest);

		void deps.chartWriters.apRequestChart.deliverSucc();
		void deps.chartWriters.federationChart.deliverd(host, true);

		process.nextTick(
			() =>
				void (async () => {
					if (i == null) {
						return;
					}

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
			if (!res.isRetryable) {
				// 共有 inbox が 410 を返したホストは、後続の配送を抑止するため停止状態にする。
				if (data.isSharedInbox && res.statusCode === 410) {
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

			throw new Error(`${res.statusCode} ${res.statusMessage}`, { cause: res });
		} else {
			throw res;
		}
	}
}
