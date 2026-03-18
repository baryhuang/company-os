import { useState, useMemo, useEffect } from 'react';
import type { TreeNode } from '../types';
import { TimelineBar, collectDates, parseDateOrdinal } from './MarkmapView';
import { findDateIndex } from '../hooks/useTimelineCutoff';
import type { TimelineRange } from '../hooks/useTimelineCutoff';
import './vem-document.css';

// ── Fixed template matching the VEM .docx ─────────────────────

interface TemplateRow {
  label: string;
  /** Subtitle shown below the label in smaller text */
  subtitle?: string;
}

interface TemplateSection {
  title: string;
  rows: TemplateRow[];
}

interface TemplateTable {
  title: string;
  sections: TemplateSection[];
}

const VEM_TEMPLATE: TemplateTable[] = [
  {
    title: 'Vision to Execution Map',
    sections: [
      {
        title: 'Vision',
        rows: [
          { label: 'Core Values' },
          { label: 'Mission: why are we doing this' },
          { label: 'BHAG' },
        ],
      },
      {
        title: 'Foreseeable Future State',
        rows: [
          { label: 'Milestone 2', subtitle: '(the round after next)' },
        ],
      },
      {
        title: 'Customer and Revenue',
        rows: [
          { label: 'Customer (W3)', subtitle: '(See Levers and Sell More Faster)' },
          { label: 'Revenue Formula' },
          { label: 'Elevator pitch (2x20)' },
          { label: 'Extension1: "unlike" clause' },
          { label: 'Extension2: "We make money by"' },
        ],
      },
      {
        title: 'Relentless Execution (Traction Plan)',
        rows: [
          { label: 'Milestone 1: Traction Goals', subtitle: '(for the program, to set up the next raise)' },
          { label: 'KPIs' },
          { label: 'Initial Goals (aka Big Rock(s))' },
          { label: 'Essential unvalidated assumptions' },
          { label: 'Top (known) needs for mentor support' },
        ],
      },
    ],
  },
  {
    title: 'Investment Memo',
    sections: [
      {
        title: 'Key Content',
        rows: [
          { label: 'Brief Description' },
          { label: 'Problem' },
          { label: 'Solution' },
          { label: 'Team', subtitle: '(and key strengths / uniques for this business)' },
          { label: 'Market size / opportunity', subtitle: '(including path to $100MM revenue)' },
          { label: 'Competitive landscape and differentiation', subtitle: '(unfair advantage for customer acquisition, moat)' },
          { label: 'Business model' },
          { label: 'Traction' },
          { label: 'Go to market plan' },
          { label: 'Product roadmap' },
          { label: 'Financial summary' },
          { label: 'Uses of capital', subtitle: '(tied to milestones needed to get to the next round)' },
          { label: 'Risks (and risk mitigation)' },
          { label: 'Capital efficiency', subtitle: '(how much progress have you made with money to date)' },
        ],
      },
    ],
  },
];

// ── Helpers ────────────────────────────────────────────────────

/** Normalize a name for fuzzy matching: lowercase, strip punctuation, collapse whitespace */
function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

/** Find a child node whose name starts with the given label (fuzzy) */
function findChild(children: TreeNode[] | undefined, label: string): TreeNode | undefined {
  if (!children) return undefined;
  const key = normalizeKey(label);
  return children.find(c => normalizeKey(c.name).startsWith(key));
}

/** Find a section node by name (fuzzy) */
function findSection(tree: TreeNode, sectionTitle: string): TreeNode | undefined {
  return findChild(tree.children, sectionTitle);
}

// ── Rendering components ──────────────────────────────────────

function Tag({ status }: { status?: string }) {
  if (!status) return null;
  return <span className={`vem-tag ${status}`}>{status}</span>;
}

function InlineMeta({ node }: { node: TreeNode }) {
  return (
    <>
      <Tag status={node.status} />
      {node.verified && <span className="vem-check">&#x2713;</span>}
      {node.date && <span className="vem-date-inline">{node.date}</span>}
    </>
  );
}

/** Parse a desc string into paragraphs and bullet lists */
function DescContent({ text }: { text: string }) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let bulletBuffer: string[] = [];

  const flushBullets = () => {
    if (bulletBuffer.length === 0) return;
    elements.push(
      <ul key={`ul-${elements.length}`}>
        {bulletBuffer.map((b, i) => <li key={i}>{b}</li>)}
      </ul>
    );
    bulletBuffer = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^[•●\-]\s*/.test(trimmed)) {
      bulletBuffer.push(trimmed.replace(/^[•●\-]\s*/, ''));
    } else {
      flushBullets();
      if (trimmed) {
        elements.push(<div key={`p-${elements.length}`}>{trimmed}</div>);
      }
    }
  }
  flushBullets();

  return <>{elements}</>;
}

