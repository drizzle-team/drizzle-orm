import { SQL, sql } from 'drizzle-orm';
import {
	boolean,
	date,
	decimal,
	index,
	integer,
	jsonb,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uniqueIndex,
	uuid,
	varchar,
} from 'drizzle-orm/pg-core';

// Enum types for entity classification
type EntityClass = 'ALPHA' | 'BETA' | 'GAMMA';
type AccessLevel = 'STANDARD' | 'PREMIUM';
type ProcessStage = 'INITIAL' | 'COMPLETE';

export const profiles = pgTable('profiles', {
	id: uuid().defaultRandom().primaryKey(),
	externalRef: varchar({ length: 255 }).notNull().unique(),
	serviceRef: varchar().unique(),
	contactEmail: varchar({ length: 255 }).notNull().unique(),
	givenName: varchar({ length: 100 }).notNull(),
	familyName: varchar({ length: 100 }).notNull(),
	accessLevel: varchar().$type<AccessLevel>().notNull(),
	birthDate: date(),
	classification: varchar({ length: 50 }).$type<EntityClass>(),
	contactNumber: varchar({ length: 20 }),
	currentStage: varchar().$type<ProcessStage>().default('INITIAL').notNull(),
	// Location fields
	recipientName: varchar({ length: 255 }),
	primaryAddress: varchar({ length: 255 }),
	secondaryAddress: varchar({ length: 255 }),
	locality: varchar({ length: 100 }),
	region: varchar({ length: 2 }),
	postalCode: varchar({ length: 10 }),
	territory: varchar({ length: 2 }).default('US').notNull(),
	// Additional profile fields
	avatarUrl: varchar({ length: 255 }),
	lastAccessAt: timestamp({ withTimezone: true }),
	emailConfirmed: boolean().default(false).notNull(),
	phoneConfirmed: boolean().default(false).notNull(),
	// Timestamps
	createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
}, (profiles) => [
	index().on(profiles.serviceRef),
	index().on(profiles.contactEmail),
	index().on(profiles.externalRef),
]);

export type Profile = typeof profiles.$inferSelect;
export type ProfileToInsert = typeof profiles.$inferInsert;

