import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

const Navbar: React.FC = () => {
    const { user, logout } = useAuth();
    const { language, setLanguage, t } = useLanguage();
    const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    return (
        <nav className="navbar">
            <div className="nav-brand">{t('sportsOrganizer')}</div>
            <div className="nav-links">
                <div className="lang-switcher" style={{ marginRight: '1rem', position: 'relative' }}>
                    <button
                        onClick={() => setIsLangMenuOpen(!isLangMenuOpen)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.5rem', padding: '0 5px' }}
                        title={language === 'cs' ? 'Změnit jazyk' : 'Change language'}
                    >
                        {language === 'cs' ? '🇨🇿' : '🇬🇧'}
                    </button>

                    {isLangMenuOpen && (
                        <div style={{
                            position: 'absolute',
                            top: '100%',
                            right: 0,
                            background: 'white',
                            border: '1px solid #ddd',
                            borderRadius: '8px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                            padding: '0.5rem',
                            zIndex: 100,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.5rem',
                            minWidth: '100px'
                        }}>
                            <button
                                onClick={() => { setLanguage('cs'); setIsLangMenuOpen(false); }}
                                style={{
                                    background: language === 'cs' ? '#f0f0f0' : 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontSize: '1.2rem',
                                    padding: '5px 10px',
                                    borderRadius: '4px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    width: '100%',
                                    color: '#333'
                                }}
                            >
                                🇨🇿 <span style={{ fontSize: '0.9rem' }}>Česky</span>
                            </button>
                            <button
                                onClick={() => { setLanguage('en'); setIsLangMenuOpen(false); }}
                                style={{
                                    background: language === 'en' ? '#f0f0f0' : 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontSize: '1.2rem',
                                    padding: '5px 10px',
                                    borderRadius: '4px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    width: '100%',
                                    color: '#333'
                                }}
                            >
                                🇬🇧 <span style={{ fontSize: '0.9rem' }}>English</span>
                            </button>
                        </div>
                    )}
                </div>

                {user ? (
                    <>
                        <Link to="/profile" className="user-info" style={{ cursor: 'pointer', textDecoration: 'underline' }}>
                            {t('welcome')}, {user.firstName || user.email}
                        </Link>
                        <button onClick={handleLogout} className="btn-logout">{t('logout')}</button>
                    </>
                ) : (() => {
                    const searchParams = new URLSearchParams(location.search);
                    const existingRedirect = searchParams.get('redirect');
                    const isAuthPage = location.pathname === '/login' || location.pathname === '/register';
                    const redirectTarget = existingRedirect || (isAuthPage ? '/' : location.pathname);

                    return (
                        <>
                            <Link to={`/login?redirect=${encodeURIComponent(redirectTarget)}`}>{t('login')}</Link>
                            <Link to={`/register?redirect=${encodeURIComponent(redirectTarget)}`}>{t('register')}</Link>
                        </>
                    );
                })()}
            </div>
        </nav>
    );
};

export default Navbar;
