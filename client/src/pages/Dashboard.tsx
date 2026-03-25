import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import api from '../services/api';
import Modal from '../components/Modal';
import PollFormModal from '../components/PollFormModal';
import { type User } from '../components/UserSelect';
import EventForm, { EventType, RecurrenceFrequency, type EventFormData } from '../components/EventForm';
import { Trash2, Edit, ExternalLink } from 'lucide-react';

interface PollSummary {
  _id: string;
  uuid: string;
  title: string;
  status: 'OPEN' | 'CLOSED';
  responses: unknown[];
  proposedDates: string[];
  winnerDateIndex?: number;
  resultEventId?: string;
  deadline?: string;
  createdAt: string;
  createdBy?: { _id: string; firstName: string; lastName: string } | string;
  pollType?: 'DATE' | 'TEXT';
  proposedOptions?: string[];
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
    ownerId: {
        _id: string;
        firstName: string;
        lastName: string;
        email: string;
    } | string;
    administrators: User[] | string[];
    attendees?: { id: string | User; kind: 'USER' | 'GUEST' }[];
    guests?: { _id: string; firstName: string; lastName: string; addedBy: any }[];
    minAttendees: number;
    maxAttendees: number;
}

const Dashboard: React.FC = () => {
    const [managedEvents, setManagedEvents] = useState<Event[]>([]);
    const [attendingEvents, setAttendingEvents] = useState<Event[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'events' | 'polls'>('events');
    const [polls, setPolls] = useState<PollSummary[]>([]);
    const [editingPoll, setEditingPoll] = useState<PollSummary | null>(null);

    const location = useLocation();
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        if (params.get('tab') === 'polls') setActiveTab('polls');
    }, [location.search]);

    // Modal State
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [editingEventId, setEditingEventId] = useState<string | null>(null);
    const [editingEvent, setEditingEvent] = useState<Event | null>(null);
    const [eventToDelete, setEventToDelete] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isPollModalOpen, setIsPollModalOpen] = useState(false);
    const [isDeletePollModalOpen, setIsDeletePollModalOpen] = useState(false);
    const [pollToDelete, setPollToDelete] = useState<string | null>(null);

    const { user } = useAuth();
    const { t } = useLanguage();

    const fetchEvents = async () => {
        try {
            const { data } = await api.get('/events/dashboard');
            setManagedEvents(data.managed || []);
            setAttendingEvents(data.attending || []);
        } catch (error) {
            console.error('Error fetching dashboard events', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchPolls = async () => {
        try {
            const { data } = await api.get('/polls');
            setPolls(data || []);
        } catch (error) {
            console.error('Error fetching polls', error);
        }
    };

    const handleDelete = (id: string) => {
        setEventToDelete(id);
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (eventToDelete) {
            try {
                await api.delete(`/events/${eventToDelete}`);
                setManagedEvents(managedEvents.filter(event => event._id !== eventToDelete));
                setIsDeleteModalOpen(false);
                setEventToDelete(null);
            } catch (error: any) {
                alert('Failed to delete event: ' + (error.response?.data?.message || error.message));
            }
        }
    };

    const handleDeletePoll = (uuid: string) => {
        setPollToDelete(uuid);
        setIsDeletePollModalOpen(true);
    };

    const confirmDeletePoll = async () => {
        if (pollToDelete) {
            try {
                await api.delete(`/polls/${pollToDelete}`);
                setPolls(polls.filter(poll => poll.uuid !== pollToDelete));
                setIsDeletePollModalOpen(false);
                setPollToDelete(null);
            } catch (error: any) {
                alert('Failed to delete poll: ' + (error.response?.data?.message || error.message));
            }
        }
    };

    useEffect(() => {
        fetchEvents();
        fetchPolls();
    }, []);

    const handleStartEdit = (event: Event) => {
        setEditingEventId(event._id);
        setEditingEvent(event);
        setIsCreateModalOpen(true);
    };

    const handleSaveEvent = async (data: EventFormData) => {
        setIsSaving(true);
        try {
            if (editingEventId) {
                await api.put(`/events/${editingEventId}`, data);
            } else {
                await api.post('/events', data);
            }

            setIsCreateModalOpen(false);
            setEditingEventId(null);
            setEditingEvent(null);
            fetchEvents();
        } catch (error: any) {
            alert(`Failed to ${editingEventId ? 'update' : 'create'} event: ` + (error.response?.data?.message || error.message));
        } finally {
            setIsSaving(false);
        }
    };

    const daysMap = [t('Sun'), t('Mon'), t('Tue'), t('Wed'), t('Thu'), t('Fri'), t('Sat')];

    const renderEventCard = (event: Event, isManaged: boolean) => (
        <div key={event._id} className="group-card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <h4 style={{ margin: 0, paddingRight: '1rem' }}>
                    {event.name}
                    <span style={{ fontSize: '0.8em', color: '#666', fontWeight: 'normal', display: 'block', marginTop: '4px' }}>
                        ({event.type === EventType.ONE_TIME ? t('oneTime') : t('recurring')})
                    </span>
                </h4>

                <div className="card-actions" style={{ display: 'flex', gap: '0.5rem' }}>
                    <Link
                        to={`/event/${event.uuid}`}
                        className="icon-btn"
                        title={t('viewDetail') || "View Detail"}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#666', padding: '4px', display: 'flex' }}
                    >
                        <ExternalLink size={18} />
                    </Link>
                    {isManaged && (
                        <>
                            <button
                                className="icon-btn edit-btn"
                                title={t('edit') || "Edit"}
                                onClick={() => handleStartEdit(event)}
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#666', padding: '4px' }}
                            >
                                <Edit size={18} />
                            </button>
                            <button
                                onClick={() => handleDelete(event._id)}
                                className="icon-btn delete-btn"
                                title={t('delete')}
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#e63946', padding: '4px' }}
                            >
                                <Trash2 size={18} />
                            </button>
                        </>
                    )}
                </div>
            </div>

            <div style={{ marginTop: '1rem' }}>
                <p style={{ margin: '5px 0' }}><strong>{t('place')}:</strong> {event.place}</p>
                <p style={{ margin: '5px 0' }}><strong>{t('time')}:</strong> {event.startTime} - {event.endTime}</p>

                {event.type === EventType.ONE_TIME && event.date && (
                    <p style={{ margin: '5px 0' }}><strong>{t('date')}:</strong> {new Date(event.date).toLocaleDateString()}</p>
                )}

                {event.type === EventType.RECURRING && event.recurrence && (
                    <div style={{ marginTop: '5px' }}>
                        <p style={{ margin: '5px 0' }}><strong>{t('frequency')}:</strong> {event.recurrence.frequency === 'DAILY' ? t('daily') : event.recurrence.frequency === 'WEEKLY' ? t('weekly') : t('monthly')}</p>
                        {event.recurrence.weekDays && event.recurrence.weekDays.length > 0 && (
                            <p style={{ margin: '5px 0' }}><strong>{t('daysOfWeek')}:</strong> {event.recurrence.weekDays.map(d => daysMap[d]).join(', ')}</p>
                        )}
                    </div>
                )}
            </div>

            <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #eee' }}>
                <small style={{ color: '#888' }}>{t('owner')}: {typeof event.ownerId === 'object' ? `${event.ownerId.firstName || ''} ${event.ownerId.lastName || ''}` : t('unknown')}</small>
            </div>
        </div>
    );

    return (
        <div className="dashboard">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h1 style={{ margin: 0 }}>{t('dashboardTitle')}</h1>
                {activeTab === 'events' ? (
                    <button className="btn-primary" onClick={() => setIsCreateModalOpen(true)}>
                        + {t('createNewEvent')}
                    </button>
                ) : (
                    <button className="btn-primary" onClick={() => setIsPollModalOpen(true)}>
                        + {t('newPoll')}
                    </button>
                )}
            </div>

            {/* Tab switcher */}
            <div style={{ display: 'flex', borderBottom: '2px solid #eee', marginBottom: '2rem' }}>
                {(['events', 'polls'] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        style={{
                            padding: '8px 20px',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontWeight: activeTab === tab ? 700 : 400,
                            borderBottom: activeTab === tab ? '2px solid #3b82f6' : '2px solid transparent',
                            marginBottom: '-2px',
                            color: activeTab === tab ? '#3b82f6' : '#6b7280',
                        }}
                    >
                        {tab === 'events' ? t('events') : t('polls')}
                    </button>
                ))}
            </div>

            {loading ? (
                <p>{t('loading')}</p>
            ) : activeTab === 'events' ? (
                <>
                    <section style={{ marginBottom: '3rem' }}>
                        <h2 style={{ marginBottom: '1.5rem', borderBottom: '2px solid #eee', paddingBottom: '0.5rem' }}>
                            {t('managedEvents') || 'Mnou spravované události'}
                        </h2>
                        {managedEvents.length === 0 ? (
                            <p style={{ color: '#666' }}>{t('noManagedEvents') || 'Zatím nespravujete žádné události.'}</p>
                        ) : (
                            <div className="groups-grid">
                                {managedEvents.map(event => renderEventCard(event, true))}
                            </div>
                        )}
                    </section>
                    <section>
                        <h2 style={{ marginBottom: '1.5rem', borderBottom: '2px solid #eee', paddingBottom: '0.5rem' }}>
                            {t('attendingEvents') || 'Události, kterých se účastním'}
                        </h2>
                        {attendingEvents.length === 0 ? (
                            <p style={{ color: '#666' }}>{t('noAttendingEvents') || 'Zatím nejste přihlášeni k žádné události.'}</p>
                        ) : (
                            <div className="groups-grid">
                                {attendingEvents.map(event => renderEventCard(event, false))}
                            </div>
                        )}
                    </section>
                </>
            ) : (() => {
                const openPolls = polls.filter(p => p.status === 'OPEN');
                const closedPolls = polls.filter(p => p.status === 'CLOSED');
                const renderPollCard = (poll: PollSummary) => {
                    const ownerName = typeof poll.createdBy === 'object' && poll.createdBy
                        ? `${poll.createdBy.firstName} ${poll.createdBy.lastName}`
                        : t('unknown');
                    const isPollOwner = user && (typeof poll.createdBy === 'object' && poll.createdBy ? poll.createdBy._id === user._id : poll.createdBy === user._id);
                    return (
                    <div key={poll._id} className="group-card">
                        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                            <h4 style={{ margin: 0, paddingRight: '1rem' }}>
                                {poll.title}
                                <span style={{ fontSize: '0.8em', color: '#666', fontWeight: 'normal', display: 'block', marginTop: '4px' }}>
                                    ({poll.status === 'OPEN' ? t('pollOpen') : t('pollClosed')})
                                </span>
                            </h4>
                            <div className="card-actions" style={{ display: 'flex', gap: '0.5rem' }}>
                                <Link to={`/poll/${poll.uuid}`} className="icon-btn" title="Detail"
                                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#666', padding: '4px', display: 'flex' }}>
                                    <ExternalLink size={18} />
                                </Link>
                                {isPollOwner && poll.status === 'OPEN' && (
                                    <button
                                        className="icon-btn edit-btn"
                                        title={t('edit')}
                                        onClick={() => setEditingPoll(poll)}
                                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#666', padding: '4px' }}
                                    >
                                        <Edit size={18} />
                                    </button>
                                )}
                                {isPollOwner && (
                                    <button
                                        onClick={() => handleDeletePoll(poll.uuid)}
                                        className="icon-btn delete-btn"
                                        title={t('delete')}
                                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#e63946', padding: '4px' }}
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                )}
                            </div>
                        </div>
                        <div style={{ marginTop: '1rem' }}>
                            <p style={{ margin: '5px 0', color: '#666', fontSize: '14px' }}>
                                {poll.responses.length} {t('pollResponses')} · {(!poll.pollType || poll.pollType === 'DATE' ? poll.proposedDates : poll.proposedOptions ?? []).length} {(!poll.pollType || poll.pollType === 'DATE') ? 'termínů' : 'možností'}
                            </p>
                            {poll.status === 'CLOSED' && poll.winnerDateIndex !== undefined && (() => {
  const isDatePoll = !poll.pollType || poll.pollType === 'DATE';
  const winnerLabel = isDatePoll
    ? new Date(poll.proposedDates[poll.winnerDateIndex]).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : (poll.proposedOptions?.[poll.winnerDateIndex] ?? '');
  return (
    <p style={{ margin: '5px 0', color: '#059669', fontSize: '14px' }}>
      🏆 {winnerLabel}
    </p>
  );
})()}
                            {poll.deadline && poll.status === 'OPEN' && (
                                <p style={{ margin: '5px 0', color: '#888', fontSize: '13px' }}>
                                    Uzávěrka: {new Date(poll.deadline).toLocaleDateString('cs-CZ')}
                                </p>
                            )}
                        </div>
                        <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #eee' }}>
                            <small style={{ color: '#888' }}>{t('owner')}: {ownerName}</small>
                        </div>
                    </div>
                    );
                };
                return (
                    <>
                        <section style={{ marginBottom: '3rem' }}>
                            <h2 style={{ marginBottom: '1.5rem', borderBottom: '2px solid #eee', paddingBottom: '0.5rem' }}>
                                {t('pollOpen')}
                            </h2>
                            {openPolls.length === 0 ? (
                                <p style={{ color: '#666' }}>{t('pollNoPolls')}</p>
                            ) : (
                                <div className="groups-grid">{openPolls.map(renderPollCard)}</div>
                            )}
                        </section>
                        <section>
                            <h2 style={{ marginBottom: '1.5rem', borderBottom: '2px solid #eee', paddingBottom: '0.5rem' }}>
                                {t('pollClosed')}
                            </h2>
                            {closedPolls.length === 0 ? (
                                <p style={{ color: '#666' }}>{t('pollNoPolls')}</p>
                            ) : (
                                <div className="groups-grid">{closedPolls.map(renderPollCard)}</div>
                            )}
                        </section>
                    </>
                );
            })()}

            <Modal
                isOpen={isCreateModalOpen}
                onClose={() => {
                    setIsCreateModalOpen(false);
                    setEditingEventId(null);
                    setEditingEvent(null);
                }}
                onConfirm={() => { }}
                title={editingEventId ? t('editEvent') : t('createNewEvent')}
                hideFooter={true}
            >
                <EventForm
                    initialData={(editingEvent as any) || (user ? { administrators: [user] } : {})}
                    onSubmit={handleSaveEvent}
                    submitButtonText={editingEventId ? t('updateEventBtn') : t('createEventBtn')}
                    loading={isSaving}
                    ownerId={editingEventId ? (typeof editingEvent?.ownerId === 'object' ? editingEvent.ownerId._id : editingEvent?.ownerId) : user?._id}
                />
            </Modal>

            <Modal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={confirmDelete}
                title={t('deleteEventTitle')}
            >
                <p>{t('deleteEventConfirm')}</p>
            </Modal>

            <Modal
                isOpen={isDeletePollModalOpen}
                onClose={() => setIsDeletePollModalOpen(false)}
                onConfirm={confirmDeletePoll}
                title={t('deletePollTitle') || 'Smazat hlasování'}
            >
                <p>{t('deletePollConfirm') || 'Opravdu chcete toto hlasování smazat?'}</p>
            </Modal>

            <PollFormModal
                isOpen={isPollModalOpen}
                onClose={() => setIsPollModalOpen(false)}
                onSuccess={() => { setIsPollModalOpen(false); fetchPolls(); }}
            />

            <PollFormModal
                isOpen={!!editingPoll}
                onClose={() => setEditingPoll(null)}
                onSuccess={() => { setEditingPoll(null); fetchPolls(); }}
                initialData={editingPoll as any}
            />
        </div>
    );
};

export default Dashboard;
