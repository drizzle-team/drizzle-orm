import { eq, sql } from 'drizzle-orm';
import {
	AnySQLiteColumn,
	blob,
	check,
	foreignKey,
	index,
	integer,
	numeric,
	primaryKey,
	real,
	sqliteTable,
	text,
	unique,
	uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { v4 } from 'uuid';

export const organizationsInCore = sqliteTable(
	'organizations',
	{
		id: blob()
			.$default(() => v4())
			.primaryKey()
			.notNull(),
		code: integer({ mode: 'number' }).notNull(),
		name: text().notNull(),
		domain: text(),
		currency: text({ enum: ['USD', 'EUR', 'GBP', 'UAH', 'JPY'] })
			.default('EUR')
			.notNull(),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.defaultNow()
			.notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index('core_org_name_idx').on(table.name),
		index('organizations_code_idx').on(table.code),
		uniqueIndex('organizations_domain_key').on(table.domain),
		check('organizations_name_check', sql`length(name) > 1`),
	],
);

export const usersInCore = sqliteTable(
	'users',
	{
		id: blob()
			.$default(() => v4())
			.primaryKey()
			.notNull(),
		organizationId: text('organization_id', {
			mode: 'text',
			length: 100,
		}).notNull(),
		username: text().notNull(),
		status: text({ enum: ['pending', 'done'] })
			.default('pending')
			.notNull(),
		locale: text().default('en-US').notNull(),
		lastLogin: integer('last_login', { mode: 'timestamp' }),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.defaultNow()
			.notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.defaultNow()
			.notNull(),
		bio: text().$onUpdate(() => sql`bio || 'some test'`),
		profile: blob({ mode: 'json' }),
	},
	(table) => [
		index('core_users_username_idx').on(table.organizationId, table.username),
		foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organizationsInCore.id],
			name: 'users_organizationId_organizations_fkey',
		}).onDelete('cascade'),

		uniqueIndex('users_org_username_unique').on(
			table.organizationId,
			table.username,
		),
	],
);

export const rolesInCore = sqliteTable(
	'roles',
	{
		id: integer().primaryKey({ autoIncrement: true }).notNull(),
		organizationId: text('organization_id')
			.notNull()
			.references(() => organizationsInCore.id, { onDelete: 'cascade' }),
		name: text().notNull(),
		kind: text({ enum: ['custom'] })
			.default('custom')
			.notNull(),
		builtin: integer({ mode: 'boolean' }).default(false).notNull(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		uniqueIndex('roles_organization_id_name_key').on(
			table.organizationId,
			table.name,
		),
	],
);

export const permissionsInCore = sqliteTable('permissions', {
	id: integer().primaryKey().notNull(),
	code: text().notNull(),
	description: text(),
});

export const membershipsInCore = sqliteTable(
	'memberships',
	{
		id: blob()
			.$default(() => v4())
			.primaryKey()
			.notNull(),
		userId: text('user_id').notNull(),
		roleId: integer('role_id').notNull(),
		organizationId: text('organization_id').notNull(),
		joinedAt: integer('joined_at', { mode: 'timestamp_ms' })
			.defaultNow()
			.notNull(),
		active: integer({ mode: 'boolean' }).default(true).notNull(),
	},
	(table) => [
		foreignKey({
			name: 'memberships_userId_users_fkey',
			columns: [table.userId],
			foreignColumns: [usersInCore.id],
		}).onDelete('cascade'),

		foreignKey({
			name: 'memberships_roleId_roles_fkey',
			columns: [table.roleId],
			foreignColumns: [rolesInCore.id],
		}).onDelete('set null'),

		foreignKey({
			name: 'memberships_organizationId_organizations_fkey',
			columns: [table.organizationId],
			foreignColumns: [organizationsInCore.id],
		}).onDelete('cascade'),

		uniqueIndex('unique_membership').on(table.userId, table.organizationId),
	],
);

export const apiKeysInCore = sqliteTable(
	'api_keys',
	{
		id: blob()
			.$default(() => v4())
			.primaryKey()
			.notNull(),
		organizationId: text(),
		userId: blob(),
		name: text().notNull(),
		keyHash: text('key_hash').notNull(),
		revoked: integer({ mode: 'boolean' }).default(false).notNull(),
		expiresAt: integer('expires_at', { mode: 'timestamp' }),
		metadata: text({ mode: 'json' }).generatedAlwaysAs(sql`'{"some":"test"}'`),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index('core_apikey_org_idx')
			.on(table.organizationId)
			.where(sql`(revoked = false)`),
		foreignKey({
			name: 'apikeys_organizationId_organizations_fkey',
			columns: [table.organizationId],
			foreignColumns: [organizationsInCore.id],
		}).onDelete('cascade'),

		foreignKey({
			name: 'apikeys_userId_users_fkey',
			columns: [table.userId],
			foreignColumns: [usersInCore.id],
		}).onDelete('set null'),

		uniqueIndex('api_keys_organization_id_name_key').on(
			table.organizationId,
			table.name,
		),
	],
);

export const sessionsInCore = sqliteTable(
	'sessions',
	{
		id: blob()
			.$default(() => v4())
			.primaryKey()
			.notNull(),
		userId: blob().notNull(),
		ip: text(),
		userAgent: text('user_agent'),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.defaultNow()
			.notNull(),
		expiresAt: integer('expires_at', {
			mode: 'timestamp_ms',
		}).notNull(),
		active: integer({ mode: 'boolean' }).default(true).notNull(),
	},
	(table) => [
		index('core_sessions_user_expires').on(table.userId, table.expiresAt),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [usersInCore.id],
		}).onDelete('cascade'),
	],
);

