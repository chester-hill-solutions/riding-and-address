# Dataset id/year on responses; pin hard-fails; no dual-serve at launch

Every lookup response includes the boundary dataset id and year. Clients may pin a vintage; if that object is missing from R2 the API returns `DATASET_UNAVAILABLE`. Ops retains current plus prior major vintage on redistributions. Dual-serve of old and new boundaries is deferred.

**Considered:** Silent replace with no metadata (breaks trust); soft-fallback to current with a warning (hides pin failures); dual-serve windows (ops cost too high for v1).
