import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

interface PasswordInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    showPolicy?: boolean;
}

const PasswordInput: React.FC<PasswordInputProps> = ({ showPolicy = false, style, ...props }) => {
    const [visible, setVisible] = useState(false);
    const { t } = useLanguage();

    return (
        <div>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                    {...props}
                    type={visible ? 'text' : 'password'}
                    style={{ paddingRight: '2.5rem', width: '100%', boxSizing: 'border-box', ...style }}
                />
                <button
                    type="button"
                    onClick={() => setVisible(v => !v)}
                    style={{
                        position: 'absolute',
                        right: '0.6rem',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '0.25rem',
                        color: '#888',
                        display: 'flex',
                        alignItems: 'center',
                    }}
                    tabIndex={-1}
                    aria-label={visible ? t('hidePassword') : t('showPassword')}
                >
                    {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
            </div>
            {showPolicy && (
                <p style={{ margin: '0.35rem 0 0', fontSize: '0.8rem', color: '#888', lineHeight: 1.4 }}>
                    {t('passwordPolicyHint')}
                </p>
            )}
        </div>
    );
};

export default PasswordInput;
