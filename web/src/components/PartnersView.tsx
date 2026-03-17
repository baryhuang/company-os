import { useState, useMemo, useEffect } from 'react';
import type { TreeNode } from '../types';
import { TimelineBar, collectDates, parseDateOrdinal } from './MarkmapView';
import './partners-view.css';

/* ── Flatten tree into partner rows ──────────────── */

interface PartnerRow {
  name: string;
  tier: string;
  status?: string;
  date?: string;
  desc?: string;
  strategic_fit?: number;
  team_priority?: number;
  strategic_rationale?: string;
  deal_sponsors?: string;
  ideal_referrer?: string;
  key_contacts?: string;
  acquisition_history?: string;
  in_contact?: boolean;
  rto_risk?: string;
  notes?: string;
}

function flattenPartners(tree: TreeNode): PartnerRow[] {
  const rows: PartnerRow[] = [];
  for (const tier of tree.children || []) {
    // Skip methodology nodes (they have no partner children with strategic_fit)
    const partners = tier.children || [];
    for (const p of partners) {
      const raw = p as unknown as Record<string, unknown>;
      rows.push({
        name: p.name,
        tier: tier.name,
        status: p.status,
        date: p.date,
        desc: p.desc,
        strategic_fit: raw.strategic_fit as number | undefined,
        team_priority: raw.team_priority as number | undefined,
        strategic_rationale: raw.strategic_rationale as string | undefined,
        deal_sponsors: raw.deal_sponsors as string | undefined,
        ideal_referrer: raw.ideal_referrer as string | undefined,
        key_contacts: raw.key_contacts as string | undefined,
        acquisition_history: raw.acquisition_history as string | undefined,
        in_contact: raw.in_contact as boolean | undefined,
        rto_risk: raw.rto_risk as string | undefined,
        notes: raw.notes as string | undefined,
      });
    }
  }
  return rows;
}

/* ── Status badge ────────────────────────────────── */

const STATUS_LABELS: Record<string, string> = {
  final: 'Active', chosen: 'Target', partial: 'Research', origin: 'Identified',
};
const STATUS_CLASS: Record<string, string> = {
  final: 'st-active', chosen: 'st-target', partial: 'st-research', origin: 'st-identified',
};

/* ── Fit label ───────────────────────────────────── */

function fitLabel(v?: number) {
  if (v === 1) return 'High';
  if (v === 2) return 'Medium';
  if (v === 3) return 'Low';
  return '—';
}
function fitClass(v?: number) {
  if (v === 1) return 'fit-high';
  if (v === 2) return 'fit-med';
  return 'fit-low';
}

/* ── Detail Modal ────────────────────────────────── */

function DetailModal({ row, onClose }: { row: PartnerRow; onClose: () => void }) {
  return (
    <div className="partner-modal-overlay" onClick={onClose}>
      <div className="partner-modal" onClick={e => e.stopPropagation()}>
        <div className="partner-modal-header">
          <h3>{row.name}</h3>
          <div className="partner-modal-meta">
            <span className={`partner-status ${STATUS_CLASS[row.status || ''] || ''}`}>
              {STATUS_LABELS[row.status || ''] || row.status || ''}
            </span>
            {row.in_contact && <span className="partner-contact-badge">In Contact</span>}
          </div>
          <button className="partner-modal-close" onClick={onClose}>{'\u2715'}</button>
        </div>

        <div className="partner-modal-body">
          {row.desc && <div className="pm-section"><h4>Description</h4><p>{row.desc}</p></div>}
          {row.strategic_rationale && <div className="pm-section"><h4>Strategic Rationale</h4><p>{row.strategic_rationale}</p></div>}
          {row.deal_sponsors && <div className="pm-section"><h4>Deal Sponsors</h4><p>{row.deal_sponsors}</p></div>}
          {row.key_contacts && <div className="pm-section"><h4>Key Contacts</h4><p>{row.key_contacts}</p></div>}
          {row.ideal_referrer && <div className="pm-section"><h4>Ideal Referrer</h4><p>{row.ideal_referrer}</p></div>}
          {row.acquisition_history && <div className="pm-section"><h4>Acquisition History</h4><p>{row.acquisition_history}</p></div>}
          {row.rto_risk && <div className="pm-section"><h4>RTO Risk</h4><p>{row.rto_risk}</p></div>}
          {row.notes && <div className="pm-section"><h4>Notes</h4><p>{row.notes}</p></div>}
        </div>
      </div>
    </div>
  );
}

/* ── CSV Export ───────────────────────────────────── */

const CSV_COLS: { header: string; fn: (r: PartnerRow) => string }[] = [
  { header: 'Name', fn: r => r.name },
  { header: 'Tier', fn: r => r.tier },
  { header: 'Status', fn: r => STATUS_LABELS[r.status || ''] || r.status || '' },
  { header: 'Strategic Fit', fn: r => fitLabel(r.strategic_fit) },
  { header: 'Team Priority', fn: r => fitLabel(r.team_priority) },
  { header: 'In Contact', fn: r => r.in_contact ? 'Yes' : 'No' },
  { header: 'Description', fn: r => r.desc || '' },
  { header: 'Strategic Rationale', fn: r => r.strategic_rationale || '' },
  { header: 'Deal Sponsors', fn: r => r.deal_sponsors || '' },
  { header: 'Key Contacts', fn: r => r.key_contacts || '' },
  { header: 'Ideal Referrer', fn: r => r.ideal_referrer || '' },
  { header: 'Acquisition History', fn: r => r.acquisition_history || '' },
  { header: 'Notes', fn: r => r.notes || '' },
];

