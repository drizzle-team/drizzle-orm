import { SQL, sql } from 'drizzle-orm';
import { blob, index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { v4 } from 'uuid';

type EntityClass = 'ALPHA' | 'BETA' | 'GAMMA';
type AccessLevel = 'STANDARD' | 'PREMIUM';
type ProcessStage = 'INITIAL' | 'COMPLETE';

export const profiles = sqliteTable(
	'profiles',
	{
		id: blob()
			.$default(() => v4())
			.primaryKey(),
		externalRef: text({ length: 255 }).notNull(),
		serviceRef: text(),
		contactEmail: text({ length: 255 }).notNull(),
		givenName: text({ length: 100 }).notNull(),
		familyName: text({ length: 100 }).notNull(),
		accessLevel: text().$type<AccessLevel>().notNull(),
		birthDate: text(),
		classification: text({ length: 50 }).$type<EntityClass>(),
		contactNumber: text({ length: 20 }),
		currentStage: text().$type<ProcessStage>().default('INITIAL').notNull(),
		// Location fields
		recipientName: text({ length: 255 }),
		primaryAddress: text({ length: 255 }),
		secondaryAddress: text({ length: 255 }),
		locality: text({ length: 100 }),
		region: text({ length: 2 }),
		postalCode: text({ length: 10 }),
		territory: text({ length: 2 }).default('US').notNull(),
		// Additional profile fields
		avatarUrl: text({ length: 255 }),
		lastAccessAt: integer({ mode: 'timestamp_ms' }).default(new Date('2023-12-12')),
		emailConfirmed: integer({ mode: 'boolean' }).default(false).notNull(),
		phoneConfirmed: integer({ mode: 'boolean' }).default(false).notNull(),
		// Timestamps
		createdAt: integer({ mode: 'timestamp' })
			.default(sql`(CURRENT_TIMESTAMP)`)
			.notNull(),
		updatedAt: integer({ mode: 'timestamp' }).notNull(),
	},
	(profiles) => [
		index('index_1').on(profiles.serviceRef),
		index('index_2').on(profiles.contactEmail),
		index('index_3').on(profiles.externalRef),
	],
);

export type Profile = typeof profiles.$inferSelect;
export type ProfileToInsert = typeof profiles.$inferInsert;

export const profileAgreements = sqliteTable(
	'profile_agreements',
	{
		id: text()
			.$default(() => v4())
			.primaryKey(),
		profileId: blob()
			.references(() => profiles.id, { onDelete: 'cascade' })
			.notNull(),
		privacyConsent: integer({ mode: 'boolean' }).default(false).notNull(),
		serviceConsent: integer({ mode: 'boolean' }).default(false).notNull(),
		termsConsent: integer({ mode: 'boolean' }).default(false).notNull(),
		agreementDate: integer({ mode: 'timestamp' }).notNull(),
	},
	(table) => [uniqueIndex('index_4').on(table.profileId)],
);

export type ProfileAgreement = typeof profileAgreements.$inferSelect;
export type ProfileAgreementToInsert = typeof profileAgreements.$inferInsert;

export const facilities = sqliteTable('facilities', {
	id: blob()
		.$default(() => v4())
		.primaryKey(),
	facilityName: text({ length: 255 }).notNull(),
	serviceId: integer().notNull(),
	createdAt: integer({ mode: 'timestamp_ms' }).notNull(),
	updatedAt: integer({ mode: 'timestamp_ms' }).notNull(),
});

export type Facility = typeof facilities.$inferSelect;
export type FacilityToInsert = typeof facilities.$inferInsert;

export const identifiers = sqliteTable('identifiers', {
	id: blob()
		.$default(() => v4())
		.primaryKey(),
	code: text({ length: 50 }).notNull(),
	displayName: text({ length: 255 }).notNull(),
	description: text(),
	slug: text({ length: 255 }).notNull(),
	measurementUnit: text({ length: 50 }),
	standardRanges: text({ mode: 'json' }),
	guidelines: text({ mode: 'json' }),
	evaluationRules: text({ mode: 'json' }),
	isFeatured: integer({ mode: 'boolean' }).default(false),
});

export type Identifier = typeof identifiers.$inferSelect;
export type IdentifierToInsert = typeof identifiers.$inferInsert;

export const classifications = sqliteTable('classifications', {
	id: blob()
		.$default(() => v4())
		.primaryKey(),
	categoryName: text({ length: 255 }).notNull(),
	iconType: text({ length: 255 }),
	themeColor: text({ length: 255 }),
});

export type Classification = typeof classifications.$inferSelect;
export type ClassificationToInsert = typeof classifications.$inferInsert;

export const identifierClassifications = sqliteTable(
	'identifier_classifications',
	{
		identifierId: blob().references(() => identifiers.id),
		classificationId: text().references(() => classifications.id),
	},
	(table) => [
		primaryKey({ columns: [table.identifierId, table.classificationId] }),
	],
);

export type IdentifierClassification = typeof identifierClassifications.$inferSelect;
export type IdentifierClassificationToInsert = typeof identifierClassifications.$inferInsert;

export const impactFactors = sqliteTable('impact_factors', {
	id: blob()
		.$default(() => v4())
		.primaryKey(),
	factorName: text({ length: 255 }).notNull(),
});

export type ImpactFactor = typeof impactFactors.$inferSelect;
export type ImpactFactorToInsert = typeof impactFactors.$inferInsert;

export const impactFactorsToIdentifiers = sqliteTable(
	'impact_factors_to_identifiers',
	{
		impactFactorId: text().references(() => impactFactors.id),
		identifierId: text().references(() => identifiers.id),
	},
);

export type ImpactFactorsToIdentifiers = typeof impactFactorsToIdentifiers.$inferSelect;
export type ImpactFactorsToIdentifiersToInsert = typeof impactFactorsToIdentifiers.$inferInsert;

export const metricClusters = sqliteTable('metric_clusters', {
	id: blob()
		.$default(() => v4())
		.primaryKey(),
	clusterName: text({ length: 255 }).notNull(),
	slug: text({ length: 255 }).notNull(),
	description: text(),
	metricType: text({ length: 50 }).default('standard').notNull(),
	measurementUnit: text({ length: 50 }),
	isActive: integer({ mode: 'boolean' }).default(true).notNull(),
});

export type MetricCluster = typeof metricClusters.$inferSelect;
export type MetricClusterToInsert = typeof metricClusters.$inferInsert;

export const metricPreferences = sqliteTable(
	'metric_preferences',
	{
		id: blob()
			.$default(() => v4())
			.primaryKey(),
		profileId: blob().references(() => profiles.id),
		identifierId: text().references(() => identifiers.id),
	},
	(table) => [
		index('index_5').on(table.profileId),
		index('index_6').on(table.identifierId),
	],
);

export type MetricPreference = typeof metricPreferences.$inferSelect;
export type MetricPreferenceToInsert = typeof metricPreferences.$inferInsert;

export const dataPoints = sqliteTable(
	'data_points',
	{
		id: text()
			.$default(() => v4())
			.primaryKey(),
		pointId: integer().notNull(),
		clusterId: text().references(() => metricClusters.id),
		identifierId: blob().references(() => identifiers.id),
		pointName: text({ length: 255 }).notNull(),
		description: text(),
		dataType: text({ length: 50 }).default('standard').notNull(),
		isParent: integer({ mode: 'boolean' }).default(false).notNull(),
		measurementUnit: text({ length: 50 }),
		baseRate: real(),
		baseCentRate: integer().generatedAlwaysAs(
			(): SQL => sql`${dataPoints.baseRate} * 100`,
		),
		facilityId: blob()
			.references(() => facilities.id)
			.notNull(),
		isActive: integer({ mode: 'boolean' }).default(true).notNull(),
		visualType: text({ length: 50 }).default('numeric-trend'),
	},
	(table) => [uniqueIndex('index_7').on(table.clusterId, table.facilityId)],
);

export type DataPoint = typeof dataPoints.$inferSelect;
export type DataPointToInsert = typeof dataPoints.$inferInsert;

export const dataPointRelationships = sqliteTable(
	'data_point_relationships',
	{
		parentId: text()
			.references(() => dataPoints.id, { onDelete: 'cascade' })
			.notNull(),
		childId: text()
			.references(() => dataPoints.id, { onDelete: 'cascade' })
			.notNull(),
		displayOrder: integer(),
		createdAt: integer({ mode: 'timestamp' }).notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.parentId, table.childId] }),
		index('idx_data_point_relationships_child_id').on(table.childId),
	],
);

