<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkStickyContainer style="background: var(--MI_THEME-bg);">
	<template #header>
		<nav :class="$style.nav">
			<div :class="$style.navPath" @contextmenu.prevent.stop="() => {}">
				<XNavFolder
					:class="[$style.navPathItem, { [$style.navCurrent]: folder == null }]"
					:parentFolder="folder"
					@click="cd(null)"
					@upload="onUploadRequested"
				/>
				<template v-for="f in hierarchyFolders">
					<span :class="[$style.navPathItem, $style.navSeparator]"><i class="ti ti-chevron-right"></i></span>
					<XNavFolder
						:folder="f"
						:parentFolder="folder"
						:class="[$style.navPathItem]"
						@click="cd(f)"
						@upload="onUploadRequested"
					/>
				</template>
				<span v-if="folder != null" :class="[$style.navPathItem, $style.navSeparator]"><i class="ti ti-chevron-right"></i></span>
				<span v-if="folder != null" :class="[$style.navPathItem, $style.navCurrent]">{{ folder.name }}</span>
			</div>
			<button class="_button" :class="$style.navMenu" :aria-label="i18n.ts.menu" @click="showMenu"><i class="ti ti-dots"></i></button>
		</nav>
	</template>

	<div>
		<div v-if="select === 'folder'">
			<template v-if="folder == null">
				<MkButton v-if="!isRootSelected" @click="isRootSelected = true">
					<i class="ti ti-square"></i> {{ i18n.ts.selectFolder }}
				</MkButton>
				<MkButton v-else @click="isRootSelected = false">
					<i class="ti ti-checkbox"></i> {{ i18n.ts.unselectFolder }}
				</MkButton>
			</template>
			<template v-else>
				<MkButton v-if="!selectedFolders.some(f => f.id === folder!.id)" @click="selectedFolders.push(folder)">
					<i class="ti ti-square"></i> {{ i18n.ts.selectFolder }}
				</MkButton>
				<MkButton v-else @click="selectedFolders = selectedFolders.filter(f => f.id !== folder!.id)">
					<i class="ti ti-checkbox"></i> {{ i18n.ts.unselectFolder }}
				</MkButton>
			</template>
		</div>

		<div
			ref="main"
			:class="[$style.main, { [$style.fetching]: fetching }]"
			@dragover.prevent.stop="onDragover"
			@dragenter="onDragenter"
			@dragleave="onDragleave"
			@drop.prevent.stop="onDrop"
			@contextmenu.stop="onContextmenu"
		>
			<div :class="$style.tipContainer">
				<MkTip k="drive"><div v-html="i18n.ts.driveAboutTip"></div></MkTip>
			</div>

			<div :class="$style.folders">
				<XFolder
					v-for="(f, i) in foldersPaginator.items.value"
					:key="f.id"
					v-anim="i"
					:data-scroll-anchor="f.id"
					:folder="f"
					:selectMode="select === 'folder'"
					:isSelected="selectedFolderIds.has(f.id)"
					@chosen="chooseFolder"
					@unchose="unchoseFolder"
					@click="cd(f)"
					@upload="onUploadRequested"
					@dragstart="isDragSource = true"
					@dragend="isDragSource = false"
				/>
			</div>
			<MkPaginatorFailure v-if="foldersPaginator.canFetchOlder.value" :failure="foldersPaginator.olderFailure.value"/>
			<MkButton v-if="foldersPaginator.canFetchOlder.value" :class="$style.loadMore" primary rounded @click="foldersPaginator.fetchOlder()">{{ foldersPaginator.olderFailure.value ? i18n.ts.retry : i18n.ts.loadMore }}</MkButton>

			<template v-if="shouldBeGroupedByDate">
				<MkStickyContainer v-for="(item, i) in filesTimeline" :key="`${item.date.getFullYear()}/${item.date.getMonth() + 1}`">
					<template #header>
						<div :class="$style.date">
							<span><i class="ti ti-chevron-down"></i> {{ item.date.getFullYear() }}/{{ item.date.getMonth() + 1 }}</span>
						</div>
					</template>

					<TransitionGroup
						tag="div"
						:enterActiveClass="prefer.animation ? $style.transition_files_enterActive : ''"
						:leaveActiveClass="prefer.animation ? $style.transition_files_leaveActive : ''"
						:enterFromClass="prefer.animation ? $style.transition_files_enterFrom : ''"
						:leaveToClass="prefer.animation ? $style.transition_files_leaveTo : ''"
						:moveClass="prefer.animation ? $style.transition_files_move : ''"
						:class="$style.files"
					>
						<XFile
							v-for="file in item.items" :key="file.id"
							:data-scroll-anchor="file.id"
							:file="file"
							:folder="folder"
							:isSelected="selectedFileIds.has(file.id)"
							@click="onFileClick($event, file)"
							@dragstart="onFileDragstart(file, $event)"
							@dragend="isDragSource = false"
						/>
					</TransitionGroup>
				</MkStickyContainer>
			</template>
			<TransitionGroup
				v-else
				tag="div"
				:enterActiveClass="prefer.animation ? $style.transition_files_enterActive : ''"
				:leaveActiveClass="prefer.animation ? $style.transition_files_leaveActive : ''"
				:enterFromClass="prefer.animation ? $style.transition_files_enterFrom : ''"
				:leaveToClass="prefer.animation ? $style.transition_files_leaveTo : ''"
				:moveClass="prefer.animation ? $style.transition_files_move : ''"
				:class="$style.files"
			>
				<XFile
					v-for="file in filesPaginator.items.value" :key="file.id"
					:data-scroll-anchor="file.id"
					:file="file"
					:folder="folder"
					:isSelected="selectedFileIds.has(file.id)"
					@click="onFileClick($event, file)"
					@dragstart="onFileDragstart(file, $event)"
					@dragend="isDragSource = false"
				/>
			</TransitionGroup>

			<MkPaginatorFailure v-if="canFetchFiles" :failure="filesFailure"/>
			<!-- v-appear は mounted でしか値を読まないので、失敗の有無で作り直して自動の読み込みを止める・戻す。 -->
			<MkButton
				v-show="canFetchFiles"
				:key="filesFailure ? 'more-failed' : 'more'"
				v-appear="shouldEnableInfiniteScroll && !filesFailure ? fetchMoreFiles : null"
				:class="$style.loadMore"
				primary
				rounded
				@click="fetchMoreFiles"
			>
				{{ filesFailure ? i18n.ts.retry : i18n.ts.loadMore }}
			</MkButton>

			<div v-if="filesPaginator.items.value.length == 0 && foldersPaginator.items.value.length == 0 && !fetching" :class="$style.empty">
				<div v-if="draghover">{{ i18n.ts.dropHereToUpload }}</div>
				<div v-if="!draghover && folder == null"><strong>{{ i18n.ts.emptyDrive }}</strong></div>
				<div v-if="!draghover && folder != null">{{ i18n.ts.emptyFolder }}</div>
			</div>
		</div>
		<MkLoading v-if="fetching"/>
		<div v-if="draghover" :class="$style.dropzone"></div>
	</div>

	<template #footer>
		<div v-if="isEditMode" :class="$style.footer">
			<MkButton primary rounded @click="moveFilesBulk()"><i class="ti ti-folder-symlink"></i> {{ i18n.ts.move }}...</MkButton>
		</div>
	</template>
