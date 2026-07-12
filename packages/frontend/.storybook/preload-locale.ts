/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { writeFile } from 'node:fs/promises';
import locales from 'i18n';

await writeFile(
	new URL('locale.ts', import.meta.url),
	`/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export default ${JSON.stringify(locales['ja-JP'], undefined, 2)} as const;`,
	'utf8',
);