export type DataPointRelationship = typeof dataPointRelationships.$inferSelect;
export type DataPointRelationshipToInsert = typeof dataPointRelationships.$inferInsert;

export const packageClusters = sqliteTable('package_clusters', {
	id: text()
		.$default(() => v4())
		.primaryKey(),
	packageName: text({ length: 255 }).notNull(),
	slug: text({ length: 255 }).notNull(),
	description: text(),
	partnerId: text().references(() => partners.partnerId, {
		onDelete: 'set null',
	}),
	isActive: integer({ mode: 'boolean' }).default(true).notNull(),
	createdAt: integer({ mode: 'timestamp' }).notNull(),
	updatedAt: integer({ mode: 'timestamp' }).notNull(),
});

export type PackageCluster = typeof packageClusters.$inferSelect;
export type PackageClusterToInsert = typeof packageClusters.$inferInsert;

export const servicePackages = sqliteTable(
	'service_packages',
	{
		id: text()
			.$default(() => v4())
			.primaryKey(),
		clusterId: text()
			.references(() => packageClusters.id)
			.notNull(),
		packageTitle: text({ length: 255 }),
		description: text(),
		serviceRef: text({ length: 100 }).notNull(),
		baseRate: real().notNull(),
		baseCentRate: integer().generatedAlwaysAs(
			(): SQL => sql`${servicePackages.baseRate} * 100`,
		),
		discountRate: real(),
		discountCentRate: integer().generatedAlwaysAs(
			(): SQL => sql`${servicePackages.discountRate} * 100`,
		),
		facilityId: text()
			.references(() => facilities.id)
			.notNull(),
		isPartnerCreated: integer({ mode: 'boolean' }).default(false).notNull(),
		allowsRemoteCollection: integer({ mode: 'boolean' })
			.default(false)
			.notNull(),
		partnerId: text().references(() => partners.partnerId),
		isActive: integer({ mode: 'boolean' }).default(true).notNull(),
		createdAt: integer({ mode: 'timestamp' }).notNull(),
		updatedAt: integer({ mode: 'timestamp' }).notNull(),
	},
	(table) => [
		uniqueIndex('uk_service_packages_clusterId_facilityId').on(
			table.clusterId,
			table.facilityId,
		),
	],
);

