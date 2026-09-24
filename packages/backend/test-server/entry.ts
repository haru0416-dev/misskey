import { serve } from 'bun';
import { Hono } from 'hono';
import { Redis } from 'ioredis';
import { loadConfig } from '@/config.js';
import { captureDatabaseSeed, resetDatabase, runMigrations, truncateDatabase } from '@/migration-runner.js';
import type { DatabaseSeed } from '@/migration-runner.js';
import { initExtraThreadPool, server as startServer } from '@/boot/common.js';
import type { ServerRuntime } from '@/boot/server.js';

if (process.env['NODE_ENV'] !== 'test') {
	throw new Error('The test controller is only available in the test environment.');
}

const config = loadConfig();
const originEnv = JSON.stringify(process.env);

let runtime: ServerRuntime | undefined;
// 最初の reset で作り直した後の初期データ。以降の reset は同じスキーマを空にしてこれを戻す。
let databaseSeed: DatabaseSeed | undefined;
let controllerServer: Bun.Server | undefined;
let controllerOperation = Promise.resolve();

async function runControllerOperation<T>(operation: () => Promise<T>): Promise<T> {
	const result = controllerOperation.then(operation, operation);
	controllerOperation = result.then(
		() => undefined,
		() => undefined,
	);
	return result;
}

export async function setup() {
	await stopControllerEndpoints();

	await startControllerEndpoints();

	// テスト結果への非決定的な副作用を避けるため、ジョブキューは必要なテストだけが起動する。

	console.log('controller initialized.');
}

export async function teardown() {
	try {
		await stopControllerEndpoints();
	} finally {
		await stopApplication();
	}
}

async function startApplication() {
	console.log('starting application...');

	initExtraThreadPool(config);
	runtime = await startServer();

	console.log('application initialized.');
}

async function stopApplication() {
	if (!runtime) {
		return;
	}

	await runtime.dispose();
	runtime = undefined;
}

/**
 * 別プロセスに切り離してしまったが故に出来なくなった環境変数の書き換え等を実現するためのエンドポイントを作る
 * @param port
 */
async function startControllerEndpoints(
	port = ('tcp' in config.server.listen ? config.server.listen.tcp.port : 3000) + 1000,
) {
	const controller = new Hono();

	controller.post('/env', async (c) => {
		return runControllerOperation(async () => {
			const body = await c.req
				.json<{ key?: string; value?: string }>()
				.catch((): { key?: string; value?: string } => ({}));
			console.log(body);
			const key = body.key;
			if (!key) {
				return c.json({ success: false }, 400);
			}

			process.env[key] = body.value;

			return c.json({ success: true });
		});
	});

	controller.post('/env-reset', async (c) => {
		return runControllerOperation(async () => {
			try {
				await stopApplication();
				process.env = JSON.parse(originEnv);

				if (databaseSeed == null) {
					await resetDatabase(config);
					await runMigrations(config);
					databaseSeed = await captureDatabaseSeed(config);
				} else {
					await truncateDatabase(config, databaseSeed);
				}

				const redis = new Redis(config.valkey.primary);
				try {
					await redis.flushdb();
				} finally {
					await redis.quit();
				}

				await startApplication();
				return c.json({ success: true });
			} catch (error) {
				console.error('environment reset failed.', error);
				return c.json({ success: false }, 500);
			}
		});
	});

	controllerServer = serve({
		hostname: 'localhost',
		port,
		fetch: (request) => controller.fetch(request),
	});
}

async function stopControllerEndpoints() {
	if (!controllerServer) {
		return;
	}

	// 受理済みの reset が終了してから application を止め、停止後の再起動を防ぐ。
	await controllerServer.stop();
	await controllerOperation;
	controllerServer = undefined;
}
