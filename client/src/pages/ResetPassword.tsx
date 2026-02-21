import React, { useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useNavigate, useParams, Link } from 'react-router-dom';
import api from '../services/api';

const ResetPassword: React.FC = () => {
    const { token } = useParams<{ token: string }>();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [loading, setLoading] = useState(false);
    const { t } = useLanguage();
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (password !== confirmPassword) {
            setError(t('passwordsDoNotMatch'));
            return;
        }

        setLoading(true);
        setError('');

        try {
            await api.post(`/auth/reset-password/${token}`, { password });
            setSuccess(true);
            setTimeout(() => {
                navigate('/login');
            }, 3000);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Something went wrong');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-container">
            <h2>{t('resetPasswordTitle')}</h2>
            {success ? (
                <div className="success-message">
                    <p style={{ color: 'green' }}>{t('passwordResetSuccess')}</p>
                    <p>{t('loading')}...</p>
                </div>
            ) : (
                <>
                    {error && <p className="error" style={{ marginBottom: '1rem' }}>{error}</p>}
                    <form onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label htmlFor="password">{t('newPassword')}</label>
                            <input
                                type="password"
                                id="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label htmlFor="confirmPassword">{t('confirmNewPassword')}</label>
                            <input
                                type="password"
                                id="confirmPassword"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                            />
                        </div>
                        <button type="submit" disabled={loading}>
                            {loading ? t('loading') : t('saveNewPassword')}
                        </button>
                    </form>
                </>
            )}
            <p style={{ marginTop: '1rem' }}>
                <Link to="/login">{t('back')} {t('login').toLowerCase()}</Link>
            </p>
        </div>
    );
};

export default ResetPassword;
