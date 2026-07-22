# Ready-to-paste issue bodies (English)

Format follows `.github/ISSUE_TEMPLATE/01_bug-report.yml`. Language: English
(per CONTRIBUTING, writing in the original language is preferred over machine-translated Japanese).
Re-check line numbers against `develop` before filing.

---

## Issue 01 — Concurrent deletion of a reply note double-decrements the parent's `repliesCount`

**Title:** Concurrent deletion of a reply note double-decrements the parent's `repliesCount` (can go negative)

### 💡 Summary

`NoteDeleteService.delete()` decrements the parent note's `repliesCount` **unconditionally**, and the
actual `DELETE` at the end of the method does **not** check the number of affected rows. When two delete
requests for the *same* reply arrive nearly simultaneously (double-click, client retry, or a user delete
racing a moderator delete), both fetch the reply as non-null, both decrement the parent, but only one
actually deletes the row. `repliesCount` is decremented with `col = col - 1` and is not clamped, so it can
drift permanently and become **negative**. The same shape affects `notesCount` charts, and
`UserFollowingService.decrementFollowing()` has the identical unguarded pattern for
`followingCount`/`followersCount`.

Note that `ReactionService.delete()` already guards against exactly this by checking
`result.affected !== 1` before adjusting counts — `NoteDeleteService` and `UserFollowingService` were
just not given the same guard.

### 🥰 Expected Behavior

Deleting one reply decrements the parent's `repliesCount` exactly once. Two concurrent deletes of the same
reply still net a single decrement.

### 🤬 Actual Behavior

Two concurrent deletes of the same reply decrement the parent twice; with a starting `repliesCount` of 1
the result is `-1`.

### 📝 Steps to Reproduce

1. Create a note P, and a reply R to P (so `P.repliesCount = 1`).
2. Send two `notes/delete` requests for R at (almost) the same time.
3. Read P — its `repliesCount` is `-1` instead of `0`.

Minimal DB-level reproduction (drop into `packages/backend/test/unit/`, run with
`NODE_ENV=test npx vitest run --config vitest.config.unit.ts <file>`): parent with `repliesCount=1`, then
two concurrent flows that each observe the reply as non-null and then run
`notesRepository.decrement({id: parentId}, 'repliesCount', 1)` + `notesRepository.delete({id: replyId})`
— matching `NoteDeleteService.delete()` lines 66-68 and 113. Result: `repliesCount = -1`.

### 🖥️ Server Environment

* Misskey: `develop` (2026.7.0-beta.2)
* Backend bug (server-side); not frontend-specific.

### Root cause / suggested fix

`packages/backend/src/core/NoteDeleteService.ts`: move the `DELETE` to the start of `delete()` and use its
affected-row count as the authoritative guard (return early if `affected !== 1`), before decrementing the
parent and applying the other side effects — mirroring `ReactionService`. A PR with a verified fix follows.

---

## Issue 02 — `dateUTC()` throws for the exact Unix epoch (`Date.UTC(1970, 0) === 0`)

**Title:** `dateUTC()` throws "wrong number of arguments" for the Unix epoch because of a falsy-zero check

### 💡 Summary

`misc/prelude/time.ts`'s `dateUTC()` computes `d = Date.UTC(...)` and validates the argument count with
`if (!d) throw new Error('wrong number of arguments')`. But `Date.UTC(1970, 0)` returns `0` (the Unix
epoch), so `!0 === true` and the function throws an unrelated "wrong number of arguments" error for a
perfectly valid timestamp. This conflates argument-count validation with value validation.

This is latent in practice: the only callers are in `core/chart/core.ts` and always pass dates near "now",
so the epoch is never actually reached — but the guard is still wrong.

### 🥰 Expected Behavior

`dateUTC([1970, 0])` returns `new Date(0)` (1970-01-01T00:00:00Z) without throwing.

### 🤬 Actual Behavior

`dateUTC([1970, 0])` throws `Error: wrong number of arguments`.

### 📝 Steps to Reproduce

```ts
import { dateUTC } from '@/misc/prelude/time.js';
dateUTC([1970, 0]); // throws "wrong number of arguments"
```

### 🖥️ Server Environment

* Misskey: `develop` (2026.7.0-beta.2)

### Root cause / suggested fix

Only the wrong-argument-count branch yields `null`, so the guard should be `if (d === null)` (or
`if (d === null || Number.isNaN(d))`) instead of `if (!d)`. A one-line PR follows.

---

## Issue 03 — `admin/ad/list` with `publishing: false` repeats scheduled ads on every page

**Title:** `admin/ad/list` (`publishing: false`) pagination: unparenthesized `orWhere` makes scheduled ads reappear on every page

### 💡 Summary

In `endpoints/admin/ad/list.ts`, the `publishing === false` branch runs, after `makePaginationQuery`:

```ts
query.andWhere('ad.expiresAt <= :now', { now: new Date() }).orWhere('ad.startsAt > :now', { now: new Date() });
```

`makePaginationQuery` adds the cursor as `andWhere('ad.id < :untilId')`, and TypeORM's `.orWhere()` does
**not** wrap the existing conditions in parentheses. The resulting SQL is:

