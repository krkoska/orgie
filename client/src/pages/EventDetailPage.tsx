import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from '../context/ToastContext';
import api from '../services/api';
import Modal from '../components/Modal';

import EventForm, { EventType, RecurrenceFrequency, type EventFormData } from '../components/EventForm';
import TermAttendanceMatrix from '../components/TermAttendanceMatrix';
import TermStatsModal from '../components/TermStatsModal';
import { Edit, Calendar, Trash2, Grid, Table, UserPlus, UserCheck, Trophy, ChevronUp, ChevronDown } from 'lucide-react';

interface User {
    _id: string;
    firstName: string;
    lastName: string;
    nickname?: string;
    preferNickname?: boolean;
    email?: string;
}

interface Guest {
    _id: string;
    firstName: string;
    lastName: string;
    addedBy: any; // populated info
}

interface Attendee {
    id: User | string;
    kind: 'USER' | 'GUEST';
}

interface Event {
    _id: string;
    uuid: string;
    name: string;
    place: string;
    type: EventType;
    startTime: string;
    endTime: string;
    date?: string;
    recurrence?: {
        frequency: RecurrenceFrequency;
        weekDays?: number[];
    };
    ownerId: User;
    administrators: User[];
    activityType?: 'TEAM_SPORT';
    attendees: Attendee[];
    guests: Guest[];
    minAttendees: number;
    maxAttendees: number;
}

interface Term {
    _id: string;
    eventId: string;
    date: string;
    startTime: string;
    endTime: string;
    attendees: Attendee[];
    statistics?: {
        teams: {
            name: string;
            members: { id: string, kind: 'USER' | 'GUEST' }[];
            wins: number;
            draws: number;
            losses: number;
        }[];
    };
}

