/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export function ApiDocPage() {
	return (
		<>
			{'<!DOCTYPE html>'}
			<html lang="en">
				<head>
					<meta charset="UTF-8" />
					<title>Toneriko API</title>
					<meta name="viewport" content="width=device-width, initial-scale=1" />
					<style>{`body { margin: 0; padding: 0; }`}</style>
				</head>
				<body>
					<script id="api-reference" data-url="/api.json"></script>
					{/* 版を固定しないと CDN が最新版を配り、公開後に表示や挙動が予告なく変わる。integrity で配布物の差し替えも拒否する。 */}
					<script
						src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.69.0/dist/browser/standalone.js"
						integrity="sha384-UL+pt9bcR3hCuzEybA1bAyu6yv9qkzJuYCP5N+HZPOo9ZkUXcMflxqBjC1vfDzfe"
						crossorigin="anonymous"
					></script>
				</body>
			</html>
		</>
	);
}
