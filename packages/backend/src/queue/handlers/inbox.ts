/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { verifyRequestSignature } from '@/core/activitypub/http-signature.js';
import * as Bull from 'bullmq';
import { createJsonLd, JsonLdError } from '@/core/activitypub/json-ld.js';
import { getApId, isActor, isDelete } from '@/core/activitypub/type.js';
import type { IActivity } from '@/core/activitypub/type.js';
import { StatusError } from '@/misc/status-error.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { CollapsedQueue } from '@/misc/collapsed-queue.js';
import { fetchInstanceMetadataWithSideEffects } from '@/core/instance/fetch-instance-metadata-logic.js';
import type { InboxJobData } from '@/core/queue/types.js';
import {
	extractDbHost,
	fetchAuthUserFromKeyId,
	fetchUserFromApId,
	isFederationAllowedHost,
} from '@/server/rest/activitypub/ap-resolve.js';
import type { AuthUser } from '@/server/rest/activitypub/ap-resolve.js';
import { fetchAuthUserFromApId, resolvePerson } from '@/server/rest/activitypub/ap-person.js';
import {
	fetchFederatedInstance,
	fetchOrRegisterFederatedInstance,
	tryLockFetchInstanceMetadata,
	unlockFetchInstanceMetadata,
	updateFederatedInstance,
} from '@/server/rest/activitypub/federation.js';
import { performActivity } from '../../server/activitypub/inbox-dispatch.js';
import type { InboxDispatchDependencies } from '../../server/activitypub/inbox-dispatch.js';

export type QueueInboxDependencies = InboxDispatchDependencies;

type UpdateInstanceJob = {
	latestRequestReceivedAt: Date;
	shouldUnsuspend: boolean;
};

function collapseUpdateInstanceJobs(oldJob: UpdateInstanceJob, newJob: UpdateInstanceJob): UpdateInstanceJob {
	return {
		latestRequestReceivedAt:
			oldJob.latestRequestReceivedAt < newJob.latestRequestReceivedAt
				? newJob.latestRequestReceivedAt
				: oldJob.latestRequestReceivedAt,
		shouldUnsuspend: oldJob.shouldUnsuspend || newJob.shouldUnsuspend,
	};
}

// インスタンスごとに最初の更新から 5 分間の要求をプロセス内で集約する（テストでは遅延なし）。
// キューは初回の deps を保持するため、同じプロセス内では同じ DB 接続を使う必要がある。
let updateInstanceQueue: CollapsedQueue<string, UpdateInstanceJob> | undefined;

function getUpdateInstanceQueue(deps: QueueInboxDependencies): CollapsedQueue<string, UpdateInstanceJob> {
	if (!updateInstanceQueue) {
		const timeout = process.env['NODE_ENV'] !== 'test' ? 60 * 1000 * 5 : 0;
		updateInstanceQueue = new CollapsedQueue<string, UpdateInstanceJob>(
			timeout,
			collapseUpdateInstanceJobs,
			async (id, job) => {
				await updateFederatedInstance(deps, id, {
					latestRequestReceivedAt: job.latestRequestReceivedAt,
					isNotResponding: false,
					// 応答不能による自動停止は、受信成功時に解除する。
					...(job.shouldUnsuspend ? { suspensionState: 'none' as const } : {}),
				});
			},
			(error, id) =>
				deps.logger.error(
					`Failed to update federated instance ${id}`,
					error instanceof Error ? error : new Error(String(error)),
				),
		);
	}
	return updateInstanceQueue;
}

/** テストから更新キューを明示的にflushするために公開する。 */
export async function flushQueueInboxUpdateInstanceQueue(): Promise<void> {
	await updateInstanceQueue?.performAllNow();
}

