#!/bin/bash

# SPDX-FileCopyrightText: syuilo and misskey-project
# SPDX-License-Identifier: AGPL-3.0-only

# Read the same compiled configuration as the server instead of reparsing YAML.
exec bun -e '
const config = await Bun.file("/misskey/built/.config.json").json();
const port = config.port ?? Number(Bun.env.PORT);
if (!Number.isInteger(port) || port <= 0 || port > 65535) process.exit(1);
const res = await fetch(`http://127.0.0.1:${port}/healthz`);
if (!res.ok) process.exit(1);
'
