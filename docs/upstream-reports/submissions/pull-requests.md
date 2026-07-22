# Ready-to-paste PR titles & descriptions (English)

For issues 01–03 (verified fixes; patches in `../patches/`). Add a `CHANGELOG.md` entry under the
`### Server` bugfix subsection of the unreleased section, and include the repro as a regression test.
Re-check line numbers against `develop` before opening.

---

## PR for Issue 01 — repliesCount double-decrement

**Title:** `fix(backend): guard note deletion side effects with the DELETE's affected-row count`

**Body:**

Fixes #<issue-01>.

`NoteDeleteService.delete()` decremented the parent note's `repliesCount` unconditionally and only deleted
the note (without checking affected rows) at the very end. Two concurrent delete requests for the same reply
therefore both decremented the parent, while only one actually removed the row, so `repliesCount` (which is
not clamped) could drift negative.

This moves the `DELETE` to the start of the method and uses its `affected` count as the authoritative guard:
if `affected !== 1`, another request already handled this note and we return before applying any side
effects. This mirrors the existing guard in `ReactionService.delete()`.

- Added a regression test that races two deletions of the same reply and asserts the parent's `repliesCount`
  ends at `0` (not `-1`).
- `UserFollowingService.decrementFollowing()` has the same unguarded pattern for
  `followingCount`/`followersCount`; happy to address it in a follow-up PR.

`CHANGELOG.md` (`### Server`): `- Fix: a note's repliesCount could drift negative when the same reply was deleted concurrently`

---

## PR for Issue 02 — dateUTC epoch-0

**Title:** `fix(backend): dateUTC should not throw for the Unix epoch`

**Body:**

Fixes #<issue-02>.

`dateUTC()` guarded its argument count with `if (!d)`, but `d` is `Date.UTC(...)` which returns `0` for the
Unix epoch (`Date.UTC(1970, 0)`), so a valid epoch timestamp threw "wrong number of arguments". Only the
wrong-argument-count branch produces `null`, so the check should test for `null`.

```diff
-	if (!d) throw new Error('wrong number of arguments');
+	if (d === null) throw new Error('wrong number of arguments');
```

- Added a regression test (`dateUTC([1970, 0])` returns `new Date(0)` and does not throw).

This does not affect users (internal helper only), so per CONTRIBUTING a `CHANGELOG.md` entry is optional.

---

## PR for Issue 03 — admin/ad/list publishing:false pagination

**Title:** `fix(backend): parenthesize the publishing:false filter in admin/ad/list so pagination works`

**Body:**

Fixes #<issue-03>.

For `publishing: false`, `admin/ad/list` chained `.andWhere('ad.expiresAt <= :now').orWhere('ad.startsAt > :now')`
onto the pagination query. TypeORM's `orWhere` does not parenthesize the existing conditions, so the cursor
(`ad.id < :untilId`) only applied to the first arm and scheduled ads (`startsAt > now`) reappeared on every
page. This wraps the two conditions in a `Brackets` so the cursor ANDs with the whole group.

```diff
+import { Brackets } from 'typeorm';
 ...
 			} else if (ps.publishing === false) {
-				query.andWhere('ad.expiresAt <= :now', { now: new Date() }).orWhere('ad.startsAt > :now', { now: new Date() });
+				const now = new Date();
+				query.andWhere(new Brackets(qb => {
+					qb.where('ad.expiresAt <= :now', { now }).orWhere('ad.startsAt > :now', { now });
+				}));
 			}
```

- Added a regression test that pages through `publishing: false` and asserts page 2 does not repeat page 1.

`CHANGELOG.md` (`### Server`): `- Fix: admin ad list with the "not published" filter repeated scheduled ads on every page`

---

## Issues 04 & 05 — PR to follow

These fixes need design decisions (a data migration + `UNIQUE NULLS NOT DISTINCT` for #04; per-user
serialization / advisory lock for #05), so they are filed as issues first with a proposed approach, and a PR
can follow once the maintainers agree on the direction.
