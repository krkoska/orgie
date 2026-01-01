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

    // Recurrence State
    const [frequency, setFrequency] = useState<RecurrenceFrequency>(initialData?.recurrence?.frequency || RecurrenceFrequency.DAILY);
    const [weekDays, setWeekDays] = useState<number[]>(initialData?.recurrence?.weekDays || []);

    const handleWeekDayChange = (day: number) => {
        setWeekDays(prev =>
            prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
        );
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
            maxAttendees
        };

        if (type === EventType.ONE_TIME) {
            data.date = date;
        } else {
            data.recurrence = {
                frequency,
                ...(frequency === RecurrenceFrequency.WEEKLY ? { weekDays } : {})
            };
        }

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

            <button type="submit" className="btn-primary" style={{ marginTop: '1rem' }} disabled={loading}>
                {loading ? t('loading') : submitButtonText}
            </button>
        </form>
    );
};

export default EventForm;
