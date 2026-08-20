import { EventEmitter } from 'eventemitter3';
import { ReconnectingWebSocket, type ReconnectingWebSocketOptions } from './reconnecting-ws.js';
import type { BroadcastEvents, Channels } from './streaming.types.js';

export function urlQuery(obj: Record<string, string | number | boolean | undefined>): string {
	const params = Object.entries(obj)
		.filter(([, v]) => Array.isArray(v) ? v.length : v !== undefined)
		.reduce((a, [k, v]) => (a[k] = v!, a), {} as Record<string, string | number | boolean>);

	return Object.entries(params)
		.map((e) => `${e[0]}=${encodeURIComponent(e[1])}`)
		.join('&');
}

type AnyOf<T extends Record<PropertyKey, unknown>> = T[keyof T];

const RESERVED_STREAM_EVENT_TYPES = new Set(['_connected_', '_disconnected_', '_error_']);

export type StreamEvents = {
	_connected_: void;
	_disconnected_: void;
	_error_: (error: Error) => void;
} & BroadcastEvents;

export interface IStream extends EventEmitter<StreamEvents> {
	state: 'initializing' | 'reconnecting' | 'connected';

	useChannel<C extends keyof Channels>(channel: C, params?: Channels[C]['params'], name?: string): IChannelConnection<Channels[C]>;
	removeSharedConnection(connection: SharedConnection): void;
	removeSharedConnectionPool(pool: Pool): void;
	disconnectToChannel(connection: NonSharedConnection): void;
	send(typeOrPayload: string): void;
	send(typeOrPayload: string, payload: unknown): void;
	send(typeOrPayload: Record<string, unknown> | unknown[]): void;
	send(typeOrPayload: string | Record<string, unknown> | unknown[], payload?: unknown): void;
	ping(): void;
	heartbeat(): void;
	close(): void;
}

/**
 * Misskey stream connection
 */
export default class Stream extends EventEmitter<StreamEvents> implements IStream {
	private stream: ReconnectingWebSocket;
	public state: 'initializing' | 'reconnecting' | 'connected' = 'initializing';
	private sharedConnectionPools: Pool[] = [];
	private sharedConnections: SharedConnection[] = [];
	private nonSharedConnections: NonSharedConnection[] = [];
	// onMessage は受信メッセージ毎に呼ばれるホットパスなので、id からの逆引きを O(1) にする
	// (shared connection は pool の id を共有するため、値はリストで持つ)
	private connectionsById = new Map<string, Connection[]>();
	private connectedChannelIds = new Set<string>();
	private idCounter = 0;

	constructor(origin: string, user: { token: string; } | null, options?: {
		WebSocket?: ReconnectingWebSocketOptions['WebSocket'];
		binaryType?: ReconnectingWebSocket['binaryType'];
	}) {
		super();

		this.genId = this.genId.bind(this);
		this.useChannel = this.useChannel.bind(this);
		this.useSharedConnection = this.useSharedConnection.bind(this);
		this.removeSharedConnection = this.removeSharedConnection.bind(this);
		this.removeSharedConnectionPool = this.removeSharedConnectionPool.bind(this);
		this.connectToChannel = this.connectToChannel.bind(this);
		this.disconnectToChannel = this.disconnectToChannel.bind(this);
		this.onOpen = this.onOpen.bind(this);
		this.onClose = this.onClose.bind(this);
		this.onMessage = this.onMessage.bind(this);
		this.send = this.send.bind(this);
		this.close = this.close.bind(this);

		options = options ?? { };

		const query = urlQuery({
			i: user?.token,

			// To prevent cache of an HTML such as error screen
			_t: Date.now(),
		});

		const wsOrigin = origin.replace('http://', 'ws://').replace('https://', 'wss://');

		this.stream = new ReconnectingWebSocket(`${wsOrigin}/streaming?${query}`, undefined, {
			minReconnectionDelay: 1, // https://github.com/pladaria/reconnecting-websocket/issues/91
			WebSocket: options.WebSocket,
		});
		// reconnecting-websocket のデフォルト binaryType は 'blob' だが、Bun の ws 互換実装は
		// 'blob' への代入で例外を投げ、RWS の _connect() がリスナ登録前に静かに死ぬ
		// (接続は開くがイベントが一切届かなくなる)。Misskey のストリーミングはテキスト (JSON)
		// のみで binaryType は実質未使用のため、全ランタイムで受理される 'arraybuffer' を既定にする。
		this.stream.binaryType = options.binaryType ?? 'arraybuffer';
		this.stream.addEventListener('open', this.onOpen);
		this.stream.addEventListener('close', this.onClose);
		this.stream.addEventListener('message', this.onMessage);
	}

