/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import seedrandom from 'seedrandom';
import shader from './blockNoise.glsl';
import type { ImageEffectorUiDefinition } from '../effect/ImageEffector.js';
import { defineImageCompositorFunction } from '@/features/image-editor/core/ImageCompositor.js';
import { i18n } from '@/i18n.js';

type UniformLocations = {
	origins: (WebGLUniformLocation | undefined)[];
	strengths: (WebGLUniformLocation | undefined)[];
	sizes: (WebGLUniformLocation | undefined)[];
};

const locationsByProgram = new WeakMap<WebGLProgram, UniformLocations>();

function getLocation(
	locations: (WebGLUniformLocation | undefined)[],
	index: number,
	gl: WebGL2RenderingContext,
	program: WebGLProgram,
	name: string,
): WebGLUniformLocation {
	const cached = locations[index];
	if (cached !== undefined) return cached;
	const location = gl.getUniformLocation(program, name);
	if (location == null) throw new Error(`Uniform "${name}" is unavailable in block noise compositor function`);
	locations[index] = location;
	return location;
}

export const fn = defineImageCompositorFunction<{
	amount: number;
	strength: number;
	width: number;
	height: number;
	channelShift: number;
	seed: number;
}>({
	shader,
	main: ({ gl, program, u, params }) => {
		gl.uniform1i(u('amount'), params.amount);
		gl.uniform1f(u('channelShift'), params.channelShift);

		const margin = 0;

		const rnd = seedrandom(params.seed.toString());
		let locations = locationsByProgram.get(program);
		if (locations == null) {
			locations = { origins: [], strengths: [], sizes: [] };
			locationsByProgram.set(program, locations);
		}

		for (let i = 0; i < params.amount; i++) {
			const o = getLocation(locations.origins, i, gl, program, `u_shiftOrigins[${i.toString()}]`);
			gl.uniform2f(o, rnd() * (1 + margin * 2) - margin, rnd() * (1 + margin * 2) - margin);

			const s = getLocation(locations.strengths, i, gl, program, `u_shiftStrengths[${i.toString()}]`);
			gl.uniform1f(s, (1 - rnd() * 2) * params.strength);

			const sizes = getLocation(locations.sizes, i, gl, program, `u_shiftSizes[${i.toString()}]`);
			gl.uniform2f(sizes, params.width, params.height);
		}
	},
});

export const uiDefinition = {
	name: i18n.ts._imageEffector._fxs.glitch + ': ' + i18n.ts._imageEffector._fxs.blockNoise,
	params: {
		amount: {
			label: i18n.ts._imageEffector._fxProps.amount,
			type: 'number',
			default: 50,
			min: 1,
			max: 100,
			step: 1,
		},
		strength: {
			label: i18n.ts._imageEffector._fxProps.strength,
			type: 'number',
			default: 0.05,
			min: -1,
			max: 1,
			step: 0.01,
			toViewValue: (v) => Math.round(v * 100) + '%',
		},
		width: {
			label: i18n.ts.width,
			type: 'number',
			default: 0.05,
			min: 0.01,
			max: 1,
			step: 0.01,
			toViewValue: (v) => Math.round(v * 100) + '%',
		},
		height: {
			label: i18n.ts.height,
			type: 'number',
			default: 0.01,
			min: 0.01,
			max: 1,
			step: 0.01,
			toViewValue: (v) => Math.round(v * 100) + '%',
		},
		channelShift: {
			label: i18n.ts._imageEffector._fxProps.glitchChannelShift,
			type: 'number',
			default: 0,
			min: 0,
			max: 10,
			step: 0.01,
			toViewValue: (v) => Math.round(v * 100) + '%',
		},
		seed: {
			label: i18n.ts._imageEffector._fxProps.seed,
			type: 'seed',
			default: 100,
		},
	},
} satisfies ImageEffectorUiDefinition<typeof fn>;
