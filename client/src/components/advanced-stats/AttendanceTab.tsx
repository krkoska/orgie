import React from 'react';
import { useLanguage } from '../../context/LanguageContext';
import AttendanceChart from './AttendanceChart';
import './advanced-stats.css';

interface TimelinePoint { date: string; week: number; month: string; attendeeCount: number; }
interface PlayerCountEntry { count: number; terms: number; }
interface TeamCountEntry { teams: number; terms: number; }

export interface AttendanceData {
    timeline: TimelinePoint[];
    byPlayerCount: PlayerCountEntry[];
    byTeamCount: TeamCountEntry[];
}

interface Props { data: AttendanceData; }

const SectionTitle: React.FC<{ label: string }> = ({ label }) => (
    <h3 className="as-section-title">{label}</h3>
);

const BarList: React.FC<{ items: { label: string; value: number }[]; color: string }> = ({ items, color }) => {
    const max = Math.max(...items.map(i => i.value), 1);
    return (
        <div className="as-bar-list">
            {items.map((item, i) => (
                <div key={i} className="as-bar-row">
                    <span className="as-bar-row-label">{item.label}</span>
                    <div className="as-bar-track">
                        <div
                            className="as-bar-fill"
                            style={{ width: `${(item.value / max) * 100}%`, background: color }}
                        />
                    </div>
                    <span className="as-bar-row-value" style={{ color }}>{item.value}×</span>
                </div>
            ))}
        </div>
    );
};

const AttendanceTab: React.FC<Props> = ({ data }) => {
    const { t } = useLanguage();

    const playerItems = data.byPlayerCount.map(e => ({
        label: `${e.count} ${t('players')}`,
        value: e.terms,
    }));

    const teamItems = data.byTeamCount.map(e => ({
        label: `${e.teams} ${t('teams')}`,
        value: e.terms,
    }));

    return (
        <div className="as-attendance-tab">
            <div>
                <SectionTitle label={t('attendanceChart')} />
                <AttendanceChart timeline={data.timeline} />
            </div>
            <div>
                <SectionTitle label={t('attendanceByPlayers')} />
                {playerItems.length === 0
                    ? <p className="as-no-data">{t('noDataYet')}</p>
                    : <BarList items={playerItems} color="#3b82f6" />
                }
            </div>
            {data.byTeamCount.length > 0 && (
                <div>
                    <SectionTitle label={t('attendanceByTeams')} />
                    <BarList items={teamItems} color="#8b5cf6" />
                </div>
            )}
        </div>
    );
};

export default AttendanceTab;
