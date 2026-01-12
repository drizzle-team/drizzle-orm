import { eq, sql } from 'drizzle-orm';
import {
	AnyPgColumn,
	bigint,
	bigserial,
	boolean,
	char,
	check,
	decimal,
	doublePrecision,
	foreignKey,
	index,
	inet,
	integer,
	interval,
	jsonb,
	numeric,
	pgEnum,
	pgPolicy,
	pgSchema,
	pgSequence,
	primaryKey,
	serial,
	smallint,
	text,
	timestamp,
	unique,
	uniqueIndex,
	uuid,
} from 'drizzle-orm/pg-core';

// generated with AI and updated manually in some places

export const core = pgSchema('core');
export const analytics = pgSchema('analytics');
export const billing = pgSchema('billing');
export const monitoring = pgSchema('monitoring');
export const alertAction = pgEnum('alert_action', ['email', 'pagerd/ut"\'y', 'slack', 'webhook']);
export const currencyCode = pgEnum('currency_code', ['USD', 'EUR', 'GBP', 'UAH', 'JPY']);
export const datasetVisibility = pgEnum('dataset_visibility', ['priv"ate', 'team', 'public']);
export const env = pgEnum('env', ['dev', 'staging', 'prod']);
export const featureState = pgEnum('feature_state', ['enabled', 'disabled', 'gradual']);
export const invoiceStatus = pgEnum('invoice_status', ['draft', "iss'ued", 'paid', 'voided', 'failed']);
export const jobState = pgEnum('job_state', ['queued', 'running', 'success', 'failed', 'cancelled']);
export const notificationChannel = pgEnum('notification_channel', ['email', 'sms', 'in_app', 'webhook']);
export const paymentMethod = pgEnum('payment_method', ['card', 'bank_transfer', 'paypal', 'crypto']);
export const pipelineStatus = pgEnum('pipeline_status', ['created', 'running', 'paused', 'completed', 'errored']);
export const roleKind = pgEnum('role_kind', ['system', 'custom']);
export const ruleConditionOperator = pgEnum('rule_condition_operator', [
	'eq',
	'neq',
	'gt',
	'lt',
	'gte',
	'lte',
	'in',
	'nin',
]);
export const severityLevel = pgEnum('severity_level', ['low', 'medium', 'high', 'critical']);
export const userStatus = pgEnum('user_status', ['active', 'inactive', 'suspended', 'pending']);

export const seqOrgCode = pgSequence('seq_org_code', {
	startWith: '1000',
	increment: '1',
	minValue: '1',
	maxValue: '9223372036854775807',
	cache: '1',
	cycle: false,
});

export const organizationsInCore = core.table('organizations', {
	id: uuid().defaultRandom().primaryKey().notNull(),
	code: bigint({ mode: 'number' }).default(sql`nextval('seq_org_code'::regclass)`).notNull(),
	name: text().notNull(),
	domain: text(),
	currency: currencyCode().default('EUR').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index('core_org_name_idx').using('btree', table.name.asc().nullsLast().op('text_ops')),
	index('organizations_code_idx').using('btree', table.code.asc().nullsLast().op('int8_ops')),
	unique('organizations_domain_key').on(table.domain),
	check('organizations_name_check', sql`char_length(name) > 1`),
]);

export const usersInCore = core.table('users', {
	id: uuid().defaultRandom().primaryKey().notNull(),
	organizationId: uuid('organization_id').notNull(),
	username: text().notNull(),
	status: userStatus().default('pending').notNull(),
	locale: text().default('en-US').notNull(),
	lastLogin: timestamp('last_login', { withTimezone: true, mode: 'string' }),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	bio: text().$onUpdate(() => sql`bio || 'some test'`),
	profile: jsonb(),
}, (table) => [
	index('core_users_username_idx').using(
		'btree',
		table.organizationId.asc().nullsLast(),
		table.username.asc().nullsLast().op('text_ops'),
	),
	foreignKey({
		columns: [table.organizationId],
		foreignColumns: [organizationsInCore.id],
		name: 'users_organization_id_fkey',
	}).onDelete('cascade'),
	unique('users_org_username_unique').on(table.organizationId, table.username),
]);

export const rolesInCore = core.table('roles', {
	id: serial().primaryKey().notNull(),
	organizationId: uuid('organization_id').notNull().references(() => organizationsInCore.id, { onDelete: 'cascade' }),
	name: text().notNull(),
	kind: roleKind().default('custom').notNull(),
	builtin: boolean().default(false).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique('roles_organization_id_name_key').on(table.organizationId, table.name),
]);

export const permissionsInCore = core.table('permissions', {
	id: serial().primaryKey().notNull(),
	code: text().notNull().unique(),
	description: text(),
});

