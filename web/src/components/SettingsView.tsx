import { useState, useEffect, useCallback } from 'react';
import { fetchWorkspaceMembers, addWorkspaceMember, removeWorkspaceMember, updateWorkspaceName } from '../api';
import type { Workspace, WorkspaceMember } from '../types';

interface SettingsViewProps {
  workspace: Workspace;
  workspaces: Workspace[];
  onSelectWorkspace: (ownerId: string) => void;
}

export function SettingsView({ workspace, workspaces, onSelectWorkspace }: SettingsViewProps) {
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(workspace.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMembers = useCallback(async () => {
    try {
      const rows = await fetchWorkspaceMembers(workspace.ownerId);
      setMembers(rows);
    } catch {
      // ignore
    }
  }, [workspace.ownerId]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const handleAddMember = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) return;
    setError(null);
    setSaving(true);
    try {
      await addWorkspaceMember(workspace.ownerId, workspace.name, email);
      setNewEmail('');
      await loadMembers();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add member');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveMember = async (email: string) => {
    setError(null);
    try {
      await removeWorkspaceMember(workspace.ownerId, email);
      await loadMembers();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove member');
    }
  };

  const handleSaveName = async () => {
    const name = nameValue.trim();
    if (!name || name === workspace.name) {
      setEditingName(false);
      return;
    }
    setSaving(true);
    try {
      await updateWorkspaceName(workspace.ownerId, name);
      setEditingName(false);
      // Name updates live in DB; the workspace object will update on next load
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update name');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-view">
      <div className="settings-scroll">
        {error && <div className="ai-query-error">{error}</div>}

        {/* Workspace name */}
        <div className="settings-section">
          <div className="settings-section-title">Workspace Name</div>
          {workspace.isOwner ? (
            editingName ? (
              <div className="settings-inline-edit">
                <input
                  className="task-search-input"
                  value={nameValue}
                  onChange={e => setNameValue(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSaveName()}
                  autoFocus
                />
                <button className="settings-btn primary" onClick={handleSaveName} disabled={saving}>Save</button>
                <button className="settings-btn" onClick={() => { setEditingName(false); setNameValue(workspace.name); }}>Cancel</button>
              </div>
            ) : (
              <div className="settings-inline-edit">
                <span className="settings-value">{workspace.name}</span>
                <button className="settings-btn" onClick={() => setEditingName(true)}>Edit</button>
              </div>
            )
          ) : (
            <span className="settings-value">{workspace.name}</span>
          )}
        </div>

        {/* Members */}
        <div className="settings-section">
          <div className="settings-section-title">Members</div>
          <div className="settings-members-list">
            {members.map(m => (
              <div key={m.member_email} className="settings-member-row">
                <span className="settings-member-email">{m.member_email}</span>
                {m.member_email === members.find(mm => mm.owner_id === workspace.ownerId)?.member_email && m.owner_id === workspace.ownerId && (
                  <span className="workspace-option-badge">Owner</span>
                )}
                {workspace.isOwner && (
                  <button
                    className="settings-remove-btn"
                    onClick={() => handleRemoveMember(m.member_email)}
                    title="Remove member"
                  >
                    &times;
                  </button>
                )}
              </div>
            ))}
          </div>
          {workspace.isOwner && (
            <div className="settings-add-member">
              <input
                className="task-search-input"
                placeholder="Email address"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddMember()}
              />
              <button className="settings-btn primary" onClick={handleAddMember} disabled={saving || !newEmail.trim()}>
                Add
              </button>
            </div>
          )}
        </div>

        {/* Switch workspace */}
        {workspaces.length > 1 && (
          <div className="settings-section">
            <div className="settings-section-title">Switch Workspace</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {workspaces.map(ws => (
                <div
                  key={ws.ownerId}
                  className={`workspace-option${ws.ownerId === workspace.ownerId ? ' active' : ''}`}
                  onClick={() => ws.ownerId !== workspace.ownerId && onSelectWorkspace(ws.ownerId)}
                >
                  <span className="workspace-option-name">{ws.name}</span>
                  {ws.isOwner && <span className="workspace-option-badge">Owner</span>}
                  {ws.ownerId === workspace.ownerId && <span className="workspace-option-badge" style={{ marginLeft: 'auto' }}>Current</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