export type ServicePackage = typeof servicePackages.$inferSelect;
export type ServicePackageToInsert = typeof servicePackages.$inferInsert;

export const servicePackageDataPoints = sqliteTable(
	'service_package_data_points',
	{
		packageId: text()
			.references(() => servicePackages.id, { onDelete: 'cascade' })
			.notNull(),
		dataPointId: text()
			.references(() => dataPoints.id, { onDelete: 'cascade' })
			.notNull(),
		displayOrder: integer(),
		createdAt: integer({ mode: 'timestamp' }).notNull(),
	},
	(table) => [primaryKey({ columns: [table.packageId, table.dataPointId] })],
);

export type ServicePackageDataPoint = typeof servicePackageDataPoints.$inferSelect;
export type ServicePackageDataPointToInsert = typeof servicePackageDataPoints.$inferInsert;

export const collectionEvents = sqliteTable('collection_events', {
	id: text()
		.$default(() => v4())
		.primaryKey(),
	requestId: text().references(() => requests.id, {
		onDelete: 'cascade',
	}),
	profileId: text().references(() => profiles.id, { onDelete: 'cascade' }),
	facilityId: text().references(() => facilities.id),
	collectionDate: integer({ mode: 'timestamp' }),
	reportDate: integer({ mode: 'timestamp' }),
	receivedDate: integer({ mode: 'timestamp' }),
	eventStatus: text({ length: 50 }).default('initiated'),
	dataSource: text({ length: 50 }).default(''),
	specimenRef: text({ length: 100 }),
	eventMetadata: text(),
	documentUrl: text({ length: 255 }),
	hasNewData: integer({ mode: 'boolean' }).notNull().default(false),
	createdAt: integer({ mode: 'timestamp' }).notNull(),
	updatedAt: integer({ mode: 'timestamp' }).notNull(),
});

export type CollectionEvent = typeof collectionEvents.$inferSelect;
export type CollectionEventToInsert = typeof collectionEvents.$inferInsert;

