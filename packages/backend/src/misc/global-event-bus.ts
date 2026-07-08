/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import cluster from 'node:cluster';
import { EventEmitter } from 'node:events';

/**
 * クラスタ全プロセス横断のイベントバス。旧依存 `xev` の内製置き換えで、意味論は同一:
 *
 * - master での emit → master ローカル配信 + (mount 済みなら) 全 worker へ送信
 * - worker での emit → master へ process.send し、master が自分自身と全 worker (送信元含む)
 *   へ再配信する。worker ローカルへの即時エコーはしない (master 経由で戻ってくる)
 * - 非クラスタ時は worker が存在しないため、単なるプロセス内 EventEmitter として振る舞う
 *
 * 現在の用途は server-stats / queue-stats デーモンから streaming チャンネルへの統計配信のみ。
 */

const MARKER = '__misskeyGlobalEvent';

type BusEnvelope = {
	[MARKER]: true;
	type: string;
	data: unknown;
};

function isBusEnvelope(message: unknown): message is BusEnvelope {
	return message != null && typeof message === 'object' && (message as Record<string, unknown>)[MARKER] === true;
}

class GlobalEventBus extends EventEmitter {
	private mounted = false;

	constructor() {
		super();

		// worker では master からブリッジされた envelope が親プロセス経由で届く。
		// (master は通常親を持たないためこのリスナーは発火しない)
		process.on('message', message => {
			if (isBusEnvelope(message)) this.deliverLocally(message);
		});
	}

	private deliverLocally(envelope: BusEnvelope): void {
		super.emit('*', envelope.type, envelope.data);
		super.emit(envelope.type, envelope.data);
	}

	private broadcastToWorkers(envelope: BusEnvelope): void {
		for (const id in cluster.workers) {
			cluster.workers[id]?.send(envelope);
		}
	}

	/**
	 * イベントを全プロセスへ発行する。EventEmitter.emit とはシグネチャが異なる
	 * (可変長引数ではなく data 1つ) 点も旧 xev と同じ。
	 */
	override emit(type: string, data?: unknown): boolean {
		const envelope: BusEnvelope = { [MARKER]: true, type, data };

		if (cluster.isPrimary) {
			this.deliverLocally(envelope);
			if (this.mounted) this.broadcastToWorkers(envelope);
		} else {
			process.send?.(envelope);
		}

		return true;
	}

	/**
	 * worker からの envelope を全プロセスへ中継するブリッジを起動する。
	 * master プロセスで1回だけ呼ぶこと (boot/entry.ts)。
	 */
	mount(): void {
		if (cluster.isWorker) {
			throw new Error('globalEventBus.mount() must be called in the primary process');
		}
		if (this.mounted) return;

		cluster.on('message', (_worker, message) => {
			if (!isBusEnvelope(message)) return;
			this.deliverLocally(message);
			this.broadcastToWorkers(message);
		});

		this.mounted = true;
	}
}

export const globalEventBus = new GlobalEventBus();
