/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddFollowingAndReactionCompositeIndexes1783468167928 {
    name = 'AddFollowingAndReactionCompositeIndexes1783468167928'

    async up(queryRunner) {
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_FOLLOWING_FOLLOWEE_ID_ID" ON "following" ("followeeId", "id")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_FOLLOWING_FOLLOWER_ID_ID" ON "following" ("followerId", "id")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_NOTE_REACTION_NOTE_ID_ID" ON "note_reaction" ("noteId", "id")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_NOTE_REACTION_USER_ID_ID" ON "note_reaction" ("userId", "id")`);
    }

    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_NOTE_REACTION_USER_ID_ID"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_NOTE_REACTION_NOTE_ID_ID"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_FOLLOWING_FOLLOWER_ID_ID"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_FOLLOWING_FOLLOWEE_ID_ID"`);
    }
}
