/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { cleanup, fireEvent, render } from '@testing-library/vue';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { nextTick } from 'vue';
import type { entities } from 'misskey-js';
import type { MenuItem, MenuParent } from '@/types/menu.js';

const { api, popupMenu, channelOn, channelDispose } = vi.hoisted(() => ({
	api: vi.fn(),
	popupMenu: vi.fn(),
	channelOn: vi.fn(),
	channelDispose: vi.fn(),
}));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: api }));
vi.mock('@/store.js', () => ({ store: { realtimeMode: true } }));
vi.mock('@/stream.js', () => ({
	useStream: () => ({ useChannel: () => ({ on: channelOn, dispose: channelDispose }), send: vi.fn() }),
}));
vi.mock('@/os.js', () => ({ popupMenu }));
vi.mock('@/features/drive/get-drive-file-menu.js', () => ({ getDriveFileMenu: vi.fn() }));
vi.mock('@/features/drive/components/MkDrive.File.vue', () => ({
	default: {
		props: ['file'],
		template: '<span data-drive-file :data-id="file.id" :data-type="file.type">{{ file.name }}</span>',
	},
}));
vi.mock('@/features/drive/components/MkDrive.Folder.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/features/drive/components/MkDrive.NavFolder.vue', () => ({ default: { template: '<div />' } }));

import MkDrive from '@/features/drive/components/MkDrive.vue';
import { globalEvents } from '@/events.js';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';

type Request = {
	endpoint: string;
	params: entities.DriveFilesRequest;
	signal: AbortSignal;
	resolve: (files: entities.DriveFile[]) => void;
	reject: (error: unknown) => void;
};
let requests: Request[];
let database: entities.DriveFile[];
let hold: (endpoint: string, params: entities.DriveFilesRequest) => boolean;
let previousAnimation: boolean;
let previousInfiniteScroll: boolean;

function file(index: number, extra: Partial<entities.DriveFile> = {}): entities.DriveFile {
	return {
		id: String(index).padStart(4, '0'),
		name: String(index).padStart(4, '0'),
		size: index,
		createdAt: '2026-01-01T00:00:00.000Z',
		type: 'image/png',
		folderId: null,
		md5: null,
		isSensitive: false,
		blurhash: null,
		properties: {},
		url: 'https://example.com/file.png',
		thumbnailUrl: null,
		comment: null,
		userId: null,
		...extra,
	};
}

async function flush() {
	for (let i = 0; i < 8; i++) await nextTick();
}

function response(endpoint: string, params: entities.DriveFilesRequest) {
	if (endpoint === 'drive/folders') return [];
	const rows = database.filter(
		(item) =>
			item.folderId === (params.folderId ?? null) &&
			(!params.type ||
				(params.type.endsWith('/*') ? item.type.startsWith(params.type.slice(0, -1)) : item.type === params.type)) &&
			(!params.untilId || item.id < params.untilId) &&
			(!params.sinceId || item.id > params.sinceId),
	);
	rows.sort((a, b) => {
		if (params.sort?.endsWith('name')) return (params.sort.startsWith('-') ? 1 : -1) * a.name.localeCompare(b.name);
		if (params.sort?.endsWith('size')) return (params.sort.startsWith('-') ? 1 : -1) * (a.size - b.size);
		return params.sinceId ? a.id.localeCompare(b.id) : b.id.localeCompare(a.id);
	});
	return rows.slice(params.offset ?? 0, (params.offset ?? 0) + (params.limit ?? 30));
}

function mountDrive(type?: string) {
	return render(MkDrive, {
		props: { ...(type === undefined ? {} : { type }), forceDisableInfiniteScroll: true },
		global: {
			stubs: {
				MkStickyContainer: { template: '<div><slot name="header" /><slot /><slot name="footer" /></div>' },
				MkTip: true,
				MkLoading: { template: '<span data-loading />' },
			},
			directives: { appear: {}, anim: {} },
		},
	});
}

async function chooseSort(container: Element, index: number) {
	await fireEvent.click(container.querySelector<HTMLButtonElement>('button[aria-label]')!);
	const menu: MenuItem[] = popupMenu.mock.lastCall![0];
	const parent = menu.find(
		(item): item is MenuParent =>
			item != null &&
			typeof item === 'object' &&
			'type' in item &&
			item.type === 'parent' &&
			item.text === i18n.ts.sort,
	);
	if (!parent || !Array.isArray(parent.children)) throw new Error('Sort menu missing');
	const choice = parent.children[index];
	if (!choice || typeof choice !== 'object' || !('action' in choice)) throw new Error('Sort action missing');
	choice.action(new PointerEvent('click'));
	await flush();
}

function displayed(container: Element) {
	return [...container.querySelectorAll('[data-drive-file]')].map((row) => row.getAttribute('data-id'));
}

function stream(event: string, payload: entities.DriveFile | string) {
	const registration = channelOn.mock.calls.find(([name]) => name === event);
	if (!registration) throw new Error(`Missing stream event ${event}`);
	registration[1](payload);
}

beforeEach(() => {
	api.mockReset();
	popupMenu.mockReset();
	channelOn.mockReset();
	channelDispose.mockReset();
	requests = [];
	database = [file(2), file(1)];
	hold = () => false;
	previousAnimation = prefer.animation;
	previousInfiniteScroll = prefer.enableInfiniteScroll;
	prefer.commit('animation', false);
	prefer.commit('enableInfiniteScroll', false);
	api.mockImplementation(
		(endpoint: string, params: entities.DriveFilesRequest, _token: unknown, signal: AbortSignal) => {
			const pending = Promise.withResolvers<entities.DriveFile[]>();
			requests.push({ endpoint, params, signal, resolve: pending.resolve, reject: pending.reject });
			signal.addEventListener('abort', () => pending.reject(new DOMException('Aborted', 'AbortError')), { once: true });
			if (!hold(endpoint, params)) pending.resolve(response(endpoint, params));
			return pending.promise;
		},
	);
});

