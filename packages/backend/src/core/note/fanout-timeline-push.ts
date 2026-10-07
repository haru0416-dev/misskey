/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Redis from 'ioredis';
import { parseId } from '@/misc/id/parse-id.js';
import type { Logger } from '@/logger.js';

/*
 * タイムラインの list (`list:<名前>`) は ID の降順・重複なしに保つ。読み取り側 (fanout-timeline.ts) は
 * この並びを前提に、全件ではなく先頭から必要な分だけを読む。
 *
 * 1 投稿を複数の list へ入れる処理は Valkey 側の 1 スクリプトで回す。list ごとのコマンドを pipeline に積むと、
 * フォロワーの数に比例してコマンドが増え、その組み立てだけで notes/create の CPU を無視できない割合で消費する。
 * スクリプトなら送るのは鍵と上限の一覧だけで済む。
 *
 * 先頭より新しい ID (ほとんどの投稿) は LPUSH で入れる。先頭より古い ID は、並行投稿の配布順の入れ替わり・
 * リモートからの遅延配信・outbox の再試行で来るので、二分探索で降順の位置を求めて LINSERT し、同じ ID が既に
 * あれば入れない。二分探索は LINDEX を約 log2(長さ) 回 (上限 300 の list で 9 回) 呼ぶので、先頭への LPUSH より
 * 数倍重いが、lrem で list を末尾まで走査するより軽い。挿入後は上限を超えた末尾 (最も古い ID) を切り詰める。
 * 入る位置が上限より後ろなら、入れてもすぐ切り詰められるので入れない。
 *
 * 作成から時間が経った投稿 (リモートからの遅延配信など) は list 末尾より新しいときだけ入れる。
 * ID の先頭 12 桁 (16 進) が UNIX ミリ秒なので、比較はスクリプト内で完結する。
 *
 * Lua の文字列比較は strcoll だが、ID は小文字 16 進 32 桁だけなので、C 以外のロケールでもバイト順と一致する。
 */
const PUSH_SCRIPT = `
local id = ARGV[1]
local fresh = ARGV[2] == '1'
local ts = tonumber(string.sub(id, 1, 12), 16)
for i, key in ipairs(KEYS) do
  local maxlen = tonumber(ARGV[i + 2])
  local push = true
  if not fresh then
    local last = redis.call('LINDEX', key, -1)
    if last and tonumber(string.sub(last, 1, 12), 16) >= ts then
      push = false
    end
  end
  if push then
    local head = redis.call('LINDEX', key, 0)
    if (not head) or head < id then
      if redis.call('LPUSH', key, id) > maxlen then
        redis.call('LTRIM', key, 0, maxlen - 1)
      end
    elseif head ~= id then
      local len = redis.call('LLEN', key)
      local lo = 1
      local hi = len
      while lo < hi do
        local mid = math.floor((lo + hi) / 2)
        if redis.call('LINDEX', key, mid) < id then hi = mid else lo = mid + 1 end
      end
      if lo < maxlen and redis.call('LINDEX', key, lo - 1) ~= id then
        if lo < len then
          redis.call('LINSERT', key, 'BEFORE', redis.call('LINDEX', key, lo), id)
        else
          redis.call('RPUSH', key, id)
        end
        if len + 1 > maxlen then
          redis.call('LTRIM', key, 0, maxlen - 1)
        end
      end
    end
  end
end
return #KEYS
`;

/*
 * 1 つの list を降順・重複なしに並べ直す。既に整っていれば書き換えない。
 * list 型でない鍵は触らない (`list:` で始まる別用途の鍵があっても壊さない)。
 */
