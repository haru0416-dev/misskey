/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { domainToASCII } from 'node:url';
import httpSignature from '@peertube/http-signature';
import * as Bull from 'bullmq';
import { JsonLd, JsonLdError } from '@/core/activitypub/JsonLdService.js';
import { getApId, isActor, isDelete } from '@/core/activitypub/type.js';
import type { IActivity } from '@/core/activitypub/type.js';
import { StatusError } from '@/misc/status-error.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { CollapsedQueue } from '@/misc/collapsed-queue.js';
import { fetchInstanceMetadataWithSideEffects } from '@/core/FetchInstanceMetadataLogic.js';
import type { InboxJobData } from '@/queue/types.js';
import {
	extractDbHost,
	getAuthUserFromKeyIdForHonoApi,
	getUserFromApIdForHonoApi,
	isFederationAllowedHost,
	type HonoApiAuthUser,
} from './hono-api-ap-resolve.js';
import { getAuthUserFromApIdForHonoApi, resolvePersonForHonoApi } from './hono-api-ap-person.js';
import {
	fetchFederatedInstance,
	fetchOrRegisterFederatedInstance,
	tryLockFetchInstanceMetadata,
	unlockFetchInstanceMetadata,
	updateFederatedInstanceAndCache,
} from './hono-api-federation.js';
import { performActivityForHonoApi, type HonoApiInboxDependencies } from './hono-ap-inbox.js';

export type HonoQueueInboxDependencies = HonoApiInboxDependencies;

function toPuny(host: string): string {
	return domainToASCII(host.toLowerCase());
}

type UpdateInstanceJob = {
	latestRequestReceivedAt: Date;
	shouldUnsuspend: boolean;
};

function collapseUpdateInstanceJobs(oldJob: UpdateInstanceJob, newJob: UpdateInstanceJob): UpdateInstanceJob {
	return {
		latestRequestReceivedAt: oldJob.latestRequestReceivedAt < newJob.latestRequestReceivedAt ? newJob.latestRequestReceivedAt : oldJob.latestRequestReceivedAt,
		shouldUnsuspend: oldJob.shouldUnsuspend || newJob.shouldUnsuspend,
	};
}

// 元実装 (InboxProcessorService) 同様、プロセス内シングルトンの CollapsedQueue で
// インスタンス更新をまとめて (5分間隔で) 反映する。deps は初回呼び出し時のものに固定されるが、
// db/redis 等の実体は起動時から不変のため問題ない。
let updateInstanceQueue: CollapsedQueue<string, UpdateInstanceJob> | undefined;

function getUpdateInstanceQueue(deps: HonoQueueInboxDependencies): CollapsedQueue<string, UpdateInstanceJob> {
	if (!updateInstanceQueue) {
		const timeout = process.env.NODE_ENV !== 'test' ? 60 * 1000 * 5 : 0;
		updateInstanceQueue = new CollapsedQueue<string, UpdateInstanceJob>(timeout, collapseUpdateInstanceJobs, async (id, job) => {
			await updateFederatedInstanceAndCache(deps, id, {
				latestRequestReceivedAt: new Date(),
				isNotResponding: false,
				// もしサーバーが死んでるために配信が止まっていた場合には自動的に復活させてあげる
				suspensionState: job.shouldUnsuspend ? 'none' : undefined,
			});
		});
	}
	return updateInstanceQueue;
}

/** InboxProcessorService.dispose 相当。テストでの明示的なflush用。 */
export async function flushHonoQueueInboxUpdateInstanceQueue(): Promise<void> {
	await updateInstanceQueue?.performAllNow();
}

