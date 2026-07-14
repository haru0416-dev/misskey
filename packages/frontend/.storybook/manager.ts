/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { addons } from 'storybook/manager-api';
import { create } from 'storybook/theming/create';

addons.setConfig({
	theme: create({
		base: 'dark',
		brandTitle: 'Erebia Storybook',
		brandImage: '/client-assets/erebia.svg',
	}),
});
