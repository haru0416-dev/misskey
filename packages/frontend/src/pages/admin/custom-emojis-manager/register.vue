<!--
SPDX-FileCopyrightText: syuilo and other misskey contributors
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root" class="_gaps">
	<MkFolder>
		<template #icon><i class="ti ti-settings"></i></template>
		<template #label>{{ i18n.ts._customEmojisManager._local._register.uploadSettingTitle }}</template>
		<template #caption>{{ i18n.ts._customEmojisManager._local._register.uploadSettingDescription }}</template>

		<div class="_gaps">
			<MkSelect v-model="selectedFolderId" :items="selectedFolderIdDef">
				<template #label>{{ i18n.ts.uploadFolder }}</template>
			</MkSelect>

			<MkSwitch v-model="directoryToCategory">
				<template #label>{{ i18n.ts._customEmojisManager._local._register.directoryToCategoryLabel }}</template>
				<template #caption>{{ i18n.ts._customEmojisManager._local._register.directoryToCategoryCaption }}</template>
			</MkSwitch>
		</div>
	</MkFolder>

	<MkFolder>
		<template #icon><i class="ti ti-notes"></i></template>
		<template #label>{{ i18n.ts._customEmojisManager._gridCommon.registrationLogs }}</template>
		<template #caption>{{ i18n.ts._customEmojisManager._gridCommon.registrationLogsCaption }}</template>
		<XRegisterLogs :logs="requestLogs"/>
	</MkFolder>

	<div
		:class="[$style.dropArea, { [$style.dragOver]: isDragOver }]"
		@dragover.prevent="isDragOver = true"
		@dragleave.prevent="isDragOver = false"
		@drop.prevent.stop="onDrop"
	>
		<i class="ti ti-photo-up" :class="$style.dropIcon"></i>
		<div :class="$style.dropCaption">{{ i18n.ts._customEmojisManager._local._register.dropAreaCaption }}</div>
		<div class="_buttons">
			<MkButton primary @click="onFileSelectClicked"><i class="ti ti-upload"></i> {{ i18n.ts.upload }}</MkButton>
			<MkButton @click="onDriveSelectClicked"><i class="ti ti-cloud"></i> {{ i18n.ts.fromDrive }}</MkButton>
		</div>
	</div>

	<template v-if="gridItems.length > 0">
		<div :class="$style.gridArea">
			<MkGrid :data="gridItems" :settings="setupGrid()" @event="onGridEvent"/>
		</div>

		<XGridFooter>
			<template #right>
				<MkButton primary :disabled="registerButtonDisabled" @click="onRegistryClicked">
					{{ i18n.ts.registration }} ({{ gridItems.length }})
				</MkButton>
				<MkButton @click="onClearClicked">{{ i18n.ts.clear }}</MkButton>
			</template>
		</XGridFooter>
	</template>
</div>
</template>

<script setup lang="ts">
import * as Misskey from 'misskey-js';
import { computed, onMounted, ref, useCssModule } from 'vue';
import type { RequestLogItem } from '@/pages/admin/custom-emojis-manager/impl.js';
import type { GridCellValidationEvent, GridCellValueChangeEvent, GridEvent } from '@/components/grid/grid-event.js';
import type { GridSetting } from '@/components/grid/grid.js';
import type { GridRow } from '@/components/grid/row.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import {
	createRoleColumnSetting,
	emojiFieldLabel,
	emptyStrToEmptyArray,
	emptyStrToNull,
	settleEmojiRequest,
	toRequestLogs,
} from '@/pages/admin/custom-emojis-manager/impl.js';
import MkGrid from '@/components/grid/MkGrid.vue';
import { i18n } from '@/i18n.js';
import MkSelect from '@/components/form/MkSelect.vue';
import MkSwitch from '@/components/form/MkSwitch.vue';
import MkFolder from '@/components/layout/MkFolder.vue';
import MkButton from '@/components/form/MkButton.vue';
import * as os from '@/os.js';
import { validators } from '@/components/grid/cell-validators.js';
import { chooseDriveFile, chooseFileFromPcAndUpload, uploadFile } from '@/features/drive/drive.js';
import { extractDroppedItems, flattenDroppedFiles } from '@/features/drive/file-drop.js';
import XRegisterLogs from '@/pages/admin/custom-emojis-manager/logs.vue';
import XGridFooter from '@/pages/admin/custom-emojis-manager/grid-footer.vue';
import { copyGridDataToClipboard } from '@/components/grid/grid-utils.js';
import { useMkSelect } from '@/composables/useMkSelect.js';

