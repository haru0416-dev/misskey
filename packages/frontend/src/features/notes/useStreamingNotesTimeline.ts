/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { onActivated, onDeactivated, onMounted, onScopeDispose, shallowRef, watch } from 'vue';
import type { ShallowRef } from 'vue';
import type * as Misskey from 'misskey-js';
import { PollingScheduler } from '@shared/utility/polling-scheduler.js';
import type { BasicTimelineType } from '@/timelines.js';
import { Paginator } from '@/utility/paginator.js';
import type { IPaginator, MisskeyEntity } from '@/utility/paginator.js';
import { useStream } from '@/stream.js';
import { instance } from '@/instance.js';
import { prefer } from '@/preferences.js';
import { store } from '@/store.js';
import { globalEvents } from '@/events.js';

type TimelineOptions = {
	src: BasicTimelineType | 'mentions' | 'directs' | 'list' | 'antenna' | 'channel' | 'role';
	list?: string | undefined;
	antenna?: string | undefined;
	channel?: string | undefined;
	role?: string | undefined;
	withRenotes: boolean;
	withReplies: boolean;
	withSensitive: boolean;
	onlyFiles: boolean;
};

type TimelineEffects = {
	isAtTop: () => boolean;
	onBeforePrepend: (noteId: string) => void;
	onNote: (note: Misskey.entities.Note) => void;
	onRemove: (noteId: string) => void;
	onQueueReleased: () => void;
};

type OwnedPaginator = IPaginator<Misskey.entities.Note> & { cancelRequests(): void; dispose(): void };

export interface StreamingNotesTimeline {
	paginator: ShallowRef<IPaginator<Misskey.entities.Note>>;
	reloadTimeline(): Promise<void>;
	releaseQueue(): void;
	onViewportChanged(): void;
}

function createPaginator(options: TimelineOptions): OwnedPaginator {
	const withFiles = options.onlyFiles ? { withFiles: true as const } : {};
	const filters = { withRenotes: options.withRenotes, ...withFiles };
	switch (options.src) {
		case 'antenna':
			return new Paginator('antennas/notes', { params: { antennaId: options.antenna! } });
		case 'home':
			return new Paginator('notes/timeline', { params: filters });
		case 'local':
			return new Paginator('notes/local-timeline', { params: { ...filters, withReplies: options.withReplies } });
		case 'social':
			return new Paginator('notes/hybrid-timeline', { params: { ...filters, withReplies: options.withReplies } });
		case 'global':
			return new Paginator('notes/global-timeline', { params: filters });
		case 'mentions':
			return new Paginator('notes/mentions', {});
		case 'directs':
			return new Paginator('notes/mentions', { params: { visibility: 'specified' } });
		case 'list':
			return new Paginator('notes/user-list-timeline', { params: { ...filters, listId: options.list! } });
		case 'channel':
			return new Paginator('channels/timeline', { params: { channelId: options.channel! } });
		case 'role':
			return new Paginator('roles/notes', { params: { roleId: options.role! } });
		default:
			throw new Error('Unrecognized timeline type: ' + options.src);
	}
}

