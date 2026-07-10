/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const requestIdleCallback: typeof globalThis.requestIdleCallback =
	globalThis.requestIdleCallback ??
	((callback) => {
		const start = performance.now();
		const timeoutId = window.setTimeout(() => {
			callback({
				didTimeout: false, // polyfill でタイムアウト発火することはない
				timeRemaining() {
					const diff = performance.now() - start;
					return Math.max(0, 50 - diff); // <https://www.w3.org/TR/requestidlecallback/#idle-periods>
				},
			});
		});
		return timeoutId;
	});
const cancelIdleCallback: typeof globalThis.cancelIdleCallback =
	globalThis.cancelIdleCallback ??
	((timeoutId) => {
		window.clearTimeout(timeoutId);
	});

export class IdlingRenderScheduler {
	#renderers = new Set<FrameRequestCallback>();
	#rafId: number | null = null;
	#ricId: number | null = null;
	#disposed = false;
	#listeningVisibility = false;
	#requestIdleCallback: typeof requestIdleCallback;
	#cancelIdleCallback: typeof cancelIdleCallback;

	constructor(
		requestIdleCallbackImpl: typeof requestIdleCallback = requestIdleCallback,
		cancelIdleCallbackImpl: typeof cancelIdleCallback = cancelIdleCallback,
	) {
		this.#requestIdleCallback = requestIdleCallbackImpl;
		this.#cancelIdleCallback = cancelIdleCallbackImpl;
	}

	#isActive(): boolean {
		return !this.#disposed && this.#renderers.size > 0 && !window.document.hidden;
	}

	#start(): void {
		if (!this.#isActive() || this.#ricId != null || this.#rafId != null) return;
		this.#ricId = this.#requestIdleCallback((deadline) => {
			this.#ricId = null;
			if (!this.#isActive()) return;
			if (deadline.timeRemaining() <= 0) {
				this.#start();
				return;
			}

			this.#rafId = window.requestAnimationFrame((time) => {
				this.#rafId = null;
				if (!this.#isActive()) return;
				try {
					for (const renderer of this.#renderers) {
						renderer(time);
					}
				} finally {
					this.#start();
				}
			});
		});
	}

	#stop(): void {
		if (this.#rafId != null) {
			window.cancelAnimationFrame(this.#rafId);
			this.#rafId = null;
		}
		if (this.#ricId != null) {
			this.#cancelIdleCallback(this.#ricId);
			this.#ricId = null;
		}
	}

	#onVisibilityChange = (): void => {
		if (window.document.hidden) {
			this.#stop();
		} else {
			this.#start();
		}
	};

	add(renderer: FrameRequestCallback): void {
		if (this.#disposed) return;
		const wasEmpty = this.#renderers.size === 0;
		this.#renderers.add(renderer);
		if (wasEmpty && this.#renderers.size > 0) {
			window.document.addEventListener('visibilitychange', this.#onVisibilityChange);
			this.#listeningVisibility = true;
		}
		this.#start();
	}

	delete(renderer: FrameRequestCallback): void {
		this.#renderers.delete(renderer);
		if (this.#renderers.size === 0) {
			this.#stop();
			if (this.#listeningVisibility) {
				window.document.removeEventListener('visibilitychange', this.#onVisibilityChange);
				this.#listeningVisibility = false;
			}
		}
	}

	dispose(): void {
		if (this.#disposed) return;
		this.#disposed = true;
		this.#renderers.clear();
		this.#stop();
		if (this.#listeningVisibility) {
			window.document.removeEventListener('visibilitychange', this.#onVisibilityChange);
			this.#listeningVisibility = false;
		}
	}
}

export const defaultIdlingRenderScheduler = new IdlingRenderScheduler();
