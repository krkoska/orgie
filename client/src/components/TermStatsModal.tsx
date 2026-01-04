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
                members: it.members.map(m => {
                    const found = participants.find(p => p.id === m.id && p.kind === m.kind);
                    return found || { ...m, name: '???' };
                })
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
        // Resets teams if number changes significantly? 
        // For simplicity, let's just adjust the array length
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
        // Remove from unassigned
        setUnassigned(prev => prev.filter(p => p.id !== participant.id || p.kind !== participant.kind));
        // Remove from any other team
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

    return (
        <div className="modal-overlay">
            <div className="modal-content stats-modal" style={{ maxWidth: '900px', width: '95%' }}>
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
                            style={{ width: '80px' }}
                        />
                    </div>

                    <div className="stats-layout" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
                        {/* Unassigned List */}
                        <div className="unassigned-container">
                            <h3>{t('participants')} ({unassigned.length})</h3>
                            <div className="participant-list" style={{ border: '1px solid #ddd', borderRadius: '4px', padding: '0.5rem', minHeight: '200px', maxHeight: '400px', overflowY: 'auto' }}>
                                {unassigned.map(p => (
                                    <div key={`${p.kind}-${p.id}`} className="participant-item-mini" style={{ padding: '4px 8px', margin: '4px 0', background: '#f0f0f0', borderRadius: '4px', fontSize: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span>{p.name} {p.kind === 'GUEST' && <small>(G)</small>}</span>
                                        <div className="team-assign-buttons">
                                            {teams.map((_, idx) => (
                                                <button key={idx} onClick={() => moveToTeam(p, idx)} style={{ padding: '2px 6px', marginLeft: '2px' }}>T{idx + 1}</button>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Teams Container */}
                        <div className="teams-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
                            {teams.map((team, idx) => (
                                <div key={idx} className="team-card" style={{ border: '1px solid var(--primary-color)', borderRadius: '8px', padding: '0.75rem', background: 'rgba(0,0,0,0.02)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                        <input
                                            type="text"
                                            value={team.name}
                                            onChange={(e) => setTeams(prev => prev.map((t, i) => i === idx ? { ...t, name: e.target.value } : t))}
                                            style={{ fontWeight: 'bold', border: 'none', background: 'transparent', width: '150px' }}
                                        />
                                    </div>

                                    <div className="team-results" style={{ display: 'flex', gap: '8px', marginBottom: '0.75rem' }}>
                                        <div className="res-group">
                                            <label style={{ fontSize: '11px', display: 'block', color: '#666' }}>{t('wins')}</label>
                                            <input type="number" value={team.wins} onChange={(e) => setTeams(prev => prev.map((t, i) => i === idx ? { ...t, wins: parseInt(e.target.value) || 0 } : t))} style={{ width: '60px', textAlign: 'center', padding: '4px', fontSize: '16px', fontWeight: 'bold' }} />
                                        </div>
                                        <div className="res-group">
                                            <label style={{ fontSize: '11px', display: 'block', color: '#666' }}>{t('draws')}</label>
                                            <input type="number" value={team.draws} onChange={(e) => setTeams(prev => prev.map((t, i) => i === idx ? { ...t, draws: parseInt(e.target.value) || 0 } : t))} style={{ width: '60px', textAlign: 'center', padding: '4px', fontSize: '16px', fontWeight: 'bold' }} />
                                        </div>
                                        <div className="res-group">
                                            <label style={{ fontSize: '11px', display: 'block', color: '#666' }}>{t('losses')}</label>
                                            <input type="number" value={team.losses} onChange={(e) => setTeams(prev => prev.map((t, i) => i === idx ? { ...t, losses: parseInt(e.target.value) || 0 } : t))} style={{ width: '60px', textAlign: 'center', padding: '4px', fontSize: '16px', fontWeight: 'bold' }} />
                                        </div>
                                    </div>

                                    <div className="team-members" style={{ minHeight: '60px', background: 'white', padding: '4px', borderRadius: '4px', border: '1px solid #eee' }}>
                                        {team.members.map(m => (
                                            <div key={`${m.kind}-${m.id}`} className="member-item" onClick={() => moveToUnassigned(m)} style={{ padding: '2px 6px', margin: '2px', background: '#eef', borderRadius: '4px', display: 'inline-block', fontSize: '12px', cursor: 'pointer' }}>
                                                {m.name} &times;
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="modal-footer" style={{ justifyContent: 'flex-start' }}>
                    <button className="btn-primary" onClick={handleSave} disabled={loading}>
                        {loading ? t('loading') : t('saveStatistics')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TermStatsModal;