export const membershipsInCore = core.table('memberships', {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid('user_id').notNull(),
	roleId: integer('role_id').notNull(),
	organizationId: uuid('organization_id').notNull(),
	joinedAt: timestamp('joined_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	active: boolean().default(true).notNull(),
}, (table) => [
	foreignKey({
		columns: [table.userId],
		foreignColumns: [usersInCore.id],
		name: 'memberships_user_id_fkey',
	}).onDelete('cascade'),
	foreignKey({
		columns: [table.roleId],
		foreignColumns: [rolesInCore.id],
		name: 'memberships_role_id_fkey',
	}).onDelete('set null'),
	foreignKey({
		columns: [table.organizationId],
		foreignColumns: [organizationsInCore.id],
		name: 'memberships_organization_id_fkey',
	}).onDelete('cascade'),
	unique('unique_membership').on(table.userId, table.organizationId),
]);

export const apiKeysInCore = core.table('api_keys', {
	id: uuid().defaultRandom().primaryKey().notNull(),
	organizationId: uuid('organization_id'),
	userId: uuid('user_id'),
	name: text().notNull(),
	keyHash: text('key_hash').notNull(),
	revoked: boolean().default(false).notNull(),
	expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }),
	metadata: jsonb().generatedAlwaysAs(sql`'{"some":"test"}'`),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index('core_apikey_org_idx').using('btree', table.organizationId.asc().nullsLast().op('uuid_ops')).where(
		sql`(revoked = false)`,
	),
	foreignKey({
		columns: [table.organizationId],
		foreignColumns: [organizationsInCore.id],
		name: 'api_keys_organization_id_fkey',
	}).onDelete('cascade'),
	foreignKey({
		columns: [table.userId],
		foreignColumns: [usersInCore.id],
		name: 'api_keys_user_id_fkey',
	}).onDelete('set null'),
	unique('api_keys_organization_id_name_key').on(table.organizationId, table.name),
]);

export const sessionsInCore = core.table('sessions', {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid('user_id').notNull(),
	ip: inet(),
	userAgent: text('user_agent'),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
	active: boolean().default(true).notNull(),
}, (table) => [
	index('core_sessions_user_expires').using(
		'btree',
		table.userId.asc().nullsLast(),
		table.expiresAt.asc().nullsLast().op('timestamptz_ops'),
	),
	foreignKey({
		columns: [table.userId],
		foreignColumns: [usersInCore.id],
		name: 'sessions_user_id_fkey',
	}).onDelete('cascade'),
]);

export const oauthProvidersInCore = core.table('oauth_providers', {
	id: serial().primaryKey().notNull(),
	organizationId: uuid('organization_id').notNull(),
	provider: text().notNull(),
	clientId: text('client_id').notNull(),
	clientSecret: text('client_secret').notNull(),
	config: jsonb(),
}, (table) => [
	foreignKey({
		columns: [table.organizationId],
		foreignColumns: [organizationsInCore.id],
		name: 'oauth_providers_organization_id_fkey',
	}).onDelete('cascade'),
	unique('oauth_providers_organization_id_provider_key').on(table.organizationId, table.provider),
]);

export const featureFlagsInCore = core.table('feature_flags', {
	id: uuid().defaultRandom().primaryKey().notNull(),
	organizationId: uuid('organization_id').notNull(),
	key: text().notNull(),
	description: text(),
	state: featureState().default('disabled').notNull(),
	rolloutPercent: smallint('rollout_percent').default(0),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
		columns: [table.organizationId],
		foreignColumns: [organizationsInCore.id],
		name: 'feature_flags_organization_id_fkey',
	}).onDelete('cascade'),
	unique('feature_flags_organization_id_key_key').on(table.organizationId, table.key),
	check('feature_flags_rollout_percent_check', sql`(rollout_percent >= 0) AND (rollout_percent <= 100)`),
]);

export const projectsInCore = core.table('projects', {
	id: uuid().defaultRandom().primaryKey().notNull(),
	organizationId: uuid('organization_id').notNull(),
	name: text().notNull(),
	slug: text().notNull(),
	description: text(),
	visibility: datasetVisibility().default('priv"ate').notNull(),
	createdBy: uuid('created_by'),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index('core_projects_org_name_idx').using(
		'btree',
		table.organizationId.asc().nullsLast(),
		table.name.asc().nullsLast().op('text_ops'),
	),
	foreignKey({
		columns: [table.organizationId],
		foreignColumns: [organizationsInCore.id],
		name: 'projects_organization_id_fkey',
	}).onDelete('cascade'),
	foreignKey({
		columns: [table.createdBy],
		foreignColumns: [usersInCore.id],
		name: 'projects_created_by_fkey',
	}),
	unique('projects_org_slug_unique').on(table.organizationId, table.slug),
]);

export const repositoriesInCore = core.table('repositories', {
	id: uuid().defaultRandom().primaryKey().notNull(),
	projectId: uuid('project_id').notNull(),
	provider: text().notNull(),
	repoOwner: text('repo_owner').notNull(),
	repoName: text('repo_name').notNull(),
	defaultBranch: text('default_branch').default('main').notNull(),
	cloneUrl: text('clone_url'),
}, (table) => [
	foreignKey({
		columns: [table.projectId],
		foreignColumns: [projectsInCore.id],
		name: 'repositories_project_id_fkey',
	}).onDelete('cascade'),
	unique('repositories_project_id_provider_repo_owner_repo_name_key').on(
		table.projectId,
		table.provider,
		table.repoOwner,
		table.repoName,
	),
]);