import { prefer } from '@/preferences.js';

const MAXIMUM_EMOJI_REGISTER_COUNT = 100;

type FolderItem = {
	id?: string;
	name: string;
};

type GridItem = {
	fileId: string;
	url: string;
	name: string;
	host: string;
	category: string;
	aliases: string;
	license: string;
	isSensitive: boolean;
	localOnly: boolean;
	roleIdsThatCanBeUsedThisEmojiAsReaction: { id: string; name: string }[];
	type: string | null;
};

function setupGrid(): GridSetting {
	const $style = useCssModule();

	const required = validators.required();
	const regex = validators.regex(/^[a-zA-Z0-9_]+$/);
	const unique = validators.unique();

	function removeRows(rows: GridRow[]) {
		const idxes = new Set(rows.map((it) => it.index));
		gridItems.value = gridItems.value.filter((_, i) => !idxes.has(i));
	}

	return {
		root: {
			// 表の領域 (.gridArea) をスクロール領域にして、見出しの行をその中で留める
			noOverflowStyle: true,
		},
		row: {
			showNumber: true,
			selectable: true,
			minimumDefinitionCount: 100,
			styleRules: [
				{
					condition: ({ cells }) => cells.some((it) => !it.violation.valid),
					applyStyle: { className: $style['violationRow'] ?? '' },
				},
			],
			contextMenuFactory: (row, context) => {
				return [
					{
						type: 'button',
						text: i18n.ts._customEmojisManager._gridCommon.copySelectionRows,
						icon: 'ti ti-copy',
						action: () => copyGridDataToClipboard(gridItems, context),
					},
					{
						type: 'button',
						text: i18n.ts._customEmojisManager._gridCommon.deleteSelectionRows,
						icon: 'ti ti-trash',
						action: () => removeRows(context.rangedRows),
					},
				];
			},
			events: {
				delete(rows) {
					removeRows(rows);
				},
			},
		},
		cols: [
			{ bindTo: 'url', icon: 'ti-icons', type: 'image', editable: false, width: 'auto', validators: [required] },
			{
				bindTo: 'name',
				title: emojiFieldLabel('name'),
				type: 'text',
				editable: true,
				width: 140,
				validators: [required, regex, unique],
			},
			{ bindTo: 'category', title: emojiFieldLabel('category'), type: 'text', editable: true, width: 140 },
			{ bindTo: 'aliases', title: emojiFieldLabel('aliases'), type: 'text', editable: true, width: 140 },
			{ bindTo: 'license', title: emojiFieldLabel('license'), type: 'text', editable: true, width: 140 },
			{ bindTo: 'isSensitive', title: emojiFieldLabel('isSensitive'), type: 'boolean', editable: true, width: 90 },
			{ bindTo: 'localOnly', title: emojiFieldLabel('localOnly'), type: 'boolean', editable: true, width: 90 },
			createRoleColumnSetting(gridItems),
			{ bindTo: 'type', title: emojiFieldLabel('type'), type: 'text', editable: false, width: 90 },
		],
		cells: {
			contextMenuFactory: (col, row, value, context) => {
				return [
					{
						type: 'button',
						text: i18n.ts._customEmojisManager._gridCommon.copySelectionRanges,
						icon: 'ti ti-copy',
						action: () => copyGridDataToClipboard(gridItems, context),
					},
					{
						type: 'button',
						text: i18n.ts._customEmojisManager._gridCommon.deleteSelectionRanges,
						icon: 'ti ti-trash',
						action: () => removeRows(context.rangedCells.map((it) => it.row)),
					},
				];
			},
		},
	};
}

