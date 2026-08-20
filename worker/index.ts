import { Hono } from 'hono';
import {
  POSTER_PLAN_PROMPT_VERSION,
  POSTER_PLAN_SCHEMA_VERSION,
  POSTER_RECIPE_CATALOG_VERSION,
  PosterDesignPlanSchema,
  PosterPlanRequestSchema,
  createFallbackPosterPlan,
  type PosterPlanRequest,
} from '../shared/ai/posterPlan';
import {
  POSTER_RECONSTRUCTION_PROMPT_VERSION,
  POSTER_RECONSTRUCTION_SCHEMA_VERSION,
  PosterReconstructionPlanSchema,
  PosterReconstructionRequestSchema,
  createFallbackReconstructionPlan,
  type PosterReconstructionRequest,
} from '../shared/ai/posterReconstruction';
import { OpenAiPlannerError, planPosterWithOpenAI } from './ai/openAiPosterPlanner';
import { reconstructPosterWithOpenAI } from './ai/openAiPosterReconstructor';
import { parsePosterDocument } from './domain/document';
import { parseRecordingSession } from './domain/recording';

type Variables = {
  ownerId: string;
  requestId: string;
};

type ProjectRow = {
  id: string;
  title: string;
  width: number;
  height: number;
  element_count: number;
  updated_at: string;
};

type AssetRow = {
  id: string;
  r2_key: string;
  media_type: string;
  file_name: string;
};

type RecordingRow = {
  id: string;
  name: string;
  command_count: number;
  started_at: string;
  ended_at: string | null;
};

type AiPosterPlanRow = {
  spec_json: string;
  model: string;
};

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use('/api/*', async (context, next) => {
  const requestId = crypto.randomUUID();
  context.set('requestId', requestId);
  const developmentMode = String(context.env.APP_ENV) === 'development';
  const accessIdentity = context.req.header('cf-access-authenticated-user-email');
  const developmentHeader = developmentMode
    ? context.req.header('x-easyposter-owner')
    : undefined;
  const developmentIdentity =
    developmentHeader ||
    (developmentMode
      ? readCookie(context.req.header('cookie'), 'easyposter_dev_owner')
      : undefined);
  const ownerId = accessIdentity || developmentIdentity;

  if (!ownerId) {
    return context.json(
      {
        error: 'Authentication required.',
        requestId,
      },
      401,
    );
  }

  context.set('ownerId', ownerId);
  if (developmentMode && developmentHeader) {
    context.header(
      'set-cookie',
      `easyposter_dev_owner=${encodeURIComponent(developmentHeader)}; Path=/; HttpOnly; SameSite=Strict`,
    );
  }
  await next();
});

app.get('/api/health', (context) =>
  context.json({
    ok: true,
    service: 'easyposter-studio',
    environment: context.env.APP_ENV,
    requestId: context.get('requestId'),
  }),
);

