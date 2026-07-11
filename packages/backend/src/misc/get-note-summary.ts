/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Packed } from './json-schema.js';

export const getNoteSummary = (note: Packed<'Note'>): string => {
	if (note.deletedAt) {
		return '(❌⛔)';
	}

	if (note.isHidden) {
		return '(⛔)';
	}

	let summary = '';

	if (note.cw != null) {
		summary += note.cw;
	} else {
		summary += note.text ? note.text : '';
	}

	if ((note.files ?? []).length !== 0) {
		summary += ` (📎${note.files!.length})`;
	}

	if (note.poll) {
		summary += ' (📊)';
	}

	if (note.replyId) {
		if (note.reply) {
			summary += `\n\nRE: ${getNoteSummary(note.reply)}`;
		} else {
			summary += '\n\nRE: ...';
		}
	}

	if (note.renoteId) {
		if (note.renote) {
			summary += `\n\nRN: ${getNoteSummary(note.renote)}`;
		} else {
			summary += '\n\nRN: ...';
		}
	}

	return summary.trim();
};