</MkStickyContainer>
</template>

<script lang="ts" setup>
import {
	nextTick,
	onActivated,
	onBeforeUnmount,
	onMounted,
	ref,
	useTemplateRef,
	watch,
	computed,
	TransitionGroup,
	markRaw,
} from 'vue';
import * as Misskey from 'misskey-js';
import MkButton from '@/components/form/MkButton.vue';
import MkPaginatorFailure from '@/components/layout/MkPaginatorFailure.vue';
import type { MenuItem } from '@/types/menu.js';
import XNavFolder from '@/features/drive/components/MkDrive.NavFolder.vue';
import XFolder from '@/features/drive/components/MkDrive.Folder.vue';
import XFile from '@/features/drive/components/MkDrive.File.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { useStream } from '@/stream.js';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';
import { alertDriveMoveError, chooseFileFromPcAndUpload, moveDriveFilesToFolder, moveDriveFolderToFolder, requestUploadFromUrl, selectDriveFolder } from '@/features/drive/drive.js';
import { store } from '@/store.js';
import { makeDateGroupedTimelineComputedRef } from '@/features/note/timeline-date-separate.js';
import { globalEvents, useGlobalEvent } from '@/events.js';
import { checkDragDataType, getDragData, setDragData, getDropEffect } from '@/utility/drag-and-drop.js';
import { getDriveFileMenu } from '@/features/drive/get-drive-file-menu.js';
import { Paginator } from '@/utility/paginator.js';

