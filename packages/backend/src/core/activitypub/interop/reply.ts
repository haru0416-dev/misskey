/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { getApId, getApIds } from '@/core/activitypub/type.js';
import type { IObject } from '@/core/activitypub/type.js';
import { StatusError } from '@/misc/status-error.js';
import type { MiNote } from '@/models/Note.js';

export function shouldOmitOutgoingReplyReference(
	note: Pick<MiNote, 'visibility' | 'visibleUserIds'>,
	reply: Pick<MiNote, 'visibility' | 'visibleUserIds' | 'userId'>,
): boolean {
	// 返信元の取得失敗で返信全体を拒否する連合先にも配送するため、閲覧不可の参照は省く。
	// 同じ Note を全宛先に送るため、一部の宛先だけが閲覧可能な場合も参照を省く。
	return (
		reply.visibility === 'specified' &&
		(note.visibility !== 'specified' ||
			note.visibleUserIds.some((id) => id !== reply.userId && !reply.visibleUserIds.includes(id)))
	);
}

export async function resolveIncomingReply(
	replyTarget: IObject['inReplyTo'],
	resolveNote: (target: string | IObject) => Promise<MiNote | null>,
): Promise<MiNote | null> {
	if (replyTarget && typeof replyTarget !== 'string') {
		const audience = [...getApIds(replyTarget.to ?? []), ...getApIds(replyTarget.cc ?? [])];
		if (!audience.includes('https://www.w3.org/ns/activitystreams#Public')) {
			// 非公開の埋め込み本文は、返信の宛先にも開示できるかを取得元で確認する。
			replyTarget = getApId(replyTarget);
		}
	}
	if (!replyTarget) {
		return null;
	}

	try {
		const reply = await resolveNote(replyTarget);
		if (reply == null) {
			throw new Error('inReplyTo not found');
		}
		return reply;
	} catch (error: unknown) {
		// 閲覧不可・削除済みの返信元があっても、返信自体の受信は継続する。
		if (error instanceof StatusError && [403, 404, 410].includes(error.statusCode)) {
			return null;
		}
		throw error;
	}
}
