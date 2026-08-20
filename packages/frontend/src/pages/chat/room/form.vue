<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div
	:class="$style.root"
	@dragover.stop="onDragover"
	@drop.stop="onDrop"
>
	<textarea
		ref="textareaEl"
		v-model="text"
		:class="$style.textarea"
		class="_acrylic"
		:placeholder="i18n.ts.inputMessageHere"
		:aria-label="i18n.ts.inputMessageHere"
		:readonly="textareaReadOnly"
		@keydown="onKeydown"
		@paste="onPaste"
	></textarea>
	<footer :class="$style.footer">
		<button v-if="file" type="button" :class="$style.file" :aria-label="`${file.name}（${i18n.ts.remove}）`" @click="file = null">{{ file.name }}</button>
		<div :class="$style.buttons">
			<button class="_button" :class="$style.button" :aria-label="i18n.ts.attachFile" @click="chooseFile"><i class="ti ti-photo-plus" aria-hidden="true"></i></button>
			<button class="_button" :class="$style.button" :aria-label="i18n.ts.emoji" @click="insertEmoji"><i class="ti ti-mood-happy" aria-hidden="true"></i></button>
			<button class="_button" :class="[$style.button, $style.send]" :disabled="!canSend || sending" :title="i18n.ts.send" :aria-label="i18n.ts.send" @click="send">
				<template v-if="!sending"><i class="ti ti-send" aria-hidden="true"></i></template><template v-if="sending"><MkLoading :em="true"/></template>
			</button>
		</div>
	</footer>
	<input ref="fileEl" style="display: none;" type="file" :aria-label="i18n.ts.attachFile" @change="onChangeFile"/>
</div>
</template>

<script lang="ts" setup>
import { onMounted, watch, ref, shallowRef, computed, nextTick, readonly, onBeforeUnmount } from 'vue';
import * as Misskey from 'misskey-js';
import { formatTimeString } from '@/utility/format-time-string.js';
import { selectFile } from '@/features/drive/drive.js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { isJsonObject, miLocalStorage } from '@/local-storage.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { prefer } from '@/preferences.js';
import { Autocomplete } from '@/features/autocomplete/autocomplete.js';
import { emojiPicker } from '@/features/emoji-picker/emoji-picker.js';
import { checkDragDataType, getDragData } from '@/drag-and-drop.js';

const props = defineProps<{
	user?: Misskey.entities.UserDetailed | null;
	room?: Misskey.entities.ChatRoom | null;
}>();

const textareaEl = shallowRef<HTMLTextAreaElement>();
const fileEl = shallowRef<HTMLInputElement>();

const text = ref<string>('');
const file = ref<Misskey.entities.DriveFile | null>(null);
const sending = ref(false);
const textareaReadOnly = ref(false);
let autocompleteInstance: Autocomplete | null = null;

const canSend = computed(() => (text.value != null && text.value !== '') || file.value != null);

function getDraftKey() {
	return props.user ? 'user:' + props.user.id : 'room:' + props.room?.id;
}

function getDrafts(): Record<string, unknown> {
	return miLocalStorage.getItemAsJson('chatMessageDrafts', isJsonObject) ?? {};
}

type ChatDraftCandidate = Record<string, unknown> & {
	data?: unknown;
};

type ChatDraftDataCandidate = Record<string, unknown> & {
	text?: unknown;
	file?: unknown;
};

watch([text, file], saveDraft);