export const oauthProvidersInCore = sqliteTable(
	'oauth_providers',
	{
		id: integer().primaryKey().notNull(),
		organizationId: text().notNull(),
		provider: text().notNull(),
		clientId: text('client_id').notNull(),
		clientSecret: text('client_secret').notNull(),
		config: blob({ mode: 'json' }),
	},
	(table) => [
		foreignKey({
			name: 'oauthproviders_organizationId_organizations_fkey',
			columns: [table.organizationId],
			foreignColumns: [organizationsInCore.id],
		}).onDelete('cascade'),

		uniqueIndex('oauth_providers_organization_id_provider_key').on(
			table.organizationId,
			table.provider,
		),
	],
);

export const featureFlagsInCore = sqliteTable(
	'feature_flags',
	{
		id: blob()
			.$default(() => v4())
			.primaryKey()
			.notNull(),
		organizationId: blob('organization_id').notNull(),
		key: text().notNull(),
		description: text(),
		state: text({ enum: ['disabled'] })
			.default('disabled')
			.notNull(),
		rolloutPercent: integer('rollout_percent').default(0),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		foreignKey({
			name: 'featureflags_organizationId_organizations_fkey',
			columns: [table.organizationId],
			foreignColumns: [organizationsInCore.id],
		}).onDelete('cascade'),

		uniqueIndex('feature_flags_organization_id_key_key').on(
			table.organizationId,
			table.key,
		),
		check(
			'feature_flags_rollout_percent_check',
			sql`(rollout_percent >= 0) AND (rollout_percent <= 100)`,
		),
	],
);

export const projectsInCore = sqliteTable(
	'projects',
	{
		id: blob()
			.$default(() => v4())
			.primaryKey()
			.notNull(),
		organizationId: blob('organization_id').notNull(),
		name: text().notNull(),
		slug: text().notNull(),
		description: text(),
		visibility: text().default('priv"ate').notNull(),
		createdBy: blob('created_by'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.defaultNow()
			.notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index('core_projects_org_name_idx').on(table.organizationId, table.name),
		foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organizationsInCore.id],
		}).onDelete('cascade'),

		foreignKey({
			name: 'projects_createdBy_users_fkey',
			columns: [table.createdBy],
			foreignColumns: [usersInCore.id],
		}),

		uniqueIndex('projects_org_slug_unique').on(
			table.organizationId,
			table.slug,
		),
	],
);

export const repositoriesInCore = sqliteTable(
	'repositories',
	{
		id: blob()
			.$default(() => v4())
			.primaryKey()
			.notNull(),
		projectId: blob('project_id').notNull(),
		provider: text().notNull(),
		repoOwner: text('repo_owner').notNull(),
		repoName: text('repo_name').notNull(),
		defaultBranch: text('default_branch').default('main').notNull(),
		cloneUrl: text('clone_url'),
	},
	(table) => [
		foreignKey({
			name: 'repositories_projectId_projects_fkey',
			columns: [table.projectId],
			foreignColumns: [projectsInCore.id],
		}).onDelete('cascade'),

		uniqueIndex('repositories_project_id_provider_repo_owner_repo_name_key').on(
			table.projectId,
			table.provider,
			table.repoOwner,
			table.repoName,
		),
	],
);

