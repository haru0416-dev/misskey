/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export function CliPage(props: { version: string }) {
	return (
		<>
			{'<!DOCTYPE html>'}
			<html lang="en">
				<head>
					<meta charset="UTF-8" />
					<meta name="application-name" content="Erebia" />
					<title>Erebia CLI Tool</title>

					<link rel="stylesheet" href="/static-assets/misc/cli.css" />
				</head>

				<body>
					<header>
						<h1 safe>Erebia CLI {props.version}</h1>
					</header>
					<main>
						<div id="form">
							<textarea id="text"></textarea>
							<button id="submit">Submit</button>
						</div>
						<div id="tl"></div>
					</main>
					<script src="/static-assets/misc/cli.js"></script>
				</body>
			</html>
		</>
	);
}
