# Server keys hashed at rest; Browser keys remain public ids

Server keys (`sk_*`) are secrets: KV stores a hash (and metadata), and the raw secret is shown once at mint in the portal. Browser keys (`pk_*`) stay public identifiers with origin allowlists, matching the existing search/embed threat model.

**Considered:** Storing full `sk_*` in KV like `pk_*` (KV dump compromises all Server keys); encrypting blobs with a Worker secret (more rotation complexity for little gain over hashing).
