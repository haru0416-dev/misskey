import * as fs from 'node:fs/promises';
import url from 'node:url';
import path from 'node:path';
import locales from 'i18n';
import { spawnChecked } from '../../scripts/spawn-checked.mjs';
import { LocaleInliner } from '../frontend/builder/locale-inliner.js';
import { createLogger } from '../frontend/builder/logger';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const outputDir = __dirname + '/../../built/_frontend_embed_vite_';

async function viteBuild() {
	await spawnChecked([process.execPath, 'run', '--bun', 'vite', 'build'], {
		cwd: __dirname,
	});
}

async function buildAllLocale() {
	const logger = createLogger();
	const inliner = await LocaleInliner.create({
		outputDir,
		logger,
		scriptsDir: 'scripts',
		i18nFile: 'src/i18n.ts',
	});

	await inliner.loadFiles();

	inliner.collectsModifications();

	await inliner.saveAllLocales(locales);

	if (logger.errorCount > 0) {
		throw new Error(`Build failed with ${logger.errorCount} errors and ${logger.warningCount} warnings.`);
	}
}

async function build() {
	await fs.rm(outputDir, { recursive: true, force: true });
	await viteBuild();
	await buildAllLocale();
}

await build();
