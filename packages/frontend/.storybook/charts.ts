/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { HttpResponse, http } from 'msw';
import type { DefaultBodyType, HttpResponseResolver, JsonBodyType, PathParams } from 'msw';
import seedrandom from 'seedrandom';
import { action } from 'storybook/actions';

function getChartArray(seed: string, limit: number, option?: { accumulate?: boolean; mul?: number }): number[] {
	const rng = seedrandom(seed);
	const max = Math.floor(option?.mul ?? 250 * rng());
	let accumulation = 0;
	const array: number[] = [];
	for (let i = 0; i < limit; i++) {
		const num = Math.floor((max + 1) * rng());
		if (option?.accumulate) {
			accumulation += num;
			array.unshift(accumulation);
		} else {
			array.push(num);
		}
	}
	return array;
}

export function getChartResolver(
	fields: string[],
	option?: { accumulate?: boolean; mulMap?: Record<string, number> },
): HttpResponseResolver<PathParams, DefaultBodyType, JsonBodyType> {
	return ({ request }) => {
		action(`GET ${request.url}`)();
		const limitParam = new URL(request.url).searchParams.get('limit');
		const limit = limitParam ? parseInt(limitParam) : 30;
		const res = {};
		for (const field of fields) {
			const layers = field.split('.');
			const leafKey = layers.pop();
			if (leafKey == null) continue;
			let current = res as any;
			while (layers.length > 0) {
				const currentKey = layers.shift();
				if (currentKey == null) break;
				if (current[currentKey] == null) current[currentKey] = {};
				current = current[currentKey];
			}
			current[leafKey] = getChartArray(field, limit, {
				...(option?.accumulate === undefined ? {} : { accumulate: option.accumulate }),
				...(option?.mulMap != null && field in option.mulMap ? { mul: option.mulMap[field] } : {}),
			});
		}
		return HttpResponse.json(res);
	};
}