const props = withDefaults(
	defineProps<{
		initialFolder?: Misskey.entities.DriveFolder | Misskey.entities.DriveFolder['id'] | null;
		type?: string;
		multiple?: boolean;
		select?: 'file' | 'folder' | null;
		forceDisableInfiniteScroll?: boolean;
	}>(),
	{
		initialFolder: null,
		multiple: false,
		select: null,
		forceDisableInfiniteScroll: false,
	},
);

const emit = defineEmits<{
	(ev: 'changeSelectedFiles', v: Misskey.entities.DriveFile[]): void;
	(ev: 'changeSelectedFolders', v: (Misskey.entities.DriveFolder | null)[]): void;
	(ev: 'cd', v: Misskey.entities.DriveFolder | null): void;
}>();

const shouldEnableInfiniteScroll = computed(() => {
	return prefer.enableInfiniteScroll && !props.forceDisableInfiniteScroll;
});

const folder = ref<Misskey.entities.DriveFolder | null>(null);
const hierarchyFolders = ref<Misskey.entities.DriveFolder[]>([]);

const draghover = ref(false);

// 表示中の階層からのドラッグでは、同じ階層への移動を受け付けない。
const isDragSource = ref(false);

const isEditMode = ref(false);

const selectedFiles = ref<Misskey.entities.DriveFile[]>([]);
const selectedFolders = ref<Misskey.entities.DriveFolder[]>([]);
// 表示中の各項目の選択表示で引く。配列を毎回探すと、1,000 件を全選択した状態で切り替えのたびに約 100 万回比べる。
const selectedFileIds = computed(() => new Set(selectedFiles.value.map((f) => f.id)));
const selectedFolderIds = computed(() => new Set(selectedFolders.value.map((f) => f.id)));
const isRootSelected = ref(false);

watch(
	selectedFiles,
	() => {
		emit('changeSelectedFiles', selectedFiles.value);
	},
	{ deep: true },
);

watch([selectedFolders, isRootSelected], () => {
	emit('changeSelectedFolders', isRootSelected.value ? [null, ...selectedFolders.value] : selectedFolders.value);
});

const initializing = ref(true);
const fetching = computed(() => initializing.value || filesPaginator.fetching.value || foldersPaginator.fetching.value);

const sortModeSelect = ref<NonNullable<Misskey.entities.DriveFilesRequest['sort']>>('+createdAt');

/**
 * 種類での絞り込み。`props.type` は呼び出し側が固定する条件 (ファイル選択ダイアログ等) なので、
 * そちらが指定されている場合はメニューを出さず固定条件を優先する。
 */
const typeFilter = ref<'all' | 'image' | 'video' | 'audio'>('all');
const typeFilterPrefix: Record<Exclude<typeof typeFilter.value, 'all'>, string> = {
	image: 'image/*',
	video: 'video/*',
	audio: 'audio/*',
};
const canFilterByType = computed(() => props.type === undefined);
const effectiveType = computed(() => {
	if (props.type !== undefined) {
		return props.type;
	}
	if (typeFilter.value === 'all') {
		return undefined;
	}
	return typeFilterPrefix[typeFilter.value];
});

const filesPaginator = markRaw(
	new Paginator('drive/files', {
		limit: 30,
		canFetchDetection: 'limit',
		// 名前・サイズ順では ID のカーソルが並びの続きを表さないので、読んだ件数で続きを取る。
		offsetMode: () => !['-createdAt', '+createdAt'].includes(sortModeSelect.value),
		params: () => ({
			// 自動でリロードしたくないためcomputedParamsは使わない
			folderId: folder.value ? folder.value.id : null,
			...(effectiveType.value === undefined ? {} : { type: effectiveType.value }),
			sort: ['-createdAt', '+createdAt'].includes(sortModeSelect.value) ? null : sortModeSelect.value,
		}),
	}),
);
const foldersPaginator = markRaw(
	new Paginator('drive/folders', {
		limit: 30,
		canFetchDetection: 'limit',
		params: () => ({
			// 自動でリロードしたくないためcomputedParamsは使わない
			folderId: folder.value ? folder.value.id : null,
		}),
	}),
);

