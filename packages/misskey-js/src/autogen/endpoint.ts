import type {
    EmptyRequest,
    EmptyResponse,
    AdminAbuseReportNotificationRecipientCreateRequest,
    AdminAbuseReportNotificationRecipientCreateResponse,
    AdminAbuseReportNotificationRecipientDeleteRequest,
    AdminAbuseReportNotificationRecipientListRequest,
    AdminAbuseReportNotificationRecipientListResponse,
    AdminAbuseReportNotificationRecipientShowRequest,
    AdminAbuseReportNotificationRecipientShowResponse,
    AdminAbuseReportNotificationRecipientUpdateRequest,
    AdminAbuseReportNotificationRecipientUpdateResponse,
    AdminAbuseUserReportsRequest,
    AdminAbuseUserReportsResponse,
    AdminAccountsCreateRequest,
    AdminAccountsCreateResponse,
    AdminAccountsDeleteRequest,
    AdminAccountsFindByEmailRequest,
    AdminAccountsFindByEmailResponse,
    AdminAdCreateRequest,
    AdminAdCreateResponse,
    AdminAdDeleteRequest,
    AdminAdListRequest,
    AdminAdListResponse,
    AdminAdUpdateRequest,
    AdminAnnouncementsCreateRequest,
    AdminAnnouncementsCreateResponse,
    AdminAnnouncementsDeleteRequest,
    AdminAnnouncementsListRequest,
    AdminAnnouncementsListResponse,
    AdminAnnouncementsUpdateRequest,
    AdminAvatarDecorationsCreateRequest,
    AdminAvatarDecorationsCreateResponse,
    AdminAvatarDecorationsDeleteRequest,
    AdminAvatarDecorationsListRequest,
    AdminAvatarDecorationsListResponse,
    AdminAvatarDecorationsUpdateRequest,
    AdminCaptchaCurrentResponse,
    AdminCaptchaSaveRequest,
    AdminDeleteAccountRequest,
    AdminDeleteAllFilesOfAUserRequest,
    AdminDriveFilesRequest,
    AdminDriveFilesResponse,
    AdminDriveShowFileRequest,
    AdminDriveShowFileResponse,
    AdminEmojiAddRequest,
    AdminEmojiAddResponse,
    AdminEmojiAddAliasesBulkRequest,
    AdminEmojiCopyRequest,
    AdminEmojiCopyResponse,
    AdminEmojiDeleteRequest,
    AdminEmojiDeleteBulkRequest,
    AdminEmojiImportZipRequest,
    AdminEmojiListRequest,
    AdminEmojiListResponse,
    AdminEmojiListRemoteRequest,
    AdminEmojiListRemoteResponse,
    AdminEmojiRemoveAliasesBulkRequest,
    AdminEmojiSetAliasesBulkRequest,
    AdminEmojiSetCategoryBulkRequest,
    AdminEmojiSetLicenseBulkRequest,
    AdminEmojiUpdateRequest,
    AdminFederationDeleteAllFilesRequest,
    AdminFederationRefreshRemoteInstanceMetadataRequest,
    AdminFederationRemoveAllFollowingRequest,
    AdminFederationUpdateInstanceRequest,
    AdminForwardAbuseUserReportRequest,
    AdminGetIndexStatsResponse,
    AdminGetTableStatsResponse,
    AdminGetUserIpsRequest,
    AdminGetUserIpsResponse,
    AdminInviteCreateRequest,
    AdminInviteCreateResponse,
    AdminInviteListRequest,
    AdminInviteListResponse,
    AdminMetaResponse,
    AdminPromoCreateRequest,
    AdminQueueAbandonOutboxDeadLetterRequest,
    AdminQueueClearRequest,
    AdminQueueDeliverDelayedResponse,
    AdminQueueInboxDelayedResponse,
    AdminQueueJobsRequest,
    AdminQueueJobsResponse,
    AdminQueueOutboxDeadLettersRequest,
    AdminQueueOutboxDeadLettersResponse,
    AdminQueuePauseRequest,
    AdminQueuePromoteJobsRequest,
    AdminQueueQueueStatsRequest,
    AdminQueueQueueStatsResponse,
    AdminQueueQueuesResponse,
    AdminQueueRemoveJobRequest,
    AdminQueueResumeRequest,
    AdminQueueRetryJobRequest,
    AdminQueueRetryOutboxDeadLetterRequest,
    AdminQueueShowJobRequest,
    AdminQueueShowJobResponse,
    AdminQueueShowJobLogsRequest,
    AdminQueueShowJobLogsResponse,
    AdminQueueStatsResponse,
    AdminRelaysAddRequest,
    AdminRelaysAddResponse,
    AdminRelaysListResponse,
    AdminRelaysRemoveRequest,
    AdminResetPasswordRequest,
    AdminResetPasswordResponse,
    AdminResolveAbuseUserReportRequest,
    AdminRolesAssignRequest,
    AdminRolesCreateRequest,
    AdminRolesCreateResponse,
    AdminRolesDeleteRequest,
    AdminRolesListResponse,
    AdminRolesShowRequest,
    AdminRolesShowResponse,
    AdminRolesUnassignRequest,
    AdminRolesUpdateRequest,
    AdminRolesUpdateDefaultPoliciesRequest,
    AdminRolesUsersRequest,
    AdminRolesUsersResponse,
    AdminSendEmailRequest,
    AdminServerInfoResponse,
    AdminShowModerationLogsRequest,
    AdminShowModerationLogsResponse,
    AdminShowUserRequest,
    AdminShowUserResponse,
    AdminShowUsersRequest,
    AdminShowUsersResponse,
    AdminSuspendUserRequest,
    AdminSystemWebhookCreateRequest,
    AdminSystemWebhookCreateResponse,
    AdminSystemWebhookDeleteRequest,
    AdminSystemWebhookListRequest,
    AdminSystemWebhookListResponse,
    AdminSystemWebhookShowRequest,
    AdminSystemWebhookShowResponse,
    AdminSystemWebhookTestRequest,
    AdminSystemWebhookUpdateRequest,
    AdminSystemWebhookUpdateResponse,
    AdminUnsetMfaRequest,
    AdminUnsetUserAvatarRequest,
    AdminUnsetUserBannerRequest,
    AdminUnsuspendUserRequest,
    AdminUpdateAbuseUserReportRequest,
    AdminUpdateMetaRequest,
    AdminUpdateProxyAccountRequest,
    AdminUpdateProxyAccountResponse,
    AdminUpdateUserNoteRequest,
    AnnouncementsRequest,
    AnnouncementsResponse,
    AnnouncementsShowRequest,
    AnnouncementsShowResponse,
    AnnouncementsReactRequest,
    AnnouncementsUnreactRequest,
    AntennasCreateRequest,
    AntennasCreateResponse,
    AntennasDeleteRequest,
    AntennasListResponse,
    AntennasNotesRequest,
    AntennasNotesResponse,
    AntennasRemoveNoteRequest,
    AntennasShowRequest,
    AntennasShowResponse,
    AntennasUpdateRequest,
    AntennasUpdateResponse,
    ApGetRequest,
    ApGetResponse,
    ApShowRequest,
    ApShowResponse,
    BlockingCreateRequest,
    BlockingCreateResponse,
    BlockingDeleteRequest,
    BlockingDeleteResponse,
    BlockingListRequest,
    BlockingListResponse,
    ChannelsCreateRequest,
    ChannelsCreateResponse,
    ChannelsFavoriteRequest,
    ChannelsFeaturedResponse,
    ChannelsFollowRequest,
    ChannelsFollowedRequest,
    ChannelsFollowedResponse,
    ChannelsMuteCreateRequest,
    ChannelsMuteDeleteRequest,
    ChannelsMuteListResponse,
    ChannelsMyFavoritesResponse,
    ChannelsOwnedRequest,
    ChannelsOwnedResponse,
    ChannelsSearchRequest,
    ChannelsSearchResponse,
    ChannelsShowRequest,
    ChannelsShowResponse,
    ChannelsTimelineRequest,
    ChannelsTimelineResponse,
    ChannelsUnfavoriteRequest,
    ChannelsUnfollowRequest,
    ChannelsUpdateRequest,
    ChannelsUpdateResponse,
    ChartsActiveUsersRequest,
    ChartsActiveUsersResponse,
    ChartsApRequestRequest,
    ChartsApRequestResponse,
    ChartsDriveRequest,
    ChartsDriveResponse,
    ChartsFederationRequest,
    ChartsFederationResponse,
    ChartsInstanceRequest,
    ChartsInstanceResponse,
    ChartsNotesRequest,
    ChartsNotesResponse,
    ChartsUserDriveRequest,
    ChartsUserDriveResponse,
    ChartsUserFollowingRequest,
    ChartsUserFollowingResponse,
    ChartsUserNotesRequest,
    ChartsUserNotesResponse,
    ChartsUserPvRequest,
    ChartsUserPvResponse,
    ChartsUserReactionsRequest,
    ChartsUserReactionsResponse,
    ChartsUsersRequest,
    ChartsUsersResponse,
    ChatHistoryRequest,
    ChatHistoryResponse,
    ChatMessagesCreateToRoomRequest,
    ChatMessagesCreateToRoomResponse,
    ChatMessagesCreateToUserRequest,
    ChatMessagesCreateToUserResponse,
    ChatMessagesDeleteRequest,
    ChatMessagesReactRequest,
    ChatMessagesRoomTimelineRequest,
    ChatMessagesRoomTimelineResponse,
    ChatMessagesSearchRequest,
    ChatMessagesSearchResponse,
    ChatMessagesShowRequest,
    ChatMessagesShowResponse,
    ChatMessagesUnreactRequest,
    ChatMessagesUserTimelineRequest,
    ChatMessagesUserTimelineResponse,
    ChatRoomsCreateRequest,
    ChatRoomsCreateResponse,
    ChatRoomsDeleteRequest,
    ChatRoomsInvitationsCreateRequest,
    ChatRoomsInvitationsCreateResponse,
    ChatRoomsInvitationsIgnoreRequest,
    ChatRoomsInvitationsInboxRequest,
    ChatRoomsInvitationsInboxResponse,
    ChatRoomsInvitationsOutboxRequest,
    ChatRoomsInvitationsOutboxResponse,
    ChatRoomsJoinRequest,
    ChatRoomsJoiningRequest,
    ChatRoomsJoiningResponse,
    ChatRoomsLeaveRequest,
    ChatRoomsMembersRequest,
    ChatRoomsMembersResponse,
    ChatRoomsMuteRequest,
    ChatRoomsOwnedRequest,
    ChatRoomsOwnedResponse,
    ChatRoomsShowRequest,
    ChatRoomsShowResponse,
    ChatRoomsUpdateRequest,
    ChatRoomsUpdateResponse,
    ClipsAddNoteRequest,
    ClipsCreateRequest,
    ClipsCreateResponse,
    ClipsDeleteRequest,
    ClipsFavoriteRequest,
    ClipsListRequest,
    ClipsListResponse,
    ClipsMyFavoritesResponse,
    ClipsNotesRequest,
    ClipsNotesResponse,
    ClipsRemoveNoteRequest,
    ClipsShowRequest,
    ClipsShowResponse,
    ClipsUnfavoriteRequest,
    ClipsUpdateRequest,
    ClipsUpdateResponse,
    DriveResponse,
    DriveFilesRequest,
    DriveFilesResponse,
    DriveFilesAttachedChatMessagesRequest,
    DriveFilesAttachedChatMessagesResponse,
    DriveFilesAttachedNotesRequest,
    DriveFilesAttachedNotesResponse,
    DriveFilesCheckExistenceRequest,
    DriveFilesCheckExistenceResponse,
    DriveFilesCreateRequest,
    DriveFilesCreateResponse,
    DriveFilesDeleteRequest,
    DriveFilesFindRequest,
    DriveFilesFindResponse,
    DriveFilesFindByHashRequest,
    DriveFilesFindByHashResponse,
    DriveFilesMoveBulkRequest,
    DriveFilesShowRequest,
    DriveFilesShowResponse,
    DriveFilesUpdateRequest,
    DriveFilesUpdateResponse,
    DriveFilesUploadFromUrlRequest,
    DriveFoldersRequest,
    DriveFoldersResponse,
    DriveFoldersCreateRequest,
    DriveFoldersCreateResponse,
    DriveFoldersDeleteRequest,
    DriveFoldersFindRequest,
    DriveFoldersFindResponse,
    DriveFoldersShowRequest,
    DriveFoldersShowResponse,
    DriveFoldersUpdateRequest,
    DriveFoldersUpdateResponse,
    DriveStreamRequest,
    DriveStreamResponse,
    EmailAddressAvailableRequest,
    EmailAddressAvailableResponse,
    EmojiRequest,
    EmojiResponse,
    EmojisResponse,
    EndpointRequest,
    EndpointResponse,
    EndpointsResponse,
    FederationFollowersRequest,
    FederationFollowersResponse,
    FederationFollowingRequest,
    FederationFollowingResponse,
    FederationInstancesRequest,
    FederationInstancesResponse,
    FederationShowInstanceRequest,
    FederationShowInstanceResponse,
    FederationStatsRequest,
    FederationStatsResponse,
    FederationUpdateRemoteUserRequest,
    FederationUsersRequest,
    FederationUsersResponse,
    FetchExternalResourcesRequest,
    FetchExternalResourcesResponse,
    FetchRssRequest,
    FetchRssResponse,
    FlashCreateRequest,
    FlashCreateResponse,
    FlashDeleteRequest,
    FlashFeaturedRequest,
    FlashFeaturedResponse,
    FlashLikeRequest,
    FlashMyRequest,
    FlashMyResponse,
    FlashMyLikesRequest,
    FlashMyLikesResponse,
    FlashSearchRequest,
    FlashSearchResponse,
    FlashShowRequest,
    FlashShowResponse,
    FlashUnlikeRequest,
    FlashUpdateRequest,
    FollowingCreateRequest,
    FollowingCreateResponse,
    FollowingDeleteRequest,
    FollowingDeleteResponse,
    FollowingInvalidateRequest,
    FollowingInvalidateResponse,
    FollowingListRequest,
    FollowingListResponse,
    FollowingRequestsAcceptRequest,
    FollowingRequestsCancelRequest,
    FollowingRequestsCancelResponse,
    FollowingRequestsListRequest,
    FollowingRequestsListResponse,
    FollowingRequestsRejectRequest,
    FollowingRequestsSentRequest,
    FollowingRequestsSentResponse,
    FollowingUpdateRequest,
    FollowingUpdateResponse,
    FollowingUpdateAllRequest,
    GalleryFeaturedRequest,
    GalleryFeaturedResponse,
    GalleryPopularResponse,
    GalleryPostsRequest,
    GalleryPostsResponse,
    GalleryPostsCreateRequest,
    GalleryPostsCreateResponse,
    GalleryPostsDeleteRequest,
    GalleryPostsLikeRequest,
    GalleryPostsShowRequest,
    GalleryPostsShowResponse,
    GalleryPostsUnlikeRequest,
    GalleryPostsUpdateRequest,
    GalleryPostsUpdateResponse,
    GetAvatarDecorationsResponse,
    GetOnlineUsersCountResponse,
    HashtagsListRequest,
    HashtagsListResponse,
    HashtagsSearchRequest,
    HashtagsSearchResponse,
    HashtagsShowRequest,
    HashtagsShowResponse,
    HashtagsTrendResponse,
    HashtagsUsersRequest,
    HashtagsUsersResponse,
    IResponse,
    I2faDoneRequest,
    I2faDoneResponse,
    I2faKeyDoneRequest,
    I2faKeyDoneResponse,
    I2faPasswordLessRequest,
    I2faRegisterRequest,
    I2faRegisterResponse,
    I2faRegisterKeyRequest,
    I2faRegisterKeyResponse,
    I2faRemoveKeyRequest,
    I2faRemoveKeyResponse,
    I2faUnregisterRequest,
    I2faUpdateKeyRequest,
    I2faUpdateKeyResponse,
    IAppsRequest,
    IAppsResponse,
    IChangePasswordRequest,
    IClaimAchievementRequest,
    IDeleteAccountRequest,
    IExportFollowingRequest,
    IFavoritesRequest,
    IFavoritesResponse,
    IGalleryLikesRequest,
    IGalleryLikesResponse,
    IGalleryPostsRequest,
    IGalleryPostsResponse,
    IImportAntennasRequest,
    IImportBlockingRequest,
    IImportFollowingRequest,
    IImportMutingRequest,
    IImportUserListsRequest,
    IMoveRequest,
    IMoveResponse,
    INotificationsRequest,
    INotificationsResponse,
    INotificationsGroupedRequest,
    INotificationsGroupedResponse,
    IPageLikesRequest,
    IPageLikesResponse,
    IPagesRequest,
    IPagesResponse,
    IPinRequest,
    IPinResponse,
    IReadAnnouncementRequest,
    IRegenerateTokenRequest,
    IRegistryGetRequest,
    IRegistryGetResponse,
    IRegistryGetAllRequest,
    IRegistryGetAllResponse,
    IRegistryGetDetailRequest,
    IRegistryGetDetailResponse,
    IRegistryKeysRequest,
    IRegistryKeysResponse,
    IRegistryKeysWithTypeRequest,
    IRegistryKeysWithTypeResponse,
    IRegistryRemoveRequest,
    IRegistryScopesWithDomainResponse,
    IRegistrySetRequest,
    IRevokeTokenRequest,
    ISigninHistoryRequest,
    ISigninHistoryResponse,
    IUnpinRequest,
    IUnpinResponse,
    IUpdateRequest,
    IUpdateResponse,
    IUpdateEmailRequest,
    IUpdateEmailResponse,
    IWebhooksCreateRequest,
    IWebhooksCreateResponse,
    IWebhooksDeleteRequest,
    IWebhooksListResponse,
    IWebhooksShowRequest,
    IWebhooksShowResponse,
    IWebhooksTestRequest,
    IWebhooksUpdateRequest,
    InviteCreateResponse,
    InviteDeleteRequest,
    InviteLimitResponse,
    InviteListRequest,
    InviteListResponse,
    MetaRequest,
    MetaResponse,
    MiauthGenTokenRequest,
    MiauthGenTokenResponse,
    MuteCreateRequest,
    MuteDeleteRequest,
    MuteListRequest,
    MuteListResponse,
    NotesRequest,
    NotesResponse,
    NotesChildrenRequest,
    NotesChildrenResponse,
    NotesClipsRequest,
    NotesClipsResponse,
    NotesConversationRequest,
    NotesConversationResponse,
    NotesCreateRequest,
    NotesCreateResponse,
    NotesDeleteRequest,
    NotesDraftsCountResponse,
    NotesDraftsCreateRequest,
    NotesDraftsCreateResponse,
    NotesDraftsDeleteRequest,
    NotesDraftsListRequest,
    NotesDraftsListResponse,
    NotesDraftsUpdateRequest,
    NotesDraftsUpdateResponse,
    NotesFavoritesCreateRequest,
    NotesFavoritesDeleteRequest,
    NotesFeaturedRequest,
    NotesFeaturedResponse,
    NotesGlobalTimelineRequest,
    NotesGlobalTimelineResponse,
    NotesHybridTimelineRequest,
    NotesHybridTimelineResponse,
    NotesLocalTimelineRequest,
    NotesLocalTimelineResponse,
    NotesMentionsRequest,
    NotesMentionsResponse,
    NotesPollsRecommendationRequest,
    NotesPollsRecommendationResponse,
    NotesPollsVoteRequest,
    NotesReactionsRequest,
    NotesReactionsResponse,
    NotesReactionsCreateRequest,
    NotesReactionsDeleteRequest,
    NotesRenotesRequest,
    NotesRenotesResponse,
    NotesRepliesRequest,
    NotesRepliesResponse,
    NotesSearchRequest,
    NotesSearchResponse,
    NotesSearchByTagRequest,
    NotesSearchByTagResponse,
    NotesShowRequest,
    NotesShowResponse,
    NotesShowPartialBulkRequest,
    NotesShowPartialBulkResponse,
    NotesStateRequest,
    NotesStateResponse,
    NotesThreadMutingCreateRequest,
    NotesThreadMutingDeleteRequest,
    NotesTimelineRequest,
    NotesTimelineResponse,
    NotesTranslateRequest,
    NotesTranslateResponse,
    NotesUnrenoteRequest,
    NotesUserListTimelineRequest,
    NotesUserListTimelineResponse,
    NotificationsCreateRequest,
    NotificationsDeleteRequest,
    PagePushRequest,
    PagesCreateRequest,
    PagesCreateResponse,
    PagesDeleteRequest,
    PagesFeaturedResponse,
    PagesLikeRequest,
    PagesShowRequest,
    PagesShowResponse,
    PagesUnlikeRequest,
    PagesUpdateRequest,
    PingResponse,
    PinnedUsersResponse,
    PromoReadRequest,
    RenoteMuteCreateRequest,
    RenoteMuteDeleteRequest,
    RenoteMuteListRequest,
    RenoteMuteListResponse,
    RequestResetPasswordRequest,
    ResetPasswordRequest,
    RetentionResponse,
    RolesListResponse,
    RolesNotesRequest,
    RolesNotesResponse,
    RolesShowRequest,
    RolesShowResponse,
    RolesUsersRequest,
    RolesUsersResponse,
    ServerInfoResponse,
    StatsResponse,
    SwRegisterRequest,
    SwRegisterResponse,
    SwShowRegistrationRequest,
    SwShowRegistrationResponse,
    SwUnregisterRequest,
    SwUpdateRegistrationRequest,
    SwUpdateRegistrationResponse,
    TestRequest,
    TestResponse,
    UsernameAvailableRequest,
    UsernameAvailableResponse,
    UsersRequest,
    UsersResponse,
    UsersAchievementsRequest,
    UsersAchievementsResponse,
    UsersClipsRequest,
    UsersClipsResponse,
    UsersFeaturedNotesRequest,
    UsersFeaturedNotesResponse,
    UsersFlashsRequest,
    UsersFlashsResponse,
    UsersFollowersRequest,
    UsersFollowersResponse,
    UsersFollowingRequest,
    UsersFollowingResponse,
    UsersGalleryPostsRequest,
    UsersGalleryPostsResponse,
    UsersGetFollowingUsersByBirthdayRequest,
    UsersGetFollowingUsersByBirthdayResponse,
    UsersGetFrequentlyRepliedUsersRequest,
    UsersGetFrequentlyRepliedUsersResponse,
    UsersListsCreateRequest,
    UsersListsCreateResponse,
    UsersListsCreateFromPublicRequest,
    UsersListsCreateFromPublicResponse,
    UsersListsDeleteRequest,
    UsersListsFavoriteRequest,
    UsersListsGetMembershipsRequest,
    UsersListsGetMembershipsResponse,
    UsersListsListRequest,
    UsersListsListResponse,
    UsersListsPullRequest,
    UsersListsPushRequest,
    UsersListsShowRequest,
    UsersListsShowResponse,
    UsersListsUnfavoriteRequest,
    UsersListsUpdateRequest,
    UsersListsUpdateResponse,
    UsersListsUpdateMembershipRequest,
    UsersNotesRequest,
    UsersNotesResponse,
    UsersPagesRequest,
    UsersPagesResponse,
    UsersReactionsRequest,
    UsersReactionsResponse,
    UsersRecommendationRequest,
    UsersRecommendationResponse,
    UsersRelationRequest,
    UsersRelationResponse,
    UsersReportAbuseRequest,
    UsersSearchRequest,
    UsersSearchResponse,
    UsersSearchByUsernameAndHostRequest,
    UsersSearchByUsernameAndHostResponse,
    UsersShowRequest,
    UsersShowResponse,
    UsersUpdateMemoRequest,
    V2AdminEmojiListRequest,
    V2AdminEmojiListResponse,
    VerifyEmailRequest,
} from './entities.js';

