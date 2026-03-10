import type { AppointmentsData, Appointment } from '../types';

const URGENCY_ORDER = ['overdue', 'this_week', 'next_week', 'upcoming', 'no_date', 'done'] as const;

const URGENCY_CONFIG: Record<string, { label: string; bg: string; color: string; border: string }> = {
  overdue:   { label: 'Overdue',   bg: 'var(--red-light)',    color: '#8a2828', border: 'rgba(191,54,54,0.25)' },
  this_week: { label: 'This Week', bg: 'var(--orange-light)', color: '#7a5818', border: 'rgba(184,112,26,0.25)' },
  next_week: { label: 'Next Week', bg: 'var(--blue-light)',   color: '#224a78', border: 'rgba(46,98,153,0.25)' },
  upcoming:  { label: 'Upcoming',  bg: 'var(--teal-light)',   color: '#155e54', border: 'rgba(29,122,110,0.25)' },
  no_date:   { label: 'No Date',   bg: 'var(--surface2)',     color: 'var(--text3)', border: 'var(--border)' },
  done:      { label: 'Done',      bg: 'var(--green-light)',  color: '#1e5a2c', border: 'rgba(45,122,62,0.25)' },
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'var(--red)',
  high: 'var(--orange)',
  medium: 'var(--blue)',
  low: 'var(--text3)',
};

function formatDate(apt: Appointment): string {
  if (!apt.date) return 'TBD';
  const d = apt.date;
  const parts = [d];
  if (apt.date_end) parts.push(` ~ ${apt.date_end}`);
  if (apt.time) parts.push(` ${apt.time}`);
  return parts.join('');
}

function AppointmentCard({ apt }: { apt: Appointment }) {
  const prioColor = PRIORITY_COLORS[apt.priority] ?? 'var(--text3)';

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '14px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <span style={{ fontWeight: 600, color: 'var(--text)', fontSize: 14 }}>{apt.person}</span>
          <span style={{
            display: 'inline-block',
            marginLeft: 8,
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: 1,
            padding: '2px 8px',
            borderRadius: 4,
            background: apt.format === 'in-person' ? 'var(--green-light)' : apt.format === 'video' ? 'var(--blue-light)' : 'var(--surface2)',
            color: apt.format === 'in-person' ? 'var(--green)' : apt.format === 'video' ? 'var(--blue)' : 'var(--text3)',
          }}>{apt.format}</span>
        </div>
        <span style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: 1,
          color: prioColor,
          fontFamily: 'var(--font-mono)',
          whiteSpace: 'nowrap',
        }}>{apt.priority}</span>
      </div>

      {/* What */}
      <div style={{ fontSize: 13.5, color: 'var(--text2)', lineHeight: 1.45 }}>{apt.what}</div>

      {/* Meta row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 12, color: 'var(--text3)' }}>
        <span>{formatDate(apt)}</span>
        {apt.location && <span>{apt.location}</span>}
        <span>Owner: {apt.owner}</span>
        <span style={{
          fontSize: 10,
          padding: '1px 6px',
          borderRadius: 3,
          background: apt.status === 'completed' ? 'var(--green-light)' : apt.status === 'overdue' ? 'var(--red-light)' : 'var(--surface2)',
          color: apt.status === 'completed' ? 'var(--green)' : apt.status === 'overdue' ? 'var(--red)' : 'var(--text3)',
          fontWeight: 500,
        }}>{apt.status}</span>
      </div>

      {/* Quote */}
      {apt.quote && (
        <div style={{
          fontSize: 12,
          color: 'var(--text3)',
          fontStyle: 'italic',
          borderLeft: '2px solid var(--border)',
          paddingLeft: 10,
          lineHeight: 1.5,
        }}>
          {apt.quote}
        </div>
      )}
    </div>
  );
}

export function AppointmentsView({ data }: { data: AppointmentsData }) {
  const grouped = new Map<string, Appointment[]>();
  for (const u of URGENCY_ORDER) grouped.set(u, []);
  for (const apt of data.appointments) {
    const list = grouped.get(apt.urgency);
    if (list) list.push(apt);
  }

  return (
    <div style={{ padding: '20px 24px', overflowY: 'auto', height: '100%' }}>
      {/* Summary bar */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 20,
        padding: '12px 16px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 8,
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginRight: 8, lineHeight: '24px' }}>
          {data.total} appointments
        </span>
        {URGENCY_ORDER.map(u => {
          const count = data.summary[u] ?? 0;
          if (count === 0) return null;
          const cfg = URGENCY_CONFIG[u];
          return (
            <span key={u} style={{
              fontSize: 12,
              fontWeight: 600,
              padding: '3px 10px',
              borderRadius: 12,
              background: cfg.bg,
              color: cfg.color,
              border: `1px solid ${cfg.border}`,
            }}>
              {cfg.label}: {count}
            </span>
          );
        })}
      </div>

      {/* Groups */}
      {URGENCY_ORDER.map(u => {
        const items = grouped.get(u);
        if (!items || items.length === 0) return null;
        const cfg = URGENCY_CONFIG[u];
        return (
          <div key={u} style={{ marginBottom: 24 }}>
            <div style={{
              display: 'inline-block',
              fontSize: 12,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: 1.5,
              padding: '4px 12px',
              borderRadius: 4,
              background: cfg.bg,
              color: cfg.color,
              border: `1px solid ${cfg.border}`,
              marginBottom: 10,
              fontFamily: 'var(--font-mono)',
            }}>
              {cfg.label} ({items.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {items.map(apt => <AppointmentCard key={apt.id} apt={apt} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
