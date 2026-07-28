# Canvas Connect release runbook

Canvas Connect is a read-only OAuth integration. Students sign in on their
school's Canvas page; Campus Companion never asks for or stores a Canvas
password. Imported classes, assignments, quizzes, tests, and due dates remain
scoped to the authenticated student and their Canvas course.

## Institution setup

Create a Canvas Developer Key for each supported institution.

For Utah State University, register this exact redirect URI:

`https://norsaaoyppctrvxxgjtg.supabase.co/functions/v1/canvas-oauth-callback`

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
CANVAS_APP_URL=https://campuscoach.lovable.app
```

Generate the encryption key outside source control:

```sh
openssl rand -base64 32
```

For multiple institutions, replace the base URL/client variables with a JSON
array in `CANVAS_OAUTH_CLIENTS`.

## Release order

1. Apply `20260725090000_canvas_connect_foundation.sql`.
2. Set all required Supabase secrets.
3. Deploy `canvas-connect`, `canvas-oauth-callback`, and `canvas-sync`.
4. Deploy the app release.
5. Connect a test student account and run **Sync now**.
6. Verify imported classes, assignments, tests, Calendar entries, and source
   links remain in the correct class.
7. Disconnect and confirm imported coursework disappears while student-created
   notes and study history remain available.

Do not publish the Connect button for an institution until its Developer Key,
redirect URI, scopes, and secrets are confirmed.
