import { describe, test, beforeAll, expect } from 'vitest';
import assert, { strictEqual } from 'node:assert';
import { createAccount, resolveRemoteUser, sleep } from './utils.js';
import type { LoginUser } from './utils.js';

describe('Move', () => {
	test('Minimum move', async () => {
		const [alice, bob] = await Promise.all([createAccount('a.test'), createAccount('b.test')]);

		await bob.client.request('i/update', { alsoKnownAs: [`@${alice.username}@a.test`] });
		const destinationInA = await resolveRemoteUser('b.test', bob.id, alice);
		await alice.client.request('i/move', { moveToAccount: `@${bob.username}@b.test` });
		const moved = await alice.client.request('i', {});
		expect(moved.movedTo).toBe(destinationInA.id);
	});

	// https://github.com/misskey-dev/misskey/issues/11320
	describe('Following relation is transferred after move', () => {
		let alice: LoginUser, bob: LoginUser, carol: LoginUser;

		beforeAll(async () => {
			[alice, bob] = await Promise.all([createAccount('a.test'), createAccount('b.test')]);
			carol = await createAccount('a.test');

			await carol.client.request('following/create', { userId: alice.id });

			await bob.client.request('i/update', { alsoKnownAs: [`@${alice.username}@a.test`] });
			await alice.client.request('i/move', { moveToAccount: `@${bob.username}@b.test` });

			// フォロワー移行はrelationshipキュー経由の多段処理 (follow → 配送 → Accept) のため、
			// 固定sleepでは足りないことがある。反映されるまで有界ポーリングで待つ
			for (let i = 0; i < 40; i++) {
				await sleep();
				const following = await carol.client.request('users/following', { userId: carol.id });
				if (following.length >= 2) {
					break;
				}
			}
		});

		test('Check from follower', async () => {
			const following = await carol.client.request('users/following', { userId: carol.id });
			strictEqual(following.length, 2);
			const followees = following.map(({ followee }) => followee);
			assert(followees.every((followee) => followee != null));
			assert(followees.some(({ id, url }) => id === alice.id && url === null));
			assert(followees.some(({ url }) => url === `https://b.test/@${bob.username}`));
		});
	});
});
