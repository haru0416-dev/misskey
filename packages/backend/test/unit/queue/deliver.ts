/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env['NODE_ENV'] = 'test';
// createRuntimeDependencies() が構築する UrlPreviewService は rolldown の `define` で注入される
// _SUMMALY_VERSION_ を参照するが、vitest はソースを直接importするだけでrolldownを経由しないため
// 未定義になる。テスト用にダミー値を注入しておく。
(globalThis as unknown as { _SUMMALY_VERSION_: string })._SUMMALY_VERSION_ = 'test';

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import * as Bull from 'bullmq';
import { loadConfig } from '@/config.js';
import { createRuntimeDependencies, type RuntimeDependencies } from '@/runtime-dependencies.js';
import { createInstanceInDatabase, fetchInstanceByHostFromDatabase } from '@/core/InstanceStore.js';
import { fetchOrCreateSystemAccountInDatabase } from '@/core/SystemAccountLogic.js';
import { genId } from '@/misc/id/gen-id.js';
import { StatusError } from '@/misc/status-error.js';
import { handleHonoQueueDeliver, type HonoQueueDeliverDependencies } from '@/queue/handlers/deliver.js';
import type { DeliverJobData } from '@/queue/types.js';
import type { MiLocalUser } from '@/models/User.js';

function fakeJob(data: DeliverJobData): Bull.Job<DeliverJobData> {
	return { data } as Bull.Job<DeliverJobData>;
}

describe('hono-queue-deliver', () => {
	let runtime: RuntimeDependencies;
	let actor: MiLocalUser;
	// meta.federationはデフォルト'none'(連合オフ)なので、素通りさせたいテストは
	// 'all'に上書きする。
	let federatedDeps: HonoQueueDeliverDependencies;

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
		actor = await fetchOrCreateSystemAccountInDatabase(
			{ db: runtime.db, meta: runtime.meta, genId: () => genId() },
			'actor',
		);
		// enableStatsForFederatedInstancesはデフォルトtrueだが、trueだと配送成功時に
		// fetchInstanceMetadataWithSideEffects経由で実在しないテストホストへ本物のHTTPリクエストを
		// 試みてしまう (process.nextTickでの非同期fire-and-forgetのため、テスト終了後に
		// unhandled rejectionとして顕在化する) - テストでは無効化する。
		federatedDeps = {
			...runtime,
			meta: { ...runtime.meta, federation: 'all', enableStatsForFederatedInstances: false },
		};
	});

	afterAll(async () => {
		await runtime.dispose();
	});

	// suspendedHostsCache はモジュールスコープの1hシングルトンキャッシュのため、
	// 一度警告(warm)されると他のテストの新規サスペンドが反映されなくなる。
	// このテストを最初に実行してキャッシュを一度だけ警告する。
	test('サスペンド済みインスタンス宛はskip (suspended)を返す', async () => {
		const host = `honoqueuedeliver-suspended-${genId()}.example.com`;
		await createInstanceInDatabase(runtime.db, {
			id: genId(),
			host,
			firstRetrievedAt: new Date(),
			suspensionState: 'manuallySuspended',
		});

		const result = await handleHonoQueueDeliver(
			federatedDeps,
			fakeJob({
				user: { id: actor.id },
				content: '{}',
				digest: 'SHA-256=dummy',
				to: `https://${host}/inbox`,
				isSharedInbox: false,
			}),
		);

		expect(result).toBe('skip (suspended)');
	});

	test("meta.federationが'none'の場合はskip (blocked)を返す", async () => {
		const host = `honoqueuedeliver-blocked-${genId()}.example.com`;

		const result = await handleHonoQueueDeliver(
			runtime,
			fakeJob({
				user: { id: actor.id },
				content: '{}',
				digest: 'SHA-256=dummy',
				to: `https://${host}/inbox`,
				isSharedInbox: false,
			}),
		);

		expect(result).toBe('skip (blocked)');
	});

	test('meta.blockedHostsに含まれるホスト宛はskip (blocked)を返す', async () => {
		const host = `honoqueuedeliver-blocked-${genId()}.example.com`;

		const result = await handleHonoQueueDeliver(
			{ ...federatedDeps, meta: { ...federatedDeps.meta, blockedHosts: [...federatedDeps.meta.blockedHosts, host] } },
			fakeJob({
				user: { id: actor.id },
				content: '{}',
				digest: 'SHA-256=dummy',
				to: `https://${host}/inbox`,
				isSharedInbox: false,
			}),
		);

		expect(result).toBe('skip (blocked)');
	});

	test('署名付きPOSTが成功した場合はSuccessを返す', async () => {
		const host = `honoqueuedeliver-ok-${genId()}.example.com`;
		const send = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));

		const deps: HonoQueueDeliverDependencies = {
			...federatedDeps,
			httpRequestService: { ...federatedDeps.httpRequestService, send },
		};

		const result = await handleHonoQueueDeliver(
			deps,
			fakeJob({
				user: { id: actor.id },
				content: '{}',
				digest: 'SHA-256=dummy',
				to: `https://${host}/inbox`,
				isSharedInbox: false,
			}),
		);

		expect(result).toBe('Success');
		expect(send).toHaveBeenCalledOnce();
	});

	test('4xx(リトライ不可)エラーの場合はUnrecoverableErrorを投げる', async () => {
		const host = `honoqueuedeliver-ng-${genId()}.example.com`;
		const send = vi.fn().mockRejectedValue(new StatusError('Not Found', 404, 'Not Found'));

		const deps: HonoQueueDeliverDependencies = {
			...federatedDeps,
			httpRequestService: { ...federatedDeps.httpRequestService, send },
		};

		await expect(
			handleHonoQueueDeliver(
				deps,
				fakeJob({
					user: { id: actor.id },
					content: '{}',
					digest: 'SHA-256=dummy',
					to: `https://${host}/inbox`,
					isSharedInbox: false,
				}),
			),
		).rejects.toBeInstanceOf(Bull.UnrecoverableError);

		// インスタンス情報更新は非同期なので、DB破棄前に isNotResponding=true の書き込み完了を待つ。
		await expect
			.poll(async () => (await fetchInstanceByHostFromDatabase(runtime.db, host))?.isNotResponding, {
				timeout: 10000,
			})
			.toBe(true);
	});
});
