import React, { useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { Link } from 'react-router-dom';
import api from '../services/api';

const ForgotPassword: React.FC = () => {
    const [email, setEmail] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { t } = useLanguage();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setMessage('');

        try {
            await api.post('/auth/forgot-password', { email });
            setMessage(t('checkEmailMsg'));
        } catch (err: any) {
            setError(err.response?.data?.message || 'Something went wrong');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-container">
            <h2>{t('forgotPasswordTitle')}</h2>
            <p>{t('forgotPasswordInstruction')}</p>
            {message && <p className="success" style={{ color: 'green', marginBottom: '1rem' }}>{message}</p>}
            {error && <p className="error" style={{ marginBottom: '1rem' }}>{error}</p>}

            {!message && (
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label htmlFor="email">{t('email')}</label>
                        <input
                            type="email"
                            id="email"
                            name="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>
                    <button type="submit" className="btn-full" disabled={loading}>
                        {loading ? t('loading') : t('sendResetLink')}
                    </button>
                </form>
            )}

            <p style={{ marginTop: '1rem' }}>
                <Link to="/login">{t('back')} {t('login').toLowerCase()}</Link>
            </p>
        </div>
    );
};

export default ForgotPassword;
