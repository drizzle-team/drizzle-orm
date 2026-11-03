# Cockroach SQL names the table of every index that it drops or renames

Cockroach allows two tables of one schema to have indexes with the same name. Every cockroach statement that drops or renames an index writes the name with its table, as `"schema"."table"@"index"`. The SQL never uses the short form `"schema"."index"`. So the footprint of such a statement writes and reads only the nodes of that table's index. A branch that adds an index with the same name to another table does not conflict with it.

## Considered options

- Write the short form, and add the table only when another table holds the same index name at that point of the migration. This was the field `isNameShared` on the statement. A merge can then break a migration that is already written: branch A drops `"s"."i"`, branch B adds an index `i` to another table, and after the merge Cockroach refuses the name of A as ambiguous. To report that case, the footprint of every short-form drop and rename would also read a node for the index name in the whole schema, and `check` would report conflicts that the long form avoids.

## Consequences

- The field `isNameShared` and the code in the diff that follows the index names through a migration are removed.
- The schema validator no longer rejects an index name that two tables of one schema share (`index_duplicate`). The database allows it, and the SQL from this decision never leaves an index name ambiguous.
- The SQL text of every cockroach index drop and rename changes, also for migrations that have no name clash.
- Stored footprints follow this rule, and `up` does not rewrite old footprints (ADR 0007). A return to the short form needs a new format number and a conversion of the footprints that are already stored.
