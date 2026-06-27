import { FastifyPluginAsync } from 'fastify';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { promises as dns } from 'dns';
import { Base62Service } from '../services/Base62Service';

interface ShortenRequestBody {
  long_url: string;
}

// Instantiate ONCE at module level to optimize memory and keep handlers hot
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';
const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey);
const base62 = new Base62Service();

const shortenRouteSchema = {
  body: {
    type: 'object',
    required: ['long_url'],
    properties: {
      long_url: { 
        type: 'string', 
        format: 'uri'
      }
    },
    additionalProperties: false
  },
  response: {
    211: {
      type: 'object',
      properties: {
        short_code: { type: 'string' },
        short_url: { type: 'string' }
      }
    }
  }
};

const isValidLongUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }

    const hostname = parsed.hostname;
    if (!hostname) {
      return false;
    }

    const isIp = /^\d+\.\d+\.\d+\.\d+$/.test(hostname);
    if (isIp) {
      return hostname.split('.').every((segment) => {
        const num = Number(segment);
        return Number.isInteger(num) && num >= 0 && num <= 255;
      });
    }

    return hostname === 'localhost' || hostname.includes('.');
  } catch {
    return false;
  }
};

const isResolvableHost = async (value: string) => {
  try {
    const parsed = new URL(value);
    await dns.lookup(parsed.hostname);
    return true;
  } catch {
    return false;
  }
};

const urlRoutes: FastifyPluginAsync = async (fastify, options) => {
  const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

  fastify.post<{ Body: ShortenRequestBody }>(
    '/api/v1/shorten',
    { schema: shortenRouteSchema },
    async (request, reply) => {
      let insertedId: number | null = null;

      try {
        const { long_url } = request.body;

        if (!isValidLongUrl(long_url)) {
          return reply.status(400).send({
            error: 'Invalid URL',
            message: 'URL must be a valid http:// or https:// address.'
          });
        }

        if (!(await isResolvableHost(long_url))) {
          return reply.status(400).send({
            error: 'Invalid URL',
            message: 'URL host could not be resolved. Please enter a valid URL.'
          });
        }

        // Step 1: Insert to get a sequence ID
        const { data: insertData, error: insertError } = await supabase
          .from('urls')
          .insert([{ long_url }])
          .select('id')
          .single();

        if (insertError || !insertData) {
          request.log.error({ err: insertError }, 'Failed insert');
          return reply.status(500).send({ error: 'Internal Error', message: 'Database failure.' });
        }

        insertedId = insertData.id;
        const short_code = base62.encode(insertedId as number);

        // Step 2: Finalize entry
        const { error: updateError } = await supabase
          .from('urls')
          .update({ short_code })
          .eq('id', insertedId);

        if (updateError) {
          // DEFENSIVE LAYER: Instantly purge the orphaned row to prevent a schema NULL validation deadlock
          await supabase.from('urls').delete().eq('id', insertedId);
          
          request.log.error({ err: updateError }, 'Failed to write short_code, rolling back insert');
          return reply.status(500).send({ error: 'Internal Error', message: 'Failed to finalize serialization.' });
        }

        return reply.status(211).send({
          short_code,
          short_url: `${BASE_URL}/${short_code}`
        });

      } catch (error) {
        if (insertedId) {
          // Safety cleanup catch-all
          try {
            await supabase.from('urls').delete().eq('id', insertedId);
          } catch {
            // ignore cleanup failure
          }
        }
        request.log.error({ err: error }, 'Unexpected router crash');
        return reply.status(500).send({ error: 'Internal Error', message: 'An unexpected exception occurred.' });
      }
    }
  );
};

export default urlRoutes;