import type { Server } from 'node:http';
import { portToPid } from 'pid-port';
import fkill from 'fkill';
import { Hono } from 'hono';
import { NestFactory } from '@nestjs/core';
import { MainModule } from '@/MainModule.js';
import { ServerService } from '@/server/ServerService.js';
import { loadConfig } from '@/config.js';
import { NestLogger } from '@/NestLogger.js';
import { createHonoNodeServer } from '@/server/hono-node-server.js';
import { INestApplicationContext } from '@nestjs/common';

const config = loadConfig();
const originEnv = JSON.stringify(process.env);

process.env.NODE_ENV = 'test';

let app: INestApplicationContext;
let serverService: ServerService;
let controllerServer: Server | undefined;

/**
 * テスト用のサーバインスタンスを起動する
 */
export async function setup() {
	await killTestServer();
	await stopControllerEndpoints();

	console.log('starting application...');

	app = await NestFactory.createApplicationContext(MainModule, {
		logger: new NestLogger(),
	});
	serverService = app.get(ServerService);
	await serverService.launch();

	await startControllerEndpoints();

	// ジョブキューは必要な時にテストコード側で起動する
	// ジョブキューが動くとテスト結果の確認に支障が出ることがあるので意図的に動かさないでいる

	console.log('application initialized.');
}

/**
 * テスト用のサーバインスタンスを停止する
 */
export async function teardown() {
	await serverService.dispose();
	await app.close();
	await stopControllerEndpoints();
	await killTestServer();
}

/**
 * 既に重複したポートで待ち受けしているサーバがある場合はkillする
 */
async function killTestServer() {
	//
	try {
		const pid = await portToPid(config.port);
		if (pid) {
			await fkill(pid, { force: true });
		}
	} catch {
		// NOP;
	}
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

		await serverService.dispose();
		await app.close();

		await killTestServer();

		console.log('starting application...');

		app = await NestFactory.createApplicationContext(MainModule, {
			logger: new NestLogger(),
		});
		serverService = app.get(ServerService);
		await serverService.launch();

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
