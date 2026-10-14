import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { build } from 'tsdown';
import { spawnChecked } from '../../scripts/spawn-checked.mjs';

const _filename = fileURLToPath(import.meta.url);
const _dirname = dirname(_filename);
const _package = JSON.parse(fs.readFileSync(_dirname + '/package.json', 'utf-8'));
const tscNative = fileURLToPath(new URL('../../scripts/tsc-native.mjs', import.meta.url));

const args = new Set(process.argv.slice(2).map((arg) => arg.toLowerCase()));

// 型定義は tsdown ではなく tsc で出す。tsdown の型定義では `export * as entities` などの名前空間が中身の一覧だけになり、
// api-extractor の報告書 (etc/misskey-js.api.md) に中の型が載らなくなるため。
/** @type {import('tsdown').InlineConfig} */
const options = {
	config: false,
	cwd: _dirname,
	// package.json の exports が下の階層 (misskey-js/api.js など) を指すので、まとめずに src のファイルごとに出す
	entry: ['./src/**/*.{ts,tsx}'],
	unbundle: true,
	format: 'esm',
	platform: 'browser',
	target: 'es2022',
	outDir: 'built',
	// package.json の exports が指す .js の名前で出す
	fixedExtension: false,
	sourcemap: true,
	minify: process.env.NODE_ENV === 'production',
	dts: false,
	clean: !args.has('--no-clean'),
	logLevel: 'warn',
};

if (args.has('--watch')) {
	await watchSrc();
} else {
	await buildSrc();
}

async function buildSrc() {
	console.log(`[${_package.name}] start building...`);

	await build(options);
	console.log(`[${_package.name}] build succeeded.`);

	if (process.env.NODE_ENV === 'production') {
		console.log(`[${_package.name}] skip building d.ts because NODE_ENV is production.`);
	} else {
		await buildDts();
	}

	console.log(`[${_package.name}] finish building.`);
}

function buildDts() {
	return spawnChecked([
		process.execPath,
		'run',
		'--bun',
		tscNative,
		'--project',
		'tsconfig.json',
		'--outDir',
		'built',
		'--declaration',
		'true',
		'--emitDeclarationOnly',
		'true',
	]);
}

async function watchSrc() {
	console.log(`[${_package.name}] start watching...`);

	const handle = await build({
		...options,
		watch: true,
		// ソースが変わるたびに、JS を出し直したあとで型定義も出し直す
		onSuccess: () => buildDts(),
	});

	await new Promise((resolve, reject) => {
		process.on('SIGHUP', resolve);
		process.on('SIGINT', resolve);
		process.on('SIGTERM', resolve);
		process.on('uncaughtException', reject);
		process.on('exit', resolve);
	}).finally(async () => {
		await handle.watch.close();
		console.log(`[${_package.name}] finish watching.`);
	});
}
