const sensitiveQueryKeys = new Set([
    'x-plex-token',
    'token',
    'access_token',
]);

export function safeRequestUrl(rawUrl: string) {
    try {
        const url = new URL(rawUrl, 'http://nevu.local');
        for (const key of new Set(url.searchParams.keys())) {
            if (sensitiveQueryKeys.has(key.toLowerCase()))
                url.searchParams.set(key, '[redacted]');
        }
        return `${url.pathname}${url.search}`;
    } catch {
        return rawUrl.split('?')[0];
    }
}

export function shouldLogRequest(path: string) {
    return !path.startsWith('/dynproxy/');
}
