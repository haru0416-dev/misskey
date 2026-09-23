/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { describe, expect, test } from 'vitest';
import { createBackgroundExecutionScope, memoizeInRequest, runInRequestScope } from '@/misc/request-scope.js';

describe('background execution scope', () => {
	test('isolates tasks from both HTTP callers and restores the runtime context across awaits', async () => {
		const context = new AsyncLocalStorage<string>();
		const runTask = context.run('runtime', () =>
			runInRequestScope(() => {
				void memoizeInRequest('roles:version', async () => 'runtime-memo');
				return createBackgroundExecutionScope();
			}),
		);
		const release = Promise.withResolvers<void>();
		const submit = (caller: string, version: string) =>
			context.run(caller, () =>
				runInRequestScope(async () => {
					await memoizeInRequest('roles:version', async () => caller);
					const result = await runTask(async () => {
						const before = context.getStore();
						const initial = await memoizeInRequest('roles:version', async () => version);
						await release.promise;
						const repeated = await memoizeInRequest('roles:version', async () => 'unexpected recompute');
						return { before, after: context.getStore(), initial, repeated };
					});
					expect(context.getStore()).toBe(caller);
					expect(await memoizeInRequest('roles:version', async () => 'unexpected HTTP recompute')).toBe(caller);
					return result;
				}),
			);

		const first = submit('http-a', 'task-a');
		const second = submit('http-b', 'task-b');
		release.resolve();
		expect(await Promise.all([first, second])).toEqual([
			{ before: 'runtime', after: 'runtime', initial: 'task-a', repeated: 'task-a' },
			{ before: 'runtime', after: 'runtime', initial: 'task-b', repeated: 'task-b' },
		]);
	});

	test('retains a failed lookup only for its attempt and allows the next attempt to recover', async () => {
		const runAttempt = createBackgroundExecutionScope();
		const failure = new Error('temporary database failure');

		await expect(
			runAttempt(async () => {
				await expect(
					memoizeInRequest('followers', async () => {
						throw failure;
					}),
				).rejects.toBe(failure);
				return memoizeInRequest('followers', async () => ['unexpected retry']);
			}),
		).rejects.toBe(failure);

		expect(await runAttempt(() => memoizeInRequest('followers', async () => ['current follower']))).toEqual([
			'current follower',
		]);
	});

	test('does not pass a producer memo to a child attempt or another worker', async () => {
		const runProducer = createBackgroundExecutionScope();
		const runConsumer = createBackgroundExecutionScope();

		await runProducer(async () => {
			await memoizeInRequest('followers', async () => ['producer follower']);
			expect(await runProducer(() => memoizeInRequest('followers', async () => ['child follower']))).toEqual([
				'child follower',
			]);
			expect(await runConsumer(() => memoizeInRequest('followers', async () => ['consumer follower']))).toEqual([
				'consumer follower',
			]);
			expect(await memoizeInRequest('followers', async () => ['unexpected producer recompute'])).toEqual([
				'producer follower',
			]);
		});
	});
});
