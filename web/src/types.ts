export interface DimensionMeta {
  id: string;
  file: string;
  icon: string;
  title: string;
  desc: string;
  nodeW?: number;
  nodeH?: number;
  colSpacing?: number;
}

export interface TreeNode {
  name: string;
  status?: string;
  date?: string;
  desc?: string;
  quotes?: string[];
  feedback?: string;
  structure?: string[];
  verified?: boolean;
  children?: TreeNode[];
  owner?: string;
  supervisor?: string;
  support?: string;
  executor?: string;
  deadline?: string;
  timeline?: string;
}

export interface Competitor {
  name: string;
  category: string;
  threat: 'high' | 'medium' | 'low';
}

export interface CompetitorStage {
  id: string;
  name: string;
  date: string;
  scope: string;
  competitors: Competitor[];
  total: number;
  white_space: string;
  our_position: string;
}

export interface CompetitorData {
  stages: CompetitorStage[];
}

export type ViewType = 'overview' | 'd3' | 'competitor' | 'executive-report';
