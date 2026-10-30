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

    interface MetadataField {
        locked: boolean;
        name: string;
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
