import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import { useLanguage } from '../context/LanguageContext';
import api from '../services/api';



interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (poll: any) => void;
  initialData?: {
    _id?: string;
    uuid?: string;
    title?: string;
    description?: string;
    proposedDates?: string[];
    proposedOptions?: string[];
    pollType?: string;
    deadline?: string;
  };
}

const toDatetimeLocal = (iso: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  // Format as YYYY-MM-DDTHH:MM for datetime-local input
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const PollFormModal: React.FC<Props> = ({ isOpen, onClose, onSuccess, initialData }) => {
  const { t } = useLanguage();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [proposedDates, setProposedDates] = useState<string[]>(['', '']);
  const [deadline, setDeadline] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pollType, setPollType] = useState<'DATE' | 'TEXT'>('DATE');

  const isEdit = !!(initialData?.uuid);
  const editPollType = (initialData?.pollType as 'DATE' | 'TEXT') || 'DATE';
  const activeType = isEdit ? editPollType : pollType;

  useEffect(() => {
    if (isOpen) {
      setTitle(initialData?.title || '');
      setDescription(initialData?.description || '');
      setPollType('DATE');
      if (initialData?.proposedDates && initialData.proposedDates.length >= 2 && editPollType === 'DATE') {
        setProposedDates(initialData.proposedDates.map(toDatetimeLocal));
      } else if (initialData?.proposedOptions && initialData.proposedOptions.length >= 2 && editPollType === 'TEXT') {
        setProposedDates(initialData.proposedOptions);
      } else {
        setProposedDates(['', '']);
      }
      setDeadline(initialData?.deadline ? toDatetimeLocal(initialData.deadline) : '');
      setError('');
    }
  }, [isOpen, initialData]);

  const addDate = () => setProposedDates([...proposedDates, '']);
  const removeDate = (index: number) => setProposedDates(proposedDates.filter((_, i) => i !== index));
  const updateDate = (index: number, value: string) => {
    const updated = [...proposedDates];
    updated[index] = value;
    setProposedDates(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const filledDates = proposedDates.filter(d => d.trim() !== '');
    if (filledDates.length < 2) {
      setError(activeType === 'TEXT' ? t('pollAtLeastTwoOptions') : t('pollAtLeastTwoDates'));
      return;
    }

    setLoading(true);
    try {
      let data;
      if (isEdit) {
        const res = await api.put(`/polls/${initialData!.uuid}`, {
          title: title.trim(),
          description: description.trim() || undefined,
          proposedDates: editPollType === 'DATE' ? filledDates : undefined,
          proposedOptions: editPollType === 'TEXT' ? filledDates : undefined,
          deadline: deadline || undefined,
        });
        data = res.data;
      } else {
        const res = await api.post('/polls', {
          title: title.trim(),
          description: description.trim() || undefined,
          pollType: activeType,
          proposedDates: activeType === 'DATE' ? filledDates : undefined,
          proposedOptions: activeType === 'TEXT' ? filledDates : undefined,
          deadline: deadline || undefined,
        });
        data = res.data;
      }
      onSuccess(data);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error saving poll');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={() => {}}
      title={isEdit ? 'Upravit hlasování' : t('newPoll')}
      hideFooter={true}
    >
      <form onSubmit={handleSubmit}>
        {!isEdit && (
          <div className="form-group">
            <label>{t('pollTypeLabel')}</label>
            <div style={{ display: 'flex', gap: '1.5rem' }}>
              {(['DATE', 'TEXT'] as const).map(type => (
                <label key={type} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontWeight: 'normal', width: 'auto' }}>
                  <input
                    type="radio"
                    name="pollType"
                    value={type}
                    checked={pollType === type}
                    onChange={() => setPollType(type)}
                    style={{ width: 'auto' }}
                  />
                  {type === 'DATE' ? t('pollTypeDate') : t('pollTypeText')}
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="form-group">
          <label htmlFor="poll-title">{t('pollTitle')} *</label>
          <input
            id="poll-title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            required
            maxLength={50}
          />
        </div>

        <div className="form-group">
          <label htmlFor="poll-description">{t('pollDescription')}</label>
          <textarea
            id="poll-description"
            value={description}
            onChange={e => setDescription(e.target.value)}
            maxLength={200}
            rows={3}
          />
        </div>

        <div className="form-group">
          <label>
            {activeType === 'DATE' ? t('pollProposedDates') : t('pollProposedOptions')} *
          </label>
          {proposedDates.map((d, i) => (
            <div key={i} className="poll-date-row">
              <input
                type={activeType === 'DATE' ? 'datetime-local' : 'text'}
                placeholder={activeType === 'TEXT' ? t('pollOptionPlaceholder') : undefined}
                value={d}
                onChange={e => updateDate(i, e.target.value)}
              />
              {proposedDates.length > 2 && (
                <button type="button" className="btn-danger" onClick={() => removeDate(i)}>✕</button>
              )}
            </div>
          ))}
          <button type="button" onClick={addDate} className="btn-secondary">
            {activeType === 'DATE' ? t('pollAddDate') : t('pollAddOption')}
          </button>
        </div>

        <div className="form-group">
          <label htmlFor="poll-deadline">{t('pollDeadline')}</label>
          <input
            id="poll-deadline"
            type="datetime-local"
            value={deadline}
            onChange={e => setDeadline(e.target.value)}
          />
        </div>

        {error && <p className="error">{error}</p>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? '...' : (isEdit ? 'Uložit změny' : t('pollCreateBtn'))}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default PollFormModal;
