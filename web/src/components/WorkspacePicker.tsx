import type { Workspace } from '../types';

interface WorkspacePickerProps {
  workspaces: Workspace[];
  onSelect: (ownerId: string) => void;
}

export function WorkspacePicker({ workspaces, onSelect }: WorkspacePickerProps) {
  return (
    <div className="ai-modal-overlay">
      <div className="ai-modal" style={{ maxWidth: 480 }}>
        <div className="ai-modal-header">
          <h3>Choose Workspace</h3>
        </div>
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {workspaces.map(ws => (
            <div
              key={ws.ownerId}
              className="workspace-option"
              onClick={() => onSelect(ws.ownerId)}
            >
              <span className="workspace-option-name">{ws.name}</span>
              {ws.isOwner && <span className="workspace-option-badge">Owner</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
