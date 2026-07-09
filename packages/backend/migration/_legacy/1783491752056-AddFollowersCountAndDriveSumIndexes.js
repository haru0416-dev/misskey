/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// - user(followersCount): explore/recommendation・admin/show-users のソートが全表 Sort になっていた
// - drive_file(userId) INCLUDE(size) WHERE NOT isLink: アップロード毎の容量集計
//   (sumDriveFileSizeByUserId) を Index Only Scan 化し、ファイル数の多いユーザーのヒープアクセスを回避
// instance のソート列 (notesCount 等) は、連合アクティビティ毎に更新されるカウンタへの
// インデックス追加コストが管理UIの稀なソートに見合わないため意図的に見送り。
export class AddFollowersCountAndDriveSumIndexes1783491752056 {
    name = 'AddFollowersCountAndDriveSumIndexes1783491752056'

    async up(queryRunner) {
        await queryRunner.query('SET statement_timeout = 0');
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_USER_FOLLOWERS_COUNT" ON "user" ("followersCount")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_DRIVE_FILE_USER_ID_SIZE" ON "drive_file" ("userId") INCLUDE ("size") WHERE "isLink" = FALSE`);
    }

    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_DRIVE_FILE_USER_ID_SIZE"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_USER_FOLLOWERS_COUNT"`);
    }
}
