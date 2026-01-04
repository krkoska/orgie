import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';

interface Participant {
    id: string;
    kind: 'USER' | 'GUEST';
    firstName: string;
    lastName: string;
    nickname?: string;
    preferNickname?: boolean;
    addedBy?: string; // name
    addedById?: string; // actual ID for permission checks
}

interface Term {
    _id: string;
    date: string;
    startTime: string;
    endTime: string;
    attendees: { id: string | any; kind: 'USER' | 'GUEST' }[];
}

interface TermAttendanceMatrixProps {
    terms: Term[];
    event: {
        _id: string;
        minAttendees: number;
        maxAttendees: number;
        attendees: { id: string | any; kind: 'USER' | 'GUEST' }[];
        guests: { _id: string; firstName: string; lastName: string; addedBy: any }[];
        ownerId?: string | any;
        administrators?: (string | any)[];
    };
    onAttendanceToggle: (termId: string, userId: string, kind: 'USER' | 'GUEST') => Promise<void>;
    onAddSelf: () => Promise<void>;
    onAddGuest?: () => void;
    onRemoveAttendee?: (userId: string, kind: 'USER' | 'GUEST') => Promise<void>;
    showPast?: boolean;
    readOnly?: boolean;
}

const TermAttendanceMatrix: React.FC<TermAttendanceMatrixProps> = ({
    terms,
    event,
    onAttendanceToggle,
    onAddSelf,
    onAddGuest,
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

    // Unified list of participants for rows
    const participants: Participant[] = [];
    const seenMap = new Map<string, boolean>();

    // 1. Process overall event attendees
    event.attendees.forEach(a => {
        if (a.kind === 'USER' && typeof a.id === 'object' && a.id !== null) {
            const u = a.id;
            if (!seenMap.has(u._id)) {
                participants.push({
                    id: u._id,
                    kind: 'USER',
                    firstName: u.firstName,
                    lastName: u.lastName,
                    nickname: u.nickname,
                    preferNickname: u.preferNickname
                });
                seenMap.set(u._id, true);
            }
        }
    });

    // 2. Process all term attendees for the current view (active or archived)
    filteredTerms.forEach(term => {
        term.attendees.forEach(a => {
            if (a.kind === 'USER' && typeof a.id === 'object' && a.id !== null) {
                const u = a.id;
                if (!seenMap.has(u._id)) {
                    participants.push({
                        id: u._id,
                        kind: 'USER',
                        firstName: u.firstName,
                        lastName: u.lastName,
                        nickname: u.nickname,
                        preferNickname: u.preferNickname
                    });
                    seenMap.set(u._id, true);
                }
            } else if (a.kind === 'GUEST') {
                const guestId = (typeof a.id === 'string')
                    ? a.id
                    : (a.id && typeof a.id === 'object' ? (a.id as any)._id : null);

                if (guestId && !seenMap.has(guestId)) {
                    const guest = event.guests.find(g => g._id === guestId);
                    if (guest) {
                        const patron = guest.addedBy;
                        const patronName = typeof patron === 'object' && patron !== null
                            ? (patron.preferNickname && patron.nickname ? patron.nickname : `${patron.firstName} ${patron.lastName}`)
                            : '';
                        const patronId = typeof patron === 'object' && patron !== null ? patron._id : patron;

                        participants.push({
                            id: guest._id,
                            kind: 'GUEST',
                            firstName: guest.firstName,
                            lastName: guest.lastName,
                            addedBy: patronName,
                            addedById: patronId
                        });
                        seenMap.set(guest._id, true);
                    }
                }
            }
        });
    });

    // 3. Process guests from event.guests registry (for those not in any term yet)
    event.guests.forEach(g => {
        if (!seenMap.has(g._id)) {
            const patron = g.addedBy;
            const patronName = typeof patron === 'object' && patron !== null
                ? (patron.preferNickname && patron.nickname ? patron.nickname : `${patron.firstName} ${patron.lastName}`)
                : '';
            const patronId = typeof patron === 'object' && patron !== null ? patron._id : patron;

            participants.push({
                id: g._id,
                kind: 'GUEST',
                firstName: g.firstName,
                lastName: g.lastName,
                addedBy: patronName,
                addedById: patronId
            });
            seenMap.set(g._id, true);
        }
    });

    const currentUserInMatrix = user && participants.some(p => p.id === user._id && p.kind === 'USER');

    // Check if current user is admin or owner
    const isOwner = event.ownerId && user && (typeof event.ownerId === 'string' ? event.ownerId === user._id : (event.ownerId as any)._id === user._id);
    const isAdmin = event.administrators && user && event.administrators.some(admin => (typeof admin === 'string' ? admin === user._id : (admin as any)._id === user._id));
    const canManageEvent = isOwner || isAdmin;

    // Check if participant is attending a specific term
    const isParticipantAttending = (termId: string, participantId: string, kind: 'USER' | 'GUEST'): boolean => {
        const term = filteredTerms.find(t => t._id === termId);
        if (!term) return false;
        return term.attendees.some(a => {
            const id = typeof a.id === 'object' && a.id !== null ? a.id._id : a.id;
            return id === participantId && a.kind === kind;
        });
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
            {user && !readOnly && (
                <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.75rem' }}>
                    {!currentUserInMatrix && (
                        <button onClick={onAddSelf} className="btn-primary">
                            + {t('addMeToMatrix') || 'Add Me to Attendance'}
                        </button>
                    )}
                    {onAddGuest && (
                        <button onClick={onAddGuest} className="btn-primary">
                            + {t('addGuest') || 'Add Guest'}
                        </button>
                    )}
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
                            <th className="sticky-col">{t('participantName') || 'Name'}</th>
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
                                            <div className="term-count" style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
                                                {term.attendees.length} / {event.maxAttendees || '∞'}
                                            </div>
                                        </div>
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {participants.length === 0 ? (
                            <tr>
                                <td colSpan={visibleTerms.length + 1} style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
                                    {t('noAttendees') || 'No one has signed up yet. Be the first!'}
                                </td>
                            </tr>
                        ) : (
                            participants.map(p => {
                                const isCurrentUser = user && p.id === user._id && p.kind === 'USER';
                                const isGuest = p.kind === 'GUEST';
                                // Robust patron check using addedById
                                const isPatron = isGuest && !!p.addedById && user && p.addedById === user._id;

                                const canToggleRow = canManageEvent || isCurrentUser || isPatron;

                                return (
                                    <tr
                                        key={`${p.kind}-${p.id}`}
                                        className={`${isCurrentUser ? 'current-user-row' : ''} ${isGuest ? 'guest-row' : ''}`}
                                    >
                                        <td className="sticky-col user-name user-name-cell">
                                            <div className="user-name-container">
                                                <span className="user-name-text">
                                                    {p.preferNickname && p.nickname
                                                        ? p.nickname
                                                        : `${p.firstName} ${p.lastName}`}
                                                    {isCurrentUser && <span className="you-badge">{t('you')}</span>}
                                                    {isGuest && (
                                                        <span className="guest-badge" title={p.addedBy ? `${t('addedBy')}: ${p.addedBy}` : ''}>
                                                            {t('guest')}
                                                        </span>
                                                    )}
                                                </span>
                                                <div className="user-actions">
                                                    {!readOnly && onRemoveAttendee && (isCurrentUser || canManageEvent || isPatron) && (
                                                        <button
                                                            onClick={() => onRemoveAttendee(p.id, p.kind)}
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
                                            const attending = isParticipantAttending(term._id, p.id, p.kind);
                                            const isFull = event.maxAttendees > 0 && term.attendees.length >= event.maxAttendees;
                                            const canToggle = !readOnly && canToggleRow && (attending || !isFull);

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
                                                        onChange={() => canToggle && onAttendanceToggle(term._id, p.id, p.kind)}
                                                        title={readOnly ? '' : (canToggleRow ? (attending ? t('leave') : (isFull ? t('termFull') || 'Term is full' : t('signUp'))) : '')}
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
