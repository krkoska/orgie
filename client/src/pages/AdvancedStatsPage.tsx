import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import api from '../services/api';
import TeamStatsTab from '../components/advanced-stats/TeamStatsTab';
import type { TeamStatsData } from '../components/advanced-stats/TeamStatsTab';
import AttendanceTab from '../components/advanced-stats/AttendanceTab';
import type { AttendanceData } from '../components/advanced-stats/AttendanceTab';
import './AdvancedStatsPage.css';

type TabKey = 'team' | 'attendance';

interface TabDataMap {
    team?: TeamStatsData;
    attendance?: AttendanceData;
}

interface TabDef {
    key: TabKey;
    labelKey: string;
    teamSportOnly: boolean;
}

const TABS: TabDef[] = [
    { key: 'team',       labelKey: 'teamStats',     teamSportOnly: true },
    { key: 'attendance', labelKey: 'attendanceTab', teamSportOnly: false },
];

interface Season { name: string; startDate: string; endDate?: string; }

const AdvancedStatsPage: React.FC = () => {
    const { uuid } = useParams<{ uuid: string }>();
    const { t, language } = useLanguage();

    const [activityType, setActivityType] = useState<string | null>(null);
    const [eventName, setEventName] = useState<string>('');
    const [seasons, setSeasons] = useState<Season[]>([]);
    const [selectedSeasonIdx, setSelectedSeasonIdx] = useState<number | null>(null);
    const [eventLoaded, setEventLoaded] = useState(false);

    const [activeTab, setActiveTab] = useState<TabKey | null>(null);
    const [tabData, setTabData] = useState<Partial<TabDataMap>>({});
    const [tabLoading, setTabLoading] = useState<Record<string, boolean>>({});
    const [tabError, setTabError] = useState<Record<string, string>>({});

    React.useEffect(() => {
        if (!uuid) return;
        api.get(`/events/uuid/${uuid}`).then(({ data }) => {
            const ev = data.event;
            setActivityType(ev.activityType || null);
            setEventName(ev.name || '');
            const evSeasons: Season[] = ev.seasons || [];
            setSeasons(evSeasons);
            const defaultIdx = evSeasons.length > 0 ? evSeasons.length - 1 : null;
            setSelectedSeasonIdx(defaultIdx);
            setEventLoaded(true);
            const firstTab = ev.activityType === 'TEAM_SPORT' ? 'team' : 'attendance';
            setActiveTab(firstTab as TabKey);
            fetchTab(firstTab as TabKey, ev.activityType, defaultIdx);
        });
    }, [uuid]);

    // Invalidate attendance cache on language change and re-fetch if active
    React.useEffect(() => {
        setTabData(prev => ({ ...prev, attendance: undefined }));
        if (activeTab === 'attendance') doFetch('attendance', selectedSeasonIdx, activityType);
    }, [language]);

    const doFetch = async (tab: TabKey, seasonIdx: number | null, activity: string | null) => {
        if (tab === 'team' && activity !== 'TEAM_SPORT') return;
        setTabLoading(prev => ({ ...prev, [tab]: true }));
        try {
            const parts: string[] = [];
            if (seasonIdx !== null) parts.push(`seasonIdx=${seasonIdx}`);
            if (tab === 'attendance') parts.push(`lang=${language}`);
            const query = parts.length ? `?${parts.join('&')}` : '';
            const { data } = await api.get(`/events/uuid/${uuid}/advanced-stats/${tab}${query}`);
            setTabData(prev => ({ ...prev, [tab]: data }));
        } catch (e: any) {
            setTabError(prev => ({ ...prev, [tab]: e.response?.data?.message || 'Error' }));
        } finally {
            setTabLoading(prev => ({ ...prev, [tab]: false }));
        }
    };

    const fetchTab = (tab: TabKey, overrideActivity?: string, overrideSeasonIdx?: number | null) => {
        const activity = overrideActivity ?? activityType;
        const seasonIdx = overrideSeasonIdx !== undefined ? overrideSeasonIdx : selectedSeasonIdx;
        if (tabData[tab] || tabLoading[tab]) return;
        doFetch(tab, seasonIdx, activity);
    };

    const handleTabClick = (tab: TabKey) => {
        setActiveTab(tab);
        fetchTab(tab);
    };

    const handleSeasonChange = (idx: number | null) => {
        setSelectedSeasonIdx(idx);
        setTabData({});
        setTabError({});
        if (activeTab) doFetch(activeTab, idx, activityType);
    };

    const visibleTabs = TABS.filter(tab => !tab.teamSportOnly || activityType === 'TEAM_SPORT');

    return (
        <div className="asp-page">
            <div className="asp-header">
                <Link to={`/event/${uuid}`} className="asp-back-link">
                    <ArrowLeft size={18} />
                </Link>
                <h2 className="asp-title">
                    {t('advancedStats')}{eventName ? ` — ${eventName}` : ''}
                </h2>
            </div>

            {!eventLoaded ? (
                <p className="asp-loading">{t('loading')}</p>
            ) : (
                <>
                    {seasons.length > 0 && (
                        <div className="asp-season-select">
                            <select
                                value={selectedSeasonIdx ?? ''}
                                onChange={e => handleSeasonChange(e.target.value === '' ? null : Number(e.target.value))}
                            >
                                {seasons.map((s, idx) => (
                                    <option key={idx} value={idx}>{s.name}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div className="asp-tab-bar">
                        {visibleTabs.map(tab => (
                            <button
                                key={tab.key}
                                className={`asp-tab-btn${activeTab === tab.key ? ' active' : ''}`}
                                onClick={() => handleTabClick(tab.key)}
                            >
                                {t(tab.labelKey)}
                            </button>
                        ))}
                    </div>

                    {activeTab && (
                        <div>
                            {tabLoading[activeTab] && <p className="asp-loading">{t('loading')}</p>}
                            {tabError[activeTab] && <p className="asp-error">{tabError[activeTab]}</p>}
                            {!tabLoading[activeTab] && !tabError[activeTab] && (
                                <>
                                    {activeTab === 'team' && tabData.team && <TeamStatsTab data={tabData.team} />}
                                    {activeTab === 'attendance' && tabData.attendance && <AttendanceTab data={tabData.attendance} />}
                                </>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default AdvancedStatsPage;
