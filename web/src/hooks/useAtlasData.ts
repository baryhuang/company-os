import { useEffect, useState } from 'react';
import { fetchDimensions, fetchDimensionData, fetchCompetitorData, fetchProgressData, initializeUserData } from '../api';
import type { DimensionMeta, TreeNode, CompetitorData } from '../types';

interface AtlasData {
  dimensions: DimensionMeta[];
  dimensionsData: Record<string, TreeNode>;
  competitorData: CompetitorData | null;
  progressData: TreeNode | null;
  loading: boolean;
  error: string | null;
}

export function useAtlasData(userId: string): AtlasData {
  const [dimensions, setDimensions] = useState<DimensionMeta[]>([]);
  const [dimensionsData, setDimensionsData] = useState<Record<string, TreeNode>>({});
  const [competitorData, setCompetitorData] = useState<CompetitorData | null>(null);
  const [progressData, setProgressData] = useState<TreeNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      const dims = await fetchDimensions(userId);
      if (cancelled) return;
      setDimensions(dims);

      const results = await Promise.all([
        ...dims.map(async (d) => {
          const data = await fetchDimensionData(userId, d.id);
          return { id: d.id, data };
        }),
        fetchCompetitorData(userId).then(data => ({ id: '__comp__', data })),
        fetchProgressData(userId).then(data => ({ id: '__progress__', data })),
      ]);

      if (cancelled) return;

      const dataMap: Record<string, TreeNode> = {};
      for (const r of results) {
        if (r.id === '__comp__') {
          setCompetitorData(r.data as CompetitorData);
        } else if (r.id === '__progress__') {
          setProgressData(r.data as TreeNode);
        } else {
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

  return { dimensions, dimensionsData, competitorData, progressData, loading, error };
}
