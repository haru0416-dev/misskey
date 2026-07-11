/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Misskey from 'misskey-js';

type DragDataMap = {
	driveFiles: Misskey.entities.DriveFile[];
	driveFolders: Misskey.entities.DriveFolder[];
	deckColumn: string;
	MkDraggable: { item: { id: string }; instanceId: string; group: string };
};

function hasStringId(value: unknown): value is { id: string } {
	return typeof value === 'object' && value !== null && 'id' in value && typeof value.id === 'string';
}

const dragDataValidators = {
	driveFiles: (value: unknown): value is DragDataMap['driveFiles'] => Array.isArray(value) && value.every(hasStringId),
	driveFolders: (value: unknown): value is DragDataMap['driveFolders'] => Array.isArray(value) && value.every(hasStringId),
	deckColumn: (value: unknown): value is DragDataMap['deckColumn'] => typeof value === 'string',
	MkDraggable: (value: unknown): value is DragDataMap['MkDraggable'] => {
		return typeof value === 'object'
			&& value !== null
			&& 'item' in value
			&& hasStringId(value.item)
			&& 'instanceId' in value
			&& typeof value.instanceId === 'string'
			&& 'group' in value
			&& typeof value.group === 'string';
	},
};

// NOTE: dataTransfer の format は大文字小文字区別されないっぽいので toLowerCase が必要

export function setDragData<T extends keyof DragDataMap>(event: DragEvent, type: T, data: DragDataMap[T]) {
	if (event.dataTransfer == null) return;

	event.dataTransfer.setData(`misskey/${type}`.toLowerCase(), JSON.stringify(data));
}

export function setPlainDragData(event: DragEvent, data: string) {
	if (event.dataTransfer == null) return;

	event.dataTransfer.setData('text/plain', data);
}

export function getDragData<T extends keyof DragDataMap>(event: DragEvent, type: T): DragDataMap[T] | null {
	if (event.dataTransfer == null) return null;

	const data = event.dataTransfer.getData(`misskey/${type}`.toLowerCase());
	if (data == null || data === '') return null;

	try {
		const parsed: unknown = JSON.parse(data);
		const validate = dragDataValidators[type] as (value: unknown) => value is DragDataMap[T];
		return validate(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

export function getPlainDragData(event: DragEvent): string | null {
	if (event.dataTransfer == null) return null;

	const data = event.dataTransfer.getData('text/plain');
	if (data == null || data === '') return null;

	return data;
}

export function checkDragDataType(event: DragEvent, types: (keyof DragDataMap)[]): boolean {
	if (event.dataTransfer == null) return false;

	const availableTypes = Array.from(event.dataTransfer.types, type => type.toLowerCase());
	return types.some(type => availableTypes.includes(`misskey/${type}`.toLowerCase()));
}
