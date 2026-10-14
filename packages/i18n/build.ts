/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { basename, dirname, resolve } from 'node:path';
import { watch as chokidarWatch } from 'chokidar';
import { build } from 'tsdown';
import { generateLocaleInterface } from './scripts/generateLocaleInterface.js';
import { parseLocaleYaml } from './scripts/parseLocaleYaml.js';
import { languages } from './src/const.js';
import type { ILocale } from './src/types.js';
import type { InlineConfig } from 'tsdown';

const _filename = fileURLToPath(import.meta.url);
const _dirname = dirname(_filename);
const _package = JSON.parse(fs.readFileSync(_dirname + '/package.json', 'utf-8'));
const _rootPackageDir = resolve(_dirname, '../../');
const _rootPackage = JSON.parse(fs.readFileSync(resolve(_rootPackageDir, 'package.json'), 'utf-8'));
const _frontendLocalesDir = resolve(_dirname, '../../built/_frontend_dist_/locales');
const _localesDir = resolve(_rootPackageDir, 'locales');

const localeFiles = new Set(languages.map((lang) => `${lang}.yml`));
const production = process.env.NODE_ENV === 'production';

// 型定義は TypeScript 7 のネイティブ版で出す。このパッケージの typescript は、翻訳の型の生成に JS API を使うため 6 のままにしている。
// tsdown の既定では、解決できる typescript (6) の JS API で出すので、時間が約 1.9 倍、メモリが約 1.8 倍かかる (1.4 秒・385MB と 0.73 秒・210MB)。
async function resolveTsgoPath(): Promise<string> {
	const typescriptNative = dirname(createRequire(import.meta.url).resolve('typescript-native/package.json'));
	const { default: getExePath } = await import(pathToFileURL(resolve(typescriptNative, 'lib/getExePath.js')).href);
	return getExePath();
}

const args = new Set(process.argv.slice(2).map((arg) => arg.toLowerCase()));

const options: InlineConfig = {
	config: false,
	cwd: _dirname,
	// 利用側が i18n/const のように下の階層を import するので、まとめずに src のファイルごとに出す
	entry: ['./src/**/*.{ts,tsx}'],
	unbundle: true,
	format: 'esm',
	platform: 'node',
	target: 'es2022',
	outDir: 'built',
	// package.json の exports が指す .js と .d.ts の名前で出す
	fixedExtension: false,
	sourcemap: true,
	minify: production,
	// 本番のビルドでは型定義を使わないので出さない。型定義の source map は、出さない設定でも .d.ts に参照のコメントが付くため出す
	dts: production ? false : { sourcemap: true, generator: 'tsgo', tsgo: { path: await resolveTsgoPath() } },
	clean: !args.has('--no-clean'),
	logLevel: 'warn',
};

if (args.has('--watch')) {
	await watchSrc();
} else {
	await buildSrc();
}

// `/locales` には翻訳進捗70%未満の言語も Crowdin から同期されるが、const.ts の languages に無い言語は
// build() から参照されないため、コピーするとビルド毎の I/O と成果物が無駄に増える。
function writeLocales(): void {
	const srcDir = _localesDir;
	const destDir = resolve(_dirname, 'built/locales');

	fs.mkdirSync(destDir, { recursive: true });

	const files = languages.map((lang) => `${lang}.yml`).filter((f) => fs.existsSync(resolve(srcDir, f)));
	for (const file of files) {
		const locale = parseLocaleYaml<ILocale>(fs.readFileSync(resolve(srcDir, file), 'utf8'));
		fs.writeFileSync(resolve(destDir, file.replace(/\.yml$/, '.json')), JSON.stringify(locale), 'utf8');
	}
	console.log(`[${_package.name}] locales written (${files.length} files).`);
}

async function writeFrontendLocalesJson(useCachedLocales = false): Promise<void> {
	// locale生成・コピー後の、今回ビルドしたモジュールを読む必要があるため動的importする。
	const { locales, writeFrontendLocalesJson: write } = await import('./built/index.js');
	await write(_frontendLocalesDir, _rootPackage.version, useCachedLocales ? locales : undefined);
	console.log(`[${_package.name}] frontend locales JSON written to ${_frontendLocalesDir}`);
}

async function buildSrc(): Promise<void> {
	console.log(`[${_package.name}] start building...`);

	await generateLocaleInterface(_localesDir);

	await build(options);
	console.log(`[${_package.name}] build succeeded.`);

	writeLocales();
	await writeFrontendLocalesJson(true);

	console.log(`[${_package.name}] finish building.`);
}

async function watchSrc(): Promise<void> {
	const localesWatcher = chokidarWatch(_localesDir, {
		ignoreInitial: true,
	});
	let localeBuildQueue = Promise.resolve();
	localesWatcher.on('all', (event, path) => {
		const file = basename(path);
		if (!localeFiles.has(file)) {
			return;
		}
		localeBuildQueue = localeBuildQueue
			.then(async () => {
				console.log(`[${_package.name}] locales changed: ${event} ${path}`);
				writeLocales();
				await writeFrontendLocalesJson();
				if (file === 'ja-JP.yml') {
					await generateLocaleInterface(_localesDir);
				}
			})
			.catch((error) => {
				console.error(`[${_package.name}] locale rebuild failed:`, error);
			});
	});

	console.log(`[${_package.name}] start watching...`);

	// 型定義もソースの変更ごとに tsdown が出し直す
	const handle = await build({ ...options, watch: true });

	await new Promise((resolve, reject) => {
		process.on('SIGHUP', resolve);
		process.on('SIGINT', resolve);
		process.on('SIGTERM', resolve);
		process.on('uncaughtException', reject);
		process.on('exit', resolve);
	}).finally(async () => {
		await handle.watch.close();
		await localesWatcher.close();
		console.log(`[${_package.name}] finish watching.`);
	});
}
