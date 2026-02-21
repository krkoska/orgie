import React, { useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import UserSelect, { type User } from './UserSelect';

export const EventType = {
    ONE_TIME: 'ONE_TIME',
    RECURRING: 'RECURRING'
} as const;

export type EventType = typeof EventType[keyof typeof EventType];

export const RecurrenceFrequency = {
    DAILY: 'DAILY',
    WEEKLY: 'WEEKLY'
} as const;

export type RecurrenceFrequency = typeof RecurrenceFrequency[keyof typeof RecurrenceFrequency];

export interface EventFormData {
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
    administrators: string[];
    minAttendees: number;
    maxAttendees: number;
    activityType?: 'TEAM_SPORT';
    seasons: {
        name: string;
        startDate: string;
        endDate?: string;
    }[];
}

interface EventFormProps {
    initialData?: Partial<EventFormData> & { administrators?: User[] };
    onSubmit: (data: EventFormData) => Promise<void>;
    submitButtonText: string;
    loading?: boolean;
    ownerId?: string;
}

const EventForm: React.FC<EventFormProps> = ({ initialData, onSubmit, submitButtonText, loading, ownerId }) => {
    const { t, language } = useLanguage();

    const [name, setName] = useState(initialData?.name || '');
    const [place, setPlace] = useState(initialData?.place || '');
    const [type, setType] = useState<EventType>(initialData?.type || EventType.ONE_TIME);
    const [startTime, setStartTime] = useState(initialData?.startTime || '');
    const [endTime, setEndTime] = useState(initialData?.endTime || '');
    const [date, setDate] = useState(initialData?.date ? new Date(initialData.date).toISOString().split('T')[0] : '');
    const [administrators, setAdministrators] = useState<User[]>(initialData?.administrators || []);
    const [minAttendees, setMinAttendees] = useState(initialData?.minAttendees || 0);
    const [maxAttendees, setMaxAttendees] = useState(initialData?.maxAttendees || 0);
    const [activityType, setActivityType] = useState<'TEAM_SPORT' | undefined>(initialData?.activityType);
    const [seasons, setSeasons] = useState<EventFormData['seasons']>(
        (initialData as any)?.seasons?.map((s: any) => ({
            ...s,
            startDate: new Date(s.startDate).toISOString().split('T')[0],
            endDate: s.endDate ? new Date(s.endDate).toISOString().split('T')[0] : undefined
        })) || []
    );

    // Recurrence State
    const [frequency, setFrequency] = useState<RecurrenceFrequency>(initialData?.recurrence?.frequency || RecurrenceFrequency.DAILY);
    const [weekDays, setWeekDays] = useState<number[]>(initialData?.recurrence?.weekDays || []);

    const handleWeekDayChange = (day: number) => {
        setWeekDays(prev =>
            prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
        );
    };

    const addSeason = () => {
        setSeasons(prev => [...prev, { name: '', startDate: '', endDate: '' }]);
    };

    const updateSeason = (idx: number, field: string, value: string) => {
        setSeasons(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
    };

    const removeSeason = (idx: number) => {
        setSeasons(prev => prev.filter((_, i) => i !== idx));
    };

    const validateLocalSeasons = () => {
        if (seasons.length === 0) return true;

        const sorted = [...seasons].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

        for (let i = 0; i < sorted.length; i++) {
            const s = sorted[i];
            if (!s.name || !s.startDate) {
                alert(t('allFieldsRequired') || 'All season fields are required');
                return false;
            }
            const start = new Date(s.startDate);
            const end = s.endDate ? new Date(s.endDate) : null;

            if (end && start > end) {
                alert(`${t('invalidDateError')}: ${s.name}`);
                return false;
            }

            if (i > 0) {
                const prev = sorted[i - 1];
                const prevEnd = prev.endDate ? new Date(prev.endDate) : null;
                if (!prevEnd || start <= prevEnd) {
                    alert(t('overlapError') || 'Seasons overlap or missing intermediate end date');
                    return false;
                }
            }
        }
        return true;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const data: EventFormData = {
            name,
            place,
            type,
            startTime,
            endTime,
            administrators: administrators.map(u => u._id),
            minAttendees,
            maxAttendees,
            activityType,
            seasons: seasons.map(s => ({
                ...s,
                endDate: s.endDate === '' ? undefined : s.endDate
            }))
        };

        if (type === EventType.ONE_TIME) {
            data.date = date;
        } else {
            data.recurrence = {
                frequency,
                ...(frequency === RecurrenceFrequency.WEEKLY ? { weekDays } : {})
            };
        }

        if (!validateLocalSeasons()) return;

        await onSubmit(data);
    };

    // Helper for day ordering
    const daysMap = [t('Sun'), t('Mon'), t('Tue'), t('Wed'), t('Thu'), t('Fri'), t('Sat')];
    const orderedIndices = language === 'cs'
        ? [1, 2, 3, 4, 5, 6, 0] // Mon -> Sun
        : [0, 1, 2, 3, 4, 5, 6]; // Sun -> Sat

    return (
        <form onSubmit={handleSubmit} id="event-form">
            <div className="form-group">
                <label>{t('name')}</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={50} required />
            </div>
            <div className="form-group">
                <label>{t('place')}</label>
                <input type="text" value={place} onChange={(e) => setPlace(e.target.value)} maxLength={50} />
            </div>

            <div className="form-group">
                <label>{t('activityType') || 'Activity Type'}</label>
                <select
                    className="custom-select"
                    value={activityType || ''}
                    onChange={(e) => setActivityType(e.target.value ? e.target.value as 'TEAM_SPORT' : undefined)}
                >
                    <option value="">{t('none') || 'None'}</option>
                    <option value="TEAM_SPORT">{t('teamSport') || 'Team Sport'}</option>
                </select>
            </div>

            <div className="form-row" style={{ display: 'flex', gap: '1rem' }}>
                <div className="form-group" style={{ flex: 1 }}>
                    <label>{t('type')}</label>
                    <select className="custom-select" value={type} onChange={(e) => setType(e.target.value as EventType)}>
                        <option value={EventType.ONE_TIME}>{t('oneTime')}</option>
                        <option value={EventType.RECURRING}>{t('recurring')}</option>
                    </select>
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                    <label>{t('startTime')} (HH:mm)</label>
                    <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                    <label>{t('endTime')} (HH:mm)</label>
                    <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
                </div>
            </div>

            {type === EventType.ONE_TIME && (
                <div className="form-group">
                    <label>{t('date')}</label>
                    <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
                </div>
            )}

            <div className="form-group">
                <label>{t('administrators') || 'Administrators'}</label>
                <UserSelect
                    initialSelected={administrators}
                    onSelectionChange={(_ids, users) => setAdministrators(users)}
                    protectedUserId={ownerId}
                />
            </div>

            {type === EventType.RECURRING && (
                <div className="recurrence-options" style={{ padding: '1rem', background: '#f9f9f9', marginBottom: '1rem', borderRadius: '4px' }}>
                    <div className="form-group">
                        <label>{t('frequency')}</label>
                        <select className="custom-select" value={frequency} onChange={(e) => setFrequency(e.target.value as RecurrenceFrequency)}>
                            <option value={RecurrenceFrequency.DAILY}>{t('daily')}</option>
                            <option value={RecurrenceFrequency.WEEKLY}>{t('weekly')}</option>
                        </select>
                    </div>

                    {frequency === RecurrenceFrequency.WEEKLY && (
                        <div className="form-group">
                            <label>{t('daysOfWeek')}</label>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                {orderedIndices.map((dayIndex) => (
                                    <label key={dayIndex} style={{ display: 'inline-flex', alignItems: 'center', fontWeight: 'normal' }}>
                                        <input
                                            type="checkbox"
                                            checked={weekDays.includes(dayIndex)}
                                            onChange={() => handleWeekDayChange(dayIndex)}
                                            style={{ width: 'auto', marginRight: '4px' }}
                                        /> {daysMap[dayIndex]}
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            <div className="form-row" style={{ display: 'flex', gap: '1rem' }}>
                <div className="form-group" style={{ flex: 1 }}>
                    <label>{t('minAttendees') || 'Min. Attendees'}</label>
                    <input
                        type="number"
                        value={minAttendees}
                        onChange={(e) => setMinAttendees(parseInt(e.target.value) || 0)}
                        min="0"
                    />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                    <label>{t('maxAttendees') || 'Max. Attendees'}</label>
                    <input
                        type="number"
                        value={maxAttendees}
                        onChange={(e) => setMaxAttendees(parseInt(e.target.value) || 0)}
                        min="0"
                    />
                </div>
            </div>

            <div className="form-group" style={{ marginTop: '1.5rem', borderTop: '1px solid #eee', paddingTop: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h3 style={{ margin: 0 }}>{t('seasons')}</h3>
                    <button type="button" className="btn-secondary" onClick={addSeason}>
                        + {t('addSeason')}
                    </button>
                </div>

                {seasons.length === 0 ? (
                    <p style={{ color: '#666', fontSize: '14px' }}>{t('noSeasons')}</p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {seasons.map((s, idx) => (
                            <div key={idx} className="season-row" style={{
                                display: 'grid',
                                gridTemplateColumns: '2fr 1.5fr 1.5fr auto',
                                gap: '0.5rem',
                                alignItems: 'end',
                                background: '#fdfdfd',
                                padding: '0.75rem',
                                borderRadius: '4px',
                                border: '1px solid #f0f0f0'
                            }}>
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label style={{ fontSize: '12px' }}>{t('seasonName')}</label>
                                    <input
                                        type="text"
                                        value={s.name}
                                        onChange={(e) => updateSeason(idx, 'name', e.target.value)}
                                        placeholder={t('seasonName')}
                                        required
                                    />
                                </div>
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label style={{ fontSize: '12px' }}>{t('startDate')}</label>
                                    <input
                                        type="date"
                                        value={s.startDate}
                                        onChange={(e) => updateSeason(idx, 'startDate', e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label style={{ fontSize: '12px' }}>{t('endDate')}</label>
                                    <input
                                        type="date"
                                        value={s.endDate || ''}
                                        onChange={(e) => updateSeason(idx, 'endDate', e.target.value)}
                                    />
                                </div>
                                <button
                                    type="button"
                                    className="btn-secondary"
                                    onClick={() => removeSeason(idx)}
                                    style={{ background: 'none', border: 'none', color: '#ef4444', padding: '0.5rem', cursor: 'pointer' }}
                                    title={t('remove')}
                                >
                                    &times;
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <button type="submit" className="btn-primary" style={{ marginTop: '1.5rem', width: '100%' }} disabled={loading}>
                {loading ? t('loading') : submitButtonText}
            </button>
        </form>
    );
};

export default EventForm;
