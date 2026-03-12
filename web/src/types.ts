export interface DimensionMeta {
  id: string;
  file?: string;
  icon: string;
  title: string;
  desc: string;
  group?: string;
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

export interface CompetitorRow {
  name: string;
  section: string;
  best_owner?: string;
  subcategory?: string;
  threat: 'high' | 'medium' | 'low';
  date?: string;
  website?: string;
  category?: string;
  primary_focus?: string;
  target_customer?: string;
  pricing_model?: string;
  price_range?: string;
  funding?: string;
  serves_cna?: boolean;
  serves_rn?: boolean;
  uses_ai?: boolean;
  key_differentiator?: string;
  relevance?: string;
  transcript_quotes?: string[];
  sort_order?: number;
}

export interface LandscapeMeta {
  title: string;
  subtitle: string;
  last_update?: string;
  our_position: string;
  white_space: string;
}

export interface LandscapeData {
  meta: LandscapeMeta;
  competitors: CompetitorRow[];
}

export interface LinearTask {
  ID: string;
  Title: string;
  Description: string;
  Status: string;
  Priority: string;
  Project: string;
  Assignee: string;
  Labels: string;
  Created: string;
  Updated: string;
  'Due Date': string;
  'Parent issue': string;
  'Related to': string;
  'Blocked by': string;
  'Duplicate of': string;
  similarity?: number;
}

export interface AIQueryColumn {
  header: string;
  key: string;
}

export interface AIQueryResult {
  title: string;
  columns: AIQueryColumn[];
  rows: Record<string, string>[];
  summary?: string;
}

export interface Appointment {
  id: string;
  person: string;
  what: string;
  type: string;
  date: string | null;
  date_precision: string;
  date_end?: string;
  time: string | null;
  location: string | null;
  format: string;
  owner: string;
  participants: string[];
  depends_on: string[];
  followup_action: string;
  remind_date: string | null;
  priority: string;
  status: string;
  source_date: string;
  quote: string;
  urgency: 'overdue' | 'this_week' | 'next_week' | 'upcoming' | 'no_date' | 'done';
}

export interface AppointmentsData {
  name: string;
  generated: string;
  total: number;
  summary: Record<string, number>;
  appointments: Appointment[];
}

export type ViewType = 'overview' | 'd3' | 'competitor' | 'tasks' | 'vem' | 'partners';