export function useStreamingNotesTimeline(options: TimelineOptions, effects: TimelineEffects): StreamingNotesTimeline {
	let current = createPaginator(options);
	const paginator = shallowRef<IPaginator<Misskey.entities.Note>>(current);
	let mounted = false;
	let active = true;
	let disposed = false;
	let adInsertionCounter = 0;
	let polling: PollingScheduler | null = null;
	let stopSession: () => void;

	const minPollingInterval = 1000 * 10;
	const pollingInterval =
		prefer.pollingInterval === 1
			? minPollingInterval * 1.5 * 1.5
			: prefer.pollingInterval === 2
				? minPollingInterval * 1.5
				: minPollingInterval;

	function shouldQueue(): boolean {
		return !active || !effects.isAtTop() || window.document.visibilityState === 'hidden';
	}

	function releaseQueue(): void {
		current.releaseQueue();
		effects.onQueueReleased();
	}

	function onViewportChanged(): void {
		if (active && effects.isAtTop()) {
			current.releaseQueue();
		}
	}

	function onVisibilityChange(): void {
		if (active && window.document.visibilityState === 'visible' && effects.isAtTop()) {
			releaseQueue();
		}
	}

	function startSession(): void {
		const owned = current;
		let stopped = false;
		const connections: { dispose(): void }[] = [];
		const fetchNewer = (): Promise<void> => owned.fetchNewer({ toQueue: shouldQueue() });

		function prepend(note: Misskey.entities.Note & MisskeyEntity): void {
			if (stopped) {
				return;
			}
			adInsertionCounter++;
			if (instance.notesPerOneAd > 0 && adInsertionCounter % instance.notesPerOneAd === 0) {
				note._shouldInsertAd_ = true;
			}
			if (shouldQueue()) {
				owned.enqueue(note);
			} else {
				effects.onBeforePrepend(note.id);
				owned.prepend(note);
			}
			effects.onNote(note);
		}

		const realtime = store.realtimeMode;
		if (realtime) {
			const stream = useStream();
			const withFiles = options.onlyFiles ? { withFiles: true as const } : {};
			const filters = { withRenotes: options.withRenotes, ...withFiles };
			// 再接続は Stream が既存 channel を復元する。共有 stream 自体はこの所有者で閉じない。
			function channel<C extends keyof Misskey.Channels>(
				name: C,
				params?: Misskey.Channels[C]['params'],
			): Misskey.IChannelConnection<Misskey.Channels[C]> {
				const connection = stream.useChannel(name, params);
				connections.push(connection);
				return connection;
			}

			switch (options.src) {
				case 'antenna':
					if (options.antenna != null) {
						channel('antenna', { antennaId: options.antenna }).on('note', prepend);
					}
					break;
				case 'home':
					channel('homeTimeline', filters).on('note', prepend);
					channel('main');
					break;
				case 'local':
					channel('localTimeline', { ...filters, withReplies: options.withReplies }).on('note', prepend);
					break;
				case 'social':
					channel('hybridTimeline', { ...filters, withReplies: options.withReplies }).on('note', prepend);
					break;
				case 'global':
					channel('globalTimeline', filters).on('note', prepend);
					break;
				case 'mentions':
					channel('main').on('mention', prepend);
					break;
				case 'directs':
					channel('main').on('mention', (note) => {
						if (note.visibility === 'specified') {
							prepend(note);
						}
					});
					break;
				case 'list':
					if (options.list != null) {
						channel('userList', { ...filters, listId: options.list }).on('note', prepend);
					}
					break;
				case 'channel':
					if (options.channel != null) {
						channel('channel', { channelId: options.channel }).on('note', prepend);
					}
					break;
				case 'role':
					if (options.role != null) {
						channel('roleTimeline', { roleId: options.role }).on('note', prepend);
					}
					break;
			}
		} else {
			polling = new PollingScheduler(() => {
				void fetchNewer();
			}, pollingInterval);
			if (mounted && active) {
				polling.start();
			}
			globalEvents.on('notePosted', fetchNewer);
		}

		stopSession = () => {
			stopped = true;
			owned.cancelRequests();
			for (const connection of connections) {
				connection.dispose();
			}
			polling?.dispose();
			polling = null;
			if (!realtime) {
				globalEvents.off('notePosted', fetchNewer);
			}
		};
	}

	startSession();

	const stopIdentityWatch = watch(
		() => ({
			src: options.src,
			list: options.list,
			antenna: options.antenna,
			channel: options.channel,
			role: options.role,
			withRenotes: options.withRenotes,
			withReplies: options.withReplies,
			onlyFiles: options.onlyFiles,
			withSensitive: options.withSensitive,
			realtimeMode: store.realtimeMode,
		}),
		(identity, previousIdentity) => {
			stopSession();
			current.dispose();
			if (identity.src !== previousIdentity.src || identity.withSensitive !== previousIdentity.withSensitive) {
				adInsertionCounter = 0;
			}
			// 条件ごとに取得結果と queue を所有し、取消を無視した応答も旧 Paginator 内で破棄する。
			current = createPaginator(options);
			paginator.value = current;
			if (active) startSession();
			if (mounted && active) {
				void current.init();
			}
		},
	);

	function onNoteRemovedFromAntenna(antennaId: string, noteId: string): void {
		if (options.src === 'antenna' && options.antenna === antennaId) {
			effects.onRemove(noteId);
		}
	}

	globalEvents.on('noteDeleted', effects.onRemove);
	globalEvents.on('noteRemovedFromAntenna', onNoteRemovedFromAntenna);

	onMounted(() => {
		if (disposed) return;
		mounted = true;
		void current.init();
		polling?.start();
		window.document.addEventListener('visibilitychange', onVisibilityChange);
	});
	onActivated(() => {
		if (active || disposed) return;
		active = true;
		startSession();
		// KeepAlive は表示済み集合とスクロール位置を保持し、復帰時に休止中の新着を補う。
		if (current.items.value.length === 0) {
			void current.init();
		} else {
			void current.fetchNewer({ toQueue: shouldQueue() });
		}
	});
	onDeactivated(() => {
		active = false;
		stopSession();
	});
	onScopeDispose(() => {
		disposed = true;
		stopIdentityWatch();
		stopSession();
		current.dispose();
		window.document.removeEventListener('visibilitychange', onVisibilityChange);
		globalEvents.off('noteDeleted', effects.onRemove);
		globalEvents.off('noteRemovedFromAntenna', onNoteRemovedFromAntenna);
	});

	function reloadTimeline(): Promise<void> {
		adInsertionCounter = 0;
		return active ? current.reload() : Promise.resolve();
	}

	return { paginator, reloadTimeline, releaseQueue, onViewportChanged };
}
