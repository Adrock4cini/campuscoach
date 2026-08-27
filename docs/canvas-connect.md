# Canvas Connect release runbook

Canvas Connect is a read-only OAuth integration. Students sign in on their
school's Canvas page; Campus Companion never asks for or stores a Canvas
password. Imported classes, assignments, quizzes, tests, and due dates remain
scoped to the authenticated student and their Canvas course.

When a school has not enabled OAuth yet, the same page offers a limited
calendar-feed fallback. The student copies their private link from Canvas
Calendar. Campus Companion encrypts that URL with the same 32-byte key and
imports deadlines read-only. Only hosted `*.instructure.com` HTTPS calendar
feeds are accepted. Full OAuth remains the preferred connection because it can
also read completion state and richer coursework details.

## Institution setup

Create a Canvas Developer Key for each supported institution.

For Utah State University, replace `<SUPABASE_PROJECT_REF>` with the verified
project ref for the environment being configured, then register this exact
redirect URI:

`https://<SUPABASE_PROJECT_REF>.supabase.co/functions/v1/canvas-oauth-callback`

Enable only these API scopes:

- `url:GET|/api/v1/courses`
- `url:GET|/api/v1/courses/:course_id/assignments`

The assignments response must allow the `submission` include so completion can
be reflected without requesting submission-writing access.

## Supabase secrets

For a single launch institution:

```text
CANVAS_BASE_URL=https://usu.instructure.com
CANVAS_INSTITUTION_NAME=Utah State University
CANVAS_CLIENT_ID=<developer-key-id>
CANVAS_CLIENT_SECRET=<developer-key-secret>
CANVAS_TOKEN_ENCRYPTION_KEY=<base64-encoded-32-random-bytes>
CANVAS_APP_URL=https://<CANONICAL_APP_HOST>
```

Generate the encryption key outside source control:

```sh
openssl rand -base64 32
```

For multiple institutions, replace the base URL/client variables with a JSON
array in `CANVAS_OAUTH_CLIENTS`.

## Release order

1. Apply `20260725090000_canvas_connect_foundation.sql`, followed by
   `20260730120000_canvas_calendar_fallback.sql`.
2. Set all required Supabase secrets.
3. Deploy `canvas-connect`, `canvas-oauth-callback`, `canvas-sync`, and
   `canvas-calendar-sync`.
4. Deploy the app release.
5. Connect a test student account and run **Sync now**.
6. Verify imported classes, assignments, tests, Calendar entries, and source
   links remain in the correct class.
7. Disconnect and confirm imported coursework disappears while student-created
   notes and study history remain available.
8. On a test user without OAuth, copy the Canvas **Calendar Feed** link, import
   it through the fallback, and verify the same class/deadline boundaries.

Do not publish the Connect button for an institution until its Developer Key,
redirect URI, scopes, and secrets are confirmed. Canvas is outside the current
invite-only launch inventory, so `VITE_CANVAS_CONNECT_ENABLED` must remain
exactly `false` even if this runbook passes. Enabling it in a future release
requires a separately reviewed Edge inventory and an intentional update to the
release validator, canary, and public release manifest expectation.
