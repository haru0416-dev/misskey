/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import shader from './blur.glsl';
import type { ImageEffectorUiDefinition } from '../effect/ImageEffector.js';
import type { ImageEffectorRegionParams } from '../effect/region.js';
import { regionParamDefs, setRegionUniforms } from '../effect/region.js';
import { defineImageCompositorFunction } from '@/features/image-editor/core/ImageCompositor.js';
import { i18n } from '@/i18n.js';

export const fn = defineImageCompositorFunction<
	ImageEffectorRegionParams & {
		radius: number;
	}
>({
	shader,
	main: (ctx) => {
		setRegionUniforms(ctx);
		const { gl, u, params } = ctx;
		gl.uniform1f(u('radius'), params.radius);
	},
});

export const uiDefinition = {
	name: i18n.ts._imageEffector._fxs.blur,
	params: {
		...regionParamDefs,
		radius: {
			label: i18n.ts._imageEffector._fxProps.strength,
			type: 'number',
			default: 0.15,
			min: 0.0,
			max: 0.3,
			step: 0.01,
		},
	},
} satisfies ImageEffectorUiDefinition<typeof fn>;