async function onPaste(ev: ClipboardEvent) {
	if (!ev.clipboardData) return;

	const pastedFileName = 'yyyy-MM-dd HH-mm-ss [{{number}}]';

	const clipboardData = ev.clipboardData;
	const items = clipboardData.items;

	if (items.length === 1) {
		const item = items[0];
		if (item?.kind === 'file') {
			const pastedFile = item.getAsFile();
			if (!pastedFile) return;
			const lio = pastedFile.name.lastIndexOf('.');
			const ext = lio >= 0 ? pastedFile.name.slice(lio) : '';
			const formattedName = formatTimeString(new Date(pastedFile.lastModified), pastedFileName).replaceAll(/{{number}}/g, '1') + ext;
			const renamedFile = new File([pastedFile], formattedName, { type: pastedFile.type });
			os.launchUploader([renamedFile], { multiple: false }).then(driveFiles => {
				const driveFile = driveFiles[0];
				if (driveFile != null) file.value = driveFile;
			});
		}
	} else {
		if (items[0]?.kind === 'file') {
			os.alert({
				type: 'error',
				text: i18n.ts.onlyOneFileCanBeAttached,
			});
		}
	}
}

function onDragover(ev: DragEvent) {
	if (!ev.dataTransfer) return;

	const isFile = ev.dataTransfer.items[0]?.kind === 'file';
	if (isFile || checkDragDataType(ev, ['driveFiles'])) {
		ev.preventDefault();
		switch (ev.dataTransfer.effectAllowed) {
			case 'all':
			case 'uninitialized':
			case 'copy':
			case 'copyLink':
			case 'copyMove':
				ev.dataTransfer.dropEffect = 'copy';
				break;
			case 'linkMove':
			case 'move':
				ev.dataTransfer.dropEffect = 'move';
				break;
			default:
				ev.dataTransfer.dropEffect = 'none';
				break;
		}
	}
}

function onDrop(ev: DragEvent): void {
	if (!ev.dataTransfer) return;

	// ファイルだったら
	if (ev.dataTransfer.files.length === 1) {
		ev.preventDefault();
		const droppedFile = ev.dataTransfer.files[0];
		if (droppedFile != null) os.launchUploader([droppedFile], { multiple: false });
		return;
	} else if (ev.dataTransfer.files.length > 1) {
		ev.preventDefault();
		os.alert({
			type: 'error',
			text: i18n.ts.onlyOneFileCanBeAttached,
		});
		return;
	}

	//#region ドライブのファイル
	{
		const droppedData = getDragData(ev, 'driveFiles');
		if (droppedData != null) {
			const droppedFile = droppedData[0];
			if (droppedFile != null) file.value = droppedFile;
			ev.preventDefault();
		}
	}
	//#endregion
}

function onKeydown(ev: KeyboardEvent) {
	if (ev.isComposing || ev.key === 'Process' || ev.keyCode === 229) return;

	if (ev.key === 'Enter') {
		if (prefer['chat.sendOnEnter']) {
			if (!(ev.ctrlKey || ev.metaKey || ev.shiftKey)) {
				send();
			}
		} else {
			if ((ev.ctrlKey || ev.metaKey)) {
				send();
			}
		}
	}
}

function chooseFile(ev: PointerEvent) {
	selectFile({
		anchorElement: ev.currentTarget ?? ev.target,
		multiple: false,
		label: i18n.ts.selectFile,
	}).then(selectedFile => {
		file.value = selectedFile;
	});
}

function onChangeFile() {
	if (fileEl.value == null || fileEl.value.files == null) return;

	if (fileEl.value.files[0]) {
		os.launchUploader(Array.from(fileEl.value.files), { multiple: false }).then(driveFiles => {
			const driveFile = driveFiles[0];
			if (driveFile != null) file.value = driveFile;
		});
	}
}

function send() {
	if (!canSend.value) return;

	sending.value = true;

	if (props.user) {
		misskeyApi('chat/messages/create-to-user', {
			toUserId: props.user.id,
			...(text.value ? { text: text.value } : {}),
			...(file.value ? { fileId: file.value.id } : {}),
		}).then(message => {
			clear();
		}).catch(err => {
			console.error(err);
		}).then(() => {
			sending.value = false;
		});
	} else if (props.room) {
		misskeyApi('chat/messages/create-to-room', {
			toRoomId: props.room.id,
			...(text.value ? { text: text.value } : {}),
			...(file.value ? { fileId: file.value.id } : {}),
		}).then(message => {
			clear();
		}).catch(err => {
			console.error(err);
		}).then(() => {
			sending.value = false;
		});
	}
}

