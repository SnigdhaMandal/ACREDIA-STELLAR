import { structuredLog } from './debug';

export interface SendEmailOptions {
    to: string;
    subject: string;
    html: string;
}

/**
 * Sends a transactional email using the Resend REST API via native fetch.
 * This avoids requiring the 'resend' npm package.
 */
export async function sendEmail({ to, subject, html }: SendEmailOptions): Promise<boolean> {
    const resendApiKey = process.env.RESEND_API_KEY;

    if (!resendApiKey) {
        structuredLog('WARN', 'RESEND_API_KEY is not set. Email not sent.', 'system', { to, subject });
        return false;
    }

    try {
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${resendApiKey}`
            },
            body: JSON.stringify({
                from: 'Acredia <notifications@acredia.io>', // Verified sending domain
                to: [to],
                subject,
                html
            })
        });

        if (!response.ok) {
            const errorData = await response.text();
            structuredLog('ERROR', 'Failed to send email via Resend', 'system', { status: response.status, errorData, to });
            return false;
        }

        structuredLog('INFO', 'Email sent successfully', 'system', { to, subject });
        return true;
    } catch (error) {
        structuredLog('ERROR', 'Exception while sending email', 'system', { error: error instanceof Error ? error.message : String(error) });
        return false;
    }
}
