/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const isConcurrentIndexMigrationEnabled = process.env.MISSKEY_MIGRATION_CREATE_INDEX_CONCURRENTLY === '1';
const createdByThisMigration = 'created by AddDatabaseTuningIndexes1782863440578';
const tuningIndexes = [
    { name: 'IDX_CHANNEL_MUTING_USER_ID_CHANNEL_ID_UNIQUE', definition: 'ON "channel_muting" ("userId", "channelId")', unique: true },
    { name: 'IDX_SW_SUBSCRIPTION_USER_ID_ENDPOINT_UNIQUE', definition: 'ON "sw_subscription" ("userId", "endpoint")', unique: true },
    { name: 'IDX_NOTE_FILE_IDS', definition: 'ON "note" USING gin ("fileIds")' },
    { name: 'IDX_NOTE_VISIBLE_USER_IDS', definition: 'ON "note" USING gin ("visibleUserIds")' },
    { name: 'IDX_NOTE_MENTIONS', definition: 'ON "note" USING gin ("mentions")' },
    { name: 'IDX_NOTE_TAGS', definition: 'ON "note" USING gin ("tags")' },
    { name: 'IDX_NOTE_DRAFT_FILE_IDS', definition: 'ON "note_draft" USING gin ("fileIds")' },
    { name: 'IDX_NOTE_DRAFT_VISIBLE_USER_IDS', definition: 'ON "note_draft" USING gin ("visibleUserIds")' },
    { name: 'IDX_EMOJI_ROLE_IDS', definition: 'ON "emoji" USING gin ("roleIdsThatCanBeUsedThisEmojiAsReaction")' },
    { name: 'IDX_system_webhook_isActive', definition: 'ON "system_webhook" ("isActive")' },
    { name: 'IDX_system_webhook_on', definition: 'ON "system_webhook" USING gin ("on")' },
    { name: 'IDX_SIGNIN_USER_ID_ID', definition: 'ON "signin" ("userId", "id")' },
    { name: 'IDX_MODERATION_LOG_TYPE_ID', definition: 'ON "moderation_log" ("type", "id")' },
    { name: 'IDX_MODERATION_LOG_USER_ID_ID', definition: 'ON "moderation_log" ("userId", "id")' },
    { name: 'IDX_ABUSE_USER_REPORT_RESOLVED_ID', definition: 'ON "abuse_user_report" ("resolved", "id")' },
    { name: 'IDX_ABUSE_USER_REPORT_TARGET_HOST_ID', definition: 'ON "abuse_user_report" ("targetUserHost", "id")' },
    { name: 'IDX_ABUSE_USER_REPORT_REPORTER_HOST_ID', definition: 'ON "abuse_user_report" ("reporterHost", "id")' },
    { name: 'IDX_PAGE_EYE_CATCHING_IMAGE_ID', definition: 'ON "page" ("eyeCatchingImageId")' },
    { name: 'IDX_ABUSE_USER_REPORT_ASSIGNEE_ID', definition: 'ON "abuse_user_report" ("assigneeId")' },
    { name: 'IDX_ACCESS_TOKEN_APP_ID', definition: 'ON "access_token" ("appId")' },
    { name: 'IDX_ANTENNA_USER_LIST_ID', definition: 'ON "antenna" ("userListId")' },
    { name: 'IDX_AUTH_SESSION_USER_ID', definition: 'ON "auth_session" ("userId")' },
    { name: 'IDX_AUTH_SESSION_APP_ID', definition: 'ON "auth_session" ("appId")' },
    { name: 'IDX_CHANNEL_BANNER_ID', definition: 'ON "channel" ("bannerId")' },
    { name: 'IDX_CHAT_MESSAGE_FILE_ID', definition: 'ON "chat_message" ("fileId")' },
    { name: 'IDX_CLIP_FAVORITE_CLIP_ID', definition: 'ON "clip_favorite" ("clipId")' },
    { name: 'IDX_FLASH_LIKE_FLASH_ID', definition: 'ON "flash_like" ("flashId")' },
    { name: 'IDX_GALLERY_LIKE_POST_ID', definition: 'ON "gallery_like" ("postId")' },
    { name: 'IDX_PAGE_LIKE_PAGE_ID', definition: 'ON "page_like" ("pageId")' },
    { name: 'IDX_PROMO_READ_NOTE_ID', definition: 'ON "promo_read" ("noteId")' },
    { name: 'IDX_USER_LIST_FAVORITE_USER_LIST_ID', definition: 'ON "user_list_favorite" ("userListId")' },
    { name: 'IDX_SW_SUBSCRIPTION_ENDPOINT', definition: 'ON "sw_subscription" ("endpoint")' },
];
const replacedIndexes = [
    { name: 'IDX_b96870ed326ccc7fa243970965', definition: 'ON "channel_muting" ("userId", "channelId")' },
    { name: 'IDX_97754ca6f2baff9b4abb7f853d', definition: 'ON "sw_subscription" ("userId")' },
];

