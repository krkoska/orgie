import nodemailer from 'nodemailer';
import logger from './logger';

interface EmailOptions {
    email: string;
    subject: string;
    message: string;
    html?: string;
}

const sendEmail = async (options: EmailOptions) => {
    // Create a transporter
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'localhost',
        port: parseInt(process.env.SMTP_PORT || '1025'),
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });

    const mailOptions = {
        from: `${process.env.FROM_NAME || 'Orgie'} <${process.env.FROM_EMAIL || 'noreply@orgie.cz'}>`,
        to: options.email,
        subject: options.subject,
        text: options.message,
        html: options.html
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        logger.info('Email sent: %s', info.messageId);
    } catch (error) {
        logger.error('Error sending email', error);
        throw new Error('Email could not be sent');
    }
};

export default sendEmail;
