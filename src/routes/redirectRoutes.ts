import { FastifyPluginAsync } from 'fastify';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import Redis from 'ioredis';

interface RedirectRequestParams {
  shortCode: string;
}

// Instantiate ONCE at the module level to reuse connection pools globally
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';
const redisUrl = process.env.REDIS_URL?.trim();

const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey);
let redisClient: Redis | null = null;

const getRedisClient = (): Redis | null => {
  if (!redisUrl || process.env.REDIS_DISABLED === 'true') {
    return null;
  }

  if (!redisClient) {
    redisClient = new Redis(redisUrl);
    if (typeof redisClient.on === 'function') {
      redisClient.on('error', (error) => {
        console.warn('Redis connection warning:', error.message || error);
      });
    }
  }

  return redisClient;
};

const CACHE_TTL_SECONDS = 86400; // 24 hours

const redirectWithStatus = (reply: any, statusCode: number, targetUrl: string) => {
  if (typeof reply?.code === 'function') {
    return reply.code(statusCode).redirect(targetUrl);
  }

  return reply.redirect(statusCode, targetUrl);
};

const sendWithStatus = (reply: any, statusCode: number, payload: unknown) => {
  if (typeof reply?.status === 'function') {
    const statusReply = reply.status(statusCode);
    if (statusReply && typeof statusReply.send === 'function') {
      return statusReply.send(payload);
    }
  }

  if (typeof reply?.send === 'function') {
    return reply.send(payload);
  }

  return payload;
};

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
      const redis = getRedisClient();

      // 1. CACHE READ ATTEMPT
      if (redis) {
        try {
          const cachedUrl = await redis.get(cacheKey);
          if (cachedUrl) {
            request.log.debug({ shortCode }, 'Cache hit');
            return redirectWithStatus(reply, 302, String(cachedUrl));
          }
        } catch (redisReadError) {
          request.log.warn({ err: redisReadError }, 'Redis GET failed, falling back to Supabase.');
        }
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
          return sendWithStatus(reply, 404, {
            error: 'Not Found',
            message: 'The requested short URL does not exist.'
          });
        }

        const longUrl = String(data.long_url);

        // 3. NON-BLOCKING CACHE WRITE ATTEMPT
        // Removed 'await' so cache updates occur out-of-band without blocking user redirect response
        if (redis) {
          redis.setex(cacheKey, CACHE_TTL_SECONDS, longUrl).catch((redisWriteError) => {
            request.log.warn({ err: redisWriteError }, 'Redis SETEX background task failed.');
          });
        }

        // 4. EXECUTE REDIRECT IMMEDIATELY
        return redirectWithStatus(reply, 302, longUrl);

      } catch (dbError) {
        request.log.error({ err: dbError }, 'Unexpected Database error during redirection resolution');
        return sendWithStatus(reply, 500, {
          error: 'Internal Server Error',
          message: 'An unexpected error occurred while resolving the URL.'
        });
      }
    }
  );
};

export default redirectRoutes;