/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { IdService } from '@/core/IdService.js';
import type { Config } from '@/config.js';
import { DI } from '@/di-symbols.js';
import { EmailService } from '@/core/EmailService.js';
import { L_CHARS, secureRndstr } from '@/misc/secure-rndstr.js';
import { createPasswordResetRequestInDatabase } from '@/core/PasswordResetRequestStore.js';
import { fetchLocalUserByUsernameFromDatabase } from '@/core/UserStore.js';
import { fetchUserProfileByUserIdOrFailFromDatabase } from '@/core/UserProfileStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';

export const meta = {
	tags: ['reset password'],

	requireCredential: false,

	description: 'Request a users password to be reset.',

	limit: {
		duration: ms('1hour'),
		max: 3,
	},

	errors: {

	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		username: { type: 'string' },
		email: { type: 'string' },
	},
	required: ['username', 'email'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.drizzle)
		private drizzle: MiDrizzleDatabase,

		private idService: IdService,
		private emailService: EmailService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const user = await fetchLocalUserByUsernameFromDatabase(this.drizzle, ps.username);

			// 合致するユーザーが登録されていなかったら無視
			if (user == null) {
				return;
			}

			const profile = await fetchUserProfileByUserIdOrFailFromDatabase(this.drizzle, user.id);

			// 合致するメアドが登録されていなかったら無視
			if (profile.email !== ps.email) {
				return;
			}

			// メアドが認証されていなかったら無視
			if (!profile.emailVerified) {
				return;
			}

			const token = secureRndstr(64, { chars: L_CHARS });

			await createPasswordResetRequestInDatabase(this.drizzle, {
				id: this.idService.gen(),
				userId: profile.userId,
				token,
			});

			const link = `${this.config.url}/reset-password/${token}`;

			this.emailService.sendEmail(ps.email, 'Password reset requested',
				`To reset password, please click this link:<br><a href="${link}">${link}</a>`,
				`To reset password, please click this link: ${link}`);
		});
	}
}