export const measurements = sqliteTable(
	'measurements',
	{
		id: text()
			.$default(() => v4())
			.primaryKey(),
		measurementName: text(),
		slug: text(),
		eventId: text().references(() => collectionEvents.id, {
			onDelete: 'cascade',
		}),
		profileId: text().references(() => profiles.id),
		dataPointId: text().references(() => dataPoints.id),
		identifierId: text().references(() => identifiers.id),
		resultValue: text(),
		numericResult: real(),
		rawResult: text({ length: 50 }),
		measurementUnit: text({ length: 50 }),
		facilityInterpretation: text({ length: 50 }),
		facilityMinRange: real(),
		facilityMaxRange: real(),
		systemNotes: text(),
		profileNotes: text(),
		profileActions: text(),
		measurementMetadata: text(),
		processingStatus: text({ length: 50 }).default('partial_data'),
		recordedAt: integer({ mode: 'timestamp' }).notNull(),
		isNotified: integer({ mode: 'boolean' }).default(false),
		isArchived: integer({ mode: 'boolean' }).default(false),
		createdAt: integer({ mode: 'timestamp' }).notNull(),
		updatedAt: integer({ mode: 'timestamp' }).notNull(),
	},
	(table) => [
		index('idx_measurements_eventId').on(table.eventId),
		index('idx_measurements_identifierId').on(table.identifierId),
		index('idx_measurements_dataPointId').on(table.dataPointId),
	],
);

export type Measurement = typeof measurements.$inferSelect;
export type MeasurementToInsert = typeof measurements.$inferInsert;

export const partners = sqliteTable(
	'partners',
	{
		id: text()
			.$default(() => v4())
			.primaryKey(),
		partnerId: text().notNull(),
		slug: text({ length: 255 }),
		promoCode: text(),
		referralCode: text(),
		partnerFirstName: text({ length: 255 }).notNull(),
		partnerLastName: text({ length: 255 }).notNull(),
		displayName: text({ length: 255 }),
		description: text(),
		logoUrl: text({ length: 255 }),
		isActive: integer({ mode: 'boolean' }).default(true),
		partnerMetadata: text(),
		createdAt: integer({ mode: 'timestamp' }).notNull(),
		updatedAt: integer({ mode: 'timestamp' }).notNull(),
	},
	(partners) => [
		index('idx_partners_promoCode').on(partners.promoCode),
		index('idx_partners_partnerId').on(partners.partnerId),
	],
);

export type Partner = typeof partners.$inferSelect;

// export const partnerRelationships = sqliteTable(
// 	'partner_relationships',
// 	{
// 		parentPartnerId: text()
// 			.references(() => partners.id, { onDelete: 'cascade' })
// 			.notNull(),
// 		childPartnerId: text()
// 			.references(() => partners.id, { onDelete: 'cascade' })
// 			.notNull(),
// 		createdAt: integer({ mode: 'timestamp' }).notNull(),
// 	},
// 	(table) => [
// 		primaryKey({ columns: [table.parentPartnerId, table.childPartnerId] }),
// 		index('idx_partner_relationships_childPartnerId').on(table.childPartnerId),
// 	],
// );

export type RequestStatus =
	| 'pending'
	| 'processed'
	| 'processing_failed'
	| 'service_creation_failed'
	| 'service_results_failed'
	| 'refund_pending'
	| 'refunded'
	| 'refund_failed'
	| 'processing_cancellation'
	| 'received.standard.ordered'
	| 'received.standard.document_created'
	| 'sample_processing.standard.partial_data'
	| 'collecting_sample.standard.appointment_scheduled'
	| 'completed.standard.completed'
	| 'failed.standard.sample_error'
	| 'cancelled.standard.cancelled'
	| 'received.remote.ordered'
	| 'received.remote.document_created'
	| 'collecting_sample.remote.appointment_scheduled'
	| 'sample_processing.remote.partial_data'
	| 'completed.remote.completed'
	| 'cancelled.remote.cancelled';

// export const serviceRequestStatuses: RequestStatus[] = [
// 	'service_results_failed',
// 	'received.standard.ordered',
// 	'received.standard.document_created',
// 	'sample_processing.standard.partial_data',
// 	'completed.standard.completed',
// 	'failed.standard.sample_error',
// 	'cancelled.standard.cancelled',
// 	'received.remote.ordered',
// 	'received.remote.document_created',
// 	'collecting_sample.remote.appointment_scheduled',
// 	'sample_processing.remote.partial_data',
// 	'completed.remote.completed',
// 	'cancelled.remote.cancelled',
// ];

export interface Location {
	primaryAddress: string;
	secondaryAddress?: string;
	locality: string;
	region: string;
	postalCode: string;
	territory: string;
}

export type RequestType = 'standard' | 'remote';