afterEach(() => {
	cleanup();
	prefer.commit('animation', previousAnimation);
	prefer.commit('enableInfiniteScroll', previousInfiniteScroll);
});

describe('Drive paginator consumer', () => {
	test('local and streamed creations share type/folder filters; updates leaving the filter disappear', async () => {
		const view = mountDrive('image/*');
		await flush();
		globalEvents.emit('driveFileCreated', file(3, { type: 'video/mp4' }));
		stream('fileCreated', file(4, { folderId: 'other-folder' }));
		globalEvents.emit('driveFilesUpdated', [file(5, { type: 'audio/ogg' }), file(2, { type: 'video/mp4' })]);
		await flush();
		expect(displayed(view.container)).toEqual(['0001']);
		expect(view.container.querySelector('[data-type="video/mp4"]')).toBeNull();
	});

	test('oldest chronology defers new files until its tail has been fetched', async () => {
		database = Array.from({ length: 35 }, (_, index) => file(index + 1));
		const view = mountDrive();
		await flush();
		await chooseSort(view.container, 1);
		database.push(file(36), file(37));
		globalEvents.emit('driveFileCreated', file(36));
		stream('fileCreated', file(37));
		await flush();
		expect(displayed(view.container)).toEqual(database.slice(0, 30).map((item) => item.id));
		await fireEvent.click(view.getByText(i18n.ts.loadMore));
		await flush();
		expect(displayed(view.container)).toEqual(database.map((item) => item.id));
		database.push(file(38));
		globalEvents.emit('driveFileCreated', file(38));
		stream('fileCreated', file(38));
		await flush();
		expect(displayed(view.container)).toEqual(database.map((item) => item.id));
	});

	test.each([
		['-name', 5],
		['+name', 4],
		['-size', 3],
		['+size', 2],
	] as const)(
		'%s mutations restart the server prefix and abort an obsolete offset page without holes',
		async (sort, menuIndex) => {
			database = Array.from({ length: 45 }, (_, index) => file(index + 1));
			const view = mountDrive('image/*');
			await flush();
			await chooseSort(view.container, menuIndex);
			hold = (_endpoint, params) => (params.offset ?? 0) > 0;
			await fireEvent.click(view.getByText(i18n.ts.loadMore));
			const obsolete = requests.at(-1)!;
			database.push(file(46, { name: '0015a', size: 15.5 }));
			stream('fileCreated', database.at(-1)!);
			await flush();
			expect(obsolete.signal.aborted).toBe(true);
			obsolete.resolve(response('drive/files', obsolete.params));
			await flush();
			const moved = { ...database[0]!, name: 'zzzz', size: 100 };
			database[0] = moved;
			globalEvents.emit('driveFilesUpdated', [moved]);
			await flush();
			const removed = database.splice(4, 1)[0]!;
			globalEvents.emit('driveFilesDeleted', [removed]);
			await flush();
			hold = () => false;
			await fireEvent.click(view.getByText(i18n.ts.loadMore));
			await flush();
			const expected = response('drive/files', { sort, limit: 100, type: 'image/*' });
			expect(displayed(view.container)).toEqual(expected.map((item) => item.id));
			expect(new Set(displayed(view.container)).size).toBe(database.length);
		},
	);

	test('only the newest initialization clears loading, and folder settlement launches no stale continuation', async () => {
		hold = () => true;
		const view = mountDrive();
		await chooseSort(view.container, 5);
		await chooseSort(view.container, 3);
		const current = requests.slice(-2);
		expect(requests.slice(0, -2).every((request) => request.signal.aborted)).toBe(true);
		expect(view.container.querySelector('[data-loading]')).not.toBeNull();
		const count = requests.length;
		current.find((request) => request.endpoint === 'drive/folders')!.resolve([]);
		await flush();
		expect(requests).toHaveLength(count);
		expect(view.container.querySelector('[data-loading]')).not.toBeNull();
		current.find((request) => request.endpoint === 'drive/files')!.reject({ code: 'OFFLINE' });
		await flush();
		expect(view.container.querySelector('[data-loading]')).toBeNull();
		expect(displayed(view.container)).toEqual([]);
	});

	test('creation replacing an initial files request keeps loading until the replacement settles', async () => {
		hold = () => true;
		const view = mountDrive('image/*');
		const initial = [...requests];
		database.push(file(3));
		globalEvents.emit('driveFileCreated', file(3));
		await flush();
		expect(initial.find((request) => request.endpoint === 'drive/files')!.signal.aborted).toBe(true);
		initial.find((request) => request.endpoint === 'drive/folders')!.resolve([]);
		await flush();
		expect(view.container.querySelector('[data-loading]')).not.toBeNull();
		const replacement = requests.at(-1)!;
		replacement.resolve(response(replacement.endpoint, replacement.params));
		await flush();
		expect(view.container.querySelector('[data-loading]')).toBeNull();
		expect(displayed(view.container)).toEqual(['0003', '0002', '0001']);
	});

	test('destroying Drive aborts both independent pending lists and disconnects streaming', async () => {
		hold = () => true;
		const view = mountDrive();
		const pending = [...requests];
		view.unmount();
		await flush();
		expect(pending.map((request) => request.signal.aborted)).toEqual([true, true]);
		expect(channelDispose).toHaveBeenCalledOnce();
		for (const request of pending) request.resolve([file(9)]);
		await flush();
		expect(requests).toHaveLength(2);
	});
});
