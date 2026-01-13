import React, { useState, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';
import api from '../services/api';

interface Participant {
    id: string;
    kind: 'USER' | 'GUEST';
    name: string;
}

interface Team {
    name: string;
    members: Participant[];
    wins: number;
    draws: number;
    losses: number;
}

interface TermStatsModalProps {
    termId: string;
    participants: Participant[];
    initialStats?: {
        teams: {
            name: string;
            members: { id: string, kind: 'USER' | 'GUEST' }[];
            wins: number;
            draws: number;
            losses: number;
        }[];
    };
    onClose: () => void;
    onSave: () => void;
}

const TermStatsModal: React.FC<TermStatsModalProps> = ({ termId, participants, initialStats, onClose, onSave }) => {
    const { t } = useLanguage();
    const [numTeams, setNumTeams] = useState(initialStats?.teams.length || 2);
    const [teams, setTeams] = useState<Team[]>([]);
    const [unassigned, setUnassigned] = useState<Participant[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (initialStats && initialStats.teams.length > 0) {
            const initialTeams: Team[] = initialStats.teams.map(it => ({
                name: it.name,
                wins: it.wins,
                draws: it.draws,
                losses: it.losses,
                members: it.members
                    .map(m => participants.find(p => p.id === m.id && p.kind === m.kind))
                    .filter((found): found is Participant => !!found)
            }));
            setTeams(initialTeams);

            // Calculate unassigned
            const assignedIds = new Set();
            initialStats.teams.forEach(t => t.members.forEach(m => assignedIds.add(`${m.kind}-${m.id}`)));
            setUnassigned(participants.filter(p => !assignedIds.has(`${p.kind}-${p.id}`)));
        } else {
            // Default: empty teams
            const defaultTeams: Team[] = Array.from({ length: numTeams }, (_, i) => ({
                name: `${t('team')} ${i + 1}`,
                members: [],
                wins: 0,
                draws: 0,
                losses: 0
            }));
            setTeams(defaultTeams);
            setUnassigned(participants);
        }
    }, [participants, initialStats, numTeams, t]);

    const handleNumTeamsChange = (val: number) => {
        const n = Math.max(1, val);
        setNumTeams(n);
        setTeams(prev => {
            if (n > prev.length) {
                const added = Array.from({ length: n - prev.length }, (_, i) => ({
                    name: `${t('team')} ${prev.length + i + 1}`,
                    members: [],
                    wins: 0,
                    draws: 0,
                    losses: 0
                }));
                return [...prev, ...added];
            } else {
                return prev.slice(0, n);
            }
        });
    };

    const moveToTeam = (participant: Participant, teamIdx: number) => {
        setUnassigned(prev => prev.filter(p => p.id !== participant.id || p.kind !== participant.kind));
        setTeams(prev => prev.map((team, idx) => {
            if (idx === teamIdx) {
                return { ...team, members: [...team.members, participant] };
            }
            return { ...team, members: team.members.filter(p => p.id !== participant.id || p.kind !== participant.kind) };
        }));
    };

    const moveToUnassigned = (participant: Participant) => {
        setUnassigned(prev => [...prev, participant]);
        setTeams(prev => prev.map(team => ({
            ...team,
            members: team.members.filter(p => p.id !== participant.id || p.kind !== participant.kind)
        })));
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            const statistics = {
                teams: teams.map(team => ({
                    name: team.name,
                    wins: team.wins,
                    draws: team.draws,
                    losses: team.losses,
                    members: team.members.map(m => ({ id: m.id, kind: m.kind }))
                }))
            };
            await api.post(`/events/terms/${termId}/statistics`, { statistics });
            onSave();
            onClose();
        } catch (error) {
            console.error('Failed to save statistics', error);
            alert('Failed to save statistics');
        } finally {
            setLoading(false);
        }
    };

    const termOutcome = React.useMemo(() => {
        const teamsWithGames = teams.filter(t => (t.wins + t.draws + t.losses) > 0);
        if (teamsWithGames.length === 0) return null;

        const sorted = [...teamsWithGames].sort((a, b) => {
            if (b.wins !== a.wins) return b.wins - a.wins;
            if (b.draws !== a.draws) return b.draws - a.draws;
            return a.losses - b.losses;
        });

        const best = sorted[0];
        const topTeams = sorted.filter(t => t.wins === best.wins && t.draws === best.draws && t.losses === best.losses);
        const singleWinner = topTeams.length === 1;

        return teamsWithGames.map(team => {
            const isTop = topTeams.some(tt => tt.name === team.name);
            const outcomeKey = isTop ? (singleWinner ? 'outcomeWin' : 'outcomeDraw') : 'outcomeLoss';
            const outcome = isTop ? (singleWinner ? 'WIN' : 'DRAW') : 'LOSS';
            const color = outcome === 'WIN' ? '#10b981' : (outcome === 'DRAW' ? '#f59e0b' : '#ef4444');
            const bg = outcome === 'WIN' ? '#ecfdf5' : (outcome === 'DRAW' ? '#fffbeb' : '#fef2f2');

            return {
                name: team.name,
                label: t(outcomeKey),
                color,
                bg
            };
        });
    }, [teams, t]);

    return (
        <div className="modal-overlay">
            <div className="modal-content stats-modal">
                <div className="modal-header">
                    <h2>{t('statistics')}</h2>
                    <button className="close-button" onClick={onClose}>&times;</button>
                </div>

                <div className="modal-body">
                    <div className="form-group">
                        <label>{t('numTeams')}</label>
                        <input
                            type="number"
                            min="1"
                            max="10"
                            value={numTeams}
                            onChange={(e) => handleNumTeamsChange(parseInt(e.target.value) || 2)}
                            className="team-num-input"
                            style={{ width: '80px' }}
                        />
                    </div>

                    {/* Outcome Preview Section */}
                    <div className="outcome-preview">
                        <h3>
                            {t('termOutcomePreview') || 'Term Outcome Preview'}
                        </h3>
                        <div className="outcome-list">
                            {!termOutcome ? (
                                <span className="no-stats-placeholder">
                                    {t('noStatsEntered') || 'Enter stats to see the outcome'}
                                </span>
                            ) : termOutcome.map(res => (
                                <div key={res.name} className="outcome-item" style={{
                                    border: `1px solid ${res.color}`,
                                    background: res.bg,
                                    color: res.color
                                }}>
                                    <span>{res.name}:</span>
                                    <span>{res.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="stats-layout">
                        {/* Unassigned List */}
                        <div className="unassigned-container">
                            <h3>{t('participants')} ({unassigned.length})</h3>
                            <div className="participant-list-container">
                                {unassigned.map(p => (
                                    <div key={`${p.kind}-${p.id}`} className="participant-item-mini">
                                        <span>{p.name} {p.kind === 'GUEST' && <small>(G)</small>}</span>
                                        <div className="team-assign-buttons">
                                            {teams.map((_, idx) => (
                                                <button key={idx} onClick={() => moveToTeam(p, idx)}>T{idx + 1}</button>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Teams Container */}
                        <div className="teams-grid">
                            {teams.map((team, idx) => (
                                <div key={idx} className="team-card">
                                    <div className="team-card-header">
                                        <input
                                            type="text"
                                            value={team.name}
                                            onChange={(e) => setTeams(prev => prev.map((t, i) => i === idx ? { ...t, name: e.target.value } : t))}
                                            className="team-name-input"
                                        />
                                    </div>

                                    <div className="team-results">
                                        <div className="res-group">
                                            <label>{t('wins')}</label>
                                            <input type="number" min="0" value={team.wins} onChange={(e) => setTeams(prev => prev.map((t, i) => i === idx ? { ...t, wins: Math.max(0, parseInt(e.target.value) || 0) } : t))} />
                                        </div>
                                        <div className="res-group">
                                            <label>{t('draws')}</label>
                                            <input type="number" min="0" value={team.draws} onChange={(e) => setTeams(prev => prev.map((t, i) => i === idx ? { ...t, draws: Math.max(0, parseInt(e.target.value) || 0) } : t))} />
                                        </div>
                                        <div className="res-group">
                                            <label>{t('losses')}</label>
                                            <input type="number" min="0" value={team.losses} onChange={(e) => setTeams(prev => prev.map((t, i) => i === idx ? { ...t, losses: Math.max(0, parseInt(e.target.value) || 0) } : t))} />
                                        </div>
                                    </div>

                                    <div className="team-members-container">
                                        {team.members.map(m => (
                                            <div key={`${m.kind}-${m.id}`} className="member-item" onClick={() => moveToUnassigned(m)}>
                                                {m.name} &times;
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="modal-footer">
                    <button className="btn-primary" onClick={handleSave} disabled={loading}>
                        {loading ? t('loading') : t('saveStatistics')}
                    </button>
                    <button className="btn-secondary" onClick={onClose}>
                        {t('cancel')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TermStatsModal;