```sql
WHERE "ad"."id" < :untilId AND "ad"."expiresAt" <= :now OR "ad"."startsAt" > :now
```

By SQL precedence this is `(id < untilId AND expiresAt <= now) OR (startsAt > now)`, so the cursor does not
apply to the `startsAt > now` arm. Every page therefore re-returns all not-yet-started (scheduled) ads, and
pagination cannot advance past them.

### 🥰 Expected Behavior

Paging through `publishing: false` returns each ad once; page 2 (with `untilId`) does not repeat page 1.

### 🤬 Actual Behavior

With several scheduled ads (`startsAt` in the future) and `limit` smaller than their count, page 2 is
identical to page 1; scheduled ads reappear on every page. (Page 1, which has no cursor, is correct — the
bug only manifests from page 2 onward.)

### 📝 Steps to Reproduce

1. Create 4 ads with `startsAt` in the future (scheduled) and `expiresAt` further in the future.
2. Call `admin/ad/list` with `publishing: false, limit: 2` → page 1.
3. Call again with `publishing: false, limit: 2, untilId: <last id of page 1>` → page 2 equals page 1.

### 🖥️ Server Environment

* Misskey: `develop` (2026.7.0-beta.2)

### Root cause / suggested fix

Wrap `expiresAt <= now OR startsAt > now` in a `new Brackets(...)` so the cursor's `andWhere` ANDs with the
whole group. A verified PR follows. (Introduced in #12385 when `publishing` became tri-state.)

---

## Issue 04 — Concurrent `i/registry/set` for the same key creates duplicate rows

**Title:** Concurrent `i/registry/set` for the same (userId, domain, scope, key) creates duplicate registry rows

### 💡 Summary

`RegistryApiService.set()` does `SELECT` (by userId/domain/scope/key) → `update` if found, else `insert`,
with no lock/transaction, and `MiRegistryItem` has no unique constraint on that tuple (only individual
`@Index()`es — this is the existing `// TODO: 同じdomain、同じscope、同じkeyのレコードは二つ以上存在しないように制約付けたい`).
Two concurrent `set`s for the same key both observe "no existing row" and both `INSERT`, producing two rows
for the same key. Subsequent reads use `getOne()`/`limit(1)` and non-deterministically return one of them;
remove/update touch only one id, so the other lingers and causes lost updates.

### 🥰 Expected Behavior

A given `(userId, domain, scope, key)` has at most one registry row.

### 🤬 Actual Behavior

Concurrent `set`s create duplicate rows for the same key.

### 📝 Steps to Reproduce

1. Issue two `i/registry/set` calls for the same scope+key at the same time.
2. The registry now contains two rows for that key.

### 🖥️ Server Environment

* Misskey: `develop` (2026.7.0-beta.2)

### Root cause / suggested fix

Add a composite unique constraint and switch `set()` to an upsert (`INSERT ... ON CONFLICT DO UPDATE`).
Note `domain` is nullable, and PostgreSQL treats NULLs as distinct in a normal UNIQUE, so the constraint
needs `UNIQUE NULLS NOT DISTINCT` (PG 15+) or an expression index over `COALESCE(domain, '')`. A data
migration to de-duplicate existing rows is required first.

---

## Issue 05 — Drive capacity check is a TOCTOU race; concurrent uploads can exceed `driveCapacity`

**Title:** Drive capacity check is check-then-act; concurrent uploads by one user can exceed the drive capacity limit

### 💡 Summary

`DriveService.addFile()` computes `usage = calcDriveUsageOf(user)`
(`SUM(size) WHERE userId AND isLink = FALSE`), checks `if (driveCapacity < usage + info.size) throw`, and
later inserts the drive file — with no lock/serialization between the read and the insert. Concurrent
uploads by the same user all read the same `usage`, all pass the check, and all insert, so the combined
size can exceed `driveCapacity` by roughly `(concurrency - 1) × fileSize`. Unlike the count-limit TOCTOUs,
this lets a user store more bytes than their quota (real storage/quota evasion).

### 🥰 Expected Behavior

Concurrent uploads by one user cannot push their total drive usage past `driveCapacity`.

### 🤬 Actual Behavior

Two concurrent uploads that each observe `usage` before either insert both pass the check and both insert;
total usage exceeds `driveCapacity`.

### 📝 Steps to Reproduce

1. Set a small `driveCapacity` for a user (via role policy).
2. Upload two files concurrently whose combined size exceeds the remaining capacity but each individually
   fits.
3. Both succeed; total usage exceeds `driveCapacity`.

### 🖥️ Server Environment

* Misskey: `develop` (2026.7.0-beta.2)

### Root cause / suggested fix

Serialize the "usage check + insert" per user, e.g. with a PostgreSQL transaction-scoped advisory lock
(`pg_advisory_xact_lock`) keyed on the user id and an authoritative re-check after acquiring the lock, while
keeping the physical upload outside the lock. The same check-then-act shape exists for antenna/clip/pin/
userList count limits, but those are lower stakes.
