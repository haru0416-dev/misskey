// @ts-check

/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { fileURLToPath } from 'node:url';
import { build, watch as rolldownWatch } from 'rolldown';
import locales from 'i18n';
import meta from '../../package.json' with { type: 'json' };

const watch = process.argv[2]?.includes('watch');

const __dirname = fileURLToPath(new URL('.', import.meta.url));

console.log('Starting SW building...');

/** @type {import('rolldown').BuildOptions} */
const buildOptions = {
	cwd: __dirname,
	input: `${__dirname}/src/sw.ts`,
	platform: 'browser',
	tsconfig: `${__dirname}/tsconfig.json`,
	resolve: {
		// ソースは .ts を `./x.js` の形で import している
		extensionAlias: { '.js': ['.ts', '.js'] },
	},
	transform: {
		define: {
			_DEV_: JSON.stringify(process.env.NODE_ENV !== 'production'),
			_ENV_: JSON.stringify(process.env.NODE_ENV ?? ''), // define は文字列を要求するため、未設定でも undefined を渡さない。
			_LANGS_: JSON.stringify(Object.entries(locales).map(([k, v]) => [k, v._lang_])),
			_PERF_PREFIX_: JSON.stringify('Toneriko:'),
			_VERSION_: JSON.stringify(meta.version),
		},
	},
	// 解決できない import を rolldown は外部の import として残し、警告だけ出す。Service Worker は単体で動くので、
	// misskey-js や i18n のビルドが無いまま壊れた sw.js を出さないよう、エラーにして止める。
	onLog(level, log, defaultHandler) {
		if (log.code === 'UNRESOLVED_IMPORT') {
			defaultHandler('error', log);
			return;
		}
		defaultHandler(level, log);
	},
	output: {
		dir: `${__dirname}/../../built/_sw_dist_`,
		entryFileNames: '[name].js',
		format: 'esm',
		minify: process.env.NODE_ENV === 'production',
	},
};

if (!watch) {
	await build(buildOptions);
	console.log('done');
} else {
	rolldownWatch(buildOptions);
	console.log('watching...');
}
