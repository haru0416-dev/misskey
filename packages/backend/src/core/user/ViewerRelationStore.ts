/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { preparedQueryFor, UNNAMED_PREPARED_STATEMENT } from '@/db/prepared.js';
import { blocking } from '@/db/schema/blocking.js';
import { channelFollowing } from '@/db/schema/channel-following.js';
import { channelMuting } from '@/db/schema/channel-muting.js';
import { following } from '@/db/schema/following.js';
import { muting } from '@/db/schema/muting.js';
import { renoteMuting } from '@/db/schema/renote-muting.js';
import { userProfile } from '@/db/schema/user-profile.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { SQL } from 'drizzle-orm';
import type { MiChannel } from '@/models/Channel.js';
import type { MiUser } from '@/models/User.js';

/**
 * タイムラインの絞り込みに使う「閲覧者から見た関係」。
 * どれも閲覧者1人のidだけを条件にした単純な列挙で、同じリクエストの中で揃って必要になる。
 */
export type ViewerRelationKind =
	| 'following'
	| 'channelFollowing'
	| 'channelMuting'
	| 'muting'
	| 'renoteMuting'
	| 'blocking'
	| 'mutedInstance';

/**
 * 取得した関係一式。
 * `kinds` に無い項目は「引いていない」だけで、空配列は「0件だった」ことを意味しない。
 * 受け取る側は必要な種別が `kinds` に含まれているか確認すること。
 */
export type ViewerRelationSnapshot = {
	/** この取得で実際に引いた種別 */
	kinds: ReadonlySet<ViewerRelationKind>;
	/** 閲覧者がフォローしているユーザー */
	followeeIds: MiUser['id'][];
	/** 閲覧者がフォローしているチャンネル (ミュート中のものも含む) */
	followingChannelIds: MiChannel['id'][];
	/** 閲覧者がミュートしているチャンネル (期限切れを除く) */
	mutedChannelIds: MiChannel['id'][];
	/** 閲覧者がミュートしているユーザー */
	muteeIds: MiUser['id'][];
	/** 閲覧者がリノートだけミュートしているユーザー */
	renoteMuteeIds: MiUser['id'][];
	/** 閲覧者をブロックしているユーザー */
	blockerIds: MiUser['id'][];
	/** 閲覧者がミュートしているホスト */
	mutedInstances: string[];
};

/** fanoutタイムラインのフィルタが読む種別。呼び出し元が渡すsnapshotはこれを満たす必要がある。 */
export const fanoutViewerRelationKinds = [
	'channelMuting',
	'muting',
	'renoteMuting',
	'blocking',
	'mutedInstance',
] as const satisfies readonly ViewerRelationKind[];

/** ホーム/ソーシャルタイムラインが読む種別 (fanoutのぶんに加えてフォロー関係が要る)。 */
export const homeTimelineViewerRelationKinds = [
	'following',
	'channelFollowing',
	...fanoutViewerRelationKinds,
] as const satisfies readonly ViewerRelationKind[];

/**
 * union の各枝。どれが先頭に来ても外側から同じ名前で読めるよう、全枝に `kind` / `id` の別名を付けてある
 * (PostgreSQLは union の列名を先頭の枝から取るため、一部の枝にしか別名が無いと種別の指定次第で壊れる)。
 */
const branchByKind: Record<ViewerRelationKind, () => SQL> = {
	following: () => sql`
		select 'following' as "kind", ${following.followeeId} as "id"
		from ${following}
		where ${eq(following.followerId, sql.placeholder('userId'))}`,
	channelFollowing: () => sql`
		select 'channelFollowing' as "kind", ${channelFollowing.followeeId} as "id"
		from ${channelFollowing}
		where ${eq(channelFollowing.followerId, sql.placeholder('userId'))}`,
	channelMuting: () => sql`
		select 'channelMuting' as "kind", ${channelMuting.channelId} as "id"
		from ${channelMuting}
		where ${and(
			eq(channelMuting.userId, sql.placeholder('userId')),
			or(isNull(channelMuting.expiresAt), gt(channelMuting.expiresAt, sql.placeholder('now'))),
		)}`,
	muting: () => sql`
		select 'muting' as "kind", ${muting.muteeId} as "id"
		from ${muting}
		where ${eq(muting.muterId, sql.placeholder('userId'))}`,
	renoteMuting: () => sql`
		select 'renoteMuting' as "kind", ${renoteMuting.muteeId} as "id"
		from ${renoteMuting}
		where ${eq(renoteMuting.muterId, sql.placeholder('userId'))}`,
	blocking: () => sql`
		select 'blocking' as "kind", ${blocking.blockerId} as "id"
		from ${blocking}
		where ${eq(blocking.blockeeId, sql.placeholder('userId'))}`,
	mutedInstance: () => sql`
		select 'mutedInstance' as "kind", "muted_instance"."value" as "id"
		from ${userProfile}, jsonb_array_elements_text(${userProfile.mutedInstances}) as "muted_instance"
		where ${eq(userProfile.userId, sql.placeholder('userId'))}`,
};

