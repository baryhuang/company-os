import { useEffect, useState } from 'react';
import { fetchDimensions, fetchDimensionData, fetchProgressData, fetchLandscapeData, fetchAppointmentsData, initializeUserData } from '../api';
import type { DimensionMeta, TreeNode, LandscapeData, AppointmentsData } from '../types';

interface AtlasData {
  dimensions: DimensionMeta[];
  dimensionsData: Record<string, TreeNode>;
  landscapeData: LandscapeData | null;
  progressData: TreeNode | null;
  appointmentsData: AppointmentsData | null;
  loading: boolean;
  error: string | null;
}

export function useAtlasData(userId: string): AtlasData {
  const [dimensions, setDimensions] = useState<DimensionMeta[]>([]);
  const [dimensionsData, setDimensionsData] = useState<Record<string, TreeNode>>({});
  const [landscapeData, setLandscapeData] = useState<LandscapeData | null>(null);
  const [progressData, setProgressData] = useState<TreeNode | null>(null);
  const [appointmentsData, setAppointmentsData] = useState<AppointmentsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      const dims = await fetchDimensions(userId);
      if (cancelled) return;
      setDimensions(dims);

      const results = await Promise.all([
        ...dims.filter(d => d.file).map(async (d) => {
          try {
            const data = await fetchDimensionData(userId, d.id);
            return { id: d.id, data };
          } catch {
            console.warn(`Failed to load dimension: ${d.id}`);
            return { id: d.id, data: null };
          }
        }),
        fetchLandscapeData(userId).then(data => ({ id: '__landscape__', data })).catch(() => ({ id: '__landscape__', data: null })),
        fetchProgressData(userId).then(data => ({ id: '__progress__', data })).catch(() => ({ id: '__progress__', data: null })),
        fetchAppointmentsData(userId).then(data => ({ id: '__appointments__', data })).catch(() => ({ id: '__appointments__', data: null })),
      ]);

      if (cancelled) return;

      const dataMap: Record<string, TreeNode> = {};
      for (const r of results) {
        if (r.id === '__landscape__') {
          setLandscapeData(r.data as LandscapeData);
        } else if (r.id === '__progress__') {
          setProgressData(r.data as TreeNode);
        } else if (r.id === '__appointments__') {
          setAppointmentsData(r.data as AppointmentsData);
        } else if (r.data) {
          dataMap[r.id] = r.data as TreeNode;
        }
      }
      setDimensionsData(dataMap);
    }

    async function load() {
      try {
        await loadData();
      } catch {
        // First load failed — initialize user data from defaults and retry
        if (cancelled) return;
        try {
          await initializeUserData(userId);
          if (cancelled) return;
          await loadData();
        } catch (retryErr) {
          if (!cancelled) {
            setError(retryErr instanceof Error ? retryErr.message : String(retryErr));
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [userId]);

  return { dimensions, dimensionsData, landscapeData, progressData, appointmentsData, loading, error };
}