export const buildsInCore = core.table('builds', {
	id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
	projectId: uuid('project_id').notNull(),
	triggeredBy: uuid('triggered_by'),
	commitSha: char('commit_sha', { length: 40 }).notNull(),
	status: pipelineStatus().default('created').notNull(),
	startedAt: timestamp('started_at', { withTimezone: true, mode: 'string' }),
	finishedAt: timestamp('finished_at', { withTimezone: true, mode: 'string' }),
	metadata: jsonb(),
}, (table) => [
	index('core_builds_project_status_idx').using(
		'btree',
		table.projectId.asc().nullsLast().op('uuid_ops'),
		table.status.asc().nullsLast(),
	),
	foreignKey({
		columns: [table.projectId],
		foreignColumns: [projectsInCore.id],
		name: 'builds_project_id_fkey',
	}).onDelete('cascade'),
	foreignKey({
		columns: [table.triggeredBy],
		foreignColumns: [usersInCore.id],
		name: 'builds_triggered_by_fkey',
	}),
	unique('builds_project_id_commit_sha_key').on(table.projectId, table.commitSha),
]);

export const pipelinesInCore = core.table('pipelines', {
	id: uuid().defaultRandom().primaryKey().notNull(),
	projectId: uuid('project_id').notNull(),
	name: text().notNull(),
	spec: jsonb().notNull(),
	status: pipelineStatus().default('created').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
		columns: [table.projectId],
		foreignColumns: [projectsInCore.id],
		name: 'pipelines_project_id_fkey',
	}).onDelete('cascade'),
	unique('pipelines_project_id_name_key').on(table.projectId, table.name),
]);

export const pipelineRunsInAnalytics = analytics.table('pipeline_runs', {
	id: uuid().defaultRandom().primaryKey().notNull(),
	pipelineId: uuid('pipeline_id').notNull(),

	runNumber: bigint('run_number', { mode: 'number' }).notNull(),
	state: jobState().default('queued').notNull(),
	startedAt: timestamp('started_at', { withTimezone: true, mode: 'string' }),
	finishedAt: timestamp('finished_at', { withTimezone: true, mode: 'string' }),
	logs: text(),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index('analytics_pipeline_runs_state_idx').using('btree', table.state.asc().nullsLast().op('enum_ops')),
	foreignKey({
		columns: [table.pipelineId],
		foreignColumns: [pipelinesInCore.id],
		name: 'pipeline_runs_pipeline_id_fkey',
	}).onDelete('cascade'),
	unique('pipeline_runs_unique_run').on(table.pipelineId, table.runNumber),
]);

export const jobsInAnalytics = analytics.table('jobs', {
	id: uuid().defaultRandom().primaryKey().notNull(),
	pipelineRunId: uuid('pipeline_run_id'),
	name: text().notNull(),
	state: jobState().default('queued').notNull(),
	attempts: integer().default(0).notNull(),
	lastError: text('last_error'),
	startedAt: timestamp('started_at', { withTimezone: true, mode: 'string' }),
	finishedAt: timestamp('finished_at', { withTimezone: true, mode: 'string' }),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index('analytics_jobs_state_attempts_idx').using(
		'btree',
		table.state.asc().nullsLast(),
		table.attempts.asc().nullsLast().op('int4_ops'),
	),
	foreignKey({
		columns: [table.pipelineRunId],
		foreignColumns: [pipelineRunsInAnalytics.id],
		name: 'jobs_pipeline_run_id_fkey',
	}).onDelete('cascade'),
]);

export const storageBucketsInCore = core.table('storage_buckets', {
	id: uuid().defaultRandom().primaryKey().notNull(),
	organizationId: uuid('organization_id').notNull(),
	name: text().notNull(),
	region: text().notNull(),
	config: jsonb(),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
		columns: [table.organizationId],
		foreignColumns: [organizationsInCore.id],
		name: 'storage_buckets_organization_id_fkey',
	}).onDelete('cascade'),
	unique('storage_buckets_organization_id_name_key').on(table.organizationId, table.name),
]);

export const objectsInCore = core.table('objects', {
	id: uuid().defaultRandom().primaryKey().notNull(),
	bucketId: uuid('bucket_id').notNull(),
	path: text().notNull(),

	size: bigint({ mode: 'number' }).default(0).notNull(),
	contentType: text('content_type'),
	metadata: jsonb(),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index('core_objects_bucket_path_gin').using('gin', table.metadata.asc().nullsLast().op('jsonb_ops')),
	foreignKey({
		columns: [table.bucketId],
		foreignColumns: [storageBucketsInCore.id],
		name: 'objects_bucket_id_fkey',
	}).onDelete('cascade'),
	unique('objects_bucket_id_path_key').on(table.bucketId, table.path),
]);

export const filesInCore = core.table('files', {
	id: uuid().defaultRandom().primaryKey().notNull(),
	projectId: uuid('project_id'),
	name: text().notNull(),
	latestObjectId: uuid('latest_object_id'),
	createdBy: uuid('created_by'),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
		columns: [table.projectId],
		foreignColumns: [projectsInCore.id],
		name: 'files_project_id_fkey',
	}).onDelete('cascade'),
	foreignKey({
		columns: [table.latestObjectId],
		foreignColumns: [objectsInCore.id],
		name: 'files_latest_object_id_fkey',
	}).onDelete('set null'),
	foreignKey({
		columns: [table.createdBy],
		foreignColumns: [usersInCore.id],
		name: 'files_created_by_fkey',
	}),
	unique('files_project_id_name_key').on(table.projectId, table.name),
]);