const SORT_SCRIPT = `
local key = KEYS[1]
if redis.call('TYPE', key).ok ~= 'list' then
  return 0
end
local items = redis.call('LRANGE', key, 0, -1)
local sorted = true
for i = 2, #items do
  if items[i] >= items[i - 1] then
    sorted = false
    break
  end
end
if sorted then
  return 0
end
table.sort(items, function(a, b) return a > b end)
local out = {}
local prev = nil
for _, v in ipairs(items) do
  if v ~= prev then
    out[#out + 1] = v
  end
  prev = v
end
redis.call('DEL', key)
for i = 1, #out, 1000 do
  redis.call('RPUSH', key, unpack(out, i, math.min(i + 999, #out)))
end
return 1
`;

const PUSH_COMMAND = 'tonerikoPushFanoutTimelines';
const SORT_COMMAND = 'tonerikoSortFanoutTimeline';

/** 1 回のスクリプト実行で扱う list の上限。フォロワー数千人の投稿でも 1 呼び出しが Valkey を長く占有しないよう分割する。 */
const KEYS_PER_CALL = 500;

/** 作成からこの時間を過ぎた投稿は末尾との比較を挟む。 */
const FRESH_WINDOW_MS = 1000 * 60 * 3;

/**
 * 既存の list をすべて降順・重複なしに並べ直し終えた印。読み取り側はこれがあるときだけ範囲読みをする。
 * 降順を保たない版の書き込みが並べ直しの後に走ると崩れが戻るので、版を入れ替えるときは旧版のプロセスを
 * すべて止めてから新しい版を起動する。
 */
const SORTED_MARKER_KEY = 'fanoutTimelineListsSorted';

/** 並べ直しで 1 回の SCAN・pipeline が扱う鍵の数。1 回の pipeline が Valkey を長く占有しないよう抑える。 */
const SORT_KEYS_PER_BATCH = 200;

const definedClients = new WeakSet<Redis.Redis>();

/** 印を確認済みの接続。印は消えても list の並びは崩れない (FLUSH で list ごと消える) ので、一度見たら問い合わせない。 */
const sortedClients = new WeakSet<Redis.Redis>();

type ListCommander = {
	[PUSH_COMMAND]: (numberOfKeys: number, ...args: (string | number)[]) => Promise<number>;
	[SORT_COMMAND]: (numberOfKeys: number, key: string) => Promise<number>;
};

/** ioredis の defineCommand は EVALSHA を試して NOSCRIPT なら EVAL に切り替える。接続ごとに 1 度だけ登録する。 */
function commander(redis: Redis.Redis): ListCommander {
	if (!definedClients.has(redis)) {
		redis.defineCommand(PUSH_COMMAND, { lua: PUSH_SCRIPT });
		redis.defineCommand(SORT_COMMAND, { lua: SORT_SCRIPT });
		definedClients.add(redis);
	}
	return redis as unknown as ListCommander;
}

export type FanoutTimelinePushTarget = { timeline: string; maxlen: number };

export class FanoutTimelinePush {
	private readonly targets: FanoutTimelinePushTarget[] = [];

	constructor(private readonly noteId: string) {}

	public add(timeline: string, maxlen: number): void {
		this.targets.push({ timeline, maxlen: Math.floor(maxlen) });
	}

	public async flush(redis: Redis.Redis): Promise<void> {
		if (this.targets.length === 0) {
			return;
		}

		const fresh = parseId(this.noteId).date.getTime() > Date.now() - FRESH_WINDOW_MS ? '1' : '0';
		const command = commander(redis);
		const calls: Promise<number>[] = [];
		for (let offset = 0; offset < this.targets.length; offset += KEYS_PER_CALL) {
			const chunk = this.targets.slice(offset, offset + KEYS_PER_CALL);
			calls.push(
				command[PUSH_COMMAND](
					chunk.length,
					...chunk.map((target) => `list:${target.timeline}`),
					this.noteId,
					fresh,
					...chunk.map((target) => target.maxlen),
				),
			);
		}
		await Promise.all(calls);
	}
}

