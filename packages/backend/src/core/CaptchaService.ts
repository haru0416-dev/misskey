/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import { bindThis } from '@/decorators.js';
import { MetaService } from '@/core/MetaService.js';
import Logger from '@/logger.js';
import { LoggerService } from './LoggerService.js';
import {
	getCaptchaSetting,
	saveCaptchaSetting,
	verifyHcaptcha,
	verifyMcaptcha,
	verifyRecaptcha,
	verifyTestcaptcha,
	verifyTurnstile,
	type CaptchaProvider,
	type CaptchaSaveResult,
	type CaptchaSetting,
} from './CaptchaLogic.js';

export {
	CaptchaError,
	captchaErrorCodes,
	supportedCaptchaProviders,
} from './CaptchaLogic.js';
export type {
	CaptchaErrorCode,
	CaptchaProvider,
	CaptchaSaveFailure,
	CaptchaSaveResult,
	CaptchaSaveSuccess,
	CaptchaSetting,
} from './CaptchaLogic.js';

@Injectable()
export class CaptchaService {
	private readonly logger: Logger;

	constructor(
		private httpRequestService: HttpRequestService,
		private metaService: MetaService,
		loggerService: LoggerService,
	) {
		this.logger = loggerService.getLogger('captcha');
	}

	@bindThis
	public async verifyRecaptcha(secret: string, response: string | null | undefined): Promise<void> {
		return await verifyRecaptcha(this.httpRequestService, secret, response);
	}

	@bindThis
	public async verifyHcaptcha(secret: string, response: string | null | undefined): Promise<void> {
		return await verifyHcaptcha(this.httpRequestService, secret, response);
	}

	@bindThis
	public async verifyMcaptcha(secret: string, siteKey: string, instanceHost: string, response: string | null | undefined): Promise<void> {
		return await verifyMcaptcha(this.httpRequestService, secret, siteKey, instanceHost, response);
	}

	@bindThis
	public async verifyTurnstile(secret: string, response: string | null | undefined): Promise<void> {
		return await verifyTurnstile(this.httpRequestService, secret, response);
	}

	@bindThis
	public async verifyTestcaptcha(response: string | null | undefined): Promise<void> {
		return await verifyTestcaptcha(response);
	}

	@bindThis
	public async get(): Promise<CaptchaSetting> {
		return getCaptchaSetting(await this.metaService.fetch(true));
	}

	@bindThis
	public async save(
		provider: CaptchaProvider,
		params?: {
			sitekey?: string | null;
			secret?: string | null;
			instanceUrl?: string | null;
			captchaResult?: string | null;
		},
	): Promise<CaptchaSaveResult> {
		return await saveCaptchaSetting({
			httpRequestService: this.httpRequestService,
			updateMeta: async data => {
				await this.metaService.update(data);
			},
			logger: this.logger,
		}, provider, params);
	}
}
