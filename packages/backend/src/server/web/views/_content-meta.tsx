/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { MiUserProfile } from '@/models/UserProfile.js';

// 利用者が所有するコンテンツの画面で、所有者のクロール・AI 学習拒否設定を反映する。
export function OwnedContentMeta(props: {
	profile: Pick<MiUserProfile, 'noCrawle' | 'preventAiLearning'>;
	user: { username: string; id: string };
	contentKind: string;
	contentId: string;
}) {
	return (
		<>
			{props.profile.noCrawle ? <meta name="robots" content="noindex" /> : null}
			{props.profile.preventAiLearning ? (
				<>
					<meta name="robots" content="noimageai" />
					<meta name="robots" content="noai" />
				</>
			) : null}
			<meta name="misskey:user-username" content={props.user.username} />
			<meta name="misskey:user-id" content={props.user.id} />
			<meta name={`misskey:${props.contentKind}-id`} content={props.contentId} />
		</>
	);
}

// image が null のときは og:image と twitter:card を出さない。
export function ArticleOgMeta(props: {
	title: string;
	description: string | null;
	url: string;
	image: { url: string; card: 'summary' | 'summary_large_image' } | null;
}) {
	return (
		<>
			<meta property="og:type" content="article" />
			<meta property="og:title" content={props.title} />
			{props.description != null ? <meta property="og:description" content={props.description} /> : null}
			<meta property="og:url" content={props.url} />
			{props.image != null ? (
				<>
					<meta property="og:image" content={props.image.url} />
					<meta property="twitter:card" content={props.image.card} />
				</>
			) : null}
		</>
	);
}
