/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ClockScheduler {
	private timerId: number | null = null;
	private running = false;
	private paused = false;

	constructor(private readonly tick: () => number | null) {}

	public start(): void {
		if (!this.running) {
			this.running = true;
			window.document.addEventListener('visibilitychange', this.handleVisibilityChange);
		}
		this.paused = false;
		this.run();
	}

	public pause(): void {
		this.paused = true;
		this.clearTimer();
	}

	public resume(): void {
		if (!this.running) return;
		this.paused = false;
		this.run();
	}

	public stop(): void {
		if (!this.running) return;
		this.running = false;
		this.paused = false;
		this.clearTimer();
		window.document.removeEventListener('visibilitychange', this.handleVisibilityChange);
	}

	private run = (): void => {
		this.clearTimer();
		if (!this.running || this.paused || window.document.hidden) return;

		const delay = this.tick();
		if (delay == null) {
			this.paused = true;
			return;
		}
		this.timerId = window.setTimeout(this.run, Math.max(1, delay));
	};

	private clearTimer(): void {
		if (this.timerId == null) return;
		window.clearTimeout(this.timerId);
		this.timerId = null;
	}

	private handleVisibilityChange = (): void => {
		if (window.document.hidden) {
			this.clearTimer();
		} else {
			this.run();
		}
	};
}
