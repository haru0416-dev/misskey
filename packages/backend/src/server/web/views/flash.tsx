/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Packed } from '@/misc/json-schema.js';
import type { MiUserProfile } from '@/models/UserProfile.js';
import type { CommonProps } from '@/server/web/views/_.js';
import { Layout } from '@/server/web/views/base.js';
import { ArticleOgMeta, OwnedContentMeta } from '@/server/web/views/_content-meta.js';

export function FlashPage(
	props: CommonProps<{
		flash: Packed<'Flash'>;
		profile: MiUserProfile;
	}>,
) {
	return (
		<Layout
			{...props}
			title={`${props.flash.title} | ${props.instanceName}`}
			desc={props.flash.summary}
			metaSlot={
				<OwnedContentMeta
					profile={props.profile}
					user={props.flash.user}
					contentKind="flash"
					contentId={props.flash.id}
				/>
			}
			ogSlot={
				<ArticleOgMeta
					title={props.flash.title}
					description={props.flash.summary}
					url={`${props.config.instance.url}/play/${props.flash.id}`}
					image={props.flash.user.avatarUrl ? { url: props.flash.user.avatarUrl, card: 'summary' } : null}
				/>
			}
		></Layout>
	);
}
