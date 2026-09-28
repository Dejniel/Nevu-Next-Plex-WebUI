export function parsePlexServerUrl(value: string | undefined): URL | null {
    if (!value || value.endsWith('/')) return null;
    try {
        const parsed = new URL(value);
        if (
            !['http:', 'https:'].includes(parsed.protocol) ||
            !parsed.hostname ||
            parsed.username ||
            parsed.password ||
            parsed.pathname !== '/' ||
            parsed.search ||
            parsed.hash
        ) return null;
        return parsed;
    } catch {
        return null;
    }
}