app.post('/api/ai/poster-plan', async (context) => {
  const requestId = context.get('requestId');
  context.header('cache-control', 'private, no-store');
  const contentType = context.req.header('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (contentType !== 'application/json') {
    return context.json(
      { error: 'Content-Type must be application/json.', code: 'INVALID_CONTENT_TYPE', requestId },
      415,
    );
  }

  const raw = await readBoundedText(context.req.raw, maxAiRequestBytes(context.env));
  const parsed = PosterPlanRequestSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    return context.json(
      { error: 'The poster reference or event details are invalid.', code: 'INVALID_AI_REQUEST', requestId },
      400,
    );
  }
  const request = parsed.data;
  const image = parseReferenceImage(request.reference.dataUrl);
  if (!image) {
    return context.json(
      { error: 'Use a PNG, JPEG, or WebP reference image.', code: 'INVALID_REFERENCE_IMAGE', requestId },
      400,
    );
  }

  const developmentMode = String(context.env.APP_ENV) === 'development';
  const apiKey = context.env.OPENAI_API_KEY?.trim();
  const model = context.env.OPENAI_MODEL?.trim() || 'gpt-5.6-luna';
  if (!apiKey) {
    if (!developmentMode) {
      return context.json(
        {
          error: 'AI poster planning is not configured yet.',
          code: 'AI_NOT_CONFIGURED',
          requestId,
        },
        503,
      );
    }
    return context.json({
      plan: createFallbackPosterPlan(request.brief.people.length),
      source: 'fallback',
      model: null,
      requestId,
    });
  }

  const imageDigest = await sha256Hex(image.bytes);
  const cacheKey = await buildPosterPlanCacheKey(request, imageDigest, model, context.env);
  let cached: AiPosterPlanRow | null;
  try {
    cached = await context.env.DB.prepare(
      `SELECT spec_json, model
       FROM ai_poster_plans
       WHERE owner_id = ? AND cache_key = ?`,
    )
      .bind(context.get('ownerId'), cacheKey)
      .first<AiPosterPlanRow>();
  } catch (error) {
    console.error(
      JSON.stringify({
        message: 'AI plan cache unavailable',
        error: error instanceof Error ? error.message : String(error),
        requestId,
      }),
    );
    return context.json(
      {
        error: 'The AI cache is unavailable. Apply the latest D1 migration.',
        code: 'AI_CACHE_UNAVAILABLE',
        requestId,
      },
      503,
    );
  }

  if (cached) {
    const cachedPlan = PosterDesignPlanSchema.safeParse(JSON.parse(cached.spec_json));
    if (cachedPlan.success) {
      await context.env.DB.prepare(
        `UPDATE ai_poster_plans SET last_used_at = ?
         WHERE owner_id = ? AND cache_key = ?`,
      )
        .bind(new Date().toISOString(), context.get('ownerId'), cacheKey)
        .run();
      return context.json({
        plan: cachedPlan.data,
        source: 'cache',
        model: cached.model,
        requestId,
      });
    }
  }

  const quota = maxAiGenerationsPerDay(context.env);
  const now = new Date();
  const usageDate = now.toISOString().slice(0, 10);
  const reserved = await context.env.DB.prepare(
    `INSERT INTO ai_usage_daily (owner_id, usage_date, generation_count, updated_at)
     VALUES (?, ?, 1, ?)
     ON CONFLICT(owner_id, usage_date) DO UPDATE SET
       generation_count = ai_usage_daily.generation_count + 1,
       updated_at = excluded.updated_at
     WHERE ai_usage_daily.generation_count < ?
     RETURNING generation_count`,
  )
    .bind(context.get('ownerId'), usageDate, now.toISOString(), quota)
    .first<{ generation_count: number }>();
  if (!reserved) {
    return context.json(
      {
        error: `The daily AI poster limit of ${quota} has been reached.`,
        code: 'AI_DAILY_LIMIT',
        requestId,
      },
      429,
    );
  }

  try {
    const result = await planPosterWithOpenAI({ apiKey, model, request });
    const createdAt = new Date().toISOString();
    await context.env.DB.prepare(
      `INSERT INTO ai_poster_plans (
         id, owner_id, cache_key, schema_version, prompt_version, model,
         spec_json, input_tokens, output_tokens, openai_request_id, created_at, last_used_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(owner_id, cache_key) DO UPDATE SET
         spec_json = excluded.spec_json,
         input_tokens = excluded.input_tokens,
         output_tokens = excluded.output_tokens,
         openai_request_id = excluded.openai_request_id,
         last_used_at = excluded.last_used_at`,
    )
      .bind(
        crypto.randomUUID(),
        context.get('ownerId'),
        cacheKey,
        POSTER_PLAN_SCHEMA_VERSION,
        context.env.AI_PROMPT_VERSION || POSTER_PLAN_PROMPT_VERSION,
        model,
        JSON.stringify(result.plan),
        result.inputTokens,
        result.outputTokens,
        result.openAiRequestId,
        createdAt,
        createdAt,
      )
      .run();
    return context.json({ plan: result.plan, source: 'openai', model, requestId });
  } catch (error) {
    if (error instanceof OpenAiPlannerError) {
      console.warn(
        JSON.stringify({
          message: 'OpenAI poster planning failed',
          code: error.code,
          status: error.status,
          requestId,
        }),
      );
      return context.json(
        { error: error.message, code: error.code, requestId },
        error.status as 422 | 429 | 502 | 503 | 504,
      );
    }
    throw error;
  }
});