export const buildsInCore = sqliteTable(
	'builds',
	{
		id: blob({ mode: 'bigint' }).primaryKey().notNull(),
		projectId: blob('project_id').notNull(),
		triggeredBy: blob('triggered_by'),
		commitSha: text('commit_sha', { length: 40 }).notNull(),
		status: text().default('created').notNull(),
		startedAt: integer('started_at', { mode: 'timestamp_ms' }),
		finishedAt: integer('finished_at', {
			mode: 'timestamp',
		}),
		metadata: blob({ mode: 'buffer' }),
	},
	(table) => [
		index('core_builds_project_status_idx').on(table.projectId, table.status),
		foreignKey({
			name: 'builds_projectId_projects_fkey',
			columns: [table.projectId],
			foreignColumns: [projectsInCore.id],
		}).onDelete('cascade'),

		foreignKey({
			name: 'builds_triggeredBy_users_fkey',
			columns: [table.triggeredBy],
			foreignColumns: [usersInCore.id],
		}),

		uniqueIndex('builds_project_id_commit_sha_key').on(
			table.projectId,
			table.commitSha,
		),
	],
);

export const pipelinesInCore = sqliteTable(
	'pipelines',
	{
		id: blob()
			.$default(() => v4())
			.primaryKey()
			.notNull(),
		projectId: text('project_id').notNull(),
		name: text().notNull(),
		spec: blob({ mode: 'json' }).notNull(),
		status: text().default('created').notNull(),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		foreignKey({
			name: 'pipelines_projectId_projects_fkey',
			columns: [table.projectId],
			foreignColumns: [projectsInCore.id],
		}).onDelete('cascade'),

		uniqueIndex('pipelines_project_id_name_key').on(
			table.projectId,
			table.name,
		),
	],
);

export const pipelineRunsInAnalytics = sqliteTable(
	'pipeline_runs',
	{
		id: blob()
			.$default(() => v4())
			.primaryKey()
			.notNull(),
		pipelineId: text('pipeline_id').notNull(),

		runNumber: blob('run_number', { mode: 'bigint' }).notNull(),
		state: text().default('queued').notNull(),
		startedAt: integer('started_at', { mode: 'timestamp_ms' }),
		finishedAt: integer('finished_at', {
			mode: 'timestamp',
		}),
		logs: text(),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index('analytics_pipeline_runs_state_idx').on(table.state),
		foreignKey({
			name: 'pipelinerunsinanalytics_pipelineId_pipelines_fkey',
			columns: [table.pipelineId],
			foreignColumns: [pipelinesInCore.id],
		}).onDelete('cascade'),

		uniqueIndex('pipeline_runs_unique_run').on(
			table.pipelineId,
			table.runNumber,
		),
	],
);

export const jobsInAnalytics = sqliteTable(
	'jobs',
	{
		id: blob()
			.$default(() => v4())
			.primaryKey()
			.notNull(),
		pipelineRunId: text('pipeline_run_id'),
		name: text().notNull(),
		state: text().default('queued').notNull(),
		attempts: integer().default(0).notNull(),
		lastError: text('last_error'),
	},
	(table) => [
		index('analytics_jobs_state_attempts_idx').on(table.state, table.attempts),
		foreignKey({
			name: 'jobsinanalytics_pipelineRunId_unknown_fkey',
			columns: [table.pipelineRunId],
			foreignColumns: [pipelineRunsInAnalytics.id],
		}).onDelete('cascade'),
	],
);

export const storageBucketsInCore = sqliteTable(
	'storage_buckets',
	{
		id: blob()
			.$default(() => v4())
			.primaryKey()
			.notNull(),
		organizationId: text('organization_id').notNull(),
		name: text().notNull(),
		region: text().notNull(),
		config: text({ mode: 'json' }),
	},
	(table) => [
		foreignKey({
			name: 'storagebuckets_organizationId_organizations_fkey',
			columns: [table.organizationId],
			foreignColumns: [organizationsInCore.id],
		}).onDelete('cascade'),

		uniqueIndex('storage_buckets_organization_id_name_key').on(
			table.organizationId,
			table.name,
		),
	],
);

