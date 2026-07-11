/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export default async function hasAudio(media: HTMLMediaElement) {
	const cloned = media.cloneNode() as HTMLMediaElement;
	cloned.muted = true;
	(cloned as typeof cloned & Partial<HTMLVideoElement>).playsInline = true;
	try {
		const played = await new Promise<boolean>((resolve) => {
			let settled = false;
			const finish = (result: boolean) => {
				if (settled) return;
				settled = true;
				cloned.removeEventListener('playing', onPlaying);
				cloned.removeEventListener('error', onError);
				resolve(result);
			};
			const onPlaying = () => finish(true);
			const onError = () => finish(false);
			cloned.addEventListener('playing', onPlaying);
			cloned.addEventListener('error', onError);
			try {
				void cloned.play().catch(onError);
			} catch {
				onError();
			}
		});
		if (!played) return false;
		return (
			!!(cloned as typeof cloned & { audioTracks?: unknown[] }).audioTracks?.length ||
			(cloned as typeof cloned & { mozHasAudio?: boolean }).mozHasAudio === true ||
			!!(cloned as typeof cloned & { webkitAudioDecodedByteCount?: number }).webkitAudioDecodedByteCount
		);
	} finally {
		cloned.pause();
		cloned.removeAttribute('src');
		for (const source of cloned.querySelectorAll('source')) source.removeAttribute('src');
		cloned.load();
		cloned.remove();
	}
}
