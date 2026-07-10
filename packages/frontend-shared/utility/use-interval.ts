/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { onActivated, onDeactivated, onMounted, onUnmounted } from 'vue';
import { PollingScheduler } from './polling-scheduler.js';

export function useInterval(
	fn: () => void | Promise<void>,
	interval: number,
	options: {
		immediate: boolean;
		afterMounted: boolean;
	},
): (() => void) | undefined {
	if (Number.isNaN(interval)) return;

	const scheduler = new PollingScheduler(fn, interval);
	let enabled = false;
	let disposed = false;

	const activate = () => {
		if (disposed || enabled) return;
		enabled = true;
		scheduler.start(options.immediate);
	};

	const pause = () => {
		if (!enabled) return;
		enabled = false;
		scheduler.stop();
	};

	const clear = () => {
		if (disposed) return;
		disposed = true;
		enabled = false;
		scheduler.dispose();
	};

	if (options.afterMounted) {
		onMounted(activate);
	} else {
		activate();
	}

	onActivated(activate);

	onDeactivated(() => {
		pause();
	});

	onUnmounted(() => {
		clear();
	});

	return clear;
}
