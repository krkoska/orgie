import React from 'react';
import { useLanguage } from '../context/LanguageContext';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    children: React.ReactNode;
    hideFooter?: boolean;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, onConfirm, title, children, hideFooter }) => {
    const { t } = useLanguage();
    if (!isOpen) return null;

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <div className="modal-header">
                    <h2>{title}</h2>
                    <button onClick={onClose} className="close-button" title={t('close') || 'Close'}>&times;</button>
                </div>
                <div className="modal-body">
                    {children}
                </div>
                {!hideFooter && (
                    <div className="modal-footer">
                        <button onClick={onClose} className="btn-secondary">{t('cancel') || 'Cancel'}</button>
                        <button onClick={onConfirm} className="btn-danger">{t('delete') || 'Delete'}</button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Modal;
