import { operations } from './types.js';

export type EmptyRequest = Record<string, unknown>;
export type EmptyResponse = null;

export type AdminAbuseReportNotificationRecipientCreateRequest = NonNullable<
    operations['admin___abuse-report___notification-recipient___create']['requestBody']
>['content']['application/json'];
export type AdminAbuseReportNotificationRecipientCreateResponse =
    operations['admin___abuse-report___notification-recipient___create']['responses']['200']['content']['application/json'];
export type AdminAbuseReportNotificationRecipientDeleteRequest = NonNullable<
    operations['admin___abuse-report___notification-recipient___delete']['requestBody']
>['content']['application/json'];
export type AdminAbuseReportNotificationRecipientListRequest = NonNullable<
    operations['admin___abuse-report___notification-recipient___list']['requestBody']
>['content']['application/json'];
export type AdminAbuseReportNotificationRecipientListResponse =
    operations['admin___abuse-report___notification-recipient___list']['responses']['200']['content']['application/json'];
export type AdminAbuseReportNotificationRecipientShowRequest = NonNullable<
    operations['admin___abuse-report___notification-recipient___show']['requestBody']
>['content']['application/json'];
export type AdminAbuseReportNotificationRecipientShowResponse =
    operations['admin___abuse-report___notification-recipient___show']['responses']['200']['content']['application/json'];
export type AdminAbuseReportNotificationRecipientUpdateRequest = NonNullable<
    operations['admin___abuse-report___notification-recipient___update']['requestBody']
>['content']['application/json'];
export type AdminAbuseReportNotificationRecipientUpdateResponse =
    operations['admin___abuse-report___notification-recipient___update']['responses']['200']['content']['application/json'];
export type AdminAbuseUserReportsRequest = NonNullable<
    operations['admin___abuse-user-reports']['requestBody']
>['content']['application/json'];
export type AdminAbuseUserReportsResponse =
    operations['admin___abuse-user-reports']['responses']['200']['content']['application/json'];
export type AdminAccountsCreateRequest = NonNullable<
    operations['admin___accounts___create']['requestBody']
>['content']['application/json'];
export type AdminAccountsCreateResponse =
    operations['admin___accounts___create']['responses']['200']['content']['application/json'];
export type AdminAccountsDeleteRequest = NonNullable<
    operations['admin___accounts___delete']['requestBody']
>['content']['application/json'];
export type AdminAccountsFindByEmailRequest = NonNullable<
    operations['admin___accounts___find-by-email']['requestBody']
>['content']['application/json'];
export type AdminAccountsFindByEmailResponse =
    operations['admin___accounts___find-by-email']['responses']['200']['content']['application/json'];
export type AdminAdCreateRequest = NonNullable<
    operations['admin___ad___create']['requestBody']
>['content']['application/json'];
export type AdminAdCreateResponse =
    operations['admin___ad___create']['responses']['200']['content']['application/json'];
export type AdminAdDeleteRequest = NonNullable<
    operations['admin___ad___delete']['requestBody']
>['content']['application/json'];
export type AdminAdListRequest = NonNullable<
    operations['admin___ad___list']['requestBody']
>['content']['application/json'];
export type AdminAdListResponse = operations['admin___ad___list']['responses']['200']['content']['application/json'];
export type AdminAdUpdateRequest = NonNullable<
    operations['admin___ad___update']['requestBody']
>['content']['application/json'];
export type AdminAnnouncementsCreateRequest = NonNullable<
    operations['admin___announcements___create']['requestBody']
>['content']['application/json'];
export type AdminAnnouncementsCreateResponse =
    operations['admin___announcements___create']['responses']['200']['content']['application/json'];
export type AdminAnnouncementsDeleteRequest = NonNullable<
    operations['admin___announcements___delete']['requestBody']
>['content']['application/json'];
export type AdminAnnouncementsListRequest = NonNullable<
    operations['admin___announcements___list']['requestBody']
>['content']['application/json'];
export type AdminAnnouncementsListResponse =
    operations['admin___announcements___list']['responses']['200']['content']['application/json'];
export type AdminAnnouncementsUpdateRequest = NonNullable<
    operations['admin___announcements___update']['requestBody']
>['content']['application/json'];
export type AdminAvatarDecorationsCreateRequest = NonNullable<
    operations['admin___avatar-decorations___create']['requestBody']
>['content']['application/json'];
export type AdminAvatarDecorationsCreateResponse =
    operations['admin___avatar-decorations___create']['responses']['200']['content']['application/json'];
export type AdminAvatarDecorationsDeleteRequest = NonNullable<
    operations['admin___avatar-decorations___delete']['requestBody']
>['content']['application/json'];
export type AdminAvatarDecorationsListRequest = NonNullable<
    operations['admin___avatar-decorations___list']['requestBody']
>['content']['application/json'];
export type AdminAvatarDecorationsListResponse =
    operations['admin___avatar-decorations___list']['responses']['200']['content']['application/json'];
export type AdminAvatarDecorationsUpdateRequest = NonNullable<
    operations['admin___avatar-decorations___update']['requestBody']
>['content']['application/json'];
export type AdminCaptchaCurrentResponse =
    operations['admin___captcha___current']['responses']['200']['content']['application/json'];
export type AdminCaptchaSaveRequest = NonNullable<
    operations['admin___captcha___save']['requestBody']
>['content']['application/json'];
export type AdminDeleteAccountRequest = NonNullable<
    operations['admin___delete-account']['requestBody']
>['content']['application/json'];
export type AdminDeleteAllFilesOfAUserRequest = NonNullable<
    operations['admin___delete-all-files-of-a-user']['requestBody']
>['content']['application/json'];
export type AdminDriveFilesRequest = NonNullable<
    operations['admin___drive___files']['requestBody']
>['content']['application/json'];
export type AdminDriveFilesResponse =
    operations['admin___drive___files']['responses']['200']['content']['application/json'];
export type AdminDriveShowFileRequest = NonNullable<
    operations['admin___drive___show-file']['requestBody']
>['content']['application/json'];
export type AdminDriveShowFileResponse =
    operations['admin___drive___show-file']['responses']['200']['content']['application/json'];
export type AdminEmojiAddRequest = NonNullable<
    operations['admin___emoji___add']['requestBody']
>['content']['application/json'];
export type AdminEmojiAddResponse =
    operations['admin___emoji___add']['responses']['200']['content']['application/json'];
export type AdminEmojiAddAliasesBulkRequest = NonNullable<
    operations['admin___emoji___add-aliases-bulk']['requestBody']
>['content']['application/json'];
export type AdminEmojiCopyRequest = NonNullable<
    operations['admin___emoji___copy']['requestBody']
>['content']['application/json'];
export type AdminEmojiCopyResponse =
    operations['admin___emoji___copy']['responses']['200']['content']['application/json'];
export type AdminEmojiDeleteRequest = NonNullable<
    operations['admin___emoji___delete']['requestBody']
>['content']['application/json'];
export type AdminEmojiDeleteBulkRequest = NonNullable<
    operations['admin___emoji___delete-bulk']['requestBody']
>['content']['application/json'];
export type AdminEmojiImportZipRequest = NonNullable<
    operations['admin___emoji___import-zip']['requestBody']
>['content']['application/json'];
export type AdminEmojiListRequest = NonNullable<
    operations['admin___emoji___list']['requestBody']
>['content']['application/json'];
export type AdminEmojiListResponse =
    operations['admin___emoji___list']['responses']['200']['content']['application/json'];
export type AdminEmojiListRemoteRequest = NonNullable<
    operations['admin___emoji___list-remote']['requestBody']
>['content']['application/json'];
export type AdminEmojiListRemoteResponse =
    operations['admin___emoji___list-remote']['responses']['200']['content']['application/json'];
export type AdminEmojiRemoveAliasesBulkRequest = NonNullable<
    operations['admin___emoji___remove-aliases-bulk']['requestBody']
>['content']['application/json'];
export type AdminEmojiSetAliasesBulkRequest = NonNullable<
    operations['admin___emoji___set-aliases-bulk']['requestBody']
>['content']['application/json'];
export type AdminEmojiSetCategoryBulkRequest = NonNullable<
    operations['admin___emoji___set-category-bulk']['requestBody']
>['content']['application/json'];
export type AdminEmojiSetLicenseBulkRequest = NonNullable<
    operations['admin___emoji___set-license-bulk']['requestBody']
>['content']['application/json'];
export type AdminEmojiUpdateRequest = NonNullable<
    operations['admin___emoji___update']['requestBody']
>['content']['application/json'];
export type AdminFederationDeleteAllFilesRequest = NonNullable<
    operations['admin___federation___delete-all-files']['requestBody']
>['content']['application/json'];
export type AdminFederationRefreshRemoteInstanceMetadataRequest = NonNullable<
    operations['admin___federation___refresh-remote-instance-metadata']['requestBody']
>['content']['application/json'];
export type AdminFederationRemoveAllFollowingRequest = NonNullable<
    operations['admin___federation___remove-all-following']['requestBody']
>['content']['application/json'];
export type AdminFederationUpdateInstanceRequest = NonNullable<
    operations['admin___federation___update-instance']['requestBody']
>['content']['application/json'];
export type AdminForwardAbuseUserReportRequest = NonNullable<
    operations['admin___forward-abuse-user-report']['requestBody']
>['content']['application/json'];
export type AdminGetIndexStatsResponse =
    operations['admin___get-index-stats']['responses']['200']['content']['application/json'];
export type AdminGetTableStatsResponse =
    operations['admin___get-table-stats']['responses']['200']['content']['application/json'];
export type AdminGetUserIpsRequest = NonNullable<
    operations['admin___get-user-ips']['requestBody']
>['content']['application/json'];
export type AdminGetUserIpsResponse =
    operations['admin___get-user-ips']['responses']['200']['content']['application/json'];
