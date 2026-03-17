import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import type { LandscapeData, CompetitorRow, AIQueryResult } from '../types';
import { parseDateOrdinal, TimelineBar } from './MarkmapView';
import { findDateIndex } from '../hooks/useTimelineCutoff';
import type { TimelineRange } from '../hooks/useTimelineCutoff';
import { queryCompetitorsAI } from '../api';
import { ReactSearchAutocomplete } from 'react-search-autocomplete';

interface CompetitorViewProps {
  data: LandscapeData;
  timelineRange?: TimelineRange | null;
  onTimelineRangeChange?: (range: Partial<TimelineRange>) => void;
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
              <td data-label="Category">{r.category || '—'}</td>
              <td data-label="Target">{r.target_customer || '—'}</td>
              <td data-label="Pricing" className="col-pricing">{r.pricing_model ? `${r.pricing_model}${r.price_range ? ` · ${r.price_range}` : ''}` : '—'}</td>
              <td data-label="Funding" className="col-funding">{r.funding || '—'}</td>
              <td data-label="Differentiator" className="col-diff">{r.key_differentiator || '—'}</td>
              <td data-label="AI">{r.uses_ai ? '\u2705' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── AI Search history ──────────────────────────────────── */

const HISTORY_KEY = 'ai-competitor-search-history';
const MAX_HISTORY = 10;

interface SearchItem {
  id: number;
  name: string;
  type: 'history' | 'suggestion';
}

const PRESET_SUGGESTIONS: SearchItem[] = [
  { id: 1001, name: 'Which companies use AI for compliance?', type: 'suggestion' },
  { id: 1002, name: 'High threat competitors targeting CNAs', type: 'suggestion' },
  { id: 1003, name: 'Compare pricing models across competitors', type: 'suggestion' },
  { id: 1004, name: 'Companies serving both CNA and RN markets', type: 'suggestion' },
  { id: 1005, name: 'Well-funded competitors with AI capabilities', type: 'suggestion' },
  { id: 1006, name: 'What are the key differentiators of top threats?', type: 'suggestion' },
];

function loadHistory(): SearchItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SearchItem[];
  } catch { return []; }
}

function saveHistory(items: SearchItem[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, MAX_HISTORY)));
}

function addToHistory(query: string) {
  const history = loadHistory().filter(h => h.name !== query);
  const newItem: SearchItem = { id: Date.now(), name: query, type: 'history' };
  saveHistory([newItem, ...history]);
}

/* ── AI Query Result Modal ──────────────────────────────── */

const ALL_COLUMNS: { header: string; key: keyof CompetitorRow }[] = [
  { header: 'Company', key: 'name' },
  { header: 'Section', key: 'section' },
  { header: 'Category', key: 'category' },
  { header: 'Threat', key: 'threat' },
  { header: 'Date', key: 'date' },
  { header: 'Primary Focus', key: 'primary_focus' },
  { header: 'Target Customer', key: 'target_customer' },
  { header: 'Pricing', key: 'pricing_model' },
  { header: 'Price Range', key: 'price_range' },
  { header: 'Funding', key: 'funding' },
  { header: 'AI', key: 'uses_ai' },
  { header: 'CNA', key: 'serves_cna' },
  { header: 'RN', key: 'serves_rn' },
  { header: 'Key Differentiator', key: 'key_differentiator' },
  { header: 'Relevance', key: 'relevance' },
  { header: 'Website', key: 'website' },
];

function formatCell(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  if (typeof value === 'boolean') return value ? '\u2705' : '';
  return String(value);
}

