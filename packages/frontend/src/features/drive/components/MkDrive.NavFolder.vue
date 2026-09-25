<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div
	:class="[$style.root, { [$style.draghover]: draghover }]"
	@dragover.prevent.stop="onDragover"
	@dragenter="onDragenter"
	@dragleave="onDragleave"
	@drop.stop="onDrop"
>
	<i v-if="folder == null" class="ti ti-cloud" style="margin-right: 4px;"></i>
	<span>{{ folder == null ? i18n.ts.drive : folder.name }}</span>
</div>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import * as Misskey from 'misskey-js';
import { i18n } from '@/i18n.js';
import { alertDriveMoveError, moveDriveFilesToFolder, moveDriveFolderToFolder } from '@/features/drive/drive.js';
import { checkDragDataType, getDragData, getDropEffect } from '@/drag-and-drop.js';

const props = defineProps<{
	folder?: Misskey.entities.DriveFolder;
	parentFolder: Misskey.entities.DriveFolder | null;
}>();

const emit = defineEmits<{
	(ev: 'upload', files: File[], folder?: Misskey.entities.DriveFolder | null): void;
}>();

const draghover = ref(false);

function onDragover(ev: DragEvent) {
	if (!ev.dataTransfer) {
		return;
	}

	// このフォルダがルートかつカレントディレクトリならドロップ禁止
	if (props.folder == null && props.parentFolder == null) {
		ev.dataTransfer.dropEffect = 'none';
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
	if (props.folder || props.parentFolder) {
		draghover.value = true;
	}
}

function onDragleave() {
	if (props.folder || props.parentFolder) {
		draghover.value = false;
	}
}

function onDrop(ev: DragEvent) {
	draghover.value = false;

	if (!ev.dataTransfer) {
		return;
	}

	// ファイルだったら
	if (ev.dataTransfer.files.length > 0) {
		emit('upload', Array.from(ev.dataTransfer.files), props.folder);
		return;
	}

	//#region ドライブのファイル
	{
		const droppedData = getDragData(ev, 'driveFiles');
		if (droppedData != null) {
			moveDriveFilesToFolder(droppedData, props.folder ?? null).catch(alertDriveMoveError);
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
			// 移動先が自分自身ならreject
			if (props.folder && droppedFolder.id === props.folder.id) {
				return;
			}
			moveDriveFolderToFolder(droppedFolder, props.folder ?? null).catch(alertDriveMoveError);
		}
	}
	//#endregion
}
</script>

<style lang="scss" module>
.root {
	&.draghover {
		background: #eee;
	}
}
</style>
