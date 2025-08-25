import { dirname } from 'path';
import { existsSync, readFileSync } from 'fs';
import { originUUID } from '../utils';
import type { Dialect } from './schemaValidator';

// Postgres-only imports
import { createDDL, type PostgresDDL } from '../dialects/postgres/ddl';
import { ddlDiffDry } from '../dialects/postgres/diff';
import type { PostgresSnapshot } from '../dialects/postgres/snapshot';
import type { JsonStatement } from '../dialects/postgres/statements';

export type BranchConflict = {
  parentId: string;
  parentPath?: string;
  branchA: { headId: string; path: string; statements: JsonStatement[] };
  branchB: { headId: string; path: string; statements: JsonStatement[] };
  reasons: string[];
};

export type NonCommutativityReport = {
  conflicts: BranchConflict[];
};

type SnapshotNode<TSnapshot extends { id: string; prevId: string }> = {
  id: string;
  prevId: string;
  path: string; // full path to snapshot.json
  folderPath: string; // folder containing snapshot.json
  raw: TSnapshot;
};

export const detectNonCommutative = async (
  snapshotsPaths: string[],
  dialect: Dialect,
): Promise<NonCommutativityReport> => {
 // temp solution for now, should remove it for other dialects
  if (dialect !== 'postgresql') {
    return { conflicts: [] };
  }

  const nodes = buildSnapshotGraph<PostgresSnapshot>(snapshotsPaths);

  const prevToChildren: Record<string, string[]> = {};
  for (const node of Object.values(nodes)) {
    const arr = prevToChildren[node.prevId] ?? [];
    arr.push(node.id);
    prevToChildren[node.prevId] = arr;
  }

  const conflicts: BranchConflict[] = [];

  // For each branching point (prevId with >1 children)
  for (const [prevId, childIds] of Object.entries(prevToChildren)) {
    if (childIds.length <= 1) continue;

    const parentNode = nodes[prevId];

    // For each child group, collect all leaf heads reachable from that child
    const childToLeaves: Record<string, string[]> = {};
    for (const childId of childIds) {
      childToLeaves[childId] = collectLeaves(nodes, childId);
    }

    // Precompute branch statements for each leaf from parent -> leaf
    const leafStatements: Record<string, { statements: JsonStatement[]; path: string }> = {};
    for (const leaves of Object.values(childToLeaves)) {
      for (const leafId of leaves) {
        const leafNode = nodes[leafId]!;
        const parentSnapshot = parentNode ? parentNode.raw : makeDryPostgresSnapshot();
        const { statements } = await diffPostgres(parentSnapshot, leafNode.raw);
        leafStatements[leafId] = { statements, path: leafNode.folderPath };
      }
    }

    // Compare only across different initial children
    for (let i = 0; i < childIds.length; i++) {
      for (let j = i + 1; j < childIds.length; j++) {
        const groupA = childToLeaves[childIds[i]] ?? [];
        const groupB = childToLeaves[childIds[j]] ?? [];
        for (const aId of groupA) {
          for (const bId of groupB) {
            const aStatements = leafStatements[aId]!.statements;
            const bStatements = leafStatements[bId]!.statements;
            // TODO: if there are >1 reasons then we need to make them as separate conflicts? Or make the first one and then show another?
            const reasons = explainConflicts(aStatements, bStatements);
            if (reasons.length > 0) {
              conflicts.push({
                parentId: prevId,
                parentPath: parentNode?.folderPath,
                branchA: { headId: aId, path: leafStatements[aId]!.path, statements: aStatements },
                branchB: { headId: bId, path: leafStatements[bId]!.path, statements: bStatements },
                reasons,
              });
            }
          }
        }
      }
    }
  }

  return { conflicts };
};

function buildSnapshotGraph<TSnapshot extends { id: string; prevId: string }>(
  snapshotFiles: string[],
): Record<string, SnapshotNode<TSnapshot>> {
  const byId: Record<string, SnapshotNode<TSnapshot>> = {};
  for (const file of snapshotFiles) {
    if (!existsSync(file)) continue;
    const raw = JSON.parse(readFileSync(file, 'utf8')) as TSnapshot;
    const node: SnapshotNode<TSnapshot> = {
      id: raw.id,
      prevId: raw.prevId,
      path: file,
      folderPath: dirname(file),
      raw,
    };
    byId[node.id] = node;
  }
  return byId;
}