export const fileVersionsInCore = core.table('file_versions', {
	id: uuid().defaultRandom().primaryKey().notNull(),
	fileId: uuid('file_id').notNull(),
	objectId: uuid('object_id').notNull(),
	versionNumber: integer('version_number').notNull(),
	checksum: text(),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
		columns: [table.fileId],
		foreignColumns: [filesInCore.id],
		name: 'file_versions_file_id_fkey',
	}).onDelete('cascade'),
	foreignKey({
		columns: [table.objectId],
		foreignColumns: [objectsInCore.id],
		name: 'file_versions_object_id_fkey',
	}).onDelete('cascade'),
	unique('file_versions_file_id_version_number_key').on(table.fileId, table.versionNumber),
]);

export const tagsInCore = core.table('tags', {
	id: serial().primaryKey().notNull(),
	organizationId: uuid('organization_id').notNull(),
	key: text().notNull(),
	value: text(),
}, (table) => [
	foreignKey({
		columns: [table.organizationId],
		foreignColumns: [organizationsInCore.id],
		name: 'tags_organization_id_fkey',
	}).onDelete('cascade'),
	unique('tags_organization_id_key_value_key').on(table.organizationId, table.key, table.value),
]);

export const conversationsInCore = core.table('conversations', {
	id: uuid().defaultRandom().primaryKey().notNull(),
	projectId: uuid('project_id'),
	title: text(),
	createdBy: uuid('created_by'),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
		columns: [table.projectId],
		foreignColumns: [projectsInCore.id],
		name: 'conversations_project_id_fkey',
	}).onDelete('set null'),
	foreignKey({
		columns: [table.createdBy],
		foreignColumns: [usersInCore.id],
		name: 'conversations_created_by_fkey',
	}),
]);

export const chatMessagesInCore = core.table('chat_messages', {
	id: uuid().defaultRandom().primaryKey().notNull(),
	conversationId: uuid('conversation_id').notNull(),
	senderId: uuid('sender_id'),
	body: text().notNull(),
	attachments: jsonb(),
	sentAt: timestamp('sent_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	editedAt: timestamp('edited_at', { withTimezone: true, mode: 'string' }),
}, (table) => [
	index('core_chat_conv_sent_at_idx').using(
		'btree',
		table.conversationId.asc().nullsLast(),
		table.sentAt.desc().nullsFirst().op('timestamptz_ops'),
	),
	foreignKey({
		columns: [table.conversationId],
		foreignColumns: [conversationsInCore.id],
		name: 'chat_messages_conversation_id_fkey',
	}).onDelete('cascade'),
	foreignKey({
		columns: [table.senderId],
		foreignColumns: [usersInCore.id],
		name: 'chat_messages_sender_id_fkey',
	}).onDelete('set null'),
]);

export const notificationsInCore = core.table('notifications', {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid('user_id').notNull(),
	channel: notificationChannel().default('in_app').notNull(),
	payload: jsonb().notNull(),
	seen: boolean().default(false).notNull(),
	deliveredAt: timestamp('delivered_at', { withTimezone: true, mode: 'string' }),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index('core_notifications_unseen_idx').using('btree', table.userId.asc().nullsLast().op('uuid_ops')).where(
		sql`(seen = false)`,
	),
	foreignKey({
		columns: [table.userId],
		foreignColumns: [usersInCore.id],
		name: 'notifications_user_id_fkey',
	}).onDelete('cascade'),
]);

export const customersInBilling = billing.table('customers', {
	id: uuid().defaultRandom().primaryKey().notNull(),
	organizationId: uuid('organization_id'),
	name: text().notNull(),
	address: jsonb(),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
		columns: [table.organizationId],
		foreignColumns: [organizationsInCore.id],
		name: 'customers_organization_id_fkey',
	}).onDelete('cascade'),
	unique('customers_organization_id_key').on(table.organizationId),
	unique('idnameunique').on(table.id, table.name),
]);