app.post('/api/ai/poster-reconstruction', async (context) => {
  const requestId = context.get('requestId');
  context.header('cache-control', 'private, no-store');
  const contentType = context.req.header('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (contentType !== 'application/json') {
    return context.json(
      { error: 'Content-Type must be application/json.', code: 'INVALID_CONTENT_TYPE', requestId },
      415,
    );
  }

  const raw = await readBoundedText(context.req.raw, maxAiRequestBytes(context.env));
  const parsed = PosterReconstructionRequestSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    return context.json(
      { error: 'The poster reference is invalid.', code: 'INVALID_AI_REQUEST', requestId },
      400,
    );
  }
  const request = parsed.data;
  const image = parseReferenceImage(request.reference.dataUrl);
  if (!image) {
    return context.json(
      { error: 'Use a PNG, JPEG, or WebP reference image.', code: 'INVALID_REFERENCE_IMAGE', requestId },
      400,
    );
  }

  const developmentMode = String(context.env.APP_ENV) === 'development';
  const apiKey = context.env.OPENAI_API_KEY?.trim();
  const model = context.env.OPENAI_MODEL?.trim() || 'gpt-5.6-luna';
  if (!apiKey) {
    if (!developmentMode) {
      return context.json(
        {
          error: 'AI template reconstruction is not configured yet.',
          code: 'AI_NOT_CONFIGURED',
          requestId,
        },
        503,
      );
    }
    return context.json({
      plan: createFallbackReconstructionPlan(),
      source: 'fallback',
      model: null,
      requestId,
    });
  }

  const imageDigest = await sha256Hex(image.bytes);
  const cacheKey = await buildPosterReconstructionCacheKey(request, imageDigest, model);
  let cached: AiPosterPlanRow | null;
  try {
    cached = await context.env.DB.prepare(
      `SELECT spec_json, model
       FROM ai_poster_plans
       WHERE owner_id = ? AND cache_key = ?`,
    )
      .bind(context.get('ownerId'), cacheKey)
      .first<AiPosterPlanRow>();
  } catch (error) {
    console.error(
      JSON.stringify({
        message: 'AI reconstruction cache unavailable',
        error: error instanceof Error ? error.message : String(error),
        requestId,
      }),
    );
    return context.json(
      {
        error: 'The AI cache is unavailable. Apply the latest D1 migration.',
        code: 'AI_CACHE_UNAVAILABLE',
        requestId,
      },
      503,
    );
  }

  if (cached) {
    const cachedPlan = PosterReconstructionPlanSchema.safeParse(JSON.parse(cached.spec_json));
    if (cachedPlan.success) {
      await context.env.DB.prepare(
        `UPDATE ai_poster_plans SET last_used_at = ?
         WHERE owner_id = ? AND cache_key = ?`,
      )
        .bind(new Date().toISOString(), context.get('ownerId'), cacheKey)
        .run();
      return context.json({
        plan: cachedPlan.data,
        source: 'cache',
        model: cached.model,
        requestId,
      });
    }
  }

  const quota = maxAiGenerationsPerDay(context.env);
  const now = new Date();
  const usageDate = now.toISOString().slice(0, 10);
  const reserved = await context.env.DB.prepare(
    `INSERT INTO ai_usage_daily (owner_id, usage_date, generation_count, updated_at)
     VALUES (?, ?, 1, ?)
     ON CONFLICT(owner_id, usage_date) DO UPDATE SET
       generation_count = ai_usage_daily.generation_count + 1,
       updated_at = excluded.updated_at
     WHERE ai_usage_daily.generation_count < ?
     RETURNING generation_count`,
  )
    .bind(context.get('ownerId'), usageDate, now.toISOString(), quota)
    .first<{ generation_count: number }>();
  if (!reserved) {
    return context.json(
      {
        error: `The daily AI poster limit of ${quota} has been reached.`,
        code: 'AI_DAILY_LIMIT',
        requestId,
      },
      429,
    );
  }

  try {
    const result = await reconstructPosterWithOpenAI({ apiKey, model, request });
    const createdAt = new Date().toISOString();
    await context.env.DB.prepare(
      `INSERT INTO ai_poster_plans (
         id, owner_id, cache_key, schema_version, prompt_version, model,
         spec_json, input_tokens, output_tokens, openai_request_id, created_at, last_used_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(owner_id, cache_key) DO UPDATE SET
         spec_json = excluded.spec_json,
         input_tokens = excluded.input_tokens,
         output_tokens = excluded.output_tokens,
         openai_request_id = excluded.openai_request_id,
         last_used_at = excluded.last_used_at`,
    )
      .bind(
        crypto.randomUUID(),
        context.get('ownerId'),
        cacheKey,
        POSTER_RECONSTRUCTION_SCHEMA_VERSION,
        POSTER_RECONSTRUCTION_PROMPT_VERSION,
        model,
        JSON.stringify(result.plan),
        result.inputTokens,
        result.outputTokens,
        result.openAiRequestId,
        createdAt,
        createdAt,
      )
      .run();
    return context.json({ plan: result.plan, source: 'openai', model, requestId });
  } catch (error) {
    if (error instanceof OpenAiPlannerError) {
      console.warn(
        JSON.stringify({
          message: 'OpenAI poster reconstruction failed',
          code: error.code,
          status: error.status,
          requestId,
        }),
      );
      return context.json(
        { error: error.message, code: error.code, requestId },
        error.status as 422 | 429 | 502 | 503 | 504,
      );
    }
    throw error;
  }
});

