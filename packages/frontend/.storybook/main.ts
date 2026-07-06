/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { StorybookConfig } from '@storybook/vue3-vite';
import { type Plugin, mergeConfig } from 'vite';
import turbosnap from 'vite-plugin-turbosnap';

const require = createRequire(import.meta.url);

const config = {
	stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|ts|tsx)'],
	staticDirs: [{ from: '../assets', to: '/client-assets' }],
	addons: [
		getAbsolutePath('@storybook/addon-docs'),
		getAbsolutePath('@storybook/addon-links'),
	],
	framework: {
		name: getAbsolutePath('@storybook/vue3-vite') as '@storybook/vue3-vite',
		options: {},
	},
	core: {
		disableTelemetry: true,
	},
	async viteFinal(config) {
		const isNamedPlugin = (plugin: Plugin | false | null | undefined, name: string): plugin is Plugin => !!plugin && plugin.name === name;

		const replacePluginForIsChromatic = config.plugins?.findIndex((plugin) => !Array.isArray(plugin) && !(plugin instanceof Promise) && isNamedPlugin(plugin, 'replace')) ?? -1;
		if (~replacePluginForIsChromatic) {
			config.plugins?.splice(replacePluginForIsChromatic, 1);
		}

		//pluginsからcreateSearchIndexを削除、複数あるかもしれないので全て削除
		config.plugins = config.plugins?.filter((plugin) => !(!Array.isArray(plugin) && !(plugin instanceof Promise) && isNamedPlugin(plugin, 'createSearchIndex'))) ?? [];

		return mergeConfig(config, {
			plugins: [
				{
					// XXX: https://github.com/IanVS/vite-plugin-turbosnap/issues/8
					...(turbosnap as any as typeof turbosnap['default'])({
						rootDir: config.root ?? process.cwd(),
					}),
					name: 'fake-turbosnap',
				},
			],
		});
	},
} satisfies StorybookConfig;
export default config;

function getAbsolutePath(value: string): string {
	return dirname(require.resolve(join(value, 'package.json')));
}