export type AdminInviteCreateRequest = NonNullable<
    operations['admin___invite___create']['requestBody']
>['content']['application/json'];
export type AdminInviteCreateResponse =
    operations['admin___invite___create']['responses']['200']['content']['application/json'];
export type AdminInviteListRequest = NonNullable<
    operations['admin___invite___list']['requestBody']
>['content']['application/json'];
export type AdminInviteListResponse =
    operations['admin___invite___list']['responses']['200']['content']['application/json'];
export type AdminMetaResponse = operations['admin___meta']['responses']['200']['content']['application/json'];
export type AdminPromoCreateRequest = NonNullable<
    operations['admin___promo___create']['requestBody']
>['content']['application/json'];
export type AdminQueueClearRequest = NonNullable<
    operations['admin___queue___clear']['requestBody']
>['content']['application/json'];
export type AdminQueueDeliverDelayedResponse =
    operations['admin___queue___deliver-delayed']['responses']['200']['content']['application/json'];
export type AdminQueueInboxDelayedResponse =
    operations['admin___queue___inbox-delayed']['responses']['200']['content']['application/json'];
export type AdminQueueJobsRequest = NonNullable<
    operations['admin___queue___jobs']['requestBody']
>['content']['application/json'];
export type AdminQueueJobsResponse =
    operations['admin___queue___jobs']['responses']['200']['content']['application/json'];
export type AdminQueuePauseRequest = NonNullable<
    operations['admin___queue___pause']['requestBody']
>['content']['application/json'];
export type AdminQueuePromoteJobsRequest = NonNullable<
    operations['admin___queue___promote-jobs']['requestBody']
>['content']['application/json'];
export type AdminQueueQueueStatsRequest = NonNullable<
    operations['admin___queue___queue-stats']['requestBody']
>['content']['application/json'];
export type AdminQueueQueueStatsResponse =
    operations['admin___queue___queue-stats']['responses']['200']['content']['application/json'];
export type AdminQueueQueuesResponse =
    operations['admin___queue___queues']['responses']['200']['content']['application/json'];
export type AdminQueueRemoveJobRequest = NonNullable<
    operations['admin___queue___remove-job']['requestBody']
>['content']['application/json'];
export type AdminQueueResumeRequest = NonNullable<
    operations['admin___queue___resume']['requestBody']
>['content']['application/json'];
export type AdminQueueRetryJobRequest = NonNullable<
    operations['admin___queue___retry-job']['requestBody']
>['content']['application/json'];
export type AdminQueueShowJobRequest = NonNullable<
    operations['admin___queue___show-job']['requestBody']
>['content']['application/json'];
export type AdminQueueShowJobResponse =
    operations['admin___queue___show-job']['responses']['200']['content']['application/json'];
export type AdminQueueShowJobLogsRequest = NonNullable<
    operations['admin___queue___show-job-logs']['requestBody']
>['content']['application/json'];
export type AdminQueueShowJobLogsResponse =
    operations['admin___queue___show-job-logs']['responses']['200']['content']['application/json'];
export type AdminQueueStatsResponse =
    operations['admin___queue___stats']['responses']['200']['content']['application/json'];
export type AdminRelaysAddRequest = NonNullable<
    operations['admin___relays___add']['requestBody']
>['content']['application/json'];
export type AdminRelaysAddResponse =
    operations['admin___relays___add']['responses']['200']['content']['application/json'];
export type AdminRelaysListResponse =
    operations['admin___relays___list']['responses']['200']['content']['application/json'];
export type AdminRelaysRemoveRequest = NonNullable<
    operations['admin___relays___remove']['requestBody']
>['content']['application/json'];
export type AdminResetPasswordRequest = NonNullable<
    operations['admin___reset-password']['requestBody']
>['content']['application/json'];
export type AdminResetPasswordResponse =
    operations['admin___reset-password']['responses']['200']['content']['application/json'];
export type AdminResolveAbuseUserReportRequest = NonNullable<
    operations['admin___resolve-abuse-user-report']['requestBody']
>['content']['application/json'];
export type AdminRolesAssignRequest = NonNullable<
    operations['admin___roles___assign']['requestBody']
>['content']['application/json'];
export type AdminRolesCreateRequest = NonNullable<
    operations['admin___roles___create']['requestBody']
>['content']['application/json'];
export type AdminRolesCreateResponse =
    operations['admin___roles___create']['responses']['200']['content']['application/json'];
export type AdminRolesDeleteRequest = NonNullable<
    operations['admin___roles___delete']['requestBody']
>['content']['application/json'];
export type AdminRolesListResponse =
    operations['admin___roles___list']['responses']['200']['content']['application/json'];
export type AdminRolesShowRequest = NonNullable<
    operations['admin___roles___show']['requestBody']
>['content']['application/json'];
export type AdminRolesShowResponse =
    operations['admin___roles___show']['responses']['200']['content']['application/json'];
export type AdminRolesUnassignRequest = NonNullable<
    operations['admin___roles___unassign']['requestBody']
>['content']['application/json'];
export type AdminRolesUpdateRequest = NonNullable<
    operations['admin___roles___update']['requestBody']
>['content']['application/json'];
export type AdminRolesUpdateDefaultPoliciesRequest = NonNullable<
    operations['admin___roles___update-default-policies']['requestBody']
>['content']['application/json'];
export type AdminRolesUsersRequest = NonNullable<
    operations['admin___roles___users']['requestBody']
>['content']['application/json'];
export type AdminRolesUsersResponse =
    operations['admin___roles___users']['responses']['200']['content']['application/json'];
export type AdminSendEmailRequest = NonNullable<
    operations['admin___send-email']['requestBody']
>['content']['application/json'];
export type AdminServerInfoResponse =
    operations['admin___server-info']['responses']['200']['content']['application/json'];
export type AdminShowModerationLogsRequest = NonNullable<
    operations['admin___show-moderation-logs']['requestBody']
>['content']['application/json'];
export type AdminShowModerationLogsResponse =
    operations['admin___show-moderation-logs']['responses']['200']['content']['application/json'];
export type AdminShowUserRequest = NonNullable<
    operations['admin___show-user']['requestBody']
>['content']['application/json'];
export type AdminShowUserResponse = operations['admin___show-user']['responses']['200']['content']['application/json'];
export type AdminShowUsersRequest = NonNullable<
    operations['admin___show-users']['requestBody']
>['content']['application/json'];
export type AdminShowUsersResponse =
    operations['admin___show-users']['responses']['200']['content']['application/json'];
export type AdminSuspendUserRequest = NonNullable<
    operations['admin___suspend-user']['requestBody']
>['content']['application/json'];
export type AdminSystemWebhookCreateRequest = NonNullable<
    operations['admin___system-webhook___create']['requestBody']
>['content']['application/json'];
export type AdminSystemWebhookCreateResponse =
    operations['admin___system-webhook___create']['responses']['200']['content']['application/json'];
export type AdminSystemWebhookDeleteRequest = NonNullable<
    operations['admin___system-webhook___delete']['requestBody']
>['content']['application/json'];
export type AdminSystemWebhookListRequest = NonNullable<
    operations['admin___system-webhook___list']['requestBody']
>['content']['application/json'];
export type AdminSystemWebhookListResponse =
    operations['admin___system-webhook___list']['responses']['200']['content']['application/json'];
export type AdminSystemWebhookShowRequest = NonNullable<
    operations['admin___system-webhook___show']['requestBody']
>['content']['application/json'];
export type AdminSystemWebhookShowResponse =
    operations['admin___system-webhook___show']['responses']['200']['content']['application/json'];
export type AdminSystemWebhookTestRequest = NonNullable<
    operations['admin___system-webhook___test']['requestBody']
>['content']['application/json'];
export type AdminSystemWebhookUpdateRequest = NonNullable<
    operations['admin___system-webhook___update']['requestBody']
>['content']['application/json'];
export type AdminSystemWebhookUpdateResponse =
    operations['admin___system-webhook___update']['responses']['200']['content']['application/json'];
export type AdminUnsetMfaRequest = NonNullable<
    operations['admin___unset-mfa']['requestBody']
>['content']['application/json'];
export type AdminUnsetUserAvatarRequest = NonNullable<
    operations['admin___unset-user-avatar']['requestBody']
>['content']['application/json'];
export type AdminUnsetUserBannerRequest = NonNullable<
    operations['admin___unset-user-banner']['requestBody']
>['content']['application/json'];
export type AdminUnsuspendUserRequest = NonNullable<
    operations['admin___unsuspend-user']['requestBody']
>['content']['application/json'];
export type AdminUpdateAbuseUserReportRequest = NonNullable<
    operations['admin___update-abuse-user-report']['requestBody']
>['content']['application/json'];
export type AdminUpdateMetaRequest = NonNullable<
    operations['admin___update-meta']['requestBody']
>['content']['application/json'];
export type AdminUpdateProxyAccountRequest = NonNullable<
    operations['admin___update-proxy-account']['requestBody']
>['content']['application/json'];
export type AdminUpdateProxyAccountResponse =
    operations['admin___update-proxy-account']['responses']['200']['content']['application/json'];
export type AdminUpdateUserNoteRequest = NonNullable<
    operations['admin___update-user-note']['requestBody']
>['content']['application/json'];
export type AnnouncementsRequest = NonNullable<
    operations['announcements']['requestBody']
>['content']['application/json'];
export type AnnouncementsResponse = operations['announcements']['responses']['200']['content']['application/json'];
export type AnnouncementsShowRequest = NonNullable<
    operations['announcements___show']['requestBody']
>['content']['application/json'];
export type AnnouncementsShowResponse =
    operations['announcements___show']['responses']['200']['content']['application/json'];
export type AntennasCreateRequest = NonNullable<
    operations['antennas___create']['requestBody']
