/**
 * Misskeyのチャンネル購読は接続完了前にconnectメッセージを送るため、
 * このキューを破棄してはならない。
 */

type WebSocketEventMap = {
	open: unknown;
	close: unknown;
	message: { data: string };
	error: unknown;
};

type WebSocketLike = {
	binaryType: string;
	readyState: number;
	onopen: ((ev: unknown) => void) | null;
	onclose: ((ev: unknown) => void) | null;
	onmessage: ((ev: unknown) => void) | null;
	onerror: ((ev: unknown) => void) | null;
	send(data: string): void;
	close(): void;
};

// DOMのWebSocketとnpmのwsの両方を受け付けるため、コンストラクターの型を共通部分に限定する。
export type WebSocketConstructor = new (url: string, protocols?: string | string[]) => any;

export type ReconnectingWebSocketOptions = {
	WebSocket?: WebSocketConstructor | undefined;
	minReconnectionDelay?: number | undefined;
	maxReconnectionDelay?: number | undefined;
	reconnectionDelayGrowFactor?: number | undefined;
	connectionTimeout?: number | undefined;
};

const WS_OPEN = 1;
export const MAX_OFFLINE_MESSAGE_COUNT = 1_000;
export const MAX_OFFLINE_MESSAGE_BYTES = 1024 * 1024;

export class ReconnectingWebSocket {
	private url: string;
	private protocols: string | string[] | undefined;
	private wsConstructor: WebSocketConstructor;
	private minReconnectionDelay: number;
	private maxReconnectionDelay: number;
	private reconnectionDelayGrowFactor: number;
	private connectionTimeout: number;

	private ws: WebSocketLike | null = null;
	private listeners: { [K in keyof WebSocketEventMap]: Set<(ev: WebSocketEventMap[K]) => void> } = {
		open: new Set(),
		close: new Set(),
		message: new Set(),
		error: new Set(),
	};
	private retryCount = 0;
	private closed = false;
	private messageQueue: string[] = [];
	private messageQueueBytes = 0;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private connectionTimer: ReturnType<typeof setTimeout> | null = null;
	// 明示的に設定されるまでソケットの binaryType には触れない (実装により有効値が異なり、
	// 例えば npm の ws は環境次第で 'blob' 代入が例外になる)
	private _binaryType: string | null = null;

	constructor(url: string, protocols?: string | string[], options: ReconnectingWebSocketOptions = {}) {
		this.url = url;
		// 空文字列プロトコルは WebSocket コンストラクタで SyntaxError になるため渡さない
		this.protocols = protocols === '' || protocols == null || (Array.isArray(protocols) && protocols.length === 0)
			? undefined
			: protocols;
		this.wsConstructor = options.WebSocket ?? (globalThis.WebSocket as unknown as WebSocketConstructor);
		this.minReconnectionDelay = options.minReconnectionDelay ?? 1000;
		this.maxReconnectionDelay = options.maxReconnectionDelay ?? 10000;
		this.reconnectionDelayGrowFactor = options.reconnectionDelayGrowFactor ?? 1.3;
		this.connectionTimeout = options.connectionTimeout ?? 4000;

		this.connect();
	}

	public get binaryType(): string {
		return this._binaryType ?? this.ws?.binaryType ?? 'blob';
	}

	public set binaryType(value: string) {
		this._binaryType = value;
		if (this.ws) this.ws.binaryType = value;
	}

	public addEventListener<K extends keyof WebSocketEventMap>(type: K, listener: (ev: WebSocketEventMap[K]) => void): void {
		this.listeners[type].add(listener);
	}

	public removeEventListener<K extends keyof WebSocketEventMap>(type: K, listener: (ev: WebSocketEventMap[K]) => void): void {
		this.listeners[type].delete(listener);
	}

	/** 未接続時の送信データはキューに保持し、open時にまとめて送信する。 */
	public send(data: string): void {
		if (this.ws != null && this.ws.readyState === WS_OPEN) {
			this.ws.send(data);
		} else {
			this.messageQueue.push(data);
			this.messageQueueBytes += new TextEncoder().encode(data).byteLength;
			while (this.messageQueue.length > MAX_OFFLINE_MESSAGE_COUNT || this.messageQueueBytes > MAX_OFFLINE_MESSAGE_BYTES) {
				const dropped = this.messageQueue.shift();
				if (dropped == null) break;
				this.messageQueueBytes -= new TextEncoder().encode(dropped).byteLength;
			}
		}
	}

	public close(): void {
		this.closed = true;
		this.clearTimers();
		const ws = this.ws;
		if (ws) {
			// Bun の WebSocket は close() が同期的に close イベントを発火し、その中で
			// this.ws が null 化されるため、null チェック済みのローカル変数で扱う
			ws.close();
			this.detach(ws);
			this.ws = null;
		}
	}

	private clearTimers(): void {
		if (this.reconnectTimer != null) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		if (this.connectionTimer != null) {
			clearTimeout(this.connectionTimer);
			this.connectionTimer = null;
		}
	}

	private detach(ws: WebSocketLike): void {
		ws.onopen = null;
		ws.onclose = null;
		ws.onmessage = null;
		ws.onerror = null;
	}

	private emit<K extends keyof WebSocketEventMap>(type: K, ev: WebSocketEventMap[K]): void {
		for (const listener of this.listeners[type]) {
			listener(ev);
		}
	}

	private connect(): void {
		if (this.closed) return;

		const ws: WebSocketLike = this.protocols !== undefined
			? new this.wsConstructor(this.url, this.protocols)
			: new this.wsConstructor(this.url);
		if (this._binaryType != null) ws.binaryType = this._binaryType;
		this.ws = ws;

		// 一定時間内に open しなければ接続を打ち切って再試行する
		this.connectionTimer = setTimeout(() => {
			this.connectionTimer = null;
			ws.close();
		}, this.connectionTimeout);

		ws.onopen = (ev) => {
			if (this.connectionTimer != null) {
				clearTimeout(this.connectionTimer);
				this.connectionTimer = null;
			}
			this.retryCount = 0;
			let listenerError: unknown;
			try {
				this.emit('open', ev);
			} catch (error) {
				listenerError = error;
			}
			if (this.closed || this.ws !== ws || ws.readyState !== WS_OPEN) return;
			if (this.messageQueue.length > 0) {
				const queue = this.messageQueue;
				this.messageQueue = [];
				this.messageQueueBytes = 0;
				for (const data of queue) {
					ws.send(data);
				}
			}
			if (listenerError !== undefined) throw listenerError;
		};
		ws.onmessage = (ev) => {
			this.emit('message', ev as { data: string });
		};
		ws.onerror = (ev) => {
			this.emit('error', ev);
		};
		ws.onclose = (ev) => {
			if (this.connectionTimer != null) {
				clearTimeout(this.connectionTimer);
				this.connectionTimer = null;
			}
			this.detach(ws);
			if (this.ws === ws) this.ws = null;
			this.emit('close', ev);
			if (!this.closed) {
				this.scheduleReconnect();
			}
		};
	}

	private scheduleReconnect(): void {
		if (this.reconnectTimer != null) return;
		this.retryCount++;
		const delay = Math.min(
			this.maxReconnectionDelay,
			this.minReconnectionDelay * this.reconnectionDelayGrowFactor ** (this.retryCount - 1),
		);
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			this.connect();
		}, delay);
	}
}
