# Federation regression matrix

The matrix retains fork ↔ fork and adds fork ↔ an independently built upstream.
Host identities remain `a.test` and `b.test`. `a.test` always runs this checkout;
`FEDERATION_PEER_B_KIND=fork|upstream` selects `b.test` explicitly.
`acceptance.test.ts` and `resilience.test.ts` run the same scenarios in both
sender directions. Every pre-existing `*.test.ts` remains enabled in both jobs.
The suite also parses public actors, notes, replies and polls with `@fedify/vocab`.

## Pinned upstream and guarantee boundary

`upstream.json` records Misskey **2026.9.0**, commit
`bd9eb7c77942ef11749a04e7a5f24bee935d764b`, and the registry OCI index:

```
misskey/misskey:2026.9.0@sha256:13ea3b432adbe29bf3699da5c7c0bd54775a9c237339ea47c6ec220094dba59a
```

The [release tag reference](https://api.github.com/repos/misskey-dev/misskey/git/ref/tags/2026.9.0),
[release](https://github.com/misskey-dev/misskey/releases/tag/2026.9.0), registry
`Docker-Content-Digest`, and linux/amd64 image
`org.opencontainers.image.revision` label were independently read on 2026-09-09.
The image revision label agrees with the GitHub commit. The architecture-specific
manifests and image-config digest are also recorded. No execution uses `latest`.

Resolving provenance is not a compatibility result. Only the revisions and
sender directions in a completed, passing result are covered. Unexecuted tests,
missing prerequisites, timeouts, failures and skips must remain distinct.
No performance or successful interoperability result is asserted by these files.

## Prerequisites and ordering

Use the exact Bun version in the root `.bun-version`, Docker Engine and Docker
Compose with `include`/`extends` support (Compose 2.20 or newer), OpenSSL and FFmpeg.
The current topology reserves the Docker subnet `172.20.0.0/16`; do not run the two
matrix cells concurrently on one Docker daemon. CI puts them on separate runners.
No host application/database ports are published.

From the repository root, after preserving the starting-revision baseline:

```sh
bun install --frozen-lockfile
bun run --filter slacc build
bun run build-pre
bun run build:backend-deps
bun run --bun --filter backend build
export BUN_VERSION="$(cat .bun-version)"
cd packages/backend/test-federation
bash ./setup.sh
```

The tester mounts the federation dummy configuration as `/misskey/.config/test.yml`;
it does not change your repository `.config/test.yml`. Stop all peers using this
checkout before setup: it regenerates the test CA and peer certificates with
explicit CA/server key usages and DNS SANs, then generates peer JSON and nginx
configurations. The CA must be readable by every container;
on fresh CI certificates, `chmod 644 certificates/*.test.key` permits the upstream
image's non-root user to read test keys where necessary. These are test-only keys.
Never use production credentials or keys in this topology.

Run **each** peer kind, sequentially, with a fresh project name:

```sh
export FEDERATION_PEER_B_KIND=fork # repeat with upstream after completing this cell
export COMPOSE_FILE=compose.matrix.yml
export COMPOSE_PROJECT_NAME=federation-fork-baseline # use a distinct name for upstream

docker compose config
docker compose up -d --wait --wait-timeout 240 --scale tester=0
docker compose run --no-deps --rm tester
```

For one scenario file, keep the same environment and topology:

```sh
docker compose run --no-deps --rm tester bun run --bun --filter backend test:fed test-federation/test/acceptance.test.ts
docker compose run --no-deps --rm tester bun run --bun --filter backend test:fed test-federation/test/resilience.test.ts
```

Record `git rev-parse HEAD`, `docker compose config`, `docker compose images
--format json`, `upstream.json`, test exit status and `docker compose logs
--no-color` alongside `results/<peer-kind>.json`. CI uploads those records even
when a cell fails. Capture logs before `docker compose down`. To discard only a
completed matrix project's test state, use `docker compose down --volumes` with
that exact project environment. Do not point cleanup at an existing deployment.

The older `compose.yml` remains available for legacy topology users. The complete
A2–A4 suite requires `compose.matrix.yml`: its signing/queue observations need
private DB connectivity and its fault trials require `FEDERATION_FAULT_URL`.

## Isolation and driver

Matrix DB, media and Valkey volumes are project-scoped named volumes, separate
from the existing `./volumes` bind directories. Each peer has its own database
service and config. Upstream has a dedicated Valkey service and only mounts its
YAML config, test CA and media volume: no checkout backend, dependencies, generated
config or other fork build artifacts are mounted over its published image.
Fork peers share immutable checkout artifacts and installation volumes, but have
separate compiled-config mounts, media and DB state. The setup service installs
fork dependencies before either fork starts.

`test/utils.ts` retains existing public helper signatures. Upstream's explicit
setup password is supplied only by `hostKind()`-selected admin bootstrap. Both
pinned peers use `signin-flow` with the same finished response shape; account
creation uses the token returned by the real authenticated admin endpoint rather
than repeatedly signing in. No protocol operation is substituted in the driver.
The test daemon's existing fork signin-rate-limit cleanup remains test-only;
upstream uses its supported `enableIpRateLimit: false` test configuration.

`assertNoteContent`, `assertUserProfile` and `assertAttachment` replace whole
internal entity comparisons at the old consistency assertions with observable
content/profile/media contracts. Existing activity-specific counters, IDs,
visibility, Fedify parsing and all other scenarios remain in place.

`deliveryBarrier()` observes both peers' actual deliver/inbox/db/relationship
queue counts (including delayed work), fork durable outbox states and proxy
in-flight requests, then rechecks the sender after receiver processing. Unexpected
fork dead-letter entries fail the barrier. Receiver-state assertions follow the
barrier; HTTP 202 alone never proves a final effect. Polling intervals are not
absence proofs. Existing permanent-failure/dead-letter/account-delete coordinator
regressions remain in `test/unit/queue/{deliver,queue-outbox,delete-account}.ts` and
must pass as part of A1; the federation matrix does not replace them.

`signedRequest()` reads the signing actor's real key from the isolated peer DB
and sends ordinary RSA HTTP signatures through TLS/nginx/inbox. It does not
change keys or expose a production signing endpoint. Post-signature body, actor,
ID and Host tampering are separate from validly signed actor/ID mismatches.

`fault-proxy.ts` forwards only inbox POSTs. The separate control listener is
reachable only on the private Docker network, with no host port or Docker socket.
`outage` returns 503 without forwarding. `response-loss` consumes a successful
upstream response and closes the downstream socket, so nginx/sender observes a
transport failure even though the peer accepted the activity. Tests require two
such successful forwards and real retries before restoring normal delivery.
Control transitions to `pass` retain counters; starting a new fault resets them.
Files run serially because a fault filter selects a destination and activity type.
No production retry schedule is shortened: upstream's 60s then 180s backoff plus
up to 20% jitter gives resilience cases an eight-minute deadline and queue
barriers a six-minute deadline.

## Acceptance mapping

| Plan criterion | Scenario / evidence |
| --- | --- |
| A2 independent pinned peer, fork-fork retained, isolated state/artifacts | `compose.matrix.yml`, `compose.matrix.{fork,upstream}.yml`, `upstream.json`; CI's two independent cells |
| A3 identical semantics with both sender roles, setup differences only in driver | both new files' `describe.each` directions; `utils.ts` bootstrap; per-kind JSON reports |
| A4 actor resolution | `acceptance`: `resolves the actor by handle and canonical URI...` |
| Follow/Accept/Undo | `acceptance`: `locked Follow remains pending until explicit Accept...` |
| Attachments/replies | `acceptance`: `delivers attachments and replies...`; existing drive/note/Fedify cases |
| Reaction/Undo | `acceptance`: `Reaction and Undo converge...` |
| Announce/Undo/Delete | `acceptance`: `Announce and Undo remove only the renote...`; existing note deletion cases |
| Profile Update | `acceptance`: `profile Update changes the cached remote actor...` |
| Move/alias/follower migration | `acceptance`: `Move honors destination alias and transfers local and remote followers`; existing Move cases |
| Every visibility, allowed/denied recipients, unsigned/signed fetch, outbox and featured | `acceptance`: five `%s preserves allowed delivery...` cases, `outbox pagination retains public/home notes...` |
| Private parent exposure | `acceptance`: `reply visibility and public collections never expose an inaccessible parent or attachment`; `specified reply reaches its own recipient...` |
| Valid signatures and tampered signatures without final effects | `resilience`: valid signed GET/POST and six `%s causes no final side effect...` variants per direction |
| Temporary outage and response-loss/retry convergence | `resilience`: `outage` and `response-loss`, each `Note`, `Follow`, `Reaction`, `Delete` in both directions |
| Negative proof uses progress/final state | queue/outbox/proxy observations plus exact remote notes, reactions, followers and deletion checks |
| Existing regression contracts remain gates | all original federation files still included; A1 unit/e2e suites remain mandatory |
| CI includes lock/runtime/native dependency changes | workflow paths include lock, Bun version/config, root manifests, patches, native slacc, backend dependencies and build scripts |

## Verification status

The official pinned image and acceptance conditions remain unchanged. B–E
cutovers are on hold until phase A passes; tests must not be skipped or weakened
to work around upstream failures.

The original fork-fork baseline passed 102 tests with 10 existing skips after
repairing TLS and authentication fixtures. The added upstream suite initially
reported 124 passes, 12 failures and 10 skips, including fixture defects corrected
after that run. This is not a final failure count for the current source.

The fork's inaccessible-parent reply reference was reproduced and fixed.
Four targeted private-reply cases passed with the official upstream in both
directions, including child delivery and absence of private parent/attachment
content. Same-author followers replies retain their parent reference.
Both implementations' private GET policy is unchanged; authorized private push
delivery is checked separately.

Move to an upstream-local destination and recovery after remote unblock or
unsuspend still have unresolved upstream failures. After fixing duplicate Accept
handling in the fork, all 32 fork-fork signature/recovery cases passed. The pinned
upstream run completed with 29 passes and 3 failures: duplicate Accepts remain
delayed with `No follow request.` on the official receiver after Follow response
loss, preventing that case and the next two cases from reaching the completion
barrier. The official image remains unmodified.

The first full fork-fork run reported 166 passes, 2 failures and 10 existing skips.
Delivery barriers fixed its media/notification fixture failures; the affected
drive, notification and block files then passed 21 tests with 2 existing skips.
A subsequent full run exposed three more fixed-wait races in pin propagation,
Follow/Accept completion before remote moderation, and poll updates
(165 passes, 3 failures, 10 existing skips). These and equivalent federation
waits now use sender-specific delivery barriers. Existing state polling,
assertion expectations, skips and timeout bounds are preserved. A missing await
on the localOnly rejection assertion and a non-comparing identity assertion were
also corrected.

After 40 targeted passes with 4 existing skips, the complete fork-fork matrix
passed all 11 files on fresh dedicated PostgreSQL/Valkey instances:
168 passes, no failures and 10 existing skips, including all 34 acceptance and
32 signature/recovery cases. Repository lint passed. This is fork-fork evidence,
not proof of compatibility with the pinned upstream.
Neither the added upstream matrix nor its fault-recovery gate is certified as passing.

The user approved proceeding with internal optimization while retaining the
official target and recording its known defects. Remediating those existing
upstream defects is no longer a completion requirement. Assertions and failure
reports remain unchanged; no new skips are permitted. Before/after comparisons
must distinguish the same observed upstream failure from a new cause or a
regression, using direction, persisted state, errors and remaining jobs rather
than only matching test names or failure counts.

The final full matrices after the B/C/E cutover retain 168/0/10
(passed/failed/existing skips) for fork-fork and 108/23/47 for pinned upstream.
Every assertion status matches the approved baseline. The comparison also
checked actor/relationship/object state, endpoint and worker errors, and actual
queue membership; no new regression or worsening was observed in those checks.
The upstream Move and unsuspension defects remain. Some later failures occur
before their intended operation or after a persisted effect but before a shared
barrier settles; they are not passing notification or recovery evidence.
The baseline state capture was late: the same duplicate Accept jobs exhausted
their retries there, while the immediate final capture still had them delayed.
Failure-time counts come from the original reports, not an equal-time assumption
about those snapshots. See the plan's final comparison for the exact limits.

Exact evidence boundaries, pinned identity, observed failures versus inferred
causes, and the decision to retain the official target are recorded in
[the optimization plan](../../../docs/optimization-plan.md#実行記録と保留条件).
