import { pgSchema, text, integer, bigint, primaryKey, index, uniqueIndex } from 'drizzle-orm/pg-core';

const tuxu = pgSchema('tuxu');
const milliseconds = (name: string) => bigint(name, { mode: 'number' });

export const projects = tuxu.table('projects', {
  userId: text('user_id').notNull(), id: text('id').notNull(), name: text('name').notNull(),
  data: text('data').notNull(), revision: integer('revision').notNull().default(1),
  createdAt: milliseconds('created_at').notNull(), updatedAt: milliseconds('updated_at').notNull(),
}, t => [primaryKey({ columns: [t.userId, t.id] }), index('projects_owner_updated').on(t.userId, t.updatedAt)]);

export const assets = tuxu.table('assets', {
  id: text('id').primaryKey(), userId: text('user_id').notNull(), projectId: text('project_id').notNull(),
  objectKey: text('object_key').notNull(), name: text('name').notNull(), mime: text('mime').notNull(),
  size: integer('size').notNull(), generated: integer('generated').notNull().default(0),
  source: text('source').notNull().default('upload'), sourceUrl: text('source_url'), imageUrl: text('image_url'),
  createdAt: milliseconds('created_at').notNull(),
}, t => [index('assets_owner_project').on(t.userId, t.projectId)]);

export const jobs = tuxu.table('jobs', {
  id: text('id').primaryKey(), userId: text('user_id').notNull(), projectId: text('project_id').notNull(),
  requestId: text('request_id').notNull(), kind: text('kind').notNull(), prompt: text('prompt').notNull(),
  skillIds: text('skill_ids').notNull(), snapshot: text('snapshot').notNull(), baseRevision: integer('base_revision').notNull(),
  status: text('status').notNull(), sessionId: text('session_id'), environmentId: text('environment_id'), turnId: text('turn_id'),
  providerFiles: text('provider_files').notNull().default('[]'), imageState: text('image_state'), searchState: text('search_state'),
  result: text('result'), error: text('error'), leaseUntil: milliseconds('lease_until').notNull().default(0),
  createdAt: milliseconds('created_at').notNull(), updatedAt: milliseconds('updated_at').notNull(),
}, t => [index('jobs_owner_created').on(t.userId, t.createdAt), uniqueIndex('jobs_request_id').on(t.userId, t.requestId)]);

export const settings = tuxu.table('settings', { key: text('key').primaryKey(), value: text('value').notNull() });
export const webhookInbox = tuxu.table('webhook_inbox', {
  id: text('id').primaryKey(), sessionId: text('session_id'), done: integer('done').notNull().default(0),
  createdAt: milliseconds('created_at').notNull(),
});
