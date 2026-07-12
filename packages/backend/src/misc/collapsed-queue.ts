/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

type Job<V> = {
	value: V;
	timer: NodeJS.Timeout;
};

// TODO: redis使えるようにする
export class CollapsedQueue<K, V> {
	private jobs: Map<K, Job<V>> = new Map();

	constructor(
		private timeout: number,
		private collapse: (oldValue: V, newValue: V) => V,
		private perform: (key: K, value: V) => Promise<void>,
		private onError: (error: unknown, key: K, value: V) => void,
	) {}

	private async performSafely(key: K, value: V): Promise<void> {
		try {
			await this.perform(key, value);
		} catch (error) {
			this.onError(error, key, value);
		}
	}

	enqueue(key: K, value: V) {
		if (this.jobs.has(key)) {
			const old = this.jobs.get(key)!;
			const merged = this.collapse(old.value, value);
			this.jobs.set(key, { ...old, value: merged });
		} else {
			const timer = setTimeout(() => {
				const job = this.jobs.get(key)!;
				this.jobs.delete(key);
				void this.performSafely(key, job.value);
			}, this.timeout);
			this.jobs.set(key, { value, timer });
		}
	}

	async performAllNow() {
		const entries = [...this.jobs.entries()];
		this.jobs.clear();
		for (const [_key, job] of entries) {
			clearTimeout(job.timer);
		}
		await Promise.all(entries.map(([key, job]) => this.performSafely(key, job.value)));
	}
}
