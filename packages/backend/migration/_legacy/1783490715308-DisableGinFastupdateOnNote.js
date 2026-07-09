/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// note テーブルの GIN インデックスは fastupdate (既定on) の pending list フラッシュに
// 当たった1件の INSERT が数百ms〜1秒超を負担するレイテンシスパイクを起こす
// (負荷計測で mean 2.7ms に対し max 1,427ms を観測)。fastupdate = off で
// メンテナンスコストを各 INSERT にサブms単位で均し、テールレイテンシを平坦化する。
export class DisableGinFastupdateOnNote1783490715308 {
    name = 'DisableGinFastupdateOnNote1783490715308'

    async up(queryRunner) {
        for (const index of ['IDX_NOTE_FILE_IDS', 'IDX_NOTE_VISIBLE_USER_IDS', 'IDX_NOTE_MENTIONS', 'IDX_NOTE_TAGS']) {
            await queryRunner.query(`ALTER INDEX "${index}" SET (fastupdate = off)`);
            // 既存のpending listを吐き切って以後のフラッシュ要因を消す
            await queryRunner.query(`SELECT gin_clean_pending_list('"${index}"'::regclass)`);
        }
    }

    async down(queryRunner) {
        for (const index of ['IDX_NOTE_FILE_IDS', 'IDX_NOTE_VISIBLE_USER_IDS', 'IDX_NOTE_MENTIONS', 'IDX_NOTE_TAGS']) {
            await queryRunner.query(`ALTER INDEX "${index}" RESET (fastupdate)`);
        }
    }
}