const uploadFolders = ref<FolderItem[]>([]);
const gridItems = ref<GridItem[]>([]);
const { model: selectedFolderId, def: selectedFolderIdDef } = useMkSelect({
	items: computed(() => uploadFolders.value.map((folder) => ({ label: folder.name, value: folder.id || '' }))),
	initialValue: prefer.uploadFolder,
});
const directoryToCategory = ref<boolean>(false);
const registerButtonDisabled = ref<boolean>(false);
const requestLogs = ref<RequestLogItem[]>([]);
const isDragOver = ref<boolean>(false);

async function onRegistryClicked() {
	const dialogSelection = await os.confirm({
		type: 'info',
		text: i18n.tsx._customEmojisManager._local._register.confirmRegisterEmojisDescription({
			count: MAXIMUM_EMOJI_REGISTER_COUNT,
		}),
	});

	if (dialogSelection.canceled) {
		return;
	}

	const items = gridItems.value;
	const upload = () => {
		return items.slice(0, MAXIMUM_EMOJI_REGISTER_COUNT).map((item) =>
			settleEmojiRequest(
				item,
				misskeyApi('admin/emoji/add', {
					name: item.name,
					category: emptyStrToNull(item.category),
					aliases: emptyStrToEmptyArray(item.aliases),
					license: emptyStrToNull(item.license),
					isSensitive: item.isSensitive,
					localOnly: item.localOnly,
					roleIdsThatCanBeUsedThisEmojiAsReaction: item.roleIdsThatCanBeUsedThisEmojiAsReaction.map((it) => it.id),
					fileId: item.fileId!,
				}),
			),
		);
	};

	const result = await os.promiseDialog(Promise.all(upload()));
	requestLogs.value = await toRequestLogs(result);

	const successItems = new Set(result.filter((it) => it.success).map((it) => it.item));
	gridItems.value = gridItems.value.filter((it) => !successItems.has(it));
}

async function onClearClicked() {
	const result = await os.confirm({
		type: 'warning',
		text: i18n.ts._customEmojisManager._local._register.confirmClearEmojisDescription,
	});

	if (!result.canceled) {
		gridItems.value = [];
	}
}

