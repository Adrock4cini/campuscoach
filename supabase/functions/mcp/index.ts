// Retired for the launch boundary.
//
// The generated MCP endpoint exposed static demo coursework rather than the
// authenticated student's durable records. Keep a deployed tombstone so an
// older endpoint cannot keep serving misleading demo data after the web plugin
// and source tools are removed.
import { privateJsonResponse } from "../_shared/private-json-response.ts";

Deno.serve((request) => privateJsonResponse(
  {
    error: "The Campus Companion MCP endpoint is not available in Early Access.",
    code: "endpoint_retired",
  },
  410,
  {},
  { requestId: request.headers.get("X-Request-ID") ?? undefined },
));
