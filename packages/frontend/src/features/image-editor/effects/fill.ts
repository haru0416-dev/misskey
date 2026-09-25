/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import shader from './fill.glsl';
import type { ImageEffectorUiDefinition } from '../effect/ImageEffector.js';
import type { ImageEffectorRegionParams } from '../effect/region.js';
import { regionParamDefs, setRegionUniforms } from '../effect/region.js';
import { defineImageCompositorFunction } from '@/features/image-editor/core/ImageCompositor.js';
import { i18n } from '@/i18n.js';

export const fn = defineImageCompositorFunction<
	ImageEffectorRegionParams & {
		color: [number, number, number];
		opacity: number;
	}
>({
	shader,
	main: (ctx) => {
		setRegionUniforms(ctx);
		const { gl, u, params } = ctx;
		gl.uniform3f(u('color'), params.color[0], params.color[1], params.color[2]);
		gl.uniform1f(u('opacity'), params.opacity);
	},
});

export const uiDefinition = {
	name: i18n.ts._imageEffector._fxs.fill,
	params: {
		...regionParamDefs,
		color: {
			label: i18n.ts._imageEffector._fxProps.color,
			type: 'color',
			default: [1, 1, 1],
		},
		opacity: {
			label: i18n.ts._imageEffector._fxProps.opacity,
			type: 'number',
			default: 1.0,
			min: 0.0,
			max: 1.0,
			step: 0.01,
			toViewValue: (v) => Math.round(v * 100) + '%',
		},
	},
} satisfies ImageEffectorUiDefinition<typeof fn>;