const canFetchFiles = computed(
	() =>
		!fetching.value &&
		(filesPaginator.order.value === 'oldest' ? filesPaginator.canFetchNewer.value : filesPaginator.canFetchOlder.value),
);

const filesFailure = computed(() =>
	filesPaginator.order.value === 'oldest' ? filesPaginator.newerFailure.value : filesPaginator.olderFailure.value,
);

async function fetchMoreFiles() {
	if (filesPaginator.order.value === 'oldest') {
		filesPaginator.fetchNewer();
	} else {
		filesPaginator.fetchOlder();
	}
}

const filesTimeline = makeDateGroupedTimelineComputedRef(filesPaginator.items);
const shouldBeGroupedByDate = computed(() => ['+createdAt', '-createdAt'].includes(sortModeSelect.value));

watch(folder, () => emit('cd', folder.value));
watch([sortModeSelect, effectiveType], () => {
	initialize();
});

let initializeGeneration = 0;

async function initialize() {
	const generation = ++initializeGeneration;
	initializing.value = true;
	filesPaginator.initialDirection = sortModeSelect.value === '-createdAt' ? 'newer' : 'older';
	filesPaginator.order.value = sortModeSelect.value === '-createdAt' ? 'oldest' : 'newest';
	// フォルダーとファイルは独立した一覧なので、条件変更時に両方の旧リクエストを直ちに置き換える。
	await Promise.all([foldersPaginator.reload(), filesPaginator.reload()]);
	if (generation === initializeGeneration) {
		initializing.value = false;
	}
}

function matchesFileFilter(file: Misskey.entities.DriveFile): boolean {
	return file.folderId === (folder.value?.id ?? null) &&
		(effectiveType.value == null || matchesTypeFilter(file.type, effectiveType.value));
}

function usesFileOffset(): boolean {
	return !['-createdAt', '+createdAt'].includes(sortModeSelect.value);
}

function onDriveFileCreated(file: Misskey.entities.DriveFile) {
	if (!matchesFileFilter(file)) return;
	if (filesPaginator.items.value.some((item) => item.id === file.id)) return;
	// 名前・サイズ順では未取得部分の位置を確定できない。サーバーの先頭から取り直し、offset の基準を維持する。
	if (usesFileOffset() || filesPaginator.fetching.value || filesPaginator.fetchingNewer.value) {
		filesPaginator.reload();
		return;
	}
	// 古い順の未取得部分にある新着は次ページに任せ、読み終えた場合だけ末尾へ足す。
	if (sortModeSelect.value === '-createdAt') {
		if (!filesPaginator.canFetchNewer.value) {
			const last = filesPaginator.items.value.at(-1);
			if (last && file.id < last.id) {
				filesPaginator.reload();
			} else {
				filesPaginator.pushItems([file]);
			}
		}
		return;
	}
	const first = filesPaginator.items.value[0];
	if (first && file.id < first.id) {
		filesPaginator.reload();
	} else {
		filesPaginator.prepend(file);
	}
}

/** `image/*` のようなワイルドカードを含む drive/files の type 指定に合うか。 */
function matchesTypeFilter(fileType: string, filter: string): boolean {
	if (filter.endsWith('/*')) {
		return fileType.startsWith(filter.slice(0, -1));
	}
	return fileType === filter;
}

function onFileDragstart(file: Misskey.entities.DriveFile, ev: DragEvent) {
	if (isEditMode.value) {
		if (!selectedFiles.value.some((f) => f.id === file.id)) {
			selectedFiles.value.push(file);
		}

		if (ev.dataTransfer) {
			ev.dataTransfer.effectAllowed = 'move';
			setDragData(ev, 'driveFiles', selectedFiles.value);
		}
	}

	isDragSource.value = true;
}

function onDragover(ev: DragEvent) {
	if (!ev.dataTransfer) {
		return;
	}

	if (isDragSource.value) {
		ev.dataTransfer.dropEffect = 'none';
		return;
	}

	const isFile = ev.dataTransfer.items[0]?.kind === 'file';
	if (isFile || checkDragDataType(ev, ['driveFiles', 'driveFolders'])) {
		ev.dataTransfer.dropEffect = getDropEffect(ev.dataTransfer.effectAllowed);
	} else {
		ev.dataTransfer.dropEffect = 'none';
	}

	return false;
}

