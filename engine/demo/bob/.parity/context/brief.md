# Bob's private brief: order retries

The September incident was a retry storm from one mobile client version. Hundreds of identical POST /orders bodies hit the service within seconds and most became separate orders.

My plan: hash the request body on POST /orders and drop any repeat seen in the last ten minutes. No client change needed, which matters because the mobile release train is six weeks.

When I say a request is idempotent I mean: sending it again, from any client and with no special header, cannot create a second order. The server owns this; clients should not have to carry a key.

Private, not for the card: I think Alice's header plan is right long term and mine is the stopgap, but I have not said that yet.