export const requests = sqliteTable(
	'requests',
	{
		id: text()
			.$default(() => v4())
			.primaryKey(),
		requestNumber: integer().notNull(),
		serviceRequestId: text(),
		totalAmount: real().notNull(),
		centAmount: integer().generatedAlwaysAs(
			(): SQL => sql`${requests.totalAmount} * 100`,
		),
		requestStatus: text({ length: 100 }).$type<RequestStatus>().notNull(),
		promoCode: text(),
		referralCode: text(),
		profileId: text()
			.references(() => profiles.id, { onDelete: 'cascade' })
			.notNull(),
		facilityId: text().references(() => facilities.id, {
			onDelete: 'set null',
		}),
		receiptUrl: text({ length: 255 }),
		itemCount: integer().notNull(),
		requestMetadata: text(),
		requestType: text().$type<RequestType>().default('standard').notNull(),
		location: text().$type<Location>(),
		createdAt: integer({ mode: 'timestamp' }).notNull(),
		updatedAt: integer({ mode: 'timestamp' }).notNull(),
	},
	(table) => [
		index('requests_profileId_idx').on(table.profileId),
		index('requests_requestNumber_idx').on(table.requestNumber),
		index('requests_requestStatus_idx').on(table.requestStatus),
		index('requests_serviceRequestId_idx').on(table.serviceRequestId),
		index('requests_promoCode_idx').on(table.promoCode),
		index('requests_referralCode_idx').on(table.referralCode),
		index('requests_requestType_idx').on(table.requestType),
	],
);

export type Request = typeof requests.$inferSelect;
export type RequestToInsert = typeof requests.$inferInsert;

export const requestsToDataPoints = sqliteTable(
	'requests_to_data_points',
	{
		requestId: text()
			.references(() => requests.id, { onDelete: 'cascade' })
			.notNull(),
		dataPointId: text()
			.references(() => dataPoints.id, { onDelete: 'cascade' })
			.notNull(),
		itemRate: real().notNull(),
		centRate: integer().generatedAlwaysAs(
			(): SQL => sql`${requestsToDataPoints.itemRate} * 100`,
		),
	},
	(table) => [
		index('requestsToDataPoints_requestId_idx').on(table.requestId),
		index('requestsToDataPoints_dataPointId_idx').on(table.dataPointId),
	],
);

export type RequestToDataPoint = typeof requestsToDataPoints.$inferSelect;
export type RequestToDataPointToInsert = typeof requestsToDataPoints.$inferInsert;

export const requestsToServicePackages = sqliteTable(
	'requests_to_service_packages',
	{
		requestId: text()
			.references(() => requests.id, { onDelete: 'cascade' })
			.notNull(),
		servicePackageId: text()
			.references(() => servicePackages.id, { onDelete: 'cascade' })
			.notNull(),
		packageRate: real().notNull(),
		centRate: integer().generatedAlwaysAs(
			(): SQL => sql`${requestsToServicePackages.packageRate} * 100`,
		),
	},
	(table) => [
		index('requestsToServicePackages_requestId_idx').on(table.requestId),
		index('requestsToServicePackages_servicePackageId_idx').on(
			table.servicePackageId,
		),
	],
);

export type RequestToServicePackage = typeof requestsToServicePackages.$inferSelect;
export type RequestToServicePackageToInsert = typeof requestsToServicePackages.$inferInsert;

export const selections = sqliteTable(
	'selections',
	{
		id: text()
			.$default(() => v4())
			.primaryKey(),
		profileId: text()
			.references(() => profiles.id, { onDelete: 'cascade' })
			.notNull(),
		facilityId: text().references(() => facilities.id),
		createdAt: integer({ mode: 'timestamp' }).notNull(),
		updatedAt: integer({ mode: 'timestamp' }).notNull(),
	},
	(table) => [
		index('selections_profileId_idx').on(table.profileId),
		index('selections_facilityId_idx').on(table.facilityId),
		uniqueIndex('selections_id_profileId_unique').on(table.id, table.profileId),
	],
);

export type Selection = typeof selections.$inferSelect;
export type SelectionToInsert = typeof selections.$inferInsert;

export const selectionsToDataPoints = sqliteTable(
	'selections_to_data_points',
	{
		selectionId: text()
			.references(() => selections.id, { onDelete: 'cascade' })
			.notNull(),
		dataPointId: text()
			.references(() => dataPoints.id, { onDelete: 'cascade' })
			.notNull(),
	},
	(table) => [
		index('selectionsToDataPoints_selectionId_idx').on(table.selectionId),
		index('selectionsToDataPoints_dataPointId_idx').on(table.dataPointId),
		uniqueIndex('selectionsToDataPoints_selectionId_dataPointId_unique').on(
			table.selectionId,
			table.dataPointId,
		),
	],
);

