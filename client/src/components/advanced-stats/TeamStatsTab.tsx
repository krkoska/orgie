import React, { useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import './advanced-stats.css';

interface Player {
    id: string;
    kind: 'USER' | 'GUEST';
    name: string;
}
interface FreqEntry { players: Player[]; count: number; }
interface SuccEntry { players: Player[]; wins: number; total: number; winPct: number; }

export interface TeamStatsData {
    pairsFrequency: FreqEntry[];
    pairsSuccess: SuccEntry[];
    triosFrequency: FreqEntry[];
    triosSuccess: SuccEntry[];
}

interface Props { data: TeamStatsData; }

const INITIAL_SHOW = 3;

const playerKey = (players: Player[]) => players.map(p => `${p.kind}-${p.id}`).join('|');

const PlayerNames: React.FC<{ players: Player[] }> = ({ players }) => (
    <span>{players.map(p => p.name).join(' & ')}</span>
);

const FreqList: React.FC<{ items: FreqEntry[]; color: string }> = ({ items, color }) => {
    const { t } = useLanguage();
    const [expanded, setExpanded] = useState(false);
    const visible = expanded ? items : items.slice(0, INITIAL_SHOW);

    if (items.length === 0) return <p className="as-no-data">{t('noDataYet')}</p>;

    return (
        <div>
            <div className="as-freq-list">
                {visible.map(item => (
                    <div key={playerKey(item.players)} className="as-freq-row">
                        <span className="as-freq-row-name"><PlayerNames players={item.players} /></span>
                        <span className="as-freq-row-count" style={{ color }}>{item.count}×</span>
                    </div>
                ))}
            </div>
            {items.length > INITIAL_SHOW && (
                <button className="as-expand-btn" style={{ color }} onClick={() => setExpanded(e => !e)}>
                    {expanded ? `▲ ${t('hide')}` : `▼ ${t('showAll').replace('{n}', String(items.length))}`}
                </button>
            )}
        </div>
    );
};

const SuccTable: React.FC<{ items: SuccEntry[]; labelKey: string; color: string }> = ({ items, labelKey, color }) => {
    const { t } = useLanguage();
    const [expanded, setExpanded] = useState(false);
    const visible = expanded ? items : items.slice(0, INITIAL_SHOW);

    if (items.length === 0) return <p className="as-no-data">{t('noDataYet')}</p>;

    return (
        <div>
            <div className="as-succ-table-wrap">
                <table className="as-succ-table">
                    <thead>
                        <tr>
                            <th>{t(labelKey)}</th>
                            <th>{t('colWins')}</th>
                            <th>{t('colWinPct')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {visible.map(item => (
                            <tr key={playerKey(item.players)}>
                                <td><PlayerNames players={item.players} /></td>
                                <td>{item.wins}</td>
                                <td>{item.winPct} %</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {items.length > INITIAL_SHOW && (
                <button className="as-expand-btn" style={{ color }} onClick={() => setExpanded(e => !e)}>
                    {expanded ? `▲ ${t('hide')}` : `▼ ${t('showAll').replace('{n}', String(items.length))}`}
                </button>
            )}
        </div>
    );
};

const SectionTitle: React.FC<{ label: string }> = ({ label }) => (
    <h3 className="as-section-title">{label}</h3>
);

const TeamStatsTab: React.FC<Props> = ({ data }) => {
    const { t } = useLanguage();
    return (
        <div className="as-team-tab">
            <div>
                <SectionTitle label={t('mostFreqPairs')} />
                <FreqList items={data.pairsFrequency} color="#3b82f6" />
            </div>
            <div>
                <SectionTitle label={t('mostSuccPairs')} />
                <SuccTable items={data.pairsSuccess} labelKey="colPair" color="#3b82f6" />
            </div>
            <div>
                <SectionTitle label={t('mostFreqTrios')} />
                <FreqList items={data.triosFrequency} color="#8b5cf6" />
            </div>
            <div>
                <SectionTitle label={t('mostSuccTrios')} />
                <SuccTable items={data.triosSuccess} labelKey="colTrio" color="#8b5cf6" />
            </div>
        </div>
    );
};

export default TeamStatsTab;
