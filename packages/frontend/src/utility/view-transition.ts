/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export function runViewTransition(
	update: () => void | Promise<void>,
	document: Document = window.document,
): ViewTransition | null {
	let updateStarted = false;
	const updateOnce = () => {
		if (updateStarted) {
			return;
		}
		updateStarted = true;
		return update();
	};
	const runFallback = () => {
		void Promise.resolve(updateOnce()).catch((err) => console.error(err));
	};

	if (document.startViewTransition == null) {
		runFallback();
		return null;
	}

	try {
		const transition = document.startViewTransition(updateOnce);
		// 非表示化などで描画だけが中止されても update は実行される。ready の拒否を未処理にしない。
		void transition.ready.catch((err) => console.error(err));
		void transition.finished.catch((err) => console.error(err));
		return transition;
	} catch (err) {
		console.error(err);
		runFallback();
		return null;
	}
}