/** 既存の list の並べ直しが済んでいるか。済むまでは読み取り側が全件を読んで並べ替える。 */
export async function isFanoutTimelineSortReady(redis: Redis.Redis): Promise<boolean> {
	if (sortedClients.has(redis)) {
		return true;
	}
	if ((await redis.exists(SORTED_MARKER_KEY)) === 0) {
		return false;
	}
	sortedClients.add(redis);
	return true;
}

/** 指定の list (`list:` を含む鍵、接頭辞なし) を降順・重複なしに並べ直す。 */
export async function sortFanoutTimelineLists(redis: Redis.Redis, keys: string[]): Promise<void> {
	const command = commander(redis);
	await Promise.all(keys.map((key) => command[SORT_COMMAND](1, key)));
}

/**
 * 既存の list をすべて並べ直し、終わったら印を付ける。印が既にあれば何もしない。
 *
 * 鍵ごとの並べ直しは Valkey 上で原子的に行うので、走っている間の書き込みとは衝突しない。並べ直し前の list への
 * 書き込みは位置がずれて入るが、後でその list を並べ直すときに直る。SCAN は走査の間ずっと存在する鍵を必ず返し、
 * 走査中に新しくできた list は降順を保つ書き込みだけで作られるので、走査が一周すれば全 list が整っている。
 * 印を付けるまで読み取り側は全件読みを続けるので、途中で止まっても結果は崩れない。止まった場合は次の起動で
 * 最初からやり直す (整っている list は読むだけで書き換えない)。
 */
export async function sortAllFanoutTimelineLists(
	redis: Redis.Redis,
	isStopped: () => boolean = () => false,
): Promise<{ completed: boolean; keys: number; rewritten: number }> {
	if ((await redis.exists(SORTED_MARKER_KEY)) === 1) {
		sortedClients.add(redis);
		return { completed: true, keys: 0, rewritten: 0 };
	}

	// SCAN の MATCH には ioredis の keyPrefix が付かず、返る鍵には付いている。スクリプトの KEYS には
	// ioredis が keyPrefix を付けるので、返った鍵からは外して渡す。
	const prefix = redis.options.keyPrefix ?? '';
	const pattern = `${prefix.replaceAll(/[*?[\]\\]/g, '\\$&')}list:*`;
	const command = commander(redis);
	let cursor = '0';
	let keys = 0;
	let rewritten = 0;
	do {
		if (isStopped()) {
			return { completed: false, keys, rewritten };
		}
		const [next, found] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', SORT_KEYS_PER_BATCH);
		cursor = next;
		const results = await Promise.all(found.map((key) => command[SORT_COMMAND](1, key.slice(prefix.length))));
		keys += found.length;
		rewritten += results.filter((result) => result === 1).length;
	} while (cursor !== '0');

	await redis.set(SORTED_MARKER_KEY, '1');
	sortedClients.add(redis);
	return { completed: true, keys, rewritten };
}

/**
 * 起動時に既存の list の並べ直しを裏で始める。ホストごとにデーモンを持つ 1 プロセスだけが呼ぶ
 * (複数ホストで同時に走っても、鍵ごとの並べ直しは冪等なので結果は同じ)。
 * dispose は走査を次の区切りで止め、実行中の pipeline の完了を待つ (接続を閉じる前に呼ぶ)。
 */
export function startFanoutTimelineSort(
	redis: Redis.Redis,
	logger: Pick<Logger, 'info' | 'error'>,
): {
	dispose: () => Promise<void>;
} {
	let stopped = false;
	const running = sortAllFanoutTimelineLists(redis, () => stopped).then(
		(result) => {
			if (result.completed && result.keys > 0) {
				logger.info(`Sorted timeline lists: ${result.rewritten} of ${result.keys} rewritten`);
			}
		},
		(error: unknown) => {
			// 印を付けずに終わるので、読み取りは全件読みのまま正しく動く。次の起動でやり直す。
			logger.error('Failed to sort timeline lists; timelines keep reading whole lists', { e: error });
		},
	);
	return {
		dispose: async () => {
			stopped = true;
			await running;
		},
	};
}