function formatCsvCell(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function exportCsv(rows: CompetitorRow[], title: string) {
  const header = ALL_COLUMNS.map(c => c.header).join(',');
  const body = rows.map(row => ALL_COLUMNS.map(col => formatCsvCell(row[col.key])).join(',')).join('\n');
  const csv = header + '\n' + body;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title.replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function AIResultModal({ result, competitors, onClose }: {
  result: AIQueryResult;
  competitors: CompetitorRow[];
  onClose: () => void;
}) {
  const compMap = useMemo(() => {
    const m = new Map<string, CompetitorRow>();
    for (const c of competitors) m.set(c.name.toLowerCase(), c);
    return m;
  }, [competitors]);

  // Match AI result rows to full competitor data
  const matchedRows = useMemo(() => {
    const nameKey = result.columns[0]?.key || 'name';
    return result.rows
      .map(row => compMap.get((row[nameKey] || '').toLowerCase()))
      .filter((c): c is CompetitorRow => c !== undefined);
  }, [result, compMap]);

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
                {ALL_COLUMNS.map(col => (
                  <th key={col.key}>{col.header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matchedRows.map((row, i) => (
                <tr key={i}>
                  {ALL_COLUMNS.map(col => (
                    <td key={col.key}>{formatCell(row[col.key])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="ai-modal-footer">
          <span>{matchedRows.length} results</span>
          <button className="ai-export-btn" onClick={() => exportCsv(matchedRows, result.title)}>
            Export CSV
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main component ─────────────────────────────────────── */

export function CompetitorView({ data, timelineRange, onTimelineRangeChange }: CompetitorViewProps) {
  const [view, setView] = useState<'map' | 'table'>('map');
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // AI query state
  const [aiQuery, setAiQuery] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<AIQueryResult | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // Autocomplete items: history + suggestions
  const [searchItems, setSearchItems] = useState<SearchItem[]>([]);

  useEffect(() => {
    setSearchItems([...loadHistory(), ...PRESET_SUGGESTIONS]);
  }, []);

  const fireQuery = useCallback(async (query: string) => {
    if (!query.trim() || aiLoading) return;
    addToHistory(query);
    setSearchItems([...loadHistory(), ...PRESET_SUGGESTIONS]);
    setAiLoading(true);
    setAiError(null);
    try {
      const result = await queryCompetitorsAI(query, data.competitors);
      setAiResult(result);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Query failed');
    } finally {
      setAiLoading(false);
    }
  }, [aiLoading, data.competitors]);

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

  const initialStart = timelineRange?.startOrd != null && allDates.length > 0
    ? findDateIndex(allDates, timelineRange.startOrd) : 0;
  const initialEnd = timelineRange?.endOrd != null && allDates.length > 0
    ? findDateIndex(allDates, timelineRange.endOrd) : allDates.length - 1;
  const [startIndex, setStartIndex] = useState(initialStart);
  const [endIndex, setEndIndex] = useState(initialEnd);

  useEffect(() => {
    if (timelineRange?.startOrd != null && allDates.length > 0) {
      setStartIndex(findDateIndex(allDates, timelineRange.startOrd));
    }
    if (timelineRange?.endOrd != null && allDates.length > 0) {
      setEndIndex(findDateIndex(allDates, timelineRange.endOrd));
    }
  }, [timelineRange?.startOrd, timelineRange?.endOrd, allDates]);

  // Filter competitors by date range
  const filtered = useMemo(() => {
    if (allDates.length <= 1) return data.competitors;
    const startCutoff = allDates[startIndex] ?? 0;
    const endCutoff = allDates[endIndex] ?? Infinity;
    return data.competitors.filter(c => {
      const ord = parseDateOrdinal(getDate(c));
      if (ord === null) return true;
      return ord >= startCutoff && ord <= endCutoff;
    });
  }, [data.competitors, allDates, startIndex, endIndex, getDate]);

  const sections = useMemo(() => groupBySection(filtered), [filtered]);

  const showTooltip = useCallback((row: CompetitorRow, e: React.MouseEvent) => {
    clearTimeout(hideTimer.current);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTooltip({ row, x: rect.left + rect.width / 2, y: rect.bottom + 8 });
  }, []);

  const hideTooltip = useCallback(() => {
    hideTimer.current = setTimeout(() => setTooltip(null), 150);
  }, []);

  const { meta } = data;

  const formatResult = (item: SearchItem) => (
    <div className="ai-search-result-item">
      <span className={`ai-search-icon ${item.type}`}>
        {item.type === 'history' ? '\u23F3' : '\u2728'}
      </span>
      <span>{item.name}</span>
    </div>
  );

  return (
    <div className="competitor-view">
      <div className="competitor-scroll">
        <div className="landscape-header">
          <h2>{meta.title}</h2>
          <p>{meta.subtitle}{meta.last_update ? ` · Updated ${meta.last_update}` : ''}</p>
        </div>

        <div className="ai-query-bar">
          {aiLoading && (
            <div className="ai-query-loading-overlay">
              <div className="ai-query-spinner" />
              <span>Analyzing competitors...</span>
            </div>
          )}
          <ReactSearchAutocomplete<SearchItem>
            items={searchItems}
            onSearch={(string) => setAiQuery(string)}
            onSelect={(item) => fireQuery(item.name)}
            onClear={() => setAiQuery('')}
            inputSearchString={aiQuery}
            placeholder="Ask AI about competitors..."
            formatResult={formatResult}
            showItemsOnFocus
            maxResults={8}
            styling={{
              height: '44px',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              backgroundColor: 'var(--surface)',
              color: 'var(--text)',
              fontSize: '13px',
              fontFamily: 'var(--font-body)',
              iconColor: 'var(--purple)',
              placeholderColor: 'var(--text3)',
              hoverBackgroundColor: 'var(--purple-light)',
              boxShadow: 'none',
              clearIconMargin: '3px 8px 0 0',
              zIndex: 10,
            }}
            fuseOptions={{ keys: ['name'], threshold: 0.4 }}
          />
          <button
            className="ai-query-btn"
            disabled={aiLoading || !aiQuery.trim()}
            onClick={() => fireQuery(aiQuery)}
          >
            Ask AI
          </button>
        </div>
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

      <TimelineBar
        allDates={allDates}
        startIndex={startIndex}
        endIndex={endIndex}
        setStartIndex={setStartIndex}
        setEndIndex={setEndIndex}
        onRangeChange={onTimelineRangeChange}
      />

      {tooltip && <CompanyTooltip {...tooltip} />}

      {aiResult && <AIResultModal result={aiResult} competitors={data.competitors} onClose={() => setAiResult(null)} />}
    </div>
  );
}