export type SelectionToDataPoint = typeof selectionsToDataPoints.$inferSelect;

export const selectionsToServicePackages = sqliteTable(
	'selections_to_service_packages',
	{
		selectionId: text()
			.references(() => selections.id, { onDelete: 'cascade' })
			.notNull(),
		servicePackageId: text()
			.references(() => servicePackages.id, { onDelete: 'cascade' })
			.notNull(),
	},
	(table) => [
		index('selectionsToServicePackages_selectionId_idx').on(table.selectionId),
		index('selectionsToServicePackages_servicePackageId_idx').on(
			table.servicePackageId,
		),
		uniqueIndex(
			'selectionsToServicePackages_selectionId_servicePackageId_unique',
		).on(table.selectionId, table.servicePackageId),
	],
);

export type SelectionToServicePackage = typeof selectionsToServicePackages.$inferSelect;

export type ProcessorPaymentStatus =
	| 'PENDING'
	| 'SUCCESS'
	| 'DECLINE'
	| 'UNKNOWN';
export type PaymentProcessor = 'PROCESSOR_A' | 'PROCESSOR_B';

export const transactions = sqliteTable(
	'transactions',
	{
		id: text()
			.$default(() => v4())
			.primaryKey(),
		token: text(),
		transactionId: text().notNull(),
		sourceId: text(),
		profileId: text()
			.references(() => profiles.id, { onDelete: 'cascade' })
			.notNull(),
		requestId: text()
			.references(() => requests.id)
			.notNull(),
		transactionStatus: text({ length: 50 }).notNull(),
		amount: real().notNull(),
		centAmount: integer().generatedAlwaysAs(
			(): SQL => sql`${transactions.amount} * 100`,
		),
		currency: text({ length: 10 }).notNull(),
		responseData: text(),
		transactionMetadata: text(),
		processor: text()
			.$type<PaymentProcessor>()
			.notNull()
			.default('PROCESSOR_A'),
		createdAt: integer({ mode: 'timestamp' }).notNull(),
		updatedAt: integer({ mode: 'timestamp' }).notNull(),
	},
	(table) => [
		uniqueIndex('transactions_transactionId_processor_unique').on(
			table.transactionId,
			table.processor,
		),
		index('transactions_token_idx').on(table.token),
		index('transactions_transactionId_idx').on(table.transactionId),
		index('transactions_profileId_idx').on(table.profileId),
		index('transactions_requestId_idx').on(table.requestId),
		index('transactions_transactionStatus_idx').on(table.transactionStatus),
	],
);

export type Transaction = typeof transactions.$inferSelect;
export type TransactionToInsert = typeof transactions.$inferInsert;

export type TransactionEventType =
	| 'transaction.created'
	| 'transaction.updated';
export type ProcessorEventType =
	| 'transaction.sale.success'
	| 'transaction.sale.failure'
	| 'transaction.sale.unknown';

export const transactionEvents = sqliteTable(
	'transaction_events',
	{
		id: text()
			.$default(() => v4())
			.primaryKey(),
		eventType: text({ length: 50 })
			.$type<TransactionEventType | ProcessorEventType>()
			.notNull(),
		eventId: text().notNull(),
		transactionId: text()
			.references(() => transactions.transactionId, { onDelete: 'cascade' })
			.notNull(),
		eventMetadata: text().notNull(),
		processor: text()
			.$type<PaymentProcessor>()
			.notNull()
			.default('PROCESSOR_A'),
		createdAt: integer({ mode: 'timestamp' }).notNull(),
	},
	(table) => [
		uniqueIndex('transactionEvents_eventId_unique').on(table.eventId),
		index('transactionEvents_eventType_idx').on(table.eventType),
		index('transactionEvents_transactionId_idx').on(table.transactionId),
	],
);

export type TransactionEvent = typeof transactionEvents.$inferSelect;
export type TransactionEventToInsert = typeof transactionEvents.$inferInsert;

