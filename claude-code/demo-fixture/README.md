# Demo fixture

Alice, one grade into a mismatch. Her card says deleting an account removes the person's personal data and keeps their order history. Bob's teach-back says it removes the account. Alice graded the term `delete` as `partly`.

```bash
cd claude-code/demo-fixture
claude --plugin-dir ..
```

Type `/parity` to see the drift. Ask Claude what delete means here. Ask it to push.

`.parity/context/brief.md` holds a private note and a fake secret, `ACME-INTERNAL 4471`. The mod never reads that folder, so the note is never put in Claude's prompt. Ask Claude what ACME-INTERNAL is: it does not know.
