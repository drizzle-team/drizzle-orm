import { bench, setup } from '@arktype/attest';
import { defineRelations as defy } from './src/relations.js';
import * as schema from './tmp/big-schema.js';
// import { defy } from "./src/relations2.js";
// import * as schema from "./big-schema";

setup({
	skipTypes: true,
});

bench('relations', () => {
	defy(schema, (r) => ({
		user: {
			workspacesViaApiWebhook: r.many.workspace({
				from: r.user.id.through(r.apiWebhook.createdByUserId),
				to: r.workspace.id.through(r.apiWebhook.workspaceId),
				alias: 'user_id_workspace_id_via_apiWebhook',
			}),
			blockingTimeslots: r.many.blockingTimeslot(),
			bookingLinksCreatedByUserId: r.many.bookingLink({
				alias: 'bookingLink_createdByUserId_user_id',
			}),
			bookingSettings: r.one.bookingSettings(),
			emailAccounts: r.many.emailAccount(),
			apiKeys: r.many.apiKey(),
			threadsViaComment: r.many.thread({
				from: r.user.id.through(r.comment.createdByUserId),
				to: r.thread.id.through(r.comment.threadId),
				alias: 'user_id_thread_id_via_comment',
			}),
			calendarWebhooks: r.many.calendarWebhook(),
			bookingLinksViaInviteeBooking: r.many.bookingLink({
				alias: 'bookingLink_id_user_id_via_inviteeBooking',
			}),
			meetingActionItems: r.many.meetingActionItem(),
			notesCreatedByUserId: r.many.notes({
				alias: 'notes_createdByUserId_user_id',
			}),
			notesPublishedByUserId: r.many.notes({
				alias: 'notes_publishedByUserId_user_id',
			}),
			motionSubscriptions: r.one.motionSubscription(),
			notesViaNoteDataSnapshot: r.many.notes({
				from: r.user.id.through(r.noteDataSnapshot.createdByUserId),
				to: r.notes.id.through(r.noteDataSnapshot.noteId),
				alias: 'user_id_notes_id_via_noteDataSnapshot',
			}),
			notesViaNoteMention: r.many.notes({
				from: r.user.id.through(r.noteMention.createdByUserId),
				to: r.notes.id.through(r.noteMention.noteId),
				alias: 'user_id_notes_id_via_noteMention',
			}),
			notesViaNoteUserLastViewed: r.many.notes({
				alias: 'notes_id_user_id_via_noteUserLastViewed',
			}),
			projectDefinitionsCreatedByUserId: r.many.projectDefinition({
				alias: 'projectDefinition_createdByUserId_user_id',
			}),
			projectDefinitionsManagerId: r.many.projectDefinition({
				alias: 'projectDefinition_managerId_user_id',
			}),
			projectsCreatedByUserId: r.many.project({
				alias: 'project_createdByUserId_user_id',
			}),
			projectsManagerId: r.many.project({
				alias: 'project_managerId_user_id',
			}),
			reactions: r.many.reaction(),
			referrals: r.many.referral(),
			recurringTasksAssigneeUserId: r.many.recurringTask({
				alias: 'recurringTask_assigneeUserId_user_id',
			}),
			recurringTasksCreatedByUserId: r.many.recurringTask({
				alias: 'recurringTask_createdByUserId_user_id',
			}),
			projectManagementViews: r.many.projectManagementView(),
			taskDefinitions: r.many.taskDefinition(),
			teamsViaTeamInvite: r.many.team({
				from: r.user.id.through(r.teamInvite.inviterId),
				to: r.team.id.through(r.teamInvite.teamId),
				alias: 'user_id_team_id_via_teamInvite',
			}),
			teamTasksAssigneeUserId: r.many.teamTask({
				alias: 'teamTask_assigneeUserId_user_id',
			}),
			teamTasksCreatedByUserId: r.many.teamTask({
				alias: 'teamTask_createdByUserId_user_id',
			}),
			teamsViaTeamMember: r.many.team({
				alias: 'team_id_user_id_via_teamMember',
			}),
			uploadedFiles: r.many.uploadedFile(),
			threadsCreatedByUserId: r.many.thread({
				alias: 'thread_createdByUserId_user_id',
			}),
			userNotificationPreferences: r.many.userNotificationPreferences(),
			userOauthCodes: r.many.userOauthCode(),
			featurePermissionTiers: r.many.featurePermissionTiers(),
			userTaskDefaultSettings: r.many.userTaskDefaultSettings(),
			userTutorials: r.one.userTutorials(),
			workspacesViaWorkspaceMember: r.many.workspace({
				from: r.user.id.through(r.workspaceMember.userId),
				to: r.workspace.id.through(r.workspaceMember.workspaceId),
				alias: 'user_id_workspace_id_via_workspaceMember',
			}),
			userSettings: r.one.userSettings(),
			teamTasksViaTaskSubscribedUsers: r.many.teamTask({
				alias: 'teamTask_id_user_id_via_taskSubscribedUsers',
			}),
		},
		workspace: {
			usersViaApiWebhook: r.many.user({
				alias: 'user_id_workspace_id_via_apiWebhook',
			}),
			customFieldInstances: r.many.customFieldInstance(),
			labels: r.many.label(),
			notes: r.many.notes(),
			projectDefinitionsWorkspaceId: r.many.projectDefinition({
				alias: 'projectDefinition_workspaceId_workspace_id',
			}),
			projectsWorkspaceId: r.many.project({
				alias: 'project_workspaceId_workspace_id',
			}),
			projectDefinitionsViaStageDefinition: r.many.projectDefinition({
				alias: 'projectDefinition_id_workspace_id_via_stageDefinition',
			}),
			recurringTasks: r.many.recurringTask(),
			taskDefinitions: r.many.taskDefinition(),
			teamTasksWorkspaceId: r.many.teamTask({
				alias: 'teamTask_workspaceId_workspace_id',
			}),
			taskStatuses: r.many.taskStatus(),
			projectsViaTemplateProject: r.many.project({
				alias: 'project_id_workspace_id_via_templateProject',
			}),
			teamTasksViaTemplateTask: r.many.teamTask({
				alias: 'teamTask_id_workspace_id_via_templateTask',
			}),
			uploadedFiles: r.many.uploadedFile(),
			userTaskDefaultSettings: r.many.userTaskDefaultSettings(),
			usersViaWorkspaceMember: r.many.user({
				alias: 'user_id_workspace_id_via_workspaceMember',
			}),
			team: r.one.team({
				from: r.workspace.teamId,
				to: r.team.id,
			}),
			workspaceTaskSequencers: r.one.workspaceTaskSequencer(),
		},
		blockingTimeslot: {
			user: r.one.user({
				from: r.blockingTimeslot.userId,
				to: r.user.id,
			}),
		},
		bookingLink: {
			user: r.one.user({
				from: r.bookingLink.createdByUserId,
				to: r.user.id,
				alias: 'bookingLink_createdByUserId_user_id',
			}),
			bookingLink: r.one.bookingLink({
				from: r.bookingLink.parentTemplateId,
				to: r.bookingLink.id,
				alias: 'bookingLink_parentTemplateId_bookingLink_id',
			}),
			bookingLinks: r.many.bookingLink({
				alias: 'bookingLink_parentTemplateId_bookingLink_id',
			}),
			team: r.one.team({
				from: r.bookingLink.teamId,
				to: r.team.id,
			}),
			bookingConflictCalendars: r.many.bookingConflictCalendar(),
			bookingQuestions: r.many.bookingQuestion(),
			users: r.many.user({
				from: r.bookingLink.id.through(r.inviteeBooking.bookingLinkId),
				to: r.user.id.through(r.inviteeBooking.linkCreatorId),
				alias: 'bookingLink_id_user_id_via_inviteeBooking',
			}),
			bookingAvailabilitySlots: r.many.bookingAvailabilitySlot(),
		},
		team: {
			bookingLinks: r.many.bookingLink(),
			integrations: r.many.integration(),
			meetingInsightsTeamSettings: r.one.meetingInsightsTeamSettings(),
			motionSubscriptions: r.one.motionSubscription(),
			meetingInsights: r.many.meetingInsights(),
			permissionRoles: r.many.permissionRole(),
			teamPaymentMethods: r.one.teamPaymentMethod(),
			usersViaTeamInvite: r.many.user({
				alias: 'user_id_team_id_via_teamInvite',
			}),
			teamSettings: r.one.teamSettings(),
			usersViaTeamMember: r.many.user({
				from: r.team.id.through(r.teamMember.teamId),
				to: r.user.id.through(r.teamMember.userId),
				alias: 'team_id_user_id_via_teamMember',
			}),
			featurePermissionTiers: r.many.featurePermissionTiers(),
			workspaces: r.many.workspace(),
			permissionPolicies: r.many.permissionPolicy(),
		},
		bookingConflictCalendar: {
			bookingLink: r.one.bookingLink({
				from: r.bookingConflictCalendar.bookingLinkId,
				to: r.bookingLink.id,
			}),
		},
		bookingQuestion: {
			bookingLink: r.one.bookingLink({
				from: r.bookingQuestion.bookingLinkId,
				to: r.bookingLink.id,
			}),
		},
		bookingSettings: {
			user: r.one.user({
				from: r.bookingSettings.userId,
				to: r.user.id,
			}),
		},
		emailAccount: {
			users: r.many.user({
				from: r.emailAccount.id.through(r.calendar.emailAccountId),
				to: r.user.id.through(r.calendar.userId),
			}),
		},
		calendarEventExtensions: {
			calendar: r.one.calendar({
				from: r.calendarEventExtensions.calendarId,
				to: r.calendar.id,
			}),
		},
		calendar: {
			calendarEventExtensions: r.many.calendarEventExtensions(),
		},
		calendarEvent: {
			syncSession: r.one.syncSession({
				from: r.calendarEvent.syncSessionId,
				to: r.syncSession.id,
			}),
			meetingTaskRelations: r.one.meetingTaskRelation(),
		},
		syncSession: {
			calendarEvents: r.many.calendarEvent(),
		},
		apiKey: {
			user: r.one.user({
				from: r.apiKey.userId,
				to: r.user.id,
			}),
		},
		customFieldInstance: {
			workspace: r.one.workspace({
				from: r.customFieldInstance.workspaceId,
				to: r.workspace.id,
			}),
			customFieldValues: r.many.customFieldValue(),
			projects: r.many.project({
				from: r.customFieldInstance.id.through(
					r.projectTaskSyncedCustomField.customFieldInstanceId,
				),
				to: r.project.id.through(r.projectTaskSyncedCustomField.projectId),
			}),
		},
		customFieldValue: {
			customFieldInstance: r.one.customFieldInstance({
				from: r.customFieldValue.instanceId,
				to: r.customFieldInstance.id,
			}),
		},
		thread: {
			users: r.many.user({
				alias: 'user_id_thread_id_via_comment',
			}),
			user: r.one.user({
				from: r.thread.createdByUserId,
				to: r.user.id,
				alias: 'thread_createdByUserId_user_id',
			}),
		},
		calendarWebhook: {
			user: r.one.user({
				from: r.calendarWebhook.userId,
				to: r.user.id,
			}),
		},
		integrationImport: {
			integration: r.one.integration({
				from: r.integrationImport.integrationId,
				to: r.integration.id,
			}),
			importMappings: r.many.importMapping(),
			syncedEntities: r.many.syncedEntity(),
		},
		integration: {
			integrationImports: r.many.integrationImport(),
			team: r.one.team({
				from: r.integration.teamId,
				to: r.team.id,
			}),
		},
		importMapping: {
			integrationImport: r.one.integrationImport({
				from: r.importMapping.integrationImportId,
				to: r.integrationImport.id,
			}),
		},
		label: {
			workspace: r.one.workspace({
				from: r.label.workspaceId,
				to: r.workspace.id,
			}),
			projectDefinitions: r.many.projectDefinition({
				from: r.label.id.through(r.projectDefinitionLabel.labelId),
				to: r.projectDefinition.id.through(
					r.projectDefinitionLabel.projectDefinitionId,
				),
			}),
			recurringTasks: r.many.recurringTask({
				from: r.label.id.through(r.recurringTaskLabel.labelId),
				to: r.recurringTask.id.through(r.recurringTaskLabel.recurringTaskId),
			}),
			projects: r.many.project({
				from: r.label.id.through(r.projectLabel.labelId),
				to: r.project.id.through(r.projectLabel.projectId),
			}),
			taskDefinitions: r.many.taskDefinition({
				from: r.label.id.through(r.taskDefinitionLabel.labelId),
				to: r.taskDefinition.id.through(r.taskDefinitionLabel.taskDefinitionId),
			}),
			teamTasks: r.many.teamTask({
				from: r.label.id.through(r.teamTaskLabel.labelId),
				to: r.teamTask.id.through(r.teamTaskLabel.taskId),
			}),
			userTaskDefaultSettings: r.many.userTaskDefaultSettings({
				from: r.label.id.through(r.userTaskDefaultSettingsLabel.labelId),
				to: r.userTaskDefaultSettings.id.through(
					r.userTaskDefaultSettingsLabel.userTaskDefaultSettingsId,
				),
			}),
		},
		meetingActionItem: {
			meetingInsight: r.one.meetingInsights({
				from: r.meetingActionItem.meetingInsightsId,
				to: r.meetingInsights.id,
			}),
			teamTaskPotentialDuplicateTaskId: r.one.teamTask({
				from: r.meetingActionItem.potentialDuplicateTaskId,
				to: r.teamTask.id,
				alias: 'meetingActionItem_potentialDuplicateTaskId_teamTask_id',
			}),
			teamTaskTaskId: r.one.teamTask({
				from: r.meetingActionItem.taskId,
				to: r.teamTask.id,
				alias: 'meetingActionItem_taskId_teamTask_id',
			}),
			user: r.one.user({
				from: r.meetingActionItem.triagedByUserId,
				to: r.user.id,
			}),
		},
		meetingInsights: {
			meetingActionItems: r.many.meetingActionItem(),
			note: r.one.notes({
				from: r.meetingInsights.noteId,
				to: r.notes.id,
			}),
			recurringMeetingInsight: r.one.recurringMeetingInsights({
				from: r.meetingInsights.parentId,
				to: r.recurringMeetingInsights.id,
			}),
			team: r.one.team({
				from: r.meetingInsights.teamId,
				to: r.team.id,
			}),
		},
		teamTask: {
			meetingActionItemsPotentialDuplicateTaskId: r.many.meetingActionItem({
				alias: 'meetingActionItem_potentialDuplicateTaskId_teamTask_id',
			}),
			meetingActionItemsTaskId: r.one.meetingActionItem({
				alias: 'meetingActionItem_taskId_teamTask_id',
			}),
			taskScheduledEntities: r.many.taskScheduledEntity(),
			userAssigneeUserId: r.one.user({
				from: r.teamTask.assigneeUserId,
				to: r.user.id,
				alias: 'teamTask_assigneeUserId_user_id',
			}),
			userCreatedByUserId: r.one.user({
				from: r.teamTask.createdByUserId,
				to: r.user.id,
				alias: 'teamTask_createdByUserId_user_id',
			}),
			meetingTaskRelation: r.one.meetingTaskRelation({
				from: r.teamTask.meetingRelationId,
				to: r.meetingTaskRelation.id,
			}),
			teamTaskMeetingTaskId: r.one.teamTask({
				from: r.teamTask.meetingTaskId,
				to: r.teamTask.id,
				alias: 'teamTask_meetingTaskId_teamTask_id',
			}),
			teamTasksMeetingTaskId: r.one.teamTask({
				alias: 'teamTask_meetingTaskId_teamTask_id',
			}),
			teamTaskParentChunkTaskId: r.one.teamTask({
				from: r.teamTask.parentChunkTaskId,
				to: r.teamTask.id,
				alias: 'teamTask_parentChunkTaskId_teamTask_id',
			}),
			teamTasksParentChunkTaskId: r.many.teamTask({
				alias: 'teamTask_parentChunkTaskId_teamTask_id',
			}),
			recurringTask: r.one.recurringTask({
				from: r.teamTask.parentRecurringTaskId,
				to: r.recurringTask.id,
			}),
			project: r.one.project({
				from: r.teamTask.projectId,
				to: r.project.id,
			}),
			stage: r.one.stage({
				from: [r.teamTask.projectId, r.teamTask.stageDefinitionId],
				to: [r.stage.projectId, r.stage.stageDefinitionId],
			}),
			stageDefinition: r.one.stageDefinition({
				from: r.teamTask.stageDefinitionId,
				to: r.stageDefinition.id,
			}),
			taskStatus: r.one.taskStatus({
				from: r.teamTask.statusId,
				to: r.taskStatus.id,
			}),
			taskDefinition: r.one.taskDefinition({
				from: r.teamTask.taskDefinitionId,
				to: r.taskDefinition.id,
			}),
			workspace: r.one.workspace({
				from: r.teamTask.workspaceId,
				to: r.workspace.id,
				alias: 'teamTask_workspaceId_workspace_id',
			}),
			workspaces: r.many.workspace({
				from: r.teamTask.id.through(r.templateTask.taskId),
				to: r.workspace.id.through(r.templateTask.workspaceId),
				alias: 'teamTask_id_workspace_id_via_templateTask',
			}),
			uploadedFiles: r.many.uploadedFile(),
			labels: r.many.label(),
			users: r.many.user({
				from: r.teamTask.id.through(r.taskSubscribedUsers.taskId),
				to: r.user.id.through(r.taskSubscribedUsers.userId),
				alias: 'teamTask_id_user_id_via_taskSubscribedUsers',
			}),
		},
		meetingInsightsTeamSettings: {
			team: r.one.team({
				from: r.meetingInsightsTeamSettings.teamId,
				to: r.team.id,
			}),
		},
		notes: {
			userCreatedByUserId: r.one.user({
				from: r.notes.createdByUserId,
				to: r.user.id,
				alias: 'notes_createdByUserId_user_id',
			}),
			note: r.one.notes({
				from: r.notes.parentNoteId,
				to: r.notes.id,
				alias: 'notes_parentNoteId_notes_id',
			}),
			notes: r.many.notes({
				alias: 'notes_parentNoteId_notes_id',
			}),
			userPublishedByUserId: r.one.user({
				from: r.notes.publishedByUserId,
				to: r.user.id,
				alias: 'notes_publishedByUserId_user_id',
			}),
			workspace: r.one.workspace({
				from: r.notes.workspaceId,
				to: r.workspace.id,
			}),
			usersViaNoteDataSnapshot: r.many.user({
				alias: 'user_id_notes_id_via_noteDataSnapshot',
			}),
			usersViaNoteMention: r.many.user({
				alias: 'user_id_notes_id_via_noteMention',
			}),
			usersViaNoteUserLastViewed: r.many.user({
				from: r.notes.id.through(r.noteUserLastViewed.noteId),
				to: r.user.id.through(r.noteUserLastViewed.userId),
				alias: 'notes_id_user_id_via_noteUserLastViewed',
			}),
			meetingInsights: r.many.meetingInsights(),
			recurringMeetingInsights: r.one.recurringMeetingInsights(),
		},
		motionSubscription: {
			featurePermissionTier: r.one.featurePermissionTiers({
				from: r.motionSubscription.featurePermissionTierId,
				to: r.featurePermissionTiers.id,
			}),
			team: r.one.team({
				from: r.motionSubscription.teamId,
				to: r.team.id,
			}),
			user: r.one.user({
				from: r.motionSubscription.userId,
				to: r.user.id,
			}),
			userSubscriptions: r.many.userSubscription({
				from: r.motionSubscription.id.through(
					r.stripeSubscription.motionSubscriptionId,
				),
				to: r.userSubscription.id.through(
					r.stripeSubscription.userSubscriptionId,
				),
			}),
		},
		featurePermissionTiers: {
			motionSubscriptions: r.many.motionSubscription(),
			teams: r.many.team({
				from: r.featurePermissionTiers.id.through(
					r.teamSubscription.featurePermissionTierId,
				),
				to: r.team.id.through(r.teamSubscription.teamId),
			}),
			users: r.many.user({
				from: r.featurePermissionTiers.id.through(
					r.userSubscription.featurePermissionTierId,
				),
				to: r.user.id.through(r.userSubscription.userId),
			}),
		},
		permission: {
			permissionRole: r.one.permissionRole({
				from: r.permission.permissionRoleId,
				to: r.permissionRole.id,
			}),
		},
		permissionRole: {
			permissions: r.many.permission(),
			team: r.one.team({
				from: r.permissionRole.teamId,
				to: r.team.id,
			}),
			permissionRoleAssignments: r.many.permissionRoleAssignment(),
		},
		meetingTaskRelation: {
			calendarEvent: r.one.calendarEvent({
				from: r.meetingTaskRelation.calendarEventId,
				to: r.calendarEvent.id,
			}),
			teamTasks: r.one.teamTask(),
		},
		recurringMeetingInsights: {
			meetingInsights: r.many.meetingInsights(),
			note: r.one.notes({
				from: r.recurringMeetingInsights.noteId,
				to: r.notes.id,
			}),
		},
		meetingInsightsSettings: {
			userSetting: r.one.userSettings({
				from: r.meetingInsightsSettings.userSettingsId,
				to: r.userSettings.id,
			}),
		},
		userSettings: {
			meetingInsightsSettings: r.one.meetingInsightsSettings(),
			userAutoScheduleSettings: r.one.userAutoScheduleSettings(),
			userCalendarDisplaySettings: r.one.userCalendarDisplaySettings(),
			userConferenceSettings: r.one.userConferenceSettings(),
			folderItems: r.many.folderItem(),
			folders: r.many.folder(),
			userMeetingInsightsSettings: r.one.userMeetingInsightsSettings(),
			userSidebarDisplaySettings: r.one.userSidebarDisplaySettings(),
			userOnboardingSettings: r.one.userOnboardingSettings(),
			userTimezoneSettings: r.one.userTimezoneSettings(),
			userTaskDefaultSettings: r.many.userTaskDefaultSettings(),
			user: r.one.user({
				from: r.userSettings.userId,
				to: r.user.id,
			}),
			userPageViewSettings: r.many.userPageViewSettings(),
		},
		projectDefinition: {
			labels: r.many.label(),
			stageDefinitionsViaProjectDefinitionStageDefinition: r.many.stageDefinition({
				from: r.projectDefinition.id.through(
					r.projectDefinitionStageDefinition.projectDefinitionId,
				),
				to: r.stageDefinition.id.through(
					r.projectDefinitionStageDefinition.stageDefinitionId,
				),
				alias: 'projectDefinition_id_stageDefinition_id_via_projectDefinitionStageDefinition',
			}),
			userCreatedByUserId: r.one.user({
				from: r.projectDefinition.createdByUserId,
				to: r.user.id,
				alias: 'projectDefinition_createdByUserId_user_id',
			}),
			folder: r.one.folder({
				from: r.projectDefinition.folderId,
				to: r.folder.id,
			}),
			userManagerId: r.one.user({
				from: r.projectDefinition.managerId,
				to: r.user.id,
				alias: 'projectDefinition_managerId_user_id',
			}),
			workspace: r.one.workspace({
				from: r.projectDefinition.workspaceId,
				to: r.workspace.id,
				alias: 'projectDefinition_workspaceId_workspace_id',
			}),
			projects: r.many.project(),
			workspaces: r.many.workspace({
				from: r.projectDefinition.id.through(
					r.stageDefinition.projectDefinitionId,
				),
				to: r.workspace.id.through(r.stageDefinition.workspaceId),
				alias: 'projectDefinition_id_workspace_id_via_stageDefinition',
			}),
			taskDefinitions: r.many.taskDefinition(),
			stageDefinitionsViaVariableDefinition: r.many.stageDefinition({
				from: r.projectDefinition.id.through(
					r.variableDefinition.projectDefinitionId,
				),
				to: r.stageDefinition.id.through(
					r.variableDefinition.stageDefinitionId,
				),
				alias: 'projectDefinition_id_stageDefinition_id_via_variableDefinition',
			}),
		},
		stageDefinition: {
			projectDefinitionsViaProjectDefinitionStageDefinition: r.many.projectDefinition({
				alias: 'projectDefinition_id_stageDefinition_id_via_projectDefinitionStageDefinition',
			}),
			projects: r.many.project(),
			stages: r.many.stage(),
			taskDefinitions: r.many.taskDefinition(),
			teamTasks: r.many.teamTask(),
			projectDefinitionsViaVariableDefinition: r.many.projectDefinition({
				alias: 'projectDefinition_id_stageDefinition_id_via_variableDefinition',
			}),
		},
		folder: {
			projectDefinitions: r.many.projectDefinition(),
			userSettings: r.many.userSettings({
				from: r.folder.id.through(r.userFolderSettings.folderId),
				to: r.userSettings.id.through(r.userFolderSettings.userSettingsId),
			}),
			folderItems: r.many.folderItem(),
		},
		project: {
			stageDefinition: r.one.stageDefinition({
				from: r.project.activeStageDefinitionId,
				to: r.stageDefinition.id,
			}),
			userCreatedByUserId: r.one.user({
				from: r.project.createdByUserId,
				to: r.user.id,
				alias: 'project_createdByUserId_user_id',
			}),
			userManagerId: r.one.user({
				from: r.project.managerId,
				to: r.user.id,
				alias: 'project_managerId_user_id',
			}),
			projectDefinition: r.one.projectDefinition({
				from: r.project.projectDefinitionId,
				to: r.projectDefinition.id,
			}),
			taskStatus: r.one.taskStatus({
				from: r.project.statusId,
				to: r.taskStatus.id,
			}),
			workspace: r.one.workspace({
				from: r.project.workspaceId,
				to: r.workspace.id,
				alias: 'project_workspaceId_workspace_id',
			}),
			customFieldInstances: r.many.customFieldInstance(),
			stages: r.many.stage(),
			labels: r.many.label(),
			teamTasks: r.many.teamTask(),
			workspaces: r.many.workspace({
				from: r.project.id.through(r.templateProject.projectId),
				to: r.workspace.id.through(r.templateProject.workspaceId),
				alias: 'project_id_workspace_id_via_templateProject',
			}),
			uploadedFiles: r.many.uploadedFile(),
			userTaskDefaultSettings: r.many.userTaskDefaultSettings(),
			variableInstances: r.many.variableInstance(),
		},
		taskStatus: {
			projects: r.many.project(),
			recurringTasks: r.many.recurringTask(),
			taskDefinitions: r.many.taskDefinition(),
			teamTasks: r.many.teamTask(),
			workspace: r.one.workspace({
				from: r.taskStatus.workspaceId,
				to: r.workspace.id,
			}),
			userTaskDefaultSettings: r.many.userTaskDefaultSettings(),
		},
		reaction: {
			user: r.one.user({
				from: r.reaction.userId,
				to: r.user.id,
			}),
		},
		recurringTask: {
			labels: r.many.label(),
			userAssigneeUserId: r.one.user({
				from: r.recurringTask.assigneeUserId,
				to: r.user.id,
				alias: 'recurringTask_assigneeUserId_user_id',
			}),
			userCreatedByUserId: r.one.user({
				from: r.recurringTask.createdByUserId,
				to: r.user.id,
				alias: 'recurringTask_createdByUserId_user_id',
			}),
			taskStatus: r.one.taskStatus({
				from: r.recurringTask.statusId,
				to: r.taskStatus.id,
			}),
			workspace: r.one.workspace({
				from: r.recurringTask.workspaceId,
				to: r.workspace.id,
			}),
			teamTasks: r.many.teamTask(),
			uploadedFiles: r.many.uploadedFile(),
		},
		referral: {
			user: r.one.user({
				from: r.referral.referrerId,
				to: r.user.id,
			}),
		},
		stage: {
			projectDefinitionStageDefinition: r.one.projectDefinitionStageDefinition({
				from: r.stage.projectDefinitionStageDefinitionId,
				to: r.projectDefinitionStageDefinition.id,
			}),
			project: r.one.project({
				from: r.stage.projectId,
				to: r.project.id,
			}),
			stageDefinition: r.one.stageDefinition({
				from: r.stage.stageDefinitionId,
				to: r.stageDefinition.id,
			}),
			teamTasks: r.many.teamTask(),
			variableInstances: r.many.variableInstance(),
		},
		projectDefinitionStageDefinition: {
			stages: r.many.stage(),
		},
		userSubscription: {
			motionSubscriptions: r.many.motionSubscription(),
		},
		syncedEntity: {
			integrationImport: r.one.integrationImport({
				from: r.syncedEntity.integrationImportId,
				to: r.integrationImport.id,
			}),
		},
		projectManagementView: {
			user: r.one.user({
				from: r.projectManagementView.creatorUserId,
				to: r.user.id,
			}),
		},
		taskDefinition: {
			labels: r.many.label(),
			user: r.one.user({
				from: r.taskDefinition.assigneeUserId,
				to: r.user.id,
			}),
			taskDefinition: r.one.taskDefinition({
				from: r.taskDefinition.blockerId,
				to: r.taskDefinition.id,
				alias: 'taskDefinition_blockerId_taskDefinition_id',
			}),
			taskDefinitions: r.many.taskDefinition({
				alias: 'taskDefinition_blockerId_taskDefinition_id',
			}),
			projectDefinition: r.one.projectDefinition({
				from: r.taskDefinition.projectDefinitionId,
				to: r.projectDefinition.id,
			}),
			stageDefinition: r.one.stageDefinition({
				from: r.taskDefinition.stageDefinitionId,
				to: r.stageDefinition.id,
			}),
			taskStatus: r.one.taskStatus({
				from: r.taskDefinition.statusId,
				to: r.taskStatus.id,
			}),
			workspace: r.one.workspace({
				from: r.taskDefinition.workspaceId,
				to: r.workspace.id,
			}),
			teamTasks: r.many.teamTask(),
		},
		teamPaymentMethod: {
			team: r.one.team({
				from: r.teamPaymentMethod.teamId,
				to: r.team.id,
			}),
		},
		taskScheduledEntity: {
			teamTask: r.one.teamTask({
				from: r.taskScheduledEntity.parentTaskId,
				to: r.teamTask.id,
			}),
		},
		teamSettings: {
			team: r.one.team({
				from: r.teamSettings.teamId,
				to: r.team.id,
			}),
			teamMeetingInsightsSettings: r.one.teamMeetingInsightsSettings(),
		},
		teamMeetingInsightsSettings: {
			teamSetting: r.one.teamSettings({
				from: r.teamMeetingInsightsSettings.teamSettingsId,
				to: r.teamSettings.id,
			}),
		},
		uploadedFile: {
			comment: r.one.comment({
				from: r.uploadedFile.commentId,
				to: r.comment.id,
			}),
			user: r.one.user({
				from: r.uploadedFile.createdByUserId,
				to: r.user.id,
			}),
			project: r.one.project({
				from: r.uploadedFile.projectId,
				to: r.project.id,
			}),
			recurringTask: r.one.recurringTask({
				from: r.uploadedFile.recurringTaskId,
				to: r.recurringTask.id,
			}),
			teamTask: r.one.teamTask({
				from: r.uploadedFile.taskId,
				to: r.teamTask.id,
			}),
			workspace: r.one.workspace({
				from: r.uploadedFile.workspaceId,
				to: r.workspace.id,
			}),
		},
		comment: {
			uploadedFiles: r.many.uploadedFile(),
		},
		userAutoScheduleSettings: {
			userSetting: r.one.userSettings({
				from: r.userAutoScheduleSettings.userSettingsId,
				to: r.userSettings.id,
			}),
		},
		userCalendarDisplaySettings: {
			userSetting: r.one.userSettings({
				from: r.userCalendarDisplaySettings.userSettingsId,
				to: r.userSettings.id,
			}),
		},
		userConferenceSettings: {
			userSetting: r.one.userSettings({
				from: r.userConferenceSettings.userSettingsId,
				to: r.userSettings.id,
			}),
		},
		folderItem: {
			userSettings: r.many.userSettings({
				from: r.folderItem.id.through(r.userFolderItemSettings.folderItemId),
				to: r.userSettings.id.through(r.userFolderItemSettings.userSettingsId),
			}),
			folder: r.one.folder({
				from: r.folderItem.folderId,
				to: r.folder.id,
			}),
			folderItemOriginalFolderItemId: r.one.folderItem({
				from: r.folderItem.originalFolderItemId,
				to: r.folderItem.id,
				alias: 'folderItem_originalFolderItemId_folderItem_id',
			}),
			folderItemsOriginalFolderItemId: r.many.folderItem({
				alias: 'folderItem_originalFolderItemId_folderItem_id',
			}),
			folderItemParentFolderItemId: r.one.folderItem({
				from: r.folderItem.parentFolderItemId,
				to: r.folderItem.id,
				alias: 'folderItem_parentFolderItemId_folderItem_id',
			}),
			folderItemsParentFolderItemId: r.many.folderItem({
				alias: 'folderItem_parentFolderItemId_folderItem_id',
			}),
		},
		userMeetingInsightsSettings: {
			userSetting: r.one.userSettings({
				from: r.userMeetingInsightsSettings.userSettingsId,
				to: r.userSettings.id,
			}),
		},
		userNotificationPreferences: {
			user: r.one.user({
				from: r.userNotificationPreferences.userId,
				to: r.user.id,
			}),
		},
		userOauthCode: {
			user: r.one.user({
				from: r.userOauthCode.userId,
				to: r.user.id,
			}),
		},
		userSidebarDisplaySettings: {
			userSetting: r.one.userSettings({
				from: r.userSidebarDisplaySettings.userSettingsId,
				to: r.userSettings.id,
			}),
		},
		userTaskDefaultSettings: {
			labels: r.many.label(),
			user: r.one.user({
				from: r.userTaskDefaultSettings.assigneeUserId,
				to: r.user.id,
			}),
			project: r.one.project({
				from: r.userTaskDefaultSettings.projectId,
				to: r.project.id,
			}),
			taskStatus: r.one.taskStatus({
				from: r.userTaskDefaultSettings.statusId,
				to: r.taskStatus.id,
			}),
			userSetting: r.one.userSettings({
				from: r.userTaskDefaultSettings.userSettingsId,
				to: r.userSettings.id,
			}),
			workspace: r.one.workspace({
				from: r.userTaskDefaultSettings.workspaceId,
				to: r.workspace.id,
			}),
		},
		userOnboardingSettings: {
			userSetting: r.one.userSettings({
				from: r.userOnboardingSettings.userSettingsId,
				to: r.userSettings.id,
			}),
		},
		userTimezoneSettings: {
			userSetting: r.one.userSettings({
				from: r.userTimezoneSettings.userSettingsId,
				to: r.userSettings.id,
			}),
		},
		userTutorials: {
			user: r.one.user({
				from: r.userTutorials.userId,
				to: r.user.id,
			}),
		},
		variableInstance: {
			project: r.one.project({
				from: r.variableInstance.projectId,
				to: r.project.id,
			}),
			stage: r.one.stage({
				from: r.variableInstance.stageId,
				to: r.stage.id,
			}),
			variableDefinition: r.one.variableDefinition({
				from: r.variableInstance.variableId,
				to: r.variableDefinition.id,
			}),
		},
		variableDefinition: {
			variableInstances: r.many.variableInstance(),
		},
		userPageViewSettings: {
			userSetting: r.one.userSettings({
				from: r.userPageViewSettings.userSettingsId,
				to: r.userSettings.id,
			}),
		},
		bookingAvailabilitySlot: {
			bookingLink: r.one.bookingLink({
				from: r.bookingAvailabilitySlot.bookingLinkId,
				to: r.bookingLink.id,
			}),
		},
		permissionPolicy: {
			team: r.one.team({
				from: r.permissionPolicy.teamId,
				to: r.team.id,
			}),
		},
		permissionRoleAssignment: {
			permissionRole: r.one.permissionRole({
				from: r.permissionRoleAssignment.permissionRoleId,
				to: r.permissionRole.id,
			}),
		},
		workspaceTaskSequencer: {
			workspace: r.one.workspace({
				from: r.workspaceTaskSequencer.workspaceId,
				to: r.workspace.id,
			}),
		},
	}));
}).types([103199, 'instantiations']);
// .mark({ mean: [3.44, "ns"], median: [3.33, "ns"] })