	private genId(): string {
		return (++this.idCounter).toString();
	}

	private indexConnection(connection: Connection): void {
		let list = this.connectionsById.get(connection.id);
		if (list == null) {
			list = [];
			this.connectionsById.set(connection.id, list);
		}
		list.push(connection);
		if (this.connectedChannelIds.has(connection.id)) connection.markConnected();
	}

	private unindexConnection(connection: Connection): void {
		const list = this.connectionsById.get(connection.id);
		if (list == null) return;
		const index = list.indexOf(connection);
		if (index !== -1) list.splice(index, 1);
		if (list.length === 0) this.connectionsById.delete(connection.id);
	}

	public useChannel<C extends keyof Channels>(channel: C, params?: Channels[C]['params'], name?: string): Connection<Channels[C]> {
		if (params) {
			return this.connectToChannel(channel, params);
		} else {
			return this.useSharedConnection(channel, name);
		}
	}

	private useSharedConnection<C extends keyof Channels>(channel: C, name?: string): SharedConnection<Channels[C]> {
		let pool = this.sharedConnectionPools.find(p => p.channel === channel);

		if (pool == null) {
			pool = new Pool(this, channel, this.genId());
			this.sharedConnectionPools.push(pool);
		}

		const connection = new SharedConnection<Channels[C]>(this, channel, pool, name);
		this.sharedConnections.push(connection as unknown as SharedConnection);
		this.indexConnection(connection as unknown as SharedConnection);
		return connection;
	}

	public removeSharedConnection(connection: SharedConnection): void {
		this.sharedConnections = this.sharedConnections.filter(c => c !== connection);
		this.unindexConnection(connection);
	}

	public removeSharedConnectionPool(pool: Pool): void {
		this.sharedConnectionPools = this.sharedConnectionPools.filter(p => p !== pool);
		this.connectedChannelIds.delete(pool.id);
	}

	private connectToChannel<C extends keyof Channels>(channel: C, params: Channels[C]['params']): NonSharedConnection<Channels[C]> {
		const connection = new NonSharedConnection(this, channel, this.genId(), params);
		this.nonSharedConnections.push(connection as unknown as NonSharedConnection);
		this.indexConnection(connection as unknown as NonSharedConnection);
		return connection;
	}

	public disconnectToChannel(connection: NonSharedConnection): void {
		this.nonSharedConnections = this.nonSharedConnections.filter(c => c !== connection);
		this.unindexConnection(connection);
		this.connectedChannelIds.delete(connection.id);
	}

	/**
	 * Callback of when open connection
	 */
	private onOpen(): void {
		const isReconnect = this.state === 'reconnecting';

		this.state = 'connected';

		// チャンネル再接続
		if (isReconnect) {
			for (const p of this.sharedConnectionPools) p.connect();
			for (const c of this.nonSharedConnections) c.connect();
		}

		// _connected_ はオフラインキューの flush 完了後に通知する。
		queueMicrotask(() => {
			if (this.state === 'connected') this.emit('_connected_');
		});
	}

