/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@/preferences.js', async (importOriginal) => importOriginal<typeof import('@/preferences.js')>());

const mocks = vi.hoisted(() => {
	const scheduler: { task: (() => void | Promise<void>) | null; pending: boolean; disposed: boolean } = {
		task: null,
		pending: false,
		disposed: false,
	};
	return {
		scheduler,
		backup: vi.fn<() => Promise<void>>(),
		disposeStore: vi.fn<() => Promise<void>>(),
		reload: vi.fn<(path?: string) => void>(),
		clearQueries: vi.fn<() => void>(),
	};
});

vi.mock('@/i.js', () => ({
	$i: { id: 'me', token: 'synthetic-token', username: 'synthetic', notesCount: 0, policies: {} },
}));
vi.mock('@/store.js', () => ({
	store: {
		enablePreferencesAutoCloudBackup: true,
		$persistReady: Promise.resolve(),
		$persistDispose: mocks.disposeStore,
	},
}));
vi.mock('@/preferences/utility.js', () => ({ cloudBackup: mocks.backup }));
vi.mock('@/utility/deferred-task-scheduler.js', () => ({
	DeferredTaskScheduler: class {
		constructor(task: () => void | Promise<void>) {
			mocks.scheduler.task = task;
		}

		request() {
			if (!mocks.scheduler.disposed) mocks.scheduler.pending = true;
		}

		dispose() {
			mocks.scheduler.disposed = true;
			mocks.scheduler.pending = false;
		}
	},
}));
vi.mock('@/utility/misskey-api.js', () => ({
	misskeyApi: vi.fn(async () => {
		throw new Error('Unexpected per-key preference request');
	}),
}));
vi.mock('@/utility/idb-proxy.js', () => ({
	get: vi.fn(async () => {
		throw new Error('Unexpected base persistence read');
	}),
	update: vi.fn(async () => {
		throw new Error('Unexpected base persistence update');
	}),
	clear: vi.fn(async () => {}),
}));
vi.mock('@/os.js', () => ({ waiting: vi.fn() }));
vi.mock('@/utility/unison-reload.js', () => ({ unisonReload: mocks.reload }));
vi.mock('@/query/client.js', () => ({ queryClient: { clear: mocks.clearQueries } }));

beforeEach(() => {
	mocks.scheduler.task = null;
	mocks.scheduler.pending = false;
	mocks.scheduler.disposed = false;
	mocks.backup.mockReset();
	mocks.disposeStore.mockReset().mockResolvedValue(undefined);
	mocks.reload.mockReset();
	mocks.clearQueries.mockReset();
	localStorage.clear();
	localStorage.setItem(
		'account',
		JSON.stringify({
			id: 'me',
			token: 'synthetic-token',
			username: 'synthetic',
			notesCount: 0,
			policies: {},
		}),
	);
});

afterEach(() => {
	vi.restoreAllMocks();
	localStorage.clear();
});

async function startBackup(failure: Error) {
	const backup = Promise.withResolvers<void>();
	const started = Promise.withResolvers<void>();
	mocks.backup
		.mockImplementationOnce(() => {
			started.resolve();
			return backup.promise;
		})
		.mockRejectedValue(failure);
	const preferences = await import('@/preferences.js');
	await preferences.prefer.$preferencesCloudReady;
	preferences.prefer.renameProfile('Transition profile');
	const task = mocks.scheduler.task;
	if (task == null) throw new Error('Automatic backup scheduler was not constructed');
	const scheduled = task();
	await started.promise;
	return { backup, scheduled, preferences };
}

describe('automatic preference backup shutdown', () => {
	test('concurrent shutdown observers preserve a real disposal failure while rejected automatic backup permits logout', async () => {
		const failure = new Error('Automatic backup is offline');
		const disposalFailure = new Error('Preference shutdown failed');
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const { backup, scheduled, preferences } = await startBackup(failure);
		const dispose = preferences.prefer.$preferencesDispose;
		vi.spyOn(preferences.prefer, '$preferencesDispose')
			.mockImplementationOnce(async () => {
				await dispose();
				throw disposalFailure;
			})
			.mockImplementation(dispose);
		let stoppedError: unknown;
		const failedObserver = preferences.disposePreferences().then(
			() => {
				throw new Error('Failed preference shutdown unexpectedly succeeded');
			},
			(error) => {
				stoppedError = error;
			},
		);
		const { signout } = await import('@/signout.js');
		const completion = signout();
		expect(localStorage.getItem('account')).not.toBeNull();
		expect(stoppedError).toBeUndefined();
		expect(mocks.reload).not.toHaveBeenCalled();
		backup.reject(failure);
		await Promise.all([scheduled, failedObserver, completion]);
		expect(localStorage.getItem('account')).toBeNull();
		expect(stoppedError).toBe(disposalFailure);
		expect(mocks.reload).toHaveBeenCalledOnce();
	});
});
