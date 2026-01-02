import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from '../context/ToastContext';
import api from '../services/api';
import Modal from '../components/Modal';

import EventForm, { EventType, RecurrenceFrequency, type EventFormData } from '../components/EventForm';
import TermAttendanceMatrix from '../components/TermAttendanceMatrix';
import { Edit, Calendar, Trash2, Grid, Table, UserPlus, UserCheck } from 'lucide-react';

interface User {
    _id: string;
    firstName: string;
    lastName: string;
    nickname?: string;
    preferNickname?: boolean;
    email?: string;
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
    attendees: User[];
    minAttendees: number;
    maxAttendees: number;
}

interface Term {
    _id: string;
    eventId: string;
    date: string;
    startTime: string;
    endTime: string;
    attendees: User[];
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
    const [bulkDeleteStart, setBulkDeleteStart] = useState('');
    const [bulkDeleteEnd, setBulkDeleteEnd] = useState('');
    const [isDeletingBulk, setIsDeletingBulk] = useState(false);

    // Delete Attendee Modal State
    const [isDeleteAttendeeModalOpen, setIsDeleteAttendeeModalOpen] = useState(false);
    const [attendeeToRemove, setAttendeeToRemove] = useState<string | null>(null);

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
            fetchEventDetails();
            showToast(t('termDeleted') || 'Term deleted successfully', 'success');
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to delete term', 'error');
        }
    };

    const handleAttendanceToggle = async (termId: string) => {
        try {
            await api.post(`/events/terms/${termId}/attendance`);
            fetchEventDetails(); // Refresh to get updated attendees
            showToast(t('attendanceUpdated') || 'Attendance updated', 'success');
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to update attendance', 'error');
        }
    };

    const handleToggleEventAttendance = async () => {
        if (!event) return;
        try {
            await api.post(`/events/${event.uuid}/attendance`);
            fetchEventDetails();
            showToast(t('attendanceUpdated') || 'Attendance updated', 'success');
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to update attendance', 'error');
        }
    };

    const handleRequestRemoveAttendee = async (userId: string) => {
        setAttendeeToRemove(userId);
        setIsDeleteAttendeeModalOpen(true);
    };

    const confirmDeleteAttendee = async () => {
        if (!event || !attendeeToRemove) return;
        try {
            await api.delete(`/events/uuid/${event.uuid}/attendees/${attendeeToRemove}`);
            setIsDeleteAttendeeModalOpen(false);
            setAttendeeToRemove(null);
            fetchEventDetails();
            showToast(t('attendeeRemoved') || 'Attendee removed successfully', 'success');
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to remove attendee', 'error');
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

        setLoadingArchive(true);
        try {
            const { data } = await api.get(`/events/uuid/${uuid}/archived`);
            setArchivedTerms(data);
            setShowArchive(true);
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to load archived terms', 'error');
        } finally {
            setLoadingArchive(false);
        }
    };

    const handleBulkDeleteArchived = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!event) return;

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const endDate = new Date(bulkDeleteEnd);
        endDate.setHours(0, 0, 0, 0);

        if (endDate >= today) {
            showToast(t('endDateError') || 'End date must be in the past', 'error');
            return;
        }


        setIsDeletingBulk(true);
        try {
            const { data } = await api.delete(`/events/uuid/${uuid}/archived`, {
                data: { startDate: bulkDeleteStart, endDate: bulkDeleteEnd }
            });
            showToast(data.message, 'success');
            setIsBulkDeleteModalOpen(false);
            setBulkDeleteStart('');
            setBulkDeleteEnd('');

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
        const isAttendingTerm = user && term.attendees.some(a => a._id === user._id);
        const isFull = event && event.maxAttendees > 0 && term.attendees.length >= event.maxAttendees;
        const canJoin = !isArchived && user && !isAttendingTerm && !isFull;
        const canLeave = !isArchived && user && isAttendingTerm;

        return (
            <div key={term._id} className={`group-card ${isArchived ? 'archived' : ''}`} style={isArchived ? { opacity: 0.8, borderLeft: '4px solid #9ca3af' } : {}}>
                <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <h4 style={{ margin: 0, paddingRight: '1rem' }}>
                        {new Date(term.date).toLocaleDateString()}
                    </h4>
                    <div className="card-actions" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        {!isArchived && user && (
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
                        {term.attendees.map(a => (
                            <span key={a._id} style={{ fontSize: '11px', background: '#f3f4f6', padding: '2px 6px', borderRadius: '4px', color: '#4b5563' }}>
                                {a.preferNickname && a.nickname ? a.nickname : `${a.firstName} ${a.lastName}`}
                            </span>
                        ))}
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
                        <p style={{ color: '#666', margin: 0 }}>
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
                    />
                )}
            </div>

            {/* Archived Terms Section */}
            <div className="dashboard" style={{ marginTop: '1rem', borderTop: '1px solid #e5e7eb', paddingTop: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                        <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1f2937', margin: 0 }}>
                            {t('archivedTerms')}
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
                                    onAttendanceToggle={async () => { }}
                                    onAddSelf={async () => { }}
                                    onRemoveAttendee={handleRequestRemoveAttendee}
                                    showPast={true}
                                    readOnly={true}
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
                            value={bulkDeleteStart}
                            onChange={(e) => setBulkDeleteStart(e.target.value)}
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label>{t('deleteTo')}</label>
                        <input
                            type="date"
                            value={bulkDeleteEnd}
                            onChange={(e) => setBulkDeleteEnd(e.target.value)}
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
        </div>
    );
};

export default EventDetailPage;