export const profileAgreements = pgTable(
	'profile_agreements',
	{
		id: uuid().defaultRandom().primaryKey(),
		profileId: uuid()
			.references(() => profiles.id, { onDelete: 'cascade' })
			.notNull(),
		privacyConsent: boolean().default(false).notNull(),
		serviceConsent: boolean().default(false).notNull(),
		termsConsent: boolean().default(false).notNull(),
		agreementDate: timestamp({ withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		uniqueIndex().on(table.profileId),
	],
);

export type ProfileAgreement = typeof profileAgreements.$inferSelect;
export type ProfileAgreementToInsert = typeof profileAgreements.$inferInsert;

export const facilities = pgTable('facilities', {
	id: uuid().defaultRandom().primaryKey(),
	facilityName: varchar({ length: 255 }).notNull(),
	serviceId: integer().notNull().unique(),
	createdAt: timestamp({ withTimezone: true })
		.defaultNow()
		.notNull(),
	updatedAt: timestamp({ withTimezone: true })
		.defaultNow()
		.notNull(),
});

export type Facility = typeof facilities.$inferSelect;
export type FacilityToInsert = typeof facilities.$inferInsert;

export const identifiers = pgTable('identifiers', {
	id: uuid().defaultRandom().primaryKey(),
	code: varchar({ length: 50 }).notNull().unique(),
	displayName: varchar({ length: 255 }).notNull(),
	description: text(),
	slug: varchar({ length: 255 }).notNull().unique(),
	measurementUnit: varchar({ length: 50 }),
	standardRanges: jsonb(),
	guidelines: jsonb(),
	evaluationRules: jsonb(),
	isFeatured: boolean().default(false),
	createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
});

export type Identifier = typeof identifiers.$inferSelect;
export type IdentifierToInsert = typeof identifiers.$inferInsert;

export const classifications = pgTable('classifications', {
	id: uuid().defaultRandom().primaryKey(),
	categoryName: varchar({ length: 255 }).notNull(),
	iconType: varchar({ length: 255 }),
	themeColor: varchar({ length: 255 }),
	createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
});

export type Classification = typeof classifications.$inferSelect;
export type ClassificationToInsert = typeof classifications.$inferInsert;

export const identifierClassifications = pgTable('identifier_classifications', {
	identifierId: uuid().references(() => identifiers.id),
	classificationId: uuid().references(() => classifications.id),
	createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
}, (table) => [primaryKey({ columns: [table.identifierId, table.classificationId] })]);

export type IdentifierClassification = typeof identifierClassifications.$inferSelect;
export type IdentifierClassificationToInsert = typeof identifierClassifications.$inferInsert;

export const impactFactors = pgTable('impact_factors', {
	id: uuid().defaultRandom().primaryKey(),
	factorName: varchar({ length: 255 }).notNull(),
	createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
});

export type ImpactFactor = typeof impactFactors.$inferSelect;
export type ImpactFactorToInsert = typeof impactFactors.$inferInsert;

export const impactFactorsToIdentifiers = pgTable('impact_factors_to_identifiers', {
	impactFactorId: uuid().references(() => impactFactors.id),
	identifierId: uuid().references(() => identifiers.id),
});

export type ImpactFactorsToIdentifiers = typeof impactFactorsToIdentifiers.$inferSelect;
export type ImpactFactorsToIdentifiersToInsert = typeof impactFactorsToIdentifiers.$inferInsert;

export const metricClusters = pgTable('metric_clusters', {
	id: uuid().defaultRandom().primaryKey(),
	clusterName: varchar({ length: 255 }).notNull(),
	slug: varchar({ length: 255 }).notNull().unique(),
	description: text(),
	metricType: varchar({ length: 50 }).default('standard').notNull(),
	measurementUnit: varchar({ length: 50 }),
	isActive: boolean().default(true).notNull(),
	createdAt: timestamp({ withTimezone: true })
		.defaultNow()
		.notNull(),
	updatedAt: timestamp({ withTimezone: true })
		.defaultNow()
		.notNull(),
});

export type MetricCluster = typeof metricClusters.$inferSelect;
export type MetricClusterToInsert = typeof metricClusters.$inferInsert;

export const metricPreferences = pgTable(
	'metric_preferences',
	{
		id: uuid().defaultRandom().primaryKey(),
		profileId: uuid().references(() => profiles.id),
		identifierId: uuid().references(() => identifiers.id),
		createdAt: timestamp({ withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp({ withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index().on(table.profileId),
		index().on(table.identifierId),
	],
);

export type MetricPreference = typeof metricPreferences.$inferSelect;
export type MetricPreferenceToInsert = typeof metricPreferences.$inferInsert;

export const dataPoints = pgTable('data_points', {
	id: uuid().defaultRandom().primaryKey(),
	pointId: integer().notNull(),
	clusterId: uuid().references(() => metricClusters.id),
	identifierId: uuid().references(() => identifiers.id),
	pointName: varchar({ length: 255 }).notNull(),
	description: text(),
	dataType: varchar({ length: 50 }).default('standard').notNull(),
	isParent: boolean().default(false).notNull(),
	measurementUnit: varchar({ length: 50 }),
	baseRate: decimal({ precision: 10, scale: 2 }),
	baseCentRate: integer().generatedAlwaysAs((): SQL => sql`${dataPoints.baseRate} * 100`),
	facilityId: uuid().references(() => facilities.id).notNull(),
	isActive: boolean().default(true).notNull(),
	visualType: varchar({ length: 50 }).default('numeric-trend'),
	createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
}, (table) => [index().on(table.clusterId, table.facilityId)]);

export type DataPoint = typeof dataPoints.$inferSelect;
export type DataPointToInsert = typeof dataPoints.$inferInsert;

export const dataPointRelationships = pgTable(
	'data_point_relationships',
	{
		parentId: uuid()
			.references(() => dataPoints.id, { onDelete: 'cascade' })
			.notNull(),
		childId: uuid()
			.references(() => dataPoints.id, { onDelete: 'cascade' })
			.notNull(),
		displayOrder: integer(),
		createdAt: timestamp({ withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.parentId, table.childId] }),
		index().on(table.childId),
	],
);

export type DataPointRelationship = typeof dataPointRelationships.$inferSelect;
export type DataPointRelationshipToInsert = typeof dataPointRelationships.$inferInsert;

export const packageClusters = pgTable('package_clusters', {
	id: uuid().defaultRandom().primaryKey(),
	packageName: varchar({ length: 255 }).notNull(),
	slug: varchar({ length: 255 }).notNull().unique(),
	description: text(),
	partnerId: text().references(() => partners.partnerId, {
		onDelete: 'set null',
	}),
	isActive: boolean().default(true).notNull(),
	createdAt: timestamp({ withTimezone: true })
		.defaultNow()
		.notNull(),
	updatedAt: timestamp({ withTimezone: true })
		.defaultNow()
		.notNull(),
});

export type PackageCluster = typeof packageClusters.$inferSelect;
export type PackageClusterToInsert = typeof packageClusters.$inferInsert;

export const servicePackages = pgTable('service_packages', {
	id: uuid().defaultRandom().primaryKey(),
	clusterId: uuid().references(() => packageClusters.id).notNull(),
	packageTitle: varchar({ length: 255 }),
	description: text(),
	serviceRef: varchar({ length: 100 }).notNull().unique(),
	baseRate: decimal({ precision: 10, scale: 2 }).notNull(),
	baseCentRate: integer().generatedAlwaysAs((): SQL => sql`${servicePackages.baseRate} * 100`),
	discountRate: decimal({ precision: 10, scale: 2 }),
	discountCentRate: integer().generatedAlwaysAs((): SQL => sql`${servicePackages.discountRate} * 100`),
	facilityId: uuid().references(() => facilities.id).notNull(),
	isPartnerCreated: boolean().default(false).notNull(),
	allowsRemoteCollection: boolean().default(false).notNull(),
	partnerId: text().references(() => partners.partnerId),
	isActive: boolean().default(true).notNull(),
	createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex().on(table.clusterId, table.facilityId),
]);

export type ServicePackage = typeof servicePackages.$inferSelect;
export type ServicePackageToInsert = typeof servicePackages.$inferInsert;

export const servicePackageDataPoints = pgTable('service_package_data_points', {
	packageId: uuid().references(() => servicePackages.id, { onDelete: 'cascade' }).notNull(),
	dataPointId: uuid().references(() => dataPoints.id, { onDelete: 'cascade' }).notNull(),
	displayOrder: integer(),
	createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
}, (table) => [primaryKey({ columns: [table.packageId, table.dataPointId] })]);

export type ServicePackageDataPoint = typeof servicePackageDataPoints.$inferSelect;
export type ServicePackageDataPointToInsert = typeof servicePackageDataPoints.$inferInsert;

export const collectionEvents = pgTable('collection_events', {
	id: uuid().defaultRandom().primaryKey(),
	requestId: uuid().references(() => requests.id, {
		onDelete: 'cascade',
	}),
	profileId: uuid().references(() => profiles.id, { onDelete: 'cascade' }),
	facilityId: uuid().references(() => facilities.id),
	collectionDate: timestamp({ withTimezone: true }),
	reportDate: timestamp({ withTimezone: true }),
	receivedDate: timestamp({ withTimezone: true }),
	eventStatus: varchar({ length: 50 }).default('initiated'),
	dataSource: varchar({ length: 50 }).default(''),
	specimenRef: varchar({ length: 100 }),
	eventMetadata: jsonb(),
	documentUrl: varchar({ length: 255 }),
	hasNewData: boolean().notNull().default(false),
	createdAt: timestamp({ withTimezone: true })
		.defaultNow()
		.notNull(),
	updatedAt: timestamp({ withTimezone: true })
		.defaultNow()
		.notNull(),
});

export type CollectionEvent = typeof collectionEvents.$inferSelect;
export type CollectionEventToInsert = typeof collectionEvents.$inferInsert;

export const measurements = pgTable(
	'measurements',
	{
		id: uuid().defaultRandom().primaryKey(),
		measurementName: varchar(),
		slug: varchar(),
		eventId: uuid().references(() => collectionEvents.id, {
			onDelete: 'cascade',
		}),
		profileId: uuid().references(() => profiles.id),
		dataPointId: uuid().references(() => dataPoints.id),
		identifierId: uuid().references(() => identifiers.id),
		resultValue: text(),
		numericResult: decimal({ precision: 10, scale: 2 }),
		rawResult: varchar({ length: 50 }),
		measurementUnit: varchar({ length: 50 }),
		facilityInterpretation: varchar({ length: 50 }),
		facilityMinRange: decimal({ precision: 10, scale: 2 }),
		facilityMaxRange: decimal({ precision: 10, scale: 2 }),
		systemNotes: text(),
		profileNotes: text(),
		profileActions: jsonb(),
		measurementMetadata: jsonb(),
		processingStatus: varchar({ length: 50 }).default('partial_data'),
		recordedAt: timestamp({ withTimezone: true })
			.defaultNow()
			.notNull(),
		isNotified: boolean().default(false),
		isArchived: boolean().default(false),
		createdAt: timestamp({ withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp({ withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index().on(table.eventId),
		index().on(table.identifierId),
		index().on(table.dataPointId),
	],
);

export type Measurement = typeof measurements.$inferSelect;
export type MeasurementToInsert = typeof measurements.$inferInsert;

export const partners = pgTable('partners', {
	id: uuid().defaultRandom().primaryKey(),
	partnerId: text().notNull().unique(),
	slug: varchar({ length: 255 }).unique(),
	promoCode: varchar(),
	referralCode: varchar(),
	partnerFirstName: varchar({ length: 255 }).notNull(),
	partnerLastName: varchar({ length: 255 }).notNull(),
	displayName: varchar({ length: 255 }),
	description: text(),
	logoUrl: varchar({ length: 255 }),
	isActive: boolean().default(true),
	partnerMetadata: jsonb(),
	createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
}, (partners) => [
	index().on(partners.promoCode),
	index().on(partners.partnerId),
]);

export type Partner = typeof partners.$inferSelect;

export const partnerRelationships = pgTable('partner_relationships', {
	parentPartnerId: uuid().references(() => partners.id, { onDelete: 'cascade' }).notNull(),
	childPartnerId: uuid().references(() => partners.id, { onDelete: 'cascade' }).notNull(),
	createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	primaryKey({ columns: [table.parentPartnerId, table.childPartnerId] }),
	index().on(table.childPartnerId),
]);

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

export const serviceRequestStatuses: RequestStatus[] = [
	'service_results_failed',
	'received.standard.ordered',
	'received.standard.document_created',
	'sample_processing.standard.partial_data',
	'completed.standard.completed',
	'failed.standard.sample_error',
	'cancelled.standard.cancelled',
	'received.remote.ordered',
	'received.remote.document_created',
	'collecting_sample.remote.appointment_scheduled',
	'sample_processing.remote.partial_data',
	'completed.remote.completed',
	'cancelled.remote.cancelled',
];

export interface Location {
	primaryAddress: string;
	secondaryAddress?: string;
	locality: string;
	region: string;
	postalCode: string;
	territory: string;
}

export type RequestType = 'standard' | 'remote';

export const requests = pgTable('requests', {
	id: uuid().defaultRandom().primaryKey(),
	requestNumber: integer().notNull(),
	serviceRequestId: uuid(),
	totalAmount: decimal({ precision: 10, scale: 2 }).notNull(),
	centAmount: integer().generatedAlwaysAs((): SQL => sql`${requests.totalAmount} * 100`),
	requestStatus: varchar({ length: 100 }).$type<RequestStatus>().notNull(),
	promoCode: varchar(),
	referralCode: varchar(),
	profileId: uuid().references(() => profiles.id, { onDelete: 'cascade' }).notNull(),
	facilityId: uuid().references(() => facilities.id, { onDelete: 'set null' }),
	receiptUrl: varchar({ length: 255 }),
	itemCount: integer().notNull(),
	requestMetadata: jsonb(),
	requestType: varchar().$type<RequestType>().default('standard').notNull(),
	location: jsonb().$type<Location>(),
	createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index().on(table.profileId),
	index().on(table.requestNumber),
	index().on(table.requestStatus),
	index().on(table.serviceRequestId),
	index().on(table.promoCode),
	index().on(table.referralCode),
	index().on(table.requestType),
]);

export type Request = typeof requests.$inferSelect;
export type RequestToInsert = typeof requests.$inferInsert;

export const requestsToDataPoints = pgTable('requests_to_data_points', {
	requestId: uuid().references(() => requests.id, { onDelete: 'cascade' }).notNull(),
	dataPointId: uuid().references(() => dataPoints.id, { onDelete: 'cascade' }).notNull(),
	itemRate: decimal({ precision: 10, scale: 2 }).notNull(),
	centRate: integer().generatedAlwaysAs((): SQL => sql`${requestsToDataPoints.itemRate} * 100`),
}, (table) => [index().on(table.requestId), index().on(table.dataPointId)]);

export type RequestToDataPoint = typeof requestsToDataPoints.$inferSelect;
export type RequestToDataPointToInsert = typeof requestsToDataPoints.$inferInsert;

export const requestsToServicePackages = pgTable('requests_to_service_packages', {
	requestId: uuid().references(() => requests.id, { onDelete: 'cascade' }).notNull(),
	servicePackageId: uuid().references(() => servicePackages.id, { onDelete: 'cascade' }).notNull(),
	packageRate: decimal({ precision: 10, scale: 2 }).notNull(),
	centRate: integer().generatedAlwaysAs((): SQL => sql`${requestsToServicePackages.packageRate} * 100`),
}, (table) => [index().on(table.requestId), index().on(table.servicePackageId)]);

export type RequestToServicePackage = typeof requestsToServicePackages.$inferSelect;
export type RequestToServicePackageToInsert = typeof requestsToServicePackages.$inferInsert;

export const selections = pgTable('selections', {
	id: uuid().defaultRandom().primaryKey(),
	profileId: uuid().references(() => profiles.id, { onDelete: 'cascade' }).notNull(),
	facilityId: uuid().references(() => facilities.id),
	createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index().on(table.profileId),
	index().on(table.facilityId),
	uniqueIndex().on(table.id, table.profileId),
]);

export type Selection = typeof selections.$inferSelect;
export type SelectionToInsert = typeof selections.$inferInsert;

export const selectionsToDataPoints = pgTable('selections_to_data_points', {
	selectionId: uuid()
		.references(() => selections.id, { onDelete: 'cascade' })
		.notNull(),
	dataPointId: uuid()
		.references(() => dataPoints.id, { onDelete: 'cascade' })
		.notNull(),
}, (table) => [
	index().on(table.selectionId),
	index().on(table.dataPointId),
	uniqueIndex().on(table.selectionId, table.dataPointId),
]);

export type SelectionToDataPoint = typeof selectionsToDataPoints.$inferSelect;

export const selectionsToServicePackages = pgTable('selections_to_service_packages', {
	selectionId: uuid()
		.references(() => selections.id, { onDelete: 'cascade' })
		.notNull(),
	servicePackageId: uuid()
		.references(() => servicePackages.id, { onDelete: 'cascade' })
		.notNull(),
}, (table) => [
	index().on(table.selectionId),
	index().on(table.servicePackageId),
	uniqueIndex().on(table.selectionId, table.servicePackageId),
]);

export type SelectionToServicePackage = typeof selectionsToServicePackages.$inferSelect;

export type ProcessorPaymentStatus = 'PENDING' | 'SUCCESS' | 'DECLINE' | 'UNKNOWN';
export type PaymentProcessor = 'PROCESSOR_A' | 'PROCESSOR_B';

export const transactions = pgTable('transactions', {
	id: uuid().defaultRandom().primaryKey(),
	token: varchar(),
	transactionId: varchar().notNull().unique(),
	sourceId: varchar(),
	profileId: uuid().references(() => profiles.id, { onDelete: 'cascade' }).notNull(),
	requestId: uuid().references(() => requests.id).notNull(),
	transactionStatus: varchar({ length: 50 }).notNull(),
	amount: decimal({ precision: 10, scale: 2 }).notNull(),
	centAmount: integer().generatedAlwaysAs((): SQL => sql`${transactions.amount} * 100`),
	currency: varchar({ length: 10 }).notNull(),
	responseData: jsonb(),
	transactionMetadata: jsonb(),
	processor: varchar().$type<PaymentProcessor>().notNull().default('PROCESSOR_A'),
	createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex().on(table.transactionId, table.processor),
	index().on(table.token),
	index().on(table.transactionId),
	index().on(table.profileId),
	index().on(table.requestId),
	index().on(table.transactionStatus),
]);

export type Transaction = typeof transactions.$inferSelect;
export type TransactionToInsert = typeof transactions.$inferInsert;

export type TransactionEventType = 'transaction.created' | 'transaction.updated';
export type ProcessorEventType = 'transaction.sale.success' | 'transaction.sale.failure' | 'transaction.sale.unknown';

export const transactionEvents = pgTable('transaction_events', {
	id: uuid().defaultRandom().primaryKey(),
	eventType: varchar({ length: 50 }).$type<TransactionEventType | ProcessorEventType>().notNull(),
	eventId: varchar().notNull(),
	transactionId: varchar().references(() => transactions.transactionId, { onDelete: 'cascade' }).notNull(),
	eventMetadata: jsonb().notNull(),
	processor: varchar().$type<PaymentProcessor>().notNull().default('PROCESSOR_A'),
	createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex().on(table.eventId),
	index().on(table.eventType),
	index().on(table.transactionId),
]);

export type TransactionEvent = typeof transactionEvents.$inferSelect;
export type TransactionEventToInsert = typeof transactionEvents.$inferInsert;

export const serviceEvents = pgTable('service_events', {
	id: uuid().defaultRandom().primaryKey(),
	profileId: uuid().references(() => profiles.id, { onDelete: 'cascade' }).notNull(),
	serviceUserId: varchar().notNull(),
	requestId: uuid().references(() => requests.id, { onDelete: 'cascade' }).notNull(),
	serviceRequestId: varchar().notNull(),
	eventType: varchar().notNull(),
	eventId: integer().notNull(),
	appointmentEventId: varchar(),
	eventStatus: varchar().notNull(),
	appointmentStatus: varchar(),
	eventMetadata: jsonb().notNull(),
	createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
}, (serviceEvents) => [
	index().on(serviceEvents.profileId),
	index().on(serviceEvents.serviceUserId),
	index().on(serviceEvents.requestId),
	index().on(serviceEvents.serviceRequestId),
	index().on(serviceEvents.eventId),
	index().on(serviceEvents.eventType),
	index().on(serviceEvents.eventStatus),
]);

export type ServiceEvent = typeof serviceEvents.$inferSelect;
export type ServiceEventToInsert = typeof serviceEvents.$inferInsert;

export type PartnerSubscriptionType = 'promo' | 'referral' | 'custom_package';

export const partnerSubscriptions = pgTable('partner_subscriptions', {
	id: uuid().defaultRandom().primaryKey(),
	partnerId: uuid().references(() => partners.id, { onDelete: 'cascade' }).notNull(),
	profileId: uuid().references(() => profiles.id, { onDelete: 'cascade' }).notNull(),
	promoCode: varchar(),
	referralCode: varchar(),
	subscriptionType: varchar().$type<PartnerSubscriptionType>().notNull(),
	expiredAt: timestamp({ withTimezone: true }).notNull(),
	createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
}, (partnerSubscriptions) => [
	uniqueIndex().on(partnerSubscriptions.profileId, partnerSubscriptions.partnerId),
	index().on(partnerSubscriptions.profileId),
	index().on(partnerSubscriptions.partnerId),
	index().on(partnerSubscriptions.promoCode),
	index().on(partnerSubscriptions.referralCode),
	index().on(partnerSubscriptions.subscriptionType),
	index().on(partnerSubscriptions.expiredAt),
]);

export type PartnerSubscription = typeof partnerSubscriptions.$inferSelect;
export type PartnerSubscriptionToInsert = typeof partnerSubscriptions.$inferInsert;

export const reversals = pgTable('reversals', {
	id: uuid().defaultRandom().primaryKey(),
	token: varchar().notNull(),
	transactionId: uuid().notNull().references(() => transactions.id),
	reversalId: varchar().notNull(),
	profileId: uuid().references(() => profiles.id, { onDelete: 'cascade' }).notNull(),
	requestId: uuid().references(() => requests.id).notNull(),
	reversalStatus: varchar({ length: 50 }).notNull(),
	amount: decimal({ precision: 10, scale: 2 }).notNull(),
	centAmount: integer().generatedAlwaysAs((): SQL => sql`${reversals.amount} * 100`),
	currency: varchar({ length: 10 }).notNull(),
	reversalMetadata: jsonb().notNull(),
	createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex().on(table.token),
	index().on(table.transactionId),
	index().on(table.profileId),
	index().on(table.requestId),
	index().on(table.reversalStatus),
	index().on(table.reversalId),
]);

export type Reversal = typeof reversals.$inferSelect;
export type ReversalToInsert = typeof reversals.$inferInsert;

export type ReversalEventType = 'reversal.created' | 'reversal.updated';

export const reversalEvents = pgTable('reversal_events', {
	id: uuid().defaultRandom().primaryKey(),
	eventType: varchar({ length: 50 }).$type<ReversalEventType>().notNull(),
	eventId: varchar().notNull(),
	reversalId: uuid().references(() => reversals.id, { onDelete: 'cascade' }).notNull(),
	transactionId: uuid().references(() => transactions.id, { onDelete: 'cascade' }).notNull(),
	eventMetadata: jsonb().notNull(),
	createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex().on(table.eventId),
	index().on(table.eventType),
	index().on(table.transactionId),
	index().on(table.reversalId),
]);

export type ReversalEvent = typeof reversalEvents.$inferSelect;
export type ReversalEventToInsert = typeof reversalEvents.$inferInsert;

export const schedules = pgTable('schedules', {
	id: uuid().defaultRandom().primaryKey(),
	profileId: uuid()
		.references(() => profiles.id, { onDelete: 'cascade' })
		.notNull(),
	scheduleTitle: varchar({ length: 255 }).notNull(),
	description: text(),
	startDate: timestamp({ withTimezone: true }).notNull(),
	endDate: timestamp({ withTimezone: true }),
	isCurrent: boolean().default(false).notNull(),
	themeColor: varchar({ length: 50 }).notNull(),
	isPrivate: boolean().default(false).notNull(),
	applyToAllCharts: boolean().default(false).notNull(),
	isVisible: boolean().default(true).notNull(),
	isArchived: boolean().default(false).notNull(),
	profileActions: jsonb(),
	createdAt: timestamp({ withTimezone: true })
		.defaultNow()
		.notNull(),
	updatedAt: timestamp({ withTimezone: true })
		.defaultNow()
		.notNull(),
}, (table) => [
	index().on(table.profileId),
	index().on(table.startDate, table.endDate),
]);

export type Schedule = typeof schedules.$inferSelect;
export type ScheduleToInsert = typeof schedules.$inferInsert;

export const schedulesToIdentifiers = pgTable('schedules_to_identifiers', {
	scheduleId: uuid()
		.references(() => schedules.id, {
			onDelete: 'cascade',
		})
		.notNull(),
	identifierId: uuid()
		.references(() => identifiers.id, {
			onDelete: 'cascade',
		})
		.notNull(),
	createdAt: timestamp({ withTimezone: true })
		.defaultNow()
		.notNull(),
}, (table) => [
	primaryKey({ columns: [table.scheduleId, table.identifierId] }),
	index().on(table.identifierId),
]);

export type ScheduleToIdentifier = typeof schedulesToIdentifiers.$inferSelect;
export type ScheduleToIdentifierToInsert = typeof schedulesToIdentifiers.$inferInsert;

export const scheduleShares = pgTable('schedule_shares', {
	id: uuid().defaultRandom().primaryKey(),
	shareToken: text().notNull().unique(),
	scheduleId: uuid().references(() => schedules.id, { onDelete: 'cascade' }).notNull(),
	profileId: uuid().references(() => profiles.id, { onDelete: 'cascade' }).notNull(),
	accessCount: integer().default(0).notNull(),
	createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index().on(table.shareToken),
	index().on(table.scheduleId),
	index().on(table.profileId),
]);

export type ScheduleShare = typeof scheduleShares.$inferSelect;
export type ScheduleShareToInsert = typeof scheduleShares.$inferInsert;

export const processingProviders = pgTable('processing_providers', {
	id: uuid().defaultRandom().primaryKey(),
	processor: varchar().$type<PaymentProcessor>().notNull(),
	isActive: boolean().notNull(),
	createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
}, (processingProviders) => [
	index().on(processingProviders.processor),
	index().on(processingProviders.isActive),
]);

export type ProcessingProvider = typeof processingProviders.$inferSelect;
