import { useState, useRef, useCallback, useMemo } from 'react';
import type { LandscapeData, CompetitorRow, AIQueryResult } from '../types';
import { parseDateOrdinal, TimelineBar } from './MarkmapView';
import { queryCompetitorsAI } from '../api';

interface CompetitorViewProps {
  data: LandscapeData;
}

/* ── Tooltip ────────────────────────────────────────────── */

interface TooltipState {
  row: CompetitorRow;
  x: number;
  y: number;
}

function CompanyTooltip({ row, x, y }: TooltipState) {
  return (
    <div className="landscape-tooltip visible" style={{ left: x, top: y }}>
      <div className="lt-header">
        <h4>{row.name}</h4>
        {row.website && <a className="lt-url" href={`https://${row.website}`} target="_blank" rel="noopener noreferrer">{row.website}</a>}
      </div>
      {row.primary_focus && <p className="lt-focus">{row.primary_focus}</p>}

      <div className="lt-tags">
        <span className={`threat-badge ${row.threat}`}>{row.threat} threat</span>
        {row.uses_ai && <span className="lt-tag ai">AI</span>}
        {row.serves_cna && <span className="lt-tag cna">CNA</span>}
        {row.serves_rn && <span className="lt-tag rn">RN</span>}
      </div>

      <dl className="lt-details">
        {row.target_customer && <><dt>Target</dt><dd>{row.target_customer}</dd></>}
        {row.pricing_model && <><dt>Pricing</dt><dd>{row.pricing_model}{row.price_range ? ` · ${row.price_range}` : ''}</dd></>}
        {row.funding && <><dt>Funding</dt><dd>{row.funding}</dd></>}
        {row.key_differentiator && <><dt>Edge</dt><dd>{row.key_differentiator}</dd></>}
        {row.relevance && <><dt>Relevance</dt><dd>{row.relevance}</dd></>}
      </dl>

      {row.transcript_quotes && row.transcript_quotes.length > 0 && (
        <div className="lt-quotes">
          {row.transcript_quotes.map((q, i) => (
            <div key={i} className="lt-quote">{q}</div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Grouped structure for map view ─────────────────────── */

interface GroupedSection {
  section: string;
  best_owner?: string;
  // Direct companies (no subcategory)
  companies: CompetitorRow[];
  // Grouped by subcategory
  subcategories: { name: string; companies: CompetitorRow[] }[];
}

function groupBySection(competitors: CompetitorRow[]): GroupedSection[] {
  const sectionMap = new Map<string, { best_owner?: string; direct: CompetitorRow[]; subMap: Map<string, CompetitorRow[]> }>();

  for (const row of competitors) {
    if (!sectionMap.has(row.section)) {
      sectionMap.set(row.section, { best_owner: row.best_owner, direct: [], subMap: new Map() });
    }
    const group = sectionMap.get(row.section)!;
    if (row.subcategory) {
      if (!group.subMap.has(row.subcategory)) group.subMap.set(row.subcategory, []);
      group.subMap.get(row.subcategory)!.push(row);
    } else {
      group.direct.push(row);
    }
  }

  const sections: GroupedSection[] = [];
  for (const [section, group] of sectionMap) {
    const subcategories = Array.from(group.subMap.entries()).map(([name, companies]) => ({ name, companies }));
    sections.push({ section, best_owner: group.best_owner, companies: group.direct, subcategories });
  }
  return sections;
}

/* ── Chip ───────────────────────────────────────────────── */

function Chip({ row, onHover, onLeave }: {
  row: CompetitorRow;
  onHover: (r: CompetitorRow, e: React.MouseEvent) => void;
  onLeave: () => void;
}) {
  return (
    <span className="map-chip" onMouseEnter={(e) => onHover(row, e)} onMouseLeave={onLeave}>
      {row.name}
    </span>
  );
}

/* ── Map view ───────────────────────────────────────────── */

function MapView({ sections, onHover, onLeave }: {
  sections: GroupedSection[];
  onHover: (r: CompetitorRow, e: React.MouseEvent) => void;
  onLeave: () => void;
}) {
  return (
    <div className="market-map">
      {sections.map(sec => (
        <div key={sec.section} className="category-card">
          <div className="category-title">
            {sec.section}
            {sec.best_owner && <span className="best-owner">{sec.best_owner}</span>}
          </div>
          {sec.companies.length > 0 && (
            <div className="chip-wrap">
              {sec.companies.map(r => <Chip key={r.name} row={r} onHover={onHover} onLeave={onLeave} />)}
            </div>
          )}
          {sec.subcategories.map(sub => (
            <div key={sub.name} className="subcategory-block">
              <div className="subcategory-title">{sub.name}</div>
              <div className="chip-wrap">
                {sub.companies.map(r => <Chip key={r.name} row={r} onHover={onHover} onLeave={onLeave} />)}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ── Table view ─────────────────────────────────────────── */

type SortCol = 'name' | 'section' | 'category' | 'target' | 'pricing' | 'funding' | 'differentiator' | 'uses_ai';

function TableView({ competitors, onHover, onLeave }: {
  competitors: CompetitorRow[];
  onHover: (r: CompetitorRow, e: React.MouseEvent) => void;
  onLeave: () => void;
}) {
  const [sortCol, setSortCol] = useState<SortCol>('section');
  const [sortAsc, setSortAsc] = useState(true);

  const sorted = useMemo(() => {
    const rows = [...competitors];
    rows.sort((a, b) => {
      let cmp: number;
      const str = (v?: string | null) => v || '';
      switch (sortCol) {
        case 'name': cmp = a.name.localeCompare(b.name); break;
        case 'section': cmp = a.section.localeCompare(b.section); break;
        case 'category': cmp = str(a.category).localeCompare(str(b.category)); break;
        case 'target': cmp = str(a.target_customer).localeCompare(str(b.target_customer)); break;
        case 'pricing': cmp = str(a.pricing_model).localeCompare(str(b.pricing_model)); break;
        case 'funding': cmp = str(a.funding).localeCompare(str(b.funding)); break;
        case 'differentiator': cmp = str(a.key_differentiator).localeCompare(str(b.key_differentiator)); break;
        case 'uses_ai': cmp = (a.uses_ai ? 0 : 1) - (b.uses_ai ? 0 : 1); break;
        default: cmp = 0;
      }
      return sortAsc ? cmp : -cmp;
    });
    return rows;
  }, [competitors, sortCol, sortAsc]);

  function handleSort(col: SortCol) {
    if (sortCol === col) setSortAsc(!sortAsc);
    else { setSortCol(col); setSortAsc(true); }
  }

  function arrow(col: SortCol) {
    if (sortCol !== col) return '';
    return sortAsc ? ' \u25B2' : ' \u25BC';
  }

  return (
    <div className="landscape-table-wrap">
      <table className="landscape-table">
        <thead>
          <tr>
            <th onClick={() => handleSort('name')}>Company{arrow('name')}</th>
            <th onClick={() => handleSort('category')}>Category{arrow('category')}</th>
            <th onClick={() => handleSort('target')}>Target Customer{arrow('target')}</th>
            <th onClick={() => handleSort('pricing')}>Pricing{arrow('pricing')}</th>
            <th onClick={() => handleSort('funding')}>Funding{arrow('funding')}</th>
            <th onClick={() => handleSort('differentiator')}>Key Differentiator{arrow('differentiator')}</th>
            <th onClick={() => handleSort('uses_ai')}>AI{arrow('uses_ai')}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(r => (
            <tr key={`${r.section}-${r.name}`} onMouseEnter={(e) => onHover(r, e)} onMouseLeave={onLeave}>
              <td className="col-name">{r.name}</td>
              <td>{r.category || '—'}</td>
              <td>{r.target_customer || '—'}</td>
              <td className="col-pricing">{r.pricing_model ? `${r.pricing_model}${r.price_range ? ` · ${r.price_range}` : ''}` : '—'}</td>
              <td className="col-funding">{r.funding || '—'}</td>
              <td className="col-diff">{r.key_differentiator || '—'}</td>
              <td>{r.uses_ai ? '\u2705' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── AI Query Result Modal ──────────────────────────────── */

function AIResultModal({ result, competitors, onClose }: {
  result: AIQueryResult;
  competitors: CompetitorRow[];
  onClose: () => void;
}) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Build a lookup map by company name
  const compMap = useMemo(() => {
    const m = new Map<string, CompetitorRow>();
    for (const c of competitors) m.set(c.name.toLowerCase(), c);
    return m;
  }, [competitors]);

  const showTip = useCallback((rowData: Record<string, string>, e: React.MouseEvent) => {
    clearTimeout(hideTimer.current);
    // Try to find the competitor by the first column value (usually company name)
    const nameKey = result.columns[0]?.key;
    const name = nameKey ? rowData[nameKey] : '';
    const comp = compMap.get(name?.toLowerCase() || '');
    if (!comp) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTooltip({ row: comp, x: rect.left + rect.width / 2, y: rect.bottom + 8 });
  }, [compMap, result.columns]);

  const hideTip = useCallback(() => {
    hideTimer.current = setTimeout(() => setTooltip(null), 150);
  }, []);

  return (
    <div className="ai-modal-overlay" onClick={onClose}>
      <div className="ai-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ai-modal-header">
          <h3>{result.title}</h3>
          <button className="ai-modal-close" onClick={onClose}>{'\u2715'}</button>
        </div>

        {result.summary && (
          <div className="ai-modal-summary">{result.summary}</div>
        )}

        <div className="ai-modal-table-wrap">
          <table className="ai-modal-table">
            <thead>
              <tr>
                {result.columns.map(col => (
                  <th key={col.key}>{col.header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, i) => (
                <tr key={i} onMouseEnter={(e) => showTip(row, e)} onMouseLeave={hideTip}>
                  {result.columns.map(col => (
                    <td key={col.key}>{row[col.key] || '—'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="ai-modal-footer">
          {result.rows.length} results
        </div>
      </div>

      {tooltip && <CompanyTooltip {...tooltip} />}
    </div>
  );
}

/* ── Main component ─────────────────────────────────────── */

export function CompetitorView({ data }: CompetitorViewProps) {
  const [view, setView] = useState<'map' | 'table'>('map');
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // AI query state
  const [aiQuery, setAiQuery] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<AIQueryResult | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // Helper: get date string from competitor (handles both 'date' and 'added_date' DB column)
  const getDate = useCallback((c: CompetitorRow): string => {
    if (c.date) return c.date;
    const raw = c as unknown as Record<string, unknown>;
    return (raw['added_date'] as string) || '';
  }, []);

  // Collect unique dates from competitors
  const allDates = useMemo(() => {
    const dateSet = new Set<number>();
    for (const c of data.competitors) {
      const ord = parseDateOrdinal(getDate(c));
      if (ord !== null) dateSet.add(ord);
    }
    return Array.from(dateSet).sort((a, b) => a - b);
  }, [data.competitors, getDate]);

  const [dateIndex, setDateIndex] = useState(allDates.length - 1);

  // Filter competitors by date cutoff
  const filtered = useMemo(() => {
    if (allDates.length <= 1) return data.competitors;
    const cutoff = allDates[dateIndex] ?? Infinity;
    return data.competitors.filter(c => {
      const ord = parseDateOrdinal(getDate(c));
      if (ord === null) return true;
      return ord <= cutoff;
    });
  }, [data.competitors, allDates, dateIndex, getDate]);

  const sections = useMemo(() => groupBySection(filtered), [filtered]);

  const showTooltip = useCallback((row: CompetitorRow, e: React.MouseEvent) => {
    clearTimeout(hideTimer.current);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTooltip({ row, x: rect.left + rect.width / 2, y: rect.bottom + 8 });
  }, []);

  const hideTooltip = useCallback(() => {
    hideTimer.current = setTimeout(() => setTooltip(null), 150);
  }, []);

  const handleAiQuery = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiQuery.trim() || aiLoading) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const result = await queryCompetitorsAI(aiQuery, data.competitors);
      setAiResult(result);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Query failed');
    } finally {
      setAiLoading(false);
    }
  }, [aiQuery, aiLoading, data.competitors]);

  const { meta } = data;

  return (
    <div className="competitor-view">
      <div className="competitor-scroll">
        <div className="landscape-header">
          <h2>{meta.title}</h2>
          <p>{meta.subtitle}{meta.last_update ? ` · Updated ${meta.last_update}` : ''}</p>
        </div>

        <form className="ai-query-bar" onSubmit={handleAiQuery}>
          <input
            type="text"
            className="ai-query-input"
            placeholder="Ask AI about competitors... e.g. &quot;Which companies use AI for compliance?&quot;"
            value={aiQuery}
            onChange={(e) => setAiQuery(e.target.value)}
            disabled={aiLoading}
          />
          <button type="submit" className="ai-query-btn" disabled={aiLoading}>
            {aiLoading ? 'Analyzing...' : 'Ask AI'}
          </button>
        </form>
        {aiError && <div className="ai-query-error">{aiError}</div>}

        <div className="landscape-toolbar">
          <span className="landscape-count">{filtered.length} companies{allDates.length > 1 ? ` (of ${data.competitors.length})` : ''}</span>
          <div className="view-toggle">
            <button className={view === 'map' ? 'active' : ''} onClick={() => setView('map')}>Map</button>
            <button className={view === 'table' ? 'active' : ''} onClick={() => setView('table')}>Table</button>
          </div>
        </div>

        {view === 'map' ? (
          <MapView sections={sections} onHover={showTooltip} onLeave={hideTooltip} />
        ) : (
          <TableView competitors={filtered} onHover={showTooltip} onLeave={hideTooltip} />
        )}

      </div>

      <TimelineBar allDates={allDates} dateIndex={dateIndex} setDateIndex={setDateIndex} />

      {tooltip && <CompanyTooltip {...tooltip} />}

      {aiResult && <AIResultModal result={aiResult} competitors={data.competitors} onClose={() => setAiResult(null)} />}
    </div>
  );
}
