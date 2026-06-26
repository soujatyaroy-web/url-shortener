import { FastifyPluginAsync } from 'fastify';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import Redis from 'ioredis';

interface RedirectRequestParams {
  shortCode: string;
}

// Instantiate ONCE at the module level to reuse connection pools globally
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey);
const redis = new Redis(redisUrl);
const CACHE_TTL_SECONDS = 86400; // 24 hours

const redirectRouteSchema = {
  params: {
    type: 'object',
    required: ['shortCode'],
    properties: {
      shortCode: { 
        type: 'string',
        pattern: '^[a-zA-Z0-9]+$'
      }
    },
    additionalProperties: false
  }
};

const redirectRoutes: FastifyPluginAsync = async (fastify, options) => {
  fastify.get<{ Params: RedirectRequestParams }>(
    '/:shortCode',
    { schema: redirectRouteSchema },
    async (request, reply) => {
      const { shortCode } = request.params;
      const cacheKey = `url:cache:${shortCode}`;

      // 1. CACHE READ ATTEMPT
      try {
        const cachedUrl = await redis.get(cacheKey);
        if (cachedUrl) {
          request.log.debug({ shortCode }, 'Cache hit');
          return reply.redirect(302, cachedUrl);
        }
      } catch (redisReadError) {
        request.log.warn({ err: redisReadError }, 'Redis GET failed, falling back to Supabase.');
      }

      // 2. DATABASE FALLBACK (Cache Miss)
      try {
        const { data, error } = await supabase
          .from('urls')
          .select('long_url')
          .eq('short_code', shortCode)
          .single();

        if (error || !data) {
          request.log.info({ shortCode, error }, 'URL not found in database');
          return reply.status(404).send({
            error: 'Not Found',
            message: 'The requested short URL does not exist.'
          });
        }

        const longUrl = data.long_url;

        // 3. NON-BLOCKING CACHE WRITE ATTEMPT
        // Removed 'await' so cache updates occur out-of-band without blocking user redirect response
        redis.setex(cacheKey, CACHE_TTL_SECONDS, longUrl).catch((redisWriteError) => {
          request.log.warn({ err: redisWriteError }, 'Redis SETEX background task failed.');
        });

        // 4. EXECUTE REDIRECT IMMEDIATELY
        return reply.redirect(302, longUrl);

      } catch (dbError) {
        request.log.error({ err: dbError }, 'Unexpected Database error during redirection resolution');
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'An unexpected error occurred while resolving the URL.'
        });
      }
    }
  );
};

export default redirectRoutes;