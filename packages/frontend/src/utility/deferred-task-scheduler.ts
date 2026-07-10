/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class DeferredTaskScheduler {
	private timerId: number | null = null;
	private pending = false;
	private running = false;
	private listeningVisibility = false;
	private disposed = false;

	constructor(
		private readonly task: () => void | Promise<void>,
		private readonly delay: number,
	) {}

	public request(): void {
		if (this.disposed) return;
		this.pending = true;
		if (!this.listeningVisibility) {
			window.document.addEventListener('visibilitychange', this.handleVisibilityChange);
			this.listeningVisibility = true;
		}
		this.schedule();
	}

	public dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.pending = false;
		this.clearTimer();
		this.stopListeningVisibility();
	}

	private schedule(): void {
		if (this.disposed || !this.pending || this.running || window.document.hidden || this.timerId != null) return;
		this.timerId = window.setTimeout(() => {
			void this.run();
		}, this.delay);
	}

	private async run(): Promise<void> {
		this.timerId = null;
		if (this.disposed || !this.pending || this.running || window.document.hidden) return;

		this.pending = false;
		this.running = true;
		try {
			await this.task();
		} finally {
			this.running = false;
			if (this.pending) {
				this.schedule();
			} else {
				this.stopListeningVisibility();
			}
		}
	}

	private clearTimer(): void {
		if (this.timerId == null) return;
		window.clearTimeout(this.timerId);
		this.timerId = null;
	}

	private stopListeningVisibility(): void {
		if (!this.listeningVisibility) return;
		window.document.removeEventListener('visibilitychange', this.handleVisibilityChange);
		this.listeningVisibility = false;
	}

	private handleVisibilityChange = (): void => {
		if (window.document.hidden) {
			this.clearTimer();
		} else {
			this.schedule();
		}
	};
}