export const objectsInCore = sqliteTable(
	'objects',
	{
		id: blob()
			.$default(() => v4())
			.primaryKey()
			.notNull(),
		bucketId: text('bucket_id').notNull(),
		path: text().notNull(),
		size: blob({ mode: 'bigint' }).notNull(),
		contentType: text('content_type'),
		metadata: blob({ mode: 'bigint' }),
	},
	(table) => [
		index('core_objects_bucket_path_gin').on(table.metadata),
		foreignKey({
			name: 'objects_bucketId_storagebuckets_fkey',
			columns: [table.bucketId],
			foreignColumns: [storageBucketsInCore.id],
		}).onDelete('cascade'),

		uniqueIndex('objects_bucket_id_path_key').on(table.bucketId, table.path),
	],
);

export const filesInCore = sqliteTable(
	'files',
	{
		id: blob()
			.$default(() => v4())
			.primaryKey()
			.notNull(),
		projectId: text('project_id'),
		name: text().notNull(),
		latestObjectId: text('latest_object_id'),
		createdBy: text('created_by'),
	},
	(table) => [
		foreignKey({
			name: 'files_projectId_projects_fkey',
			columns: [table.projectId],
			foreignColumns: [projectsInCore.id],
		}).onDelete('cascade'),

		foreignKey({
			name: 'files_latestObjectId_objects_fkey',
			columns: [table.latestObjectId],
			foreignColumns: [objectsInCore.id],
		}).onDelete('set null'),

		foreignKey({
			name: 'files_createdBy_users_fkey',
			columns: [table.createdBy],
			foreignColumns: [usersInCore.id],
		}),

		uniqueIndex('files_project_id_name_key').on(table.projectId, table.name),
	],
);

export const fileVersionsInCore = sqliteTable(
	'file_versions',
	{
		id: blob()
			.$default(() => v4())
			.primaryKey()
			.notNull(),
		fileId: text('file_id').notNull(),
		objectId: text('object_id').notNull(),
		versionNumber: integer('version_number').notNull(),
		checksum: text(),
	},
	(table) => [
		foreignKey({
			name: 'fileversions_fileId_files_fkey',
			columns: [table.fileId],
			foreignColumns: [filesInCore.id],
		}).onDelete('cascade'),

		foreignKey({
			name: 'fileversions_objectId_objects_fkey',
			columns: [table.objectId],
			foreignColumns: [objectsInCore.id],
		}).onDelete('cascade'),

		uniqueIndex('file_versions_file_id_version_number_key').on(
			table.fileId,
			table.versionNumber,
		),
	],
);

export const tagsInCore = sqliteTable(
	'tags',
	{
		id: integer().primaryKey().notNull(),
		organizationId: text('organization_id').notNull(),
		key: text().notNull(),
		value: text(),
	},
	(table) => [
		foreignKey({
			name: 'tags_organizationId_organizations_fkey',
			columns: [table.organizationId],
			foreignColumns: [organizationsInCore.id],
		}).onDelete('cascade'),

		uniqueIndex('tags_organization_id_key_value_key').on(
			table.organizationId,
			table.key,
			table.value,
		),
	],
);

export const conversationsInCore = sqliteTable(
	'conversations',
	{
		id: blob()
			.$default(() => v4())
			.primaryKey()
			.notNull(),
		projectId: text('project_id'),
		title: text(),
		createdBy: text('created_by'),
	},
	(table) => [
		foreignKey({
			name: 'conversations_projectId_projects_fkey',
			columns: [table.projectId],
			foreignColumns: [projectsInCore.id],
		}).onDelete('set null'),

		foreignKey({
			name: 'conversations_createdBy_users_fkey',
			columns: [table.createdBy],
			foreignColumns: [usersInCore.id],
		}),
	],
);

export const chatMessagesInCore = sqliteTable(
	'chat_messages',
	{
		id: blob()
			.$default(() => v4())
			.primaryKey()
			.notNull(),
		conversationId: text('conversation_id').notNull(),
		senderId: text('sender_id'),
		body: text().notNull(),
		attachments: blob({ mode: 'json' }),
	},
	(table) => [
		foreignKey({
			name: 'chatmessages_conversationId_conversations_fkey',
			columns: [table.conversationId],
			foreignColumns: [conversationsInCore.id],
		}).onDelete('cascade'),

		foreignKey({
			name: 'chatmessages_senderId_users_fkey',
			columns: [table.senderId],
			foreignColumns: [usersInCore.id],
		}).onDelete('set null'),
	],
);

