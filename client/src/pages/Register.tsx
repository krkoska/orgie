import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import api from '../services/api';

const Register: React.FC = () => {
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        firstName: '',
        lastName: '',
        nickname: '',
        preferNickname: false,
        confirmPassword: ''
    });
    const { login } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const { t } = useLanguage();
    const [error, setError] = useState('');

    const searchParams = new URLSearchParams(location.search);
    let redirectPath = searchParams.get('redirect') || '/';
    // Safety check: Don't redirect back to auth pages
    if (redirectPath === '/login' || redirectPath === '/register') {
        redirectPath = '/';
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value, type, checked } = e.target;
        setFormData({
            ...formData,
            [name]: type === 'checkbox' ? checked : value
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (formData.password !== formData.confirmPassword) {
            setError(t('passwordsDoNotMatch') || 'Passwords do not match');
            return;
        }

        try {
            const { confirmPassword, ...registerData } = formData;
            const { data } = await api.post('/auth/register', registerData);
            login(data);
            navigate(redirectPath);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Registration failed');
        }
    };

    return (
        <div className="auth-container">
            <h2>Register</h2>
            {error && <p className="error">{error}</p>}
            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label htmlFor="firstName">{t('firstName') || 'First Name'}</label>
                    <input id="firstName" name="firstName" value={formData.firstName} onChange={handleChange} autoComplete="given-name" />
                </div>
                <div className="form-group">
                    <label htmlFor="lastName">{t('lastName') || 'Last Name'}</label>
                    <input id="lastName" name="lastName" value={formData.lastName} onChange={handleChange} required autoComplete="family-name" />
                </div>
                <div className="form-group">
                    <label htmlFor="nickname">{t('nickname') || 'Nickname'}</label>
                    <input id="nickname" name="nickname" value={formData.nickname} onChange={handleChange} placeholder={t('nickname') || 'Nickname'} autoComplete="nickname" />
                </div>
                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <input
                        type="checkbox"
                        id="preferNickname"
                        name="preferNickname"
                        checked={formData.preferNickname}
                        onChange={handleChange}
                        style={{ width: 'auto' }}
                    />
                    <label htmlFor="preferNickname" style={{ marginBottom: 0 }}>{t('preferNicknameLabel') || 'Use nickname'}</label>
                </div>
                <div className="form-group">
                    <label htmlFor="email">{t('email')}</label>
                    <input type="email" id="email" name="email" value={formData.email} onChange={handleChange} required autoComplete="email" />
                </div>
                <div className="form-group">
                    <label htmlFor="password">{t('password') || 'Password'}</label>
                    <input type="password" id="password" name="password" value={formData.password} onChange={handleChange} required autoComplete="new-password" />
                </div>
                <div className="form-group">
                    <label htmlFor="confirmPassword">{t('confirmPassword') || 'Confirm Password'}</label>
                    <input type="password" id="confirmPassword" name="confirmPassword" value={formData.confirmPassword} onChange={handleChange} required autoComplete="new-password" />
                </div>
                <button type="submit">{t('register')}</button>
            </form>
            <p>{t('alreadyHaveAccount')} <Link to={`/login?redirect=${encodeURIComponent(redirectPath)}`}>{t('login')}</Link></p>
        </div>
    );
};

export default Register;