export const subscriptionsInBilling = billing.table('subscriptions', {
	id: uuid().defaultRandom().primaryKey().notNull(),
	customerId: uuid('customer_id').notNull(),
	plan: text().notNull(),
	status: text().default('active').notNull(),
	startedAt: timestamp('started_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	endedAt: timestamp('ended_at', { withTimezone: true, mode: 'string' }),
	metadata: jsonb(),
}, (table) => [
	foreignKey({
		columns: [table.customerId],
		foreignColumns: [customersInBilling.id],
		name: 'subscriptions_customer_id_fkey',
	}).onDelete('cascade'),
]);

export const paymentsInBilling = billing.table('payments', {
	id: uuid().defaultRandom().primaryKey().notNull(),
	invoiceId: uuid('invoice_id').notNull(),
	paidAt: timestamp('paid_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	amount: numeric({ precision: 12, scale: 2 }).notNull(),
	amount2: decimal({ precision: 12, scale: 2 }).notNull(),
	method: paymentMethod().notNull(),
	transactionRef: text('transaction_ref'),
	metadata: jsonb(),
}, (table) => [
	foreignKey({
		columns: [table.invoiceId],
		foreignColumns: [invoicesInBilling.id],
		name: 'payments_invoice_id_fkey',
	}).onDelete('cascade'),
]);

export const couponsInBilling = billing.table('coupons', {
	id: uuid().defaultRandom().primaryKey().notNull(),
	code: text().notNull(),
	description: text(),
	discountPercent: smallint('discount_percent'),
	redeemableFrom: timestamp('redeemable_from', { withTimezone: true, mode: 'string' }),
	redeemableTo: timestamp('redeemable_to', { withTimezone: true, mode: 'string' }),
	maxRedemptions: integer('max_redemptions').generatedAlwaysAsIdentity(),
	metadata: jsonb(),
}, (table) => [
	unique('coupons_code_key').on(table.code),
	check('coupons_discount_percent_check', sql`(discount_percent >= 0) AND (discount_percent <= 100)`),
]);

export const webhooksInCore = core.table('webhooks', {
	id: uuid().defaultRandom().primaryKey().notNull(),
	organizationId: uuid('organization_id').notNull(),
	url: text().notNull(),
	secret: text(),
	events: text().array().notNull(),
	active: boolean().default(true).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index('core_webhooks_org_active_idx').using('btree', table.organizationId.asc().nullsLast().op('uuid_ops')).where(
		sql`(active = true)`,
	),
	foreignKey({
		columns: [table.organizationId],
		foreignColumns: [organizationsInCore.id],
		name: 'webhooks_organization_id_fkey',
	}).onDelete('cascade'),
]);

export const metricSourcesInAnalytics = analytics.table('metric_sources', {
	id: uuid().defaultRandom().primaryKey().notNull(),
	organizationId: uuid('organization_id').notNull(),
	name: text().notNull(),
	config: jsonb(),
}, (table) => [
	foreignKey({
		columns: [table.organizationId],
		foreignColumns: [organizationsInCore.id],
		name: 'metric_sources_organization_id_fkey',
	}).onDelete('cascade'),
	unique('metric_sources_organization_id_name_key').on(table.organizationId, table.name),
]);

export const metricsInAnalytics = analytics.table('metrics', {
	id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
	sourceId: uuid('source_id').notNull(),
	metricKey: text('metric_key').notNull(),
	ts: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
	value: doublePrecision().notNull(),
	tags: jsonb(),
}, (table) => [
	index('analytics_metrics_key_ts_idx').using(
		'btree',
		table.metricKey.asc().nullsLast().op('text_ops'),
		table.ts.desc().nullsFirst().op('timestamptz_ops'),
	),
	foreignKey({
		columns: [table.sourceId],
		foreignColumns: [metricSourcesInAnalytics.id],
		name: 'metrics_source_id_fkey',
	}).onDelete('cascade'),
	unique('metrics_source_id_metric_key_ts_key').on(table.sourceId, table.metricKey, table.ts),
]);

export const alertRulesInMonitoring = monitoring.table('alert_rules', {
	id: uuid().defaultRandom().primaryKey().notNull(),
	organizationId: uuid('organization_id').notNull(),
	name: text().notNull(),
	description: text(),
	severity: severityLevel().default('medium').notNull(),
	enabled: boolean().default(true).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
		columns: [table.organizationId],
		foreignColumns: [organizationsInCore.id],
		name: 'alert_rules_organization_id_fkey',
	}).onDelete('cascade'),
	unique('alert_rules_organization_id_name_key').on(table.organizationId, table.name),
]);

export const ruleConditionsInMonitoring = monitoring.table('rule_conditions', {
	id: uuid().defaultRandom().primaryKey().notNull(),
	ruleId: uuid('rule_id').notNull(),
	metricKey: text('metric_key').notNull(),
	operator: ruleConditionOperator().notNull().unique('some_name', { nulls: 'not distinct' }),
	threshold: doublePrecision().notNull(),
	window: interval().default('00:05:00').notNull(),
}, (table) => [
	foreignKey({
		columns: [table.ruleId],
		foreignColumns: [alertRulesInMonitoring.id],
		name: 'rule_conditions_rule_id_fkey',
	}).onDelete('cascade'),
]);

