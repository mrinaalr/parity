# Alice's private brief: order retries

Duplicate orders showed up in last month's incident review of the checkout service. Mobile clients retry a failed POST /orders after a timeout, and the first request had often already succeeded.

My plan: require an Idempotency-Key header on POST /orders. The stored response is returned byte for byte on a repeat with the same key. Keys are scoped to the client account that sent them, and the stored response lives for 24 hours.

When I say a request is idempotent I mean: repeating it with the same key gives the same result and no new side effect. A repeat with a different key is a new request on purpose. A repeat with the same key and a different body is a client bug and gets a 422.

Private, not for the card: the ACME-INTERNAL ticket number is 4471 and the fix is budgeted at two sprints.
