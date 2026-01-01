const isProduction = process.env.NODE_ENV === 'production';

const formatMessage = (level: string, message: string, meta?: any) => {
    if (isProduction) {
        return JSON.stringify({
            timestamp: new Date().toISOString(),
            level,
            message,
            ...meta
        });
    }
    const metaStr = meta ? ` | ${JSON.stringify(meta)}` : '';
    return `[${new Date().toISOString()}] ${level.toUpperCase()}: ${message}${metaStr}`;
};

const logger = {
    info: (message: string, meta?: any) => {
        console.log(formatMessage('info', message, meta));
    },
    warn: (message: string, meta?: any) => {
        console.warn(formatMessage('warn', message, meta));
    },
    error: (message: string, meta?: any) => {
        console.error(formatMessage('error', message, meta));
    },
    debug: (message: string, meta?: any) => {
        if (!isProduction) {
            console.log(formatMessage('debug', message, meta));
        }
    }
};

export default logger;