function onDragenter() {
	if (!isDragSource.value) {
		draghover.value = true;
	}
}

function onDragleave() {
	draghover.value = false;
}

function onDrop(ev: DragEvent): void | boolean {
	draghover.value = false;

	if (!ev.dataTransfer) {
		return;
	}

	if (ev.dataTransfer.files.length > 0) {
		os.launchUploader(Array.from(ev.dataTransfer.files), {
			folderId: folder.value?.id ?? null,
		});
		return;
	}

	//#region ドライブのファイル
	{
		const droppedData = getDragData(ev, 'driveFiles');
		if (droppedData != null) {
			moveDriveFilesToFolder(droppedData, folder.value).catch(alertDriveMoveError);
		}
	}
	//#endregion

	//#region ドライブのフォルダ
	{
		const droppedData = getDragData(ev, 'driveFolders');
		if (droppedData != null) {
			const droppedFolder = droppedData[0];
			if (droppedFolder == null) {
				return;
			}
			if (folder.value && droppedFolder.id === folder.value.id) {
				return false;
			}
			if (foldersPaginator.items.value.some((f) => f.id === droppedFolder.id)) {
				return false;
			}
			moveDriveFolderToFolder(droppedFolder, folder.value).catch(alertDriveMoveError);
		}
	}
	//#endregion
}

function onUploadRequested(files: File[], folder?: Misskey.entities.DriveFolder | null) {
	os.launchUploader(files, {
		folderId: folder?.id ?? null,
	});
}

async function urlUpload() {
	const { canceled, result: url } = await os.inputText({
		title: i18n.ts.uploadFromUrl,
		type: 'url',
		placeholder: i18n.ts.uploadFromUrlDescription,
	});
	if (canceled || !url) {
		return;
	}

	// 保存されたファイルは drive チャンネルの fileCreated で一覧に入る。失敗の表示は requestUploadFromUrl が行う。
	await requestUploadFromUrl(url, folder.value?.id ?? null).catch(() => {});
}

async function createFolder() {
	const { canceled, result: name } = await os.inputText({
		title: i18n.ts.createFolder,
		placeholder: i18n.ts.folderName,
	});
	if (canceled || name == null) {
		return;
	}

	const createdFolder = await os.apiWithDialog('drive/folders/create', {
		name,
		...(folder.value == null ? {} : { parentId: folder.value.id }),
	});

	foldersPaginator.prepend(createdFolder);
}

async function renameFolder(folderToRename: Misskey.entities.DriveFolder) {
	const { canceled, result: name } = await os.inputText({
		title: i18n.ts.renameFolder,
		placeholder: i18n.ts.inputNewFolderName,
		default: folderToRename.name,
	});
	if (canceled) {
		return;
	}

	const updatedFolder = await os.apiWithDialog('drive/folders/update', {
		folderId: folderToRename.id,
		name,
	});

	globalEvents.emit('driveFoldersUpdated', [updatedFolder]);
}

function deleteFolder(folderToDelete: Misskey.entities.DriveFolder) {
	misskeyApi('drive/folders/delete', {
		folderId: folderToDelete.id,
	})
		.then(() => {
			cd(folderToDelete.parentId);
			globalEvents.emit('driveFoldersDeleted', [folderToDelete]);
		})
		.catch((err) => {
			switch (err.id) {
				case 'b0fc8a17-963c-405d-bfbc-859a487295e1':
					os.alert({
						type: 'error',
						title: i18n.ts.unableToDelete,
						text: i18n.ts.hasChildFilesOrFolders,
					});
					break;
				default:
					os.alert({
						type: 'error',
						text: i18n.ts.unableToDelete,
					});
			}
		});
}

function onFileClick(ev: PointerEvent, file: Misskey.entities.DriveFile) {
	if (ev.shiftKey) {
		isEditMode.value = true;
	}

	if (props.select === 'file' || isEditMode.value) {
		const isAlreadySelected = selectedFiles.value.some((f) => f.id === file.id);

		if (isEditMode.value) {
			if (isAlreadySelected) {
				selectedFiles.value = selectedFiles.value.filter((f) => f.id !== file.id);
			} else {
				selectedFiles.value.push(file);
			}
			return;
		}

		if (props.multiple) {
			if (isAlreadySelected) {
				selectedFiles.value = selectedFiles.value.filter((f) => f.id !== file.id);
			} else {
				selectedFiles.value.push(file);
			}
		} else {
			if (!isAlreadySelected) {
				selectedFiles.value = [file];
			}
		}
	} else {
		os.popupMenu(
			getDriveFileMenu(file, folder.value),
			(ev.currentTarget ?? ev.target ?? undefined) as HTMLElement | undefined,
		);
	}
}

