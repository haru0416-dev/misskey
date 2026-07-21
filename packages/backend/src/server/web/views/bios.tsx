/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export function BiosPage(props: {
	version: string;
}) {
	return (
		<>
			{'<!DOCTYPE html>'}
			<html lang="en">
				<head>
					<meta charset="UTF-8" />
					<meta name="application-name" content="Erebia" />
					<title>Erebia Repair Tool</title>
					<link rel="stylesheet" href="/static-assets/misc/bios.css" />
				</head>

				<body>
					<header>
						<h1 safe>Erebia Repair Tool {props.version}</h1>
					</header>
					<main>
						<div class="tabs">
							<button id="ls">edit local storage</button>
						</div>
						<div id="content"></div>
					</main>
					<script src="/static-assets/misc/bios.js"></script>
				</body>
			</html>
		</>
	);
}