app.get('/api/projects', async (context) => {
  const ownerId = context.get('ownerId');
  const result = await context.env.DB.prepare(
    `SELECT id, title, width, height, element_count, updated_at
     FROM projects
     WHERE owner_id = ?
     ORDER BY updated_at DESC
     LIMIT 100`,
  )
    .bind(ownerId)
    .all<ProjectRow>();

  return context.json({
    projects: result.results.map((row) => ({
      id: row.id,
      title: row.title,
      width: row.width,
      height: row.height,
      elementCount: row.element_count,
      updatedAt: row.updated_at,
    })),
    requestId: context.get('requestId'),
  });
});

app.get('/api/projects/:id', async (context) => {
  const id = context.req.param('id');
  const ownerId = context.get('ownerId');
  const row = await context.env.DB.prepare(
    'SELECT r2_key FROM projects WHERE id = ? AND owner_id = ?',
  )
    .bind(id, ownerId)
    .first<{ r2_key: string }>();
  if (!row) return context.json({ error: 'Project not found.' }, 404);

  const object = await context.env.PROJECTS.get(row.r2_key);
  if (!object) {
    console.error(
      JSON.stringify({
        message: 'project metadata points to a missing R2 object',
        projectId: id,
        requestId: context.get('requestId'),
      }),
    );
    return context.json({ error: 'Project data is temporarily unavailable.' }, 503);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', 'private, no-store');
  return new Response(object.body, { headers });
});

app.put('/api/projects/:id', async (context) => {
  const ownerId = context.get('ownerId');
  const id = context.req.param('id');
  const raw = await readBoundedText(context.req.raw, maxProjectBytes(context.env));
  const document = parsePosterDocument(JSON.parse(raw));
  if (document.id !== id) {
    return context.json({ error: 'Project URL and document ID do not match.' }, 400);
  }
  const existing = await context.env.DB.prepare(
    'SELECT owner_id FROM projects WHERE id = ?',
  )
    .bind(id)
    .first<{ owner_id: string }>();
  if (existing && existing.owner_id !== ownerId) {
    return context.json({ error: 'Project identifier is already in use.' }, 409);
  }

  const r2Key = `owners/${encodeURIComponent(ownerId)}/projects/${id}/document.json`;
  await context.env.PROJECTS.put(r2Key, raw, {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
    customMetadata: {
      projectId: id,
      ownerId,
      schemaVersion: String(document.schemaVersion),
    },
  });

  await context.env.DB.prepare(
    `INSERT INTO projects (
       id, owner_id, title, r2_key, schema_version, width, height,
       element_count, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       r2_key = excluded.r2_key,
       schema_version = excluded.schema_version,
       width = excluded.width,
       height = excluded.height,
       element_count = excluded.element_count,
       updated_at = excluded.updated_at
     WHERE projects.owner_id = excluded.owner_id`,
  )
    .bind(
      document.id,
      ownerId,
      document.title,
      r2Key,
      document.schemaVersion,
      document.canvas.width,
      document.canvas.height,
      document.elements.length,
      document.createdAt,
      document.updatedAt,
    )
    .run();

  const assetIds = [
    ...new Set(
      document.elements.flatMap((element) =>
        element.type === 'image' && element.assetId ? [element.assetId] : [],
      ),
    ),
  ];
  if (assetIds.length > 0) {
    await context.env.DB.batch(
      assetIds.map((assetId) =>
        context.env.DB.prepare(
          'UPDATE assets SET project_id = ? WHERE id = ? AND owner_id = ?',
        ).bind(document.id, assetId, ownerId),
      ),
    );
  }

  return context.json(
    {
      ok: true,
      id: document.id,
      updatedAt: document.updatedAt,
      requestId: context.get('requestId'),
    },
    200,
  );
});

app.delete('/api/projects/:id', async (context) => {
  const ownerId = context.get('ownerId');
  const id = context.req.param('id');
  const row = await context.env.DB.prepare(
    'SELECT r2_key FROM projects WHERE id = ? AND owner_id = ?',
  )
    .bind(id, ownerId)
    .first<{ r2_key: string }>();
  if (!row) return context.json({ error: 'Project not found.' }, 404);

  const recordings = await context.env.DB.prepare(
    'SELECT r2_key FROM recording_sessions WHERE project_id = ? AND owner_id = ?',
  )
    .bind(id, ownerId)
    .all<{ r2_key: string }>();
  const recordingKeys = recordings.results.map((recording) => recording.r2_key);
  if (recordingKeys.length > 0) {
    await context.env.PROJECTS.delete(recordingKeys);
  }
  await context.env.PROJECTS.delete(row.r2_key);
  await context.env.DB.prepare(
    'DELETE FROM projects WHERE id = ? AND owner_id = ?',
  )
    .bind(id, ownerId)
    .run();
  return context.body(null, 204);
});

app.put('/api/projects/:projectId/recordings/:recordingId', async (context) => {
  const ownerId = context.get('ownerId');
  const projectId = context.req.param('projectId');
  const recordingId = context.req.param('recordingId');
  const project = await context.env.DB.prepare(
    'SELECT id FROM projects WHERE id = ? AND owner_id = ?',
  )
    .bind(projectId, ownerId)
    .first<{ id: string }>();
  if (!project) {
    return context.json(
      { error: 'Save the project before uploading its recording.' },
      409,
    );
  }

  const raw = await readBoundedText(context.req.raw, maxProjectBytes(context.env));
  const recording = parseRecordingSession(JSON.parse(raw));
  if (recording.id !== recordingId || recording.projectId !== projectId) {
    return context.json({ error: 'Recording identifiers do not match the URL.' }, 400);
  }

  const r2Key = `owners/${encodeURIComponent(ownerId)}/projects/${projectId}/recordings/${recordingId}.json`;
  await context.env.PROJECTS.put(r2Key, raw, {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
    customMetadata: {
      projectId,
      recordingId,
      commandCount: String(recording.commands.length),
    },
  });
  await context.env.DB.prepare(
    `INSERT INTO recording_sessions (
       id, project_id, owner_id, r2_key, name, command_count, started_at, ended_at, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       r2_key = excluded.r2_key,
       name = excluded.name,
       command_count = excluded.command_count,
       ended_at = excluded.ended_at
     WHERE recording_sessions.owner_id = excluded.owner_id`,
  )
    .bind(
      recording.id,
      recording.projectId,
      ownerId,
      r2Key,
      recording.name,
      recording.commands.length,
      recording.startedAt,
      recording.endedAt ?? null,
      new Date().toISOString(),
    )
    .run();

  return context.json({ ok: true, id: recording.id });
});

app.get('/api/projects/:projectId/recordings', async (context) => {
  const ownerId = context.get('ownerId');
  const projectId = context.req.param('projectId');
  const rows = await context.env.DB.prepare(
    `SELECT id, name, command_count, started_at, ended_at
     FROM recording_sessions
     WHERE project_id = ? AND owner_id = ?
     ORDER BY created_at DESC
     LIMIT 100`,
  )
    .bind(projectId, ownerId)
    .all<RecordingRow>();
  return context.json({
    recordings: rows.results.map((row) => ({
      id: row.id,
      name: row.name,
      commandCount: row.command_count,
      startedAt: row.started_at,
      endedAt: row.ended_at,
    })),
  });
});

app.get(
  '/api/projects/:projectId/recordings/:recordingId',
  async (context) => {
    const row = await context.env.DB.prepare(
      `SELECT r2_key
       FROM recording_sessions
       WHERE id = ? AND project_id = ? AND owner_id = ?`,
    )
      .bind(
        context.req.param('recordingId'),
        context.req.param('projectId'),
        context.get('ownerId'),
      )
      .first<{ r2_key: string }>();
    if (!row) return context.json({ error: 'Recording not found.' }, 404);
    const object = await context.env.PROJECTS.get(row.r2_key);
    if (!object) return context.json({ error: 'Recording data is unavailable.' }, 503);
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('cache-control', 'private, no-store');
    return new Response(object.body, { headers });
  },
);

app.post('/api/assets', async (context) => {
  const ownerId = context.get('ownerId');
  const contentLength = parseContentLength(context.req.header('content-length'));
  const maximum = 50 * 1024 * 1024;
  if (contentLength === null || contentLength <= 0 || contentLength > maximum) {
    return context.json(
      { error: 'A content-length between 1 byte and 50 MB is required.' },
      413,
    );
  }
  if (!context.req.raw.body) return context.json({ error: 'Asset body is required.' }, 400);

  const id = crypto.randomUUID();
  const fileName = cleanFileName(context.req.header('x-file-name') || 'asset');
  const mediaType = context.req.header('content-type') || 'application/octet-stream';
  const projectId = context.req.header('x-project-id') || null;
  if (projectId) {
    const project = await context.env.DB.prepare(
      'SELECT id FROM projects WHERE id = ? AND owner_id = ?',
    )
      .bind(projectId, ownerId)
      .first<{ id: string }>();
    if (!project) return context.json({ error: 'Project not found.' }, 404);
  }

  const r2Key = `owners/${encodeURIComponent(ownerId)}/assets/${id}/${encodeURIComponent(fileName)}`;
  await context.env.ASSETS.put(r2Key, context.req.raw.body, {
    httpMetadata: { contentType: mediaType },
    customMetadata: { ownerId, assetId: id, fileName },
  });
  await context.env.DB.prepare(
    `INSERT INTO assets (
       id, owner_id, project_id, r2_key, file_name, media_type, byte_size, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      ownerId,
      projectId,
      r2Key,
      fileName,
      mediaType,
      contentLength,
      new Date().toISOString(),
    )
    .run();

  return context.json(
    {
      id,
      url: `/api/assets/${id}`,
      fileName,
      mediaType,
      byteSize: contentLength,
    },
    201,
  );
});

app.get('/api/assets/:id', async (context) => {
  const row = await context.env.DB.prepare(
    `SELECT id, r2_key, media_type, file_name
     FROM assets
     WHERE id = ? AND owner_id = ?`,
  )
    .bind(context.req.param('id'), context.get('ownerId'))
    .first<AssetRow>();
  if (!row) return context.json({ error: 'Asset not found.' }, 404);

  const object = await context.env.ASSETS.get(row.r2_key);
  if (!object) return context.json({ error: 'Asset data is unavailable.' }, 503);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', 'private, max-age=3600');
  headers.set(
    'content-disposition',
    `inline; filename="${row.file_name.replaceAll('"', '')}"`,
  );
  return new Response(object.body, { headers });
});

app.onError((error, context) => {
  const requestId = context.get('requestId') || crypto.randomUUID();
  console.error(
    JSON.stringify({
      message: 'unhandled request error',
      error: error instanceof Error ? error.message : String(error),
      method: context.req.method,
      path: context.req.path,
      requestId,
    }),
  );
  if (error instanceof SyntaxError) {
    return context.json({ error: 'Invalid JSON.', requestId }, 400);
  }
  if (error instanceof RangeError) {
    return context.json({ error: error.message, requestId }, 413);
  }
  return context.json({ error: 'Internal server error.', requestId }, 500);
});

function maxProjectBytes(env: Env): number {
  const configured = Number(env.MAX_PROJECT_BYTES);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : 15 * 1024 * 1024;
}

function maxAiRequestBytes(env: Env): number {
  const configured = Number(env.MAX_AI_REQUEST_BYTES);
  return Number.isFinite(configured) && configured > 0 ? configured : 3 * 1024 * 1024;
}

function maxAiGenerationsPerDay(env: Env): number {
  const configured = Number(env.MAX_AI_GENERATIONS_PER_DAY);
  return Number.isSafeInteger(configured) && configured > 0 ? configured : 20;
}

async function readBoundedText(request: Request, maximumBytes: number): Promise<string> {
  const contentLength = parseContentLength(request.headers.get('content-length'));
  if (contentLength !== null && contentLength > maximumBytes) {
    throw new RangeError('Request body exceeds the project size limit.');
  }
  if (!request.body) return '';
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let totalBytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      totalBytes += chunk.value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel('Request body is too large.');
        throw new RangeError('Request body exceeds the project size limit.');
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock();
  }
}

