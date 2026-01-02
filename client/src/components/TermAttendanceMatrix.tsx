import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';

interface User {
    _id: string;
    firstName: string;
    lastName: string;
}

interface Term {
    _id: string;
    date: string;
    startTime: string;
    endTime: string;
    attendees: User[];
}

interface TermAttendanceMatrixProps {
    terms: Term[];
    event: {
        minAttendees: number;
        maxAttendees: number;
        attendees: User[];
        ownerId?: string | User;
        administrators?: (string | User)[];
    };
    onAttendanceToggle: (termId: string) => Promise<void>;
    onAddSelf: () => Promise<void>;
    onRemoveAttendee?: (userId: string) => Promise<void>;
    showPast?: boolean;
    readOnly?: boolean;
}

const TermAttendanceMatrix: React.FC<TermAttendanceMatrixProps> = ({
    terms,
    event,
    onAttendanceToggle,
    onAddSelf,
    onRemoveAttendee,
    showPast = false,
    readOnly = false
}) => {
    const { user } = useAuth();
    const { t } = useLanguage();
    const [windowWidth, setWindowWidth] = useState(window.innerWidth);
    const [offset, setOffset] = useState(0);
    const touchStartX = useRef<number>(0);
    const touchEndX = useRef<number>(0);

    // Update window width on resize
    useEffect(() => {
        const handleResize = () => setWindowWidth(window.innerWidth);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Filter terms based on showPast prop
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const filteredTerms = terms
        .filter(term => {
            const termDate = new Date(term.date);
            termDate.setHours(0, 0, 0, 0);
            return showPast ? termDate < today : termDate >= today;
        })
        .sort((a, b) => {
            const timeA = new Date(a.date).getTime();
            const timeB = new Date(b.date).getTime();
            return showPast ? timeB - timeA : timeA - timeB; // Archive shows newest first
        });

    // Reset offset when switching between active/archived view
    useEffect(() => {
        setOffset(0);
    }, [showPast]);

    // Calculate max visible terms based on window width
    const getMaxVisibleTerms = () => {
        if (windowWidth < 640) return 2;  // Mobile
        if (windowWidth < 768) return 4;  // Small tablet
        if (windowWidth < 1024) return 6; // Tablet
        if (windowWidth < 1280) return 8; // Small desktop
        return 10; // Large desktop
    };

    // Limit visible terms
    const maxVisibleTerms = getMaxVisibleTerms();
    const visibleTerms = filteredTerms.slice(offset, offset + maxVisibleTerms);

    const canGoBack = offset > 0;
    const canGoForward = offset + maxVisibleTerms < filteredTerms.length;

    const handlePrevious = () => {
        setOffset(prev => Math.max(0, prev - 1));
    };

    const handleNext = () => {
        setOffset(prev => {
            if (prev + maxVisibleTerms < filteredTerms.length) {
                return prev + 1;
            }
            return prev;
        });
    };

    // Swipe handlers for mobile
    const handleTouchStart = (e: React.TouchEvent) => {
        touchStartX.current = e.touches[0].clientX;
        touchEndX.current = e.touches[0].clientX; // Reset on start
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        touchEndX.current = e.touches[0].clientX;
    };

    const handleTouchEnd = () => {
        const swipeThreshold = 50;
        const diff = touchStartX.current - touchEndX.current;

        if (Math.abs(diff) > swipeThreshold) {
            if (diff > 0) {
                // Swiped left - go forward
                handleNext();
            } else {
                // Swiped right - go back
                handlePrevious();
            }
        }
    };

    if (visibleTerms.length === 0) {
        return <p style={{ color: '#666' }}>{t('noFutureTerms') || 'No upcoming terms scheduled.'}</p>;
    }

    // Use event.attendees as the source for users in the matrix
    // Combine with anyone who might be attending a term but isn't in event.attendees (shouldn't happen with our new backend, but for safety)
    const allUsersMap = new Map<string, User>();

    // Add event attendees first
    event.attendees.forEach(user => {
        allUsersMap.set(user._id, user);
    });

    // Add term attendees (just in case)
    filteredTerms.forEach(term => {
        term.attendees.forEach(attendee => {
            if (!allUsersMap.has(attendee._id)) {
                allUsersMap.set(attendee._id, attendee);
            }
        });
    });

    const users = Array.from(allUsersMap.values());
    const currentUserInMatrix = user && users.some(u => u._id === user._id);

    // Check if current user is admin or owner
    const isOwner = event.ownerId && user && (typeof event.ownerId === 'string' ? event.ownerId === user._id : (event.ownerId as any)._id === user._id);
    const isAdmin = event.administrators && user && event.administrators.some(admin => (typeof admin === 'string' ? admin === user._id : (admin as any)._id === user._id));
    const canManageAttendees = isOwner || isAdmin;

    // Check if user is attending a specific term
    const isAttending = (termId: string, userId: string): boolean => {
        const term = filteredTerms.find(t => t._id === termId);
        return term ? term.attendees.some(a => a._id === userId) : false;
    };

    // Check if term meets minimum attendees
    const meetsMinimum = (term: Term): boolean => {
        return event.minAttendees > 0 && term.attendees.length >= event.minAttendees;
    };

    return (
        <div
            className="attendance-matrix-container"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            {user && !currentUserInMatrix && !readOnly && (
                <div style={{ marginBottom: '1rem' }}>
                    <button onClick={onAddSelf} className="btn-primary">
                        + {t('addMeToMatrix') || 'Add Me to Attendance'}
                    </button>
                </div>
            )}

            {filteredTerms.length > maxVisibleTerms && (
                <div style={{ marginBottom: '1rem', padding: '8px 12px', background: '#f0f9ff', borderRadius: '6px', fontSize: '14px', color: '#0369a1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>
                        {t('showing') || 'Showing'} {offset + 1}-{Math.min(offset + maxVisibleTerms, filteredTerms.length)} {t('of') || 'of'} {filteredTerms.length} {showPast ? (t('pastTerms') || 'past terms') : (t('upcomingTerms') || 'upcoming terms')}
                    </span>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                            onClick={handlePrevious}
                            disabled={!canGoBack}
                            className="icon-btn"
                            style={{
                                background: canGoBack ? '#3b82f6' : '#e5e7eb',
                                color: canGoBack ? 'white' : '#9ca3af',
                                border: 'none',
                                cursor: canGoBack ? 'pointer' : 'not-allowed',
                                padding: '6px',
                                borderRadius: '4px'
                            }}
                            title={t('previous') || 'Previous'}
                        >
                            <ChevronLeft size={18} />
                        </button>
                        <button
                            onClick={handleNext}
                            disabled={!canGoForward}
                            className="icon-btn"
                            style={{
                                background: canGoForward ? '#3b82f6' : '#e5e7eb',
                                color: canGoForward ? 'white' : '#9ca3af',
                                border: 'none',
                                cursor: canGoForward ? 'pointer' : 'not-allowed',
                                padding: '6px',
                                borderRadius: '4px'
                            }}
                            title={t('next') || 'Next'}
                        >
                            <ChevronRight size={18} />
                        </button>
                    </div>
                </div>
            )}

            <div className="attendance-matrix-wrapper">
                <table className="attendance-matrix">
                    <thead>
                        <tr>
                            <th className="sticky-col">{t('name') || 'Name'}</th>
                            {visibleTerms.map(term => {
                                const meetMin = meetsMinimum(term);
                                return (
                                    <th
                                        key={term._id}
                                        style={{
                                            background: meetMin ? '#dcfce7' : '#f9fafb',
                                            borderBottom: meetMin ? '2px solid #10b981' : '1px solid #e5e7eb'
                                        }}
                                    >
                                        <div className="term-header">
                                            <div className="term-date" style={{ fontWeight: 600 }}>
                                                {new Date(term.date).toLocaleDateString()}
                                            </div>
                                            <div className="term-count" style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                                                {term.attendees.length} {t('attendees') || 'attendees'}
                                            </div>
                                        </div>
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {users.length === 0 ? (
                            <tr>
                                <td colSpan={visibleTerms.length + 1} style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
                                    {t('noAttendees') || 'No one has signed up yet. Be the first!'}
                                </td>
                            </tr>
                        ) : (
                            users.map(attendee => {
                                const isCurrentUser = user && attendee._id === user._id;
                                return (
                                    <tr key={attendee._id} className={isCurrentUser ? 'current-user-row' : ''}>
                                        <td className="sticky-col user-name user-name-cell">
                                            <div className="user-name-container">
                                                <span className="user-name-text">
                                                    {attendee.firstName} {attendee.lastName}
                                                    {isCurrentUser && <span className="you-badge">{t('you')}</span>}
                                                </span>
                                                <div className="user-actions">
                                                    {!readOnly && onRemoveAttendee && (isCurrentUser || canManageAttendees) && (
                                                        <button
                                                            onClick={() => onRemoveAttendee(attendee._id)}
                                                            className="icon-btn-delete"
                                                            title={t('removeAttendee')}
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        {visibleTerms.map(term => {
                                            const attending = isAttending(term._id, attendee._id);
                                            const isFull = event.maxAttendees > 0 && term.attendees.length >= event.maxAttendees;
                                            const canToggle = !readOnly && isCurrentUser && (attending || !isFull);

                                            return (
                                                <td
                                                    key={term._id}
                                                    className="attendance-cell"
                                                    style={{
                                                        background: attending ? '#dcfce7' : (isFull ? '#f3f4f6' : '#fee2e2'),
                                                        transition: 'background 0.2s',
                                                        opacity: !attending && isFull ? 0.6 : 1,
                                                        cursor: canToggle ? 'pointer' : 'default'
                                                    }}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={attending}
                                                        disabled={!canToggle}
                                                        onChange={() => canToggle && onAttendanceToggle(term._id)}
                                                        title={readOnly ? '' : (isCurrentUser ? (attending ? t('leave') : (isFull ? t('termFull') || 'Term is full' : t('signUp'))) : '')}
                                                        style={{ cursor: canToggle ? 'pointer' : 'default' }}
                                                    />
                                                </td>
                                            );
                                        })}
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default TermAttendanceMatrix;
