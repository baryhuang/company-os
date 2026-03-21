import { useState, useEffect, useCallback } from 'react';
import { fetchWorkspaceMembers, addWorkspaceMember, removeWorkspaceMember, updateWorkspaceName } from '../api';
import type { Workspace, WorkspaceMember } from '../types';
import { getElectronSettings } from '../insforge';
import { checkChannelHealth } from '../channelApi';

interface SettingsViewProps {
  workspace: Workspace;
  workspaces: Workspace[];
  onSelectWorkspace: (ownerId: string) => void;
}

type ChatBackend = 'openagents' | 'channel';

const CHAT_BACKEND_STORAGE_KEY = 'company-os:chatBackend';

export function SettingsView({ workspace, workspaces, onSelectWorkspace }: SettingsViewProps) {
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(workspace.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Electron backend settings
  const isElectron = !!window.electronAPI;
  const [backendUrl, setBackendUrl] = useState('');
  const [anonKey, setAnonKey] = useState('');
  const [workspaceUrl, setWorkspaceUrl] = useState('');
  const [agentName, setAgentName] = useState('');
  const [backendSaving, setBackendSaving] = useState(false);
  const [backendSaved, setBackendSaved] = useState(false);
  const [chatBackend, setChatBackend] = useState<ChatBackend>(() => {
    const storedChatBackend = window.localStorage.getItem(CHAT_BACKEND_STORAGE_KEY);
    return storedChatBackend === 'channel' ? 'channel' : 'openagents';
  });
  const [channelHealthy, setChannelHealthy] = useState(false);

  useEffect(() => {
    if (isElectron) {
      const s = getElectronSettings();
      if (s) {
        setBackendUrl(s.backendUrl || '');
        setAnonKey(s.anonKey || '');
        setWorkspaceUrl(s.workspaceUrl || '');
        setAgentName(s.agentName || '');
      }
    }
  }, [isElectron]);

  useEffect(() => {
    let cancelled = false;

    window.localStorage.setItem(CHAT_BACKEND_STORAGE_KEY, chatBackend);

    if (window.electronAPI) {
      const electronSettings = getElectronSettings();
      const nextSettings: Record<string, string> = {
        chatBackend,
      };

      if (electronSettings?.backendUrl) {
        nextSettings.backendUrl = electronSettings.backendUrl;
      }
      if (electronSettings?.anonKey) {
        nextSettings.anonKey = electronSettings.anonKey;
      }
      if (electronSettings?.workspaceUrl) {
        nextSettings.workspaceUrl = electronSettings.workspaceUrl;
      }
      if (electronSettings?.agentName) {
        nextSettings.agentName = electronSettings.agentName;
      }

      void window.electronAPI.settings.saveSettings(nextSettings).catch(() => {});
    }

    const refreshChannelHealth = async () => {
      const healthy = await checkChannelHealth();
      if (!cancelled) {
        setChannelHealthy(healthy);
      }
    };

    void refreshChannelHealth();

    return () => {
      cancelled = true;
    };
  }, [chatBackend]);

  const handleSaveBackend = async () => {
    if (!window.electronAPI) return;
    setBackendSaving(true);
    try {
      await window.electronAPI.settings.saveSettings({
        backendUrl,
        anonKey,
        workspaceUrl,
        agentName,
      });
      setBackendSaved(true);
      setTimeout(() => setBackendSaved(false), 5000);
    } catch {
      setError('Failed to save backend settings');
    } finally {
      setBackendSaving(false);
    }
  };

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

        {/* Backend settings (Electron only) */}
        {isElectron && (
          <div className="settings-section">
            <div className="settings-section-title">Backend</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                InsForge Base URL
                <input
                  className="task-search-input"
                  value={backendUrl}
                  onChange={e => setBackendUrl(e.target.value)}
                  placeholder="https://..."
                  style={{ marginTop: 4 }}
                />
              </label>
              <label style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                Anon Key
                <input
                  className="task-search-input"
                  value={anonKey}
                  onChange={e => setAnonKey(e.target.value)}
                  placeholder="eyJ..."
                  style={{ marginTop: 4 }}
                />
              </label>
              <label style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                Workspace URL
                <input
                  className="task-search-input"
                  value={workspaceUrl}
                  onChange={e => setWorkspaceUrl(e.target.value)}
                  placeholder="https://workspace.openagents.org/..."
                  style={{ marginTop: 4 }}
                />
              </label>
              <label style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                Agent Name
                <input
                  className="task-search-input"
                  value={agentName}
                  onChange={e => setAgentName(e.target.value)}
                  placeholder="os-agent"
                  style={{ marginTop: 4 }}
                />
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button className="settings-btn primary" onClick={handleSaveBackend} disabled={backendSaving}>
                  {backendSaving ? 'Saving...' : 'Save'}
                </button>
                {backendSaved && (
                  <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                    Saved. Reload the app for changes to take effect.
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="settings-section">
          <div className="settings-section-title">Chat Backend</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                aria-hidden="true"
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  backgroundColor: channelHealthy ? '#16a34a' : '#dc2626',
                  display: 'inline-block',
                }}
              />
              <span className="settings-value">
                {channelHealthy ? 'Channel server connected' : 'Channel server unavailable'}
              </span>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input
                type="radio"
                name="chat-backend"
                checked={chatBackend === 'openagents'}
                onChange={() => setChatBackend('openagents')}
              />
              <span>OpenAgents</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input
                type="radio"
                name="chat-backend"
                checked={chatBackend === 'channel'}
                onChange={() => setChatBackend('channel')}
              />
              <span>Claude Code Channel</span>
            </label>
          </div>
        </div>

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