async function verifyAndResolveAuthUser(
	deps: QueueInboxDependencies,
	data: InboxJobData,
): Promise<{ authUser: AuthUser; activity: IActivity } | string> {
	const signature = data.signature;
	let activity = data.activity;

	// actor の欠落は再試行で回復しないため、getApId() の通常エラーではなく再試行不能なエラーにする。
	if (activity.actor == null) {
		throw new Bull.UnrecoverableError('skip: activity has no actor');
	}

	{
		let userExistenceCheckApId: string | null = null;

		// object が Actor、または actor と同一 ID の Delete は、対象ユーザーが存在するときだけ処理する。
		if (
			isDelete(activity) &&
			typeof activity.object === 'object' &&
			(isActor(activity.object) || getApId(activity.actor) === getApId(activity.object))
		) {
			userExistenceCheckApId = getApId(activity.object);
		}

		if (userExistenceCheckApId != null) {
			const user = await fetchUserFromApId(deps, userExistenceCheckApId);
			if (user == null) {
				return `skip: user not found for delete activity. ${getApId(userExistenceCheckApId)}`;
			}
		}
	}

	let authUser: AuthUser | null = await fetchAuthUserFromKeyId(deps, signature.keyId);

	if (authUser == null) {
		try {
			authUser = await fetchAuthUserFromApId(deps, getApId(activity.actor));
		} catch (err) {
			if (err instanceof StatusError) {
				if (!err.isRetryable) {
					throw new Bull.UnrecoverableError(
						`skip: Ignored deleted actors on both ends ${getApId(activity.actor)} - ${err.statusCode}`,
					);
				}
				throw new Error(`Error in actor ${getApId(activity.actor)} - ${err.statusCode}`, { cause: err });
			}
			throw err;
		}
	}

	if (authUser == null) {
		throw new Bull.UnrecoverableError(`skip: failed to resolve user ${getApId(activity.actor)}`);
	}

	if (authUser.key == null) {
		throw new Bull.UnrecoverableError(`skip: failed to resolve user publicKey ${getApId(activity.actor)}`);
	}

	const httpSignatureValidated = await verifyRequestSignature(signature, authUser.key.keyPem);

	// HTTP Signature の署名者は activity.actor と一致しなければならない。
	if (!httpSignatureValidated || authUser.user.uri !== getApId(activity.actor)) {
		// HTTP Signature が不一致でも LD Signature があれば検証する。
		const ldSignature = activity.signature;
		if (!ldSignature) {
			throw new Bull.UnrecoverableError(
				`skip: http-signature verification failed and no LD-Signature. keyId=${signature.keyId}`,
			);
		}

		if (ldSignature.type !== 'RsaSignature2017') {
			throw new Bull.UnrecoverableError(`skip: unsupported LD-signature type ${ldSignature.type}`);
		}

		// 公開鍵が未登録でも検証できるよう、creator のフラグメントを除いた Person の解決を試みる。
		if (ldSignature.creator) {
			const candicate = ldSignature.creator.replace(/#.*/, '');
			await resolvePerson(deps, candicate).catch(() => null);
		}

		authUser = await fetchAuthUserFromKeyId(deps, ldSignature.creator);
		if (authUser == null) {
			throw new Bull.UnrecoverableError('skip: LD-Signatureのユーザーが取得できませんでした');
		}

		if (authUser.key == null) {
			throw new Bull.UnrecoverableError('skip: LD-SignatureのユーザーはpublicKeyを持っていませんでした');
		}

		const jsonLd = createJsonLd(deps.httpRequestService);

		delete activity.signature;
		try {
			activity = (await jsonLd.compact(activity)) as IActivity;
		} catch (error) {
			throw new Bull.UnrecoverableError(`skip: failed to compact activity: ${error}`);
		}
		try {
			jsonLd.checkForForbiddenDirectives(activity);
		} catch (error) {
			throw new Bull.UnrecoverableError(`skip: ${error}`);
		}

		activity.signature = ldSignature;

		jsonLd.freeze();

		try {
			const verified = await jsonLd.verifyRsaSignature2017(activity, authUser.key.keyPem);
			if (!verified) {
				throw new Bull.UnrecoverableError('skip: LD-Signatureの検証に失敗しました');
			}
		} catch (error) {
			if (error instanceof JsonLdError) {
				throw new Bull.UnrecoverableError(`skip: encountered a JSON-LD error while verifying signature: ${error}`);
			}
			throw error;
		}

		// LD Signature の署名者も activity.actor と一致しなければならない。
		if (authUser.user.uri !== getApId(activity.actor)) {
			throw new Bull.UnrecoverableError(
				`skip: LD-Signature user(${authUser.user.uri}) !== activity.actor(${getApId(activity.actor)})`,
			);
		}

		const ldHost = extractDbHost(authUser.user.uri);
		if (!isFederationAllowedHost(deps.config, deps.meta, ldHost)) {
			throw new Bull.UnrecoverableError(`Blocked request: ${ldHost}`);
		}
	}

	// activity.id のホストは署名者のホストと一致しなければならない。
	if (typeof activity.id === 'string') {
		const signerHost = extractDbHost(authUser.user.uri!);
		const activityIdHost = extractDbHost(activity.id);
		if (signerHost !== activityIdHost) {
			throw new Bull.UnrecoverableError(`skip: signerHost(${signerHost}) !== activity.id host(${activityIdHost}`);
		}
	} else {
		throw new Bull.UnrecoverableError('skip: activity id is not a string');
	}

	return { authUser, activity };
}

export async function handleQueueInbox(deps: QueueInboxDependencies, data: InboxJobData): Promise<string> {
	// 一覧の照合はポート付きの項目 (許可リストの `host:port`) も扱うので、ポート込みのホストで判定する。
	const host = extractDbHost(data.signature.keyId);
	if (!isFederationAllowedHost(deps.config, deps.meta, host)) {
		return `Blocked request: ${host}`;
	}

	const keyIdLower = data.signature.keyId.toLowerCase();
	if (keyIdLower.startsWith('acct:')) {
		return `Old keyId is no longer supported. ${keyIdLower}`;
	}

	const verified = await verifyAndResolveAuthUser(deps, data);
	if (typeof verified === 'string') {
		return verified;
	}
	const { authUser, activity } = verified;

	void deps.chartWriters.apRequestChart.inbox();
	void deps.chartWriters.federationChart.inbox(authUser.user.host!);

	// インスタンス情報の記録は受信処理を待たせず、失敗はログに残して受信結果と切り離す。
	process.nextTick(
		() =>
			void recordInboxInstance().catch((error: unknown) =>
				deps.logger.error(
					`Failed to record the instance of ${authUser.user.host}`,
					error instanceof Error ? error : new Error(String(error)),
				),
			),
	);
	async function recordInboxInstance(): Promise<void> {
		const i = deps.meta.enableStatsForFederatedInstances
			? await fetchOrRegisterFederatedInstance(deps, authUser.user.host!)
			: await fetchFederatedInstance(deps, authUser.user.host!);

		if (i == null) {
			return;
		}

		getUpdateInstanceQueue(deps).enqueue(i.id, {
			latestRequestReceivedAt: new Date(),
			shouldUnsuspend: i.suspensionState === 'autoSuspendedForNotResponding',
		});

		if (deps.meta.enableChartsForFederatedInstances) {
			void deps.chartWriters.instanceChart.requestReceived(i.host);
		}

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

	try {
		const result = await performActivity(deps, authUser.user, activity);
		if (result && !result.startsWith('ok')) {
			return result;
		}
	} catch (e) {
		if (e instanceof IdentifiableError) {
			switch (e.id) {
				case '689ee33f-f97c-479a-ac49-1b9f8140af99':
					return 'blocked notes with prohibited words';
				case '85ab9bd7-3a41-4530-959d-f07073900109':
					return 'actor has been suspended';
				case 'd450b8a9-48e4-4dab-ae36-f4db763fda7c':
					return e.message;
				case '9f466dab-c856-48cd-9e65-ff90ff750580':
					return 'note contains too many mentions';
				case '09d79f9e-64f1-4316-9cfa-e75c4d091574':
					return 'skip: blocked instance';
			}
		}
		throw e;
	}
	return 'ok';
}