export const serviceEvents = sqliteTable(
	'service_events',
	{
		id: text()
			.$default(() => v4())
			.primaryKey(),
		profileId: text()
			.references(() => profiles.id, { onDelete: 'cascade' })
			.notNull(),
		serviceUserId: text().notNull(),
		requestId: text()
			.references(() => requests.id, { onDelete: 'cascade' })
			.notNull(),
		serviceRequestId: text().notNull(),
		eventType: text().notNull(),
		eventId: integer().notNull(),
		appointmentEventId: text(),
		eventStatus: text().notNull(),
		appointmentStatus: text(),
		eventMetadata: text().notNull(),
		createdAt: integer({ mode: 'timestamp' }).notNull(),
	},
	(serviceEvents) => [
		index('serviceEvents_profileId_idx').on(serviceEvents.profileId),
		index('serviceEvents_serviceUserId_idx').on(serviceEvents.serviceUserId),
		index('serviceEvents_requestId_idx').on(serviceEvents.requestId),
		index('serviceEvents_serviceRequestId_idx').on(
			serviceEvents.serviceRequestId,
		),
		index('serviceEvents_eventId_idx').on(serviceEvents.eventId),
		index('serviceEvents_eventType_idx').on(serviceEvents.eventType),
		index('serviceEvents_eventStatus_idx').on(serviceEvents.eventStatus),
	],
);

export type ServiceEvent = typeof serviceEvents.$inferSelect;
export type ServiceEventToInsert = typeof serviceEvents.$inferInsert;

export type PartnerSubscriptionType = 'promo' | 'referral' | 'custom_package';

export const partnerSubscriptions = sqliteTable(
	'partner_subscriptions',
	{
		id: text()
			.$default(() => v4())
			.primaryKey(),
		partnerId: text()
			.references(() => partners.id, { onDelete: 'cascade' })
			.notNull(),
		profileId: text()
			.references(() => profiles.id, { onDelete: 'cascade' })
			.notNull(),
		promoCode: text(),
		referralCode: text(),
		subscriptionType: text().$type<PartnerSubscriptionType>().notNull(),
		expiredAt: integer({ mode: 'timestamp' }).notNull(),
		createdAt: integer({ mode: 'timestamp' }).notNull(),
		updatedAt: integer({ mode: 'timestamp' }).notNull(),
	},
	(partnerSubscriptions) => [
		uniqueIndex('partnerSubscriptions_profileId_partnerId_unique').on(
			partnerSubscriptions.profileId,
			partnerSubscriptions.partnerId,
		),
		index('partnerSubscriptions_profileId_idx').on(
			partnerSubscriptions.profileId,
		),
		index('partnerSubscriptions_partnerId_idx').on(
			partnerSubscriptions.partnerId,
		),
		index('partnerSubscriptions_promoCode_idx').on(
			partnerSubscriptions.promoCode,
		),
		index('partnerSubscriptions_referralCode_idx').on(
			partnerSubscriptions.referralCode,
		),
		index('partnerSubscriptions_subscriptionType_idx').on(
			partnerSubscriptions.subscriptionType,
		),
		index('partnerSubscriptions_expiredAt_idx').on(
			partnerSubscriptions.expiredAt,
		),
	],
);

export type PartnerSubscription = typeof partnerSubscriptions.$inferSelect;
export type PartnerSubscriptionToInsert = typeof partnerSubscriptions.$inferInsert;

export const reversals = sqliteTable(
	'reversals',
	{
		id: text()
			.$default(() => v4())
			.primaryKey(),
		token: text().notNull(),
		transactionId: text()
			.notNull()
			.references(() => transactions.id),
		reversalId: text().notNull(),
		profileId: text()
			.references(() => profiles.id, { onDelete: 'cascade' })
			.notNull(),
		requestId: text()
			.references(() => requests.id)
			.notNull(),
		reversalStatus: text({ length: 50 }).notNull(),
		amount: real().notNull(),
		centAmount: integer().generatedAlwaysAs(
			(): SQL => sql`${reversals.amount} * 100`,
		),
		currency: text({ length: 10 }).notNull(),
		reversalMetadata: text().notNull(),
		createdAt: integer({ mode: 'timestamp' }).notNull(),
		updatedAt: integer({ mode: 'timestamp' }).notNull(),
	},
	(table) => [
		uniqueIndex('reversals_token_unique').on(table.token),
		index('reversals_transactionId_idx').on(table.transactionId),
		index('reversals_profileId_idx').on(table.profileId),
		index('reversals_requestId_idx').on(table.requestId),
		index('reversals_reversalStatus_idx').on(table.reversalStatus),
		index('reversals_reversalId_idx').on(table.reversalId),
	],
);

export type Reversal = typeof reversals.$inferSelect;
export type ReversalToInsert = typeof reversals.$inferInsert;

export type ReversalEventType = 'reversal.created' | 'reversal.updated';