export type Endpoints = {
    'admin/abuse-report/notification-recipient/create': {
        req: AdminAbuseReportNotificationRecipientCreateRequest;
        res: AdminAbuseReportNotificationRecipientCreateResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CORRELATION_CHECK_EMAIL'
            | 'CORRELATION_CHECK_WEBHOOK'
            | 'CREDENTIAL_REQUIRED'
            | 'EMAIL_ADDRESS_NOT_SET'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/abuse-report/notification-recipient/delete': {
        req: AdminAbuseReportNotificationRecipientDeleteRequest;
        res: EmptyResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/abuse-report/notification-recipient/list': {
        req: AdminAbuseReportNotificationRecipientListRequest;
        res: AdminAbuseReportNotificationRecipientListResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'admin/abuse-report/notification-recipient/show': {
        req: AdminAbuseReportNotificationRecipientShowRequest;
        res: AdminAbuseReportNotificationRecipientShowResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_RECIPIENT'
            | 'PAYLOAD_TOO_LARGE'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/abuse-report/notification-recipient/update': {
        req: AdminAbuseReportNotificationRecipientUpdateRequest;
        res: AdminAbuseReportNotificationRecipientUpdateResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CORRELATION_CHECK_EMAIL'
            | 'CORRELATION_CHECK_WEBHOOK'
            | 'CREDENTIAL_REQUIRED'
            | 'EMAIL_ADDRESS_NOT_SET'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/abuse-user-reports': {
        req: AdminAbuseUserReportsRequest;
        res: AdminAbuseUserReportsResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'admin/accounts/create': {
        req: AdminAccountsCreateRequest;
        res: AdminAccountsCreateResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'DUPLICATED_USERNAME'
            | 'INCORRECT_INITIAL_PASSWORD'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'USED_USERNAME'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/accounts/delete': {
        req: AdminAccountsDeleteRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_USER'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/accounts/find-by-email': {
        req: AdminAccountsFindByEmailRequest;
        res: AdminAccountsFindByEmailResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'USER_NOT_FOUND'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/ad/create': {
        req: AdminAdCreateRequest;
        res: AdminAdCreateResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/ad/delete': {
        req: AdminAdDeleteRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_AD'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/ad/list': {
        req: AdminAdListRequest;
        res: AdminAdListResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'admin/ad/update': {
        req: AdminAdUpdateRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_AD'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/announcements/create': {
        req: AdminAnnouncementsCreateRequest;
        res: AdminAnnouncementsCreateResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/announcements/delete': {
        req: AdminAnnouncementsDeleteRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_ANNOUNCEMENT'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/announcements/list': {
        req: AdminAnnouncementsListRequest;
        res: AdminAnnouncementsListResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'admin/announcements/update': {
        req: AdminAnnouncementsUpdateRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_ANNOUNCEMENT'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/avatar-decorations/create': {
        req: AdminAvatarDecorationsCreateRequest;
        res: AdminAvatarDecorationsCreateResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/avatar-decorations/delete': {
        req: AdminAvatarDecorationsDeleteRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/avatar-decorations/list': {
        req: AdminAvatarDecorationsListRequest;
        res: AdminAvatarDecorationsListResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'admin/avatar-decorations/update': {
        req: AdminAvatarDecorationsUpdateRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/captcha/current': {
        req: EmptyRequest;
        res: AdminCaptchaCurrentResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'admin/captcha/save': {
        req: AdminCaptchaSaveRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'INVALID_PARAMETERS'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'REQUEST_FAILED'
            | 'ROLE_PERMISSION_DENIED'
            | 'UNKNOWN'
            | 'VERIFICATION_FAILED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/delete-account': {
        req: AdminDeleteAccountRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_USER'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/delete-all-files-of-a-user': {
        req: AdminDeleteAllFilesOfAUserRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/drive/clean-remote-files': {
        req: EmptyRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'admin/drive/cleanup': {
        req: EmptyRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'admin/drive/files': {
        req: AdminDriveFilesRequest;
        res: AdminDriveFilesResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'admin/drive/show-file': {
        req: AdminDriveShowFileRequest;
        res: AdminDriveShowFileResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_FILE'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/emoji/add': {
        req: AdminEmojiAddRequest;
        res: AdminEmojiAddResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'DUPLICATE_NAME'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_FILE'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'UNSUPPORTED_FILE_TYPE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/emoji/add-aliases-bulk': {
        req: AdminEmojiAddAliasesBulkRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_EMOJI'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/emoji/copy': {
        req: AdminEmojiCopyRequest;
        res: AdminEmojiCopyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'DUPLICATE_NAME'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_EMOJI'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/emoji/delete': {
        req: AdminEmojiDeleteRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_EMOJI'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/emoji/delete-bulk': {
        req: AdminEmojiDeleteBulkRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/emoji/import-zip': {
        req: AdminEmojiImportZipRequest;
        res: EmptyResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/emoji/list': {
        req: AdminEmojiListRequest;
        res: AdminEmojiListResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'admin/emoji/list-remote': {
        req: AdminEmojiListRemoteRequest;
        res: AdminEmojiListRemoteResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'admin/emoji/remove-aliases-bulk': {
        req: AdminEmojiRemoveAliasesBulkRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_EMOJI'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/emoji/set-aliases-bulk': {
        req: AdminEmojiSetAliasesBulkRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_EMOJI'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/emoji/set-category-bulk': {
        req: AdminEmojiSetCategoryBulkRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_EMOJI'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/emoji/set-license-bulk': {
        req: AdminEmojiSetLicenseBulkRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_EMOJI'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/emoji/update': {
        req: AdminEmojiUpdateRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_EMOJI'
            | 'NO_SUCH_FILE'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'SAME_NAME_EMOJI_EXISTS'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/federation/delete-all-files': {
        req: AdminFederationDeleteAllFilesRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/federation/refresh-remote-instance-metadata': {
        req: AdminFederationRefreshRemoteInstanceMetadataRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/federation/remove-all-following': {
        req: AdminFederationRemoveAllFollowingRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/federation/update-instance': {
        req: AdminFederationUpdateInstanceRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/forward-abuse-user-report': {
        req: AdminForwardAbuseUserReportRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_ABUSE_REPORT'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/get-index-stats': {
        req: EmptyRequest;
        res: AdminGetIndexStatsResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'admin/get-table-stats': {
        req: EmptyRequest;
        res: AdminGetTableStatsResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'admin/get-user-ips': {
        req: AdminGetUserIpsRequest;
        res: AdminGetUserIpsResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/invite/create': {
        req: AdminInviteCreateRequest;
        res: AdminInviteCreateResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_DATE_TIME'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'admin/invite/list': {
        req: AdminInviteListRequest;
        res: AdminInviteListResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'admin/meta': {
        req: EmptyRequest;
        res: AdminMetaResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'admin/promo/create': {
        req: AdminPromoCreateRequest;
        res: EmptyResponse;
        err:
            | 'ALREADY_PROMOTED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_NOTE'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/queue/abandon-outbox-dead-letter': {
        req: AdminQueueAbandonOutboxDeadLetterRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'QUEUE_OUTBOX_STATE_CHANGED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/queue/clear': {
        req: AdminQueueClearRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/queue/deliver-delayed': {
        req: EmptyRequest;
        res: AdminQueueDeliverDelayedResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'admin/queue/inbox-delayed': {
        req: EmptyRequest;
        res: AdminQueueInboxDelayedResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'admin/queue/jobs': {
        req: AdminQueueJobsRequest;
        res: AdminQueueJobsResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/queue/outbox-dead-letters': {
        req: AdminQueueOutboxDeadLettersRequest;
        res: AdminQueueOutboxDeadLettersResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'admin/queue/pause': {
        req: AdminQueuePauseRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/queue/promote-jobs': {
        req: AdminQueuePromoteJobsRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/queue/queue-stats': {
        req: AdminQueueQueueStatsRequest;
        res: AdminQueueQueueStatsResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/queue/queues': {
        req: EmptyRequest;
        res: AdminQueueQueuesResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'admin/queue/remove-job': {
        req: AdminQueueRemoveJobRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/queue/resume': {
        req: AdminQueueResumeRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/queue/retry-job': {
        req: AdminQueueRetryJobRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/queue/retry-outbox-dead-letter': {
        req: AdminQueueRetryOutboxDeadLetterRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'QUEUE_OUTBOX_STATE_CHANGED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/queue/show-job': {
        req: AdminQueueShowJobRequest;
        res: AdminQueueShowJobResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/queue/show-job-logs': {
        req: AdminQueueShowJobLogsRequest;
        res: AdminQueueShowJobLogsResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/queue/stats': {
        req: EmptyRequest;
        res: AdminQueueStatsResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'admin/relays/add': {
        req: AdminRelaysAddRequest;
        res: AdminRelaysAddResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'INVALID_URL'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/relays/list': {
        req: EmptyRequest;
        res: AdminRelaysListResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'admin/relays/remove': {
        req: AdminRelaysRemoveRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/reset-password': {
        req: AdminResetPasswordRequest;
        res: AdminResetPasswordResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_USER'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/resolve-abuse-user-report': {
        req: AdminResolveAbuseUserReportRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_ABUSE_REPORT'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/roles/assign': {
        req: AdminRolesAssignRequest;
        res: EmptyResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_ROLE'
            | 'NO_SUCH_USER'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/roles/create': {
        req: AdminRolesCreateRequest;
        res: AdminRolesCreateResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/roles/delete': {
        req: AdminRolesDeleteRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_ROLE'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/roles/list': {
        req: EmptyRequest;
        res: AdminRolesListResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'admin/roles/show': {
        req: AdminRolesShowRequest;
        res: AdminRolesShowResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_ROLE'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/roles/unassign': {
        req: AdminRolesUnassignRequest;
        res: EmptyResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NOT_ASSIGNED'
            | 'NO_SUCH_ROLE'
            | 'NO_SUCH_USER'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/roles/update': {
        req: AdminRolesUpdateRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_ROLE'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/roles/update-default-policies': {
        req: AdminRolesUpdateDefaultPoliciesRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/roles/users': {
        req: AdminRolesUsersRequest;
        res: AdminRolesUsersResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_ROLE'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/send-email': {
        req: AdminSendEmailRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/server-info': {
        req: EmptyRequest;
        res: AdminServerInfoResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'admin/show-moderation-logs': {
        req: AdminShowModerationLogsRequest;
        res: AdminShowModerationLogsResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'admin/show-user': {
        req: AdminShowUserRequest;
        res: AdminShowUserResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/show-users': {
        req: AdminShowUsersRequest;
        res: AdminShowUsersResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'admin/suspend-user': {
        req: AdminSuspendUserRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/system-webhook/create': {
        req: AdminSystemWebhookCreateRequest;
        res: AdminSystemWebhookCreateResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/system-webhook/delete': {
        req: AdminSystemWebhookDeleteRequest;
        res: EmptyResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/system-webhook/list': {
        req: AdminSystemWebhookListRequest;
        res: AdminSystemWebhookListResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'admin/system-webhook/show': {
        req: AdminSystemWebhookShowRequest;
        res: AdminSystemWebhookShowResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_SYSTEM_WEBHOOK'
            | 'PAYLOAD_TOO_LARGE'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/system-webhook/test': {
        req: AdminSystemWebhookTestRequest;
        res: EmptyResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_WEBHOOK'
            | 'PAYLOAD_TOO_LARGE'
            | 'RATE_LIMIT_EXCEEDED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/system-webhook/update': {
        req: AdminSystemWebhookUpdateRequest;
        res: AdminSystemWebhookUpdateResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/unset-mfa': {
        req: AdminUnsetMfaRequest;
        res: EmptyResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_USER'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/unset-user-avatar': {
        req: AdminUnsetUserAvatarRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/unset-user-banner': {
        req: AdminUnsetUserBannerRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/unsuspend-user': {
        req: AdminUnsuspendUserRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/update-abuse-user-report': {
        req: AdminUpdateAbuseUserReportRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_ABUSE_REPORT'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'admin/update-meta': {
        req: AdminUpdateMetaRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'admin/update-proxy-account': {
        req: AdminUpdateProxyAccountRequest;
        res: AdminUpdateProxyAccountResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'admin/update-user-note': {
        req: AdminUpdateUserNoteRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    announcements: {
        req: AnnouncementsRequest;
        res: AnnouncementsResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'announcements/show': {
        req: AnnouncementsShowRequest;
        res: AnnouncementsShowResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_ANNOUNCEMENT'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'announcements/react': {
        req: AnnouncementsReactRequest;
        res: EmptyResponse;
        err:
            | 'ALREADY_REACTED'
            | 'ANNOUNCEMENT_NOT_ACTIVE'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_ANNOUNCEMENT'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'announcements/unreact': {
        req: AnnouncementsUnreactRequest;
        res: EmptyResponse;
        err:
            | 'ANNOUNCEMENT_NOT_ACTIVE'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NOT_REACTED'
            | 'NO_SUCH_ANNOUNCEMENT'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'antennas/create': {
        req: AntennasCreateRequest;
        res: AntennasCreateResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'EMPTY_KEYWORD'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_USER_LIST'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'TOO_MANY_ANTENNAS'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'antennas/delete': {
        req: AntennasDeleteRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_ANTENNA'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'antennas/list': {
        req: EmptyRequest;
        res: AntennasListResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'antennas/notes': {
        req: AntennasNotesRequest;
        res: AntennasNotesResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_ANTENNA'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'antennas/remove-note': {
        req: AntennasRemoveNoteRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_ANTENNA'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'antennas/show': {
        req: AntennasShowRequest;
        res: AntennasShowResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_ANTENNA'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'antennas/update': {
        req: AntennasUpdateRequest;
        res: AntennasUpdateResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'EMPTY_KEYWORD'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_ANTENNA'
            | 'NO_SUCH_USER_LIST'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'ap/get': {
        req: ApGetRequest;
        res: ApGetResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'RATE_LIMIT_EXCEEDED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'ap/show': {
        req: ApShowRequest;
        res: ApShowResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'FEDERATION_NOT_ALLOWED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_OBJECT'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'RATE_LIMIT_EXCEEDED'
            | 'REQUEST_FAILED'
            | 'RESPONSE_INVALID'
            | 'URI_INVALID'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'blocking/create': {
        req: BlockingCreateRequest;
        res: BlockingCreateResponse;
        err:
            | 'ALREADY_BLOCKING'
            | 'AUTHENTICATION_FAILED'
            | 'BLOCKEE_IS_YOURSELF'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_USER'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'RATE_LIMIT_EXCEEDED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'blocking/delete': {
        req: BlockingDeleteRequest;
        res: BlockingDeleteResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'BLOCKEE_IS_YOURSELF'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NOT_BLOCKING'
            | 'NO_SUCH_USER'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'RATE_LIMIT_EXCEEDED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'blocking/list': {
        req: BlockingListRequest;
        res: BlockingListResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'channels/create': {
        req: ChannelsCreateRequest;
        res: ChannelsCreateResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_FILE'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'RATE_LIMIT_EXCEEDED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'channels/favorite': {
        req: ChannelsFavoriteRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_CHANNEL'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'channels/featured': {
        req: EmptyRequest;
        res: ChannelsFeaturedResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'channels/follow': {
        req: ChannelsFollowRequest;
        res: EmptyResponse;
        err:
            | 'ALREADY_FOLLOWING'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_CHANNEL'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'channels/followed': {
        req: ChannelsFollowedRequest;
        res: ChannelsFollowedResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'channels/mute/create': {
        req: ChannelsMuteCreateRequest;
        res: EmptyResponse;
        err:
            | 'ALREADY_MUTING_CHANNEL'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'EXPIRES_AT_IS_PAST'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_CHANNEL'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'channels/mute/delete': {
        req: ChannelsMuteDeleteRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NOT_MUTING_CHANNEL'
            | 'NO_SUCH_CHANNEL'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'channels/mute/list': {
        req: EmptyRequest;
        res: ChannelsMuteListResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'channels/my-favorites': {
        req: EmptyRequest;
        res: ChannelsMyFavoritesResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'channels/owned': {
        req: ChannelsOwnedRequest;
        res: ChannelsOwnedResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'channels/search': {
        req: ChannelsSearchRequest;
        res: ChannelsSearchResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'channels/show': {
        req: ChannelsShowRequest;
        res: ChannelsShowResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_CHANNEL'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'channels/timeline': {
        req: ChannelsTimelineRequest;
        res: ChannelsTimelineResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_CHANNEL'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'channels/unfavorite': {
        req: ChannelsUnfavoriteRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_CHANNEL'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'channels/unfollow': {
        req: ChannelsUnfollowRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_CHANNEL'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'channels/update': {
        req: ChannelsUpdateRequest;
        res: ChannelsUpdateResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_CHANNEL'
            | 'NO_SUCH_FILE'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'charts/active-users': {
        req: ChartsActiveUsersRequest;
        res: ChartsActiveUsersResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'charts/ap-request': {
        req: ChartsApRequestRequest;
        res: ChartsApRequestResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'charts/drive': {
        req: ChartsDriveRequest;
        res: ChartsDriveResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'charts/federation': {
        req: ChartsFederationRequest;
        res: ChartsFederationResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'charts/instance': {
        req: ChartsInstanceRequest;
        res: ChartsInstanceResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'charts/notes': {
        req: ChartsNotesRequest;
        res: ChartsNotesResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'charts/user/drive': {
        req: ChartsUserDriveRequest;
        res: ChartsUserDriveResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'charts/user/following': {
        req: ChartsUserFollowingRequest;
        res: ChartsUserFollowingResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'charts/user/notes': {
        req: ChartsUserNotesRequest;
        res: ChartsUserNotesResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'charts/user/pv': {
        req: ChartsUserPvRequest;
        res: ChartsUserPvResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'charts/user/reactions': {
        req: ChartsUserReactionsRequest;
        res: ChartsUserReactionsResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'charts/users': {
        req: ChartsUsersRequest;
        res: ChartsUsersResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'chat/history': {
        req: ChatHistoryRequest;
        res: ChatHistoryResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'chat/messages/create-to-room': {
        req: ChatMessagesCreateToRoomRequest;
        res: ChatMessagesCreateToRoomResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CONTENT_REQUIRED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_FILE'
            | 'NO_SUCH_ROOM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'RATE_LIMIT_EXCEEDED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'chat/messages/create-to-user': {
        req: ChatMessagesCreateToUserRequest;
        res: ChatMessagesCreateToUserResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CHAT_NOT_AVAILABLE'
            | 'CONTENT_REQUIRED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_FILE'
            | 'NO_SUCH_USER'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'RATE_LIMIT_EXCEEDED'
            | 'RECIPIENT_IS_YOURSELF'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED'
            | 'YOU_HAVE_BEEN_BLOCKED';
    };
    'chat/messages/delete': {
        req: ChatMessagesDeleteRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_MESSAGE'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'chat/messages/react': {
        req: ChatMessagesReactRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_MESSAGE'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'TOO_MANY_REACTIONS'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'chat/messages/room-timeline': {
        req: ChatMessagesRoomTimelineRequest;
        res: ChatMessagesRoomTimelineResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_ROOM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'chat/messages/search': {
        req: ChatMessagesSearchRequest;
        res: ChatMessagesSearchResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_ROOM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'chat/messages/show': {
        req: ChatMessagesShowRequest;
        res: ChatMessagesShowResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_MESSAGE'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'chat/messages/unreact': {
        req: ChatMessagesUnreactRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_MESSAGE'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'chat/messages/user-timeline': {
        req: ChatMessagesUserTimelineRequest;
        res: ChatMessagesUserTimelineResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_USER'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'chat/read-all': {
        req: EmptyRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'chat/rooms/create': {
        req: ChatRoomsCreateRequest;
        res: ChatRoomsCreateResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'RATE_LIMIT_EXCEEDED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'chat/rooms/delete': {
        req: ChatRoomsDeleteRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_ROOM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'chat/rooms/invitations/create': {
        req: ChatRoomsInvitationsCreateRequest;
        res: ChatRoomsInvitationsCreateResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CANNOT_CREATE_INVITATION'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_ROOM'
            | 'NO_SUCH_USER'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'RATE_LIMIT_EXCEEDED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'chat/rooms/invitations/ignore': {
        req: ChatRoomsInvitationsIgnoreRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_ROOM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'chat/rooms/invitations/inbox': {
        req: ChatRoomsInvitationsInboxRequest;
        res: ChatRoomsInvitationsInboxResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'chat/rooms/invitations/outbox': {
        req: ChatRoomsInvitationsOutboxRequest;
        res: ChatRoomsInvitationsOutboxResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_ROOM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'chat/rooms/join': {
        req: ChatRoomsJoinRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CANNOT_JOIN_ROOM'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_ROOM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'chat/rooms/joining': {
        req: ChatRoomsJoiningRequest;
        res: ChatRoomsJoiningResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'chat/rooms/leave': {
        req: ChatRoomsLeaveRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_ROOM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'chat/rooms/members': {
        req: ChatRoomsMembersRequest;
        res: ChatRoomsMembersResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_ROOM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'chat/rooms/mute': {
        req: ChatRoomsMuteRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_ROOM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'chat/rooms/owned': {
        req: ChatRoomsOwnedRequest;
        res: ChatRoomsOwnedResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'chat/rooms/show': {
        req: ChatRoomsShowRequest;
        res: ChatRoomsShowResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_ROOM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'chat/rooms/update': {
        req: ChatRoomsUpdateRequest;
        res: ChatRoomsUpdateResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_ROOM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'clips/add-note': {
        req: ClipsAddNoteRequest;
        res: EmptyResponse;
        err:
            | 'ALREADY_CLIPPED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_CLIP'
            | 'NO_SUCH_NOTE'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'RATE_LIMIT_EXCEEDED'
            | 'TOO_MANY_CLIP_NOTES'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'clips/create': {
        req: ClipsCreateRequest;
        res: ClipsCreateResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'TOO_MANY_CLIPS'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'clips/delete': {
        req: ClipsDeleteRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_CLIP'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'clips/favorite': {
        req: ClipsFavoriteRequest;
        res: EmptyResponse;
        err:
            | 'ALREADY_FAVORITED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_CLIP'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'clips/list': {
        req: ClipsListRequest;
        res: ClipsListResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'clips/my-favorites': {
        req: EmptyRequest;
        res: ClipsMyFavoritesResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'clips/notes': {
        req: ClipsNotesRequest;
        res: ClipsNotesResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_CLIP'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'clips/remove-note': {
        req: ClipsRemoveNoteRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_CLIP'
            | 'NO_SUCH_NOTE'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'clips/show': {
        req: ClipsShowRequest;
        res: ClipsShowResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_CLIP'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'clips/unfavorite': {
        req: ClipsUnfavoriteRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NOT_FAVORITED'
            | 'NO_SUCH_CLIP'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'clips/update': {
        req: ClipsUpdateRequest;
        res: ClipsUpdateResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_CLIP'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    drive: {
        req: EmptyRequest;
        res: DriveResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'drive/files': {
        req: DriveFilesRequest;
        res: DriveFilesResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'drive/files/attached-chat-messages': {
        req: DriveFilesAttachedChatMessagesRequest;
        res: DriveFilesAttachedChatMessagesResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_FILE'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'drive/files/attached-notes': {
        req: DriveFilesAttachedNotesRequest;
        res: DriveFilesAttachedNotesResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_FILE'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'drive/files/check-existence': {
        req: DriveFilesCheckExistenceRequest;
        res: DriveFilesCheckExistenceResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'drive/files/create': {
        req: DriveFilesCreateRequest;
        res: DriveFilesCreateResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_FILE_NAME'
            | 'INVALID_PARAM'
            | 'MAX_FILE_SIZE_EXCEEDED'
            | 'NO_FREE_SPACE'
            | 'NO_SUCH_FOLDER'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'RATE_LIMIT_EXCEEDED'
            | 'UNALLOWED_FILE_TYPE'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'drive/files/delete': {
        req: DriveFilesDeleteRequest;
        res: EmptyResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_FILE'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'drive/files/find': {
        req: DriveFilesFindRequest;
        res: DriveFilesFindResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'drive/files/find-by-hash': {
        req: DriveFilesFindByHashRequest;
        res: DriveFilesFindByHashResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'drive/files/move-bulk': {
        req: DriveFilesMoveBulkRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_FOLDER'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'drive/files/show': {
        req: DriveFilesShowRequest;
        res: DriveFilesShowResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_FILE'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'drive/files/update': {
        req: DriveFilesUpdateRequest;
        res: DriveFilesUpdateResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_FILE_NAME'
            | 'INVALID_PARAM'
            | 'NO_SUCH_FILE'
            | 'NO_SUCH_FOLDER'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'RESTRICTED_BY_ROLE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'drive/files/upload-from-url': {
        req: DriveFilesUploadFromUrlRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'RATE_LIMIT_EXCEEDED'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'drive/folders': {
        req: DriveFoldersRequest;
        res: DriveFoldersResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'drive/folders/create': {
        req: DriveFoldersCreateRequest;
        res: DriveFoldersCreateResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_FOLDER'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'RATE_LIMIT_EXCEEDED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'drive/folders/delete': {
        req: DriveFoldersDeleteRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'HAS_CHILD_FILES_OR_FOLDERS'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_FOLDER'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'drive/folders/find': {
        req: DriveFoldersFindRequest;
        res: DriveFoldersFindResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'drive/folders/show': {
        req: DriveFoldersShowRequest;
        res: DriveFoldersShowResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_FOLDER'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'drive/folders/update': {
        req: DriveFoldersUpdateRequest;
        res: DriveFoldersUpdateResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_FOLDER'
            | 'NO_SUCH_PARENT_FOLDER'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'RECURSIVE_NESTING'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'drive/stream': {
        req: DriveStreamRequest;
        res: DriveStreamResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'email-address/available': {
        req: EmailAddressAvailableRequest;
        res: EmailAddressAvailableResponse;
        err: 'INTERNAL_ERROR' | 'INVALID_PARAM' | 'PAYLOAD_TOO_LARGE';
    };
    emoji: {
        req: EmojiRequest;
        res: EmojiResponse;
        err: 'INTERNAL_ERROR' | 'INVALID_PARAM' | 'NO_SUCH_EMOJI' | 'PAYLOAD_TOO_LARGE';
    };
    emojis: {
        req: EmptyRequest;
        res: EmojisResponse;
        err: 'INTERNAL_ERROR' | 'INVALID_PARAM' | 'PAYLOAD_TOO_LARGE';
        reqOptional: true;
    };
    endpoint: {
        req: EndpointRequest;
        res: EndpointResponse;
        err: 'INTERNAL_ERROR' | 'INVALID_PARAM' | 'PAYLOAD_TOO_LARGE';
    };
    endpoints: { req: EmptyRequest; res: EndpointsResponse; err: 'INTERNAL_ERROR'; reqOptional: true };
    'export-custom-emojis': {
        req: EmptyRequest;
        res: EmptyResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'RATE_LIMIT_EXCEEDED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'federation/followers': {
        req: FederationFollowersRequest;
        res: FederationFollowersResponse;
        err: 'INTERNAL_ERROR' | 'INVALID_PARAM' | 'PAYLOAD_TOO_LARGE';
    };
    'federation/following': {
        req: FederationFollowingRequest;
        res: FederationFollowingResponse;
        err: 'INTERNAL_ERROR' | 'INVALID_PARAM' | 'PAYLOAD_TOO_LARGE';
    };
    'federation/instances': {
        req: FederationInstancesRequest;
        res: FederationInstancesResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'federation/show-instance': {
        req: FederationShowInstanceRequest;
        res: FederationShowInstanceResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'federation/stats': {
        req: FederationStatsRequest;
        res: FederationStatsResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'federation/update-remote-user': {
        req: FederationUpdateRemoteUserRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NOT_REMOTE_USER'
            | 'NO_SUCH_USER'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'RATE_LIMIT_EXCEEDED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'federation/users': {
        req: FederationUsersRequest;
        res: FederationUsersResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'fetch-external-resources': {
        req: FetchExternalResourcesRequest;
        res: FetchExternalResourcesResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'EXT_RESOURCE_HASH_DIDNT_MATCH'
            | 'EXT_RESOURCE_RETURNED_INVALID_SCHEMA'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'RATE_LIMIT_EXCEEDED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'fetch-rss': {
        req: FetchRssRequest;
        res: FetchRssResponse;
        err:
            | 'FETCH_RSS_FAILED'
            | 'FETCH_RSS_UNAVAILABLE'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'INVALID_URL'
            | 'PAYLOAD_TOO_LARGE'
            | 'RATE_LIMIT_EXCEEDED';
    };
    'flash/create': {
        req: FlashCreateRequest;
        res: FlashCreateResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'RATE_LIMIT_EXCEEDED'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'flash/delete': {
        req: FlashDeleteRequest;
        res: EmptyResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_FLASH'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'flash/featured': {
        req: FlashFeaturedRequest;
        res: FlashFeaturedResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'flash/like': {
        req: FlashLikeRequest;
        res: EmptyResponse;
        err:
            | 'ALREADY_LIKED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_FLASH'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED'
            | 'YOUR_FLASH';
    };
    'flash/my': {
        req: FlashMyRequest;
        res: FlashMyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'flash/my-likes': {
        req: FlashMyLikesRequest;
        res: FlashMyLikesResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'flash/search': {
        req: FlashSearchRequest;
        res: FlashSearchResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'flash/show': {
        req: FlashShowRequest;
        res: FlashShowResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_FLASH'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'flash/unlike': {
        req: FlashUnlikeRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NOT_LIKED'
            | 'NO_SUCH_FLASH'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'flash/update': {
        req: FlashUpdateRequest;
        res: EmptyResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_FLASH'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'RATE_LIMIT_EXCEEDED'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'following/create': {
        req: FollowingCreateRequest;
        res: FollowingCreateResponse;
        err:
            | 'ALREADY_FOLLOWING'
            | 'AUTHENTICATION_FAILED'
            | 'BLOCKED'
            | 'BLOCKING'
            | 'CREDENTIAL_REQUIRED'
            | 'FOLLOWEE_IS_YOURSELF'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_USER'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'RATE_LIMIT_EXCEEDED'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'following/delete': {
        req: FollowingDeleteRequest;
        res: FollowingDeleteResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'FOLLOWEE_IS_YOURSELF'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NOT_FOLLOWING'
            | 'NO_SUCH_USER'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'RATE_LIMIT_EXCEEDED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'following/invalidate': {
        req: FollowingInvalidateRequest;
        res: FollowingInvalidateResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'FOLLOWER_IS_YOURSELF'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NOT_FOLLOWING'
            | 'NO_SUCH_USER'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'RATE_LIMIT_EXCEEDED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'following/list': {
        req: FollowingListRequest;
        res: FollowingListResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'following/requests/accept': {
        req: FollowingRequestsAcceptRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_FOLLOW_REQUEST'
            | 'NO_SUCH_USER'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'following/requests/cancel': {
        req: FollowingRequestsCancelRequest;
        res: FollowingRequestsCancelResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'FOLLOW_REQUEST_NOT_FOUND'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_USER'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'following/requests/list': {
        req: FollowingRequestsListRequest;
        res: FollowingRequestsListResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'following/requests/reject': {
        req: FollowingRequestsRejectRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_USER'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'following/requests/sent': {
        req: FollowingRequestsSentRequest;
        res: FollowingRequestsSentResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'following/update': {
        req: FollowingUpdateRequest;
        res: FollowingUpdateResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'FOLLOWEE_IS_YOURSELF'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NOT_FOLLOWING'
            | 'NO_SUCH_USER'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'RATE_LIMIT_EXCEEDED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'following/update-all': {
        req: FollowingUpdateAllRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'RATE_LIMIT_EXCEEDED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'gallery/featured': {
        req: GalleryFeaturedRequest;
        res: GalleryFeaturedResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'gallery/popular': {
        req: EmptyRequest;
        res: GalleryPopularResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'gallery/posts': {
        req: GalleryPostsRequest;
        res: GalleryPostsResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'gallery/posts/create': {
        req: GalleryPostsCreateRequest;
        res: GalleryPostsCreateResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'RATE_LIMIT_EXCEEDED'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'gallery/posts/delete': {
        req: GalleryPostsDeleteRequest;
        res: EmptyResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_POST'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'gallery/posts/like': {
        req: GalleryPostsLikeRequest;
        res: EmptyResponse;
        err:
            | 'ALREADY_LIKED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_POST'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED'
            | 'YOUR_POST';
    };
    'gallery/posts/show': {
        req: GalleryPostsShowRequest;
        res: GalleryPostsShowResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_POST'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'gallery/posts/unlike': {
        req: GalleryPostsUnlikeRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NOT_LIKED'
            | 'NO_SUCH_POST'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'gallery/posts/update': {
        req: GalleryPostsUpdateRequest;
        res: GalleryPostsUpdateResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'RATE_LIMIT_EXCEEDED'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'get-avatar-decorations': {
        req: EmptyRequest;
        res: GetAvatarDecorationsResponse;
        err: 'INTERNAL_ERROR' | 'INVALID_PARAM' | 'PAYLOAD_TOO_LARGE';
        reqOptional: true;
    };
    'get-online-users-count': {
        req: EmptyRequest;
        res: GetOnlineUsersCountResponse;
        err: 'INTERNAL_ERROR' | 'INVALID_PARAM' | 'PAYLOAD_TOO_LARGE';
        reqOptional: true;
    };
    'hashtags/list': {
        req: HashtagsListRequest;
        res: HashtagsListResponse;
        err: 'INTERNAL_ERROR' | 'INVALID_PARAM' | 'PAYLOAD_TOO_LARGE';
    };
    'hashtags/search': {
        req: HashtagsSearchRequest;
        res: HashtagsSearchResponse;
        err: 'INTERNAL_ERROR' | 'INVALID_PARAM' | 'PAYLOAD_TOO_LARGE';
    };
    'hashtags/show': {
        req: HashtagsShowRequest;
        res: HashtagsShowResponse;
        err: 'INTERNAL_ERROR' | 'INVALID_PARAM' | 'NO_SUCH_HASHTAG' | 'PAYLOAD_TOO_LARGE';
    };
    'hashtags/trend': {
        req: EmptyRequest;
        res: HashtagsTrendResponse;
        err: 'INTERNAL_ERROR' | 'INVALID_PARAM' | 'PAYLOAD_TOO_LARGE';
        reqOptional: true;
    };
    'hashtags/users': {
        req: HashtagsUsersRequest;
        res: HashtagsUsersResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    i: {
        req: EmptyRequest;
        res: IResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'USER_IS_DELETED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'i/2fa/done': {
        req: I2faDoneRequest;
        res: I2faDoneResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'i/2fa/key-done': {
        req: I2faKeyDoneRequest;
        res: I2faKeyDoneResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INCORRECT_PASSWORD'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'TWO_FACTOR_NOT_ENABLED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'i/2fa/password-less': {
        req: I2faPasswordLessRequest;
        res: EmptyResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SECURITY_KEY'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'i/2fa/register': {
        req: I2faRegisterRequest;
        res: I2faRegisterResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INCORRECT_PASSWORD'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'i/2fa/register-key': {
        req: I2faRegisterKeyRequest;
        res: I2faRegisterKeyResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INCORRECT_PASSWORD'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'TWO_FACTOR_NOT_ENABLED'
            | 'USER_NOT_FOUND'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'i/2fa/remove-key': {
        req: I2faRemoveKeyRequest;
        res: I2faRemoveKeyResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INCORRECT_PASSWORD'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'i/2fa/unregister': {
        req: I2faUnregisterRequest;
        res: EmptyResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INCORRECT_PASSWORD'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'i/2fa/update-key': {
        req: I2faUpdateKeyRequest;
        res: I2faUpdateKeyResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_KEY'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'i/apps': {
        req: IAppsRequest;
        res: IAppsResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'i/change-password': {
        req: IChangePasswordRequest;
        res: EmptyResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INCORRECT_PASSWORD'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'TWO_FACTOR_AUTHENTICATION_FAILED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'i/claim-achievement': {
        req: IClaimAchievementRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'i/delete-account': {
        req: IDeleteAccountRequest;
        res: EmptyResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INCORRECT_PASSWORD'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'TWO_FACTOR_AUTHENTICATION_FAILED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'i/export-antennas': {
        req: EmptyRequest;
        res: EmptyResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'RATE_LIMIT_EXCEEDED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'i/export-blocking': {
        req: EmptyRequest;
        res: EmptyResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'RATE_LIMIT_EXCEEDED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'i/export-clips': {
        req: EmptyRequest;
        res: EmptyResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'RATE_LIMIT_EXCEEDED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'i/export-favorites': {
        req: EmptyRequest;
        res: EmptyResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'RATE_LIMIT_EXCEEDED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'i/export-following': {
        req: IExportFollowingRequest;
        res: EmptyResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'RATE_LIMIT_EXCEEDED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'i/export-mute': {
        req: EmptyRequest;
        res: EmptyResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'RATE_LIMIT_EXCEEDED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'i/export-notes': {
        req: EmptyRequest;
        res: EmptyResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'RATE_LIMIT_EXCEEDED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'i/export-user-lists': {
        req: EmptyRequest;
        res: EmptyResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'RATE_LIMIT_EXCEEDED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'i/favorites': {
        req: IFavoritesRequest;
        res: IFavoritesResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'i/gallery/likes': {
        req: IGalleryLikesRequest;
        res: IGalleryLikesResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'i/gallery/posts': {
        req: IGalleryPostsRequest;
        res: IGalleryPostsResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'i/import-antennas': {
        req: IImportAntennasRequest;
        res: EmptyResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'EMPTY_FILE'
            | 'INTERNAL_ERROR'
            | 'INVALID_ANTENNA_IMPORT_FILE'
            | 'INVALID_PARAM'
            | 'NO_SUCH_FILE'
            | 'NO_SUCH_USER'
            | 'PAYLOAD_TOO_LARGE'
            | 'RATE_LIMIT_EXCEEDED'
            | 'ROLE_PERMISSION_DENIED'
            | 'TOO_MANY_ANTENNAS'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'i/import-blocking': {
        req: IImportBlockingRequest;
        res: EmptyResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'EMPTY_FILE'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_FILE'
            | 'PAYLOAD_TOO_LARGE'
            | 'RATE_LIMIT_EXCEEDED'
            | 'ROLE_PERMISSION_DENIED'
            | 'TOO_BIG_FILE'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'i/import-following': {
        req: IImportFollowingRequest;
        res: EmptyResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'EMPTY_FILE'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_FILE'
            | 'PAYLOAD_TOO_LARGE'
            | 'RATE_LIMIT_EXCEEDED'
            | 'ROLE_PERMISSION_DENIED'
            | 'TOO_BIG_FILE'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'i/import-muting': {
        req: IImportMutingRequest;
        res: EmptyResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'EMPTY_FILE'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_FILE'
            | 'PAYLOAD_TOO_LARGE'
            | 'RATE_LIMIT_EXCEEDED'
            | 'ROLE_PERMISSION_DENIED'
            | 'TOO_BIG_FILE'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'i/import-user-lists': {
        req: IImportUserListsRequest;
        res: EmptyResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'EMPTY_FILE'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_FILE'
            | 'PAYLOAD_TOO_LARGE'
            | 'RATE_LIMIT_EXCEEDED'
            | 'ROLE_PERMISSION_DENIED'
            | 'TOO_BIG_FILE'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'i/move': {
        req: IMoveRequest;
        res: IMoveResponse;
        err:
            | 'ACCESS_DENIED'
            | 'ALREADY_MOVED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'DESTINATION_ACCOUNT_FORBIDS'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NOT_ROOT_FORBIDDEN'
            | 'NO_SUCH_USER'
            | 'PAYLOAD_TOO_LARGE'
            | 'RATE_LIMIT_EXCEEDED'
            | 'URI_NULL'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'i/notifications': {
        req: INotificationsRequest;
        res: INotificationsResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'RATE_LIMIT_EXCEEDED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'i/notifications-grouped': {
        req: INotificationsGroupedRequest;
        res: INotificationsGroupedResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'RATE_LIMIT_EXCEEDED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'i/page-likes': {
        req: IPageLikesRequest;
        res: IPageLikesResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'i/pages': {
        req: IPagesRequest;
        res: IPagesResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'i/pin': {
        req: IPinRequest;
        res: IPinResponse;
        err:
            | 'ALREADY_PINNED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_NOTE'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'PIN_LIMIT_EXCEEDED'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'i/read-announcement': {
        req: IReadAnnouncementRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'i/regenerate-token': {
        req: IRegenerateTokenRequest;
        res: EmptyResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INCORRECT_PASSWORD'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'i/registry/get': {
        req: IRegistryGetRequest;
        res: IRegistryGetResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_KEY'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'i/registry/get-all': {
        req: IRegistryGetAllRequest;
        res: IRegistryGetAllResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'i/registry/get-detail': {
        req: IRegistryGetDetailRequest;
        res: IRegistryGetDetailResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_KEY'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'i/registry/keys': {
        req: IRegistryKeysRequest;
        res: IRegistryKeysResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'i/registry/keys-with-type': {
        req: IRegistryKeysWithTypeRequest;
        res: IRegistryKeysWithTypeResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'i/registry/remove': {
        req: IRegistryRemoveRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'i/registry/scopes-with-domain': {
        req: EmptyRequest;
        res: IRegistryScopesWithDomainResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'i/registry/set': {
        req: IRegistrySetRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'i/revoke-token': {
        req: IRevokeTokenRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'i/signin-history': {
        req: ISigninHistoryRequest;
        res: ISigninHistoryResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'i/unpin': {
        req: IUnpinRequest;
        res: IUnpinResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_NOTE'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'i/update': {
        req: IUpdateRequest;
        res: IUpdateResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'AVATAR_NOT_AN_IMAGE'
            | 'BANNER_NOT_AN_IMAGE'
            | 'CREDENTIAL_REQUIRED'
            | 'FORBIDDEN_TO_SET_YOURSELF'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'INVALID_REGEXP'
            | 'NO_SUCH_AVATAR'
            | 'NO_SUCH_BANNER'
            | 'NO_SUCH_PAGE'
            | 'NO_SUCH_USER'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'RATE_LIMIT_EXCEEDED'
            | 'RESTRICTED_BY_ROLE'
            | 'TOO_MANY_MUTED_WORDS'
            | 'URI_NULL'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED'
            | 'YOUR_NAME_CONTAINS_PROHIBITED_WORDS';
        reqOptional: true;
    };
    'i/update-email': {
        req: IUpdateEmailRequest;
        res: IUpdateEmailResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'EMAIL_REQUIRED'
            | 'INCORRECT_PASSWORD'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'RATE_LIMIT_EXCEEDED'
            | 'TWO_FACTOR_AUTHENTICATION_FAILED'
            | 'UNAVAILABLE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'i/webhooks/create': {
        req: IWebhooksCreateRequest;
        res: IWebhooksCreateResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'TOO_MANY_WEBHOOKS'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'i/webhooks/delete': {
        req: IWebhooksDeleteRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_WEBHOOK'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'i/webhooks/list': {
        req: EmptyRequest;
        res: IWebhooksListResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'i/webhooks/show': {
        req: IWebhooksShowRequest;
        res: IWebhooksShowResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_WEBHOOK'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'i/webhooks/test': {
        req: IWebhooksTestRequest;
        res: EmptyResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_WEBHOOK'
            | 'PAYLOAD_TOO_LARGE'
            | 'RATE_LIMIT_EXCEEDED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'i/webhooks/update': {
        req: IWebhooksUpdateRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_WEBHOOK'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'invite/create': {
        req: EmptyRequest;
        res: InviteCreateResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'EXCEEDED_LIMIT_OF_CREATE_INVITE_CODE'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'invite/delete': {
        req: InviteDeleteRequest;
        res: EmptyResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CAN_NOT_DELETE_INVITE_CODE'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_INVITE_CODE'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'invite/limit': {
        req: EmptyRequest;
        res: InviteLimitResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'invite/list': {
        req: InviteListRequest;
        res: InviteListResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    meta: {
        req: MetaRequest;
        res: MetaResponse;
        err: 'INTERNAL_ERROR' | 'INVALID_PARAM' | 'PAYLOAD_TOO_LARGE';
        reqOptional: true;
    };
    'miauth/gen-token': {
        req: MiauthGenTokenRequest;
        res: MiauthGenTokenResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'mute/create': {
        req: MuteCreateRequest;
        res: EmptyResponse;
        err:
            | 'ALREADY_MUTING'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'MUTEE_IS_YOURSELF'
            | 'NO_SUCH_USER'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'RATE_LIMIT_EXCEEDED'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'mute/delete': {
        req: MuteDeleteRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'MUTEE_IS_YOURSELF'
            | 'NOT_MUTING'
            | 'NO_SUCH_USER'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'mute/list': {
        req: MuteListRequest;
        res: MuteListResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    notes: {
        req: NotesRequest;
        res: NotesResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'notes/children': {
        req: NotesChildrenRequest;
        res: NotesChildrenResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'notes/clips': {
        req: NotesClipsRequest;
        res: NotesClipsResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_NOTE'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'notes/conversation': {
        req: NotesConversationRequest;
        res: NotesConversationResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_NOTE'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'notes/create': {
        req: NotesCreateRequest;
        res: NotesCreateResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CANNOT_CREATE_ALREADY_EXPIRED_POLL'
            | 'CANNOT_RENOTE_DUE_TO_VISIBILITY'
            | 'CANNOT_RENOTE_OUTSIDE_OF_CHANNEL'
            | 'CANNOT_RENOTE_TO_A_PURE_RENOTE'
            | 'CANNOT_REPLY_TO_AN_INVISIBLE_NOTE'
            | 'CANNOT_REPLY_TO_A_PURE_RENOTE'
            | 'CANNOT_REPLY_TO_SPECIFIED_VISIBILITY_NOTE_WITH_EXTENDED_VISIBILITY'
            | 'CONTAINS_PROHIBITED_WORDS'
            | 'CONTAINS_TOO_MANY_MENTIONS'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_CHANNEL'
            | 'NO_SUCH_FILE'
            | 'NO_SUCH_RENOTE_TARGET'
            | 'NO_SUCH_REPLY_TARGET'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'POST_PROCESSING_UNAVAILABLE'
            | 'RATE_LIMIT_EXCEEDED'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED'
            | 'YOU_HAVE_BEEN_BLOCKED';
    };
    'notes/delete': {
        req: NotesDeleteRequest;
        res: EmptyResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_NOTE'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'RATE_LIMIT_EXCEEDED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'notes/drafts/count': {
        req: EmptyRequest;
        res: NotesDraftsCountResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'notes/drafts/create': {
        req: NotesDraftsCreateRequest;
        res: NotesDraftsCreateResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CANNOT_CREATE_ALREADY_EXPIRED_POLL'
            | 'CANNOT_RENOTE_DUE_TO_VISIBILITY'
            | 'CANNOT_RENOTE_TO_A_PURE_RENOTE'
            | 'CANNOT_RENOTE_TO_EXTERNAL'
            | 'CANNOT_REPLY_TO_AN_INVISIBLE_NOTE'
            | 'CANNOT_REPLY_TO_A_PURE_RENOTE'
            | 'CANNOT_REPLY_TO_SPECIFIED_VISIBILITY_NOTE_WITH_EXTENDED_VISIBILITY'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_CHANNEL'
            | 'NO_SUCH_FILE'
            | 'NO_SUCH_RENOTE_TARGET'
            | 'NO_SUCH_REPLY_TARGET'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'RATE_LIMIT_EXCEEDED'
            | 'SCHEDULED_AT_MUST_BE_IN_FUTURE'
            | 'SCHEDULED_AT_REQUIRED'
            | 'TOO_MANY_DRAFTS'
            | 'TOO_MANY_SCHEDULED_NOTES'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED'
            | 'YOU_HAVE_BEEN_BLOCKED';
        reqOptional: true;
    };
    'notes/drafts/delete': {
        req: NotesDraftsDeleteRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_NOTE_DRAFT'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'notes/drafts/list': {
        req: NotesDraftsListRequest;
        res: NotesDraftsListResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'notes/drafts/update': {
        req: NotesDraftsUpdateRequest;
        res: NotesDraftsUpdateResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CANNOT_CREATE_ALREADY_EXPIRED_POLL'
            | 'CANNOT_RENOTE'
            | 'CANNOT_RENOTE_DUE_TO_VISIBILITY'
            | 'CANNOT_RENOTE_TO_EXTERNAL'
            | 'CANNOT_REPLY_TO_AN_INVISIBLE_NOTE'
            | 'CANNOT_REPLY_TO_A_PURE_RENOTE'
            | 'CANNOT_REPLY_TO_SPECIFIED_VISIBILITY_NOTE_WITH_EXTENDED_VISIBILITY'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_CHANNEL'
            | 'NO_SUCH_FILE'
            | 'NO_SUCH_NOTE_DRAFT'
            | 'NO_SUCH_RENOTE'
            | 'NO_SUCH_REPLY'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'RATE_LIMIT_EXCEEDED'
            | 'SCHEDULED_AT_MUST_BE_IN_FUTURE'
            | 'SCHEDULED_AT_REQUIRED'
            | 'TOO_MANY_SCHEDULED_NOTES'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED'
            | 'YOU_HAVE_BEEN_BLOCKED';
    };
    'notes/favorites/create': {
        req: NotesFavoritesCreateRequest;
        res: EmptyResponse;
        err:
            | 'ALREADY_FAVORITED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_NOTE'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'RATE_LIMIT_EXCEEDED'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'notes/favorites/delete': {
        req: NotesFavoritesDeleteRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NOT_FAVORITED'
            | 'NO_SUCH_NOTE'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'notes/featured': {
        req: NotesFeaturedRequest;
        res: NotesFeaturedResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'notes/global-timeline': {
        req: NotesGlobalTimelineRequest;
        res: NotesGlobalTimelineResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'GTL_DISABLED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'notes/hybrid-timeline': {
        req: NotesHybridTimelineRequest;
        res: NotesHybridTimelineResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'BOTH_WITH_REPLIES_AND_WITH_FILES'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'STL_DISABLED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'notes/local-timeline': {
        req: NotesLocalTimelineRequest;
        res: NotesLocalTimelineResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'BOTH_WITH_REPLIES_AND_WITH_FILES'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'LTL_DISABLED'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'notes/mentions': {
        req: NotesMentionsRequest;
        res: NotesMentionsResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'notes/polls/recommendation': {
        req: NotesPollsRecommendationRequest;
        res: NotesPollsRecommendationResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'notes/polls/vote': {
        req: NotesPollsVoteRequest;
        res: EmptyResponse;
        err:
            | 'ALREADY_EXPIRED'
            | 'ALREADY_VOTED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_CHOICE'
            | 'INVALID_PARAM'
            | 'NO_POLL'
            | 'NO_SUCH_NOTE'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED'
            | 'YOU_HAVE_BEEN_BLOCKED';
    };
    'notes/reactions': {
        req: NotesReactionsRequest;
        res: NotesReactionsResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_NOTE'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'notes/reactions/create': {
        req: NotesReactionsCreateRequest;
        res: EmptyResponse;
        err:
            | 'ALREADY_REACTED'
            | 'AUTHENTICATION_FAILED'
            | 'CANNOT_REACT_TO_RENOTE'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_NOTE'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED'
            | 'YOU_HAVE_BEEN_BLOCKED';
    };
    'notes/reactions/delete': {
        req: NotesReactionsDeleteRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NOT_REACTED'
            | 'NO_SUCH_NOTE'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'RATE_LIMIT_EXCEEDED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'notes/renotes': {
        req: NotesRenotesRequest;
        res: NotesRenotesResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_NOTE'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'notes/replies': {
        req: NotesRepliesRequest;
        res: NotesRepliesResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'notes/search': {
        req: NotesSearchRequest;
        res: NotesSearchResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'RATE_LIMIT_EXCEEDED'
            | 'UNAVAILABLE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'notes/search-by-tag': {
        req: NotesSearchByTagRequest;
        res: NotesSearchByTagResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'notes/show': {
        req: NotesShowRequest;
        res: NotesShowResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CONTENT_RESTRICTED_BY_SERVER'
            | 'CONTENT_RESTRICTED_BY_USER'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_NOTE'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'notes/show-partial-bulk': {
        req: NotesShowPartialBulkRequest;
        res: NotesShowPartialBulkResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'notes/state': {
        req: NotesStateRequest;
        res: NotesStateResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'notes/thread-muting/create': {
        req: NotesThreadMutingCreateRequest;
        res: EmptyResponse;
        err:
            | 'ALREADY_MUTING'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_NOTE'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'RATE_LIMIT_EXCEEDED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'notes/thread-muting/delete': {
        req: NotesThreadMutingDeleteRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_NOTE'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'notes/timeline': {
        req: NotesTimelineRequest;
        res: NotesTimelineResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'notes/translate': {
        req: NotesTranslateRequest;
        res: NotesTranslateResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CANNOT_TRANSLATE_INVISIBLE_NOTE'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_NOTE'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'UNAVAILABLE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'notes/unrenote': {
        req: NotesUnrenoteRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_NOTE'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'RATE_LIMIT_EXCEEDED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'notes/user-list-timeline': {
        req: NotesUserListTimelineRequest;
        res: NotesUserListTimelineResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_LIST'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'notifications/create': {
        req: NotificationsCreateRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'RATE_LIMIT_EXCEEDED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'notifications/delete': {
        req: NotificationsDeleteRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'notifications/flush': {
        req: EmptyRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'notifications/mark-all-as-read': {
        req: EmptyRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'notifications/test-notification': {
        req: EmptyRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'RATE_LIMIT_EXCEEDED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'page-push': {
        req: PagePushRequest;
        res: EmptyResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_PAGE'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'pages/create': {
        req: PagesCreateRequest;
        res: PagesCreateResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NAME_ALREADY_EXISTS'
            | 'NO_SUCH_FILE'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'RATE_LIMIT_EXCEEDED'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'pages/delete': {
        req: PagesDeleteRequest;
        res: EmptyResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_PAGE'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'pages/featured': {
        req: EmptyRequest;
        res: PagesFeaturedResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'pages/like': {
        req: PagesLikeRequest;
        res: EmptyResponse;
        err:
            | 'ALREADY_LIKED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_PAGE'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED'
            | 'YOUR_PAGE';
    };
    'pages/show': {
        req: PagesShowRequest;
        res: PagesShowResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_PAGE'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'pages/unlike': {
        req: PagesUnlikeRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NOT_LIKED'
            | 'NO_SUCH_PAGE'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'pages/update': {
        req: PagesUpdateRequest;
        res: EmptyResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NAME_ALREADY_EXISTS'
            | 'NO_SUCH_FILE'
            | 'NO_SUCH_PAGE'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'RATE_LIMIT_EXCEEDED'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    ping: {
        req: EmptyRequest;
        res: PingResponse;
        err: 'INTERNAL_ERROR' | 'INVALID_PARAM' | 'PAYLOAD_TOO_LARGE';
        reqOptional: true;
    };
    'pinned-users': {
        req: EmptyRequest;
        res: PinnedUsersResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'promo/read': {
        req: PromoReadRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_NOTE'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'renote-mute/create': {
        req: RenoteMuteCreateRequest;
        res: EmptyResponse;
        err:
            | 'ALREADY_MUTING'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'MUTEE_IS_YOURSELF'
            | 'NO_SUCH_USER'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'RATE_LIMIT_EXCEEDED'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'renote-mute/delete': {
        req: RenoteMuteDeleteRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'MUTEE_IS_YOURSELF'
            | 'NOT_MUTING'
            | 'NO_SUCH_USER'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'renote-mute/list': {
        req: RenoteMuteListRequest;
        res: RenoteMuteListResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'request-reset-password': {
        req: RequestResetPasswordRequest;
        res: EmptyResponse;
        err: 'INTERNAL_ERROR' | 'INVALID_PARAM' | 'PAYLOAD_TOO_LARGE' | 'RATE_LIMIT_EXCEEDED';
    };
    'reset-db': {
        req: EmptyRequest;
        res: EmptyResponse;
        err: 'INTERNAL_ERROR' | 'INVALID_PARAM' | 'PAYLOAD_TOO_LARGE';
        reqOptional: true;
    };
    'reset-password': {
        req: ResetPasswordRequest;
        res: EmptyResponse;
        err: 'INTERNAL_ERROR' | 'INVALID_PARAM' | 'INVALID_TOKEN' | 'PAYLOAD_TOO_LARGE';
    };
    retention: {
        req: EmptyRequest;
        res: RetentionResponse;
        err: 'INTERNAL_ERROR' | 'INVALID_PARAM' | 'PAYLOAD_TOO_LARGE';
        reqOptional: true;
    };
    'roles/list': {
        req: EmptyRequest;
        res: RolesListResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'roles/notes': {
        req: RolesNotesRequest;
        res: RolesNotesResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_ROLE'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'roles/show': {
        req: RolesShowRequest;
        res: RolesShowResponse;
        err: 'INTERNAL_ERROR' | 'INVALID_PARAM' | 'NO_SUCH_ROLE' | 'PAYLOAD_TOO_LARGE';
    };
    'roles/users': {
        req: RolesUsersRequest;
        res: RolesUsersResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_ROLE'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'server-info': {
        req: EmptyRequest;
        res: ServerInfoResponse;
        err: 'INTERNAL_ERROR' | 'INVALID_PARAM' | 'PAYLOAD_TOO_LARGE';
        reqOptional: true;
    };
    stats: {
        req: EmptyRequest;
        res: StatsResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'sw/register': {
        req: SwRegisterRequest;
        res: SwRegisterResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'sw/show-registration': {
        req: SwShowRegistrationRequest;
        res: SwShowRegistrationResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'sw/unregister': {
        req: SwUnregisterRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'sw/update-registration': {
        req: SwUpdateRegistrationRequest;
        res: SwUpdateRegistrationResponse;
        err:
            | 'ACCESS_DENIED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_REGISTRATION'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    test: { req: TestRequest; res: TestResponse; err: 'INTERNAL_ERROR' | 'INVALID_PARAM' | 'PAYLOAD_TOO_LARGE' };
    'username/available': {
        req: UsernameAvailableRequest;
        res: UsernameAvailableResponse;
        err: 'INTERNAL_ERROR' | 'INVALID_PARAM' | 'PAYLOAD_TOO_LARGE';
    };
    users: {
        req: UsersRequest;
        res: UsersResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'users/achievements': {
        req: UsersAchievementsRequest;
        res: UsersAchievementsResponse;
        err: 'INTERNAL_ERROR' | 'INVALID_PARAM' | 'PAYLOAD_TOO_LARGE';
    };
    'users/clips': {
        req: UsersClipsRequest;
        res: UsersClipsResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'users/featured-notes': {
        req: UsersFeaturedNotesRequest;
        res: UsersFeaturedNotesResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'users/flashs': {
        req: UsersFlashsRequest;
        res: UsersFlashsResponse;
        err: 'INTERNAL_ERROR' | 'INVALID_PARAM' | 'PAYLOAD_TOO_LARGE';
    };
    'users/followers': {
        req: UsersFollowersRequest;
        res: UsersFollowersResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'FORBIDDEN'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_USER'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'users/following': {
        req: UsersFollowingRequest;
        res: UsersFollowingResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'BIRTHDAY_DATE_FORMAT_INVALID'
            | 'FORBIDDEN'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_USER'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'users/gallery/posts': {
        req: UsersGalleryPostsRequest;
        res: UsersGalleryPostsResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'users/get-following-users-by-birthday': {
        req: UsersGetFollowingUsersByBirthdayRequest;
        res: UsersGetFollowingUsersByBirthdayResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'users/get-frequently-replied-users': {
        req: UsersGetFrequentlyRepliedUsersRequest;
        res: UsersGetFrequentlyRepliedUsersResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_USER'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'users/lists/create': {
        req: UsersListsCreateRequest;
        res: UsersListsCreateResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'TOO_MANY_USERLISTS'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'users/lists/create-from-public': {
        req: UsersListsCreateFromPublicRequest;
        res: UsersListsCreateFromPublicResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_LIST'
            | 'NO_SUCH_USER'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'TOO_MANY_USERLISTS'
            | 'TOO_MANY_USERS'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED'
            | 'YOU_HAVE_BEEN_BLOCKED';
    };
    'users/lists/delete': {
        req: UsersListsDeleteRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_LIST'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'users/lists/favorite': {
        req: UsersListsFavoriteRequest;
        res: EmptyResponse;
        err:
            | 'ALREADY_FAVORITED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_USER_LIST'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'users/lists/get-memberships': {
        req: UsersListsGetMembershipsRequest;
        res: UsersListsGetMembershipsResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_LIST'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'users/lists/list': {
        req: UsersListsListRequest;
        res: UsersListsListResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_USER'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'REMOTE_USER_NOT_ALLOWED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'users/lists/pull': {
        req: UsersListsPullRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_LIST'
            | 'NO_SUCH_USER'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'users/lists/push': {
        req: UsersListsPushRequest;
        res: EmptyResponse;
        err:
            | 'ALREADY_ADDED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_LIST'
            | 'NO_SUCH_USER'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'RATE_LIMIT_EXCEEDED'
            | 'TOO_MANY_USERS'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED'
            | 'YOU_HAVE_BEEN_BLOCKED';
    };
    'users/lists/show': {
        req: UsersListsShowRequest;
        res: UsersListsShowResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_LIST'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'users/lists/unfavorite': {
        req: UsersListsUnfavoriteRequest;
        res: EmptyResponse;
        err:
            | 'ALREADY_FAVORITED'
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_USER_LIST'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'users/lists/update': {
        req: UsersListsUpdateRequest;
        res: UsersListsUpdateResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_LIST'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'users/lists/update-membership': {
        req: UsersListsUpdateMembershipRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_LIST'
            | 'NO_SUCH_USER'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_MOVED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'users/notes': {
        req: UsersNotesRequest;
        res: UsersNotesResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'BOTH_WITH_REPLIES_AND_WITH_FILES'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'users/pages': {
        req: UsersPagesRequest;
        res: UsersPagesResponse;
        err: 'INTERNAL_ERROR' | 'INVALID_PARAM' | 'PAYLOAD_TOO_LARGE';
    };
    'users/reactions': {
        req: UsersReactionsRequest;
        res: UsersReactionsResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'IS_REMOTE_USER'
            | 'PAYLOAD_TOO_LARGE'
            | 'REACTIONS_NOT_PUBLIC'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'users/recommendation': {
        req: UsersRecommendationRequest;
        res: UsersRecommendationResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'users/relation': {
        req: UsersRelationRequest;
        res: UsersRelationResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'users/report-abuse': {
        req: UsersReportAbuseRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CANNOT_REPORT_THE_ADMIN'
            | 'CANNOT_REPORT_YOURSELF'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_USER'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'users/search': {
        req: UsersSearchRequest;
        res: UsersSearchResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'users/search-by-username-and-host': {
        req: UsersSearchByUsernameAndHostRequest;
        res: UsersSearchByUsernameAndHostResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'users/show': {
        req: UsersShowRequest;
        res: UsersShowResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'FAILED_TO_RESOLVE_REMOTE_USER'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_USER'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'users/update-memo': {
        req: UsersUpdateMemoRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_USER'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
    'v2/admin/emoji/list': {
        req: V2AdminEmojiListRequest;
        res: V2AdminEmojiListResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'CREDENTIAL_REQUIRED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'PAYLOAD_TOO_LARGE'
            | 'PERMISSION_DENIED'
            | 'ROLE_PERMISSION_DENIED'
            | 'YOUR_ACCOUNT_SUSPENDED';
        reqOptional: true;
    };
    'verify-email': {
        req: VerifyEmailRequest;
        res: EmptyResponse;
        err:
            | 'AUTHENTICATION_FAILED'
            | 'INTERNAL_ERROR'
            | 'INVALID_PARAM'
            | 'NO_SUCH_CODE'
            | 'PAYLOAD_TOO_LARGE'
            | 'YOUR_ACCOUNT_SUSPENDED';
    };
};

/**
 * Request Content-Type defaults to application/json for endpoints not listed here.
 */
export const endpointReqTypes = {
    'drive/files/create': 'multipart/form-data',
} as const satisfies { [K in keyof Endpoints]?: 'multipart/form-data' };