const EventDetailPage: React.FC = () => {
    const { uuid } = useParams<{ uuid: string }>();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { t, language } = useLanguage();
    const { showToast } = useToast();

    const [event, setEvent] = useState<Event | null>(null);
    const [terms, setTerms] = useState<Term[]>([]);
    const [archivedTerms, setArchivedTerms] = useState<Term[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingArchive, setLoadingArchive] = useState(false);
    const [showArchive, setShowArchive] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'cards' | 'matrix'>('matrix');
    const [archivedViewMode, setArchivedViewMode] = useState<'cards' | 'matrix'>('matrix');
    const [visibleCardCount, setVisibleCardCount] = useState(20);
    const [showStats, setShowStats] = useState(false);
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'attendance', direction: 'desc' });

    // Edit Modal State
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Term Generation Modal State
    const [isTermModalOpen, setIsTermModalOpen] = useState(false);
    const [termStartDate, setTermStartDate] = useState('');
    const [termEndDate, setTermEndDate] = useState('');

    // Delete Confirmation Modal State
    const [isDeleteTermModalOpen, setIsDeleteTermModalOpen] = useState(false);
    const [termToDelete, setTermToDelete] = useState<string | null>(null);

    // Bulk Delete Archive Modal State
    const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
    const [bulkStart, setBulkStart] = useState('');
    const [bulkEnd, setBulkEnd] = useState('');
    const [statsTerm, setStatsTerm] = useState<Term | null>(null);
    const [isDeletingBulk, setIsDeletingBulk] = useState(false);

    // Delete Attendee Modal State
    const [isDeleteAttendeeModalOpen, setIsDeleteAttendeeModalOpen] = useState(false);
    const [attendeeToRemove, setAttendeeToRemove] = useState<{ id: string, kind: 'USER' | 'GUEST' } | null>(null);

    // Add Guest Modal State
    const [isAddGuestModalOpen, setIsAddGuestModalOpen] = useState(false);
    const [guestFormData, setGuestFormData] = useState({ firstName: '', lastName: '' });
    const [selectedTermForGuest, setSelectedTermForGuest] = useState<string | null>(null);

    const fetchEventDetails = async () => {
        try {
            const { data } = await api.get(`/events/uuid/${uuid}`);
            setEvent(data.event);
            setTerms(data.terms);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to load event');
        } finally {
            setLoading(false);
        }
    };

    const refreshData = async () => {
        await fetchEventDetails();
        if (showArchive || showStats) {
            await fetchArchivedTerms();
        }
    };

    useEffect(() => {
        if (uuid) {
            fetchEventDetails();
        }
    }, [uuid]);

    const handleStartEdit = () => {
        setIsEditModalOpen(true);
    };

    const handleSaveEvent = async (data: EventFormData) => {
        if (!event) return;
        setIsSaving(true);
        try {
            await api.put(`/events/${event._id}`, data);
            setIsEditModalOpen(false);
            fetchEventDetails(); // Refresh
            showToast(t('eventUpdated') || 'Event updated successfully!', 'success');
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to update event', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleGenerateTerms = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!event) return;

        try {
            const { data } = await api.post('/events/terms', {
                eventId: event._id,
                startDate: termStartDate,
                endDate: termEndDate
            });

            setIsTermModalOpen(false);
            setTermStartDate('');
            setTermEndDate('');
            fetchEventDetails(); // Refresh terms

            // Show detailed message
            const { inserted, skipped } = data;
            if (inserted > 0 && skipped > 0) {
                showToast(
                    language === 'cs'
                        ? `Vygenerováno ${inserted} termínů, ${skipped} přeskočeno (již existují)`
                        : `Generated ${inserted} terms, ${skipped} skipped (already exist)`,
                    'success'
                );
            } else if (inserted > 0) {
                showToast(
                    language === 'cs'
                        ? `Úspěšně vygenerováno ${inserted} termínů`
                        : `Successfully generated ${inserted} terms`,
                    'success'
                );
            } else {
                showToast(
                    language === 'cs'
                        ? 'Žádné nové termíny k vygenerování'
                        : 'No new terms to generate',
                    'info'
                );
            }
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to generate terms', 'error');
        }
    };

    const handleDeleteTerm = async (termId: string) => {
        setTermToDelete(termId);
        setIsDeleteTermModalOpen(true);
    };

    const confirmDeleteTerm = async () => {
        if (!termToDelete) return;

        try {
            await api.delete(`/events/terms/${termToDelete}`);
            setIsDeleteTermModalOpen(false);
            setTermToDelete(null);
            await refreshData();
            showToast(t('termDeleted') || 'Term deleted successfully', 'success');
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to delete term', 'error');
        }
    };

    const handleAttendanceToggle = async (termId: string, userId?: string, kind: 'USER' | 'GUEST' = 'USER') => {
        try {
            await api.post(`/events/terms/${termId}/attendance`, { userId, kind });
            await refreshData();
            showToast(t('attendanceUpdated') || 'Attendance updated', 'success');
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to update attendance', 'error');
        }
    };

    const handleToggleEventAttendance = async () => {
        if (!event) return;
        try {
            await api.post(`/events/${event.uuid}/attendance`, {});
            await refreshData();
            showToast(t('attendanceUpdated') || 'Attendance updated', 'success');
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to update attendance', 'error');
        }
    };

    const handleRequestRemoveAttendee = async (id: string, kind: 'USER' | 'GUEST' = 'USER') => {
        setAttendeeToRemove({ id, kind });
        setIsDeleteAttendeeModalOpen(true);
    };

    const confirmDeleteAttendee = async () => {
        if (!event || !attendeeToRemove) return;
        try {
            await api.delete(`/events/uuid/${event.uuid}/attendees/${attendeeToRemove.id}?kind=${attendeeToRemove.kind}`);
            setIsDeleteAttendeeModalOpen(false);
            setAttendeeToRemove(null);
            await refreshData();
            showToast(t('attendeeRemoved') || 'Attendee removed successfully', 'success');
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to remove attendee', 'error');
        }
    };

    const handleAddGuest = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!event || !guestFormData.firstName || !guestFormData.lastName) return;

        try {
            const { data: newGuest } = await api.post(`/events/uuid/${event.uuid}/guests`, guestFormData);

            // If a term was pre-selected, sign them up for it immediately
            if (selectedTermForGuest) {
                await api.post(`/events/terms/${selectedTermForGuest}/attendance`, {
                    userId: newGuest._id,
                    kind: 'GUEST'
                });
            }

            setIsAddGuestModalOpen(false);
            setSelectedTermForGuest(null);
            setGuestFormData({ firstName: '', lastName: '' });
            fetchEventDetails();
            showToast(t('guestAdded') || 'Guest added successfully', 'success');
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to add guest', 'error');
        }
    };

    const fetchArchivedTerms = async () => {
        if (!event) return;
        setLoadingArchive(true);
        try {
            const { data } = await api.get(`/events/uuid/${uuid}/archived`);
            setArchivedTerms(data);
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to load archived terms', 'error');
        } finally {
            setLoadingArchive(false);
        }
    };

    const handleFetchArchivedTerms = async () => {
        if (!event) return;
        if (showArchive) {
            setShowArchive(false);
            return;
        }

        if (archivedTerms.length > 0) {
            setShowArchive(true);
            return;
        }

        await fetchArchivedTerms();
        setShowArchive(true);
    };

    const handleFetchStats = async () => {
        if (!event) return;
        if (showStats) {
            setShowStats(false);
            return;
        }
        if (archivedTerms.length === 0) {
            await fetchArchivedTerms();
        }
        setShowStats(true);
    };

    const handleSort = (key: string) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
        }));
    };

    const globalStats = React.useMemo(() => {
        if (!archivedTerms.length) return [];

        const statsMap = new Map<string, {
            id: string;
            kind: 'USER' | 'GUEST';
            name: string;
            attendance: number;
            wins: number;
            draws: number;
            losses: number;
            totalGames: number;
        }>();

        // 1. Initialize statsMap with all current event participants
        if (event) {
            event.attendees.forEach(a => {
                const id = typeof a.id === 'string' ? a.id : (a.id as any)._id;
                const key = `${a.kind}-${id}`;
                if (!statsMap.has(key)) {
                    let name = 'Unknown';
                    if (a.kind === 'USER' && typeof a.id === 'object' && a.id !== null) {
                        const u = a.id as any;
                        name = u.preferNickname && u.nickname ? u.nickname : `${u.firstName} ${u.lastName}`;
                    } else if (a.kind === 'GUEST') {
                        const guest = event.guests.find(g => g._id === id);
                        if (guest) name = `${guest.firstName} ${guest.lastName}`;
                    }
                    statsMap.set(key, {
                        id,
                        kind: a.kind,
                        name,
                        attendance: 0,
                        wins: 0,
                        draws: 0,
                        losses: 0,
                        totalGames: 0
                    });
                }
            });

            event.guests.forEach(g => {
                const key = `GUEST-${g._id}`;
                if (!statsMap.has(key)) {
                    statsMap.set(key, {
                        id: g._id,
                        kind: 'GUEST',
                        name: `${g.firstName} ${g.lastName}`,
                        attendance: 0,
                        wins: 0,
                        draws: 0,
                        losses: 0,
                        totalGames: 0
                    });
                }
            });
        }

        const totalTerms = archivedTerms.length;

        archivedTerms.forEach(term => {
            // Create a set of attendee keys for this specific term to filter match stats
            const termAttendeeKeys = new Set(term.attendees.map(att => {
                const id = typeof att.id === 'string' ? att.id : (att.id as any)._id;
                return `${att.kind}-${id}`;
            }));

            // Count attendance
            term.attendees.forEach(att => {
                const id = typeof att.id === 'string' ? att.id : (att.id as any)._id;
                const key = `${att.kind}-${id}`;
                if (!statsMap.has(key)) {
                    let name = 'Unknown';
                    if (att.kind === 'USER' && typeof att.id === 'object' && att.id !== null) {
                        name = (att.id as User).preferNickname && (att.id as User).nickname ? (att.id as User).nickname! : `${(att.id as User).firstName} ${(att.id as User).lastName}`;
                    } else if (att.kind === 'GUEST' && att.id) {
                        const guestId = typeof att.id === 'string' ? att.id : (att.id as any)._id;
                        const guest = event?.guests.find(g => g._id === guestId);
                        if (guest) name = `${guest.firstName} ${guest.lastName}`;
                    }
                    statsMap.set(key, {
                        id,
                        kind: att.kind,
                        name,
                        attendance: 0,
                        wins: 0,
                        draws: 0,
                        losses: 0,
                        totalGames: 0
                    });
                }
                statsMap.get(key)!.attendance += 1;
            });

            // Count match results ONLY for those who actually attended this term
            // New logic: Determine one winner (or a draw) per term
            if (term.statistics?.teams && term.statistics.teams.length > 0) {
                // 1. Identify teams that actually played games in this term
                const teamsWithStats = term.statistics.teams.map(t => ({
                    ...t,
                    w: t.wins || 0,
                    d: t.draws || 0,
                    l: t.losses || 0,
                    played: (t.wins || 0) + (t.draws || 0) + (t.losses || 0)
                })).filter(t => t.played > 0);

                if (teamsWithStats.length > 0) {
                    // 2. Sort teams using the hierarchy: Wins (desc) -> Draws (desc) -> Losses (asc)
                    const sortedTeams = [...teamsWithStats].sort((a, b) => {
                        if (b.w !== a.w) return b.w - a.w;
                        if (b.d !== a.d) return b.d - a.d;
                        return a.l - b.l;
                    });

                    const bestCandidate = sortedTeams[0];
                    const topTeams = sortedTeams.filter(t =>
                        t.w === bestCandidate.w && t.d === bestCandidate.d && t.l === bestCandidate.l
                    );

                    const singleWinnerExists = topTeams.length === 1;

                    // 3. Assign outcomes (Win, Draw, or Loss) to players
                    teamsWithStats.forEach(team => {
                        // A player gets a result if they are in the best team(s)
                        const isTop = topTeams.some(tt => tt.name === team.name); // Using name or some identifier
                        const outcome = isTop ? (singleWinnerExists ? 'WIN' : 'DRAW') : 'LOSS';

                        team.members.forEach(member => {
                            const key = `${member.kind}-${member.id}`;
                            const stats = statsMap.get(key);
                            if (stats && termAttendeeKeys.has(key)) {
                                if (outcome === 'WIN') stats.wins += 1;
                                else if (outcome === 'DRAW') stats.draws += 1;
                                else stats.losses += 1;
                                stats.totalGames += 1;
                            }
                        });
                    });
                }
            }
        });

        return Array.from(statsMap.values()).map(s => ({
            ...s,
            attendancePct: (s.attendance / totalTerms) * 100,
            winPct: s.totalGames > 0 ? (s.wins / s.totalGames) * 100 : 0,
            lossPct: s.totalGames > 0 ? (s.losses / s.totalGames) * 100 : 0
        })).sort((a: any, b: any) => {
            if (a[sortConfig.key] < b[sortConfig.key]) {
                return sortConfig.direction === 'asc' ? -1 : 1;
            }
            if (a[sortConfig.key] > b[sortConfig.key]) {
                return sortConfig.direction === 'asc' ? 1 : -1;
            }
            return 0;
        });
    }, [archivedTerms, event, sortConfig]);

    const statsHighlights = React.useMemo(() => {
        if (!globalStats.length) return { maxAttendance: -1, maxWinPct: -1, maxLossPct: -1, maxWins: -1, maxLosses: -1 };

        // Only consider those who actually played at least one game for win/loss highlights
        const playedStats = globalStats.filter(s => s.totalGames > 0);

        return {
            maxAttendance: Math.max(...globalStats.map(s => s.attendance)),
            maxWins: playedStats.length > 0 ? Math.max(...playedStats.map(s => s.wins)) : -1,
            maxLosses: playedStats.length > 0 ? Math.max(...playedStats.map(s => s.losses)) : -1,
            maxWinPct: playedStats.length > 0 ? Math.max(...playedStats.map(s => s.winPct)) : -1,
            maxLossPct: playedStats.length > 0 ? Math.max(...playedStats.map(s => s.lossPct)) : -1
        };
    }, [globalStats]);

    const filledStatsCount = React.useMemo(() => {
        return archivedTerms.filter(t => t.statistics?.teams && t.statistics.teams.length > 0).length;
    }, [archivedTerms]);

    const handleBulkDeleteArchived = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!event) return;

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const endDate = new Date(bulkEnd);
        endDate.setHours(0, 0, 0, 0);

        if (endDate >= today) {
            showToast(t('endDateError') || 'End date must be in the past', 'error');
            return;
        }


        setIsDeletingBulk(true);
        try {
            const { data } = await api.delete(`/events/uuid/${uuid}/archived`, {
                data: { startDate: bulkStart, endDate: bulkEnd }
            });
            showToast(data.message, 'success');
            setIsBulkDeleteModalOpen(false);
            setBulkStart('');
            setBulkEnd('');

            // Refresh archive
            const { data: newData } = await api.get(`/events/uuid/${uuid}/archived`);
            setArchivedTerms(newData);
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to delete terms', 'error');
        } finally {
            setIsDeletingBulk(false);
        }
    };

    const isOwner = user && event?.ownerId?._id === user?._id;
    const isAdmin = user && event?.administrators.some(admin => admin._id === user?._id);
    const canManage = isOwner || isAdmin;

    const daysMap = [t('Sun'), t('Mon'), t('Tue'), t('Wed'), t('Thu'), t('Fri'), t('Sat')];

    const renderTermCard = (term: Term, isArchived: boolean = false) => {
        const isAttendingTerm = !!user && term.attendees.some(a => a.kind === 'USER' && (typeof a.id === 'string' ? String(a.id) === String(user._id) : String(a.id?._id) === String(user._id)));
        const isFull = event && event.maxAttendees > 0 && term.attendees.length >= event.maxAttendees;
        const canJoin = (!isArchived || canManage) && user && !isAttendingTerm && !isFull;
        const canLeave = (!isArchived || canManage) && user && isAttendingTerm;

        return (
            <div key={term._id} className={`group-card ${isArchived ? 'archived' : ''}`} style={isArchived ? { opacity: 0.8, borderLeft: '4px solid #9ca3af' } : {}}>
                <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <h4 style={{ margin: 0, paddingRight: '1rem' }}>
                        {new Date(term.date).toLocaleDateString()}
                    </h4>
                    <div className="card-actions" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        {isArchived && (event?.activityType === 'TEAM_SPORT' || (event as any).activityType === 'TEAM_SPORT') && canManage && (
                            <button
                                onClick={() => setStatsTerm(term)}
                                className="icon-btn stats-btn"
                                title={t('statistics')}
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: term.statistics?.teams && term.statistics.teams.length > 0 ? '#10b981' : '#f59e0b', padding: '4px' }}
                            >
                                <Trophy size={18} />
                            </button>
                        )}
                        {(!isArchived || canManage) && user && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                {isFull && !isAttendingTerm && (
                                    <span style={{ fontSize: '12px', color: '#ef4444', fontWeight: 600 }}>{t('termFull') || 'Full'}</span>
                                )}
                                <button
                                    onClick={() => handleAttendanceToggle(term._id)}
                                    disabled={!canJoin && !canLeave}
                                    className={`icon-btn ${isAttendingTerm ? 'attending-btn' : ''}`}
                                    title={isAttendingTerm ? t('leave') || 'Leave' : (isFull ? t('termFull') || 'Term is full' : t('signUp') || 'Sign Up')}
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        cursor: (!canJoin && !canLeave) ? 'not-allowed' : 'pointer',
                                        color: isAttendingTerm ? '#10b981' : (isFull ? '#9ca3af' : '#666'),
                                        padding: '4px'
                                    }}
                                >
                                    {isAttendingTerm ? <UserCheck size={20} /> : <UserPlus size={20} />}
                                </button>
                            </div>
                        )}
                        {!isArchived && canManage && (
                            <button
                                onClick={() => handleDeleteTerm(term._id)}
                                className="icon-btn delete-btn"
                                title={t('delete')}
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#e63946', padding: '4px' }}
                            >
                                <Trash2 size={18} />
                            </button>
                        )}
                    </div>
                </div>
                <p style={{ margin: '5px 0' }}>
                    <strong>{t('time')}:</strong> {term.startTime} - {term.endTime}
                </p>
                <p style={{ margin: '5px 0' }}>
                    <strong>{t('attendees') || 'Attendees'}:</strong> {term.attendees.length}
                </p>
                {isArchived && term.attendees.length > 0 && (
                    <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {term.attendees.map((a, idx) => {
                            let name = 'Unknown';
                            if (a.kind === 'USER' && typeof a.id === 'object' && a.id !== null) {
                                name = (a.id as User).preferNickname && (a.id as User).nickname ? (a.id as User).nickname! : `${(a.id as User).firstName} ${(a.id as User).lastName}`;
                            } else if (a.kind === 'GUEST' && a.id) {
                                const guestId = typeof a.id === 'string' ? a.id : (a.id as any)._id;
                                const guest = event?.guests.find(g => g._id === guestId);
                                if (guest) name = `${guest.firstName} ${guest.lastName}`;
                            }
                            return (
                                <span key={idx} style={{ fontSize: '11px', background: '#f3f4f6', padding: '2px 6px', borderRadius: '4px', color: '#4b5563' }}>
                                    {name}
                                </span>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    };

    if (loading) return <div className="dashboard"><p>{t('loading')}</p></div>;
    if (error || !event) return <div className="dashboard"><p>{error || 'Event not found'}</p></div>;

    return (
        <div className="dashboard">
            <div style={{ marginBottom: '2rem' }}>
                <button onClick={() => navigate('/')} className="btn-secondary" style={{ marginBottom: '1rem' }} title={t('back') || 'Back to Dashboard'}>
                    ← {t('back') || 'Back to Dashboard'}
                </button>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <h1 style={{ margin: 0, marginBottom: '0.5rem' }}>{event.name}</h1>
                        {event.activityType && (
                            <div style={{ marginBottom: '0.5rem' }}>
                                <span style={{ background: '#f59e0b', color: 'white', fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '10px', textTransform: 'uppercase' }}>
                                    {t('teamSport') || 'Team Sport'}
                                </span>
                            </div>
                        )}
                        <p style={{ margin: 0, color: '#666', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {event.type === 'ONE_TIME' ? t('oneTime') : t('recurring')} • {event.place}
                        </p>
                    </div>
                    {canManage && (
                        <button
                            onClick={handleStartEdit}
                            className="btn-primary"
                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                            title={t('edit') || 'Edit'}
                        >
                            <Edit size={18} />
                            {t('edit')}
                        </button>
                    )}
                </div>
            </div>

            <div className="group-card" style={{ marginBottom: '2rem' }}>
                <h3>{t('eventDetails') || 'Event Details'}</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
                    <div>
                        <strong>{t('time')}:</strong>
                        <p style={{ margin: '5px 0' }}>{event.startTime} - {event.endTime}</p>
                    </div>
                    <div>
                        <strong>{t('owner')}:</strong>
                        <p style={{ margin: '5px 0' }}>
                            {event.ownerId.preferNickname && event.ownerId.nickname ? event.ownerId.nickname : `${event.ownerId.firstName} ${event.ownerId.lastName}`}
                        </p>
                    </div>
                    {event.administrators.length > 0 && (
                        <div>
                            <strong>{t('administrators') || 'Administrators'}:</strong>
                            <p style={{ margin: '5px 0' }}>
                                {event.administrators.map(a => a.preferNickname && a.nickname ? a.nickname : `${a.firstName} ${a.lastName}`).join(', ')}
                            </p>
                        </div>
                    )}
                    {(event.minAttendees > 0 || event.maxAttendees > 0) && (
                        <div>
                            <strong>{t('capacity') || 'Capacity'}:</strong>
                            <p style={{ margin: '5px 0' }}>
                                {event.minAttendees > 0 && `${t('min') || 'Min'}: ${event.minAttendees}`}
                                {event.minAttendees > 0 && event.maxAttendees > 0 && ' | '}
                                {event.maxAttendees > 0 && `${t('max') || 'Max'}: ${event.maxAttendees}`}
                            </p>
                        </div>
                    )}
                </div>

                {event.type === 'RECURRING' && event.recurrence && (
                    <div style={{ marginTop: '1rem' }}>
                        <strong>{t('frequency')}:</strong>
                        <p style={{ margin: '5px 0' }}>
                            {event.recurrence.frequency === 'DAILY' ? t('daily') : t('weekly')}
                            {event.recurrence.weekDays && event.recurrence.weekDays.length > 0 && (
                                <span> • {t('daysOfWeek')}: {event.recurrence.weekDays.map(d => daysMap[d]).join(', ')}</span>
                            )}
                        </p>
                    </div>
                )}
            </div>

            <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <h2 style={{ margin: 0 }}>{t('terms') || 'Terms'} ({terms.length})</h2>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                                onClick={() => setViewMode('cards')}
                                className="icon-btn"
                                title={t('viewCards')}
                                style={{
                                    background: viewMode === 'cards' ? '#3b82f6' : 'transparent',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: viewMode === 'cards' ? 'white' : '#666',
                                    padding: '6px',
                                    borderRadius: '4px',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <Grid size={20} />
                            </button>
                            <button
                                onClick={() => setViewMode('matrix')}
                                className="icon-btn"
                                title={t('viewMatrix')}
                                style={{
                                    background: viewMode === 'matrix' ? '#3b82f6' : 'transparent',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: viewMode === 'matrix' ? 'white' : '#666',
                                    padding: '6px',
                                    borderRadius: '4px',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <Table size={20} />
                            </button>
                        </div>
                    </div>
                    {canManage && event.type === 'RECURRING' && (
                        <button
                            onClick={() => setIsTermModalOpen(true)}
                            className="btn-primary"
                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                            title={t('generateTerms') || 'Generate Terms'}
                        >
                            <Calendar size={18} />
                            {t('generateTerms') || 'Generate Terms'}
                        </button>
                    )}
                </div>

                {viewMode === 'cards' ? (
                    // Card View
                    terms.length === 0 ? (
                        <p style={{ color: '#666' }}>{t('noTerms') || 'No terms scheduled yet.'}</p>
                    ) : (
                        <>
                            <div className="groups-grid">
                                {terms.slice(0, visibleCardCount).map(term => renderTermCard(term))}
                            </div>
                            {visibleCardCount < terms.length && (
                                <div style={{ textAlign: 'center', marginTop: '2rem' }}>
                                    <button
                                        onClick={() => setVisibleCardCount(prev => prev + 20)}
                                        className="btn-secondary"
                                        style={{ padding: '0.75rem 2rem' }}
                                    >
                                        {t('loadMore') || 'Load More'} ({terms.length - visibleCardCount} {t('remaining') || 'remaining'})
                                    </button>
                                </div>
                            )}
                        </>
                    )
                ) : (
                    // Matrix View
                    <TermAttendanceMatrix
                        terms={terms}
                        event={event}
                        onAttendanceToggle={handleAttendanceToggle}
                        onAddSelf={handleToggleEventAttendance}
                        onRemoveAttendee={handleRequestRemoveAttendee}
                        onAddGuest={() => {
                            setIsAddGuestModalOpen(true);
                        }}
                    />
                )}
            </div>

            {/* Global Statistics Section */}
            <div className="dashboard" style={{ marginTop: '1rem', borderTop: '1px solid #e5e7eb', paddingTop: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1f2937', margin: 0 }}>
                        {t('statistics')}{' '}
                        {showStats && (
                            <span
                                title={t('statsTooltip').replace('{filled}', filledStatsCount.toString()).replace('{total}', archivedTerms.length.toString())}
                                style={{ cursor: 'help' }}
                            >
                                ({filledStatsCount}/{archivedTerms.length})
                            </span>
                        )}
                    </h2>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                            onClick={handleFetchStats}
                            className="btn-secondary"
                            disabled={loadingArchive}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                        >
                            {loadingArchive ? t('loadingArchive') : (showStats ? t('hideStats') : t('showStats'))}
                        </button>
                    </div>
                </div>

                {showStats && (
                    <div style={{ overflowX: 'auto', background: 'white', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                        <table className="attendance-matrix" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ background: '#f9fafb' }}>
                                    {[
                                        { key: 'name', label: t('participants'), align: 'left', teamOnly: false },
                                        { key: 'attendance', label: t('attendanceCount'), align: 'center', teamOnly: false },
                                        { key: 'attendancePct', label: t('attendancePercentage'), align: 'center', teamOnly: false },
                                        { key: 'wins', label: t('wins'), align: 'center', teamOnly: true },
                                        { key: 'draws', label: t('draws'), align: 'center', teamOnly: true },
                                        { key: 'losses', label: t('losses'), align: 'center', teamOnly: true },
                                        { key: 'winPct', label: t('winPercentage'), align: 'center', teamOnly: true },
                                        { key: 'lossPct', label: t('lossPercentage'), align: 'center', teamOnly: true }
                                    ].filter(col => !col.teamOnly || event?.activityType === 'TEAM_SPORT' || (event as any).activityType === 'TEAM_SPORT').map(col => (
                                        <th
                                            key={col.key}
                                            onClick={() => handleSort(col.key)}
                                            style={{
                                                padding: '12px 16px',
                                                borderBottom: '1px solid #e5e7eb',
                                                textAlign: col.align as any,
                                                cursor: 'pointer',
                                                userSelect: 'none',
                                                whiteSpace: 'nowrap'
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: col.align === 'center' ? 'center' : 'flex-start', gap: '4px' }}>
                                                {col.label}
                                                <span style={{ display: 'flex', flexDirection: 'column', color: sortConfig.key === col.key ? '#3b82f6' : '#d1d5db' }}>
                                                    {sortConfig.key === col.key && sortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} style={{ opacity: sortConfig.key === col.key ? 1 : 0.3 }} />}
                                                </span>
                                            </div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {globalStats.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>{t('noArchivedTerms')}</td>
                                    </tr>
                                ) : (
                                    globalStats.map(s => (
                                        <tr key={`${s.kind}-${s.id}`} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                            <td style={{ padding: '12px 16px', fontWeight: 500 }}>
                                                {s.name} {s.kind === 'GUEST' && <small>(G)</small>}
                                            </td>
                                            <td style={{
                                                padding: '12px 16px',
                                                textAlign: 'center',
                                                color: s.attendance > 0 && s.attendance === statsHighlights.maxAttendance ? '#10b981' : 'inherit',
                                                fontWeight: s.attendance > 0 && s.attendance === statsHighlights.maxAttendance ? 600 : 400
                                            }}>
                                                {s.attendance}/{archivedTerms.length}
                                            </td>
                                            <td style={{
                                                padding: '12px 16px',
                                                textAlign: 'center',
                                                color: s.attendancePct > 0 && s.attendance === statsHighlights.maxAttendance ? '#10b981' : 'inherit',
                                                fontWeight: s.attendancePct > 0 && s.attendance === statsHighlights.maxAttendance ? 600 : 400
                                            }}>
                                                {s.attendancePct.toFixed(1)}%
                                            </td>
                                            {(event?.activityType === 'TEAM_SPORT' || (event as any).activityType === 'TEAM_SPORT') && (
                                                <>
                                                    <td style={{
                                                        padding: '12px 16px',
                                                        textAlign: 'center',
                                                        color: s.wins > 0 && s.wins === statsHighlights.maxWins ? '#10b981' : 'inherit',
                                                        fontWeight: s.wins > 0 && s.wins === statsHighlights.maxWins ? 600 : 400
                                                    }}>
                                                        {s.wins}
                                                    </td>
                                                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>{s.draws}</td>
                                                    <td style={{
                                                        padding: '12px 16px',
                                                        textAlign: 'center',
                                                        color: s.losses > 0 && s.losses === statsHighlights.maxLosses ? '#ef4444' : 'inherit',
                                                        fontWeight: s.losses > 0 && s.losses === statsHighlights.maxLosses ? 600 : 400
                                                    }}>
                                                        {s.losses}
                                                    </td>
                                                    <td style={{
                                                        padding: '12px 16px',
                                                        textAlign: 'center',
                                                        color: s.winPct > 0 && s.winPct === statsHighlights.maxWinPct ? '#10b981' : 'inherit',
                                                        fontWeight: s.winPct > 0 && s.winPct === statsHighlights.maxWinPct ? 600 : 400
                                                    }}>
                                                        {s.winPct.toFixed(1)}%
                                                    </td>
                                                    <td style={{
                                                        padding: '12px 16px',
                                                        textAlign: 'center',
                                                        color: s.lossPct > 0 && s.lossPct === statsHighlights.maxLossPct ? '#ef4444' : 'inherit',
                                                        fontWeight: s.lossPct > 0 && s.lossPct === statsHighlights.maxLossPct ? 600 : 400
                                                    }}>
                                                        {s.lossPct.toFixed(1)}%
                                                    </td>
                                                </>
                                            )}
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Archived Terms Section */}
            <div className="dashboard" style={{ marginTop: '1rem', borderTop: '1px solid #e5e7eb', paddingTop: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                        <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1f2937', margin: 0 }}>
                            {t('archivedTerms')} {showArchive && `(${archivedTerms.length})`}
                        </h2>
                        {showArchive && (
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button
                                    onClick={() => setArchivedViewMode('cards')}
                                    className="icon-btn"
                                    title={t('viewCards')}
                                    style={{
                                        background: archivedViewMode === 'cards' ? '#3b82f6' : 'transparent',
                                        border: 'none',
                                        cursor: 'pointer',
                                        color: archivedViewMode === 'cards' ? 'white' : '#666',
                                        padding: '6px',
                                        borderRadius: '4px',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    <Grid size={20} />
                                </button>
                                <button
                                    onClick={() => setArchivedViewMode('matrix')}
                                    className="icon-btn"
                                    title={t('viewMatrix')}
                                    style={{
                                        background: archivedViewMode === 'matrix' ? '#3b82f6' : 'transparent',
                                        border: 'none',
                                        cursor: 'pointer',
                                        color: archivedViewMode === 'matrix' ? 'white' : '#666',
                                        padding: '6px',
                                        borderRadius: '4px',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    <Table size={20} />
                                </button>
                            </div>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {canManage && showArchive && archivedTerms.length > 0 && (
                            <button
                                onClick={() => setIsBulkDeleteModalOpen(true)}
                                className="btn-secondary"
                                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#e63946', borderColor: '#e63946' }}
                                title={t('deleteArchivedBtn')}
                            >
                                <Trash2 size={18} />
                                {t('deleteArchivedBtn')}
                            </button>
                        )}
                        <button
                            onClick={handleFetchArchivedTerms}
                            className="btn-secondary"
                            disabled={loadingArchive}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                        >
                            {loadingArchive ? t('loadingArchive') : (showArchive ? t('hideArchive') : t('showArchive'))}
                        </button>
                    </div>
                </div>

                {showArchive && (
                    <div style={{ padding: archivedViewMode === 'matrix' ? '1rem' : '0', background: archivedViewMode === 'matrix' ? '#f9fafb' : 'transparent', borderRadius: '12px' }}>
                        {archivedTerms.length === 0 ? (
                            <p style={{ color: '#666' }}>{t('noArchivedTerms')}</p>
                        ) : (
                            archivedViewMode === 'matrix' ? (
                                <TermAttendanceMatrix
                                    terms={archivedTerms}
                                    event={event!}
                                    onAttendanceToggle={handleAttendanceToggle}
                                    onAddSelf={handleToggleEventAttendance}
                                    onRemoveAttendee={handleRequestRemoveAttendee}
                                    showPast={true}
                                    readOnly={!canManage}
                                />
                            ) : (
                                <div className="groups-grid">
                                    {archivedTerms.map(term => renderTermCard(term, true))}
                                </div>
                            )
                        )}
                    </div>
                )}
            </div>

            <Modal
                isOpen={isEditModalOpen}
                onClose={() => setIsEditModalOpen(false)}
                onConfirm={() => { }}
                title={t('editEvent')}
                hideFooter={true}
            >
                <EventForm
                    initialData={(event as any) || {}}
                    onSubmit={handleSaveEvent}
                    submitButtonText={t('updateEventBtn')}
                    loading={isSaving}
                    ownerId={event?.ownerId?._id}
                />
            </Modal>

            {/* Generate Terms Modal */}
            <Modal
                isOpen={isTermModalOpen}
                onClose={() => setIsTermModalOpen(false)}
                onConfirm={() => { }}
                title={t('generateTerms') || 'Generate Terms'}
                hideFooter={true}
            >
                <form onSubmit={handleGenerateTerms}>
                    <div className="form-group">
                        <label>{t('startDate') || 'Start Date'}</label>
                        <input
                            type="date"
                            value={termStartDate}
                            onChange={(e) => setTermStartDate(e.target.value)}
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label>{t('endDate') || 'End Date'}</label>
                        <input
                            type="date"
                            value={termEndDate}
                            onChange={(e) => setTermEndDate(e.target.value)}
                            required
                        />
                    </div>
                    <button type="submit" className="btn-primary" style={{ marginTop: '1rem' }}>
                        {t('generate') || 'Generate'}
                    </button>
                </form>
            </Modal>

            {/* Delete Term Confirmation Modal */}
            <Modal
                isOpen={isDeleteTermModalOpen}
                onClose={() => {
                    setIsDeleteTermModalOpen(false);
                    setTermToDelete(null);
                }}
                onConfirm={confirmDeleteTerm}
                title={t('confirmDelete') || 'Confirm Delete'}
            >
                <p>{t('confirmDeleteTerm') || 'Are you sure you want to delete this term?'}</p>
            </Modal>

            {/* Bulk Delete Archived Terms Modal */}
            <Modal
                isOpen={isBulkDeleteModalOpen}
                onClose={() => setIsBulkDeleteModalOpen(false)}
                onConfirm={() => { }}
                title={t('bulkDeleteTitle')}
                hideFooter={true}
            >
                <form onSubmit={handleBulkDeleteArchived}>
                    <div className="form-group">
                        <label>{t('deleteFrom')}</label>
                        <input
                            type="date"
                            value={bulkStart}
                            onChange={(e) => setBulkStart(e.target.value)}
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label>{t('deleteTo')}</label>
                        <input
                            type="date"
                            value={bulkEnd}
                            onChange={(e) => setBulkEnd(e.target.value)}
                            required
                        />
                    </div>
                    <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem' }}>
                        <button
                            type="submit"
                            className="btn-primary"
                            disabled={isDeletingBulk}
                            style={{ background: '#e63946' }}
                        >
                            {isDeletingBulk ? t('deleting') || 'Deleting...' : t('delete')}
                        </button>
                        <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => setIsBulkDeleteModalOpen(false)}
                        >
                            {t('cancel') || 'Cancel'}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Delete Attendee Confirmation Modal */}
            <Modal
                isOpen={isDeleteAttendeeModalOpen}
                onClose={() => {
                    setIsDeleteAttendeeModalOpen(false);
                    setAttendeeToRemove(null);
                }}
                onConfirm={confirmDeleteAttendee}
                title={t('confirmRemoveAttendee')}
            >
                <p>{t('confirmRemoveAttendeeMsg')}</p>
            </Modal>
            {/* Add Guest Modal */}
            <Modal
                isOpen={isAddGuestModalOpen}
                onClose={() => setIsAddGuestModalOpen(false)}
                onConfirm={() => { }} // Not used because we have a form
                title={t('addGuest') || 'Add Guest'}
                hideFooter={true}
            >
                <form onSubmit={handleAddGuest}>
                    <div className="form-group">
                        <label>{t('firstName')}</label>
                        <input
                            type="text"
                            value={guestFormData.firstName}
                            onChange={(e) => setGuestFormData({ ...guestFormData, firstName: e.target.value })}
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label>{t('lastName')}</label>
                        <input
                            type="text"
                            value={guestFormData.lastName}
                            onChange={(e) => setGuestFormData({ ...guestFormData, lastName: e.target.value })}
                            required
                        />
                    </div>
                    <div className="modal-footer" style={{ marginTop: '1.5rem', justifyContent: 'flex-start' }}>
                        <button type="submit" className="btn-primary">
                            {t('addGuest') || 'Add Guest'}
                        </button>
                    </div>
                </form>
            </Modal>

            {statsTerm && (
                <TermStatsModal
                    termId={statsTerm._id}
                    participants={statsTerm.attendees.map((a: any) => {
                        let name = 'Unknown';
                        if (a.kind === 'USER' && typeof a.id === 'object' && a.id !== null) {
                            name = (a.id as User).preferNickname && (a.id as User).nickname ? (a.id as User).nickname! : `${(a.id as User).firstName} ${(a.id as User).lastName}`;
                        } else if (a.kind === 'GUEST' && a.id) {
                            const guestId = typeof a.id === 'string' ? a.id : (a.id as any)._id;
                            const guest = event?.guests.find(g => g._id === guestId);
                            if (guest) name = `${guest.firstName} ${guest.lastName}`;
                        }
                        return { id: typeof a.id === 'string' ? a.id : (a.id as any)._id, kind: a.kind, name };
                    })}
                    initialStats={statsTerm.statistics}
                    onClose={() => setStatsTerm(null)}
                    onSave={() => {
                        setStatsTerm(null);
                        fetchEventDetails(); // Refresh to show new stats if needed
                        fetchArchivedTerms(); // Refresh archive to show new stats
                    }}
                />
            )}
        </div>
    );
};

export default EventDetailPage;
