## @weweb/drizzle-kit

This is a WeWeb fork of Drizzle Kit that exposes PostgreSQL-specific programmatic APIs for database introspection and non-blocking migration generation.

**Original Repository**: [drizzle-team/drizzle-orm](https://github.com/drizzle-team/drizzle-orm)
**Fork Repository**: [weweb-team/drizzle-orm](https://github.com/weweb-team/drizzle-orm)

### What's Different?

This fork provides:

1. **PostgreSQL-only API** - Removed MySQL, SQLite, and SingleStore to simplify
2. **Database introspection API** - Introspect live databases programmatically
3. **Non-blocking conflict resolution** - Migrations throw errors for conflicts instead of blocking on CLI prompts
4. **Web-friendly iterative workflow** - Resolve conflicts one at a time via your own UI

Perfect for:
- Comparing two live databases
- Building web-based migration tools
- Database schema diffing services
- Non-interactive CI/CD pipelines

### Installation

```bash
npm install @weweb/drizzle-kit
```

### New API Exports

```typescript
import {
  // Core functions
  introspectPostgres,
  generateMigration,
  generateDrizzleJson,
  pushSchema,
  upPgSnapshot,

  // Types
  type DB,
  type PgSchemaInternal,
  type DrizzleSnapshotJSON,
  type AllDecisions,
  type ResolutionDecision,
  type ColumnsResolutionDecision,

  // Error class
  ConflictNeedsResolutionError,

  // Constants
  originUUID,
} from '@weweb/drizzle-kit/api';
```

---

## Usage Examples

### Example 1: Non-Interactive Migration (No Conflicts)

Generate migrations without any user input. All ambiguous changes are treated as create/delete (no renames).

```typescript
import { Pool } from 'pg';
import {
  introspectPostgres,
  generateMigration,
  originUUID,
  type DB
} from '@weweb/drizzle-kit/api';

const pool1 = new Pool({ connectionString: 'postgresql://localhost:5432/db1' });
const pool2 = new Pool({ connectionString: 'postgresql://localhost:5432/db2' });

const db1: DB = {
  query: async (sql: string, params?: any[]) => {
    const res = await pool1.query(sql, params);
    return res.rows;
  }
};

const db2: DB = {
  query: async (sql: string, params?: any[]) => {
    const res = await pool2.query(sql, params);
    return res.rows;
  }
};

// Introspect both databases
const schema1Internal = await introspectPostgres(db1, () => true, []);
const schema2Internal = await introspectPostgres(db2, () => true, []);

const schema1 = { id: originUUID, prevId: '', ...schema1Internal };
const schema2 = { id: originUUID, prevId: '', ...schema2Internal };

// Generate migration (no decisions = assumes all create/delete, no renames)
const sqlStatements = await generateMigration(schema1, schema2);

console.log('Migration SQL:', sqlStatements);

await pool1.end();
await pool2.end();
```

---

### Example 2: Interactive Migration with Conflict Resolution

Handle conflicts iteratively by catching errors and providing resolutions.

```typescript
import {
  introspectPostgres,
  generateMigration,
  ConflictNeedsResolutionError,
  originUUID,
  type DB,
  type AllDecisions
} from '@weweb/drizzle-kit/api';

async function generateMigrationWithResolution(schema1, schema2) {
  const decisions: AllDecisions = {};

  while (true) {
    try {
      // Try to generate migration
      const sqlStatements = await generateMigration(schema1, schema2, decisions);

      // Success! No more conflicts
      console.log('Migration generated successfully!');
      return sqlStatements;

    } catch (error) {
      if (error instanceof ConflictNeedsResolutionError) {
        console.log(`Conflict in ${error.stage}:`, error.conflict);

        // Ask user to resolve
        const resolution = await askUserInYourUI(error);

        // Store the decision
        if (error.context?.tableName) {
          // Column or policy conflict (table-specific)
          if (!decisions[error.stage as keyof AllDecisions]) {
            decisions[error.stage as keyof AllDecisions] = [] as any;
          }
          (decisions[error.stage as keyof AllDecisions] as any[]).push({
            tableName: error.context.tableName,
            schema: error.context.schema,
            ...resolution
          });
        } else {
          // Table, schema, enum, etc. conflict
          decisions[error.stage as keyof AllDecisions] = resolution as any;
        }

        // Retry with the new decision
        continue;
      }

      // Some other error
      throw error;
    }
  }
}

// Example user resolution function
async function askUserInYourUI(error: ConflictNeedsResolutionError) {
  const { stage, conflict, context } = error;

  // Show in your web UI
  const answer = await showConflictDialog({
    message: context?.tableName
      ? `In table ${context.tableName}: resolve conflict`
      : `Resolve ${stage} conflict`,
    created: conflict.created,
    deleted: conflict.deleted,
  });

  // answer could be:
  // { created: [item], deleted: [item], renamed: [] } // Create + delete
  // { created: [], deleted: [], renamed: [{ from: item, to: item }] } // Rename

  return answer;
}
```

---

### Example 3: Backend API Endpoint

Implement a stateful migration API for your web application:

```typescript
// Express/Fastify endpoint
app.post('/api/migration/step', async (req, res) => {
  const { schema1, schema2, decisions } = req.body;

  try {
    const sql = await generateMigration(schema1, schema2, decisions);

    // Done! Return final SQL
    return res.json({
      done: true,
      sql: sql,
    });

  } catch (error) {
    if (error instanceof ConflictNeedsResolutionError) {
      // Need user input
      return res.json({
        done: false,
        question: {
          stage: error.stage,
          created: error.conflict.created,
          deleted: error.conflict.deleted,
          context: error.context,
        },
      });
    }

    throw error;
  }
});
```

Client-side flow:

```typescript
async function generateMigrationIteratively(schema1, schema2) {
  let decisions = {};

  while (true) {
    const response = await fetch('/api/migration/step', {
      method: 'POST',
      body: JSON.stringify({ schema1, schema2, decisions }),
    }).then(r => r.json());

    if (response.done) {
      return response.sql;
    }

    // Show question in UI
    const userAnswer = await showDialog(response.question);

    // Add to decisions
    if (response.question.context?.tableName) {
      if (!decisions[response.question.stage]) {
        decisions[response.question.stage] = [];
      }
      decisions[response.question.stage].push({
        tableName: response.question.context.tableName,
        schema: response.question.context.schema,
        ...userAnswer
      });
    } else {
      decisions[response.question.stage] = userAnswer;
    }
  }
}
```

---

### Example 4: Understanding Conflicts

When a conflict is thrown, you get this information:

```typescript
try {
  await generateMigration(schema1, schema2);
} catch (error) {
  if (error instanceof ConflictNeedsResolutionError) {
    console.log('Stage:', error.stage);          // 'tables', 'columns', 'enums', etc.
    console.log('Created:', error.conflict.created);  // Items in schema2
    console.log('Deleted:', error.conflict.deleted);  // Items missing from schema1
    console.log('Context:', error.context);       // { tableName, schema } for column/policy conflicts

    // Example conflict:
    // {
    //   stage: 'tables',
    //   conflict: {
    //     created: [{ name: 'customers', schema: 'public', ... }],
    //     deleted: [{ name: 'users', schema: 'public', ... }]
    //   },
    //   context: undefined
    // }

    // User must decide:
    // Option A: Create 'customers', Delete 'users'
    const resolution = {
      created: error.conflict.created,
      deleted: error.conflict.deleted,
      renamed: []
    };

    // Option B: Rename 'users' to 'customers'
    const resolution = {
      created: [],
      deleted: [],
      renamed: [{
        from: error.conflict.deleted[0],
        to: error.conflict.created[0]
      }]
    };
  }
}
```

---

## API Reference

### `introspectPostgres(db, tablesFilter?, schemaFilters?, entities?, progressCallback?)`

Introspects a PostgreSQL database and returns its schema.

- `db`: Database query interface `{ query: (sql, params?) => Promise<any[]> }`
- `tablesFilter`: Optional function to filter tables (default: `() => true`)
- `schemaFilters`: Array of schema names (empty = all schemas)
- `entities`: Optional entity filters for roles
- `progressCallback`: Optional progress callback

Returns: `Promise<PgSchemaInternal>`

### `generateMigration(prev, cur, decisions?)`

Generates SQL migration statements to transform `prev` schema into `cur` schema.

- `prev`: Source schema (`DrizzleSnapshotJSON`)
- `cur`: Target schema (`DrizzleSnapshotJSON`)
- `decisions`: Optional conflict resolutions (`AllDecisions`)

Returns: `Promise<string[]>` - Array of SQL statements

**Throws:** `ConflictNeedsResolutionError` when a conflict needs user input

**Behavior without decisions:**
- Treats all conflicts as create + delete (no renames)
- Safe but may lose data (e.g., drops and recreates tables)

**Behavior with decisions:**
- Applies user-provided resolutions
- Preserves data through renames when specified
- Throws for any unresolved conflicts

### `ConflictNeedsResolutionError`

Error thrown when a migration conflict requires user decision.

**Properties:**
- `code`: `'CONFLICT_NEEDS_RESOLUTION'` (string constant)
- `stage`: Stage name (`'schemas'`, `'enums'`, `'sequences'`, `'roles'`, `'tables'`, `'columns'`, `'policies'`, `'indPolicies'`, `'views'`)
- `conflict`: `{ created: any[], deleted: any[] }`
- `context`: `{ tableName?: string, schema?: string }` (for column/policy conflicts)

### Resolution Decision Types

```typescript
interface ResolutionDecision {
  created?: any[];      // Items to create
  deleted?: any[];      // Items to delete
  renamed?: Array<{     // Items that were renamed
    from: any;
    to: any;
  }>;
  moved?: Array<{       // Items moved between schemas
    name: string;
    schemaFrom: string;
    schemaTo: string;
  }>;
}

interface ColumnsResolutionDecision {
  tableName: string;    // Table this resolution applies to
  schema: string;       // Schema this resolution applies to
  created?: any[];
  deleted?: any[];
  renamed?: Array<{ from: any; to: any }>;
}

interface AllDecisions {
  schemas?: ResolutionDecision;
  enums?: ResolutionDecision;
  sequences?: ResolutionDecision;
  roles?: ResolutionDecision;
  tables?: ResolutionDecision;
  columns?: ColumnsResolutionDecision[];          // Array for per-table decisions
  policies?: ColumnsResolutionDecision[];         // Array for per-table decisions
  indPolicies?: ResolutionDecision;
  views?: ResolutionDecision;
}
```

---

## Breaking Changes in v0.32.0

This version contains breaking changes:

1. **PostgreSQL-only API** - All MySQL, SQLite, and SingleStore functions removed
2. **generateMigration signature changed** - Now accepts optional `decisions` parameter
3. **Non-blocking by default** - No CLI prompts; throws `ConflictNeedsResolutionError` instead

### Migration Guide

**Before (v0.31.x):**
```typescript
// Multiple database support
import { introspectMySQL } from '@weweb/drizzle-kit/api';  // ❌ Removed

// Blocking interactive migration
const sql = await generateMigration(schema1, schema2);  // ❌ Would block on prompts
```

**After (v0.32.x):**
```typescript
// PostgreSQL only
import { introspectPostgres } from '@weweb/drizzle-kit/api';  // ✅

// Non-blocking with conflict handling
try {
  const sql = await generateMigration(schema1, schema2, decisions);  // ✅
} catch (error) {
  if (error instanceof ConflictNeedsResolutionError) {
    // Handle conflict
  }
}
```

---

## Original Drizzle Kit Documentation

Drizzle Kit is a CLI migrator tool for Drizzle ORM. It is probably the one and only tool that lets you completely automatically generate SQL migrations and covers ~95% of the common cases like deletions and renames by prompting user input.

Check the full documentation on [the website](https://orm.drizzle.team/kit-docs/overview).
