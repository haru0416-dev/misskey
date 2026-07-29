/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { basename, dirname, resolve } from 'node:path';
import { watch as chokidarWatch } from 'chokidar';
import * as esbuild from 'esbuild';
import { build } from 'esbuild';
import { generateLocaleInterface } from './scripts/generateLocaleInterface.js';
import { languages } from './src/const.js';
import type { BuildOptions, BuildResult, Plugin, PluginBuild } from 'esbuild';

const _filename = fileURLToPath(import.meta.url);
const _dirname = dirname(_filename);
const _package = JSON.parse(fs.readFileSync(_dirname + '/package.json', 'utf-8'));
const _rootPackageDir = resolve(_dirname, '../../');
const _rootPackage = JSON.parse(fs.readFileSync(resolve(_rootPackageDir, 'package.json'), 'utf-8'));
const _frontendLocalesDir = resolve(_dirname, '../../built/_frontend_dist_/locales');
const _localesDir = resolve(_rootPackageDir, 'locales');

const entryPoints = fs.globSync('./src/**/*.{ts,tsx}');
const localeFiles = new Set(languages.map((lang) => `${lang}.yml`));

const options: BuildOptions = {
	entryPoints,
	minify: process.env.NODE_ENV === 'production',
	sourceRoot: 'src',
	outdir: './built',
	target: 'es2022',
	platform: 'node',
	format: 'esm',
	sourcemap: 'linked',
};

// コマンドライン引数を取得
const args = process.argv.slice(2).map((arg) => arg.toLowerCase());

// built配下をすべて削除する
if (!args.includes('--no-clean')) {
	fs.rmSync('./built', { recursive: true, force: true });
}

if (args.includes('--watch')) {
	await watchSrc();
} else {
	await buildSrc();
}

// `/locales` には Crowdin 経由で翻訳進捗70%未満の言語ファイルも同期されてくるが、
// それらは const.ts の languages に載るまで build() から一切参照されない。
// 未参照ファイルまでコピーするとビルド毎の無駄なI/Oと成果物肥大化になるので対象を絞る。
function copyLocales(): void {
	const srcDir = _localesDir;
	const destDir = resolve(_dirname, 'built/locales');

	fs.mkdirSync(destDir, { recursive: true });

	const files = languages.map((lang) => `${lang}.yml`).filter((f) => fs.existsSync(resolve(srcDir, f)));
	for (const file of files) {
		fs.copyFileSync(resolve(srcDir, file), resolve(destDir, file));
	}
	console.log(`[${_package.name}] locales copied (${files.length} files).`);
}

/**
 * フロントエンド用の locale JSON を書き出す
 * Service Worker が HTTP 経由で取得するために必要
 */
async function writeFrontendLocalesJson(useCachedLocales = false): Promise<void> {
	// locale生成・コピー後の、今回ビルドしたモジュールを読む必要があるため動的importする。
	const { locales, writeFrontendLocalesJson: write } = await import('./built/index.js');
	await write(_frontendLocalesDir, _rootPackage.version, useCachedLocales ? locales : undefined);
	console.log(`[${_package.name}] frontend locales JSON written to ${_frontendLocalesDir}`);
}

async function buildSrc(): Promise<void> {
	console.log(`[${_package.name}] start building...`);

	await generateLocaleInterface(_localesDir);

	await build(options)
		.then(() => {
			console.log(`[${_package.name}] build succeeded.`);
		})
		.catch((err) => {
			process.stderr.write(err.stderr);
			process.exit(1);
		});

	copyLocales();
	await writeFrontendLocalesJson(true);

	if (process.env.NODE_ENV === 'production') {
		console.log(`[${_package.name}] skip building d.ts because NODE_ENV is production.`);
	} else {
		await buildDts();
	}

	console.log(`[${_package.name}] finish building.`);
}

function buildDts(): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn('bun', [
			'run',
			'--bun',
			'tsgo',
			'--project',
			'tsconfig.json',
			'--rootDir',
			'src',
			'--outDir',
			'built',
			'--declaration',
			'true',
			'--emitDeclarationOnly',
			'true',
		], { stdio: 'inherit' });
		child.once('error', reject);
		child.once('exit', (code, signal) => {
			if (code === 0) resolve();
			else reject(new Error(`tsgo exited with ${signal ? `signal ${signal}` : `code ${code}`}`));
		});
	});
}

async function watchSrc(): Promise<void> {
	const localesWatcher = chokidarWatch(_localesDir, {
		ignoreInitial: true,
	});
	let localeBuildQueue = Promise.resolve();
	localesWatcher.on('all', (event, path) => {
		const file = basename(path);
		if (!localeFiles.has(file)) return;
		localeBuildQueue = localeBuildQueue.then(async () => {
			console.log(`[${_package.name}] locales changed: ${event} ${path}`);
			copyLocales();
			await writeFrontendLocalesJson();
			if (file === 'ja-JP.yml') await generateLocaleInterface(_localesDir);
		}).catch((error) => {
			console.error(`[${_package.name}] locale rebuild failed:`, error);
		});
	});

	const plugins: Plugin[] = [
		{
			name: 'gen-dts',
			setup(build: PluginBuild) {
				build.onStart(() => {
					console.log(`[${_package.name}] detect changed...`);
				});
				build.onEnd(async (result: BuildResult) => {
					if (result.errors.length > 0) {
						console.error(`[${_package.name}] watch build failed:`, result);
						return;
					}
					await buildDts();
				});
			},
		},
	];

	console.log(`[${_package.name}] start watching...`);

	const context = await esbuild.context({ ...options, plugins });
	await context.watch();

	await new Promise((resolve, reject) => {
		process.on('SIGHUP', resolve);
		process.on('SIGINT', resolve);
		process.on('SIGTERM', resolve);
		process.on('uncaughtException', reject);
		process.on('exit', resolve);
	}).finally(async () => {
		await context.dispose();
		await localesWatcher.close();
		console.log(`[${_package.name}] finish watching.`);
	});
}
