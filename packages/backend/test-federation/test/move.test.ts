import { describe, test, beforeAll, expect } from 'vitest';
import assert, { strictEqual } from 'node:assert';
import { createAccount, resolveRemoteUser, sleep, waitFor } from './utils.js';
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

	test('移行先サーバーにいるフォロワーをローカル移行先へ引き継ぐ', async () => {
		const [source, destination, follower] = await Promise.all([
			createAccount('a.test'),
			createAccount('b.test'),
			createAccount('b.test'),
		]);
		const sourceInB = await resolveRemoteUser('a.test', source.id, follower);
		await follower.client.request('following/create', { userId: sourceInB.id });
		await waitFor(async () => (await source.client.request('users/followers', { userId: source.id })).length === 1);
		await destination.client.request('i/update', { alsoKnownAs: [`@${source.username}@a.test`] });
		await source.client.request('i/move', { moveToAccount: `@${destination.username}@b.test` });
		await waitFor(async () => {
			const following = await follower.client.request('users/following', { userId: follower.id });
			return following.some(({ followee }) => followee?.id === destination.id);
		}, 20_000);
		const followers = await destination.client.request('users/followers', { userId: destination.id });
		expect(followers.map(({ follower: user }) => user?.id)).toContain(follower.id);
		const moved = await follower.client.request('users/show', { userId: sourceInB.id });
		expect(moved.movedTo).toBe(destination.id);
	});

	/** @see https://github.com/misskey-dev/misskey/issues/11320 */
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

		test('Check from followee', async () => {
			const followers = await bob.client.request('users/followers', { userId: bob.id });
			strictEqual(followers.length, 1);
			const follower = followers[0]?.follower;
			assert(follower != null);
			strictEqual(follower.url, `https://a.test/@${carol.username}`);
		});
	});
});