export const alertsInMonitoring = monitoring.table('alerts', {
	id: uuid().defaultRandom().primaryKey().notNull(),
	ruleId: uuid('rule_id').notNull(),
	triggeredAt: timestamp('triggered_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	resolvedAt: timestamp('resolved_at', { withTimezone: true, mode: 'string' }),
	payload: jsonb(),
	state: text().default('firing').notNull(),
}, (table) => [
	foreignKey({
		columns: [table.ruleId],
		foreignColumns: [alertRulesInMonitoring.id],
		name: 'alerts_rule_id_fkey',
	}).onDelete('cascade'),
]);

export const escalationsInMonitoring = monitoring.table('escalations', {
	id: uuid().defaultRandom().primaryKey().notNull(),
	alertId: uuid('alert_id').notNull(),
	action: alertAction().notNull(),
	target: text().notNull(),
	executedAt: timestamp('executed_at', { withTimezone: true, mode: 'string' }),
}, (table) => [
	foreignKey({
		columns: [table.alertId],
		foreignColumns: [alertsInMonitoring.id],
		name: 'escalations_alert_id_fkey',
	}).onDelete('cascade'),
]);

export const ssoProvidersInCore = core.table('sso_providers', {
	id: uuid().defaultRandom().primaryKey().notNull(),
	organizationId: uuid('organization_id').notNull(),
	type: text().notNull(),
	config: jsonb().notNull(),
	enabled: boolean().default(false).notNull(),
}, (table) => [
	foreignKey({
		columns: [table.organizationId],
		foreignColumns: [organizationsInCore.id],
		name: 'sso_providers_organization_id_fkey',
	}).onDelete('cascade'),
]);

export const auditLogsInCore = core.table('audit_logs', {
	id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
	organizationId: uuid('organization_id'),
	actorId: uuid('actor_id'),
	objectType: text('object_type').notNull(),
	objectId: uuid('object_id').array('[][][]'),
	action: text().notNull(),
	beforeState: jsonb('before_state'),
	afterState: jsonb('after_state'),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index('core_audit_org_idx').using(
		'btree',
		table.organizationId.asc().nullsLast(),
		table.createdAt.desc().nullsFirst().op('timestamptz_ops'),
	),
]);

export const rateLimitsInCore = core.table('rate_limits', {
	id: uuid().defaultRandom().primaryKey().notNull(),
	apiKeyId: uuid('api_key_id').notNull(),
	windowStart: timestamp('window_start', { withTimezone: true, mode: 'string' }).notNull(),
	requests: integer().generatedByDefaultAsIdentity().notNull(),
	limit: integer().generatedAlwaysAs(() => sql`1`).notNull(),
}, (table) => [
	foreignKey({
		columns: [table.apiKeyId],
		foreignColumns: [apiKeysInCore.id],
		name: 'rate_limits_api_key_id_fkey',
	}).onDelete('cascade'),
	unique('rate_limits_api_key_id_window_start_key').on(table.apiKeyId, table.windowStart).nullsNotDistinct(),
]);

export const experimentsInCore = core.table('experiments', {
	id: uuid().defaultRandom().primaryKey().notNull(),
	organizationId: uuid('organization_id').notNull(),
	key: text().notNull(),
	description: text(),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
		columns: [table.organizationId],
		foreignColumns: [organizationsInCore.id],
		name: 'experiments_organization_id_fkey',
	}).onDelete('cascade'),
	unique('experiments_organization_id_key_key').on(table.organizationId, table.key),
]);

export const experimentVariantsInCore = core.table('experiment_variants', {
	id: uuid().defaultRandom().primaryKey().notNull(),
	experimentId: uuid('experiment_id').notNull(),
	name: text().notNull(),
	allocationPercent: smallint('allocation_percent').default(0).notNull(),
}, (table) => [
	foreignKey({
		columns: [table.experimentId],
		foreignColumns: [experimentsInCore.id],
		name: 'experiment_variants_experiment_id_fkey',
	}).onDelete('cascade'),
	unique('experiment_variants_experiment_id_name_key').on(table.experimentId, table.name),
	check('experiment_variants_allocation_percent_check', sql`(allocation_percent >= 0) AND (allocation_percent <= 100)`),
]);

export const experimentAssignmentsInCore = core.table('experiment_assignments', {
	id: uuid().defaultRandom().primaryKey().notNull(),
	experimentId: uuid('experiment_id').notNull(),
	variantId: uuid('variant_id').notNull(),
	userId: uuid('user_id').notNull(),
	assignedAt: timestamp('assigned_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
		columns: [table.experimentId],
		foreignColumns: [experimentsInCore.id],
		name: 'experiment_assignments_experiment_id_fkey',
	}).onDelete('cascade'),
	foreignKey({
		columns: [table.variantId],
		foreignColumns: [experimentVariantsInCore.id],
		name: 'experiment_assignments_variant_id_fkey',
	}).onDelete('cascade'),
	foreignKey({
		columns: [table.userId],
		foreignColumns: [usersInCore.id],
		name: 'experiment_assignments_user_id_fkey',
	}).onDelete('cascade'),
	unique('experiment_assignments_experiment_id_user_id_key').on(table.experimentId, table.userId),
]);

export const deploymentsInCore = core.table('deployments', {
	id: uuid().defaultRandom().primaryKey().notNull(),
	projectId: uuid('project_id').notNull(),
	environment: env().default('dev').notNull(),
	version: text().notNull(),
	deployedBy: uuid('deployed_by'),
	deployedAt: timestamp('deployed_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	notes: text(),
}, (table) => [
	foreignKey({
		columns: [table.projectId],
		foreignColumns: [projectsInCore.id],
		name: 'deployments_project_id_fkey',
	}).onDelete('cascade'),
	foreignKey({
		columns: [table.deployedBy],
		foreignColumns: [usersInCore.id],
		name: 'deployments_deployed_by_fkey',
	}),
	unique('deployments_project_id_environment_version_key').on(table.projectId, table.environment, table.version),
]);

export const servicesInCore = core.table('services', {
	id: uuid().defaultRandom().primaryKey().notNull(),
	organizationId: uuid('organization_id').notNull(),
	name: text().notNull(),
	kind: text(),
	ownerId: uuid('owner_id'),
	metadata: jsonb(),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'string', precision: 6 }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
		columns: [table.organizationId],
		foreignColumns: [organizationsInCore.id],
		name: 'services_organization_id_fkey',
	}).onDelete('cascade'),
	foreignKey({
		columns: [table.ownerId],
		foreignColumns: [usersInCore.id],
		name: 'services_owner_id_fkey',
	}),
	unique('services_organization_id_name_key').on(table.organizationId, table.name),
]);

