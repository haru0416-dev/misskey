/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed, reactive, watch } from 'vue';
import type { Reactive } from 'vue';
import { deepEqual } from '@/utility/deep-equal.js';
import { deepClone } from '@/utility/clone.js';
import type { Cloneable } from '@/utility/clone.js';

function copy<T>(v: T): T {
	return deepClone(v as Cloneable) as T;
}

function unwrapReactive<T>(v: Reactive<T>): T {
	return deepClone(v as unknown as Cloneable) as T;
}

export function useForm<T extends Record<string, any>>(initialState: T, save: (newState: T) => Promise<void>) {
	const currentState = reactive<T>(copy(initialState));
	const previousState = reactive<T>(copy(initialState));

	const modifiedStates = reactive<Record<keyof T, boolean>>(
		(() => {
			const obj: Record<keyof T, boolean> = {} as Record<keyof T, boolean>;
			for (const key in initialState) {
				obj[key] = false;
			}
			return obj;
		})(),
	);
	const modifiedCount = computed(() => {
		let count = 0;
		for (const key in modifiedStates) {
			if (modifiedStates[key]) count++;
		}
		return count;
	});
	const modified = computed(() => modifiedCount.value > 0);

	for (const key in initialState) {
		watch(
			[() => currentState[key], () => previousState[key]],
			() => {
				modifiedStates[key] = !deepEqual(currentState[key], previousState[key]);
			},
			{ deep: true },
		);
	}

	async function _save() {
		await save(unwrapReactive(currentState));
		for (const key in currentState) {
			previousState[key] = copy(currentState[key]);
		}
	}

	function discard() {
		for (const key in currentState) {
			currentState[key] = copy(previousState[key]);
		}
	}

	return {
		state: currentState,
		savedState: previousState,
		modifiedStates,
		modified,
		modifiedCount,
		save: _save,
		discard,
	};
}