	/**
	 * Callback of when close connection
	 */
	private onClose(): void {
		if (this.state === 'connected') {
			this.state = 'reconnecting';
			this.connectedChannelIds.clear();
			this.emit('_disconnected_');
		}
	}

	/**
	 * Callback of when received a message from connection
	 */
	private onMessage(message: { data: string; }): void {
		let parsed: unknown;
		try {
			parsed = JSON.parse(message.data);
		} catch (error) {
			this.emit('_error_', new Error('Failed to parse streaming message as JSON', { cause: error }));
			return;
		}

		if (!isRecord(parsed) || typeof parsed['type'] !== 'string') {
			this.emit('_error_', new Error('Invalid streaming message envelope'));
			return;
		}

		const type = parsed['type'];
		const body = parsed['body'];

		if (type === 'channel') {
			if (!isRecord(body) || typeof body['id'] !== 'string' || typeof body['type'] !== 'string') {
				this.emit('_error_', new Error('Invalid streaming channel message'));
				return;
			}
			const id = body['id'];
			const channelType = body['type'];
			const channelBody = body['body'];
			const connections = this.connectionsById.get(id);

			if (connections) {
				for (const c of connections) {
					const emit = c.emit as unknown as (event: string, payload: unknown) => boolean;
					emit.call(c, channelType, channelBody);
					c.inCount++;
				}
			}
		} else if (type === 'connected') {
			if (!isRecord(body) || typeof body['id'] !== 'string') {
				this.emit('_error_', new Error('Invalid streaming connected message'));
				return;
			}
			const id = body['id'];
			const connections = this.connectionsById.get(id);

			if (connections) {
				this.connectedChannelIds.add(id);
				for (const c of connections) c.markConnected();
			}
		} else if (RESERVED_STREAM_EVENT_TYPES.has(type)) {
			this.emit('_error_', new Error(`Reserved streaming event type received: ${type}`));
		} else {
			this.emit(type as keyof BroadcastEvents, body as never);
		}
	}

	/**
	 * Send a message to connection
	 * ! ストリーム上のやり取りはすべてJSONで行われます !
	 */
	public send(typeOrPayload: string): void;
	public send(typeOrPayload: string, payload: unknown): void;
	public send(typeOrPayload: Record<string, unknown> | unknown[]): void;
	public send(typeOrPayload: string | Record<string, unknown> | unknown[], payload?: unknown): void {
		if (typeof typeOrPayload === 'string') {
			this.stream.send(JSON.stringify({
				type: typeOrPayload,
				...(payload === undefined ? {} : { body: payload }),
			}));
			return;
		}

		this.stream.send(JSON.stringify(typeOrPayload));
	}

	public ping(): void {
		this.stream.send('ping');
	}

	public heartbeat(): void {
		this.stream.send('h');
	}