export const notificationsInCore = sqliteTable(
	'notifications',
	{
		id: blob()
			.$default(() => v4())
			.primaryKey()
			.notNull(),
		userId: text('user_id').notNull(),
		channel: text().default('in_app').notNull(),
		payload: text({ mode: 'json' }).notNull(),
		seen: integer({ mode: 'boolean' }).default(false).notNull(),
	},
	(table) => [
		index('core_notifications_unseen_idx')
			.on(table.userId)
			.where(sql`(seen = false)`),
		foreignKey({
			name: 'notifications_userId_users_fkey',
			columns: [table.userId],
			foreignColumns: [usersInCore.id],
		}).onDelete('cascade'),
	],
);

export const customersInBilling = sqliteTable(
	'customers',
	{
		id: blob()
			.$default(() => v4())
			.primaryKey()
			.notNull(),
		organizationId: text('organization_id'),
		name: text().notNull(),
		address: text({ mode: 'json' }),
	},
	(table) => [
		foreignKey({
			name: 'customersinbilling_organizationId_organizations_fkey',

			columns: [table.organizationId],
			foreignColumns: [organizationsInCore.id],
		}).onDelete('cascade'),

		uniqueIndex('customers_organization_id_key').on(table.organizationId),
		uniqueIndex('idnameunique').on(table.id, table.name),
	],
);

export const subscriptionsInBilling = sqliteTable(
	'subscriptions',
	{
		id: blob()
			.$default(() => v4())
			.primaryKey()
			.notNull(),
		customerId: text('customer_id').notNull(),
		plan: text().notNull(),
		status: text().default('active').notNull(),
		metadata: text({ mode: 'json' }),
	},
	(table) => [
		foreignKey({
			name: 'subscriptionsinbilling_customerId_unknown_fkey',
			columns: [table.customerId],
			foreignColumns: [customersInBilling.id],
		}).onDelete('cascade'),
	],
);

export const paymentsInBilling = sqliteTable(
	'payments',
	{
		id: blob()
			.$default(() => v4())
			.primaryKey()
			.notNull(),
		invoiceId: text('invoice_id').notNull(),
		paidAt: integer('paid_at', { mode: 'timestamp' }).defaultNow().notNull(),
		amount: numeric({ mode: 'number' }).notNull(),
		amount3: numeric({ mode: 'string' }).notNull(),
		amount4: numeric({ mode: 'bigint' }).notNull(),
		amount2: real().notNull(),
		method: text().notNull(),
		transactionRef: text('transaction_ref'),
		metadata: text({ mode: 'json' }),
	},
	(table) => [
		foreignKey({
			name: 'paymentsinbilling_invoiceId_unknown_fkey',
			columns: [table.invoiceId],
			foreignColumns: [couponsInBilling.id],
		}).onDelete('cascade'),
	],
);

export const couponsInBilling = sqliteTable(
	'coupons',
	{
		id: blob()
			.$default(() => v4())
			.primaryKey()
			.notNull(),
		code: text().notNull(),
		description: text(),
		discountPercent: integer('discount_percent'),
		maxRedemptions: integer('max_redemptions').generatedAlwaysAs(5),
		metadata: text({ mode: 'json' }),
	},
	(table) => [
		uniqueIndex('coupons_code_key').on(table.code),
		check(
			'coupons_discount_percent_check',
			sql`(discount_percent >= 0) AND (discount_percent <= 100)`,
		),
	],
);

export const webhooksInCore = sqliteTable(
	'webhooks',
	{
		id: blob()
			.$default(() => v4())
			.primaryKey()
			.notNull(),
		organizationId: text('organization_id').notNull(),
		url: text().notNull(),
		secret: text(),
		events: text().notNull(),
		active: integer({ mode: 'boolean' }).default(true).notNull(),
	},
	(table) => [
		index('core_webhooks_org_active_idx')
			.on(table.organizationId)
			.where(sql`(active = true)`),
		foreignKey({
			name: 'webhooks_organizationId_organizations_fkey',
			columns: [table.organizationId],
			foreignColumns: [organizationsInCore.id],
		}).onDelete('cascade'),
	],
);

export const metricSourcesInAnalytics = sqliteTable(
	'metric_sources',
	{
		id: blob()
			.$default(() => v4())
			.primaryKey()
			.notNull(),
		organizationId: text('organization_id').notNull(),
		name: text().notNull(),
		config: text({ mode: 'json' }),
	},
	(table) => [
		foreignKey({
			name: 'metricsourcesinanalytics_organizationId_organizations_fkey',
			columns: [table.organizationId],
			foreignColumns: [organizationsInCore.id],
		}).onDelete('cascade'),

		uniqueIndex('metric_sources_organization_id_name_key').on(
			table.organizationId,
			table.name,
		),
	],
);

