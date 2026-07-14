import { defineConfig } from 'rolldown';
import { version as summalyVersion } from '@misskey-dev/summaly';
import type { Plugin, ExternalOption } from 'rolldown';
import { execa } from 'execa';
import type { ResultPromise } from 'execa';

/**
 * Watchモード時にバックエンドの起動・停止制御を行うプラグイン
 */
function backendDevServerPlugin(): Plugin {
	let backendProcess: ResultPromise | null = null;
	let backendShutdownPromise: Promise<void> | null = null;

	async function runBuildAssets() {
		await execa('bun', ['run', 'build-assets'], {
			cwd: '../../',
			stdout: process.stdout,
			stderr: process.stderr,
		});
	}

	async function killBackendProcess() {
		if (backendShutdownPromise) return backendShutdownPromise;
		if (!backendProcess) return;

		const processToKill = backendProcess;
		backendProcess = null;
		processToKill.catch(() => {});

		backendShutdownPromise = (async () => {
			if (process.platform === 'win32' && processToKill.pid != null) {
				const result = await execa('taskkill', ['/pid', processToKill.pid.toString(), '/t', '/f'], {
					reject: false,
				});
				if (result.failed) processToKill.kill();
			} else {
				processToKill.kill();
			}

			await processToKill.catch(() => {});
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
			backendProcess = execa('bun', ['./built/entry.js'], {
				stdout: process.stdout,
				stderr: process.stderr,
				env: {
					NODE_ENV: 'development',
				},
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
	const isWatchMode = args.watch != null && args.watch !== 'false';
	const isE2E = process.env.MISSKEY_BUILD_E2E === '1';

	// 通常のビルド時にexternalとするモジュール
	const externalModules: ExternalOption = [
		/^slacc-.*/,
		/^@opentelemetry\/.*/,
		/^@napi-rs\/.*/,
		'bullmq',
		'ioredis',
		'pg',
		'sharp',
		'jsdom',
		'ipaddr.js',
		'file-type',
	];

	const define: Record<string, string> = {
		// Summalyのバージョンを埋め込む
		_SUMMALY_VERSION_: JSON.stringify(summalyVersion),
	};

	if (isE2E) {
		return {
			input: './test-server/entry.ts',
			platform: 'node',
			tsconfig: './test-server/tsconfig.json',
			transform: {
				define,
			},
			output: {
				keepNames: true,
				sourcemap: true,
				dir: './built-test',
				cleanDir: true,
				format: 'esm',
			},
			external: externalModules,
		};
	} else {
		return {
			input: [
				'./src/boot/entry.ts',
				'./src/boot/cli.ts',
				'./src/config.ts',
				'./src/config-schema.ts',
				'./src/drizzle.ts',
				'./src/migration-runner.ts',
				'./src/server/api/openapi/gen-spec.ts',
			],
			platform: 'node',
			tsconfig: true,
			plugins: [isWatchMode ? backendDevServerPlugin() : undefined],
			transform: {
				define,
			},
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
			// ビルドの高速化のために、watchモードのときは外部モジュールは全てバンドルしないようにする
			external: isWatchMode ? /^(?!@\/)[^.\/](?!:[\/\\])/ : externalModules,
		};
	}
});
