/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Packed } from '@/misc/json-schema.js';
import type { MiUserProfile } from '@/models/UserProfile.js';
import type { CommonProps } from '@/server/web/views/_.js';
import { Layout } from '@/server/web/views/base.js';
import { ArticleOgMeta, OwnedContentMeta } from '@/server/web/views/_content-meta.js';

export function ClipPage(
	props: CommonProps<{
		clip: Packed<'Clip'>;
		profile: MiUserProfile;
	}>,
) {
	return (
		<Layout
			{...props}
			title={`${props.clip.name} | ${props.instanceName}`}
			desc={props.clip.description ?? ''}
			metaSlot={
				<OwnedContentMeta profile={props.profile} user={props.clip.user} contentKind="clip" contentId={props.clip.id} />
			}
			ogSlot={
				<ArticleOgMeta
					title={props.clip.name}
					description={props.clip.description}
					url={`${props.config.instance.url}/clips/${props.clip.id}`}
					image={props.clip.user.avatarUrl ? { url: props.clip.user.avatarUrl, card: 'summary' } : null}
				/>
			}
		></Layout>
	);
}
