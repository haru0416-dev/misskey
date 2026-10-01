import { defineConfig } from 'rolldown';
import type { Plugin } from 'rolldown';
import { externalModules } from './runtime-externals.mjs';

function backendDevServerPlugin(): Plugin {
	let backendProcess: Bun.Subprocess | null = null;
	let backendShutdownPromise: Promise<void> | null = null;

	async function runBuildAssets() {
		const buildAssets = Bun!.spawn([process.execPath, 'run', 'build-assets'], {
			cwd: '../../',
			stdout: 'inherit',
			stderr: 'inherit',
		});
		const exitCode = await buildAssets.exited;
		if (exitCode !== 0) {
			throw new Error(`build-assets exited with code ${exitCode}`);
		}
	}

	async function killBackendProcess() {
		if (backendShutdownPromise) {
			return backendShutdownPromise;
		}
		if (!backendProcess) {
			return;
		}

		const processToKill = backendProcess;
		backendProcess = null;

		backendShutdownPromise = (async () => {
			if (process.platform === 'win32' && processToKill.pid != null) {
				const taskkill = Bun!.spawn(['taskkill', '/pid', processToKill.pid.toString(), '/t', '/f'], {
					stdout: 'ignore',
					stderr: 'ignore',
				});
				if ((await taskkill.exited) !== 0) {
					processToKill.kill();
				}
			} else {
				processToKill.kill();
			}

			await processToKill.exited;
		})().finally(() => {
			backendShutdownPromise = null;
		});

		return backendShutdownPromise;
	}

	return {
		name: 'backend-dev-server',
		async closeBundle() {
			await runBuildAssets();
			await killBackendProcess();
			const startedProcess = Bun!.spawn([process.execPath, './built/entry.js'], {
				stdout: 'inherit',
				stderr: 'inherit',
				env: {
					...process.env,
					NODE_ENV: 'development',
				},
			});
			backendProcess = startedProcess;
			void startedProcess.exited.then((exitCode) => {
				if (backendProcess !== startedProcess) {
					return;
				}
				backendProcess = null;
				console.error(`backend exited with code ${exitCode}`);
				process.exit(exitCode === 0 ? 1 : exitCode);
			});
		},
		async watchChange() {
			await killBackendProcess();
		},
		async closeWatcher() {
			await killBackendProcess();
		},
	};
}

export default defineConfig((args) => {
	const isWatchMode = args['watch'] != null && args['watch'] !== 'false';
	const isE2E = process.env['MISSKEY_BUILD_E2E'] === '1';

	if (isE2E) {
		return {
			input: './test-server/entry.ts',
			platform: 'node',
			tsconfig: './test-server/tsconfig.json',
			output: {
				keepNames: true,
				sourcemap: true,
				dir: './built-test',
				cleanDir: true,
				format: 'esm',
			},
			external: externalModules,
		};
	}
	return {
		input: [
			'./src/boot/entry.ts',
			'./src/boot/cli.ts',
			'./src/config.ts',
			'./src/config-schema.ts',
			'./src/drizzle.ts',
			'./src/migration-runner.ts',
			'./src/server/rest/openapi/gen-spec.ts',
		],
		platform: 'node',
		tsconfig: true,
		plugins: [isWatchMode ? backendDevServerPlugin() : undefined],
		output: {
			keepNames: true,
			minify: !isWatchMode,
			sourcemap: isWatchMode,
			dir: './built',
			cleanDir: !isWatchMode,
			format: 'esm',
		},
		watch: {
			include: ['src/**/*.{ts,js,mjs,cjs,tsx,json}'],
			clearScreen: false,
		},
		// watch 時は依存を外部化して再ビルド時間を短縮する。
		external: isWatchMode ? /^(?!@\/)[^.\/](?!:[\/\\])/ : externalModules,
	};
});