function collectLeaves<TSnapshot extends { id: string; prevId: string }>(
  graph: Record<string, SnapshotNode<TSnapshot>>,
  startId: string,
): string[] {
  const leaves: string[] = [];
  const stack: string[] = [startId];
  // Build reverse edges prevId -> children lazily
  const prevToChildren: Record<string, string[]> = {};
  for (const node of Object.values(graph)) {
    const arr = prevToChildren[node.prevId] ?? [];
    arr.push(node.id);
    prevToChildren[node.prevId] = arr;
  }

  while (stack.length) {
    const id = stack.pop()!;
    const children = prevToChildren[id] ?? [];
    if (children.length === 0) {
      leaves.push(id);
    } else {
      for (const c of children) stack.push(c);
    }
  }
  return leaves;
}

async function diffPostgres(fromSnap: PostgresSnapshot | 'dry', toSnap: PostgresSnapshot): Promise<{ statements: JsonStatement[] }>
async function diffPostgres(fromSnap: PostgresSnapshot, toSnap: PostgresSnapshot): Promise<{ statements: JsonStatement[] }>
async function diffPostgres(fromSnap: any, toSnap: any): Promise<{ statements: JsonStatement[] }> {
  const fromDDL: PostgresDDL = createDDL();
  const toDDL: PostgresDDL = createDDL();

  if (fromSnap !== 'dry') {
    for (const e of fromSnap.ddl) fromDDL.entities.push(e);
  }
  for (const e of toSnap.ddl) toDDL.entities.push(e);

  const { statements } = await ddlDiffDry(fromDDL, toDDL, 'default');
  return { statements };
}

function makeDryPostgresSnapshot(): PostgresSnapshot {
  return {
    version: '8',
    dialect: 'postgres',
    id: originUUID,
    prevId: originUUID,
    ddl: [],
    renames: [],
  } as unknown as PostgresSnapshot;
}

// Conflict detection logic based on resource operations derived from JsonStatements

export const conflictRulesDescription: Record<string, string> = {
  'same-resource-different-op': 'Two different operations on the same resource are not commutative',
  'same-resource-same-op': 'Two identical operations on the same resource conflict (e.g., duplicate changes)',
  'table-drop-vs-child': 'Dropping a table conflicts with any operation on its columns, indexes, constraints, or policies',
};

type ResourceOp = {
  key: string; // resource key e.g., table:schema.name, column:schema.name.col
  type: 'table' | 'column' | 'index' | 'view' | 'enum' | 'sequence' | 'policy' | 'role' | 'privilege' | 'schema' | 'rls' | 'constraint';
  op: 'create' | 'drop' | 'alter' | 'rename' | 'recreate' | 'move' | 'grant' | 'revoke';
  raw: JsonStatement;
};

