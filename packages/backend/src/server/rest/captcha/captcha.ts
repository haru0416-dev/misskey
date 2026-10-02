/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Params } from '../validation.js';
import { z } from 'zod';
import {
	captchaErrorCodes,
	getCaptchaSetting,
	saveCaptchaSetting,
	supportedCaptchaProviders,
} from '@/core/captcha/captcha-logic.js';
import type { CaptchaError } from '@/core/captcha/captcha-logic.js';
import type { HttpRequestService } from '@/core/net/http-request-service.js';
import { fetchMetaFromDatabase, updateMetaInDatabase } from '@/core/meta/meta-store.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiMeta } from '@/models/entities.js';
import { omitUndefined } from '@/misc/clone.js';
import { recordException } from '@/telemetry.js';
import type { InternalEventPublisher } from '../../../core/events.js';
import { ApiError } from '../error.js';
import { parseApiParams } from '../validation.js';

export type CaptchaDependencies = {
	db: MiDrizzleDatabase;
	meta: MiMeta;
	httpRequestService: Pick<HttpRequestService, 'send'>;
	publishInternalEvent?: InternalEventPublisher;
};

export const captchaCurrentParamDef = z.object({});

export const captchaSaveParamDef = z.object({
	provider: z.enum(supportedCaptchaProviders),
	captchaResult: z.string().nullable().optional(),
	sitekey: z.string().nullable().optional(),
	secret: z.string().nullable().optional(),
	instanceUrl: z.string().nullable().optional(),
});

function captchaErrorToApiError(error: CaptchaError): ApiError {
	switch (error.code) {
		case captchaErrorCodes.invalidProvider:
			return new ApiError({
				status: 400,
				message: 'Invalid provider.',
				code: 'INVALID_PROVIDER',
				id: '14bf7ae1-80cc-4363-acb2-4fd61d086af0',
			});
		case captchaErrorCodes.invalidParameters:
			return new ApiError({
				status: 400,
				message: 'Invalid parameters.',
				code: 'INVALID_PARAMETERS',
				id: '26654194-410e-44e2-b42e-460ff6f92476',
			});
		case captchaErrorCodes.noResponseProvided:
			return new ApiError({
				status: 400,
				message: 'No response provided.',
				code: 'NO_RESPONSE_PROVIDED',
				id: '40acbba8-0937-41fb-bb3f-474514d40afe',
			});
		case captchaErrorCodes.requestFailed:
			recordException(new Error(error.message));
			return new ApiError({
				status: 500,
				message: 'Request failed.',
				code: 'REQUEST_FAILED',
				id: '0f4fe2f1-2c15-4d6e-b714-efbfcde231cd',
				kind: 'server',
			});
		case captchaErrorCodes.verificationFailed:
			return new ApiError({
				status: 400,
				message: 'Verification failed.',
				code: 'VERIFICATION_FAILED',
				id: 'c41c067f-24f3-4150-84b2-b5a3ae8c2214',
			});
		default:
			recordException(new Error(error.message));
			return new ApiError({
				status: 500,
				message: 'unknown',
				code: 'UNKNOWN',
				id: 'f868d509-e257-42a9-99c1-42614b031a97',
				kind: 'server',
			});
	}
}

export async function handleApiAdminCaptchaCurrent(deps: CaptchaDependencies) {
	return getCaptchaSetting(await fetchMetaFromDatabase(deps.db));
}

export async function handleApiAdminCaptchaSave(
	deps: CaptchaDependencies,
	params: Params<typeof captchaSaveParamDef>,
): Promise<void> {
	const result = await saveCaptchaSetting(
		{
			httpRequestService: deps.httpRequestService,
			updateMeta: async (data) => {
				const { before, after } = await updateMetaInDatabase(deps.db, data);
				Object.assign(deps.meta, after);
				deps.meta.rootUser = null;
				deps.publishInternalEvent?.('metaUpdated', { ...(before === undefined ? {} : { before }), after });
			},
		},
		params.provider,
		omitUndefined({
			sitekey: params.sitekey,
			secret: params.secret,
			instanceUrl: params.instanceUrl,
			captchaResult: params.captchaResult,
		}),
	);

	if (!result.success) {
		throw captchaErrorToApiError(result.error);
	}
}