/** SQL文とキャッシュキーを種別集合から一意に決めるため、宣言順に正規化する。 */
const kindOrder: readonly ViewerRelationKind[] = [
	'following',
	'channelFollowing',
	'channelMuting',
	'muting',
	'renoteMuting',
	'blocking',
	'mutedInstance',
];

function emptyViewerRelationSnapshot(kinds: readonly ViewerRelationKind[] = []): ViewerRelationSnapshot {
	return {
		kinds: new Set(kinds),
		followeeIds: [],
		followingChannelIds: [],
		mutedChannelIds: [],
		muteeIds: [],
		renoteMuteeIds: [],
		blockerIds: [],
		mutedInstances: [],
	};
}

export function viewerRelationSnapshotCovers(
	snapshot: ViewerRelationSnapshot | undefined | null,
	kinds: readonly ViewerRelationKind[],
): snapshot is ViewerRelationSnapshot {
	return snapshot != null && kinds.every((kind) => snapshot.kinds.has(kind));
}

/**
 * 閲覧者コンテキストを1往復で取る。
 *
 * 分割して投げると、SQL1本あたり73µsの固定CPU (プール貸出のタイマ/リスナ登録、RowDescription処理、
 * 結果オブジェクトの組み立て) を本数ぶん払うことになる。実測でこの固定費はDBクライアントCPUの76%を
 * 占めており、行数・列数を削るより往復を削る方が効く。
 *
 * ただし `following` は最大4500行になり得るので、要る種別だけを指定すること。使わない枝を混ぜると
 * 往復1本ぶん (73µs) より行の転送 (0.24µs/行) の方が高くつく。
 *
 * 実測 (base/after 各3回・90秒・並列8): 全体で467.4→521.1 rps (+11.5%)、加重p50 16.40→14.73ms (-10.2%)。
 * まとめた側のp50は `users/notes` -25.4% / `notes/timeline` -24.6% / `notes/hybrid-timeline` -20.4%。
 */
export async function fetchViewerRelationSnapshotFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	now: Date,
	kinds: readonly ViewerRelationKind[],
): Promise<ViewerRelationSnapshot> {
	const snapshot = emptyViewerRelationSnapshot(kinds);
	if (snapshot.kinds.size === 0) return snapshot;

	const orderedKinds = kindOrder.filter((kind) => snapshot.kinds.has(kind));
	const statement = preparedQueryFor(db, `viewerRelation:${orderedKinds.join('+')}`, () =>
		db
			.select({
				kind: sql<ViewerRelationKind>`"viewer_relation"."kind"`,
				id: sql<string>`"viewer_relation"."id"`,
			})
			.from(
				sql`(${sql.join(
					orderedKinds.map((kind) => branchByKind[kind]()),
					sql` union all `,
				)}) as "viewer_relation"`,
			)
			.prepare(UNNAMED_PREPARED_STATEMENT),
	);
	const rows = await statement.execute({ userId, now });

	for (const row of rows) {
		switch (row.kind) {
			case 'following':
				snapshot.followeeIds.push(row.id);
				break;
			case 'channelFollowing':
				snapshot.followingChannelIds.push(row.id);
				break;
			case 'channelMuting':
				snapshot.mutedChannelIds.push(row.id);
				break;
			case 'muting':
				snapshot.muteeIds.push(row.id);
				break;
			case 'renoteMuting':
				snapshot.renoteMuteeIds.push(row.id);
				break;
			case 'blocking':
				snapshot.blockerIds.push(row.id);
				break;
			case 'mutedInstance':
				snapshot.mutedInstances.push(row.id);
				break;
		}
	}

	return snapshot;
}
