#!/bin/bash

# SPDX-FileCopyrightText: syuilo and misskey-project
# SPDX-License-Identifier: AGPL-3.0-only

PORT=$(grep '^port:' /misskey/.config/default.yml | awk 'NR==1{print $2; exit}')
# oven/bun イメージ (本番 runner / federation テスト) には curl が無いため、bun の fetch で確認する
exec bun -e "const res = await fetch('http://localhost:${PORT}/healthz'); if (!res.ok) process.exit(1);"
