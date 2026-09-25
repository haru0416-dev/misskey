/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import shader from './pixelate.glsl';
import type { ImageEffectorUiDefinition } from '../effect/ImageEffector.js';
import type { ImageEffectorRegionParams } from '../effect/region.js';
import { regionParamDefs, setRegionUniforms } from '../effect/region.js';
import { defineImageCompositorFunction } from '@/features/image-editor/core/ImageCompositor.js';
import { i18n } from '@/i18n.js';

export const fn = defineImageCompositorFunction<
	ImageEffectorRegionParams & {
		strength: number;
	}
>({
	shader,
	main: (ctx) => {
		setRegionUniforms(ctx);
		const { gl, u, params } = ctx;
		gl.uniform1f(u('strength'), params.strength * params.strength);
	},
});

export const uiDefinition = {
	name: i18n.ts._imageEffector._fxs.pixelate,
	params: {
		...regionParamDefs,
		strength: {
			label: i18n.ts._imageEffector._fxProps.strength,
			type: 'number',
			default: 0.2,
			min: 0.0,
			max: 0.5,
			step: 0.01,
		},
	},
} satisfies ImageEffectorUiDefinition<typeof fn>;
