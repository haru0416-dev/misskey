/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Redis from 'ioredis';
import { parseId } from '@/misc/id/parse-id.js';

/*
 * 1 投稿を複数のタイムライン list へ入れる処理は Valkey 側の 1 スクリプトで回す。
 *
 * list ごとに lrem + lpush (+ ltrim) を pipeline に積むと、フォロワー 87 人の投稿で 215 コマンドになり、
 * その組み立て (引数の文字列化と Command オブジェクト生成) だけで notes/create の CPU の 10% を
 * 占めていた (2026-09-03 実測)。スクリプトなら送るのは鍵と上限の一覧だけで、ループはサーバー側で回る。
 *
 * lrem は outbox の再試行で同じ投稿を二重に入れないためのガードで、スクリプト内でも維持する。
 * 切り詰めは確率 1/10 ではなく LLEN で判定するので、list が上限を超えたまま残ることは無い。
 *
 * 作成から時間が経った投稿 (リモートからの遅延配信など) は list 末尾より新しいときだけ入れる。
 * ID の先頭 12 桁 (16 進) が UNIX ミリ秒なので、比較はスクリプト内で完結する。
 */
const PUSH_SCRIPT = `
local id = ARGV[1]
local fresh = ARGV[2] == '1'
local ts = tonumber(string.sub(id, 1, 12), 16)
for i, key in ipairs(KEYS) do
  local push = true
  if not fresh then
    local last = redis.call('LINDEX', key, -1)
    if last and tonumber(string.sub(last, 1, 12), 16) >= ts then
      push = false
    end
  end
  if push then
    redis.call('LREM', key, 0, id)
    redis.call('LPUSH', key, id)
    local maxlen = tonumber(ARGV[i + 2])
    if redis.call('LLEN', key) > maxlen then
      redis.call('LTRIM', key, 0, maxlen - 1)
    end
  end
end
return #KEYS
`;

const COMMAND_NAME = 'erebiaPushFanoutTimelines';

/** 1 回のスクリプト実行で扱う list の上限。フォロワー数千人の投稿でも 1 呼び出しが Valkey を長く占有しないよう分割する。 */
const KEYS_PER_CALL = 500;

/** 作成からこの時間を過ぎた投稿は末尾との比較を挟む (従来の閾値と同じ)。 */
const FRESH_WINDOW_MS = 1000 * 60 * 3;

const definedClients = new WeakSet<Redis.Redis>();

type PushCommander = {
	[COMMAND_NAME]: (numberOfKeys: number, ...args: (string | number)[]) => Promise<number>;
};

/** ioredis の defineCommand は EVALSHA を試して NOSCRIPT なら EVAL に切り替える。接続ごとに 1 度だけ登録する。 */
function commander(redis: Redis.Redis): PushCommander {
	if (!definedClients.has(redis)) {
		redis.defineCommand(COMMAND_NAME, { lua: PUSH_SCRIPT });
		definedClients.add(redis);
	}
	return redis as unknown as PushCommander;
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
				command[COMMAND_NAME](
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
