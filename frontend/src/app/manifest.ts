import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'Acredia Academic Credentials',
        short_name: 'Acredia',
        description: 'Secure, tamper-proof academic credentials powered by blockchain',
        start_url: '/',
        display: 'standalone',
        background_color: '#030712',
        theme_color: '#3b82f6',
        // Every `sizes` value here must be the file's real pixel size:
        // Chrome needs a genuine >=512px icon to offer install and to draw a
        // crisp splash screen. tests/seo-assets.test.ts reads each file's
        // header and fails on any mismatch. Regenerate the PNGs with
        // scripts/generate-pwa-icons.sh (ACREDIA-STELLAR#303).
        icons: [
            {
                src: '/favicon.ico',
                sizes: '16x16 32x32 48x48',
                type: 'image/x-icon',
            },
            {
                src: '/icons/icon-192.png',
                sizes: '192x192',
                type: 'image/png',
                purpose: 'any',
            },
            {
                src: '/icons/icon-512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'any',
            },
            {
                src: '/icons/icon-maskable-512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'maskable',
            },
        ],
    };
}
