#!/bin/bash

# SPDX-FileCopyrightText: syuilo and misskey-project
# SPDX-License-Identifier: AGPL-3.0-only

# YAML を再解析せず、サーバーと同じコンパイル済み設定を読み込む。
exec bun -e '
const testConfig = Bun.file("/misskey/built/._config_.json");
const config = await testConfig.exists() ? testConfig : Bun.file("/misskey/built/.config.json");
const envelope = await config.json();
const port = envelope.config?.server?.listen?.tcp?.port;
if (!Number.isInteger(port) || port <= 0 || port > 65535) process.exit(1);
const res = await fetch(`http://127.0.0.1:${port}/healthz`);
if (!res.ok) process.exit(1);
'