function chooseFolder(folderToChoose: Misskey.entities.DriveFolder) {
	const isAlreadySelected = selectedFolders.value.some((f) => f.id === folderToChoose.id);
	if (props.multiple) {
		if (isAlreadySelected) {
			selectedFolders.value = selectedFolders.value.filter((f) => f.id !== folderToChoose.id);
		} else {
			selectedFolders.value.push(folderToChoose);
		}
	} else {
		if (!isAlreadySelected) {
			selectedFolders.value = [folderToChoose];
		}
	}
}

function unchoseFolder(folderToUnchose: Misskey.entities.DriveFolder) {
	selectedFolders.value = selectedFolders.value.filter((f) => f.id !== folderToUnchose.id);
}

function cd(target?: Misskey.entities.DriveFolder | Misskey.entities.DriveFolder['id' | 'parentId']) {
	if (!target) {
		goRoot();
		return;
	} else if (typeof target === 'object') {
		target = target.id;
	}

	initializing.value = true;

	misskeyApi('drive/folders/show', {
		folderId: target,
	}).then((folderToMove) => {
		folder.value = folderToMove;
		hierarchyFolders.value = [];

		const dive = (folderToDive: Misskey.entities.DriveFolder) => {
			hierarchyFolders.value.unshift(folderToDive);
			if (folderToDive.parent) {
				dive(folderToDive.parent);
			}
		};

		if (folderToMove.parent) {
			dive(folderToMove.parent);
		}

		initialize();
	});
}

async function moveFilesBulk() {
	if (selectedFiles.value.length === 0) {
		return;
	}

	const { canceled, folders } = await selectDriveFolder(folder.value ? folder.value.id : null);

	if (canceled) {
		return;
	}

	await os.apiWithDialog('drive/files/move-bulk', {
		fileIds: selectedFiles.value.map((f) => f.id),
		folderId: folders[0] ? folders[0].id : null,
	});

	globalEvents.emit(
		'driveFilesUpdated',
		selectedFiles.value.map((x) => ({
			...x,
			folderId: folders[0] ? folders[0].id : null,
			folder: folders[0] ?? null,
		})),
	);
}

function goRoot() {
	if (folder.value == null) {
		return;
	}

	folder.value = null;
	hierarchyFolders.value = [];
	initialize();
}

