/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// DB collation が C 以外 (en_US.utf8 等) の環境では通常の btree インデックスが
// LIKE 'foo%' の前方一致に使えず、ユーザー名検索/補完 (usernameLower LIKE ?) が
// 毎回 user テーブルの全表走査になる。varchar_pattern_ops 付きの btree を追加して
// 前方一致をインデックススキャンにする。等値検索は既存インデックスがそのまま使われる。
export class AddUsernameLowerPatternOpsIndex1783477487850 {
    name = 'AddUsernameLowerPatternOpsIndex1783477487850'

    async up(queryRunner) {
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_USER_USERNAME_LOWER_PATTERN" ON "user" ("usernameLower" varchar_pattern_ops)`);
    }

    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_USER_USERNAME_LOWER_PATTERN"`);
    }
}
