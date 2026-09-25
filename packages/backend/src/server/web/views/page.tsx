/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Packed } from '@/misc/json-schema.js';
import type { MiUserProfile } from '@/models/UserProfile.js';
import type { CommonProps } from '@/server/web/views/_.js';
import { Layout } from '@/server/web/views/base.js';
import { ArticleOgMeta, OwnedContentMeta } from '@/server/web/views/_content-meta.js';

export function PagePage(
	props: CommonProps<{
		page: Packed<'Page'>;
		profile: MiUserProfile;
	}>,
) {
	return (
		<Layout
			{...props}
			title={`${props.page.title} | ${props.instanceName}`}
			desc={props.page.summary ?? ''}
			metaSlot={
				<OwnedContentMeta profile={props.profile} user={props.page.user} contentKind="page" contentId={props.page.id} />
			}
			ogSlot={
				<ArticleOgMeta
					title={props.page.title}
					description={props.page.summary}
					url={`${props.config.instance.url}/pages/${props.page.id}`}
					image={
						props.page.eyeCatchingImage != null
							? {
									url: props.page.eyeCatchingImage.thumbnailUrl ?? props.page.eyeCatchingImage.url,
									card: 'summary_large_image',
								}
							: props.page.user.avatarUrl
								? { url: props.page.user.avatarUrl, card: 'summary' }
								: null
					}
				/>
			}
		></Layout>
	);
}
