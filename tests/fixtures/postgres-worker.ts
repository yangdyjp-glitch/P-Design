import { withPostgres } from '../../server/database';
import { currentDatabase } from '../../db/context';

export default { async fetch(request: Request, env: any, ctx: ExecutionContext) {
  try {
    return await withPostgres(env, ctx.waitUntil.bind(ctx), async () => {
      const row = await currentDatabase()!.database.prepare('SELECT ?::integer AS probe').bind(42).first();
      return Response.json(row);
    });
  } catch (error) {
    return Response.json({ error: 'POSTGRES_CONNECTION_FAILED' }, { status: 503 });
  }
} };
