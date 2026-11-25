# Do not fabricate legacy confirmation history

When revisions and confirmation audit are introduced, each existing transaction receives only a `legacy_snapshot` of current state. Its original creation time remains, but the revision is recorded at migration time with null actor, confirmation identity, and duplicate override. Old imports and screenshot tasks do not reconstruct confirmation history. Explicitly missing history is safer than a seemingly complete but unprovable audit chain. Queries and UI must clearly distinguish the different historical completeness before and after migration.
