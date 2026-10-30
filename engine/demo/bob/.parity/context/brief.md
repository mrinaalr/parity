# Bob's private brief: deleting accounts

The August audit turned up one closed account's details in six systems. Cleanup is manual, and each system does it its own way.

My plan: a single job that hard deletes anything carrying the account id, everywhere, once a 30-day undo period ends. Easy to reason about and easy to audit.

To me, delete means the account is gone along with everything attached to it. A row with that id goes.

Private, not for the card: I have not asked finance whether orders can go. I am assuming yes.
