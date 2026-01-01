import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const Profile: React.FC = () => {
    const { user, login } = useAuth();
    const { t } = useLanguage();
    const navigate = useNavigate();

    const [formData, setFormData] = useState({
        firstName: user?.firstName || '',
        lastName: user?.lastName || '',
        password: '',
        confirmPassword: ''
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
        setError('');
        setSuccess('');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (formData.password && formData.password !== formData.confirmPassword) {
            setError(t('passwordsDoNotMatch') || 'Passwords do not match');
            return;
        }

        setLoading(true);
        try {
            const updateData: any = {
                firstName: formData.firstName,
                lastName: formData.lastName
            };
            if (formData.password) {
                updateData.password = formData.password;
            }

            const { data } = await api.put('/users/profile', updateData);
            login(data);

            setSuccess(t('profileUpdated') || 'Profile updated successfully');
            setFormData(prev => ({ ...prev, password: '', confirmPassword: '' }));
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to update profile');
        } finally {
            setLoading(false);
        }
    };

    if (!user) return null;

    return (
        <div className="auth-container" style={{ maxWidth: '500px' }}>
            <h2>{t('profile') || 'Profile'}</h2>
            {error && <p className="error">{error}</p>}
            {success && <p className="success" style={{ color: '#10b981', marginBottom: '1rem' }}>{success}</p>}

            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label>{t('email')}</label>
                    <input type="email" value={user.email} disabled style={{ background: '#f5f5f5', cursor: 'not-allowed' }} />
                </div>
                <div className="form-group">
                    <label>{t('firstName') || 'First Name'}</label>
                    <input name="firstName" value={formData.firstName} onChange={handleChange} required />
                </div>
                <div className="form-group">
                    <label>{t('lastName') || 'Last Name'}</label>
                    <input name="lastName" value={formData.lastName} onChange={handleChange} required />
                </div>

                <hr style={{ margin: '1.5rem 0', border: 'none', borderTop: '1px solid #eee' }} />

                <div className="form-group">
                    <label>{t('newPasswordLabel')}</label>
                    <input type="password" name="password" value={formData.password} onChange={handleChange} />
                </div>
                <div className="form-group">
                    <label>{t('confirmNewPasswordLabel')}</label>
                    <input type="password" name="confirmPassword" value={formData.confirmPassword} onChange={handleChange} required={!!formData.password} />
                </div>

                <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                    <button type="submit" className="btn-primary" disabled={loading}>
                        {loading ? t('loading') || 'Loading...' : t('updateProfile') || 'Update Profile'}
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => navigate('/')}>
                        {t('cancel') || 'Cancel'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default Profile;
