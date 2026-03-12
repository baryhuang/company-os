import { useEffect, useState, useCallback } from 'react';
import { fetchUserWorkspaces } from '../api';
import type { Workspace } from '../types';

const LS_KEY = 'atlas_workspace';

interface UseWorkspaceResult {
  workspace: Workspace | null;
  workspaces: Workspace[];
  loading: boolean;
  needsPicker: boolean;
  selectWorkspace: (ownerId: string) => void;
}

export function useWorkspace(user: { id: string; email?: string } | null): UseWorkspaceResult {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsPicker, setNeedsPicker] = useState(false);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    async function load() {
      const email = user!.email?.toLowerCase() ?? '';
      const rows = await fetchUserWorkspaces(email);

      if (cancelled) return;

      // Build workspace list: always include own workspace + any invited ones
      const wsMap = new Map<string, Workspace>();

      // Own workspace is always present
      wsMap.set(user!.id, {
        ownerId: user!.id,
        name: 'My Workspace',
        isOwner: true,
      });

      // Add invited workspaces from DB
      for (const row of rows) {
        const isOwner = row.owner_id === user!.id;
        wsMap.set(row.owner_id, {
          ownerId: row.owner_id,
          name: row.workspace_name,
          isOwner,
        });
      }

      const wsList = Array.from(wsMap.values());
      setWorkspaces(wsList);

      // Check localStorage for previous selection
      const saved = localStorage.getItem(LS_KEY);
      const savedWs = saved ? wsList.find(w => w.ownerId === saved) : null;

      if (savedWs) {
        setWorkspace(savedWs);
        setNeedsPicker(false);
      } else if (wsList.length === 1) {
        setWorkspace(wsList[0]);
        localStorage.setItem(LS_KEY, wsList[0].ownerId);
        setNeedsPicker(false);
      } else {
        setNeedsPicker(true);
      }

      setLoading(false);
    }

    load().catch(() => {
      if (!cancelled) {
        // Fallback: just use own workspace
        const own: Workspace = { ownerId: user!.id, name: 'My Workspace', isOwner: true };
        setWorkspaces([own]);
        setWorkspace(own);
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [user]);

  const selectWorkspace = useCallback((ownerId: string) => {
    const ws = workspaces.find(w => w.ownerId === ownerId);
    if (ws) {
      setWorkspace(ws);
      setNeedsPicker(false);
      localStorage.setItem(LS_KEY, ownerId);
    }
  }, [workspaces]);

  return { workspace, workspaces, loading, needsPicker, selectWorkspace };
}
