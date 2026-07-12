/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { StorybookConfig } from '@storybook/vue3-vite';
import { type Plugin, type PluginOption, mergeConfig } from 'vite';
import turbosnap from 'vite-plugin-turbosnap';

const require = createRequire(import.meta.url);
const storybookDir = dirname(fileURLToPath(import.meta.url));

const config = {
	stories: ['../src/**/*.stories.@(js|jsx|ts|tsx)'],
	staticDirs: [{ from: '../assets', to: '/client-assets' }],
	framework: {
		name: getAbsolutePath('@storybook/vue3-vite') as '@storybook/vue3-vite',
		options: {},
	},
	core: {
		disableTelemetry: true,
	},
	async viteFinal(viteConfig) {
		const isNamedPlugin = (plugin: Plugin | false | null | undefined, name: string): plugin is Plugin =>
			!!plugin && plugin.name === name;

		const replacePluginForIsChromatic =
			viteConfig.plugins?.findIndex(
				(plugin) => !Array.isArray(plugin) && !(plugin instanceof Promise) && isNamedPlugin(plugin, 'replace'),
			) ?? -1;
		if (~replacePluginForIsChromatic) {
			viteConfig.plugins?.splice(replacePluginForIsChromatic, 1);
		}

		const unsupportedPlugins = new Set(['autoAssignMarkerId', 'remove-unref-i18n', 'UnwindCssModuleClassName']);
		const filterUnsupportedPlugins = (plugins: PluginOption[]): PluginOption[] =>
			plugins.flatMap((plugin) => {
				if (Array.isArray(plugin)) return filterUnsupportedPlugins(plugin);
				if (plugin && !(plugin instanceof Promise) && unsupportedPlugins.has(plugin.name)) return [];
				return [plugin];
			});
		viteConfig.plugins = filterUnsupportedPlugins(viteConfig.plugins ?? []);

		return mergeConfig(viteConfig, {
			plugins: [
				{
					name: 'resolve-storybook-support-modules',
					enforce: 'pre',
					resolveId(source: string) {
						const match = /(?:^|\/)\.storybook\/(charts|fake-utils|fakes|mocks)(?:\.js)?$/.exec(source);
						return match?.[1] ? join(storybookDir, `${match[1]}.ts`) : null;
					},
				},
				{
					// XXX: https://github.com/IanVS/vite-plugin-turbosnap/issues/8
					...(turbosnap as any as (typeof turbosnap)['default'])({
						rootDir: viteConfig.root ?? process.cwd(),
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
