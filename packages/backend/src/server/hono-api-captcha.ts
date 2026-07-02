/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { captchaErrorCodes, getCaptchaSetting, saveCaptchaSetting, supportedCaptchaProviders, type CaptchaError } from '@/core/CaptchaLogic.js';
import type { HttpRequestService } from '@/core/HttpRequestService.js';
import { fetchMetaFromDatabase, updateMetaInDatabase } from '@/core/MetaStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { SchemaType } from '@/misc/json-schema.js';
import type { MiMeta } from '@/models/_.js';
import type { HonoApiInternalEventPublisher } from './hono-api-events.js';
import { HonoApiError } from './hono-api-error.js';
import { parseHonoApiParams } from './hono-api-validation.js';

export type HonoApiCaptchaDependencies = {
	db: MiDrizzleDatabase;
	meta: MiMeta;
	httpRequestService: Pick<HttpRequestService, 'send'>;
	publishInternalEvent?: HonoApiInternalEventPublisher;
};

const captchaCurrentParamDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

const captchaSaveParamDef = {
	type: 'object',
	properties: {
		provider: {
			type: 'string',
			enum: supportedCaptchaProviders,
		},
		captchaResult: {
			type: 'string', nullable: true,
		},
		sitekey: {
			type: 'string', nullable: true,
		},
		secret: {
			type: 'string', nullable: true,
		},
		instanceUrl: {
			type: 'string', nullable: true,
		},
	},
	required: ['provider'],
} as const;

type CaptchaSaveParams = SchemaType<typeof captchaSaveParamDef>;

function captchaErrorToHonoApiError(error: CaptchaError): HonoApiError {
	switch (error.code) {
		case captchaErrorCodes.invalidProvider:
			return new HonoApiError({
				status: 400,
				message: error.message,
				code: 'INVALID_PROVIDER',
				id: '14bf7ae1-80cc-4363-acb2-4fd61d086af0',
			});
		case captchaErrorCodes.invalidParameters:
			return new HonoApiError({
				status: 400,
				message: error.message,
				code: 'INVALID_PARAMETERS',
				id: '26654194-410e-44e2-b42e-460ff6f92476',
			});
		case captchaErrorCodes.noResponseProvided:
			return new HonoApiError({
				status: 400,
				message: error.message,
				code: 'NO_RESPONSE_PROVIDED',
				id: '40acbba8-0937-41fb-bb3f-474514d40afe',
			});
		case captchaErrorCodes.requestFailed:
			return new HonoApiError({
				status: 500,
				message: error.message,
				code: 'REQUEST_FAILED',
				id: '0f4fe2f1-2c15-4d6e-b714-efbfcde231cd',
			});
		case captchaErrorCodes.verificationFailed:
			return new HonoApiError({
				status: 400,
				message: error.message,
				code: 'VERIFICATION_FAILED',
				id: 'c41c067f-24f3-4150-84b2-b5a3ae8c2214',
			});
		default:
			return new HonoApiError({
				status: 500,
				message: 'unknown',
				code: 'UNKNOWN',
				id: 'f868d509-e257-42a9-99c1-42614b031a97',
			});
	}
}

export async function handleHonoApiAdminCaptchaCurrent(
	deps: HonoApiCaptchaDependencies,
	body: Record<string, unknown>,
) {
	parseHonoApiParams(captchaCurrentParamDef, body);
	return getCaptchaSetting(await fetchMetaFromDatabase(deps.db));
}

export async function handleHonoApiAdminCaptchaSave(
	deps: HonoApiCaptchaDependencies,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(captchaSaveParamDef, body) as CaptchaSaveParams;
	const result = await saveCaptchaSetting({
		httpRequestService: deps.httpRequestService,
		updateMeta: async data => {
			const { before, after } = await updateMetaInDatabase(deps.db, data);
			Object.assign(deps.meta, after);
			deps.meta.rootUser = null;
			deps.publishInternalEvent?.('metaUpdated', { before, after });
		},
	}, params.provider, {
		sitekey: params.sitekey,
		secret: params.secret,
		instanceUrl: params.instanceUrl,
		captchaResult: params.captchaResult,
	});

	if (!result.success) {
		throw captchaErrorToHonoApiError(result.error);
	}
}
