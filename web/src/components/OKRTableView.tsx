import { useMemo, useState } from 'react';
import type { TreeNode } from '../types';
import { statusColors } from './MarkmapView';

interface OKRTableViewProps {
  treeData: TreeNode;
}

/* ── Helpers to read extra fields spread onto TreeNode ── */
type NodeAny = TreeNode & Record<string, unknown>;

const WEEKS = ['w1','w2','w3','w4','w5','w6','w7','w8','w9','w10','w11','w12','w13'] as const;
const WEEK_LABELS = ['W1','W2','W3','W4','W5','W6','W7','W8','W9','W10','W11','W12','W13'];

type OKRTab = 'okrs' | 'kpi' | 'experiments';

/* ── KPI section ── */
interface KPIRow {
  num: number;
  name: string;
  definition: string;
  weeks: string[]; // 13 values
}

function extractKPIs(section: TreeNode): KPIRow[] {
  return (section.children || []).map((child, i) => {
    const n = child as NodeAny;
    const label = child.name.replace(/^KPI\s*\d+:\s*/i, '');
    return {
      num: i + 1,
      name: label,
      definition: (n.definition as string) || '',
      weeks: WEEKS.map(w => String(n[w] ?? '')),
    };
  });
}

/* ── Experiments section ── */
interface ExperimentRow {
  hypothesis: string;
  observation: string;
  proven: string;
  why: string;
  ranking: number;
  experiment: string;
  metric: string;
  threshold: string;
  owner: string;
  status: string;
}

function extractExperiments(section: TreeNode): ExperimentRow[] {
  return (section.children || []).map(child => {
    const n = child as NodeAny;
    return {
      hypothesis: child.name.replace(/^Exp\s*\d+:\s*/i, ''),
      observation: (n.observation as string) || '',
      proven: (n.proven_unproven as string) || '',
      why: (n.why as string) || '',
      ranking: (n.ranking as number) || 0,
      experiment: (n.experiment as string) || '',
      metric: (n.metric as string) || '',
      threshold: (n.threshold as string) || '',
      owner: (n.owner as string) || '',
      status: child.status || '',
    };
  }).sort((a, b) => a.ranking - b.ranking);
}

/* ── OKR weekly actions ── */
interface WeekAction {
  week: string;
  action: string;
  status: string;
  date?: string;
}

interface OKRGroup {
  name: string;
  kpis: string[];
  weeks: WeekAction[];
}

function extractOKRs(root: TreeNode): { kpiSection: TreeNode | null; expSection: TreeNode | null; okrs: OKRGroup[] } {
  let kpiSection: TreeNode | null = null;
  let expSection: TreeNode | null = null;
  const okrs: OKRGroup[] = [];

  for (const child of root.children || []) {
    const id = child.name.toLowerCase();
    if (id.includes('kpi') && id.includes('weekly')) {
      kpiSection = child;
    } else if (id.includes('experiment')) {
      expSection = child;
    } else if (/^okr\s*\d/i.test(child.name)) {
      const kpis: string[] = [];
      const weeks: WeekAction[] = [];
      for (const sub of child.children || []) {
        if (/^W\d+/i.test(sub.name)) {
          const label = sub.name.replace(/^W\d+:\s*/, '');
          weeks.push({
            week: sub.name.match(/^W\d+/i)?.[0] || sub.name,
            action: label,
            status: sub.status || '',
            date: sub.date || undefined,
          });
        } else {
          kpis.push(sub.name);
        }
      }
      weeks.sort((a, b) => {
        const na = parseInt(a.week.replace(/\D/g, ''));
        const nb = parseInt(b.week.replace(/\D/g, ''));
        return na - nb;
      });
      okrs.push({ name: child.name, kpis, weeks });
    }
  }

  return { kpiSection, expSection, okrs };
}

/* ── Status pill component ── */
function StatusPill({ status }: { status: string }) {
  if (!status) return <span className="okr-status-pill empty">{'\u2014'}</span>;
  const color = statusColors[status] || '#8a9e8c';
  return (
    <span
      className="okr-status-pill"
      style={{ background: `${color}18`, color, borderColor: `${color}40` }}
    >
      {status}
    </span>
  );
}

function ProvenBadge({ value }: { value: string }) {
  if (!value) return <span>{'\u2014'}</span>;
  const isProven = value.toLowerCase() === 'proven';
  const color = isProven ? 'var(--green)' : 'var(--orange)';
  const bg = isProven ? 'var(--green-light)' : 'var(--orange-light)';
  return (
    <span className="okr-proven-badge" style={{ background: bg, color }}>
      {value}
    </span>
  );
}

