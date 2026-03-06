#!/usr/bin/env bun
/**
 * Import landscape.json into atlas_competitors table.
 * Flattens nested categories into one row per company.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const DATA_FILE = join(import.meta.dir, '../data/reports/data/landscape.json');
const API_KEY = process.env.INSFORGE_API_KEY;
const BASE_URL = process.env.INSFORGE_BASE_URL || 'https://gx2m4dge.us-east.insforge.app';
const USER_ID = '__default__';

if (!API_KEY) {
  console.error('Set INSFORGE_API_KEY env var');
  process.exit(1);
}

interface Company {
  name: string;
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
  threat: string;
  transcript_quotes?: string[];
}

interface Subcategory {
  name: string;
  companies: Company[];
}

interface Category {
  name: string;
  best_owner?: string;
  companies?: Company[];
  subcategories?: Subcategory[];
}

interface LandscapeFile {
  title: string;
  subtitle: string;
  last_update?: string;
  our_position: string;
  white_space: string;
  categories: Category[];
}

const landscape: LandscapeFile = JSON.parse(readFileSync(DATA_FILE, 'utf-8'));

// Flatten into rows
interface Row {
  user_id: string;
  section: string;
  best_owner: string | null;
  subcategory: string | null;
  name: string;
  website: string | null;
  category: string | null;
  primary_focus: string | null;
  target_customer: string | null;
  pricing_model: string | null;
  price_range: string | null;
  funding: string | null;
  serves_cna: boolean;
  serves_rn: boolean;
  uses_ai: boolean;
  key_differentiator: string | null;
  relevance: string | null;
  threat: string;
  transcript_quotes: string[] | null;
  sort_order: number;
}

const rows: Row[] = [];
let sortOrder = 0;

for (const cat of landscape.categories) {
  if (cat.companies) {
    for (const c of cat.companies) {
      rows.push({
        user_id: USER_ID,
        section: cat.name,
        best_owner: cat.best_owner || null,
        subcategory: null,
        name: c.name,
        website: c.website || null,
        category: c.category || null,
        primary_focus: c.primary_focus || null,
        target_customer: c.target_customer || null,
        pricing_model: c.pricing_model || null,
        price_range: c.price_range || null,
        funding: c.funding || null,
        serves_cna: c.serves_cna || false,
        serves_rn: c.serves_rn || false,
        uses_ai: c.uses_ai || false,
        key_differentiator: c.key_differentiator || null,
        relevance: c.relevance || null,
        threat: c.threat,
        transcript_quotes: c.transcript_quotes || null,
        sort_order: sortOrder++,
      });
    }
  }
  if (cat.subcategories) {
    for (const sub of cat.subcategories) {
      for (const c of sub.companies) {
        rows.push({
          user_id: USER_ID,
          section: cat.name,
          best_owner: cat.best_owner || null,
          subcategory: sub.name,
          name: c.name,
          website: c.website || null,
          category: c.category || null,
          primary_focus: c.primary_focus || null,
          target_customer: c.target_customer || null,
          pricing_model: c.pricing_model || null,
          price_range: c.price_range || null,
          funding: c.funding || null,
          serves_cna: c.serves_cna || false,
          serves_rn: c.serves_rn || false,
          uses_ai: c.uses_ai || false,
          key_differentiator: c.key_differentiator || null,
          relevance: c.relevance || null,
          threat: c.threat,
          transcript_quotes: c.transcript_quotes || null,
          sort_order: sortOrder++,
        });
      }
    }
  }
}

console.log(`Flattened ${rows.length} companies from ${landscape.categories.length} sections`);

// Also update the slim metadata doc
const metaDoc = {
  title: landscape.title,
  subtitle: landscape.subtitle,
  last_update: landscape.last_update,
  our_position: landscape.our_position,
  white_space: landscape.white_space,
};

// Upsert metadata into atlas_documents
const metaResp = await fetch(`${BASE_URL}/api/database/records/atlas_documents?user_id=eq.${USER_ID}&doc_key=eq.landscape`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
  body: JSON.stringify({ data: metaDoc, updated_at: new Date().toISOString() }),
});
if (!metaResp.ok) {
  // Insert if patch found nothing
  await fetch(`${BASE_URL}/api/database/records/atlas_documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
    body: JSON.stringify([{ user_id: USER_ID, doc_key: 'landscape', data: metaDoc }]),
  });
}
console.log('Updated landscape metadata doc');

// Delete existing rows for this user, then insert fresh
const delResp = await fetch(`${BASE_URL}/api/database/records/atlas_competitors?user_id=eq.${USER_ID}`, {
  method: 'DELETE',
  headers: { 'Authorization': `Bearer ${API_KEY}` },
});
console.log(`Deleted old rows: ${delResp.status}`);

// Insert in batches of 50
const BATCH = 50;
let inserted = 0;
for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH);
  const resp = await fetch(`${BASE_URL}/api/database/records/atlas_competitors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
    body: JSON.stringify(batch),
  });
  if (!resp.ok) {
    console.error(`Insert batch ${i} failed: ${resp.status} ${await resp.text()}`);
  } else {
    inserted += batch.length;
  }
}

console.log(`Inserted ${inserted} competitor rows`);
