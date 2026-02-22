import { EmailClient } from '@azure/communication-email';
import logger from './logger';

interface EmailOptions {
    email: string;
    subject: string;
    message: string;
    html?: string;
}

const sendEmail = async (options: EmailOptions) => {
    const fromEmail = process.env.FROM_EMAIL;
    const fromName = process.env.FROM_NAME || 'Orgie';
    const connectionString = process.env.AZURE_EMAIL_CONNECTION_STRING;

    if (!connectionString) {
        logger.error('AZURE_EMAIL_CONNECTION_STRING is not defined in environment variables');
        throw new Error('Email service configuration missing');
    }

    if (!fromEmail) {
        logger.error('FROM_EMAIL is not defined in environment variables');
        throw new Error('From email address missing');
    }

    try {
        const client = new EmailClient(connectionString);
        const emailMessage = {
            senderAddress: fromEmail,
            content: {
                subject: options.subject,
                plainText: options.message,
                html: options.html,
            },
            recipients: {
                to: [{ address: options.email }],
            },
        };

        const poller = await client.beginSend(emailMessage);
        const result = await poller.pollUntilDone();
        logger.info('Email sent via Azure SDK: %s', result.id);
    } catch (error) {
        logger.error('Error sending email via Azure SDK', error);
        throw new Error('Azure Email could not be sent');
    }
};

export default sendEmail;