function escapeCsv(s: string) {
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function exportCsv(rows: PartnerRow[]) {
  const header = CSV_COLS.map(c => c.header).join(',');
  const body = rows.map(r => CSV_COLS.map(c => escapeCsv(c.fn(r))).join(',')).join('\n');
  const blob = new Blob([header + '\n' + body], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'strategic_partners.csv';
  a.click();
  URL.revokeObjectURL(url);
}

/* ── Sort ─────────────────────────────────────────── */

type SortCol = 'name' | 'tier' | 'status' | 'fit' | 'priority' | 'contact';

/* ── Main Component ──────────────────────────────── */

export function PartnersView({ treeData }: { treeData: TreeNode }) {
  const allDates = useMemo(() => collectDates(treeData), [treeData]);
  const [startIndex, setStartIndex] = useState(0);
  const [endIndex, setEndIndex] = useState(allDates.length - 1);

  useEffect(() => {
    setStartIndex(0);
    setEndIndex(allDates.length - 1);
  }, [allDates]);

  const startCutoff = allDates[startIndex] ?? 0;
  const endCutoff = allDates[endIndex] ?? Infinity;

  const rows = useMemo(() => {
    const all = flattenPartners(treeData);
    if (endCutoff === Infinity && startCutoff === 0) return all;
    return all.filter(r => {
      const ord = parseDateOrdinal(r.date || '');
      return ord === null || (ord >= startCutoff && ord <= endCutoff);
    });
  }, [treeData, startCutoff, endCutoff]);

  const [sortCol, setSortCol] = useState<SortCol>('fit');
  const [sortAsc, setSortAsc] = useState(true);
  const [selected, setSelected] = useState<PartnerRow | null>(null);
  const [tierFilter, setTierFilter] = useState<string>('all');

  const tiers = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) s.add(r.tier);
    return Array.from(s);
  }, [rows]);

  const filtered = useMemo(() => {
    if (tierFilter === 'all') return rows;
    return rows.filter(r => r.tier === tierFilter);
  }, [rows, tierFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp: number;
      switch (sortCol) {
        case 'name': cmp = a.name.localeCompare(b.name); break;
        case 'tier': cmp = a.tier.localeCompare(b.tier); break;
        case 'status': cmp = (a.status || '').localeCompare(b.status || ''); break;
        case 'fit': cmp = (a.strategic_fit ?? 9) - (b.strategic_fit ?? 9); break;
        case 'priority': cmp = (a.team_priority ?? 9) - (b.team_priority ?? 9); break;
        case 'contact': cmp = (a.in_contact ? 0 : 1) - (b.in_contact ? 0 : 1); break;
        default: cmp = 0;
      }
      return sortAsc ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortCol, sortAsc]);

  function handleSort(col: SortCol) {
    if (sortCol === col) setSortAsc(!sortAsc);
    else { setSortCol(col); setSortAsc(true); }
  }

  function arrow(col: SortCol) {
    if (sortCol !== col) return '';
    return sortAsc ? ' \u25B2' : ' \u25BC';
  }

  return (
    <div className="partners-view">
      <div className="partners-scroll">
        <div className="partners-header">
          <h2>{treeData.name}</h2>
          <p>{treeData.desc}</p>
        </div>

        <div className="partners-toolbar">
          <span className="partners-count">{sorted.length} partners</span>
          <select className="tier-filter" value={tierFilter} onChange={e => setTierFilter(e.target.value)}>
            <option value="all">All Tiers</option>
            {tiers.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <button className="partners-export-btn" onClick={() => exportCsv(sorted)}>Export CSV</button>
        </div>

        <div className="partners-table-wrap">
          <table className="partners-table">
            <thead>
              <tr>
                <th onClick={() => handleSort('name')}>Company{arrow('name')}</th>
                <th onClick={() => handleSort('tier')}>Tier{arrow('tier')}</th>
                <th onClick={() => handleSort('status')}>Status{arrow('status')}</th>
                <th onClick={() => handleSort('fit')}>Strategic Fit{arrow('fit')}</th>
                <th onClick={() => handleSort('priority')}>Team Priority{arrow('priority')}</th>
                <th onClick={() => handleSort('contact')}>Contact{arrow('contact')}</th>
                <th>Deal Sponsors</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr key={i} onClick={() => setSelected(r)} className="partner-row-clickable">
                  <td className="col-name">{r.name}</td>
                  <td className="col-tier" data-label="Tier">{r.tier.replace(/^Tier \d+:\s*/, '')}</td>
                  <td data-label="Status">
                    <span className={`partner-status ${STATUS_CLASS[r.status || ''] || ''}`}>
                      {STATUS_LABELS[r.status || ''] || r.status || '—'}
                    </span>
                  </td>
                  <td data-label="Fit"><span className={`fit-badge ${fitClass(r.strategic_fit)}`}>{fitLabel(r.strategic_fit)}</span></td>
                  <td data-label="Priority"><span className={`fit-badge ${fitClass(r.team_priority)}`}>{fitLabel(r.team_priority)}</span></td>
                  <td data-label="Contact">{r.in_contact ? '\u2705' : ''}</td>
                  <td className="col-sponsors" data-label="Sponsors">{r.deal_sponsors || '—'}</td>
                  <td className="col-notes" data-label="Notes">{r.desc ? r.desc.slice(0, 80) + (r.desc.length > 80 ? '...' : '') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <TimelineBar allDates={allDates} startIndex={startIndex} endIndex={endIndex} setStartIndex={setStartIndex} setEndIndex={setEndIndex} />

      {selected && <DetailModal row={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
