export async function hashApiKey(key: string): Promise<string> {
    if (globalThis.crypto?.subtle) {
        const encoded = new TextEncoder().encode(key);
        const digest = await globalThis.crypto.subtle.digest('SHA-256', encoded);
        return Array.from(new Uint8Array(digest))
            .map((byte) => byte.toString(16).padStart(2, '0'))
            .join('');
    } else {
        // Fallback for Node.js if crypto.subtle is not available globally
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const crypto = require('crypto');
        return crypto.createHash('sha256').update(key).digest('hex');
    }
}