function clear() {
	text.value = '';
	file.value = null;
	deleteDraft();
}

function saveDraft() {
	const drafts = getDrafts();

	drafts[getDraftKey()] = {
		updatedAt: new Date(),
		data: {
			text: text.value,
			file: file.value,
		},
	};

	miLocalStorage.setItemAsJson('chatMessageDrafts', drafts);
}

function deleteDraft() {
	const drafts = getDrafts();

	delete drafts[getDraftKey()];

	miLocalStorage.setItemAsJson('chatMessageDrafts', drafts);
}

async function insertEmoji(ev: MouseEvent) {
	textareaReadOnly.value = true;
	const target = ev.currentTarget ?? ev.target;
	if (target == null) return;

	// emojiPickerはダイアログが閉じずにtextareaとやりとりするので、
	// focustrapをかけているとinsertTextAtCursorが効かない
	// そのため、投稿フォームのテキストに直接注入する
	// https://github.com/misskey-dev/misskey/pull/14282
	// https://github.com/misskey-dev/misskey/issues/14274

	let pos = textareaEl.value?.selectionStart ?? 0;
	let posEnd = textareaEl.value?.selectionEnd ?? text.value.length;
	emojiPicker.show(
		target as HTMLElement,
		emoji => {
			const textBefore = text.value.substring(0, pos);
			const textAfter = text.value.substring(posEnd);
			text.value = textBefore + emoji + textAfter;
			pos += emoji.length;
			posEnd += emoji.length;
		},
		() => {
			textareaReadOnly.value = false;
			nextTick(() => focus());
		},
	);
}

onMounted(() => {
	if (textareaEl.value != null) {
		autocompleteInstance = new Autocomplete(textareaEl.value, text);
	}

	// 書きかけの投稿を復元
	const draft = getDrafts()[getDraftKey()];
	if (isJsonObject(draft)) {
		const candidate = draft as ChatDraftCandidate;
		if (isJsonObject(candidate.data)) {
			const data = candidate.data as ChatDraftDataCandidate;
			if (typeof data.text === 'string') text.value = data.text;
			if (data.file === null || isJsonObject(data.file)) file.value = data.file as Misskey.entities.DriveFile | null;
		}
	}
});

onBeforeUnmount(() => {
	if (autocompleteInstance) {
		autocompleteInstance.detach();
		autocompleteInstance = null;
	}
});
</script>

<style lang="scss" module>
.root {
	position: relative;
	border-radius: var(--MI-radius-lg) var(--MI-radius-lg) 0 0;
	overflow: clip;
}

.textarea {
	cursor: auto;
	display: block;
	width: 100%;
	min-width: 100%;
	max-width: 100%;
	min-height: 80px;
	margin: 0;
	padding: var(--MI-space-lg) var(--MI-space-lg) 0;
	resize: none;
	font-size: 1em;
	font-family: inherit;
	outline: none;
	border: none;
	border-radius: 0;
	box-shadow: none;
	box-sizing: border-box;
	color: var(--MI_THEME-fg);
	field-sizing: content;
}

.footer {
	position: sticky;
	bottom: 0;
	background: var(--MI_THEME-panel);
}

.file {
	display: block;
	width: 100%;
	padding: var(--MI-space-sm);
	background: none;
	border: none;
	font: inherit;
	color: inherit;
	text-align: left;
	cursor: pointer;
}

.buttons {
	display: flex;
}

.button {
	height: var(--MI-control-lg);
	aspect-ratio: 1;

	&:hover {
		color: var(--MI_THEME-accent);
	}
}
.send {
	margin-left: auto;
	color: var(--MI_THEME-accent);
}
</style>
