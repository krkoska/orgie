import React from 'react';
import { useLanguage } from '../../context/LanguageContext';
import './advanced-stats.css';

interface TimelinePoint {
    date: string;
    week: number;
    month: string;
    attendeeCount: number;
}

interface Props {
    timeline: TimelinePoint[];
}

// SVG coordinate space — rendered size is always 100% of container width via viewBox scaling
const VB_W = 560;
const VB_H = 160;
const PAD_LEFT = 44;
const PAD_RIGHT = 16;
const PAD_TOP = 16;
const PAD_BOTTOM = 52;

const AttendanceChart: React.FC<Props> = ({ timeline }) => {
    const { t } = useLanguage();

    if (timeline.length === 0) {
        return <p className="as-chart-no-data">{t('noDataYet')}</p>;
    }

    const counts = timeline.map(p => p.attendeeCount);
    const minC = Math.min(...counts);
    const maxC = Math.max(...counts);
    const range = maxC - minC || 1;

    const chartW = VB_W - PAD_LEFT - PAD_RIGHT;
    const chartH = VB_H - PAD_TOP - PAD_BOTTOM;

    const xOf = (i: number) => PAD_LEFT + (i / (timeline.length - 1 || 1)) * chartW;
    const yOf = (c: number) => PAD_TOP + chartH - ((c - minC) / range) * chartH;

    const smoothPath = (pts: { x: number; y: number }[]): string => {
        if (pts.length === 1) return `M ${pts[0].x},${pts[0].y}`;
        let d = `M ${pts[0].x},${pts[0].y}`;
        for (let i = 1; i < pts.length; i++) {
            const prev = pts[i - 1];
            const curr = pts[i];
            const cpX = (prev.x + curr.x) / 2;
            d += ` C ${cpX},${prev.y} ${cpX},${curr.y} ${curr.x},${curr.y}`;
        }
        return d;
    };

    const pts = timeline.map((p, i) => ({ x: xOf(i), y: yOf(p.attendeeCount) }));
    const linePath = smoothPath(pts);
    const areaPath = `${linePath} L ${pts[pts.length - 1].x},${PAD_TOP + chartH} L ${pts[0].x},${PAD_TOP + chartH} Z`;

    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
    const avgY = yOf(avg);

    const yLabels = Array.from(new Set([minC, Math.round(avg), maxC])).sort((a, b) => a - b);

    const monthGroups: { month: string; startX: number; endX: number }[] = [];
    let curMonth = '';
    let startIdx = 0;
    timeline.forEach((p, i) => {
        if (p.month !== curMonth) {
            if (curMonth !== '') monthGroups.push({ month: curMonth, startX: xOf(startIdx), endX: xOf(i - 1) });
            curMonth = p.month;
            startIdx = i;
        }
    });
    monthGroups.push({ month: curMonth, startX: xOf(startIdx), endX: xOf(timeline.length - 1) });

    return (
        <svg className="as-chart" viewBox={`0 0 ${VB_W} ${VB_H}`} xmlns="http://www.w3.org/2000/svg">
            {/* Grid */}
            {yLabels.map(v => (
                <line key={v} x1={PAD_LEFT} x2={VB_W - PAD_RIGHT} y1={yOf(v)} y2={yOf(v)}
                    stroke="#f3f4f6" strokeWidth="1" strokeDasharray="4,3" />
            ))}

            {/* Axes */}
            <line x1={PAD_LEFT} x2={PAD_LEFT} y1={PAD_TOP} y2={PAD_TOP + chartH} stroke="#e5e7eb" strokeWidth="1" />
            <line x1={PAD_LEFT} x2={VB_W - PAD_RIGHT} y1={PAD_TOP + chartH} y2={PAD_TOP + chartH} stroke="#e5e7eb" strokeWidth="1" />

            {/* Y labels */}
            {yLabels.map(v => (
                <text key={v} x={PAD_LEFT - 6} y={yOf(v) + 4} textAnchor="end" fontSize="10" fill="#9ca3af">{v}</text>
            ))}

            {/* Area + line */}
            <path d={areaPath} fill="#3b82f6" fillOpacity="0.10" />
            <path d={linePath} fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" />

            {/* Dots */}
            {pts.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={4} fill="white" stroke="#3b82f6" strokeWidth="2" />
            ))}

            {/* Average line */}
            <line x1={PAD_LEFT} x2={VB_W - PAD_RIGHT} y1={avgY} y2={avgY}
                stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="5,3" />
            <text x={PAD_LEFT + 4} y={avgY - 4} fontSize="9" fill="#f59e0b">
                {t('avgAttendance')} {avg.toFixed(1).replace('.', ',')}
            </text>

            {/* X — week labels */}
            {timeline.map((p, i) => (
                <text key={i} x={xOf(i)} y={PAD_TOP + chartH + 14} textAnchor="middle" fontSize="8" fill="#9ca3af">
                    T{p.week}
                </text>
            ))}

            {/* X — month brackets */}
            {monthGroups.map((g, i) => {
                const midX = (g.startX + g.endX) / 2;
                const bracketY = PAD_TOP + chartH + 24;
                return (
                    <g key={i}>
                        <line x1={g.startX} x2={g.endX} y1={bracketY} y2={bracketY} stroke="#d1d5db" strokeWidth="1" />
                        {i + 1 < monthGroups.length && (
                            <line x1={g.endX} x2={g.endX} y1={bracketY} y2={bracketY - 4} stroke="#d1d5db" strokeWidth="1" />
                        )}
                        <text x={midX} y={bracketY + 14} textAnchor="middle" fontSize="9" fill="#6b7280" fontWeight="600">
                            {g.month}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
};

export default React.memo(AttendanceChart);