export function explainConflicts(a: JsonStatement[], b: JsonStatement[]): string[] {
  const opsA = flattenResourceOps(a);
  const opsB = flattenResourceOps(b);
  const reasons: string[] = [];

  // Direct same-resource conflicts
  const mapB = new Map<string, ResourceOp[]>();
  for (const op of opsB) {
    const list = mapB.get(op.key) ?? [];
    list.push(op);
    mapB.set(op.key, list);
  }

  for (const opA of opsA) {
    const hits = mapB.get(opA.key) ?? [];
    for (const opB of hits) {
      const rule = conflictRuleName(opA, opB);
      if (rule) {
        console.log('opA', opA)
        console.log('opB', opB)
        console.log('rule', rule)
        const desc = conflictRulesDescription[rule] ?? rule;
        reasons.push(`${desc}: ${renderOps(opA, opB)}`);
      }
    }
  }

  // Any movable resource was moved to another schema
  // if one of the branches moves the resource and another branch did anything with it(alter, delete, etc)
  // we need to handle it as conflic

  // Table drop vs child ops conflicts
  const tableDropsA = opsA.filter((o) => o.type === 'table' && o.op === 'drop');
  const tableDropsB = opsB.filter((o) => o.type === 'table' && o.op === 'drop');

  for (const drop of tableDropsA) {
    for (const child of opsB) {
      if (belongsToTable(child.key, drop.key)) {
        reasons.push(`${conflictRulesDescription['table-drop-vs-child']}: drop=${drop.key}, child=${child.key}`);
      }
    }
  }
  for (const drop of tableDropsB) {
    for (const child of opsA) {
      if (belongsToTable(child.key, drop.key)) {
        reasons.push(`${conflictRulesDescription['table-drop-vs-child']}: drop=${drop.key}, child=${child.key}`);
      }
    }
  }

  // Schema drop vs children
  const schemaDropsA = opsA.filter((o) => o.type === 'schema' && o.op === 'drop');
  const schemaDropsB = opsB.filter((o) => o.type === 'schema' && o.op === 'drop');
  for (const drop of schemaDropsA) {
    const schema = drop.key.substring('schema:'.length);
    for (const child of opsB) {
      if (belongsToSchema(child.key, schema)) {
        reasons.push(`Dropping a schema conflicts with operations on its entities: drop=${drop.key}, child=${child.key}`);
      }
    }
  }
  for (const drop of schemaDropsB) {
    const schema = drop.key.substring('schema:'.length);
    for (const child of opsA) {
      if (belongsToSchema(child.key, schema)) {
        reasons.push(`Dropping a schema conflicts with operations on its entities: drop=${drop.key}, child=${child.key}`);
      }
    }
  }

  return Array.from(new Set(reasons));
}

function renderOps(a: ResourceOp, b: ResourceOp): string {
  return `${a.key} (${a.op}) vs ${b.key} (${b.op})`;
}

function conflictRuleName(a: ResourceOp, b: ResourceOp): string | null {
  if (a.key !== b.key) return null;
  if (a.type !== b.type) return null;

  if (a.op !== b.op) return 'same-resource-different-op';
  return 'same-resource-same-op';
}

function belongsToTable(resourceKey: string, tableKey: string): boolean {
  // tableKey is like table:schema.name
  const base = tableKey.slice('table:'.length);
  return resourceKey.startsWith(`column:${base}.`)
    || resourceKey.startsWith(`index:${base.split('.')[0]}.`)
    || resourceKey.startsWith(`constraint:${base}.`);
}

function belongsToSchema(resourceKey: string, schema: string): boolean {
  return resourceKey.startsWith(`table:${schema}.`)
    || resourceKey.startsWith(`view:${schema}.`)
    || resourceKey.startsWith(`enum:${schema}.`)
    || resourceKey.startsWith(`sequence:${schema}.`)
    || resourceKey.startsWith(`index:${schema}.`)
    || resourceKey.startsWith(`pk:${schema}.`)
    || resourceKey.startsWith(`unique:${schema}.`)
    || resourceKey.startsWith(`fk:${schema}.`)
    || resourceKey.startsWith(`role:${schema}.`)
    || resourceKey.startsWith(`check:${schema}.`)
    || resourceKey.startsWith(`policy:${schema}.`);
}

function hashStatement(statement: JsonStatement): string {
  if (statement.type === 'drop_table'){
    return `${statement.table.schema}:${statement.table.name}`;
  }
  if (statement.type === 'add_column'){
    return `${statement.column.schema}:${statement.column.table}`;
  }
  return ''
}

