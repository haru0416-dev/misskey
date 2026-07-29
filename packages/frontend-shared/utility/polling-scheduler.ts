/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * task完了後から一定間隔を空けて実行し、処理の重複を防ぐ。
 * documentが非表示の間は停止し、再表示時も即時実行せず次のintervalを待つ。
 */
export class PollingScheduler {
	#timerId: number | null = null;
	#running = false;
	#active = false;
	#disposed = false;

	constructor(
		readonly task: () => void | Promise<void>,
		readonly interval: number,
	) {}

	#clearTimer(): void {
		if (this.#timerId == null) return;
		window.clearTimeout(this.#timerId);
		this.#timerId = null;
	}

	#schedule(): void {
		if (!this.#active || this.#disposed || this.#running || window.document.hidden || this.#timerId != null) return;
		this.#timerId = window.setTimeout(() => {
			void this.#run();
		}, this.interval);
	}

	async #run(): Promise<void> {
		this.#timerId = null;
		if (!this.#active || this.#disposed || this.#running || window.document.hidden) return;
		this.#running = true;
		try {
			await this.task();
		} finally {
			this.#running = false;
			this.#schedule();
		}
	}

	#onVisibilityChange = (): void => {
		if (window.document.hidden) {
			this.#clearTimer();
		} else {
			this.#schedule();
		}
	};

	start(immediate = false): void {
		if (this.#disposed) return;
		if (!this.#active) {
			this.#active = true;
			window.document.addEventListener('visibilitychange', this.#onVisibilityChange);
		}
		if (immediate) {
			this.#clearTimer();
			void this.#run();
		} else {
			this.#schedule();
		}
	}

	stop(): void {
		if (!this.#active) return;
		this.#active = false;
		this.#clearTimer();
		window.document.removeEventListener('visibilitychange', this.#onVisibilityChange);
	}

	dispose(): void {
		if (this.#disposed) return;
		this.stop();
		this.#disposed = true;
	}
}