function getMenu() {
	const menu: MenuItem[] = [];

	menu.push(
		{
			text: i18n.ts.addFile,
			type: 'label',
		},
		{
			text: i18n.ts.upload,
			icon: 'ti ti-upload',
			action: () => {
				chooseFileFromPcAndUpload({
					multiple: true,
					...(folder.value == null ? {} : { folderId: folder.value.id }),
				});
			},
		},
		{
			text: i18n.ts.fromUrl,
			icon: 'ti ti-link',
			action: () => {
				urlUpload();
			},
		},
		{ type: 'divider' },
		{
			text: folder.value ? folder.value.name : i18n.ts.drive,
			type: 'label',
		},
	);

	menu.push({
		type: 'parent',
		text: i18n.ts.sort,
		icon: 'ti ti-arrows-sort',
		children: [
			{
				text: `${i18n.ts.registeredDate} (${i18n.ts.descendingOrder})`,
				icon: 'ti ti-sort-descending-letters',
				action: () => {
					sortModeSelect.value = '+createdAt';
				},
				active: sortModeSelect.value === '+createdAt',
			},
			{
				text: `${i18n.ts.registeredDate} (${i18n.ts.ascendingOrder})`,
				icon: 'ti ti-sort-ascending-letters',
				action: () => {
					sortModeSelect.value = '-createdAt';
				},
				active: sortModeSelect.value === '-createdAt',
			},
			{
				text: `${i18n.ts.size} (${i18n.ts.descendingOrder})`,
				icon: 'ti ti-sort-descending-letters',
				action: () => {
					sortModeSelect.value = '+size';
				},
				active: sortModeSelect.value === '+size',
			},
			{
				text: `${i18n.ts.size} (${i18n.ts.ascendingOrder})`,
				icon: 'ti ti-sort-ascending-letters',
				action: () => {
					sortModeSelect.value = '-size';
				},
				active: sortModeSelect.value === '-size',
			},
			{
				text: `${i18n.ts.name} (${i18n.ts.descendingOrder})`,
				icon: 'ti ti-sort-descending-letters',
				action: () => {
					sortModeSelect.value = '+name';
				},
				active: sortModeSelect.value === '+name',
			},
			{
				text: `${i18n.ts.name} (${i18n.ts.ascendingOrder})`,
				icon: 'ti ti-sort-ascending-letters',
				action: () => {
					sortModeSelect.value = '-name';
				},
				active: sortModeSelect.value === '-name',
			},
		],
	});

	if (canFilterByType.value) {
		menu.push({
			type: 'parent',
			text: i18n.ts.type,
			icon: 'ti ti-filter',
			children: (
				[
					['all', i18n.ts.all, 'ti ti-files'],
					['image', i18n.ts.image, 'ti ti-photo'],
					['video', i18n.ts.video, 'ti ti-movie'],
					['audio', i18n.ts.audio, 'ti ti-music'],
				] as const
			).map(([value, text, icon]) => ({
				text,
				icon,
				action: () => {
					typeFilter.value = value;
				},
				active: typeFilter.value === value,
			})),
		});
	}

	if (folder.value) {
		menu.push(
			{
				text: i18n.ts.renameFolder,
				icon: 'ti ti-forms',
				action: () => {
					if (folder.value) {
						renameFolder(folder.value);
					}
				},
			},
			{
				text: i18n.ts.deleteFolder,
				icon: 'ti ti-trash',
				action: () => {
					deleteFolder(folder.value as Misskey.entities.DriveFolder);
				},
			},
		);
	}

	menu.push(
		{
			text: i18n.ts.createFolder,
			icon: 'ti ti-folder-plus',
			action: () => {
				createFolder();
			},
		},
		{ type: 'divider' },
		{
			type: 'switch',
			text: i18n.ts.edit,
			icon: 'ti ti-pointer',
			ref: isEditMode,
		},
	);

	return menu;
}

function showMenu(ev: PointerEvent) {
	os.popupMenu(getMenu(), (ev.currentTarget ?? ev.target ?? undefined) as HTMLElement | undefined);
}

function onContextmenu(ev: PointerEvent) {
	os.contextMenu(getMenu(), ev);
}

useGlobalEvent('driveFileCreated', onDriveFileCreated);

function onDriveFilesUpdated(files: Misskey.entities.DriveFile[]) {
	// 取得中の応答には移動前・変更前の行が含まれ得るため、現在の条件で取り直す。
	if (files.length > 0 && (filesPaginator.fetching.value || filesPaginator.fetchingOlder.value || filesPaginator.fetchingNewer.value)) {
		filesPaginator.reload();
		return;
	}
	let needsReload = false;
	for (const file of files) {
		const previous = filesPaginator.items.value.find((item) => item.id === file.id);
		const matches = matchesFileFilter(file);
		if (!previous && !matches) continue;
		if (usesFileOffset()) {
			needsReload = true;
		} else if (previous) {
			if (matches) {
				filesPaginator.updateItem(file.id, () => file);
			} else {
				filesPaginator.removeItem(file.id);
			}
		} else {
			// 移動された既存ファイルの ID は新着とは限らないため、カーソル順の途中へ差し込まない。
			needsReload = true;
		}
	}
	if (needsReload) filesPaginator.reload();
}

function onDriveFilesDeleted(ids: Misskey.entities.DriveFile['id'][]) {
	if (ids.length === 0) return;
	// 削除前の応答の復活と offset のずれを防ぐため、取得中または offset 順では先頭から取り直す。
	if (usesFileOffset() || filesPaginator.fetching.value || filesPaginator.fetchingOlder.value || filesPaginator.fetchingNewer.value) {
		filesPaginator.reload();
		return;
	}
	for (const id of ids) {
		filesPaginator.removeItem(id);
	}
}

useGlobalEvent('driveFilesDeleted', (files) => onDriveFilesDeleted(files.map((file) => file.id)));

useGlobalEvent('driveFilesUpdated', onDriveFilesUpdated);