function quoteIdentifier(identifier) {
    return `"${identifier.replaceAll('"', '""')}"`;
}

async function indexExists(queryRunner, indexName) {
    const result = await queryRunner.query('SELECT to_regclass($1) IS NOT NULL AS "exists"', [`public.${quoteIdentifier(indexName)}`]);
    return result[0]?.exists === true;
}

async function indexWasCreatedByThisMigration(queryRunner, indexName) {
    const result = await queryRunner.query('SELECT obj_description(to_regclass($1)::oid, $2) AS "comment"', [`public.${quoteIdentifier(indexName)}`, 'pg_class']);
    return result[0]?.comment === createdByThisMigration;
}

export class AddDatabaseTuningIndexes1782863440578 {
    name = 'AddDatabaseTuningIndexes1782863440578'
    transaction = isConcurrentIndexMigrationEnabled ? false : undefined

    async up(queryRunner) {
        const concurrently = isConcurrentIndexMigrationEnabled ? 'CONCURRENTLY ' : '';

        await queryRunner.query(`
            DELETE FROM "channel_muting" AS "muting"
            USING (
                SELECT
                    "id",
                    ROW_NUMBER() OVER (
                        PARTITION BY "userId", "channelId"
                        ORDER BY ("expiresAt" IS NULL) DESC, "expiresAt" DESC NULLS LAST, "id" DESC
                    ) AS "rank"
                FROM "channel_muting"
            ) AS "ranked"
            WHERE "muting"."id" = "ranked"."id"
                AND "ranked"."rank" > 1
        `);
        await queryRunner.query(`
            DELETE FROM "sw_subscription" AS "subscription"
            USING (
                SELECT
                    "id",
                    ROW_NUMBER() OVER (
                        PARTITION BY "userId", "endpoint"
                        ORDER BY "id" DESC
                    ) AS "rank"
                FROM "sw_subscription"
            ) AS "ranked"
            WHERE "subscription"."id" = "ranked"."id"
                AND "ranked"."rank" > 1
        `);

        for (const index of tuningIndexes) {
            if (await indexExists(queryRunner, index.name)) continue;

            const unique = index.unique ? 'UNIQUE ' : '';
            await queryRunner.query(`CREATE ${unique}INDEX ${concurrently}${quoteIdentifier(index.name)} ${index.definition}`);
            await queryRunner.query(`COMMENT ON INDEX ${quoteIdentifier(index.name)} IS '${createdByThisMigration}'`);
        }

        for (const index of replacedIndexes) {
            if (!await indexExists(queryRunner, index.name)) continue;

            await queryRunner.query(`DROP INDEX ${concurrently}${quoteIdentifier(index.name)}`);
        }
    }

    async down(queryRunner) {
        // TypeORM's migration:revert wraps down migrations in a transaction even when
        // the migration instance opts out, so rollback must use regular index DDL.
        const concurrently = '';

        for (const index of replacedIndexes) {
            if (await indexExists(queryRunner, index.name)) continue;

            await queryRunner.query(`CREATE INDEX ${concurrently}${quoteIdentifier(index.name)} ${index.definition}`);
        }

        for (const index of tuningIndexes.slice().reverse()) {
            if (!await indexWasCreatedByThisMigration(queryRunner, index.name)) continue;

            await queryRunner.query(`DROP INDEX ${concurrently}${quoteIdentifier(index.name)}`);
        }
    }
}
