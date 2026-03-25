// client/src/pages/PollPage.tsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import PollFormModal from '../components/PollFormModal';
import Modal from '../components/Modal';
import { Edit, Trash2 } from 'lucide-react';

type VoteAnswer = 'YES' | 'MAYBE' | 'NO';

interface PollVote {
  dateIndex: number;
  answer: VoteAnswer;
}

interface PollResponse {
  name: string;
  userId?: string;
  votes: PollVote[];
}

interface Poll {
  _id: string;
  uuid: string;
  title: string;
  description?: string;
  createdBy: string;
  proposedDates: string[];
  responses: PollResponse[];
  deadline?: string;
  status: 'OPEN' | 'CLOSED';
  winnerDateIndex?: number;
  resultEventId?: string;
  resultEventUuid?: string;
  pollType?: 'DATE' | 'TEXT';
  proposedOptions?: string[];
}


const ANSWER_ICONS: Record<VoteAnswer, string> = { YES: '✅', MAYBE: '🟡', NO: '❌' };

const PollPage: React.FC = () => {
  const { uuid } = useParams<{ uuid: string }>();
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [poll, setPoll] = useState<Poll | null>(null);
  const [loading, setLoading] = useState(true);
  const [voterName, setVoterName] = useState('');
  const [myVotes, setMyVotes] = useState<Record<number, VoteAnswer>>({});

  const [submitError, setSubmitError] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);
  const [isPollEditModalOpen, setIsPollEditModalOpen] = useState(false);
  const [voterNameEditing, setVoterNameEditing] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  // Confirm-event form state
  const [showConfirmForm, setShowConfirmForm] = useState(false);
  const [confirmPlace, setConfirmPlace] = useState('');
  const [confirmEndTime, setConfirmEndTime] = useState('');
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmError, setConfirmError] = useState('');

  const fetchPoll = async () => {
    try {
      const { data } = await api.get(`/polls/${uuid}`);
      setPoll(data);
      
      // Determine active name to pre-fill
      let activeName = '';
      if (user) {
        activeName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
        setVoterName(activeName);
      } else {
        const storedName = localStorage.getItem('anonymous_voter_name');
        if (storedName) {
          activeName = storedName;
          setVoterName(activeName);
        }
      }

      // Pre-fill my existing votes if any
      const existing = data.responses.find((r: PollResponse) =>
        user ? r.userId === user._id : (activeName && r.name.toLowerCase() === activeName.toLowerCase())
      );
      if (existing) {
        const voteMap: Record<number, VoteAnswer> = {};
        existing.votes.forEach((v: PollVote) => { voteMap[v.dateIndex] = v.answer; });
        setMyVotes(voteMap);
      }
    } catch {
      // poll not found
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPoll(); }, [uuid]);

  const handleVoteChange = async (dateIndex: number, answer: VoteAnswer) => {
    if (!voterName.trim()) {
      setSubmitError('Zadejte nejprve své jméno');
      return;
    }
    const newVotes = { ...myVotes, [dateIndex]: answer };
    setMyVotes(newVotes);
    setSubmitError('');

    if (!user) {
      localStorage.setItem('anonymous_voter_name', voterName.trim());
    }

    try {
      const pollOptions = (!poll!.pollType || poll!.pollType === 'DATE') ? poll!.proposedDates : (poll!.proposedOptions || []);
      const votes = pollOptions.map((_, i) => ({
        dateIndex: i,
        answer: newVotes[i] || 'NO' as VoteAnswer,
      }));
      const { data } = await api.post(`/polls/${uuid}/responses`, {
        name: voterName.trim(),
        votes,
      });
      setPoll(data);
    } catch (err: any) {
      setSubmitError(err.response?.data?.message || 'Chyba při ukládání');
    }
  };

  const handleOtherUserVoteChange = async (targetName: string, dateIndex: number, newAnswer: VoteAnswer, currentVotes: PollVote[]) => {
    const pollOptions = (!poll!.pollType || poll!.pollType === 'DATE') ? poll!.proposedDates : (poll!.proposedOptions || []);
    const newVotesArray = pollOptions.map((_, i) => {
      if (i === dateIndex) {
        return { dateIndex: i, answer: newAnswer };
      }
      const existing = currentVotes.find(v => v.dateIndex === i);
      return { dateIndex: i, answer: existing?.answer || 'NO' as VoteAnswer };
    });

    try {
      const { data } = await api.post(`/polls/${uuid}/responses`, {
        name: targetName,
        votes: newVotesArray,
      });
      setPoll(data);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Chyba při ukládání');
    }
  };

  const handleDeleteResponse = async (name: string) => {
    if (!window.confirm(`Opravdu chcete smazat hlasování pro ${name}?`)) return;
    try {
      const { data } = await api.delete(`/polls/${uuid}/responses/${encodeURIComponent(name)}`);
      setPoll(data);
      if (voterName.toLowerCase() === name.toLowerCase()) {
        setVoterName('');
        setMyVotes({});
      }
    } catch (err: any) {
      alert(err.response?.data?.message || 'Chyba při mazání');
    }
  };

  const confirmDeletePoll = async () => {
    try {
      await api.delete(`/polls/${uuid}`);
      setIsDeleteModalOpen(false);
      navigate('/?tab=polls');
    } catch (error: any) {
      alert('Failed to delete poll: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleClose = async () => {
    try {
      const { data } = await api.patch(`/polls/${uuid}/close`);
      setPoll(data);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Error closing poll');
    }
  };

  const handleConfirm = async () => {
    setConfirmLoading(true);
    setConfirmError('');
    try {
      const { data } = await api.post(`/polls/${uuid}/confirm`, {
        place: confirmPlace,
        endTime: confirmEndTime,
      });
      setPoll(data.poll);
      navigate(`/event/${data.event.uuid}`);
    } catch (err: any) {
      setConfirmError(err.response?.data?.message || 'Error creating event');
    } finally {
      setConfirmLoading(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  if (loading) return <div className="container">{t('loading')}</div>;
  if (!poll) return <div className="container">Poll not found.</div>;

  const isOwner = user && String(poll.createdBy) === String(user._id);
  const isClosed = poll.status === 'CLOSED';

  const isDatePoll = !poll.pollType || poll.pollType === 'DATE';
  const options: string[] = isDatePoll
    ? poll.proposedDates
    : (poll.proposedOptions || []);



  return (
    <div className="container">
      <button type="button" className="btn-secondary" onClick={() => navigate('/?tab=polls')} style={{ marginBottom: '1rem' }}>
        ← Zpět
      </button>
      {/* Header */}
      <div className="event-header">
        <div className="event-info">
          <h1 style={{ margin: 0, marginBottom: '0.5rem' }}>{poll.title}</h1>
          <p style={{ margin: 0, color: '#666', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', fontSize: '14px' }}>
            <span className={`event-badge ${isClosed ? 'badge-success' : 'badge-warning'}`} style={{ textTransform: 'none' }}>
              {isClosed ? t('pollClosed') : t('pollOpen')}
            </span>
            {poll.deadline && !isClosed && (
              <span>• Uzávěrka: {new Date(poll.deadline).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            )}
            {poll.description && <span>• {poll.description}</span>}
          </p>
        </div>
        <div className="event-actions">
          <button onClick={copyLink} className="btn-primary" style={{ whiteSpace: 'nowrap' }}>
            {linkCopied ? t('pollLinkCopied') : t('pollCopyLink')}
          </button>
          {isOwner && !isClosed && (
            <button onClick={() => setIsPollEditModalOpen(true)} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', whiteSpace: 'nowrap' }}>
              <Edit size={18} />
              {t('edit')}
            </button>
          )}
          {isOwner && !isClosed && (
            <button onClick={handleClose} className="btn-primary" style={{ whiteSpace: 'nowrap' }}>
              {t('pollClose')}
            </button>
          )}
          {isOwner && (
            <button onClick={() => setIsDeleteModalOpen(true)} className="icon-btn delete-btn" title={t('delete')} style={{ padding: '6px', background: 'transparent', border: 'none', color: '#e63946', cursor: 'pointer' }}>
              <Trash2 size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Vote matrix */}
      <div className="attendance-matrix-container">
        <div className="attendance-matrix-wrapper">
          <table className="attendance-matrix">
            <thead>
              <tr>
                <th className="sticky-col">{t('pollVoterName')}</th>
                {options.map((opt, i) => {
                  const yesCount = poll.responses.filter(r =>
                    r.votes.find(v => v.dateIndex === i && v.answer === 'YES')
                  ).length;
                  const isWinner = isClosed && poll.winnerDateIndex === i;
                  return (
                    <th key={i} style={{
                      background: isWinner ? '#dcfce7' : '#f9fafb',
                      borderBottom: isWinner ? '2px solid #10b981' : '1px solid #e5e7eb',
                    }}>
                      <div className="term-header">
                        <div className="term-date" style={{ fontWeight: 600 }}>
                          {isDatePoll
                            ? new Date(opt).toLocaleString('cs-CZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                            : opt}
                          {isWinner && ' 🏆'}
                        </div>
                        <div className="term-count" style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
                          {yesCount}
                        </div>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {poll.responses.filter(r =>
                isClosed || r.name.toLowerCase() !== voterName.trim().toLowerCase()
              ).map((r, ri) => {
                const isMyRow = user ? r.userId === user._id : false;
                return (
                <tr key={ri} className={isMyRow ? 'current-user-row' : ''}>
                  <td className="sticky-col">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>{r.name}{isMyRow && <span className="you-badge">{t('you')}</span>}</span>
                      {isOwner && !isClosed && !isMyRow && (
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button
                            onClick={() => handleDeleteResponse(r.name)}
                            className="icon-btn delete-btn"
                            title={t('delete')}
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: '#e63946' }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                  {options.map((_, i) => {
                    const vote = r.votes.find(v => v.dateIndex === i);
                    const currentAnswer = vote?.answer || 'NO';
                    const canEdit = isOwner && !isClosed && !isMyRow;

                    if (canEdit) {
                      const cycle: VoteAnswer[] = ['YES', 'MAYBE', 'NO'];
                      const next = cycle[(cycle.indexOf(currentAnswer) + 1) % 3];
                      const bg = currentAnswer === 'YES' ? '#dcfce7' : currentAnswer === 'MAYBE' ? '#fef3c7' : '#fee2e2';
                      const icon = currentAnswer === 'YES' ? '✓' : currentAnswer === 'MAYBE' ? '?' : '✗';
                      const iconColor = currentAnswer === 'YES' ? '#059669' : currentAnswer === 'MAYBE' ? '#d97706' : '#dc2626';
                      return (
                        <td key={i} className="attendance-cell poll-votable-cell" style={{ background: bg, cursor: 'pointer' }}
                          onClick={() => handleOtherUserVoteChange(r.name, i, next, r.votes)}>
                          <span className="poll-tristate" style={{ color: iconColor }}>
                            {icon}
                          </span>
                        </td>
                      );
                    } else {
                      const bg = currentAnswer === 'YES' ? '#dcfce7' : currentAnswer === 'MAYBE' ? '#fef9c3' : '#fee2e2';
                      return (
                        <td key={i} className="attendance-cell" style={{ background: bg }}>
                          {vote?.answer ? ANSWER_ICONS[vote.answer] : '—'}
                        </td>
                      );
                    }
                  })}
                </tr>
                );
              })}

              {/* My vote row */}
              {!isClosed && (
                <tr className="current-user-row">
                  <td className="sticky-col">
                    {user ? (
                      <span>{voterName}<span className="you-badge">{t('you')}</span></span>
                    ) : voterNameEditing ? (
                      <input
                        className="poll-vote-input"
                        placeholder={t('pollVoterName')}
                        value={voterName}
                        onChange={e => setVoterName(e.target.value)}
                        onBlur={() => setVoterNameEditing(false)}
                        autoFocus
                      />
                    ) : (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', color: voterName ? 'inherit' : '#9ca3af' }}
                        onClick={() => setVoterNameEditing(true)}>
                        <span>{voterName || t('pollVoterName')}</span>
                        <Edit size={13} style={{ flexShrink: 0, color: '#9ca3af' }} />
                      </span>
                    )}
                  </td>
                  {options.map((_, i) => {
                    const selected = myVotes[i] || 'NO';
                    const cycle: VoteAnswer[] = ['YES', 'MAYBE', 'NO'];
                    const next = cycle[(cycle.indexOf(selected) + 1) % 3];
                    const bg = selected === 'YES' ? '#dcfce7' : selected === 'MAYBE' ? '#fef3c7' : '#fee2e2';
                    const icon = selected === 'YES' ? '✓' : selected === 'MAYBE' ? '?' : '✗';
                    const iconColor = selected === 'YES' ? '#059669' : selected === 'MAYBE' ? '#d97706' : '#dc2626';
                    return (
                      <td key={i} className="attendance-cell poll-votable-cell" style={{ background: bg, cursor: 'pointer' }}
                        onClick={() => handleVoteChange(i, next)}>
                        <span className="poll-tristate" style={{ color: iconColor }}>
                          {icon}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {submitError && <p className="error" style={{ marginTop: '0.5rem' }}>{submitError}</p>}

      {isClosed && <p className="poll-meta">{t('pollClosedVoting')}</p>}

      {/* Organizer panel — winner confirmation */}
      {isOwner && isClosed && (
        <div className="poll-section">
          {poll.winnerDateIndex !== undefined && !poll.resultEventId && (
            <>
              <div className="poll-winner-box">
                🏆 {isDatePoll ? t('pollWinner') : t('pollWinnerOption')}: {isDatePoll
                  ? new Date(options[poll.winnerDateIndex!]).toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                  : options[poll.winnerDateIndex!]}
              </div>

              {isDatePoll && (!showConfirmForm ? (
                <button className="btn-primary" onClick={() => setShowConfirmForm(true)}>
                  {t('pollCreateEvent')}
                </button>
              ) : (
                <div className="group-card">
                  <h4>{t('pollCreateEvent')}</h4>
                  <div className="form-group">
                    <label htmlFor="confirm-place">{t('pollPlace')} *</label>
                    <input
                      id="confirm-place"
                      value={confirmPlace}
                      onChange={e => setConfirmPlace(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="confirm-end-time">{t('pollEndTime')} *</label>
                    <input
                      id="confirm-end-time"
                      type="time"
                      value={confirmEndTime}
                      onChange={e => setConfirmEndTime(e.target.value)}
                    />
                  </div>
                  {confirmError && <p className="error">{confirmError}</p>}
                  <div className="flex-row">
                    <button className="btn-primary" onClick={handleConfirm} disabled={confirmLoading || !confirmPlace || !confirmEndTime}>
                      {confirmLoading ? '...' : t('pollConfirmBtn')}
                    </button>
                    <button className="btn-secondary" onClick={() => setShowConfirmForm(false)}>Zpět</button>
                  </div>
                </div>
              ))}
            </>
          )}

          {poll.resultEventId && (
            <div className="poll-event-box">
              <p>{t('pollEventCreated')}</p>
              <Link to={`/event/${poll.resultEventUuid || poll.resultEventId}`} className="btn-primary">{t('pollViewEvent')}</Link>
            </div>
          )}
        </div>
      )}

      <PollFormModal
        isOpen={isPollEditModalOpen}
        onClose={() => setIsPollEditModalOpen(false)}
        onSuccess={(updatedPoll) => { setIsPollEditModalOpen(false); setPoll(updatedPoll); }}
        initialData={poll}
      />

      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={confirmDeletePoll}
        title={t('deletePollTitle') || 'Smazat hlasování'}
      >
        <p>{t('deletePollConfirm') || 'Opravdu chcete toto hlasování smazat?'}</p>
      </Modal>
    </div>
  );
};

export default PollPage;
