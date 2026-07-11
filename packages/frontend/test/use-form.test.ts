/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { nextTick } from 'vue';
import { useForm } from '@/composables/useForm.js';

describe('useForm', () => {
	test('tracks, saves, and discards changes per field', async () => {
		const save = vi.fn(async () => {});
		const form = useForm({ name: 'before', options: { enabled: false } }, save);

		form.state.options.enabled = true;
		await nextTick();
		expect(form.modified.value).toBe(true);
		expect(form.modifiedCount.value).toBe(1);
		expect(form.modifiedStates.name).toBe(false);
		expect(form.modifiedStates.options).toBe(true);

		await form.save();
		await nextTick();
		expect(save).toHaveBeenCalledWith({ name: 'before', options: { enabled: true } });
		expect(form.modified.value).toBe(false);

		form.state.name = 'after';
		await nextTick();
		form.discard();
		await nextTick();
		expect(form.state.name).toBe('before');
		expect(form.modified.value).toBe(false);
	});
});
