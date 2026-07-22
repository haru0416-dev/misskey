# Ready-to-paste Security Advisory (English) — DO NOT file as a public issue

Submit via GitHub → the repository's **Security → Report a vulnerability** (private Security Advisory),
per CONTRIBUTING ("Security Advisory"). A fix can be offered as a PR on the private fork afterward.

---

**Title:** Privilege escalation: a moderator can reset a non-root administrator's password and remove any user's MFA

**Summary**

`admin/reset-password` and `admin/unset-mfa` are gated only by `requireModerator: true` and do not check
whether the *target* user outranks (or equals) the caller. As a result, on an instance that grants
`write:admin:reset-password` / `write:admin:unset-mfa` to a role that is less trusted than the administrators
it can target, the holder of that role can take over higher, non-root administrator accounts:

- `admin/reset-password` issues a new 8-character password for the target, which can then be used to log in.
  Only the **root** user is protected; other administrators are not.
- `admin/unset-mfa` strips the target's TOTP/passkey. It has **no target guard at all** — not even for root —
  so a moderator can remove root's second factor.

Combined, a lower-privileged moderator can fully take over a non-root administrator (password reset + MFA
removal).

**Severity:** Medium. Exploitability depends on the instance's role configuration: it requires a role
hierarchy where a lower-trust role holds `write:admin:reset-password` (and/or `write:admin:unset-mfa`). On a
single-admin instance, or where all moderators are equally trusted, there is no escalation.

**Affected version:** `develop` (2026.7.0-beta.2); confirmed by source inspection.

**Root cause**

- `packages/backend/src/server/api/endpoints/admin/reset-password.ts`: guards only
  `serverSettings.rootUserId === user.id`; there is no check that the target isn't an equal/higher
  administrator.
- `packages/backend/src/server/api/endpoints/admin/unset-mfa.ts`: no target-rank check at all (not even the
  root guard).

**Proof of concept** (e2e flow)

```
root  = signup()                                   // first signup = instance root
admin = signup(); assign role { isAdministrator: true }
mod   = signup(); assign role { isModerator: true }

// as the moderator, targeting the non-root administrator:
POST /api/admin/reset-password { userId: admin.id }   // → 200 with a new password (should be denied)
POST /api/admin/unset-mfa      { userId: admin.id }    // → succeeds (should be denied)
```

**Suggested fix**

Add a caller-vs-target authorization check to both endpoints (and ideally a shared `RoleService` helper
used by all admin-on-user actions such as suspend / delete-account):

- Deny if the target is root (extend the existing reset-password guard to unset-mfa too).
- Deny if the target is an administrator that the caller does not outrank (e.g. a non-administrator
  moderator may not act on an administrator).

**Note on intent**

The root-only guard in reset-password is deliberate (it was refactored in #15530 and has a dedicated error).
The gaps — no protection for non-root administrators, and no guard at all in unset-mfa — appear unintended:
none of the repository's published security advisories cover this, and there is no related issue.
