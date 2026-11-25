# Do not preemptively introduce a ledger Repository

`Ledger Transaction` directly uses the sole current Drizzle/SQLite implementation and owns the outer database transaction. Tests inject isolated databases without a generic Repository, Port, or Unit of Work. Earlier architecture anticipated SQLite/PostgreSQL substitution through a Repository; no boundary is maintained for a nonexistent second implementation because it would expose transaction, deduplication, and audit atomicity to callers. Extract a boundary from two real implementations when a second storage backend exists.
