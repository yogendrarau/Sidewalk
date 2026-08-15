// Retired compatibility endpoint. The active seven-language function is
// `answer_demo_question`; keeping this tombstone prevents stale two-language
// logic from remaining callable in Base44 environments that retain deleted
// function registrations.
Deno.serve(() =>
  Response.json(
    {
      ok: false,
      error: "This endpoint has been retired. Use answer_demo_question.",
      error_code: "endpoint_retired",
    },
    { status: 410 },
  )
);
