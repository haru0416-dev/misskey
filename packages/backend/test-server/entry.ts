import type { Server } from 'node:http';
import { portToPid } from 'pid-port';
import { Hono } from 'hono';
import { loadConfig } from '@/config.js';
import { createHonoNodeServer } from '@/server/node-server.js';
import { initExtraThreadPool, server as startServer } from '@/boot/common.js';
import type { HonoServerRuntime } from '@/boot/server.js';

const config = loadConfig();
const originEnv = JSON.stringify(process.env);

process.env.NODE_ENV = 'test';

let runtime: HonoServerRuntime | undefined;
let controllerServer: Server | undefined;

/**
 * テスト用のサーバインスタンスを起動する
 */
export async function setup() {
	await killTestServer();
	await stopControllerEndpoints();

	await startControllerEndpoints();

	// ジョブキューは必要な時にテストコード側で起動する
	// ジョブキューが動くとテスト結果の確認に支障が出ることがあるので意図的に動かさないでいる

	console.log('controller initialized.');
}

/**
 * テスト用のサーバインスタンスを停止する
 */
export async function teardown() {
	await stopApplication();
	await stopControllerEndpoints();
	await killTestServer();
}

/**
 * 既に重複したポートで待ち受けしているサーバがある場合はkillする
 */
async function killTestServer() {
	try {
		const pid = await portToPid(config.port);
		if (pid) {
			process.kill(pid, 'SIGTERM');
			if (!await waitForPortToClose(config.port, 5000)) {
				process.kill(pid, 'SIGKILL');
				await waitForPortToClose(config.port, 5000);
			}
		}
	} catch {
		// NOP;
	}
}

async function waitForPortToClose(port: number, timeout: number): Promise<boolean> {
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		const pid = await portToPid(port).catch(() => undefined);
		if (!pid) return true;
		await new Promise(resolve => setTimeout(resolve, 100));
	}

	return false;
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
async function startControllerEndpoints(port = config.port + 1000) {
	const controller = new Hono();

	controller.post('/env', async (c) => {
		const body = await c.req.json<{ key?: string, value?: string }>().catch(() => ({}));
		console.log(body);
		const key = body.key;
		if (!key) {
			return c.json({ success: false }, 400);
		}

		process.env[key] = body.value;

		return c.json({ success: true });
	});

	controller.post('/env-reset', async (c) => {
		process.env = JSON.parse(originEnv);

		await stopApplication();
		await killTestServer();
		await startApplication();

		return c.json({ success: true });
	});

	controllerServer = createHonoNodeServer({ app: controller });
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
		controllerServer!.close(err => err ? reject(err) : resolve());
	});
	controllerServer = undefined;
}