>['content']['application/json'];
export type AntennasCreateResponse = operations['antennas___create']['responses']['200']['content']['application/json'];
export type AntennasDeleteRequest = NonNullable<
    operations['antennas___delete']['requestBody']
>['content']['application/json'];
export type AntennasListResponse = operations['antennas___list']['responses']['200']['content']['application/json'];
export type AntennasNotesRequest = NonNullable<
    operations['antennas___notes']['requestBody']
>['content']['application/json'];
export type AntennasNotesResponse = operations['antennas___notes']['responses']['200']['content']['application/json'];
export type AntennasRemoveNoteRequest = NonNullable<
    operations['antennas___remove-note']['requestBody']
>['content']['application/json'];
export type AntennasShowRequest = NonNullable<
    operations['antennas___show']['requestBody']
>['content']['application/json'];
export type AntennasShowResponse = operations['antennas___show']['responses']['200']['content']['application/json'];
export type AntennasUpdateRequest = NonNullable<
    operations['antennas___update']['requestBody']
>['content']['application/json'];
export type AntennasUpdateResponse = operations['antennas___update']['responses']['200']['content']['application/json'];
export type ApGetRequest = NonNullable<operations['ap___get']['requestBody']>['content']['application/json'];
export type ApGetResponse = operations['ap___get']['responses']['200']['content']['application/json'];
export type ApShowRequest = NonNullable<operations['ap___show']['requestBody']>['content']['application/json'];
export type ApShowResponse = operations['ap___show']['responses']['200']['content']['application/json'];
export type AppCreateRequest = NonNullable<operations['app___create']['requestBody']>['content']['application/json'];
export type AppCreateResponse = operations['app___create']['responses']['200']['content']['application/json'];
export type AppShowRequest = NonNullable<operations['app___show']['requestBody']>['content']['application/json'];
export type AppShowResponse = operations['app___show']['responses']['200']['content']['application/json'];
export type AuthAcceptRequest = NonNullable<operations['auth___accept']['requestBody']>['content']['application/json'];
export type AuthSessionGenerateRequest = NonNullable<
    operations['auth___session___generate']['requestBody']
>['content']['application/json'];
export type AuthSessionGenerateResponse =
    operations['auth___session___generate']['responses']['200']['content']['application/json'];
export type AuthSessionShowRequest = NonNullable<
    operations['auth___session___show']['requestBody']
>['content']['application/json'];
export type AuthSessionShowResponse =
    operations['auth___session___show']['responses']['200']['content']['application/json'];
export type AuthSessionUserkeyRequest = NonNullable<
    operations['auth___session___userkey']['requestBody']
>['content']['application/json'];
export type AuthSessionUserkeyResponse =
    operations['auth___session___userkey']['responses']['200']['content']['application/json'];
export type BlockingCreateRequest = NonNullable<
    operations['blocking___create']['requestBody']
>['content']['application/json'];
export type BlockingCreateResponse = operations['blocking___create']['responses']['200']['content']['application/json'];
export type BlockingDeleteRequest = NonNullable<
    operations['blocking___delete']['requestBody']
>['content']['application/json'];
export type BlockingDeleteResponse = operations['blocking___delete']['responses']['200']['content']['application/json'];
export type BlockingListRequest = NonNullable<
    operations['blocking___list']['requestBody']
>['content']['application/json'];
export type BlockingListResponse = operations['blocking___list']['responses']['200']['content']['application/json'];
export type ChannelsCreateRequest = NonNullable<
    operations['channels___create']['requestBody']
>['content']['application/json'];
export type ChannelsCreateResponse = operations['channels___create']['responses']['200']['content']['application/json'];
export type ChannelsFavoriteRequest = NonNullable<
    operations['channels___favorite']['requestBody']
>['content']['application/json'];
export type ChannelsFeaturedResponse =
    operations['channels___featured']['responses']['200']['content']['application/json'];
export type ChannelsFollowRequest = NonNullable<
    operations['channels___follow']['requestBody']
>['content']['application/json'];
export type ChannelsFollowedRequest = NonNullable<
    operations['channels___followed']['requestBody']
>['content']['application/json'];
export type ChannelsFollowedResponse =
    operations['channels___followed']['responses']['200']['content']['application/json'];
export type ChannelsMuteCreateRequest = NonNullable<
    operations['channels___mute___create']['requestBody']
>['content']['application/json'];
export type ChannelsMuteDeleteRequest = NonNullable<
    operations['channels___mute___delete']['requestBody']
>['content']['application/json'];
export type ChannelsMuteListResponse =
    operations['channels___mute___list']['responses']['200']['content']['application/json'];
export type ChannelsMyFavoritesResponse =
    operations['channels___my-favorites']['responses']['200']['content']['application/json'];
export type ChannelsOwnedRequest = NonNullable<
    operations['channels___owned']['requestBody']
>['content']['application/json'];
export type ChannelsOwnedResponse = operations['channels___owned']['responses']['200']['content']['application/json'];
export type ChannelsSearchRequest = NonNullable<
    operations['channels___search']['requestBody']
>['content']['application/json'];
export type ChannelsSearchResponse = operations['channels___search']['responses']['200']['content']['application/json'];
export type ChannelsShowRequest = NonNullable<
    operations['channels___show']['requestBody']
>['content']['application/json'];
export type ChannelsShowResponse = operations['channels___show']['responses']['200']['content']['application/json'];
export type ChannelsTimelineRequest = NonNullable<
    operations['channels___timeline']['requestBody']
>['content']['application/json'];
export type ChannelsTimelineResponse =
    operations['channels___timeline']['responses']['200']['content']['application/json'];
export type ChannelsUnfavoriteRequest = NonNullable<
    operations['channels___unfavorite']['requestBody']
>['content']['application/json'];
export type ChannelsUnfollowRequest = NonNullable<
    operations['channels___unfollow']['requestBody']
>['content']['application/json'];
export type ChannelsUpdateRequest = NonNullable<
    operations['channels___update']['requestBody']
>['content']['application/json'];
export type ChannelsUpdateResponse = operations['channels___update']['responses']['200']['content']['application/json'];
export type ChartsActiveUsersRequest = NonNullable<
    operations['charts___active-users']['requestBody']
>['content']['application/json'];
export type ChartsActiveUsersResponse =
    operations['charts___active-users']['responses']['200']['content']['application/json'];
export type ChartsApRequestRequest = NonNullable<
    operations['charts___ap-request']['requestBody']
>['content']['application/json'];
export type ChartsApRequestResponse =
    operations['charts___ap-request']['responses']['200']['content']['application/json'];
export type ChartsDriveRequest = NonNullable<
    operations['charts___drive']['requestBody']
>['content']['application/json'];
export type ChartsDriveResponse = operations['charts___drive']['responses']['200']['content']['application/json'];
export type ChartsFederationRequest = NonNullable<
    operations['charts___federation']['requestBody']
>['content']['application/json'];
export type ChartsFederationResponse =
    operations['charts___federation']['responses']['200']['content']['application/json'];
export type ChartsInstanceRequest = NonNullable<
    operations['charts___instance']['requestBody']
>['content']['application/json'];
export type ChartsInstanceResponse = operations['charts___instance']['responses']['200']['content']['application/json'];
export type ChartsNotesRequest = NonNullable<
    operations['charts___notes']['requestBody']
>['content']['application/json'];
export type ChartsNotesResponse = operations['charts___notes']['responses']['200']['content']['application/json'];
export type ChartsUserDriveRequest = NonNullable<
    operations['charts___user___drive']['requestBody']
>['content']['application/json'];
export type ChartsUserDriveResponse =
    operations['charts___user___drive']['responses']['200']['content']['application/json'];
export type ChartsUserFollowingRequest = NonNullable<
    operations['charts___user___following']['requestBody']
>['content']['application/json'];
export type ChartsUserFollowingResponse =
    operations['charts___user___following']['responses']['200']['content']['application/json'];
export type ChartsUserNotesRequest = NonNullable<
    operations['charts___user___notes']['requestBody']
>['content']['application/json'];
export type ChartsUserNotesResponse =
    operations['charts___user___notes']['responses']['200']['content']['application/json'];
export type ChartsUserPvRequest = NonNullable<
    operations['charts___user___pv']['requestBody']
>['content']['application/json'];
export type ChartsUserPvResponse = operations['charts___user___pv']['responses']['200']['content']['application/json'];
export type ChartsUserReactionsRequest = NonNullable<
    operations['charts___user___reactions']['requestBody']
>['content']['application/json'];
export type ChartsUserReactionsResponse =
    operations['charts___user___reactions']['responses']['200']['content']['application/json'];
export type ChartsUsersRequest = NonNullable<
    operations['charts___users']['requestBody']
>['content']['application/json'];
export type ChartsUsersResponse = operations['charts___users']['responses']['200']['content']['application/json'];
export type ChatHistoryRequest = NonNullable<
    operations['chat___history']['requestBody']
>['content']['application/json'];
export type ChatHistoryResponse = operations['chat___history']['responses']['200']['content']['application/json'];
export type ChatMessagesCreateToRoomRequest = NonNullable<
    operations['chat___messages___create-to-room']['requestBody']
>['content']['application/json'];
export type ChatMessagesCreateToRoomResponse =
    operations['chat___messages___create-to-room']['responses']['200']['content']['application/json'];
export type ChatMessagesCreateToUserRequest = NonNullable<
    operations['chat___messages___create-to-user']['requestBody']
>['content']['application/json'];
export type ChatMessagesCreateToUserResponse =
    operations['chat___messages___create-to-user']['responses']['200']['content']['application/json'];
export type ChatMessagesDeleteRequest = NonNullable<
    operations['chat___messages___delete']['requestBody']
>['content']['application/json'];
export type ChatMessagesReactRequest = NonNullable<
    operations['chat___messages___react']['requestBody']
