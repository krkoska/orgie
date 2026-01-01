import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import api from '../services/api';

const Login: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const { login } = useAuth();
    const { t } = useLanguage();
    const navigate = useNavigate();
    const location = useLocation();
    const [error, setError] = useState('');

    const searchParams = new URLSearchParams(location.search);
    let redirectPath = searchParams.get('redirect') || '/';
    // Safety check: Don't redirect back to auth pages
    if (redirectPath === '/login' || redirectPath === '/register') {
        redirectPath = '/';
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const { data } = await api.post('/auth/login', { email, password });
            login(data);
            navigate(redirectPath);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Login failed');
        }
    };

    return (
        <div className="auth-container">
            <h2>{t('login')}</h2>
            {error && <p className="error">{error}</p>}
            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label>{t('email')}</label>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className="form-group">
                    <label>{t('passwordLabel')}</label>
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
                <button type="submit">{t('login')}</button>
            </form>
            <p>{t('dontHaveAccount')} <Link to={`/register?redirect=${encodeURIComponent(redirectPath)}`}>{t('register')}</Link></p>
        </div>
    );
};

export default Login;
