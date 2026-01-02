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
                    <label>{t('firstName') || 'First Name'}</label>
                    <input name="firstName" value={formData.firstName} onChange={handleChange} />
                </div>
                <div className="form-group">
                    <label>{t('lastName') || 'Last Name'}</label>
                    <input name="lastName" value={formData.lastName} onChange={handleChange} required />
                </div>
                <div className="form-group">
                    <label>{t('nickname') || 'Nickname'}</label>
                    <input name="nickname" value={formData.nickname} onChange={handleChange} placeholder={t('nickname') || 'Nickname'} />
                </div>
                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <input
                        type="checkbox"
                        name="preferNickname"
                        checked={formData.preferNickname}
                        onChange={handleChange}
                        style={{ width: 'auto' }}
                    />
                    <label style={{ marginBottom: 0 }}>{t('preferNicknameLabel') || 'Use nickname'}</label>
                </div>
                <div className="form-group">
                    <label>{t('email')}</label>
                    <input type="email" name="email" value={formData.email} onChange={handleChange} required />
                </div>
                <div className="form-group">
                    <label>{t('password') || 'Password'}</label>
                    <input type="password" name="password" value={formData.password} onChange={handleChange} required />
                </div>
                <div className="form-group">
                    <label>{t('confirmPassword') || 'Confirm Password'}</label>
                    <input type="password" name="confirmPassword" value={formData.confirmPassword} onChange={handleChange} required />
                </div>
                <button type="submit">{t('register')}</button>
            </form>
            <p>{t('alreadyHaveAccount')} <Link to={`/login?redirect=${encodeURIComponent(redirectPath)}`}>{t('login')}</Link></p>
        </div>
    );
};

export default Register;
