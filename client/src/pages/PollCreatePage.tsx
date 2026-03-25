import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import api from '../services/api';

const PollCreatePage: React.FC = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [proposedDates, setProposedDates] = useState<string[]>(['', '']);
  const [deadline, setDeadline] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const addDate = () => setProposedDates([...proposedDates, '']);

  const removeDate = (index: number) => {
    setProposedDates(proposedDates.filter((_, i) => i !== index));
  };

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
      setError(t('pollAtLeastTwoDates'));
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post('/polls', {
        title: title.trim(),
        description: description.trim() || undefined,
        proposedDates: filledDates,
        deadline: deadline || undefined,
      });
      navigate(`/poll/${data.uuid}`);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error creating poll');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>
        ← Zpět
      </button>
      <h1>{t('newPoll')}</h1>
      <form onSubmit={handleSubmit}>
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
          <label>{t('pollProposedDates')} *</label>
          {proposedDates.map((d, i) => (
            <div key={i} className="poll-date-row">
              <input
                type="datetime-local"
                value={d}
                onChange={e => updateDate(i, e.target.value)}
              />
              {proposedDates.length > 2 && (
                <button
                  type="button"
                  className="btn-danger"
                  onClick={() => removeDate(i)}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          <button type="button" onClick={addDate} className="btn-secondary">
            {t('pollAddDate')}
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

        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? '...' : t('pollCreateBtn')}
        </button>
      </form>
    </div>
  );
};

export default PollCreatePage;
