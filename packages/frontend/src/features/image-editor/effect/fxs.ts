/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as checker from '../effects/checker.js';
import * as chromaticAberration from '../effects/chromaticAberration.js';
import * as colorAdjust from '../effects/colorAdjust.js';
import * as colorClamp from '../effects/colorClamp.js';
import * as colorClampAdvanced from '../effects/colorClampAdvanced.js';
import * as distort from '../effects/distort.js';
import * as polkadot from '../effects/polkadot.js';
import * as tearing from '../effects/tearing.js';
import * as grayscale from '../effects/grayscale.js';
import * as invert from '../effects/invert.js';
import * as mirror from '../effects/mirror.js';
import * as stripe from '../effects/stripe.js';
import * as threshold from '../effects/threshold.js';
import * as zoomLines from '../effects/zoomLines.js';
import * as blockNoise from '../effects/blockNoise.js';
import * as fill from '../effects/fill.js';
import * as blur from '../effects/blur.js';
import * as pixelate from '../effects/pixelate.js';
import type { ImageCompositorFunction } from '@/features/image-editor/core/ImageCompositor.js';
import type { ImageEffectorUiDefinition } from './ImageEffector.js';

export const FXS = {
	checker,
	chromaticAberration,
	colorAdjust,
	colorClamp,
	colorClampAdvanced,
	distort,
	polkadot,
	tearing,
	grayscale,
	invert,
	mirror,
	stripe,
	threshold,
	zoomLines,
	blockNoise,
	fill,
	blur,
	pixelate,
} as const satisfies Record<
	string,
	{
		readonly fn: ImageCompositorFunction<any>;
		readonly uiDefinition: ImageEffectorUiDefinition<any>;
	}
>;
