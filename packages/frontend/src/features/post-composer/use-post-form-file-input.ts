/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { ref } from 'vue';
import { url } from '@/shared/utility/config.js';
import type { Ref, ShallowRef } from 'vue';
import type * as Misskey from 'misskey-js';
import type { useUploader } from '@/features/drive/useUploader.js';
import { checkDragDataType, getDragData, getDropEffect } from '@/utility/drag-and-drop.js';
import { formatTimeString } from '@/utility/format-time-string.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';

const pastedFileName = 'yyyy-MM-dd HH-mm-ss [{{number}}]';

/** 貼り付け・ドロップされたファイルやノート URL・長文を、添付・引用として受け取る。 */
export function usePostFormFileInput(options: {
	mock: boolean;
	textareaEl: Readonly<ShallowRef<HTMLTextAreaElement | null>>;
	uploader: ReturnType<typeof useUploader>;
	files: Ref<Misskey.entities.DriveFile[]>;
	quoteId: Ref<string | null>;
	hasRenoteTarget: () => boolean;
	insertTextAtCursor: (textarea: HTMLTextAreaElement | null, value: string) => void;
}) {
	const { mock, textareaEl, uploader, files, quoteId, hasRenoteTarget, insertTextAtCursor } = options;
	const draghover = ref(false);

	async function onPaste(ev: ClipboardEvent) {
		if (mock) {
			return;
		}
		if (ev.clipboardData == null) {
			return;
		}
		if (textareaEl.value == null) {
			return;
		}

		const pastedFiles: File[] = [];
		for (const { item, i } of Array.from(ev.clipboardData.items, (data, x) => ({ item: data, i: x }))) {
			if (item.kind === 'file') {
				const file = item.getAsFile();
				if (!file) {
					continue;
				}
				const lio = file.name.lastIndexOf('.');
				const ext = lio !== -1 ? file.name.slice(lio) : '';
				const formattedName = `${formatTimeString(new Date(file.lastModified), pastedFileName).replaceAll('{{number}}', `${i + 1}`)}${ext}`;
				pastedFiles.push(new File([file], formattedName, { type: file.type }));
			}
		}
		if (pastedFiles.length > 0) {
			ev.preventDefault();
			uploader.addFiles(pastedFiles);
			return;
		}

		const paste = ev.clipboardData.getData('text');

		if (!hasRenoteTarget() && !quoteId.value && paste.startsWith(url + '/notes/')) {
			ev.preventDefault();

			const { canceled } = await os.confirm({
				type: 'info',
				text: i18n.ts.quoteQuestion,
			});

			if (canceled) {
				insertTextAtCursor(textareaEl.value, paste);
				return;
			}

			quoteId.value = paste.substring(url.length).match(/^\/notes\/(.+?)\/?$/)?.[1] ?? null;
		}

		if (paste.length > 1000) {
			ev.preventDefault();

			const { canceled } = await os.confirm({
				type: 'info',
				text: i18n.ts.attachAsFileQuestion,
			});

			if (canceled) {
				insertTextAtCursor(textareaEl.value, paste);
				return;
			}

			const fileName = formatTimeString(new Date(), pastedFileName).replaceAll('{{number}}', '0');
			uploader.addFiles([new File([paste], `${fileName}.txt`, { type: 'text/plain' })]);
		}
	}

	function onDragover(ev: DragEvent) {
		if (ev.dataTransfer == null) {
			return;
		}
		if (ev.dataTransfer.items[0] == null) {
			return;
		}

		const isFile = ev.dataTransfer.items[0].kind === 'file';
		if (isFile || checkDragDataType(ev, ['driveFiles'])) {
			ev.preventDefault();
			draghover.value = true;
			ev.dataTransfer.dropEffect = getDropEffect(ev.dataTransfer.effectAllowed);
		}
	}

	function onDragenter() {
		draghover.value = true;
	}

	function onDragleave() {
		draghover.value = false;
	}

	function onDrop(ev: DragEvent): void {
		draghover.value = false;

		if (ev.dataTransfer && ev.dataTransfer.files.length > 0) {
			ev.preventDefault();
			uploader.addFiles(Array.from(ev.dataTransfer.files));
			return;
		}

		const droppedDriveFiles = getDragData(ev, 'driveFiles');
		if (droppedDriveFiles != null) {
			files.value.push(...droppedDriveFiles);
			ev.preventDefault();
		}
	}

	return { draghover, onPaste, onDragover, onDragenter, onDragleave, onDrop };
}
