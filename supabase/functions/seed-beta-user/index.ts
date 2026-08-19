// Retired before the 13+ family beta.
//
// Invited accounts are created one at a time through Supabase Auth Admin while
// public signup is disabled. Keeping this deployed tombstone prevents an old
// shared-secret build of the function from being used to create or reset an
// account if a stale invocation URL is discovered.
Deno.serve(() => new Response(
  JSON.stringify({
    error: "This provisioning endpoint is retired. Use the approved Auth Admin invitation process.",
  }),
  {
    status: 410,
    headers: { "Content-Type": "application/json" },
  },
));
