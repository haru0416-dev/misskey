/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class DropUserProfileClientDataAndRoom1783562768357 {
	name = 'DropUserProfileClientDataAndRoom1783562768357'

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "user_profile" DROP COLUMN "clientData"`);
		await queryRunner.query(`ALTER TABLE "user_profile" DROP COLUMN "room"`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "user_profile" ADD COLUMN "room" jsonb NOT NULL DEFAULT '{}'`);
		await queryRunner.query(`ALTER TABLE "user_profile" ADD COLUMN "clientData" jsonb NOT NULL DEFAULT '{}'`);
		await queryRunner.query(`COMMENT ON COLUMN "user_profile"."clientData" IS 'The client-specific data of the User.'`);
		await queryRunner.query(`COMMENT ON COLUMN "user_profile"."room" IS 'The room data of the User.'`);
	}
}
