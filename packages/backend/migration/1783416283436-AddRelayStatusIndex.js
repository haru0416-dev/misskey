/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddRelayStatusIndex1783416283436 {
    name = 'AddRelayStatusIndex1783416283436'

    async up(queryRunner) {
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_relay_status" ON "relay" ("status")`);
    }

    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_relay_status"`);
    }
}