>['content']['application/json'];
export type ChatMessagesRoomTimelineRequest = NonNullable<
    operations['chat___messages___room-timeline']['requestBody']
>['content']['application/json'];
export type ChatMessagesRoomTimelineResponse =
    operations['chat___messages___room-timeline']['responses']['200']['content']['application/json'];
export type ChatMessagesSearchRequest = NonNullable<
    operations['chat___messages___search']['requestBody']
>['content']['application/json'];
export type ChatMessagesSearchResponse =
    operations['chat___messages___search']['responses']['200']['content']['application/json'];
export type ChatMessagesShowRequest = NonNullable<
    operations['chat___messages___show']['requestBody']
>['content']['application/json'];
export type ChatMessagesShowResponse =
    operations['chat___messages___show']['responses']['200']['content']['application/json'];
export type ChatMessagesUnreactRequest = NonNullable<
    operations['chat___messages___unreact']['requestBody']
>['content']['application/json'];
export type ChatMessagesUserTimelineRequest = NonNullable<
    operations['chat___messages___user-timeline']['requestBody']
>['content']['application/json'];
export type ChatMessagesUserTimelineResponse =
    operations['chat___messages___user-timeline']['responses']['200']['content']['application/json'];
export type ChatRoomsCreateRequest = NonNullable<
    operations['chat___rooms___create']['requestBody']
>['content']['application/json'];
export type ChatRoomsCreateResponse =
    operations['chat___rooms___create']['responses']['200']['content']['application/json'];
export type ChatRoomsDeleteRequest = NonNullable<
    operations['chat___rooms___delete']['requestBody']
>['content']['application/json'];
export type ChatRoomsInvitationsCreateRequest = NonNullable<
    operations['chat___rooms___invitations___create']['requestBody']
>['content']['application/json'];
export type ChatRoomsInvitationsCreateResponse =
    operations['chat___rooms___invitations___create']['responses']['200']['content']['application/json'];
export type ChatRoomsInvitationsIgnoreRequest = NonNullable<
    operations['chat___rooms___invitations___ignore']['requestBody']
>['content']['application/json'];
export type ChatRoomsInvitationsInboxRequest = NonNullable<
    operations['chat___rooms___invitations___inbox']['requestBody']
>['content']['application/json'];
export type ChatRoomsInvitationsInboxResponse =
    operations['chat___rooms___invitations___inbox']['responses']['200']['content']['application/json'];
export type ChatRoomsInvitationsOutboxRequest = NonNullable<
    operations['chat___rooms___invitations___outbox']['requestBody']
>['content']['application/json'];
export type ChatRoomsInvitationsOutboxResponse =
    operations['chat___rooms___invitations___outbox']['responses']['200']['content']['application/json'];
export type ChatRoomsJoinRequest = NonNullable<
    operations['chat___rooms___join']['requestBody']
>['content']['application/json'];
export type ChatRoomsJoiningRequest = NonNullable<
    operations['chat___rooms___joining']['requestBody']
>['content']['application/json'];
export type ChatRoomsJoiningResponse =
    operations['chat___rooms___joining']['responses']['200']['content']['application/json'];
export type ChatRoomsLeaveRequest = NonNullable<
    operations['chat___rooms___leave']['requestBody']
>['content']['application/json'];
export type ChatRoomsMembersRequest = NonNullable<
    operations['chat___rooms___members']['requestBody']
>['content']['application/json'];
export type ChatRoomsMembersResponse =
    operations['chat___rooms___members']['responses']['200']['content']['application/json'];
export type ChatRoomsMuteRequest = NonNullable<
    operations['chat___rooms___mute']['requestBody']
>['content']['application/json'];
export type ChatRoomsOwnedRequest = NonNullable<
    operations['chat___rooms___owned']['requestBody']
>['content']['application/json'];
export type ChatRoomsOwnedResponse =
    operations['chat___rooms___owned']['responses']['200']['content']['application/json'];
export type ChatRoomsShowRequest = NonNullable<
    operations['chat___rooms___show']['requestBody']
>['content']['application/json'];
export type ChatRoomsShowResponse =
    operations['chat___rooms___show']['responses']['200']['content']['application/json'];
export type ChatRoomsUpdateRequest = NonNullable<
    operations['chat___rooms___update']['requestBody']
>['content']['application/json'];
export type ChatRoomsUpdateResponse =
    operations['chat___rooms___update']['responses']['200']['content']['application/json'];
export type ClipsAddNoteRequest = NonNullable<
    operations['clips___add-note']['requestBody']
>['content']['application/json'];
export type ClipsCreateRequest = NonNullable<
    operations['clips___create']['requestBody']
>['content']['application/json'];
export type ClipsCreateResponse = operations['clips___create']['responses']['200']['content']['application/json'];
export type ClipsDeleteRequest = NonNullable<
    operations['clips___delete']['requestBody']
>['content']['application/json'];
export type ClipsFavoriteRequest = NonNullable<
    operations['clips___favorite']['requestBody']
>['content']['application/json'];
export type ClipsListRequest = NonNullable<operations['clips___list']['requestBody']>['content']['application/json'];
export type ClipsListResponse = operations['clips___list']['responses']['200']['content']['application/json'];
export type ClipsMyFavoritesResponse =
    operations['clips___my-favorites']['responses']['200']['content']['application/json'];
export type ClipsNotesRequest = NonNullable<operations['clips___notes']['requestBody']>['content']['application/json'];
export type ClipsNotesResponse = operations['clips___notes']['responses']['200']['content']['application/json'];
export type ClipsRemoveNoteRequest = NonNullable<
    operations['clips___remove-note']['requestBody']
>['content']['application/json'];
export type ClipsShowRequest = NonNullable<operations['clips___show']['requestBody']>['content']['application/json'];
export type ClipsShowResponse = operations['clips___show']['responses']['200']['content']['application/json'];
export type ClipsUnfavoriteRequest = NonNullable<
    operations['clips___unfavorite']['requestBody']
>['content']['application/json'];
export type ClipsUpdateRequest = NonNullable<
    operations['clips___update']['requestBody']
>['content']['application/json'];
export type ClipsUpdateResponse = operations['clips___update']['responses']['200']['content']['application/json'];
export type DriveResponse = operations['drive']['responses']['200']['content']['application/json'];
export type DriveFilesRequest = NonNullable<operations['drive___files']['requestBody']>['content']['application/json'];
export type DriveFilesResponse = operations['drive___files']['responses']['200']['content']['application/json'];
export type DriveFilesAttachedChatMessagesRequest = NonNullable<
    operations['drive___files___attached-chat-messages']['requestBody']
>['content']['application/json'];
export type DriveFilesAttachedChatMessagesResponse =
    operations['drive___files___attached-chat-messages']['responses']['200']['content']['application/json'];
export type DriveFilesAttachedNotesRequest = NonNullable<
    operations['drive___files___attached-notes']['requestBody']
>['content']['application/json'];
export type DriveFilesAttachedNotesResponse =
    operations['drive___files___attached-notes']['responses']['200']['content']['application/json'];
export type DriveFilesCheckExistenceRequest = NonNullable<
    operations['drive___files___check-existence']['requestBody']
>['content']['application/json'];
export type DriveFilesCheckExistenceResponse =
    operations['drive___files___check-existence']['responses']['200']['content']['application/json'];
export type DriveFilesCreateRequest = NonNullable<
    operations['drive___files___create']['requestBody']
>['content']['multipart/form-data'];
export type DriveFilesCreateResponse =
    operations['drive___files___create']['responses']['200']['content']['application/json'];
export type DriveFilesDeleteRequest = NonNullable<
    operations['drive___files___delete']['requestBody']
>['content']['application/json'];
export type DriveFilesFindRequest = NonNullable<
    operations['drive___files___find']['requestBody']
>['content']['application/json'];
export type DriveFilesFindResponse =
    operations['drive___files___find']['responses']['200']['content']['application/json'];
export type DriveFilesFindByHashRequest = NonNullable<
    operations['drive___files___find-by-hash']['requestBody']
>['content']['application/json'];
export type DriveFilesFindByHashResponse =
    operations['drive___files___find-by-hash']['responses']['200']['content']['application/json'];
export type DriveFilesMoveBulkRequest = NonNullable<
    operations['drive___files___move-bulk']['requestBody']
>['content']['application/json'];
export type DriveFilesShowRequest = NonNullable<
    operations['drive___files___show']['requestBody']
>['content']['application/json'];
export type DriveFilesShowResponse =
    operations['drive___files___show']['responses']['200']['content']['application/json'];
export type DriveFilesUpdateRequest = NonNullable<
    operations['drive___files___update']['requestBody']
>['content']['application/json'];
export type DriveFilesUpdateResponse =
    operations['drive___files___update']['responses']['200']['content']['application/json'];
export type DriveFilesUploadFromUrlRequest = NonNullable<
    operations['drive___files___upload-from-url']['requestBody']
>['content']['application/json'];
export type DriveFoldersRequest = NonNullable<
    operations['drive___folders']['requestBody']
>['content']['application/json'];
export type DriveFoldersResponse = operations['drive___folders']['responses']['200']['content']['application/json'];
export type DriveFoldersCreateRequest = NonNullable<
    operations['drive___folders___create']['requestBody']
>['content']['application/json'];
export type DriveFoldersCreateResponse =
    operations['drive___folders___create']['responses']['200']['content']['application/json'];
export type DriveFoldersDeleteRequest = NonNullable<
    operations['drive___folders___delete']['requestBody']
>['content']['application/json'];
export type DriveFoldersFindRequest = NonNullable<
    operations['drive___folders___find']['requestBody']
>['content']['application/json'];
export type DriveFoldersFindResponse =
    operations['drive___folders___find']['responses']['200']['content']['application/json'];
export type DriveFoldersShowRequest = NonNullable<
    operations['drive___folders___show']['requestBody']
