import * as fs from 'node:fs/promises';
import url from 'node:url';
import path from 'node:path';
import locales from 'i18n';
import { spawnChecked } from '../../scripts/spawn-checked.mjs';
import { LocaleInliner } from './builder/locale-inliner.js';
import { createLogger } from './builder/logger';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

// 本体と埋め込み (/embed/*) は別のバンドル。互いに依存しないので並行してビルドする。
const targets = [
	{ config: 'vite.config.ts', outputDir: `${__dirname}/../../built/_frontend_vite_`, i18nFile: 'src/i18n.ts' },
	{
		config: 'vite.embed.config.ts',
		outputDir: `${__dirname}/../../built/_frontend_embed_vite_`,
		i18nFile: 'src/i18n.ts',
	},
];

async function buildAllLocale(outputDir: string, i18nFile: string) {
	const logger = createLogger();
	const inliner = await LocaleInliner.create({
		outputDir,
		logger,
		scriptsDir: 'scripts',
		i18nFile,
	});

	await inliner.loadFiles();

	inliner.collectsModifications();

	await inliner.saveAllLocales(locales);

	if (logger.errorCount > 0) {
		throw new Error(`Build failed with ${logger.errorCount} errors and ${logger.warningCount} warnings.`);
	}
}

await Promise.all(
	targets.map(async ({ config, outputDir, i18nFile }) => {
		await fs.rm(outputDir, { recursive: true, force: true });
		await spawnChecked([process.execPath, 'run', '--bun', 'vite', 'build', '--config', config], {
			cwd: __dirname,
		});
		await buildAllLocale(outputDir, i18nFile);
	}),
);