function flattenResourceOps(statements: JsonStatement[]): ResourceOp[] {
  const res: ResourceOp[] = [];
  for (const st of statements) {
    switch (st.type) {
      case 'create_table':
        res.push({ key: tableKey(st.table.schema, st.table.name), type: 'table', op: 'create', raw: st });
        break;
      case 'drop_table':
        res.push({ key: tableKey(st.table.schema, st.table.name), type: 'table', op: 'drop', raw: st });
        break;
      case 'rename_table':
        res.push({ key: tableKey(st.schema, st.from), type: 'table', op: 'rename', raw: st });
        res.push({ key: tableKey(st.schema, st.to), type: 'table', op: 'rename', raw: st });
        break;
      case 'recreate_table':
        res.push({ key: tableKey(st.table.schema, st.table.name), type: 'table', op: 'recreate', raw: st });
        break;
      case 'move_table': {
        // Treat move as a drop from old schema and create in new schema for conflict detection
        res.push({ key: tableKey(st.from, st.name), type: 'table', op: 'drop', raw: st });
        res.push({ key: tableKey(st.to, st.name), type: 'table', op: 'create', raw: st });
        break;
      }
      case 'remove_from_schema': {
        res.push({ key: tableKey(st.schema, st.table), type: 'table', op: 'move', raw: st });
        break;
      }
      case 'set_new_schema': {
        res.push({ key: tableKey(st.from, st.table), type: 'table', op: 'move', raw: st });
        res.push({ key: tableKey(st.to, st.table), type: 'table', op: 'move', raw: st });
        break;
      }

      case 'add_column':
        res.push({ key: columnKey(st.column.schema, st.column.table, st.column.name), type: 'column', op: 'create', raw: st });
        break;
      case 'drop_column':
        res.push({ key: columnKey(st.column.schema, st.column.table, st.column.name), type: 'column', op: 'drop', raw: st });
        break;
      case 'rename_column':
        res.push({ key: columnKey(st.from.schema, st.from.table, st.from.name), type: 'column', op: 'rename', raw: st });
        res.push({ key: columnKey(st.to.schema, st.to.table, st.to.name), type: 'column', op: 'rename', raw: st });
        break;
      case 'alter_column': {
        const c = st.to;
        res.push({ key: columnKey(c.schema, c.table, c.name), type: 'column', op: 'alter', raw: st });
        break;
      }
      case 'recreate_column': {
        const c = st.column;
        res.push({ key: columnKey(c.schema, c.table, c.name), type: 'column', op: 'recreate', raw: st });
        break;
      }
      // Note: more granular alter_column_* statements are not part of JsonStatement union; handled via alter_column/recreate_column

      case 'create_index':
        res.push({ key: indexKeyBySchemaName(st.index.schema, st.index.name), type: 'index', op: 'create', raw: st });
        break;
      case 'drop_index':
        res.push({ key: indexKeyBySchemaName(st.index.schema, st.index.name), type: 'index', op: 'drop', raw: st });
        break;
      case 'rename_index':
        res.push({ key: indexKeyBySchemaName(st.schema, st.from), type: 'index', op: 'rename', raw: st });
        res.push({ key: indexKeyBySchemaName(st.schema, st.to), type: 'index', op: 'rename', raw: st });
        break;

      case 'add_pk':
        res.push({ key: constraintKey(st.pk.schema, st.pk.table, st.pk.name), type: 'constraint', op: 'create', raw: st });
        break;
      case 'drop_pk':
        res.push({ key: constraintKey(st.pk.schema, st.pk.table, st.pk.name), type: 'constraint', op: 'drop', raw: st });
        break;
      case 'alter_pk':
        res.push({ key: constraintKey(st.pk.schema, st.pk.table, st.pk.name), type: 'constraint', op: 'alter', raw: st });
        break;

      case 'add_unique':
        res.push({ key: constraintKey(st.unique.schema, st.unique.table, st.unique.name), type: 'constraint', op: 'create', raw: st });
        break;
      case 'drop_unique':
        res.push({ key: constraintKey(st.unique.schema, st.unique.table, st.unique.name), type: 'constraint', op: 'drop', raw: st });
        break;
      case 'alter_unique':
        res.push({ key: constraintKey((st as any).diff.schema, (st as any).diff.table, (st as any).diff.name), type: 'constraint', op: 'alter', raw: st });
        break;

      case 'create_fk':
      case 'drop_fk':
      case 'recreate_fk': {
        const fk = st.fk;
        const op = st.type === 'create_fk' ? 'create' : st.type === 'drop_fk' ? 'drop' : 'recreate';
        res.push({ key: constraintKey(fk.schema, fk.table, fk.name), type: 'constraint', op, raw: st });
        break;
      }

      case 'add_check':
        res.push({ key: constraintKey(st.check.schema, st.check.table, st.check.name), type: 'constraint', op: 'create', raw: st });
        break;
      case 'drop_check':
        res.push({ key: constraintKey(st.check.schema, st.check.table, st.check.name), type: 'constraint', op: 'drop', raw: st });
        break;
      case 'alter_check':
        res.push({ key: constraintKey(st.check.schema, st.check.table, st.check.name), type: 'constraint', op: 'alter', raw: st });
        break;

      case 'create_view':
        res.push({ key: viewKey(st.view.schema, st.view.name), type: 'view', op: 'create', raw: st });
        break;
      case 'drop_view':
        res.push({ key: viewKey(st.view.schema, st.view.name), type: 'view', op: 'drop', raw: st });
        break;
      case 'rename_view':
        res.push({ key: viewKey(st.from.schema, st.from.name), type: 'view', op: 'rename', raw: st });
        res.push({ key: viewKey(st.to.schema, st.to.name), type: 'view', op: 'rename', raw: st });
        break;
      case 'alter_view': {
        const v = st.view;
        res.push({ key: viewKey(v.schema, v.name), type: 'view', op: 'alter', raw: st });
        break;
      }
      case 'recreate_view': {
        const v = st.to;
        res.push({ key: viewKey(v.schema, v.name), type: 'view', op: 'recreate', raw: st });
        break;
      }
      case 'move_view': {
        // Treat move as a drop from old schema and create in new schema for conflict detection
        res.push({ key: viewKey(st.fromSchema, st.view.name), type: 'view', op: 'drop', raw: st });
        res.push({ key: viewKey(st.toSchema, st.view.name), type: 'view', op: 'create', raw: st });
        break;
      }

      case 'create_enum':
      case 'drop_enum':
      case 'rename_enum':
      case 'alter_enum':
      case 'recreate_enum': {
        const schema = (st as any).enum?.schema ?? (st as any).to?.schema ?? (st as any).schema;
        const name = (st as any).enum?.name ?? (st as any).to?.name ?? (st as any).from ?? (st as any).enum?.name;
        const op: ResourceOp['op'] = st.type === 'create_enum' ? 'create' : st.type === 'drop_enum' ? 'drop' : st.type === 'rename_enum' ? 'rename' : st.type === 'alter_enum' ? 'alter' : 'recreate';
        res.push({ key: enumKey(schema, name), type: 'enum', op, raw: st });
        break;
      }
      case 'move_enum': {
        // Treat move as a drop from old schema and create in new schema for conflict detection
        res.push({ key: enumKey(st.from.schema ?? 'public', st.from.name), type: 'enum', op: 'drop', raw: st as any });
        res.push({ key: enumKey(st.to.schema ?? 'public', st.to.name), type: 'enum', op: 'create', raw: st as any });
        break;
      }

      case 'create_sequence':
      case 'drop_sequence':
      case 'alter_sequence':
      case 'rename_sequence': {
        const seq = (st as any).sequence ?? (st as any).to ?? (st as any).from;
        const schema = seq?.schema ?? (st as any).to?.schema ?? (st as any).from?.schema ?? (st as any).diff?.schema;
        const name = seq?.name ?? (st as any).to?.name ?? (st as any).from?.name ?? (st as any).diff?.name;
        const op: ResourceOp['op'] = st.type === 'create_sequence' ? 'create' : st.type === 'drop_sequence' ? 'drop' : st.type === 'alter_sequence' ? 'alter' : st.type === 'rename_sequence' ? 'rename' : 'move';
        res.push({ key: sequenceKey(schema, name), type: 'sequence', op, raw: st });
        break;
      }
      case 'move_sequence': {
        // Treat move as a drop from old schema and create in new schema for conflict detection
        res.push({ key: sequenceKey(st.from.schema ?? 'public', st.from.name), type: 'sequence', op: 'drop', raw: st });
        res.push({ key: sequenceKey(st.to.schema ?? 'public', st.to.name), type: 'sequence', op: 'create', raw: st });
        break;
      }

      case 'create_policy':
      case 'drop_policy':
      case 'alter_policy':
      case 'rename_policy':
      case 'recreate_policy': {
        const pol = (st as any).policy ?? (st as any).to ?? (st as any).from;
        const schema = pol.schema;
        const table = pol.table;
        const name = pol.name;
        const op: ResourceOp['op'] = st.type === 'create_policy' ? 'create' : st.type === 'drop_policy' ? 'drop' : st.type === 'alter_policy' ? 'alter' : st.type === 'rename_policy' ? 'rename' : 'recreate';
        res.push({ key: policyKey(schema, table, name), type: 'policy', op, raw: st });
        break;
      }

      case 'alter_rls': {
        const schema = (st as any).schema;
        const name = (st as any).name;
        res.push({ key: tableKey(schema, name), type: 'table', op: 'alter', raw: st });
        break;
      }

      case 'rename_schema': {
        const from = (st as any).from?.name;
        const to = (st as any).to?.name;
        if (from) res.push({ key: schemaKey(from), type: 'schema', op: 'rename', raw: st });
        if (to) res.push({ key: schemaKey(to), type: 'schema', op: 'rename', raw: st });
        break;
      }

      case 'create_schema':
        res.push({ key: schemaKey((st as any).name), type: 'schema', op: 'create', raw: st });
        break;
      case 'drop_schema':
        res.push({ key: schemaKey((st as any).name), type: 'schema', op: 'drop', raw: st });
        break;

      case 'rename_role':
      case 'create_role':
      case 'drop_role':
      case 'alter_role': {
        const role = (st as any).role ?? (st as any).to ?? (st as any).from;
        const name = role?.name ?? (st as any).to?.name ?? (st as any).from?.name;
        const op: ResourceOp['op'] = st.type === 'create_role' ? 'create' : st.type === 'drop_role' ? 'drop' : st.type === 'alter_role' ? 'alter' : 'rename';
        res.push({ key: roleKey(name), type: 'role', op, raw: st });
        break;
      }

      case 'grant_privilege':
        res.push({ key: privilegeKey(st.privilege.schema, st.privilege.table, st.privilege.type, st.privilege.grantee), type: 'privilege', op: 'grant', raw: st });
        break;
      case 'revoke_privilege':
        res.push({ key: privilegeKey(st.privilege.schema, st.privilege.table, st.privilege.type, st.privilege.grantee), type: 'privilege', op: 'revoke', raw: st });
        break;
      case 'regrant_privilege':
        res.push({ key: privilegeKey(st.privilege.schema, st.privilege.table, st.privilege.type, st.privilege.grantee), type: 'privilege', op: 'alter', raw: st });
        break;

      case 'rename_constraint': {
        res.push({ key: constraintKey(st.schema, st.table, st.from), type: 'constraint', op: 'drop', raw: st });
        res.push({ key: constraintKey(st.schema, st.table, st.to), type: 'constraint', op: 'create', raw: st });
        break;
      }

      default:
        break;
    }
  }
  return res;
}

const tableKey = (schema: string, name: string) => `table:${schema}.${name}`;
const columnKey = (schema: string, table: string, column: string) => `column:${schema}.${table}.${column}`;
const indexKeyBySchemaName = (schema: string, name: string) => `index:${schema}.${name}`;
const viewKey = (schema: string, name: string) => `view:${schema}.${name}`;
const enumKey = (schema: string, name: string) => `enum:${schema}.${name}`;
const sequenceKey = (schema: string, name: string) => `sequence:${schema}.${name}`;
const policyKey = (schema: string, table: string, name: string) => `policy:${schema}.${table}.${name}`;
const schemaKey = (name: string) => `schema:${name}`;
const roleKey = (name: string) => `role:${name}`;
const privilegeKey = (schema: string | null, table: string | null, type: string, grantee: string) => `privilege:${schema ?? '*'}.${table ?? '*'}.${type}.${grantee}`;
const constraintKey = (schema: string, table: string, name: string) => `constraint:${schema}.${table}.${name}`; 