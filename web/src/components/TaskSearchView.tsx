import { useState, useCallback, useMemo } from 'react';
import { searchTasks } from '../api';
import type { LinearTask } from '../types';

type SortMode = 'date' | 'relevance';

function parseTaskDate(dateStr: string | undefined | null): number {
  if (!dateStr) return 0;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

const PRESET_QUERIES = [
  { label: 'Todo tasks', query: 'tasks to do', filters: { status: 'Todo' } },
  { label: 'Urgent / high priority', query: 'urgent important critical', filters: { priority: 'Urgent' } },
  { label: 'In Progress', query: 'currently working on in progress', filters: { status: 'In Progress' } },
  { label: 'Blocked tasks', query: 'blocked waiting on dependency' },
  { label: 'Has duplicates', query: 'duplicate redundant same task' },
  { label: 'Backlog', query: 'backlog not started yet', filters: { status: 'Backlog' } },
  { label: 'Recently done', query: 'completed finished done', filters: { status: 'Done' } },
  { label: 'Product tasks', query: 'product feature UI UX', filters: { project: 'Product' } },
  { label: 'Compliance / regulatory', query: 'compliance regulatory CMS state survey violation' },
  { label: 'AI / ML tasks', query: 'AI machine learning model training data' },
  { label: 'Hiring portal', query: 'hiring recruitment interview assessment demo', filters: { project: 'Hiring' } },
  { label: 'Operations', query: 'operations infrastructure deployment devops', filters: { project: 'Operation' } },
];

const ALL_STATUSES = ['Todo', 'In Progress', 'Backlog', 'Triage', 'Done', 'Canceled', 'Duplicate'];
const DEFAULT_HIDDEN = new Set(['Canceled', 'Duplicate', 'Done']);

const STATUS_COLORS: Record<string, string> = {
  Done: 'var(--green)',
  'In Progress': 'var(--blue)',
  Todo: 'var(--orange)',
  Backlog: 'var(--text3)',
  Canceled: 'var(--red)',
  Triage: 'var(--purple)',
  Duplicate: 'var(--text3)',
};

const PRIORITY_COLORS: Record<string, string> = {
  Urgent: 'var(--red)',
  High: 'var(--orange)',
  Medium: 'var(--blue)',
  Low: 'var(--text3)',
  'No priority': 'var(--text3)',
};

export function TaskSearchView() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LinearTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [hiddenStatuses, setHiddenStatuses] = useState<Set<string>>(new Set(DEFAULT_HIDDEN));
  const [sortMode, setSortMode] = useState<SortMode>('date');

  const sortedResults = useMemo(() => {
    if (sortMode === 'relevance') return results;
    return [...results].sort((a, b) => parseTaskDate(b.Updated) - parseTaskDate(a.Updated));
  }, [results, sortMode]);

  const toggleStatus = (status: string) => {
    setHiddenStatuses(prev => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  };

  const getExcludeStatuses = (presetStatus?: string) => {
    // If a preset forces a specific status, don't exclude it
    if (presetStatus) return undefined;
    const excluded = Array.from(hiddenStatuses);
    return excluded.length > 0 ? excluded : undefined;
  };

  const doSearch = useCallback(async (
    q: string,
    filters?: { status?: string; priority?: string; project?: string },
    excludeStatuses?: string[],
  ) => {
    if (!q.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const tasks = await searchTasks(q, {
        ...filters,
        excludeStatuses: filters?.status ? undefined : excludeStatuses,
        limit: 30,
      });
      setResults(tasks);
    } catch (err) {
      console.error('Search error:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handlePreset = (preset: typeof PRESET_QUERIES[0]) => {
    setQuery(preset.query);
    setActivePreset(preset.label);
    doSearch(preset.query, preset.filters, getExcludeStatuses(preset.filters?.status));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setActivePreset(null);
    doSearch(query, undefined, getExcludeStatuses());
  };

  return (
    <div className="task-search-view">
      <div className="task-search-panel">
        <form className="task-search-bar" onSubmit={handleSubmit}>
          <input
            type="text"
            className="task-search-input"
            placeholder="Search tasks semantically..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit" className="task-search-btn" disabled={loading}>
            {loading ? 'Searching...' : 'Search'}
          </button>
        </form>

        <div className="task-status-filters">
          <span className="task-filter-label">Show:</span>
          {ALL_STATUSES.map((s) => (
            <button
              key={s}
              className={`task-status-toggle${hiddenStatuses.has(s) ? ' hidden' : ' visible'}`}
              style={{ '--status-color': STATUS_COLORS[s] || 'var(--text3)' } as React.CSSProperties}
              onClick={() => toggleStatus(s)}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="task-sort-row">
          <span className="task-filter-label">Sort:</span>
          <button
            className={`task-sort-btn${sortMode === 'date' ? ' active' : ''}`}
            onClick={() => setSortMode('date')}
          >
            Most Recent
          </button>
          <button
            className={`task-sort-btn${sortMode === 'relevance' ? ' active' : ''}`}
            onClick={() => setSortMode('relevance')}
          >
            Relevance
          </button>
        </div>

        <div className="task-presets">
          {PRESET_QUERIES.map((p) => (
            <button
              key={p.label}
              className={`task-preset-chip${activePreset === p.label ? ' active' : ''}`}
              onClick={() => handlePreset(p)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="task-results">
          {loading && <div className="task-loading">Searching...</div>}
          {!loading && searched && results.length === 0 && (
            <div className="task-empty">No matching tasks found.</div>
          )}
          {!loading && sortedResults.length > 0 && (
            <table className="task-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Tags</th>
                  <th>Project</th>
                  <th>Assignee</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {sortedResults.map((task) => (
                  <tr key={task.ID}>
                    <td className="task-table-id">{task.ID}</td>
                    <td className="task-table-title">
                      {task.Title}
                      {task.Description && (
                        <span className="task-table-desc">{task.Description.slice(0, 120)}{task.Description.length > 120 ? '...' : ''}</span>
                      )}
                    </td>
                    <td>
                      {task.Status && (
                        <span className="task-status-badge" style={{ color: STATUS_COLORS[task.Status] || 'var(--text3)' }}>
                          {task.Status}
                        </span>
                      )}
                    </td>
                    <td>
                      {task.Priority && task.Priority !== 'No priority' && (
                        <span className="task-priority-badge" style={{ color: PRIORITY_COLORS[task.Priority] || 'var(--text3)' }}>
                          {task.Priority}
                        </span>
                      )}
                    </td>
                    <td className="task-table-tags">
                      {task.Labels && task.Labels.split(',').map((label) => (
                        <span key={label.trim()} className="task-tag">{label.trim()}</span>
                      ))}
                    </td>
                    <td className="task-table-project">{task.Project}</td>
                    <td className="task-table-assignee">{task.Assignee}</td>
                    <td className="task-table-date">{task.Updated ? new Date(task.Updated).toLocaleDateString() : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
