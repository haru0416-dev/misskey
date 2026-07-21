/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

const windowsPathReg = /\\/g;

function createWorkspaceRequire() {
	try {
		return createRequire(path.join(process.cwd(), 'package.json'));
	} catch {
		return require;
	}
}

const workspaceRequire = createWorkspaceRequire();
const vueTscPath = workspaceRequire.resolve('vue-tsc');
const vueTscRequire = createRequire(vueTscPath);
const core = vueTscRequire('@vue/language-core');
const { transformTscContent } = vueTscRequire('@volar/typescript/lib/quickstart/runTsc');

module.exports.getLanguagePlugins = (ts, options) => {
	const { configFilePath } = options.options;
	const vueOptions =
		typeof configFilePath === 'string'
			? core.createParsedCommandLine(ts, ts.sys, configFilePath.replaceAll(windowsPathReg, '/')).vueOptions
			: core.createParsedCommandLineByJson(ts, ts.sys, (options.host ?? ts.sys).getCurrentDirectory(), {}).vueOptions;

	return {
		languagePlugins: [core.createVueLanguagePlugin(ts, options.options, vueOptions, (id) => id)],
	};
};

if (require.cache) {
	require.cache[__filename] = module;
}

function run() {
	const tscPath = vueTscRequire.resolve('typescript/lib/_tsc');
	const proxyApiPath = vueTscRequire.resolve('@volar/typescript/lib/node/proxyCreateProgram');
	const tsc = transformTscContent(fs.readFileSync(tscPath, 'utf8'), proxyApiPath, ['.vue'], [], __filename);
	const tscRequire = createRequire(tscPath);
	const tscModule = {
		exports: {},
		filename: tscPath,
		id: tscPath,
		loaded: false,
		parent: module,
		paths: tscRequire.resolve.paths('typescript') ?? [],
	};
	const wrapper = vm.runInThisContext(`(function(exports, require, module, __filename, __dirname) {\n${tsc}\n})`, {
		filename: tscPath,
	});
	const originalArgv = process.argv;
	process.argv = [originalArgv[0], tscPath, ...originalArgv.slice(2)];
	try {
		wrapper(tscModule.exports, tscRequire, tscModule, tscPath, path.dirname(tscPath));
	} finally {
		process.argv = originalArgv;
	}
}

run();