/** Render depth-3+ children inline inside the value cell */
function DeepChildren({ children }: { children: TreeNode[] }) {
  return (
    <>
      {children.map((child, i) => (
        <div key={i}>
          <div className="vem-sub-label">
            {child.name}
            <InlineMeta node={child} />
          </div>
          {child.desc && <DescContent text={child.desc} />}
          {child.quotes && child.quotes.length > 0 && (
            <ul className="vem-quotes">
              {child.quotes.map((q, qi) => <li key={qi}>{q}</li>)}
            </ul>
          )}
          {child.children && child.children.length > 0 && (
            <DeepChildren children={child.children} />
          )}
        </div>
      ))}
    </>
  );
}

/** Render a fixed template row, looking up data from the matching tree node */
function FixedRow({ row, node }: { row: TemplateRow; node?: TreeNode }) {
  const hasContent = !!(node?.desc || node?.quotes?.length || (node?.children && node.children.length > 0));

  return (
    <tr className="vem-content-row">
      <td className={`vem-label-cell${hasContent ? '' : ' vem-label-full'}`} colSpan={hasContent ? 1 : 2}>
        {row.label}
        {row.subtitle && <div className="vem-label-subtitle">{row.subtitle}</div>}
        {node && <InlineMeta node={node} />}
      </td>
      {hasContent && (
        <td className="vem-value-cell">
          {node!.desc && <DescContent text={node!.desc} />}
          {node!.quotes && node!.quotes.length > 0 && (
            <ul className="vem-quotes">
              {node!.quotes.map((q, i) => <li key={i}>{q}</li>)}
            </ul>
          )}
          {node!.children && node!.children.length > 0 && (
            <DeepChildren children={node!.children} />
          )}
        </td>
      )}
    </tr>
  );
}

// ── Timeline filtering ────────────────────────────────────────

function filterByDate(node: TreeNode, cutoff: number): TreeNode | null {
  const ord = parseDateOrdinal(node.date || '');
  if (ord !== null && ord > cutoff) return null;
  const children = (node.children || [])
    .map(c => filterByDate(c, cutoff))
    .filter((c): c is TreeNode => c !== null);
  return { ...node, children: children.length > 0 ? children : undefined };
}

// ── Main component ────────────────────────────────────────────

interface VEMDocumentViewProps {
  treeData: TreeNode;
  timelineRange?: TimelineRange | null;
  onTimelineRangeChange?: (range: Partial<TimelineRange>) => void;
}

export function VEMDocumentView({ treeData, timelineRange, onTimelineRangeChange }: VEMDocumentViewProps) {
  const allDates = useMemo(() => collectDates(treeData), [treeData]);
  const [startIndex, setStartIndex] = useState(0);
  const [endIndex, setEndIndex] = useState(allDates.length - 1);

  useEffect(() => {
    if (allDates.length === 0) return;
    setStartIndex(timelineRange?.startOrd != null
      ? findDateIndex(allDates, timelineRange.startOrd) : 0);
    setEndIndex(timelineRange?.endOrd != null
      ? findDateIndex(allDates, timelineRange.endOrd) : allDates.length - 1);
  }, [timelineRange?.startOrd, timelineRange?.endOrd, allDates]);

  const startOrd = allDates[startIndex] ?? 0;
  const endOrd = allDates[endIndex] ?? Infinity;
  const filtered = useMemo(() => {
    if (endOrd === Infinity && startOrd === 0) return treeData;
    return filterByDate(treeData, endOrd) || treeData;
  }, [treeData, startOrd, endOrd]);

  return (
    <div className="vem-doc">
      <div className="vem-doc-inner">
        {VEM_TEMPLATE.map((table, ti) => {
          // Find the matching top-level section in the tree for this table
          // For the first table, use the root tree; for "Investment Memo", find the section
          const tableRoot = ti === 0 ? filtered : findSection(filtered, table.title);

          return (
            <table key={ti} className="vem-table" style={ti > 0 ? { marginTop: 32 } : undefined}>
              <tbody>
                {/* Table title banner */}
                <tr className="vem-title-row">
                  <td colSpan={2}>{table.title}</td>
                </tr>

                {table.sections.map((section, si) => {
                  // Find matching section in tree data
                  const sectionNode = tableRoot ? findSection(tableRoot, section.title) : undefined;

                  return [
                    /* Section banner */
                    <tr key={`s-${ti}-${si}`} className="vem-section-row">
                      <td colSpan={2}>
                        {section.title}
                        {sectionNode && <InlineMeta node={sectionNode} />}
                      </td>
                    </tr>,
                    /* Fixed rows */
                    ...section.rows.map((row, ri) => {
                      const node = sectionNode ? findChild(sectionNode.children, row.label) : undefined;
                      return <FixedRow key={`r-${ti}-${si}-${ri}`} row={row} node={node} />;
                    }),
                  ];
                })}
              </tbody>
            </table>
          );
        })}
      </div>
      <TimelineBar allDates={allDates} startIndex={startIndex} endIndex={endIndex} setStartIndex={setStartIndex} setEndIndex={setEndIndex} onRangeChange={onTimelineRangeChange} />
    </div>
  );
}