>['content']['application/json'];
export type DriveFoldersShowResponse =
    operations['drive___folders___show']['responses']['200']['content']['application/json'];
export type DriveFoldersUpdateRequest = NonNullable<
    operations['drive___folders___update']['requestBody']
>['content']['application/json'];
export type DriveFoldersUpdateResponse =
    operations['drive___folders___update']['responses']['200']['content']['application/json'];
export type DriveStreamRequest = NonNullable<
    operations['drive___stream']['requestBody']
>['content']['application/json'];
export type DriveStreamResponse = operations['drive___stream']['responses']['200']['content']['application/json'];
export type EmailAddressAvailableRequest = NonNullable<
    operations['email-address___available']['requestBody']
>['content']['application/json'];
export type EmailAddressAvailableResponse =
    operations['email-address___available']['responses']['200']['content']['application/json'];
export type EmojiRequest = NonNullable<operations['emoji']['requestBody']>['content']['application/json'];
export type EmojiResponse = operations['emoji']['responses']['200']['content']['application/json'];
export type EmojisResponse = operations['emojis']['responses']['200']['content']['application/json'];
export type EndpointRequest = NonNullable<operations['endpoint']['requestBody']>['content']['application/json'];
export type EndpointResponse = operations['endpoint']['responses']['200']['content']['application/json'];
export type EndpointsResponse = operations['endpoints']['responses']['200']['content']['application/json'];
export type FederationFollowersRequest = NonNullable<
    operations['federation___followers']['requestBody']
>['content']['application/json'];
export type FederationFollowersResponse =
    operations['federation___followers']['responses']['200']['content']['application/json'];
export type FederationFollowingRequest = NonNullable<
    operations['federation___following']['requestBody']
>['content']['application/json'];
export type FederationFollowingResponse =
    operations['federation___following']['responses']['200']['content']['application/json'];
export type FederationInstancesRequest = NonNullable<
    operations['federation___instances']['requestBody']
>['content']['application/json'];
export type FederationInstancesResponse =
    operations['federation___instances']['responses']['200']['content']['application/json'];
export type FederationShowInstanceRequest = NonNullable<
    operations['federation___show-instance']['requestBody']
>['content']['application/json'];
export type FederationShowInstanceResponse =
    operations['federation___show-instance']['responses']['200']['content']['application/json'];
export type FederationStatsRequest = NonNullable<
    operations['federation___stats']['requestBody']
>['content']['application/json'];
export type FederationStatsResponse =
    operations['federation___stats']['responses']['200']['content']['application/json'];
export type FederationUpdateRemoteUserRequest = NonNullable<
    operations['federation___update-remote-user']['requestBody']
>['content']['application/json'];
export type FederationUsersRequest = NonNullable<
    operations['federation___users']['requestBody']
>['content']['application/json'];
export type FederationUsersResponse =
    operations['federation___users']['responses']['200']['content']['application/json'];
export type FetchExternalResourcesRequest = NonNullable<
    operations['fetch-external-resources']['requestBody']
>['content']['application/json'];
export type FetchExternalResourcesResponse =
    operations['fetch-external-resources']['responses']['200']['content']['application/json'];
export type FetchRssRequest = NonNullable<operations['fetch-rss']['requestBody']>['content']['application/json'];
export type FetchRssResponse = operations['fetch-rss']['responses']['200']['content']['application/json'];
export type FlashCreateRequest = NonNullable<
    operations['flash___create']['requestBody']
>['content']['application/json'];
export type FlashCreateResponse = operations['flash___create']['responses']['200']['content']['application/json'];
export type FlashDeleteRequest = NonNullable<
    operations['flash___delete']['requestBody']
>['content']['application/json'];
export type FlashFeaturedRequest = NonNullable<
    operations['flash___featured']['requestBody']
>['content']['application/json'];
export type FlashFeaturedResponse = operations['flash___featured']['responses']['200']['content']['application/json'];
export type FlashLikeRequest = NonNullable<operations['flash___like']['requestBody']>['content']['application/json'];
export type FlashMyRequest = NonNullable<operations['flash___my']['requestBody']>['content']['application/json'];
export type FlashMyResponse = operations['flash___my']['responses']['200']['content']['application/json'];
export type FlashMyLikesRequest = NonNullable<
    operations['flash___my-likes']['requestBody']
>['content']['application/json'];
export type FlashMyLikesResponse = operations['flash___my-likes']['responses']['200']['content']['application/json'];
export type FlashSearchRequest = NonNullable<
    operations['flash___search']['requestBody']
>['content']['application/json'];
export type FlashSearchResponse = operations['flash___search']['responses']['200']['content']['application/json'];
export type FlashShowRequest = NonNullable<operations['flash___show']['requestBody']>['content']['application/json'];
export type FlashShowResponse = operations['flash___show']['responses']['200']['content']['application/json'];
export type FlashUnlikeRequest = NonNullable<
    operations['flash___unlike']['requestBody']
>['content']['application/json'];
export type FlashUpdateRequest = NonNullable<
    operations['flash___update']['requestBody']
>['content']['application/json'];
export type FollowingCreateRequest = NonNullable<
    operations['following___create']['requestBody']
>['content']['application/json'];
export type FollowingCreateResponse =
    operations['following___create']['responses']['200']['content']['application/json'];
export type FollowingDeleteRequest = NonNullable<
    operations['following___delete']['requestBody']
>['content']['application/json'];
export type FollowingDeleteResponse =
    operations['following___delete']['responses']['200']['content']['application/json'];
export type FollowingInvalidateRequest = NonNullable<
    operations['following___invalidate']['requestBody']
>['content']['application/json'];
export type FollowingInvalidateResponse =
    operations['following___invalidate']['responses']['200']['content']['application/json'];
export type FollowingListRequest = NonNullable<
    operations['following___list']['requestBody']
>['content']['application/json'];
export type FollowingListResponse = operations['following___list']['responses']['200']['content']['application/json'];
export type FollowingRequestsAcceptRequest = NonNullable<
    operations['following___requests___accept']['requestBody']
>['content']['application/json'];
export type FollowingRequestsCancelRequest = NonNullable<
    operations['following___requests___cancel']['requestBody']
>['content']['application/json'];
export type FollowingRequestsCancelResponse =
    operations['following___requests___cancel']['responses']['200']['content']['application/json'];
export type FollowingRequestsListRequest = NonNullable<
    operations['following___requests___list']['requestBody']
>['content']['application/json'];
export type FollowingRequestsListResponse =
    operations['following___requests___list']['responses']['200']['content']['application/json'];
export type FollowingRequestsRejectRequest = NonNullable<
    operations['following___requests___reject']['requestBody']
>['content']['application/json'];
export type FollowingRequestsSentRequest = NonNullable<
    operations['following___requests___sent']['requestBody']
>['content']['application/json'];
export type FollowingRequestsSentResponse =
    operations['following___requests___sent']['responses']['200']['content']['application/json'];
export type FollowingUpdateRequest = NonNullable<
    operations['following___update']['requestBody']
>['content']['application/json'];
export type FollowingUpdateResponse =
    operations['following___update']['responses']['200']['content']['application/json'];
export type FollowingUpdateAllRequest = NonNullable<
    operations['following___update-all']['requestBody']
>['content']['application/json'];
export type GalleryFeaturedRequest = NonNullable<
    operations['gallery___featured']['requestBody']
>['content']['application/json'];
export type GalleryFeaturedResponse =
    operations['gallery___featured']['responses']['200']['content']['application/json'];
export type GalleryPopularResponse = operations['gallery___popular']['responses']['200']['content']['application/json'];
export type GalleryPostsRequest = NonNullable<
    operations['gallery___posts']['requestBody']
>['content']['application/json'];
export type GalleryPostsResponse = operations['gallery___posts']['responses']['200']['content']['application/json'];
export type GalleryPostsCreateRequest = NonNullable<
    operations['gallery___posts___create']['requestBody']
>['content']['application/json'];
export type GalleryPostsCreateResponse =
    operations['gallery___posts___create']['responses']['200']['content']['application/json'];
export type GalleryPostsDeleteRequest = NonNullable<
    operations['gallery___posts___delete']['requestBody']
>['content']['application/json'];
export type GalleryPostsLikeRequest = NonNullable<
    operations['gallery___posts___like']['requestBody']
>['content']['application/json'];
export type GalleryPostsShowRequest = NonNullable<
    operations['gallery___posts___show']['requestBody']
>['content']['application/json'];
export type GalleryPostsShowResponse =
    operations['gallery___posts___show']['responses']['200']['content']['application/json'];
export type GalleryPostsUnlikeRequest = NonNullable<
    operations['gallery___posts___unlike']['requestBody']
>['content']['application/json'];
export type GalleryPostsUpdateRequest = NonNullable<
    operations['gallery___posts___update']['requestBody']
>['content']['application/json'];
export type GalleryPostsUpdateResponse =
    operations['gallery___posts___update']['responses']['200']['content']['application/json'];
export type GetAvatarDecorationsResponse =
    operations['get-avatar-decorations']['responses']['200']['content']['application/json'];
export type GetOnlineUsersCountResponse =
    operations['get-online-users-count']['responses']['200']['content']['application/json'];
export type HashtagsListRequest = NonNullable<
    operations['hashtags___list']['requestBody']
>['content']['application/json'];
export type HashtagsListResponse = operations['hashtags___list']['responses']['200']['content']['application/json'];
export type HashtagsSearchRequest = NonNullable<
    operations['hashtags___search']['requestBody']
>['content']['application/json'];
export type HashtagsSearchResponse = operations['hashtags___search']['responses']['200']['content']['application/json'];
export type HashtagsShowRequest = NonNullable<
    operations['hashtags___show']['requestBody']
