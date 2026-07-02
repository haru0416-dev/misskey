/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Misskey from 'misskey-js';
import { DI } from '@/di-symbols.js';
import { IdService } from '@/core/IdService.js';
import type { MiLocalUser } from '@/models/User.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { SigninEntityService } from '@/core/entities/SigninEntityService.js';
import { bindThis } from '@/decorators.js';
import { EmailService } from '@/core/EmailService.js';
import { NotificationService } from '@/core/NotificationService.js';
import { createSigninInDatabase } from '@/core/SigninStore.js';
import { fetchUserProfileByUserIdOrFailFromDatabase } from '@/core/UserProfileStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { getRequestIp } from '@/server/api/get-request-ip.js';
import type { FastifyRequest, FastifyReply } from 'fastify';

@Injectable()
export class SigninService {
	constructor(
		@Inject(DI.drizzle)
		private drizzle: MiDrizzleDatabase,

		private signinEntityService: SigninEntityService,
		private emailService: EmailService,
		private notificationService: NotificationService,
		private idService: IdService,
		private globalEventService: GlobalEventService,
	) {
	}

	@bindThis
	public signin(request: FastifyRequest, reply: FastifyReply, user: MiLocalUser) {
		setImmediate(async () => {
			this.notificationService.createNotification(user.id, 'login', {});

			const record = await createSigninInDatabase(this.drizzle, {
				id: this.idService.gen(),
				userId: user.id,
				ip: getRequestIp(request),
				headers: request.headers as any,
				success: true,
			});

			this.globalEventService.publishMainStream(user.id, 'signin', await this.signinEntityService.pack(record));

			const profile = await fetchUserProfileByUserIdOrFailFromDatabase(this.drizzle, user.id);
			if (profile.email && profile.emailVerified) {
				this.emailService.sendEmail(profile.email, 'New login / ログインがありました',
					'There is a new login. If you do not recognize this login, update the security status of your account, including changing your password. / 新しいログインがありました。このログインに心当たりがない場合は、パスワードを変更するなど、アカウントのセキュリティ状態を更新してください。',
					'There is a new login. If you do not recognize this login, update the security status of your account, including changing your password. / 新しいログインがありました。このログインに心当たりがない場合は、パスワードを変更するなど、アカウントのセキュリティ状態を更新してください。');
			}
		});

		reply.code(200);
		return {
			finished: true,
			id: user.id,
			i: user.token!,
		} satisfies Misskey.entities.SigninFlowResponse;
	}
}