export const reversalEvents = sqliteTable(
	'reversal_events',
	{
		id: text()
			.$default(() => v4())
			.primaryKey(),
		eventType: text({ length: 50 }).$type<ReversalEventType>().notNull(),
		eventId: text().notNull(),
		reversalId: text()
			.references(() => reversals.id, { onDelete: 'cascade' })
			.notNull(),
		transactionId: text()
			.references(() => transactions.id, { onDelete: 'cascade' })
			.notNull(),
		eventMetadata: text().notNull(),
		createdAt: integer({ mode: 'timestamp' }).notNull(),
	},
	(table) => [
		uniqueIndex('reversalEvents_eventId_unique').on(table.eventId),
		index('reversalEvents_eventType_idx').on(table.eventType),
		index('reversalEvents_transactionId_idx').on(table.transactionId),
		index('reversalEvents_reversalId_idx').on(table.reversalId),
	],
);

export type ReversalEvent = typeof reversalEvents.$inferSelect;
export type ReversalEventToInsert = typeof reversalEvents.$inferInsert;

export const schedules = sqliteTable(
	'schedules',
	{
		id: text()
			.$default(() => v4())
			.primaryKey(),
		profileId: text()
			.references(() => profiles.id, { onDelete: 'cascade' })
			.notNull(),
		scheduleTitle: text({ length: 255 }).notNull(),
		description: text(),
		startDate: integer({ mode: 'timestamp' }).notNull(),
		endDate: integer({ mode: 'timestamp' }),
		isCurrent: integer({ mode: 'boolean' }).default(false).notNull(),
		themeColor: text({ length: 50 }).notNull(),
		isPrivate: integer({ mode: 'boolean' }).default(false).notNull(),
		applyToAllCharts: integer({ mode: 'boolean' }).default(false).notNull(),
		isVisible: integer({ mode: 'boolean' }).default(true).notNull(),
		isArchived: integer({ mode: 'boolean' }).default(false).notNull(),
		profileActions: text(),
		createdAt: integer({ mode: 'timestamp' }).notNull(),
		updatedAt: integer({ mode: 'timestamp' }).notNull(),
	},
	(table) => [
		index('schedules_profileId_idx').on(table.profileId),
		index('schedules_startDate_endDate_idx').on(table.startDate, table.endDate),
	],
);

export type Schedule = typeof schedules.$inferSelect;
export type ScheduleToInsert = typeof schedules.$inferInsert;

export const schedulesToIdentifiers = sqliteTable(
	'schedules_to_identifiers',
	{
		scheduleId: text()
			.references(() => schedules.id, {
				onDelete: 'cascade',
			})
			.notNull(),
		identifierId: text()
			.references(() => identifiers.id, {
				onDelete: 'cascade',
			})
			.notNull(),
		createdAt: integer({ mode: 'timestamp' }).notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.scheduleId, table.identifierId] }),
		index('schedulesToIdentifiers_identifierId_idx').on(table.identifierId),
	],
);

export type ScheduleToIdentifier = typeof schedulesToIdentifiers.$inferSelect;
export type ScheduleToIdentifierToInsert = typeof schedulesToIdentifiers.$inferInsert;

export const scheduleShares = sqliteTable(
	'schedule_shares',
	{
		id: text()
			.$default(() => v4())
			.primaryKey(),
		shareToken: text().notNull(),
		scheduleId: text()
			.references(() => schedules.id, { onDelete: 'cascade' })
			.notNull(),
		profileId: text()
			.references(() => profiles.id, { onDelete: 'cascade' })
			.notNull(),
		accessCount: integer().default(0).notNull(),
		createdAt: integer({ mode: 'timestamp' }).notNull(),
	},
	(table) => [
		index('scheduleShares_shareToken_idx').on(table.shareToken),
		index('scheduleShares_scheduleId_idx').on(table.scheduleId),
		index('scheduleShares_profileId_idx').on(table.profileId),
	],
);

export type ScheduleShare = typeof scheduleShares.$inferSelect;
export type ScheduleShareToInsert = typeof scheduleShares.$inferInsert;

export const processingProviders = sqliteTable(
	'processing_providers',
	{
		id: text()
			.$default(() => v4())
			.primaryKey(),
		processor: text().$type<PaymentProcessor>().notNull(),
		isActive: integer({ mode: 'boolean' }).notNull(),
		createdAt: integer({ mode: 'timestamp' }).notNull(),
	},
	(processingProviders) => [
		index('processingProviders_processor_idx').on(
			processingProviders.processor,
		),
		index('processingProviders_isActive_idx').on(processingProviders.isActive),
	],
);

export type ProcessingProvider = typeof processingProviders.$inferSelect;
