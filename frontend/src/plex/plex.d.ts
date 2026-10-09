declare namespace Plex {
    interface ServerPreferences {
        size: number;
        allowCameraUpload: boolean;
        allowChannelAccess: boolean;
        allowMediaDeletion: boolean;
        allowSharing: boolean;
        allowSync: boolean;
        allowTuners: boolean;
        backgroundProcessing: boolean;
        certificate: boolean;
        companionProxy: boolean;
        countryCode: string;
        diagnostics: string;
        eventStream: boolean;
        friendlyName: string;
        hubSearch: boolean;
        itemClusters: boolean;
        livetv: number;
        machineIdentifier: string;
        mediaProviders: boolean;
        multiuser: boolean;
        musicAnalysis: number;
        myPlex: boolean;
        myPlexMappingState: string;
        myPlexSigninState: string;
        myPlexSubscription: boolean;
        myPlexUsername: string;
        offlineTranscode: number;
        ownerFeatures: string;
        photoAutoTag: boolean;
        platform: string;
        platformVersion: string;
        pluginHost: boolean;
        pushNotifications: boolean;
        readOnlyLibraries: boolean;
        streamingBrainABRVersion: number;
        streamingBrainVersion: number;
        sync: boolean;
        transcoderActiveVideoSessions: number;
        transcoderAudio: boolean;
        transcoderLyrics: boolean;
        transcoderPhoto: boolean;
        transcoderSubtitles: boolean;
        transcoderVideo: boolean;
        transcoderVideoBitrates: string;
        transcoderVideoQualities: string;
        transcoderVideoResolutions: string;
        updatedAt: number;
        updater: boolean;
        version: string;
        voiceSearch: boolean;
    }

    type LibaryType = 'movie' | 'show' | 'artist' | 'photo' | 'photoalbum' | 'clip' | 'episode' | 'track' | 'season' | 'album' | 'secondary';

    interface LibarySection {
        allowSync: boolean;
        art: string;
        composite: string;
        filters: boolean;
        refreshing: boolean;
        thumb: string;
        key: string;
        type: LibaryType;
        title: string;
        agent: string;
        scanner: string;
        language: string;
        uuid: string;
        updatedAt: number;
        createdAt: number;
        scannedAt: number;
        content: boolean;
        directory: boolean;
        contentChangedAt: number;
        hidden: number;
        Location: Location[];
    }

    interface Directory {
        key: string;
        title: string;
        fastKey?: string;
        secondary?: boolean;
        prompt?: string;
        search?: boolean;
        type?: string;
        librarySectionID?: number;
        librarySectionKey?: string;
        librarySectionTitle?: string;
        librarySectionType?: number;
        id?: number;
        filter?: string;
        tag?: string;
        tagType?: number;
        count?: number;
    }

    interface Type {
        key: string;
        type: LibaryType;
        title: string;
        active: boolean;
        Filter?: Filter[];
        Sort?: Sort[];
        Field?: Field[];
    }

    interface Filter {
        filter: string;
        filterType: string;
        key: string;
        title: string;
        type: string;
    }

    interface Sort {
        default?: string;
        defaultDirection?: string;
        descKey: string;
        firstCharacterKey?: string;
        key: string;
        title: string;
    }

    interface Field {
        key: string;
        title: string;
        type: string;
        subType?: string;
    }

    interface FieldType {
        type: string;
        Operator: Operator[];
    }

    interface MetadataField {
        locked: boolean;
        name: string;
    }

    interface Operator {
        key: string;
        title: string;
    }

    interface MediaContainer {
        size: number;
        totalSize?: number;
        offset?: number;
        allowSync?: boolean;
        art?: string;
        content?: string;
        identifier?: string;
        librarySectionID: number;
        librarySectionTitle?: string;
        librarySectionUUID?: string;
        mediaTagPrefix: string;
        mediaTagVersion: number;
        mixedParents?: boolean;
        nocache?: boolean;
        thumb?: string;
        title1?: string;
        title2?: string;
        viewGroup: LibaryType;

        Metadata?: import("plex/media").MediaMetadata[];
        Directory?: Directory[];

        Type?: Type[];
        FieldType?: FieldType[];
    }

    interface Hub {
        hubKey: string;
        key: string;
        title: string;  
        type: LibaryType;
        hubIdentifier: string;
        context: string;
        size: number;
        more: boolean;
        style: "shelf";
        Metadata: import("plex/media").MediaMetadata[];
    }

    interface Location {
        id: number;
        path: string;
    }

    interface TokenData {
        id: number,
        code: string,
        expiresIn: number;
        createdAt: string;
        expiresAt: string;
        authToken: string | null;
        newRegistration: boolean | null;
    }

    interface UserData {
        id: number;
        uuid: string;
        username: string;
        title: string;
        email: string;
        friendlyName: string;
        locale: string;
        confirmed: boolean;
        joinedAt: number;
        emailOnlyAuth: boolean;
        hasPassword: boolean;
        protected: boolean;
        restricted: boolean;
        home: boolean;
        homeAdmin: boolean;
        homeSize: number;
        thumb: string;
        authToken: string;
        mailingListStatus: string;
        mailingListActive: boolean;
        scrobbleTypes: string;
        country: string;
    }

    interface SearchResult {
        score: number;
        Metadata?: import("plex/media").MediaMetadata;
        Directory?: Directory;
    }

}
