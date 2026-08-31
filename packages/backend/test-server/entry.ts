import type { Server } from 'node:http';
import { Hono } from 'hono';
import { Redis } from 'ioredis';
import { loadConfig } from '@/config.js';
import { createDrizzlePool } from '@/drizzle.js';
import { resetDatabase, runMigrations } from '@/migration-runner.js';
import { createNodeServer } from '@/server/node-server.js';
import { initExtraThreadPool, server as startServer } from '@/boot/common.js';
import type { ServerRuntime } from '@/boot/server.js';

const config = loadConfig();
const originEnv = JSON.stringify(process.env);

process.env['NODE_ENV'] = 'test';

let runtime: ServerRuntime | undefined;
let controllerServer: Server | undefined;
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
	await stopApplication();
	await stopControllerEndpoints();
}

async function startApplication() {
	console.log('starting application...');

	initExtraThreadPool(config);
	runtime = await startServer();

	console.log('application initialized.');
}

async function stopApplication() {
	if (!runtime) return;

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

				const pool = createDrizzlePool(config);
				try {
					await resetDatabase(pool);
					await runMigrations(pool);
				} finally {
					await pool.end();
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

	controllerServer = createNodeServer({ app: controller });
	await new Promise<void>((resolve, reject) => {
		controllerServer!.once('error', reject);
		controllerServer!.listen(port, 'localhost', () => {
			controllerServer!.off('error', reject);
			resolve();
		});
	});
}

async function stopControllerEndpoints() {
	if (!controllerServer) return;

	await new Promise<void>((resolve, reject) => {
		controllerServer!.close((err) => (err ? reject(err) : resolve()));
	});
	controllerServer = undefined;
}