const TAB_CONFIG: { key: OKRTab; label: string }[] = [
  { key: 'okrs', label: "OKR's" },
  { key: 'kpi', label: 'KPI' },
  { key: 'experiments', label: "Experiments / Hyp's" },
];

/* ── Main component ── */
export function OKRTableView({ treeData }: OKRTableViewProps) {
  const { kpiSection, expSection, okrs } = useMemo(() => extractOKRs(treeData), [treeData]);
  const kpiRows = useMemo(() => kpiSection ? extractKPIs(kpiSection) : [], [kpiSection]);
  const expRows = useMemo(() => expSection ? extractExperiments(expSection) : [], [expSection]);
  const [tab, setTab] = useState<OKRTab>('okrs');

  return (
    <div className="okr-table-view">
      <div className="view-tabs">
        {TAB_CONFIG.map(t => (
          <button
            key={t.key}
            className={`tab-btn${tab === t.key ? ' active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="okr-scroll">

        {/* ── OKR's tab ── */}
        {tab === 'okrs' && (
          <>
            {okrs.map((g, i) => (
              <div key={i} className="okr-group">
                <div className="okr-group-header">
                  <h3>{g.name}</h3>
                  {g.kpis.length > 0 && (
                    <div className="okr-kpi-list">
                      {g.kpis.map((k, j) => (
                        <span key={j} className="okr-kpi-chip">{k}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="landscape-table-wrap">
                  <table className="landscape-table okr-table">
                    <thead>
                      <tr>
                        <th>Week</th>
                        <th>Action</th>
                        <th>Status</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.weeks.length > 0 ? (
                        g.weeks.map((w, j) => (
                          <tr key={j}>
                            <td className="col-name">{w.week}</td>
                            <td>{w.action}</td>
                            <td><StatusPill status={w.status} /></td>
                            <td className="okr-date-col">{w.date || '\u2014'}</td>
                          </tr>
                        ))
                      ) : (
                        <tr><td colSpan={4} className="okr-empty">No weekly entries</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
            {okrs.length === 0 && (
              <div className="okr-empty-state">No OKR data available</div>
            )}
          </>
        )}

        {/* ── KPI tab ── */}
        {tab === 'kpi' && (
          <div className="okr-group">
            <div className="okr-group-header">
              <h3>KPIs (Weekly Tracking)</h3>
            </div>
            {kpiRows.length > 0 ? (
              <div className="landscape-table-wrap okr-kpi-scroll">
                <table className="landscape-table okr-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>KPI</th>
                      <th>Definition</th>
                      {WEEK_LABELS.map(w => <th key={w}>{w}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {kpiRows.map((row, i) => (
                      <tr key={i}>
                        <td className="col-name">{row.num}</td>
                        <td className="col-name">{row.name}</td>
                        <td className="okr-def-col">{row.definition || '\u2014'}</td>
                        {row.weeks.map((v, j) => (
                          <td key={j} className="okr-week-cell">{v || '\u2014'}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="okr-empty-state">No KPI data available</div>
            )}
          </div>
        )}

        {/* ── Experiments / Hyp's tab ── */}
        {tab === 'experiments' && (
          <div className="okr-group">
            <div className="okr-group-header">
              <h3>Experiments & Hypotheses</h3>
            </div>
            {expRows.length > 0 ? (
              <div className="landscape-table-wrap okr-kpi-scroll">
                <table className="landscape-table okr-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Observation</th>
                      <th>Hypothesis</th>
                      <th>Status</th>
                      <th>Why</th>
                      <th>Experiment</th>
                      <th>Metric</th>
                      <th>Threshold</th>
                      <th>Owner</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expRows.map((row, i) => (
                      <tr key={i}>
                        <td className="col-name">{row.ranking || i + 1}</td>
                        <td className="okr-obs-col">{row.observation || '\u2014'}</td>
                        <td className="okr-hyp-col">{row.hypothesis}</td>
                        <td><ProvenBadge value={row.proven} /></td>
                        <td className="okr-why-col">{row.why || '\u2014'}</td>
                        <td className="okr-exp-col">{row.experiment || '\u2014'}</td>
                        <td>{row.metric || '\u2014'}</td>
                        <td>{row.threshold || '\u2014'}</td>
                        <td>{row.owner || '\u2014'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="okr-empty-state">No experiment data available</div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