async function onDrop(ev: DragEvent) {
	isDragOver.value = false;

	const droppedFiles = flattenDroppedFiles(await extractDroppedItems(ev))
		// フォルダーごとのドロップには .DS_Store などの隠しファイルや画像以外も入るので、画像だけを残す
		.filter((it) => it.file.type.startsWith('image/') && !it.file.name.startsWith('.'));
	if (droppedFiles.length === 0) {
		return;
	}
	// 登録は一度に MAXIMUM_EMOJI_REGISTER_COUNT 件までなので、それを超える数は最初から上げない
	if (droppedFiles.length > MAXIMUM_EMOJI_REGISTER_COUNT) {
		os.alert({
			type: 'warning',
			text: i18n.tsx._customEmojisManager._local._register.tooManyDroppedFiles({ count: droppedFiles.length, max: MAXIMUM_EMOJI_REGISTER_COUNT }),
		});
		return;
	}
	const { canceled } = await os.confirm({
		type: 'info',
		text: i18n.tsx._customEmojisManager._local._register.confirmUploadEmojisDescription({ count: droppedFiles.length }),
	});
	if (canceled) {
		return;
	}

	// アップローダーのダイアログを通すと、利用者が外したファイルとフォルダー名の対応が取れなくなるので、直接上げる。
	// uploadFile は失敗のたびにダイアログを出すので、同時に上げるのは 3 件までにし、1 件でも失敗したら残りは上げない
	// (容量不足や drive/files/create の回数制限 (1 時間 120 回) では、残りも同じ理由で失敗する)。
	const uploaded = Array.of<{ droppedFile: (typeof droppedFiles)[number]; driveFile: Misskey.entities.DriveFile }>();
	let failed = false;
	let next = 0;
	async function worker() {
		while (!failed && next < droppedFiles.length) {
			const droppedFile = droppedFiles[next++]!;
			try {
				const driveFile = await uploadFile(droppedFile.file, {
					folderId: selectedFolderId.value,
					name: droppedFile.file.name,
				}).filePromise;
				uploaded.push({ droppedFile, driveFile });
			} catch {
				failed = true;
			}
		}
	}
	// 成否はあとでまとめて知らせるので、待ちのダイアログには成功の印を出さない
	await os.promiseDialog(Promise.all([worker(), worker(), worker()]), () => {});

	// 上げ終わった順ではなく、ドロップした順に並べる
	uploaded.sort((a, b) => droppedFiles.indexOf(a.droppedFile) - droppedFiles.indexOf(b.droppedFile));
	gridItems.value.push(
		...uploaded.map(({ droppedFile, driveFile }) => {
			const item = fromDriveFile(driveFile);
			if (directoryToCategory.value) {
				// path は「/フォルダー/サブフォルダー/ファイル名」の形。ファイル名と先頭の / を除いた残りをカテゴリにする
				item.category = droppedFile.path.replace(/^\//, '').replace(/\/?[^/]+$/, '');
			}
			return item;
		}),
	);

	const notUploadedCount = droppedFiles.length - uploaded.length;
	if (notUploadedCount > 0) {
		os.alert({
			type: 'error',
			text: i18n.tsx._customEmojisManager._local._register.uploadFailedCount({ count: notUploadedCount }),
		});
	}
}

async function onFileSelectClicked() {
	const driveFiles = await chooseFileFromPcAndUpload({
		multiple: true,
		folderId: selectedFolderId.value,
	});

	gridItems.value.push(...driveFiles.map(fromDriveFile));
}

async function onDriveSelectClicked() {
	const driveFiles = await chooseDriveFile({
		multiple: true,
	});
	gridItems.value.push(...driveFiles.map(fromDriveFile));
}

function onGridEvent(event: GridEvent) {
	switch (event.type) {
		case 'cell-validation':
			onGridCellValidation(event);
			break;
		case 'cell-value-change':
			onGridCellValueChange(event);
			break;
	}
}

function onGridCellValidation(event: GridCellValidationEvent) {
	registerButtonDisabled.value = event.all.some((it) => !it.valid);
}

function onGridCellValueChange(event: GridCellValueChangeEvent) {
	const { row, column, newValue } = event;
	const item = gridItems.value[row.index];
	if (item != null && column.setting.bindTo in item) {
		(item as any)[column.setting.bindTo] = newValue;
	}
}

function fromDriveFile(it: Misskey.entities.DriveFile): GridItem {
	return {
		fileId: it.id,
		url: it.url,
		name: it.name
			.replace(/(\.[a-zA-Z0-9]+)+$/, '')
			.replaceAll('-', '_')
			.replaceAll(' ', '_'),
		host: '',
		category: '',
		aliases: '',
		license: '',
		isSensitive: it.isSensitive,
		localOnly: false,
		roleIdsThatCanBeUsedThisEmojiAsReaction: [],
		type: it.type,
	};
}

async function refreshUploadFolders() {
	const result = await misskeyApi('drive/folders', {});
	uploadFolders.value = Array.of<FolderItem>({ name: '-' }, ...result);
}

onMounted(async () => {
	await refreshUploadFolders();
});
</script>

<style module lang="scss">
.root {
	padding: 16px;
	container-type: inline-size;
}

.violationRow {
	background-color: var(--MI_THEME-infoWarnBg);
}

.dropArea {
	display: grid;
	justify-items: center;
	gap: 12px;
	padding: 24px 16px;
	text-align: center;
	border: dashed 2px var(--MI_THEME-divider);
	border-radius: var(--MI-radius);
	transition: border-color 0.1s, background-color 0.1s;

	&.dragOver {
		border-color: var(--MI_THEME-accent);
		background-color: var(--MI_THEME-accentedBg);
	}
}

.dropIcon {
	font-size: 2em;
	color: var(--MI-text-muted);
}

.dropCaption {
	color: var(--MI-text-muted);
}

/* 列が多く画面より広く、行も多いので、表だけを縦横にスクロールさせて見出しの行を上に留める */
.gridArea {
	overflow: auto;
	max-height: calc(100dvh - var(--MI-stickyTop, 0px) - var(--MI-stickyBottom, 0px) - 80px);
}
</style>
