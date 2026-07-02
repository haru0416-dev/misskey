/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as os from 'node:os';
import type { Config } from '@/config.js';
import { packMetaDetailed, packMetaLite } from '@/core/MetaEntityPacker.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { Packed, SchemaType } from '@/misc/json-schema.js';
import type { MiMeta } from '@/models/_.js';
import { parseHonoApiParams } from './hono-api-validation.js';

export type HonoApiMetaDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	meta: MiMeta;
};

const metaParamDef = {
	type: 'object',
	properties: {
		detail: { type: 'boolean', default: true },
	},
	required: [],
} as const;

const testParamDef = {
	type: 'object',
	properties: {
		required: { type: 'boolean' },
		string: { type: 'string' },
		default: { type: 'string', default: 'hello' },
		nullableDefault: { type: 'string', nullable: true, default: 'hello' },
		id: { type: 'string', format: 'misskey:id' },
	},
	required: ['required'],
} as const;

type MetaParams = SchemaType<typeof metaParamDef>;
type TestParams = SchemaType<typeof testParamDef>;

export async function handleHonoApiMeta(
	deps: HonoApiMetaDependencies,
	body: Record<string, unknown>,
): Promise<Packed<'MetaLite'> | Packed<'MetaDetailed'>> {
	const params = parseHonoApiParams(metaParamDef, body) as MetaParams;
	return params.detail ? await packMetaDetailed(deps) : await packMetaLite(deps);
}

export function handleHonoApiPing(): { pong: number } {
	return {
		pong: Date.now(),
	};
}

export function handleHonoApiTest(body: Record<string, unknown>): TestParams {
	return parseHonoApiParams(testParamDef, body) as TestParams;
}

export async function handleHonoApiServerInfo(meta: MiMeta): Promise<{
	machine: string;
	cpu: {
		model: string;
		cores: number;
	};
	mem: {
		total: number;
	};
	fs: {
		total: number;
		used: number;
	};
}> {
	if (!meta.enableServerMachineStats) {
		return {
			machine: '?',
			cpu: {
				model: '?',
				cores: 0,
			},
			mem: {
				total: 0,
			},
			fs: {
				total: 0,
				used: 0,
			},
		};
	}

	const systemInformation = await import('systeminformation');
	const [memStats, fsStats] = await Promise.all([
		systemInformation.mem(),
		systemInformation.fsSize(),
	]);

	return {
		machine: os.hostname(),
		cpu: {
			model: os.cpus()[0].model,
			cores: os.cpus().length,
		},
		mem: {
			total: memStats.total,
		},
		fs: {
			total: fsStats[0].size,
			used: fsStats[0].used,
		},
	};
}