>['content']['application/json'];
export type HashtagsShowResponse = operations['hashtags___show']['responses']['200']['content']['application/json'];
export type HashtagsTrendResponse = operations['hashtags___trend']['responses']['200']['content']['application/json'];
export type HashtagsUsersRequest = NonNullable<
    operations['hashtags___users']['requestBody']
>['content']['application/json'];
export type HashtagsUsersResponse = operations['hashtags___users']['responses']['200']['content']['application/json'];
export type IResponse = operations['i']['responses']['200']['content']['application/json'];
export type I2faDoneRequest = NonNullable<operations['i___2fa___done']['requestBody']>['content']['application/json'];
export type I2faDoneResponse = operations['i___2fa___done']['responses']['200']['content']['application/json'];
export type I2faKeyDoneRequest = NonNullable<
    operations['i___2fa___key-done']['requestBody']
>['content']['application/json'];
export type I2faKeyDoneResponse = operations['i___2fa___key-done']['responses']['200']['content']['application/json'];
export type I2faPasswordLessRequest = NonNullable<
    operations['i___2fa___password-less']['requestBody']
>['content']['application/json'];
export type I2faRegisterRequest = NonNullable<
    operations['i___2fa___register']['requestBody']
>['content']['application/json'];
export type I2faRegisterResponse = operations['i___2fa___register']['responses']['200']['content']['application/json'];
export type I2faRegisterKeyRequest = NonNullable<
    operations['i___2fa___register-key']['requestBody']
>['content']['application/json'];
export type I2faRegisterKeyResponse =
    operations['i___2fa___register-key']['responses']['200']['content']['application/json'];
export type I2faRemoveKeyRequest = NonNullable<
    operations['i___2fa___remove-key']['requestBody']
>['content']['application/json'];
export type I2faRemoveKeyResponse =
    operations['i___2fa___remove-key']['responses']['200']['content']['application/json'];
export type I2faUnregisterRequest = NonNullable<
    operations['i___2fa___unregister']['requestBody']
>['content']['application/json'];
export type I2faUpdateKeyRequest = NonNullable<
    operations['i___2fa___update-key']['requestBody']
>['content']['application/json'];
export type I2faUpdateKeyResponse =
    operations['i___2fa___update-key']['responses']['200']['content']['application/json'];
export type IAppsRequest = NonNullable<operations['i___apps']['requestBody']>['content']['application/json'];
export type IAppsResponse = operations['i___apps']['responses']['200']['content']['application/json'];
export type IAuthorizedAppsRequest = NonNullable<
    operations['i___authorized-apps']['requestBody']
>['content']['application/json'];
export type IAuthorizedAppsResponse =
    operations['i___authorized-apps']['responses']['200']['content']['application/json'];
export type IChangePasswordRequest = NonNullable<
    operations['i___change-password']['requestBody']
>['content']['application/json'];
export type IClaimAchievementRequest = NonNullable<
    operations['i___claim-achievement']['requestBody']
>['content']['application/json'];
export type IDeleteAccountRequest = NonNullable<
    operations['i___delete-account']['requestBody']
>['content']['application/json'];
export type IExportFollowingRequest = NonNullable<
    operations['i___export-following']['requestBody']
>['content']['application/json'];
export type IFavoritesRequest = NonNullable<operations['i___favorites']['requestBody']>['content']['application/json'];
export type IFavoritesResponse = operations['i___favorites']['responses']['200']['content']['application/json'];
export type IGalleryLikesRequest = NonNullable<
    operations['i___gallery___likes']['requestBody']
>['content']['application/json'];
export type IGalleryLikesResponse =
    operations['i___gallery___likes']['responses']['200']['content']['application/json'];
export type IGalleryPostsRequest = NonNullable<
    operations['i___gallery___posts']['requestBody']
>['content']['application/json'];
export type IGalleryPostsResponse =
    operations['i___gallery___posts']['responses']['200']['content']['application/json'];
export type IImportAntennasRequest = NonNullable<
    operations['i___import-antennas']['requestBody']
>['content']['application/json'];
export type IImportBlockingRequest = NonNullable<
    operations['i___import-blocking']['requestBody']
>['content']['application/json'];
export type IImportFollowingRequest = NonNullable<
    operations['i___import-following']['requestBody']
>['content']['application/json'];
export type IImportMutingRequest = NonNullable<
    operations['i___import-muting']['requestBody']
>['content']['application/json'];
export type IImportUserListsRequest = NonNullable<
    operations['i___import-user-lists']['requestBody']
>['content']['application/json'];
export type IMoveRequest = NonNullable<operations['i___move']['requestBody']>['content']['application/json'];
export type IMoveResponse = operations['i___move']['responses']['200']['content']['application/json'];
export type INotificationsRequest = NonNullable<
    operations['i___notifications']['requestBody']
>['content']['application/json'];
export type INotificationsResponse = operations['i___notifications']['responses']['200']['content']['application/json'];
export type INotificationsGroupedRequest = NonNullable<
    operations['i___notifications-grouped']['requestBody']
>['content']['application/json'];
export type INotificationsGroupedResponse =
    operations['i___notifications-grouped']['responses']['200']['content']['application/json'];
export type IPageLikesRequest = NonNullable<operations['i___page-likes']['requestBody']>['content']['application/json'];
export type IPageLikesResponse = operations['i___page-likes']['responses']['200']['content']['application/json'];
export type IPagesRequest = NonNullable<operations['i___pages']['requestBody']>['content']['application/json'];
export type IPagesResponse = operations['i___pages']['responses']['200']['content']['application/json'];
export type IPinRequest = NonNullable<operations['i___pin']['requestBody']>['content']['application/json'];
export type IPinResponse = operations['i___pin']['responses']['200']['content']['application/json'];
export type IReadAnnouncementRequest = NonNullable<
    operations['i___read-announcement']['requestBody']
>['content']['application/json'];
export type IRegenerateTokenRequest = NonNullable<
    operations['i___regenerate-token']['requestBody']
>['content']['application/json'];
export type IRegistryGetRequest = NonNullable<
    operations['i___registry___get']['requestBody']
>['content']['application/json'];
export type IRegistryGetResponse = operations['i___registry___get']['responses']['200']['content']['application/json'];
export type IRegistryGetAllRequest = NonNullable<
    operations['i___registry___get-all']['requestBody']
>['content']['application/json'];
export type IRegistryGetAllResponse =
    operations['i___registry___get-all']['responses']['200']['content']['application/json'];
export type IRegistryGetDetailRequest = NonNullable<
    operations['i___registry___get-detail']['requestBody']
>['content']['application/json'];
export type IRegistryGetDetailResponse =
    operations['i___registry___get-detail']['responses']['200']['content']['application/json'];
export type IRegistryKeysRequest = NonNullable<
    operations['i___registry___keys']['requestBody']
>['content']['application/json'];
export type IRegistryKeysResponse =
    operations['i___registry___keys']['responses']['200']['content']['application/json'];
export type IRegistryKeysWithTypeRequest = NonNullable<
    operations['i___registry___keys-with-type']['requestBody']
>['content']['application/json'];
export type IRegistryKeysWithTypeResponse =
    operations['i___registry___keys-with-type']['responses']['200']['content']['application/json'];
export type IRegistryRemoveRequest = NonNullable<
    operations['i___registry___remove']['requestBody']
>['content']['application/json'];
export type IRegistryScopesWithDomainResponse =
    operations['i___registry___scopes-with-domain']['responses']['200']['content']['application/json'];
export type IRegistrySetRequest = NonNullable<
    operations['i___registry___set']['requestBody']
>['content']['application/json'];
export type IRevokeTokenRequest = NonNullable<
    operations['i___revoke-token']['requestBody']
>['content']['application/json'];
export type ISigninHistoryRequest = NonNullable<
    operations['i___signin-history']['requestBody']
>['content']['application/json'];
export type ISigninHistoryResponse =
    operations['i___signin-history']['responses']['200']['content']['application/json'];
export type IUnpinRequest = NonNullable<operations['i___unpin']['requestBody']>['content']['application/json'];
export type IUnpinResponse = operations['i___unpin']['responses']['200']['content']['application/json'];
export type IUpdateRequest = NonNullable<operations['i___update']['requestBody']>['content']['application/json'];
export type IUpdateResponse = operations['i___update']['responses']['200']['content']['application/json'];
export type IUpdateEmailRequest = NonNullable<
    operations['i___update-email']['requestBody']
>['content']['application/json'];
export type IUpdateEmailResponse = operations['i___update-email']['responses']['200']['content']['application/json'];
export type IWebhooksCreateRequest = NonNullable<
    operations['i___webhooks___create']['requestBody']
>['content']['application/json'];
export type IWebhooksCreateResponse =
    operations['i___webhooks___create']['responses']['200']['content']['application/json'];
export type IWebhooksDeleteRequest = NonNullable<
    operations['i___webhooks___delete']['requestBody']
>['content']['application/json'];
export type IWebhooksListResponse =
    operations['i___webhooks___list']['responses']['200']['content']['application/json'];
export type IWebhooksShowRequest = NonNullable<
    operations['i___webhooks___show']['requestBody']
>['content']['application/json'];
export type IWebhooksShowResponse =
    operations['i___webhooks___show']['responses']['200']['content']['application/json'];
export type IWebhooksTestRequest = NonNullable<
    operations['i___webhooks___test']['requestBody']
>['content']['application/json'];
export type IWebhooksUpdateRequest = NonNullable<
    operations['i___webhooks___update']['requestBody']
>['content']['application/json'];
export type InviteCreateResponse = operations['invite___create']['responses']['200']['content']['application/json'];
export type InviteDeleteRequest = NonNullable<
    operations['invite___delete']['requestBody']