export const metricsInAnalytics = sqliteTable(
	'metrics',
	{
		id: blob({ mode: 'bigint' }).primaryKey().notNull(),
		sourceId: text('source_id').notNull(),
		metricKey: text('metric_key').notNull(),
		ts: integer({ mode: 'timestamp' }).notNull(),
		value: text().notNull(),
		tags: text({ mode: 'json' }),
	},
	(table) => [
		index('analytics_metrics_key_ts_idx').on(table.metricKey, table.ts),
		foreignKey({
			name: 'metricsinanalytics_sourceId_unknown_fkey',
			columns: [table.sourceId],
			foreignColumns: [metricSourcesInAnalytics.id],
		}).onDelete('cascade'),

		uniqueIndex('metrics_source_id_metric_key_ts_key').on(
			table.sourceId,
			table.metricKey,
			table.ts,
		),
	],
);

export const alertRulesInMonitoring = sqliteTable(
	'alert_rules',
	{
		id: blob()
			.$default(() => v4())
			.primaryKey()
			.notNull(),
		organizationId: text('organization_id').notNull(),
		name: text().notNull(),
		description: text(),
		severity: text().default('medium').notNull(),
		enabled: integer({ mode: 'boolean' }).default(true).notNull(),
	},
	(table) => [
		foreignKey({
			name: 'alertrulesinmonitoring_organizationId_organizations_fkey',
			columns: [table.organizationId],
			foreignColumns: [organizationsInCore.id],
		}).onDelete('cascade'),

		uniqueIndex('alert_rules_organization_id_name_key').on(
			table.organizationId,
			table.name,
		),
	],
);

export const ruleConditionsInMonitoring = sqliteTable(
	'rule_conditions',
	{
		id: blob()
			.$default(() => v4())
			.primaryKey()
			.notNull(),
		ruleId: text('rule_id').notNull(),
		metricKey: text('metric_key').notNull(),
	},
	(table) => [
		foreignKey({
			name: 'ruleconditionsinmonitoring_ruleId_unknown_fkey',
			columns: [table.ruleId],
			foreignColumns: [alertRulesInMonitoring.id],
		}).onDelete('cascade'),
	],
);

export const alertsInMonitoring = sqliteTable(
	'alerts',
	{
		id: blob()
			.$default(() => v4())
			.primaryKey()
			.notNull(),
		ruleId: text('rule_id').notNull(),
		payload: text({ mode: 'json' }),
		state: text().default('firing').notNull(),
	},
	(table) => [
		foreignKey({
			name: 'alertsinmonitoring_ruleId_unknown_fkey',
			columns: [table.ruleId],
			foreignColumns: [alertRulesInMonitoring.id],
		}).onDelete('cascade'),
	],
);

export const escalationsInMonitoring = sqliteTable(
	'escalations',
	{
		id: blob()
			.$default(() => v4())
			.primaryKey()
			.notNull(),
		alertId: text('alert_id').notNull(),
		target: text().notNull(),
	},
	(table) => [
		foreignKey({
			name: 'escalationsinmonitoring_alertId_unknown_fkey',
			columns: [table.alertId],
			foreignColumns: [alertsInMonitoring.id],
		}).onDelete('cascade'),
	],
);

export const ssoProvidersInCore = sqliteTable(
	'sso_providers',
	{
		id: blob()
			.$default(() => v4())
			.primaryKey()
			.notNull(),
		organizationId: text('organization_id').notNull(),
		type: text().notNull(),
		config: text({ mode: 'json' }).notNull(),
		enabled: integer({ mode: 'boolean' }).default(false).notNull(),
	},
	(table) => [
		foreignKey({
			name: 'ssoproviders_organizationId_organizations_fkey',
			columns: [table.organizationId],
			foreignColumns: [organizationsInCore.id],
		}).onDelete('cascade'),
	],
);

export const auditLogsInCore = sqliteTable(
	'audit_logs',
	{
		id: blob({ mode: 'bigint' }).primaryKey().notNull(),
		organizationId: text('organization_id'),
		actorId: text('actor_id'),
		objectType: text('object_type').notNull(),
		objectId: text('object_id'),
		action: text().notNull(),
		beforeState: blob('before_state', { mode: 'json' }),
		afterState: blob('after_state', { mode: 'buffer' }),
	},
	(table) => [
		index('core_audit_org_idx').on(table.organizationId, table.afterState),
	],
);