function parseReferenceImage(dataUrl: string): { mediaType: string; bytes: Uint8Array } | null {
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\r\n]+)$/);
  if (!match) return null;
  const mediaType = match[1];
  const encoded = match[2];
  if (!mediaType || !encoded) return null;
  try {
    const binary = atob(encoded.replace(/[\r\n]/g, ''));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    if (!matchesImageSignature(mediaType, bytes)) return null;
    return { mediaType, bytes };
  } catch {
    return null;
  }
}

function matchesImageSignature(mediaType: string, bytes: Uint8Array): boolean {
  if (mediaType === 'image/png') {
    return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  }
  if (mediaType === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  return (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  );
}

async function buildPosterPlanCacheKey(
  request: PosterPlanRequest,
  imageDigest: string,
  model: string,
  env: Env,
): Promise<string> {
  const canonical = JSON.stringify({
    imageDigest,
    brief: request.brief,
    quality: request.quality,
    model,
    schemaVersion: POSTER_PLAN_SCHEMA_VERSION,
    promptVersion: env.AI_PROMPT_VERSION || POSTER_PLAN_PROMPT_VERSION,
    recipeCatalogVersion: env.AI_RECIPE_CATALOG_VERSION || POSTER_RECIPE_CATALOG_VERSION,
  });
  return sha256Hex(new TextEncoder().encode(canonical));
}

async function buildPosterReconstructionCacheKey(
  request: PosterReconstructionRequest,
  imageDigest: string,
  model: string,
): Promise<string> {
  const canonical = JSON.stringify({
    purpose: 'poster-reconstruction',
    imageDigest,
    width: request.reference.width,
    height: request.reference.height,
    quality: request.quality,
    model,
    schemaVersion: POSTER_RECONSTRUCTION_SCHEMA_VERSION,
    promptVersion: POSTER_RECONSTRUCTION_PROMPT_VERSION,
  });
  return sha256Hex(new TextEncoder().encode(canonical));
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const stableBytes = new Uint8Array(bytes.byteLength);
  stableBytes.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', stableBytes.buffer);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function parseContentLength(value: string | undefined | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function cleanFileName(value: string): string {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // Preserve the original header value when it is not percent encoded.
  }
  return decoded.replace(/[^\p{L}\p{N}_.\- ]+/gu, '_').slice(0, 180) || 'asset';
}

function readCookie(
  cookieHeader: string | undefined,
  name: string,
): string | undefined {
  if (!cookieHeader) return undefined;
  for (const entry of cookieHeader.split(';')) {
    const separator = entry.indexOf('=');
    if (separator < 0) continue;
    if (entry.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(entry.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export default app;
