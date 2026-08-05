/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import type { AntennaCreateValues } from '@/core/AntennaStore.js';
import { genId } from '@/misc/id/gen-id.js';

const keywordMatrixSchema = z.array(z.array(z.string()));

function hasKeyword(matrix: string[][]): boolean {
	return matrix.some(group => group.some(keyword => keyword !== ''));
}

const exportedAntennaSchema = z.object({
	name: z.string().min(1).max(100),
	src: z.enum(['home', 'all', 'users', 'list', 'users_blacklist']),
	userListAccts: z.array(z.string()).nullable(),
	keywords: keywordMatrixSchema,
	excludeKeywords: keywordMatrixSchema,
	users: z.array(z.string()),
	caseSensitive: z.boolean(),
	localOnly: z.boolean(),
	excludeBots: z.boolean(),
	withReplies: z.boolean(),
	withFile: z.boolean(),
	excludeNotesInSensitiveChannel: z.boolean(),
}).strict().superRefine((value, ctx) => {
	if (!hasKeyword(value.keywords) && !hasKeyword(value.excludeKeywords)) {
		ctx.addIssue({
			code: 'custom',
			message: 'Either keywords or excludeKeywords is required.',
		});
	}
	if (value.src === 'list' && value.userListAccts == null) {
		ctx.addIssue({
			code: 'custom',
			path: ['userListAccts'],
			message: 'List antennas require exported list members.',
		});
	}
});

export const exportedAntennasSchema = z.array(exportedAntennaSchema);
export type ExportedAntenna = z.infer<typeof exportedAntennaSchema>;

export function importedAntennaToCreateValues(antenna: ExportedAntenna, now: Date): AntennaCreateValues {
	const importedListMembers = antenna.src === 'list' ? antenna.userListAccts : null;

	return {
		id: genId(now.getTime()),
		lastUsedAt: now,
		name: antenna.name,
		src: importedListMembers == null ? antenna.src : 'users',
		userListId: null,
		keywords: antenna.keywords,
		excludeKeywords: antenna.excludeKeywords,
		users: (importedListMembers ?? antenna.users).filter(Boolean),
		caseSensitive: antenna.caseSensitive,
		localOnly: antenna.localOnly,
		excludeBots: antenna.excludeBots,
		withReplies: antenna.withReplies,
		withFile: antenna.withFile,
		excludeNotesInSensitiveChannel: antenna.excludeNotesInSensitiveChannel,
	};
}