export const locksInCore = core.table('locks', {
	name: text().primaryKey().notNull(),
	owner: text(),
	expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string', precision: 2 }),
});

export const entitiesInCore = core.table('entities', {
	id: uuid().defaultRandom().primaryKey().notNull(),
	organizationId: uuid('organization_id').notNull(),
	type: text().notNull(),
	data: jsonb(),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
		columns: [table.organizationId],
		foreignColumns: [organizationsInCore.id],
		name: 'entities_organization_id_fkey',
	}).onDelete('cascade'),
]);

export const taskQueueInAnalytics = analytics.table('task_queue', {
	id: uuid().defaultRandom().primaryKey().notNull(),
	queueName: text('queue_name').default('default').notNull(),
	payload: jsonb().notNull(),
	priority: smallint().default(100).notNull(),
	reserved: boolean().default(false).notNull(),
	reservedUntil: timestamp('reserved_until', { withTimezone: true, mode: 'string' }),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex('analytics_task_queue_unique_unreserved').using(
		'btree',
		sql`queue_name`,
		sql`((payload ->> 'task_type'::text))`,
	).where(sql`(reserved = false)`),
]);

export const invoicesInBilling = billing.table('invoices', {
	id: uuid().defaultRandom().primaryKey().notNull(),
	customerId: uuid('customer_id').notNull(),
	number: text().notNull(),
	issuedAt: timestamp('issued_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	dueAt: timestamp('due_at', { withTimezone: true, mode: 'string' }),
	totalAmount: numeric('total_amount', { precision: 12, scale: 2 }).default('0.0').notNull(),
	currency: currencyCode().default('USD').notNull(),
	status: invoiceStatus().default('draft').notNull(),
	notes: text(),
}, (table) => [
	index('billing_invoices_status_idx').using('btree', table.status.asc().nullsLast().op('enum_ops')),
	foreignKey({
		columns: [table.customerId, table.number],
		foreignColumns: [customersInBilling.id, customersInBilling.name],
		name: 'invoices_customer_id_fkey',
	}).onDelete('cascade'),
	unique('invoices_customer_id_number_key').on(table.customerId, table.number),
	check('invoices_total_nonnegative', sql`total_amount >= (0)::numeric`),
]);

export const aliasesInCore = core.table('aliases', {
	id: uuid().defaultRandom().primaryKey().notNull(),
	objectType: text('object_type').notNull(),
	objectId: uuid('object_id').notNull(),
	alias: text().notNull().unique('unique_with_name'),
	organizationId: uuid('organization_id'),
}, (table) => [
	foreignKey({
		columns: [table.organizationId],
		foreignColumns: [organizationsInCore.id],
		name: 'aliases_organization_id_fkey',
	}).onUpdate('cascade'),
	unique('aliases_object_type_object_id_alias_key').on(table.objectType, table.objectId, table.alias),
]);

export const selfRef = core.table('self_ref', {
	id: uuid().defaultRandom().primaryKey().notNull(),
	objectType: text('object_type').notNull().unique().references((): AnyPgColumn => selfRef.organizationId),
	organizationId: text('organization_id').notNull().unique(),
});

export const couponRedemptionsInBilling = billing.table('coupon_redemptions', {
	couponId: uuid('coupon_id').notNull(),
	customerId: uuid('customer_id').notNull(),
	redeemedAt: timestamp('redeemed_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
		columns: [table.couponId],
		foreignColumns: [couponsInBilling.id],
		name: 'coupon_redemptions_coupon_id_fkey',
	}).onDelete('cascade'),
	foreignKey({
		columns: [table.customerId],
		foreignColumns: [customersInBilling.id],
		name: 'coupon_redemptions_customer_id_fkey',
	}).onDelete('cascade'),
	primaryKey({ columns: [table.couponId, table.customerId], name: 'coupon_redemptions_pkey' }),
]);

export const entityLinksInCore = core.table('entity_links', {
	parentEntityId: uuid('parent_entity_id').notNull(),
	childEntityId: uuid('child_entity_id').notNull(),
	relationship: text().notNull(),
}, (table) => [
	foreignKey({
		columns: [table.parentEntityId],
		foreignColumns: [entitiesInCore.id],
		name: 'entity_links_parent_entity_id_fkey',
	}).onDelete('cascade'),
	foreignKey({
		columns: [table.childEntityId],
		foreignColumns: [entitiesInCore.id],
		name: 'entity_links_child_entity_id_fkey',
	}).onDelete('cascade'),
	primaryKey({ columns: [table.parentEntityId, table.childEntityId, table.relationship], name: 'entity_links_pkey' }),
]);

export const rolePermissionsInCore = core.table('role_permissions', {
	roleId: integer('role_id').notNull(),
	permissionId: integer('permission_id').notNull(),
	assignedBy: uuid('assigned_by'),
	assignedAt: timestamp('assigned_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
		columns: [table.roleId],
		foreignColumns: [rolesInCore.id],
		name: 'role_permissions_role_id_fkey',
	}).onDelete('cascade'),
	foreignKey({
		columns: [table.permissionId],
		foreignColumns: [permissionsInCore.id],
		name: 'role_permissions_permission_id_fkey',
	}).onDelete('cascade'),
	foreignKey({
		columns: [table.assignedBy],
		foreignColumns: [usersInCore.id],
		name: 'role_permissions_assigned_by_fkey',
	}),
	primaryKey({ columns: [table.roleId, table.permissionId], name: 'role_permissions_pkey' }),
]);