>['content']['application/json'];
export type InviteLimitResponse = operations['invite___limit']['responses']['200']['content']['application/json'];
export type InviteListRequest = NonNullable<operations['invite___list']['requestBody']>['content']['application/json'];
export type InviteListResponse = operations['invite___list']['responses']['200']['content']['application/json'];
export type MetaRequest = NonNullable<operations['meta']['requestBody']>['content']['application/json'];
export type MetaResponse = operations['meta']['responses']['200']['content']['application/json'];
export type MiauthGenTokenRequest = NonNullable<
    operations['miauth___gen-token']['requestBody']
>['content']['application/json'];
export type MiauthGenTokenResponse =
    operations['miauth___gen-token']['responses']['200']['content']['application/json'];
export type MuteCreateRequest = NonNullable<operations['mute___create']['requestBody']>['content']['application/json'];
export type MuteDeleteRequest = NonNullable<operations['mute___delete']['requestBody']>['content']['application/json'];
export type MuteListRequest = NonNullable<operations['mute___list']['requestBody']>['content']['application/json'];
export type MuteListResponse = operations['mute___list']['responses']['200']['content']['application/json'];
export type MyAppsRequest = NonNullable<operations['my___apps']['requestBody']>['content']['application/json'];
export type MyAppsResponse = operations['my___apps']['responses']['200']['content']['application/json'];
export type NotesRequest = NonNullable<operations['notes']['requestBody']>['content']['application/json'];
export type NotesResponse = operations['notes']['responses']['200']['content']['application/json'];
export type NotesChildrenRequest = NonNullable<
    operations['notes___children']['requestBody']
>['content']['application/json'];
export type NotesChildrenResponse = operations['notes___children']['responses']['200']['content']['application/json'];
export type NotesClipsRequest = NonNullable<operations['notes___clips']['requestBody']>['content']['application/json'];
export type NotesClipsResponse = operations['notes___clips']['responses']['200']['content']['application/json'];
export type NotesConversationRequest = NonNullable<
    operations['notes___conversation']['requestBody']
>['content']['application/json'];
export type NotesConversationResponse =
    operations['notes___conversation']['responses']['200']['content']['application/json'];
export type NotesCreateRequest = NonNullable<
    operations['notes___create']['requestBody']
>['content']['application/json'];
export type NotesCreateResponse = operations['notes___create']['responses']['200']['content']['application/json'];
export type NotesDeleteRequest = NonNullable<
    operations['notes___delete']['requestBody']
>['content']['application/json'];
export type NotesDraftsCountResponse =
    operations['notes___drafts___count']['responses']['200']['content']['application/json'];
export type NotesDraftsCreateRequest = NonNullable<
    operations['notes___drafts___create']['requestBody']
>['content']['application/json'];
export type NotesDraftsCreateResponse =
    operations['notes___drafts___create']['responses']['200']['content']['application/json'];
export type NotesDraftsDeleteRequest = NonNullable<
    operations['notes___drafts___delete']['requestBody']
>['content']['application/json'];
export type NotesDraftsListRequest = NonNullable<
    operations['notes___drafts___list']['requestBody']
>['content']['application/json'];
export type NotesDraftsListResponse =
    operations['notes___drafts___list']['responses']['200']['content']['application/json'];
export type NotesDraftsUpdateRequest = NonNullable<
    operations['notes___drafts___update']['requestBody']
>['content']['application/json'];
export type NotesDraftsUpdateResponse =
    operations['notes___drafts___update']['responses']['200']['content']['application/json'];
export type NotesFavoritesCreateRequest = NonNullable<
    operations['notes___favorites___create']['requestBody']
>['content']['application/json'];
export type NotesFavoritesDeleteRequest = NonNullable<
    operations['notes___favorites___delete']['requestBody']
>['content']['application/json'];
export type NotesFeaturedRequest = NonNullable<
    operations['notes___featured']['requestBody']
>['content']['application/json'];
export type NotesFeaturedResponse = operations['notes___featured']['responses']['200']['content']['application/json'];
export type NotesGlobalTimelineRequest = NonNullable<
    operations['notes___global-timeline']['requestBody']
>['content']['application/json'];
export type NotesGlobalTimelineResponse =
    operations['notes___global-timeline']['responses']['200']['content']['application/json'];
export type NotesHybridTimelineRequest = NonNullable<
    operations['notes___hybrid-timeline']['requestBody']
>['content']['application/json'];
export type NotesHybridTimelineResponse =
    operations['notes___hybrid-timeline']['responses']['200']['content']['application/json'];
export type NotesLocalTimelineRequest = NonNullable<
    operations['notes___local-timeline']['requestBody']
>['content']['application/json'];
export type NotesLocalTimelineResponse =
    operations['notes___local-timeline']['responses']['200']['content']['application/json'];
export type NotesMentionsRequest = NonNullable<
    operations['notes___mentions']['requestBody']
>['content']['application/json'];
export type NotesMentionsResponse = operations['notes___mentions']['responses']['200']['content']['application/json'];
export type NotesPollsRecommendationRequest = NonNullable<
    operations['notes___polls___recommendation']['requestBody']
>['content']['application/json'];
export type NotesPollsRecommendationResponse =
    operations['notes___polls___recommendation']['responses']['200']['content']['application/json'];
export type NotesPollsVoteRequest = NonNullable<
    operations['notes___polls___vote']['requestBody']
>['content']['application/json'];
export type NotesReactionsRequest = NonNullable<
    operations['notes___reactions']['requestBody']
>['content']['application/json'];
export type NotesReactionsResponse = operations['notes___reactions']['responses']['200']['content']['application/json'];
export type NotesReactionsCreateRequest = NonNullable<
    operations['notes___reactions___create']['requestBody']
>['content']['application/json'];
export type NotesReactionsDeleteRequest = NonNullable<
    operations['notes___reactions___delete']['requestBody']
>['content']['application/json'];
export type NotesRenotesRequest = NonNullable<
    operations['notes___renotes']['requestBody']
>['content']['application/json'];
export type NotesRenotesResponse = operations['notes___renotes']['responses']['200']['content']['application/json'];
export type NotesRepliesRequest = NonNullable<
    operations['notes___replies']['requestBody']
>['content']['application/json'];
export type NotesRepliesResponse = operations['notes___replies']['responses']['200']['content']['application/json'];
export type NotesSearchRequest = NonNullable<
    operations['notes___search']['requestBody']
>['content']['application/json'];
export type NotesSearchResponse = operations['notes___search']['responses']['200']['content']['application/json'];
export type NotesSearchByTagRequest = NonNullable<
    operations['notes___search-by-tag']['requestBody']
>['content']['application/json'];
export type NotesSearchByTagResponse =
    operations['notes___search-by-tag']['responses']['200']['content']['application/json'];
export type NotesShowRequest = NonNullable<operations['notes___show']['requestBody']>['content']['application/json'];
export type NotesShowResponse = operations['notes___show']['responses']['200']['content']['application/json'];
export type NotesShowPartialBulkRequest = NonNullable<
    operations['notes___show-partial-bulk']['requestBody']
>['content']['application/json'];
export type NotesShowPartialBulkResponse =
    operations['notes___show-partial-bulk']['responses']['200']['content']['application/json'];
export type NotesStateRequest = NonNullable<operations['notes___state']['requestBody']>['content']['application/json'];
export type NotesStateResponse = operations['notes___state']['responses']['200']['content']['application/json'];
export type NotesThreadMutingCreateRequest = NonNullable<
    operations['notes___thread-muting___create']['requestBody']
>['content']['application/json'];
export type NotesThreadMutingDeleteRequest = NonNullable<
    operations['notes___thread-muting___delete']['requestBody']
>['content']['application/json'];
export type NotesTimelineRequest = NonNullable<
    operations['notes___timeline']['requestBody']
>['content']['application/json'];
export type NotesTimelineResponse = operations['notes___timeline']['responses']['200']['content']['application/json'];
export type NotesTranslateRequest = NonNullable<
    operations['notes___translate']['requestBody']
>['content']['application/json'];
export type NotesTranslateResponse =
    | operations['notes___translate']['responses']['200']['content']['application/json']
    | null;
export type NotesUnrenoteRequest = NonNullable<
    operations['notes___unrenote']['requestBody']
>['content']['application/json'];
export type NotesUserListTimelineRequest = NonNullable<
    operations['notes___user-list-timeline']['requestBody']
>['content']['application/json'];
export type NotesUserListTimelineResponse =
    operations['notes___user-list-timeline']['responses']['200']['content']['application/json'];
export type NotificationsCreateRequest = NonNullable<
    operations['notifications___create']['requestBody']
>['content']['application/json'];
export type NotificationsDeleteRequest = NonNullable<
    operations['notifications___delete']['requestBody']
>['content']['application/json'];
export type PagePushRequest = NonNullable<operations['page-push']['requestBody']>['content']['application/json'];
export type PagesCreateRequest = NonNullable<
    operations['pages___create']['requestBody']
>['content']['application/json'];
export type PagesCreateResponse = operations['pages___create']['responses']['200']['content']['application/json'];
export type PagesDeleteRequest = NonNullable<
    operations['pages___delete']['requestBody']
>['content']['application/json'];
export type PagesFeaturedResponse = operations['pages___featured']['responses']['200']['content']['application/json'];
export type PagesLikeRequest = NonNullable<operations['pages___like']['requestBody']>['content']['application/json'];
export type PagesShowRequest = NonNullable<operations['pages___show']['requestBody']>['content']['application/json'];
export type PagesShowResponse = operations['pages___show']['responses']['200']['content']['application/json'];
export type PagesUnlikeRequest = NonNullable<
    operations['pages___unlike']['requestBody']
>['content']['application/json'];
export type PagesUpdateRequest = NonNullable<
    operations['pages___update']['requestBody']
>['content']['application/json'];
export type PingResponse = operations['ping']['responses']['200']['content']['application/json'];
export type PinnedUsersResponse = operations['pinned-users']['responses']['200']['content']['application/json'];
export type PromoReadRequest = NonNullable<operations['promo___read']['requestBody']>['content']['application/json'];
export type RenoteMuteCreateRequest = NonNullable<
    operations['renote-mute___create']['requestBody']
