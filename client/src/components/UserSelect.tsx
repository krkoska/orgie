import React, { useState, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';
import api from '../services/api';
import { X } from 'lucide-react';

export interface User {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
}

interface UserSelectProps {
    initialSelected?: User[]; // Users already selected (passed as objects)
    onSelectionChange: (ids: string[], users: User[]) => void; // Pass both IDs and objects back
    protectedUserId?: string; // ID of the user who cannot be removed (e.g. owner)
}

const UserSelect: React.FC<UserSelectProps> = ({ initialSelected = [], onSelectionChange, protectedUserId }) => {
    const { t } = useLanguage();
    const [selected, setSelected] = useState<User[]>(initialSelected);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<User[]>([]);
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        // When initialSelected changes (e.g. loading event data), update local state
        // Check if different to avoid infinite loops if parents are careless, but simple set is fine usually
        setSelected(initialSelected);
    }, [initialSelected]);

    const handleSearch = async (val: string) => {
        setQuery(val);
        if (val.length < 2) {
            setResults([]);
            setIsOpen(false);
            return;
        }

        try {
            const { data } = await api.get(`/users/search?q=${val}`);
            // Filter out already selected
            const filtered = data.filter((u: User) => !selected.find(s => s._id === u._id));
            setResults(filtered);
            setIsOpen(true);
        } catch (err) {
            console.error(err);
        }
    };

    const handleSelect = (user: User) => {
        const newSelected = [...selected, user];
        setSelected(newSelected);
        onSelectionChange(newSelected.map(u => u._id), newSelected);
        setQuery('');
        setResults([]);
        setIsOpen(false);
    };

    const handleRemove = (userId: string) => {
        const newSelected = selected.filter(u => u._id !== userId);
        setSelected(newSelected);
        onSelectionChange(newSelected.map(u => u._id), newSelected);
    };

    return (
        <div className="user-select">
            <div className="selected-users" style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '5px' }}>
                {selected.filter(u => u && u._id).map(u => (
                    <span key={u._id} style={{
                        background: '#f0f0f0',
                        padding: '4px 12px',
                        borderRadius: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        fontSize: '0.9rem',
                        border: '1px solid #e0e0e0',
                        whiteSpace: 'nowrap'
                    }}>
                        <span style={{ marginRight: '12px' }}>{u.firstName} {u.lastName}</span>
                        {u._id !== protectedUserId && (
                            <button
                                type="button"
                                onClick={() => handleRemove(u._id)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    padding: 0,
                                    display: 'flex',
                                    color: '#999',
                                    transition: 'color 0.2s',
                                    marginLeft: 'auto'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'}
                                onMouseLeave={(e) => e.currentTarget.style.color = '#999'}
                                title={t('remove') || 'Remove'}
                            >
                                <X size={14} />
                            </button>
                        )}
                    </span>
                ))}
            </div>
            <div style={{ position: 'relative' }}>
                <input
                    type="text"
                    value={query}
                    onChange={(e) => handleSearch(e.target.value)}
                    placeholder={t('search_for_administrators') || "Search for administrators..."}
                    className="form-control"
                    style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                />
                {isOpen && results.length > 0 && (
                    <ul style={{
                        position: 'absolute', top: '100%', left: 0, right: 0,
                        background: 'white', border: '1px solid #ddd',
                        listStyle: 'none', padding: 0, margin: 0, zIndex: 1000,
                        maxHeight: '200px', overflowY: 'auto', boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
                    }}>
                        {results.map(user => (
                            <li
                                key={user._id}
                                onClick={() => handleSelect(user)}
                                style={{ padding: '8px', cursor: 'pointer', borderBottom: '1px solid #eee' }}
                                onMouseEnter={(e) => e.currentTarget.style.background = '#f5f5f5'}
                                onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                            >
                                {user.firstName} {user.lastName} <br />
                                <small style={{ color: '#666' }}>{user.email}</small>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
};

export default UserSelect;