export const taggingsInCore = core.table('taggings', {
	tagId: integer('tag_id').notNull(),
	objectType: text('object_type').notNull(),
	objectId: uuid('object_id').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
		columns: [table.tagId],
		foreignColumns: [tagsInCore.id],
		name: 'taggings_tag_id_fkey',
	}).onDelete('cascade'),
	primaryKey({ columns: [table.tagId, table.objectType, table.objectId], name: 'taggings_pkey' }),
]);

export const reactionsInCore = core.table('reactions', {
	messageId: uuid('message_id').notNull(),
	userId: uuid('user_id').notNull(),
	reaction: text().notNull().array(),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
		columns: [table.messageId],
		foreignColumns: [chatMessagesInCore.id],
		name: 'reactions_message_id_fkey',
	}).onDelete('cascade'),
	foreignKey({
		columns: [table.userId],
		foreignColumns: [usersInCore.id],
		name: 'reactions_user_id_fkey',
	}).onDelete('cascade'),
	primaryKey({ columns: [table.messageId, table.userId, table.reaction], name: 'reactions_pkey' }),
]);

// views
export const projectSearchInAnalytics = analytics.materializedView('project_search', {
	id: uuid(),
	name: text(),
	slug: text(),
	description: text(),
}).with({ autovacuumEnabled: true, autovacuumMultixactFreezeTableAge: 12 })
	.withNoData().as(
		sql`SELECT id, name, slug, description FROM core.projects p`,
	);

export const projectSearchInAnalytics2 = analytics.materializedView('project_search2', {
	id: uuid(),
	name: text(),
	slug: text(),
	description: text(),
}).with({ autovacuumEnabled: true, autovacuumMultixactFreezeTableAge: 12 })
	.withNoData().existing();

export const vActiveUsersInCore = core.view('v_active_users').as((qb) =>
	qb.select({
		id: usersInCore.id,
		username: usersInCore.username,
		organization_id: usersInCore.organizationId,
	}).from(usersInCore).where(eq(usersInCore.status, 'active'))
);
export const vActiveUsersInCore2 = core.view('v_active_users2', {}).existing();

// polices
export const rls = pgSchema('rls');
export const documentsInRls = rls.table('documents', {
	docId: uuid('doc_id').defaultRandom().primaryKey().notNull(),
	ownerId: uuid('owner_id').notNull(),
	title: text().notNull(),
	content: text().notNull(),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	pgPolicy('documents_delete_own', {
		as: 'permissive',
		for: 'delete',
		to: ['public'],
		using: sql`(owner_id = (CURRENT_USER)::uuid)`,
	}),
	pgPolicy('documents_update_own', { as: 'permissive', for: 'update', to: ['public'] }),
	pgPolicy('documents_select_own', { as: 'permissive', for: 'select', to: ['public'] }),
]);

export const messagesInRls = rls.table.withRLS('messages', {
	msgId: uuid('msg_id').defaultRandom().primaryKey().notNull(),
	senderId: uuid('sender_id').notNull(),
	recipientId: uuid('recipient_id').notNull(),
	message: text().notNull(),
	sentAt: timestamp('sent_at', { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	pgPolicy('messages_delete_own', {
		as: 'permissive',
		for: 'delete',
		to: ['public'],
		using: sql`(sender_id = (CURRENT_USER)::uuid)`,
	}),
	pgPolicy('messages_visibility', { as: 'permissive', for: 'select', to: ['public'] }),
]);

export const projectsInRls = rls.table('projects', {
	projectId: uuid('project_id').defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	description: text(),
	ownerId: uuid('owner_id').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	pgPolicy('projects_visibility', {
		as: 'permissive',
		for: 'select',
		to: ['public'],
		using: sql`((owner_id = (CURRENT_USER)::uuid) OR (project_id IN ( SELECT pm.project_id
   FROM rls.project_members pm
  WHERE (pm.user_id = (CURRENT_USER)::uuid))))`,
	}),
]);

export const projectMembersInRls = rls.table.withRLS('project_members', {
	projectId: uuid('project_id').notNull(),
	userId: uuid('user_id').notNull(),
	role: text().notNull(),
}, (table) => [
	foreignKey({
		columns: [table.projectId],
		foreignColumns: [projectsInRls.projectId],
		name: 'project_members_project_id_fkey',
	}).onDelete('cascade'),
	primaryKey({ columns: [table.projectId, table.userId], name: 'project_members_pkey' }),
	pgPolicy('project_members_manage', {
		as: 'permissive',
		for: 'all',
		to: ['public'],
		using: sql`(project_id IN ( SELECT p.project_id
   FROM rls.projects p
  WHERE (p.owner_id = (CURRENT_USER)::uuid)))`,
	}),
	pgPolicy('project_members_visibility', { as: 'permissive', for: 'select', to: ['public'] }),
	check('project_members_role_check', sql`role = ANY (ARRAY['member'::text, 'admin'::text])`),
]);

export const policy = pgPolicy('new_policy', {
	as: 'restrictive',
	to: 'postgres',
	withCheck: sql`1 = 1`,
	for: 'all',
}).link(organizationsInCore);