>['content']['application/json'];
export type RenoteMuteDeleteRequest = NonNullable<
    operations['renote-mute___delete']['requestBody']
>['content']['application/json'];
export type RenoteMuteListRequest = NonNullable<
    operations['renote-mute___list']['requestBody']
>['content']['application/json'];
export type RenoteMuteListResponse =
    operations['renote-mute___list']['responses']['200']['content']['application/json'];
export type RequestResetPasswordRequest = NonNullable<
    operations['request-reset-password']['requestBody']
>['content']['application/json'];
export type ResetPasswordRequest = NonNullable<
    operations['reset-password']['requestBody']
>['content']['application/json'];
export type RetentionResponse = operations['retention']['responses']['200']['content']['application/json'];
export type RolesListResponse = operations['roles___list']['responses']['200']['content']['application/json'];
export type RolesNotesRequest = NonNullable<operations['roles___notes']['requestBody']>['content']['application/json'];
export type RolesNotesResponse = operations['roles___notes']['responses']['200']['content']['application/json'];
export type RolesShowRequest = NonNullable<operations['roles___show']['requestBody']>['content']['application/json'];
export type RolesShowResponse = operations['roles___show']['responses']['200']['content']['application/json'];
export type RolesUsersRequest = NonNullable<operations['roles___users']['requestBody']>['content']['application/json'];
export type RolesUsersResponse = operations['roles___users']['responses']['200']['content']['application/json'];
export type ServerInfoResponse = operations['server-info']['responses']['200']['content']['application/json'];
export type StatsResponse = operations['stats']['responses']['200']['content']['application/json'];
export type SwRegisterRequest = NonNullable<operations['sw___register']['requestBody']>['content']['application/json'];
export type SwRegisterResponse = operations['sw___register']['responses']['200']['content']['application/json'];
export type SwShowRegistrationRequest = NonNullable<
    operations['sw___show-registration']['requestBody']
>['content']['application/json'];
export type SwShowRegistrationResponse =
    operations['sw___show-registration']['responses']['200']['content']['application/json'];
export type SwUnregisterRequest = NonNullable<
    operations['sw___unregister']['requestBody']
>['content']['application/json'];
export type SwUpdateRegistrationRequest = NonNullable<
    operations['sw___update-registration']['requestBody']
>['content']['application/json'];
export type SwUpdateRegistrationResponse =
    operations['sw___update-registration']['responses']['200']['content']['application/json'];
export type TestRequest = NonNullable<operations['test']['requestBody']>['content']['application/json'];
export type TestResponse = operations['test']['responses']['200']['content']['application/json'];
export type UsernameAvailableRequest = NonNullable<
    operations['username___available']['requestBody']
>['content']['application/json'];
export type UsernameAvailableResponse =
    operations['username___available']['responses']['200']['content']['application/json'];
export type UsersRequest = NonNullable<operations['users']['requestBody']>['content']['application/json'];
export type UsersResponse = operations['users']['responses']['200']['content']['application/json'];
export type UsersAchievementsRequest = NonNullable<
    operations['users___achievements']['requestBody']
>['content']['application/json'];
export type UsersAchievementsResponse =
    operations['users___achievements']['responses']['200']['content']['application/json'];
export type UsersClipsRequest = NonNullable<operations['users___clips']['requestBody']>['content']['application/json'];
export type UsersClipsResponse = operations['users___clips']['responses']['200']['content']['application/json'];
export type UsersFeaturedNotesRequest = NonNullable<
    operations['users___featured-notes']['requestBody']
>['content']['application/json'];
export type UsersFeaturedNotesResponse =
    operations['users___featured-notes']['responses']['200']['content']['application/json'];
export type UsersFlashsRequest = NonNullable<
    operations['users___flashs']['requestBody']
>['content']['application/json'];
export type UsersFlashsResponse = operations['users___flashs']['responses']['200']['content']['application/json'];
export type UsersFollowersRequest = NonNullable<
    operations['users___followers']['requestBody']
>['content']['application/json'];
export type UsersFollowersResponse = operations['users___followers']['responses']['200']['content']['application/json'];
export type UsersFollowingRequest = NonNullable<
    operations['users___following']['requestBody']
>['content']['application/json'];
export type UsersFollowingResponse = operations['users___following']['responses']['200']['content']['application/json'];
export type UsersGalleryPostsRequest = NonNullable<
    operations['users___gallery___posts']['requestBody']
>['content']['application/json'];
export type UsersGalleryPostsResponse =
    operations['users___gallery___posts']['responses']['200']['content']['application/json'];
export type UsersGetFollowingUsersByBirthdayRequest = NonNullable<
    operations['users___get-following-users-by-birthday']['requestBody']
>['content']['application/json'];
export type UsersGetFollowingUsersByBirthdayResponse =
    operations['users___get-following-users-by-birthday']['responses']['200']['content']['application/json'];
export type UsersGetFrequentlyRepliedUsersRequest = NonNullable<
    operations['users___get-frequently-replied-users']['requestBody']
>['content']['application/json'];
export type UsersGetFrequentlyRepliedUsersResponse =
    operations['users___get-frequently-replied-users']['responses']['200']['content']['application/json'];
export type UsersListsCreateRequest = NonNullable<
    operations['users___lists___create']['requestBody']
>['content']['application/json'];
export type UsersListsCreateResponse =
    operations['users___lists___create']['responses']['200']['content']['application/json'];
export type UsersListsCreateFromPublicRequest = NonNullable<
    operations['users___lists___create-from-public']['requestBody']
>['content']['application/json'];
export type UsersListsCreateFromPublicResponse =
    operations['users___lists___create-from-public']['responses']['200']['content']['application/json'];
export type UsersListsDeleteRequest = NonNullable<
    operations['users___lists___delete']['requestBody']
>['content']['application/json'];
export type UsersListsFavoriteRequest = NonNullable<
    operations['users___lists___favorite']['requestBody']
>['content']['application/json'];
export type UsersListsGetMembershipsRequest = NonNullable<
    operations['users___lists___get-memberships']['requestBody']
>['content']['application/json'];
export type UsersListsGetMembershipsResponse =
    operations['users___lists___get-memberships']['responses']['200']['content']['application/json'];
export type UsersListsListRequest = NonNullable<
    operations['users___lists___list']['requestBody']
>['content']['application/json'];
export type UsersListsListResponse =
    operations['users___lists___list']['responses']['200']['content']['application/json'];
export type UsersListsPullRequest = NonNullable<
    operations['users___lists___pull']['requestBody']
>['content']['application/json'];
export type UsersListsPushRequest = NonNullable<
    operations['users___lists___push']['requestBody']
>['content']['application/json'];
export type UsersListsShowRequest = NonNullable<
    operations['users___lists___show']['requestBody']
>['content']['application/json'];
export type UsersListsShowResponse =
    operations['users___lists___show']['responses']['200']['content']['application/json'];
export type UsersListsUnfavoriteRequest = NonNullable<
    operations['users___lists___unfavorite']['requestBody']
>['content']['application/json'];
export type UsersListsUpdateRequest = NonNullable<
    operations['users___lists___update']['requestBody']
>['content']['application/json'];
export type UsersListsUpdateResponse =
    operations['users___lists___update']['responses']['200']['content']['application/json'];
export type UsersListsUpdateMembershipRequest = NonNullable<
    operations['users___lists___update-membership']['requestBody']
>['content']['application/json'];
export type UsersNotesRequest = NonNullable<operations['users___notes']['requestBody']>['content']['application/json'];
export type UsersNotesResponse = operations['users___notes']['responses']['200']['content']['application/json'];
export type UsersPagesRequest = NonNullable<operations['users___pages']['requestBody']>['content']['application/json'];
export type UsersPagesResponse = operations['users___pages']['responses']['200']['content']['application/json'];
export type UsersReactionsRequest = NonNullable<
    operations['users___reactions']['requestBody']
>['content']['application/json'];
export type UsersReactionsResponse = operations['users___reactions']['responses']['200']['content']['application/json'];
export type UsersRecommendationRequest = NonNullable<
    operations['users___recommendation']['requestBody']
>['content']['application/json'];
export type UsersRecommendationResponse =
    operations['users___recommendation']['responses']['200']['content']['application/json'];
export type UsersRelationRequest = NonNullable<
    operations['users___relation']['requestBody']
>['content']['application/json'];
export type UsersRelationResponse = operations['users___relation']['responses']['200']['content']['application/json'];
export type UsersReportAbuseRequest = NonNullable<
    operations['users___report-abuse']['requestBody']
>['content']['application/json'];
export type UsersSearchRequest = NonNullable<
    operations['users___search']['requestBody']
>['content']['application/json'];
export type UsersSearchResponse = operations['users___search']['responses']['200']['content']['application/json'];
export type UsersSearchByUsernameAndHostRequest = NonNullable<
    operations['users___search-by-username-and-host']['requestBody']
>['content']['application/json'];
export type UsersSearchByUsernameAndHostResponse =
    operations['users___search-by-username-and-host']['responses']['200']['content']['application/json'];
export type UsersShowRequest = NonNullable<operations['users___show']['requestBody']>['content']['application/json'];
export type UsersShowResponse = operations['users___show']['responses']['200']['content']['application/json'];
export type UsersUpdateMemoRequest = NonNullable<
    operations['users___update-memo']['requestBody']
>['content']['application/json'];
export type V2AdminEmojiListRequest = NonNullable<
    operations['v2___admin___emoji___list']['requestBody']
>['content']['application/json'];
export type V2AdminEmojiListResponse =
    operations['v2___admin___emoji___list']['responses']['200']['content']['application/json'];
export type VerifyEmailRequest = NonNullable<operations['verify-email']['requestBody']>['content']['application/json'];
