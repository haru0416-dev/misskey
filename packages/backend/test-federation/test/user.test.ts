import { describe, test, beforeAll } from 'vitest';
import assert, { rejects, strictEqual } from 'node:assert';
import { Person } from '@fedify/vocab';
import * as Misskey from 'misskey-js';
import {
	createAccount,
	deepStrictEqualWithExcludedFields,
	fetchActivityPubObject,
	fetchAdmin,
	type LoginUser,
	resolveRemoteNote,
	resolveRemoteUser,
	sleep,
	waitFor,
} from './utils.js';

const [aAdmin, bAdmin] = await Promise.all([fetchAdmin('a.test'), fetchAdmin('b.test')]);

function getAt<T>(values: readonly T[], index: number): T {
	const value = values[index];
	assert(value);
	return value;
}

describe('User', () => {
	describe('Profile', () => {
		describe('Consistency of profile', () => {
			let alice: LoginUser;
			let aliceWatcher: LoginUser;
			let aliceWatcherInB: LoginUser;

			beforeAll(async () => {
				alice = await createAccount('a.test');
				[aliceWatcher, aliceWatcherInB] = await Promise.all([createAccount('a.test'), createAccount('b.test')]);
			});

			test('Check consistency', async () => {
				const aliceInA = await aliceWatcher.client.request('users/show', { userId: alice.id });
				const resolved = await resolveRemoteUser('a.test', aliceInA.id, aliceWatcherInB);
				const aliceInB = await aliceWatcherInB.client.request('users/show', { userId: resolved.id });

				// console.log(`a.test: ${JSON.stringify(aliceInA, null, '\t')}`);
				// console.log(`b.test: ${JSON.stringify(aliceInB, null, '\t')}`);

				deepStrictEqualWithExcludedFields(aliceInA, aliceInB, [
					'id',
					'host',
					'avatarUrl',
					'avatarBlurhash',
					'instance',
					'badgeRoles',
					'url',
					'uri',
					'createdAt',
					'lastFetchedAt',
					'publicReactions',
				]);
			});

			test('Fedify can parse the actor document', async () => {
				const uri = `https://a.test/users/${alice.id}`;
				const localUser = await aliceWatcher.client.request('users/show', { userId: alice.id });
				const actor = await fetchActivityPubObject(uri);

				assert(actor instanceof Person);
				strictEqual(actor.id?.href, uri);
				strictEqual(actor.preferredUsername, alice.username);
				strictEqual(actor.inboxId?.href, `${uri}/inbox`);
				strictEqual(actor.outboxId?.href, `${uri}/outbox`);
				strictEqual(actor.followersId?.href, `${uri}/followers`);
				strictEqual(actor.followingId?.href, `${uri}/following`);
				strictEqual(actor.published?.epochMilliseconds, Date.parse(localUser.createdAt));

				const publicKey = await actor.getPublicKey();
				assert(publicKey != null);
				strictEqual(publicKey.ownerId?.href, uri);
			});
		});

		describe('ffVisibility is federated', () => {
			let alice: LoginUser, bob: LoginUser;
			let bobInA: Misskey.entities.UserDetailedNotMe, aliceInB: Misskey.entities.UserDetailedNotMe;

			beforeAll(async () => {
				[alice, bob] = await Promise.all([createAccount('a.test'), createAccount('b.test')]);

				[bobInA, aliceInB] = await Promise.all([
					resolveRemoteUser('b.test', bob.id, alice),
					resolveRemoteUser('a.test', alice.id, bob),
				]);

				await Promise.all([
					alice.client.request('following/create', { userId: bobInA.id }),
					bob.client.request('following/create', { userId: aliceInB.id }),
				]);
				await sleep();
			});

			test('Visibility set public by default', async () => {
				for (const user of await Promise.all([
					alice.client.request('users/show', { userId: bobInA.id }),
					bob.client.request('users/show', { userId: aliceInB.id }),
				])) {
					strictEqual(user.followersVisibility, 'public');
					strictEqual(user.followingVisibility, 'public');
				}
			});

			/** 未対応のためスキップする。 */
			test.skip('Setting private for followersVisibility is federated', async () => {
				await Promise.all([
					alice.client.request('i/update', { followersVisibility: 'private' }),
					bob.client.request('i/update', { followersVisibility: 'private' }),
				]);
				await sleep();

				for (const user of await Promise.all([
					alice.client.request('users/show', { userId: bobInA.id }),
					bob.client.request('users/show', { userId: aliceInB.id }),
				])) {
					strictEqual(user.followersVisibility, 'private');
					strictEqual(user.followingVisibility, 'public');
				}
			});

			test.skip('Setting private for followingVisibility is federated', async () => {
				await Promise.all([
					alice.client.request('i/update', { followingVisibility: 'private' }),
					bob.client.request('i/update', { followingVisibility: 'private' }),
				]);
				await sleep();

				for (const user of await Promise.all([
					alice.client.request('users/show', { userId: bobInA.id }),
					bob.client.request('users/show', { userId: aliceInB.id }),
				])) {
					strictEqual(user.followersVisibility, 'private');
					strictEqual(user.followingVisibility, 'private');
				}
			});
		});

		describe('isCat is federated', () => {
			let alice: LoginUser, bob: LoginUser;
			let bobInA: Misskey.entities.UserDetailedNotMe, aliceInB: Misskey.entities.UserDetailedNotMe;

			beforeAll(async () => {
				[alice, bob] = await Promise.all([createAccount('a.test'), createAccount('b.test')]);

				[bobInA, aliceInB] = await Promise.all([
					resolveRemoteUser('b.test', bob.id, alice),
					resolveRemoteUser('a.test', alice.id, bob),
				]);
			});

			test('Not isCat for default', () => {
				strictEqual(aliceInB.isCat, false);
			});

			test('Becoming a cat is sent to their followers', async () => {
				await bob.client.request('following/create', { userId: aliceInB.id });
				await sleep();

				await alice.client.request('i/update', { isCat: true });
				await sleep();

				const res = await bob.client.request('users/show', { userId: aliceInB.id });
				strictEqual(res.isCat, true);
			});
		});

		describe('Pinning Notes', () => {
			let alice: LoginUser, bob: LoginUser;
			let aliceInB: Misskey.entities.UserDetailedNotMe;

			beforeAll(async () => {
				[alice, bob] = await Promise.all([createAccount('a.test'), createAccount('b.test')]);
				aliceInB = await resolveRemoteUser('a.test', alice.id, bob);

				await bob.client.request('following/create', { userId: aliceInB.id });
			});

			test('Pinning localOnly Note is not delivered', async () => {
				const note = (await alice.client.request('notes/create', { text: 'a', localOnly: true })).createdNote;
				await alice.client.request('i/pin', { noteId: note.id });
				await sleep();

				const _aliceInB = await bob.client.request('users/show', { userId: aliceInB.id });
				strictEqual(_aliceInB.pinnedNoteIds.length, 0);
			});

			test('Pinning followers-only Note is not delivered', async () => {
				const note = (await alice.client.request('notes/create', { text: 'a', visibility: 'followers' })).createdNote;
				await alice.client.request('i/pin', { noteId: note.id });
				await sleep();

				const _aliceInB = await bob.client.request('users/show', { userId: aliceInB.id });
				strictEqual(_aliceInB.pinnedNoteIds.length, 0);
			});

			let pinnedNote: Misskey.entities.Note;

			test('Pinning normal Note is delivered', async () => {
				pinnedNote = (await alice.client.request('notes/create', { text: 'a' })).createdNote;
				await alice.client.request('i/pin', { noteId: pinnedNote.id });
				await sleep();

				const _aliceInB = await bob.client.request('users/show', { userId: aliceInB.id });
				strictEqual(_aliceInB.pinnedNoteIds.length, 1);
				const pinnedNoteInB = await resolveRemoteNote('a.test', pinnedNote.id, bob);
				strictEqual(getAt(_aliceInB.pinnedNotes, 0).id, pinnedNoteInB.id);
			});

			test('Unpinning normal Note is delivered', async () => {
				await alice.client.request('i/unpin', { noteId: pinnedNote.id });
				await sleep();

				const _aliceInB = await bob.client.request('users/show', { userId: aliceInB.id });
				strictEqual(_aliceInB.pinnedNoteIds.length, 0);
			});
		});
	});

	describe('Follow / Unfollow', () => {
		let alice: LoginUser, bob: LoginUser;
		let bobInA: Misskey.entities.UserDetailedNotMe, aliceInB: Misskey.entities.UserDetailedNotMe;

		beforeAll(async () => {
			[alice, bob] = await Promise.all([createAccount('a.test'), createAccount('b.test')]);

			[bobInA, aliceInB] = await Promise.all([
				resolveRemoteUser('b.test', bob.id, alice),
				resolveRemoteUser('a.test', alice.id, bob),
			]);
		});

		describe('Follow a.test ==> b.test', () => {
			beforeAll(async () => {
				await alice.client.request('following/create', { userId: bobInA.id });

				await sleep();
			});

			test('Check consistency with `users/following` and `users/followers` endpoints', async () => {
				await Promise.all([
					strictEqual(
						(await alice.client.request('users/following', { userId: alice.id })).some(
							(v) => v.followeeId === bobInA.id,
						),
						true,
					),
					strictEqual(
						(await bob.client.request('users/followers', { userId: bob.id })).some((v) => v.followerId === aliceInB.id),
						true,
					),
				]);
			});
		});

		describe('Unfollow a.test ==> b.test', () => {
			beforeAll(async () => {
				await alice.client.request('following/delete', { userId: bobInA.id });

				await sleep();
			});

			test('Check consistency with `users/following` and `users/followers` endpoints', async () => {
				await Promise.all([
					strictEqual(
						(await alice.client.request('users/following', { userId: alice.id })).some(
							(v) => v.followeeId === bobInA.id,
						),
						false,
					),
					strictEqual(
						(await bob.client.request('users/followers', { userId: bob.id })).some((v) => v.followerId === aliceInB.id),
						false,
					),
				]);
			});
		});
	});

	describe('Follow requests', () => {
		let alice: LoginUser, bob: LoginUser;
		let bobInA: Misskey.entities.UserDetailedNotMe, aliceInB: Misskey.entities.UserDetailedNotMe;

		beforeAll(async () => {
			[alice, bob] = await Promise.all([createAccount('a.test'), createAccount('b.test')]);

			[bobInA, aliceInB] = await Promise.all([
				resolveRemoteUser('b.test', bob.id, alice),
				resolveRemoteUser('a.test', alice.id, bob),
			]);

			await alice.client.request('i/update', { isLocked: true });
		});

		describe('Send follow request from Bob to Alice and cancel', () => {
			describe('Bob sends follow request to Alice', () => {
				beforeAll(async () => {
					await bob.client.request('following/create', { userId: aliceInB.id });
					await sleep();
				});

				test('Alice should have a request', async () => {
					const requests = await alice.client.request('following/requests/list', {});
					strictEqual(requests.length, 1);
					strictEqual(getAt(requests, 0).followee.id, alice.id);
					strictEqual(getAt(requests, 0).follower.id, bobInA.id);
				});
			});

			describe('Alice cancels it', () => {
				beforeAll(async () => {
					await bob.client.request('following/requests/cancel', { userId: aliceInB.id });
					await sleep();
				});

				test('Alice should have no requests', async () => {
					const requests = await alice.client.request('following/requests/list', {});
					strictEqual(requests.length, 0);
				});
			});
		});

		describe('Send follow request from Bob to Alice and reject', () => {
			beforeAll(async () => {
				await bob.client.request('following/create', { userId: aliceInB.id });
				await sleep();

				await alice.client.request('following/requests/reject', { userId: bobInA.id });
				await sleep();
			});

			test('Bob should have no requests', async () => {
				await rejects(
					async () => await bob.client.request('following/requests/cancel', { userId: aliceInB.id }),
					(err: any) => {
						strictEqual(err.code, 'FOLLOW_REQUEST_NOT_FOUND');
						return true;
					},
				);
			});

			test("Bob doesn't follow Alice", async () => {
				const following = await bob.client.request('users/following', { userId: bob.id });
				strictEqual(following.length, 0);
			});
		});

		describe('Send follow request from Bob to Alice and accept', () => {
			beforeAll(async () => {
				await bob.client.request('following/create', { userId: aliceInB.id });
				await sleep();

				await alice.client.request('following/requests/accept', { userId: bobInA.id });
				await sleep();
			});

			test('Bob follows Alice', async () => {
				const following = await bob.client.request('users/following', { userId: bob.id });
				strictEqual(following.length, 1);
				strictEqual(getAt(following, 0).followeeId, aliceInB.id);
				strictEqual(getAt(following, 0).followerId, bob.id);
			});
		});
	});

	describe('Deletion', () => {
		describe('Check Delete consistency', () => {
			let alice: LoginUser, bob: LoginUser;
			let bobInA: Misskey.entities.UserDetailedNotMe, aliceInB: Misskey.entities.UserDetailedNotMe;

			beforeAll(async () => {
				[alice, bob] = await Promise.all([createAccount('a.test'), createAccount('b.test')]);

				[bobInA, aliceInB] = await Promise.all([
					resolveRemoteUser('b.test', bob.id, alice),
					resolveRemoteUser('a.test', alice.id, bob),
				]);
			});

			test('Bob follows Alice, and Alice deleted themself', async () => {
				await bob.client.request('following/create', { userId: aliceInB.id });
				await sleep();

				const followers = await alice.client.request('users/followers', { userId: alice.id });
				strictEqual(followers.length, 1);

				await alice.client.request('i/delete-account', { password: alice.password });

				// 削除に伴う Delete の配送は outbox のディスパッチャ (1秒周期) を経由するため、
				// sleep() の既定 250ms では届かない (実測で約1秒)。条件が満たされるまで待つ。
				await waitFor(async () => (await bob.client.request('users/following', { userId: bob.id })).length === 0);

				await rejects(
					async () => await bob.client.request('following/create', { userId: aliceInB.id }),
					(err: any) => {
						strictEqual(err.code, 'NO_SUCH_USER');
						return true;
					},
				);
			});
		});

		describe('Deletion of remote user for moderation', () => {
			let alice: LoginUser, bob: LoginUser;
			let bobInA: Misskey.entities.UserDetailedNotMe, aliceInB: Misskey.entities.UserDetailedNotMe;

			beforeAll(async () => {
				[alice, bob] = await Promise.all([createAccount('a.test'), createAccount('b.test')]);

				[bobInA, aliceInB] = await Promise.all([
					resolveRemoteUser('b.test', bob.id, alice),
					resolveRemoteUser('a.test', alice.id, bob),
				]);
			});

			test('Bob follows Alice, then Alice gets deleted in B server', async () => {
				await bob.client.request('following/create', { userId: aliceInB.id });
				await sleep();

				const followers = await alice.client.request('users/followers', { userId: alice.id });
				strictEqual(followers.length, 1);

				await bAdmin.client.request('admin/delete-account', { userId: aliceInB.id });
				await sleep();

				/** リモートアカウントが削除されない。@see https://github.com/misskey-dev/misskey/issues/14728 */
				const deletedAlice = await bob.client.request('users/show', { userId: aliceInB.id });
				assert(deletedAlice.id, aliceInB.id);

				const following = await bob.client.request('users/following', { userId: bob.id });
				strictEqual(following.length, 1);
				await rejects(
					async () => await bob.client.request('following/create', { userId: aliceInB.id }),
					(err: any) => {
						strictEqual(err.code, 'ALREADY_FOLLOWING');
						return true;
					},
				);
			});

			test('Alice tries to follow Bob, but it is not processed', async () => {
				await alice.client.request('following/create', { userId: bobInA.id });
				await sleep();

				const following = await alice.client.request('users/following', { userId: alice.id });
				strictEqual(following.length, 0);

				const followers = await bob.client.request('users/followers', { userId: bob.id });
				strictEqual(followers.length, 0);
			});
		});
	});

	describe('Suspension', () => {
		describe('Check suspend/unsuspend consistency', () => {
			let alice: LoginUser, bob: LoginUser;
			let bobInA: Misskey.entities.UserDetailedNotMe, aliceInB: Misskey.entities.UserDetailedNotMe;

			beforeAll(async () => {
				[alice, bob] = await Promise.all([createAccount('a.test'), createAccount('b.test')]);

				[bobInA, aliceInB] = await Promise.all([
					resolveRemoteUser('b.test', bob.id, alice),
					resolveRemoteUser('a.test', alice.id, bob),
				]);
			});

			test('Bob follows Alice, and Alice gets suspended, there is no following relation, and Bob fails to follow again', async () => {
				await bob.client.request('following/create', { userId: aliceInB.id });
				await sleep();

				const followers = await alice.client.request('users/followers', { userId: alice.id });
				strictEqual(followers.length, 1);

				await aAdmin.client.request('admin/suspend-user', { userId: alice.id });
				await sleep();

				const following = await bob.client.request('users/following', { userId: bob.id });
				strictEqual(following.length, 0);

				await rejects(
					async () => await bob.client.request('following/create', { userId: aliceInB.id }),
					(err: any) => {
						strictEqual(err.code, 'NO_SUCH_USER');
						return true;
					},
				);
			});

			test('Alice gets unsuspended, Bob succeeds in following Alice', async () => {
				await aAdmin.client.request('admin/unsuspend-user', { userId: alice.id });
				await sleep();

				// 削除済みマークが残った行への following/create は拒否される。
				await rejects(
					async () => await bob.client.request('following/create', { userId: aliceInB.id }),
					(err: any) => {
						strictEqual(err.code, 'NO_SUCH_USER');
						return true;
					},
				);

				// 凍結解除後は再解決に成功し、解決したユーザーへのフォローも可能になる。
				const resolved = await resolveRemoteUser('a.test', alice.id, bob);
				strictEqual(resolved.username, aliceInB.username);

				await bob.client.request('following/create', { userId: resolved.id });
				await sleep();

				const following = await bob.client.request('users/following', { userId: bob.id });
				strictEqual(following.length, 1);
			});

			/** Alice からのフォローでリモートユーザーの存在を再確認する。 */
			test('Alice can follow Bob', async () => {
				await alice.client.request('following/create', { userId: bobInA.id });
				await sleep();

				const bobFollowers = await bob.client.request('users/followers', { userId: bob.id });
				strictEqual(bobFollowers.length, 1);
				const renewedaliceInB = getAt(bobFollowers, 0).follower;
				assert(renewedaliceInB != null);
				assert(aliceInB.username === renewedaliceInB.username);
				assert(aliceInB.host === renewedaliceInB.host);

				const resolved = await resolveRemoteUser('a.test', alice.id, bob);
				strictEqual(resolved.id, renewedaliceInB.id);
			});
		});
	});
});