useGlobalEvent('driveFoldersUpdated', (folders) => {
	for (const f of folders) {
		if (foldersPaginator.items.value.some((x) => x.id === f.id)) {
			if (f.parentId === (folder.value?.id ?? null)) {
				foldersPaginator.updateItem(f.id, () => f);
			} else {
				foldersPaginator.removeItem(f.id);
			}
		} else {
			if (f.parentId === (folder.value?.id ?? null)) {
				foldersPaginator.prepend(f);
			}
		}
	}
});

useGlobalEvent('driveFoldersDeleted', (folders) => {
	for (const f of folders) {
		foldersPaginator.removeItem(f.id);
	}
});

let connection: Misskey.IChannelConnection<Misskey.Channels['drive']> | null = null;

onMounted(() => {
	if (store.realtimeMode) {
		connection = useStream().useChannel('drive');
		connection.on('fileCreated', onDriveFileCreated);
		connection.on('fileUpdated', (file) => onDriveFilesUpdated([file]));
		connection.on('fileDeleted', (id) => onDriveFilesDeleted([id]));
	}

	if (props.initialFolder) {
		cd(props.initialFolder);
	} else {
		initialize();
	}
});

onActivated(() => {});

onBeforeUnmount(() => {
	initializeGeneration++;
	filesPaginator.dispose();
	foldersPaginator.dispose();
	if (connection != null) {
		connection.dispose();
	}
});
</script>

<style lang="scss" module>
.transition_files_move,
.transition_files_enterActive,
.transition_files_leaveActive {
	transition: all 0.2s ease;
}
.transition_files_enterFrom,
.transition_files_leaveTo {
	opacity: 0;
}
.transition_files_leaveActive {
	position: absolute;
}

.nav {
	display: flex;
	width: 100%;
	padding: 0 8px;
	box-sizing: border-box;
	overflow: auto;
	font-size: 0.9em;
	background: color(from var(--MI_THEME-bg) srgb r g b / 0.75);
	-webkit-backdrop-filter: var(--MI-blur, blur(15px));
	backdrop-filter: var(--MI-blur, blur(15px));
	border-bottom: solid 0.5px var(--MI_THEME-divider);
}

.navPath {
	display: inline-block;
	vertical-align: bottom;
	line-height: 42px;
	white-space: nowrap;
}

.navPathItem {
	display: inline-block;
	margin: 0;
	padding: 0 8px;
	line-height: 42px;
	cursor: pointer;

	&:hover {
		text-decoration: underline;
	}

	&.navCurrent {
		font-weight: bold;
		cursor: default;

		&:hover {
			text-decoration: none;
		}
	}

	&.navSeparator {
		margin: 0;
		padding: 0;
		opacity: 0.5;
		cursor: default;
	}
}

.navMenu {
	margin-left: auto;
	padding: 0 12px;
}

.main {
	min-height: 100cqh;
	user-select: none;

	&.fetching {
		cursor: wait !important;
		opacity: 0.5;
		pointer-events: none;
	}
}

.tipContainer:not(:empty) {
	padding: 16px 32px;
}

.folders,
.files {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
	gap: 12px;
	padding: 16px 32px;
}

@container (max-width: 600px) {
	.tipContainer:not(:empty) {
		padding: 16px;
	}

	.folders,
	.files {
		padding: 16px;
	}
}

.date {
	padding: 8px 16px;
	font-size: 90%;
	-webkit-backdrop-filter: var(--MI-blur, blur(8px));
	backdrop-filter: var(--MI-blur, blur(8px));
	background-color: color(from var(--MI_THEME-bg) srgb r g b / 0.85);
}

.loadMore {
	margin: 16px auto;
}

.footer {
	padding: 8px 16px;
	font-size: 90%;
	-webkit-backdrop-filter: var(--MI-blur, blur(8px));
	backdrop-filter: var(--MI-blur, blur(8px));
	background-color: color(from var(--MI_THEME-bg) srgb r g b / 0.85);
}

.empty {
	padding: 16px;
	text-align: center;
	pointer-events: none;
	opacity: 0.5;
}

.dropzone {
	position: absolute;
	left: 0;
	top: 38px;
	width: 100%;
	height: calc(100% - 38px);
	border: dashed 2px var(--MI_THEME-focus);
	pointer-events: none;
}
</style>
