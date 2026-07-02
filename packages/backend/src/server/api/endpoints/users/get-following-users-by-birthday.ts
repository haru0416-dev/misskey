/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import type { Packed } from '@/misc/json-schema.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { listFollowingUsersByBirthdayDateFromDatabase } from '@/core/UserProfileStore.js';

export const meta = {
	tags: ['users'],

	requireCredential: true,
	kind: 'read:account',

	description: 'Retrieve users who have a birthday on the specified range.',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			properties: {
				id: {
					type: 'string',
					optional: false, nullable: false,
					format: 'misskey:id',
				},
				birthday: {
					type: 'string',
					optional: false, nullable: false,
				},
				user: {
					type: 'object',
					optional: false, nullable: false,
					ref: 'UserLite',
				},
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		offset: { type: 'integer', default: 0 },
		birthday: {
			oneOf: [{
				type: 'object',
				properties: {
					month: { type: 'integer', minimum: 1, maximum: 12 },
					day: { type: 'integer', minimum: 1, maximum: 31 },
				},
				required: ['month', 'day'],
			}, {
				type: 'object',
				properties: {
					begin: {
						type: 'object',
						properties: {
							month: { type: 'integer', minimum: 1, maximum: 12 },
							day: { type: 'integer', minimum: 1, maximum: 31 },
						},
						required: ['month', 'day'],
					},
					end: {
						type: 'object',
						properties: {
							month: { type: 'integer', minimum: 1, maximum: 12 },
							day: { type: 'integer', minimum: 1, maximum: 31 },
						},
						required: ['month', 'day'],
					},
				},
				required: ['begin', 'end'],
			}],
		},
	},
	required: ['birthday'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.drizzle)
		private db: MiDrizzleDatabase,

		private userEntityService: UserEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			let condition: Parameters<typeof listFollowingUsersByBirthdayDateFromDatabase>[2];
			if (Object.hasOwn(ps.birthday, 'begin') && Object.hasOwn(ps.birthday, 'end')) {
				const range = ps.birthday as { begin: { month: number; day: number }; end: { month: number; day: number }; };

				// 誕生日は mmdd の形式の最大4桁の数字（例: 8月30日 → 830）でインデックスが効くようになっているので、その形式に変換
				const begin = range.begin.month * 100 + range.begin.day;
				const end = range.end.month * 100 + range.end.day;
				condition = { type: 'range', begin, end };
			} else {
				const { month, day } = ps.birthday as { month: number; day: number };
				// なぜか get_birthday_date() = :birthday だとインデックスが効かないので、BETWEEN で対応
				condition = { type: 'single', value: month * 100 + day };
			}

			const birthdayUsers = await listFollowingUsersByBirthdayDateFromDatabase(this.db, me.id, condition, {
				offset: ps.offset,
				limit: ps.limit,
			});

			const users = new Map<string, Packed<'UserLite'>>((
				await this.userEntityService.packMany(
					birthdayUsers.map(u => u.userId),
					me,
					{ schema: 'UserLite' },
				)
			).map(u => [u.id, u]));

			return birthdayUsers
				.map(item => {
					const birthday = new Date();
					birthday.setHours(0, 0, 0, 0);
					// item.birthday_date は mmdd の形式の最大4桁の数字（例: 8月30日 → 830）で出力されるので、日付に戻してDateオブジェクトに設定
					birthday.setMonth(Math.floor(item.birthdayDate / 100) - 1, item.birthdayDate % 100);

					if (birthday.getTime() < new Date().setHours(0, 0, 0, 0)) {
						birthday.setFullYear(new Date().getFullYear() + 1);
					}

					const birthdayStr = `${birthday.getFullYear()}-${(birthday.getMonth() + 1).toString().padStart(2, '0')}-${(birthday.getDate()).toString().padStart(2, '0')}`;
					return {
						id: item.userId,
						birthday: birthdayStr,
						user: users.get(item.userId),
					};
				})
				.filter(item => item.user != null)
				.map(item => item as { id: string; birthday: string; user: Packed<'UserLite'> });
		});
	}
}
