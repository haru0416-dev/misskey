/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import _Ajv from 'ajv';
import type { Schema, SchemaType } from '@/misc/json-schema.js';
import { invalidParamError } from './error.js';

const Ajv = _Ajv.default;

const ajv = new Ajv({
	useDefaults: true,
});

ajv.addFormat('misskey:id', /^[a-zA-Z0-9]+$/);

const validators = new WeakMap<Schema, ReturnType<typeof ajv.compile>>();

function validatorFor(schema: Schema): ReturnType<typeof ajv.compile> {
	const cached = validators.get(schema);
	if (cached != null) return cached;

	const validate = ajv.compile(schema);
	validators.set(schema, validate);
	return validate;
}

export function parseHonoApiParams<Def extends Schema>(schema: Def, body: Record<string, unknown>): SchemaType<Def> {
	const params = { ...body };
	const validate = validatorFor(schema);
	const valid = validate(params);

	if (!valid) {
		const error = validate.errors?.[0];
		throw invalidParamError({
			param: error?.schemaPath ?? '',
			reason: error?.message ?? 'invalid parameter',
		});
	}

	return params as SchemaType<Def>;
}