async function verifyAndResolveAuthUser(deps: HonoQueueInboxDependencies, job: Bull.Job<InboxJobData>): Promise<{ authUser: HonoApiAuthUser; activity: IActivity } | string> {
	const signature = job.data.signature;
	let activity = job.data.activity;

	{
		let userExistenceCheckApId: string | null = null;

		// 存在しないActorに対するActorのDeleteアクティビティは無視する。
		// actorとobjectが同じならばそれはActorに違いない
		if (isDelete(activity) && typeof activity.object === 'object' && (isActor(activity.object) || getApId(activity.actor) === getApId(activity.object))) {
			userExistenceCheckApId = getApId(activity.object);
		}

		if (userExistenceCheckApId != null) {
			const user = await getUserFromApIdForHonoApi(deps, userExistenceCheckApId);
			if (user == null) {
				return `skip: user not found for delete activity. ${getApId(userExistenceCheckApId)}`;
			}
		}
	}

	// HTTP-Signature keyIdを元にDBから取得
	let authUser: HonoApiAuthUser | null = await getAuthUserFromKeyIdForHonoApi(deps, signature.keyId);

	// keyIdでわからなければ、activity.actorを元にDBから取得 || activity.actorを元にリモートから取得
	if (authUser == null) {
		try {
			authUser = await getAuthUserFromApIdForHonoApi(deps, getApId(activity.actor));
		} catch (err) {
			// 対象が4xxならスキップ
			if (err instanceof StatusError) {
				if (!err.isRetryable) {
					throw new Bull.UnrecoverableError(`skip: Ignored deleted actors on both ends ${getApId(activity.actor)} - ${err.statusCode}`);
				}
				throw new Error(`Error in actor ${getApId(activity.actor)} - ${err.statusCode}`);
			}
			throw err;
		}
	}

	// それでもわからなければ終了
	if (authUser == null) {
		throw new Bull.UnrecoverableError(`skip: failed to resolve user ${getApId(activity.actor)}`);
	}

	// publicKey がなくても終了
	if (authUser.key == null) {
		throw new Bull.UnrecoverableError(`skip: failed to resolve user publicKey ${getApId(activity.actor)}`);
	}

	// HTTP-Signatureの検証
	const httpSignatureValidated = httpSignature.verifySignature(signature, authUser.key.keyPem);

	// また、signatureのsignerは、activity.actorと一致する必要がある
	if (!httpSignatureValidated || authUser.user.uri !== getApId(activity.actor)) {
		// 一致しなくても、でもLD-Signatureがありそうならそっちも見る
		const ldSignature = activity.signature;
		if (!ldSignature) {
			throw new Bull.UnrecoverableError(`skip: http-signature verification failed and no LD-Signature. keyId=${signature.keyId}`);
		}

		if (ldSignature.type !== 'RsaSignature2017') {
			throw new Bull.UnrecoverableError(`skip: unsupported LD-signature type ${ldSignature.type}`);
		}

		// ldSignature.creator: https://example.oom/users/user#main-key
		// みたいになっててUserを引っ張れば公開キーも入ることを期待する
		if (ldSignature.creator) {
			const candicate = ldSignature.creator.replace(/#.*/, '');
			await resolvePersonForHonoApi(deps, candicate).catch(() => null);
		}

		// keyIdからLD-Signatureのユーザーを取得
		authUser = await getAuthUserFromKeyIdForHonoApi(deps, ldSignature.creator);
		if (authUser == null) {
			throw new Bull.UnrecoverableError('skip: LD-Signatureのユーザーが取得できませんでした');
		}

		if (authUser.key == null) {
			throw new Bull.UnrecoverableError('skip: LD-SignatureのユーザーはpublicKeyを持っていませんでした');
		}

		const jsonLd = new JsonLd(deps.httpRequestService);

		delete activity.signature;
		try {
			activity = await jsonLd.compact(activity) as IActivity;
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

		// LD-Signature検証
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

		// もう一度actorチェック
		if (authUser.user.uri !== getApId(activity.actor)) {
			throw new Bull.UnrecoverableError(`skip: LD-Signature user(${authUser.user.uri}) !== activity.actor(${getApId(activity.actor)})`);
		}

		const ldHost = extractDbHost(authUser.user.uri);
		if (!isFederationAllowedHost(deps.config, deps.meta, ldHost)) {
			throw new Bull.UnrecoverableError(`Blocked request: ${ldHost}`);
		}
	}

	// activity.idがあればホストが署名者のホストであることを確認する
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

/** InboxProcessorService.process 相当。 */
export async function handleHonoQueueInbox(deps: HonoQueueInboxDependencies, job: Bull.Job<InboxJobData>): Promise<string> {
	const host = toPuny(new URL(job.data.signature.keyId).hostname);
	if (!isFederationAllowedHost(deps.config, deps.meta, host)) {
		return `Blocked request: ${host}`;
	}

	const keyIdLower = job.data.signature.keyId.toLowerCase();
	if (keyIdLower.startsWith('acct:')) {
		return `Old keyId is no longer supported. ${keyIdLower}`;
	}

	const verified = await verifyAndResolveAuthUser(deps, job);
	if (typeof verified === 'string') return verified;
	const { authUser, activity } = verified;

	void deps.chartWriters.apRequestChart.inbox();
	void deps.chartWriters.federationChart.inbox(authUser.user.host!);

	// Update instance stats
	process.nextTick(async () => {
		const i = deps.meta.enableStatsForFederatedInstances
			? await fetchOrRegisterFederatedInstance(deps, authUser.user.host!)
			: await fetchFederatedInstance(deps, authUser.user.host!);

		if (i == null) return;

		getUpdateInstanceQueue(deps).enqueue(i.id, {
			latestRequestReceivedAt: new Date(),
			shouldUnsuspend: i.suspensionState === 'autoSuspendedForNotResponding',
		});

		if (deps.meta.enableChartsForFederatedInstances) {
			void deps.chartWriters.instanceChart.requestReceived(i.host);
		}

		await fetchInstanceMetadataWithSideEffects({
			httpRequestService: deps.httpRequestService,
			logger: { error: () => {}, info: () => {} },
			tryLock: h => tryLockFetchInstanceMetadata(deps, h),
			unlock: h => unlockFetchInstanceMetadata(deps, h),
			fetchOrRegisterInstance: h => fetchOrRegisterFederatedInstance(deps, h),
			updateInstance: (id, updates) => updateFederatedInstanceAndCache(deps, id, updates).then(() => {}),
		}, i);
	});

	// アクティビティを処理
	try {
		const result = await performActivityForHonoApi(deps, authUser.user, activity);
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
				case 'd450b8a9-48e4-4dab-ae36-f4db763fda7c': // invalid Note
					return e.message;
				case '9f466dab-c856-48cd-9e65-ff90ff750580':
					return 'note contains too many mentions';
				case '09d79f9e-64f1-4316-9cfa-e75c4d091574': // Instance is blocked
					return 'skip: blocked instance';
			}
		}
		throw e;
	}
	return 'ok';
}