	/**
	 * Close this connection
	 */
	public close(): void {
		this.stream.close();
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// TODO: これらのクラスを Stream クラスの内部クラスにすれば余計なメンバをpublicにしないで済むかも？
// もしくは @internal を使う？ https://www.typescriptlang.org/tsconfig#stripInternal
class Pool {
	public channel: string;
	public id: string;
	protected stream: Stream;
	public users = 0;
	private disposeTimerId: ReturnType<typeof setTimeout> | null = null;
	private isConnected = false;

	constructor(stream: Stream, channel: string, id: string) {
		this.onStreamDisconnected = this.onStreamDisconnected.bind(this);
		this.inc = this.inc.bind(this);
		this.dec = this.dec.bind(this);
		this.connect = this.connect.bind(this);
		this.disconnect = this.disconnect.bind(this);

		this.channel = channel;
		this.stream = stream;
		this.id = id;

		this.stream.on('_disconnected_', this.onStreamDisconnected);
	}

	private onStreamDisconnected(): void {
		this.isConnected = false;
	}

	public inc(): void {
		if (this.users === 0 && !this.isConnected) {
			this.connect();
		}

		this.users++;

		// タイマー解除
		if (this.disposeTimerId) {
			clearTimeout(this.disposeTimerId);
			this.disposeTimerId = null;
		}
	}

	public dec(): void {
		this.users--;

		// そのコネクションの利用者が誰もいなくなったら
		if (this.users === 0) {
			// また直ぐに再利用される可能性があるので、一定時間待ち、
			// 新たな利用者が現れなければコネクションを切断する
			this.disposeTimerId = setTimeout(() => {
				this.disconnect();
			}, 3000);
		}
	}

	public connect(): void {
		if (this.isConnected) return;
		this.isConnected = true;
		this.stream.send('connect', {
			channel: this.channel,
			id: this.id,
			pong: true,
		});
	}

	private disconnect(): void {
		this.stream.off('_disconnected_', this.onStreamDisconnected);
		this.stream.send('disconnect', { id: this.id });
		this.stream.removeSharedConnectionPool(this);
	}
}

export interface IChannelConnection<Channel extends AnyOf<Channels> = AnyOf<Channels>> extends EventEmitter<Channel['events']> {
	id: string;
	name?: string;
	inCount: number;
	outCount: number;
	channel: string;
	ready: Promise<void>;

	send<T extends keyof Channel['receives']>(type: T, body: Channel['receives'][T]): void;
	dispose(): void;
}

export abstract class Connection<Channel extends AnyOf<Channels> = AnyOf<Channels>> extends EventEmitter<Channel['events']> implements IChannelConnection<Channel> {
	public channel: string;
	protected stream: Stream;
	private disposed = false;
	public abstract id: string;

	public name?: string; // for debug
	public inCount = 0; // for debug
	public outCount = 0; // for debug
	public readonly ready: Promise<void>;
	private resolveReady!: () => void;

	constructor(stream: Stream, channel: string, name?: string) {
		super();
		this.ready = new Promise(resolve => {
			this.resolveReady = resolve;
		});

		this.send = this.send.bind(this);

		this.stream = stream;
		this.channel = channel;
		if (name !== undefined) {
			this.name = name;
		}
	}

	public markConnected(): void {
		this.resolveReady();
	}

	public send<T extends keyof Channel['receives']>(type: T, body: Channel['receives'][T]): void {
		this.stream.send('ch', {
			id: this.id,
			type: type,
			body: body,
		});

		this.outCount++;
	}

	protected beginDispose(): boolean {
		if (this.disposed) return false;
		this.disposed = true;
		return true;
	}

	public abstract dispose(): void;
}

class SharedConnection<Channel extends AnyOf<Channels> = AnyOf<Channels>> extends Connection<Channel> {
	private pool: Pool;

	public get id(): string {
		return this.pool.id;
	}

	constructor(stream: Stream, channel: string, pool: Pool, name?: string) {
		super(stream, channel, name);

		this.dispose = this.dispose.bind(this);

		this.pool = pool;
		this.pool.inc();
	}

	public dispose(): void {
		if (!this.beginDispose()) return;
		this.pool.dec();
		this.removeAllListeners();
		this.stream.removeSharedConnection(this as unknown as SharedConnection);
	}
}

class NonSharedConnection<Channel extends AnyOf<Channels> = AnyOf<Channels>> extends Connection<Channel> {
	public id: string;
	protected params: Channel['params'];

	constructor(stream: Stream, channel: string, id: string, params: Channel['params']) {
		super(stream, channel);

		this.connect = this.connect.bind(this);
		this.dispose = this.dispose.bind(this);

		this.params = params;
		this.id = id;

		this.connect();
	}

	public connect(): void {
		this.stream.send('connect', {
			channel: this.channel,
			id: this.id,
			params: this.params,
			pong: true,
		});
	}

	public dispose(): void {
		if (!this.beginDispose()) return;
		this.removeAllListeners();
		this.stream.send('disconnect', { id: this.id });
		this.stream.disconnectToChannel(this as unknown as NonSharedConnection);
	}
}
