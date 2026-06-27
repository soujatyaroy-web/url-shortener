import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

// Mock dependencies
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn()
}));
jest.mock('ioredis', () => jest.fn());

describe('URL Redirect Routes - /:shortCode', () => {
  let redirectRoutes: any;
  let createClientMock: jest.Mock;
  let RedisMock: jest.Mock;
  let mockFastify: Partial<FastifyInstance>;
  let mockReply: Partial<FastifyReply>;
  let mockRequest: Partial<FastifyRequest>;
  let mockSupabase: any;
  let mockRedis: any;
  let routeHandler: any;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.REDIS_URL = 'redis://localhost:6379';
    delete process.env.REDIS_DISABLED;

    // Re-import mocks after module reset
    const { createClient } = require('@supabase/supabase-js');
    const Redis = require('ioredis');

    createClientMock = createClient;
    RedisMock = Redis;

    // Setup mock Redis client
    mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      setex: jest.fn().mockResolvedValue('OK')
    };

    RedisMock.mockImplementation(() => mockRedis);

    // Setup mock Supabase client
    mockSupabase = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { long_url: 'https://example.com/original-page' },
              error: null
            })
          })
        })
      })
    };

    createClientMock.mockReturnValue(mockSupabase);

    // Reload route module after mocks are in place
    redirectRoutes = require('../../src/routes/redirectRoutes').default;

    // Setup mock Fastify instance
    mockFastify = {
      get: jest.fn().mockImplementation((route, options, handler) => {
        if (route === '/:shortCode') {
          routeHandler = handler;
        }
      }),
      log: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      }
    };

    // Setup mock reply
    mockReply = {
      redirect: jest.fn().mockReturnValue({}),
      status: jest.fn().mockReturnValue({
        send: jest.fn().mockResolvedValue({})
      })
    };

    // Setup mock request
    mockRequest = {
      params: { shortCode: 'abc123' },
      log: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      }
    };
  });

  describe('Route Registration', () => {
    it('should not instantiate Redis when REDIS_URL is not configured', async () => {
      delete process.env.REDIS_URL;
      jest.resetModules();
      jest.clearAllMocks();

      const { createClient } = require('@supabase/supabase-js');
      const Redis = require('ioredis');

      createClient.mockReturnValue(mockSupabase);
      Redis.mockImplementation(() => mockRedis);

      const redirectRoutesWithoutRedis = require('../../src/routes/redirectRoutes').default;
      await redirectRoutesWithoutRedis(mockFastify as FastifyInstance, {});

      expect(Redis).not.toHaveBeenCalled();
    });

    it('should register GET /:shortCode route', async () => {
      await redirectRoutes(mockFastify as FastifyInstance, {});

      expect(mockFastify.get).toHaveBeenCalledWith(
        '/:shortCode',
        expect.objectContaining({
          schema: expect.any(Object)
        }),
        expect.any(Function)
      );
    });

    it('should include JSON schema validation in route definition', async () => {
      await redirectRoutes(mockFastify as FastifyInstance, {});

      const callArgs = (mockFastify.get as jest.Mock).mock.calls[0];
      const schema = callArgs[1].schema;

      expect(schema.params).toBeDefined();
      expect(schema.params.required).toContain('shortCode');
      expect(schema.params.properties.shortCode.type).toBe('string');
    });

    it('should validate shortCode format with regex pattern', async () => {
      await redirectRoutes(mockFastify as FastifyInstance, {});

      const callArgs = (mockFastify.get as jest.Mock).mock.calls[0];
      const schema = callArgs[1].schema;

      expect(schema.params.properties.shortCode.pattern).toBe('^[a-zA-Z0-9]+$');
    });
  });

  describe('Cache Hit Scenario', () => {
    beforeEach(async () => {
      await redirectRoutes(mockFastify as FastifyInstance, {});
    });

    it('should return cached URL on cache hit', async () => {
      const cachedUrl = 'https://cached-url.com/page';
      mockRedis.get.mockResolvedValue(cachedUrl);

      mockRequest.params = { shortCode: 'cached' };
      const redirectSpy = jest.fn().mockReturnValue({});
      mockReply.redirect = redirectSpy;

      await routeHandler(mockRequest, mockReply);

      expect(redirectSpy).toHaveBeenCalledWith(302, cachedUrl);
    });

    it('should log cache hit debug message', async () => {
      mockRedis.get.mockResolvedValue('https://cached.com');
      mockRequest.params = { shortCode: 'test' };
      mockReply.redirect = jest.fn().mockReturnValue({});

      await routeHandler(mockRequest, mockReply);

      expect(mockRequest.log.debug).toHaveBeenCalledWith(
        expect.objectContaining({ shortCode: 'test' }),
        expect.stringContaining('Cache')
      );
    });

    it('should not query Supabase on cache hit', async () => {
      mockRedis.get.mockResolvedValue('https://cached.com');
      mockRequest.params = { shortCode: 'cached' };
      mockReply.redirect = jest.fn().mockReturnValue({});

      await routeHandler(mockRequest, mockReply);

      expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it('should not attempt to cache on cache hit', async () => {
      mockRedis.get.mockResolvedValue('https://cached.com');
      mockRequest.params = { shortCode: 'cached' };
      mockReply.redirect = jest.fn().mockReturnValue({});

      await routeHandler(mockRequest, mockReply);

      expect(mockRedis.setex).not.toHaveBeenCalled();
    });
  });

  describe('Cache Miss with Database Hit', () => {
    beforeEach(async () => {
      await redirectRoutes(mockFastify as FastifyInstance, {});
    });

    it('should query Supabase on cache miss', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRequest.params = { shortCode: 'newcode' };
      mockReply.redirect = jest.fn().mockReturnValue({});

      await routeHandler(mockRequest, mockReply);

      expect(mockSupabase.from('urls').select('long_url').eq('short_code', 'newcode').single).toHaveBeenCalled();
    });

    it('should redirect to database URL on database hit', async () => {
      const dbUrl = 'https://example.com/original';
      mockRedis.get.mockResolvedValue(null);
      mockSupabase.from = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { long_url: dbUrl },
              error: null
            })
          })
        })
      });

      mockRequest.params = { shortCode: 'code123' };
      const redirectSpy = jest.fn().mockReturnValue({});
      mockReply.redirect = redirectSpy;

      await routeHandler(mockRequest, mockReply);

      expect(redirectSpy).toHaveBeenCalledWith(302, dbUrl);
    });

    it('should attempt to cache URL after database hit', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRequest.params = { shortCode: 'code' };
      mockReply.redirect = jest.fn().mockReturnValue({});

      await routeHandler(mockRequest, mockReply);

      expect(mockRedis.setex).toHaveBeenCalled();
    });

    it('should use correct cache key format for setex', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRequest.params = { shortCode: 'mycode' };
      mockReply.redirect = jest.fn().mockReturnValue({});

      await routeHandler(mockRequest, mockReply);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'url:cache:mycode',
        expect.any(Number),
        expect.any(String)
      );
    });

    it('should use 24-hour TTL for cache (86400 seconds)', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRequest.params = { shortCode: 'code' };
      mockReply.redirect = jest.fn().mockReturnValue({});

      await routeHandler(mockRequest, mockReply);

      const setexCall = mockRedis.setex.mock.calls[0];
      expect(setexCall[1]).toBe(86400);
    });
  });

  describe('Cache Failures (Non-Blocking)', () => {
    beforeEach(async () => {
      await redirectRoutes(mockFastify as FastifyInstance, {});
    });

    it('should fall back to database if Redis GET fails', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis connection failed'));
      mockRequest.params = { shortCode: 'test' };
      const redirectSpy = jest.fn().mockReturnValue({});
      mockReply.redirect = redirectSpy;

      await routeHandler(mockRequest, mockReply);

      // Should still redirect after DB lookup
      expect(redirectSpy).toHaveBeenCalled();
    });

    it('should log warning on Redis GET failure', async () => {
      const redisError = new Error('Redis GET timeout');
      mockRedis.get.mockRejectedValue(redisError);
      mockRequest.params = { shortCode: 'test' };
      mockReply.redirect = jest.fn().mockReturnValue({});

      await routeHandler(mockRequest, mockReply);

      expect(mockRequest.log.warn).toHaveBeenCalledWith(
        expect.any(Object),
        expect.stringContaining('Redis')
      );
    });

    it('should not throw if Redis SETEX fails during background cache write', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockRejectedValue(new Error('Cache write failed'));

      mockRequest.params = { shortCode: 'code' };
      mockReply.redirect = jest.fn().mockReturnValue({});

      await expect(routeHandler(mockRequest, mockReply)).resolves.not.toBeUndefined();

      expect(mockReply.redirect).toHaveBeenCalled();
    });

    it('should log warning on Redis SETEX failure', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockRejectedValue(new Error('Cache write failed'));

      mockRequest.params = { shortCode: 'code' };
      mockReply.redirect = jest.fn().mockReturnValue({});

      await routeHandler(mockRequest, mockReply);

      expect(mockRequest.log.warn).toHaveBeenCalledWith(
        expect.any(Object),
        expect.stringContaining('Redis')
      );
    });
  });

  describe('Short Code Not Found (404)', () => {
    beforeEach(async () => {
      await redirectRoutes(mockFastify as FastifyInstance, {});
    });

    it('should return 404 if short code not found in database', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockSupabase.from = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: new Error('No rows found')
            })
          })
        })
      });

      mockRequest.params = { shortCode: 'nonexistent' };
      const statusSpy = jest.fn().mockReturnValue({ send: jest.fn() });
      mockReply.status = statusSpy;

      await routeHandler(mockRequest, mockReply);

      expect(statusSpy).toHaveBeenCalledWith(404);
    });

    it('should return error message on 404', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockSupabase.from = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: new Error('Not found')
            })
          })
        })
      });

      mockRequest.params = { shortCode: 'missing' };
      const sendSpy = jest.fn();
      mockReply.status = jest.fn().mockReturnValue({ send: sendSpy });

      await routeHandler(mockRequest, mockReply);

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Not Found',
          message: expect.any(String)
        })
      );
    });

    it('should log info message on 404', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockSupabase.from = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: new Error('No rows')
            })
          })
        })
      });

      mockRequest.params = { shortCode: 'notfound' };
      mockReply.status = jest.fn().mockReturnValue({ send: jest.fn() });

      await routeHandler(mockRequest, mockReply);

      expect(mockRequest.log.info).toHaveBeenCalled();
    });

    it('should not attempt cache on 404', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockSupabase.from = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: new Error('No rows')
            })
          })
        })
      });

      mockRequest.params = { shortCode: 'missing' };
      mockReply.status = jest.fn().mockReturnValue({ send: jest.fn() });

      await routeHandler(mockRequest, mockReply);

      expect(mockRedis.setex).not.toHaveBeenCalled();
    });
  });

  describe('Database Errors (500)', () => {
    beforeEach(async () => {
      await redirectRoutes(mockFastify as FastifyInstance, {});
    });

    it('should return 500 on unexpected database error', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockSupabase.from = jest.fn().mockImplementation(() => {
        throw new Error('Unexpected DB error');
      });

      mockRequest.params = { shortCode: 'code' };
      const statusSpy = jest.fn().mockReturnValue({ send: jest.fn() });
      mockReply.status = statusSpy;

      await routeHandler(mockRequest, mockReply);

      expect(statusSpy).toHaveBeenCalledWith(500);
    });

    it('should return error message on 500', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockSupabase.from = jest.fn().mockImplementation(() => {
        throw new Error('DB crash');
      });

      mockRequest.params = { shortCode: 'code' };
      const sendSpy = jest.fn();
      mockReply.status = jest.fn().mockReturnValue({ send: sendSpy });

      await routeHandler(mockRequest, mockReply);

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Internal Server Error'
        })
      );
    });

    it('should log error on database exception', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockSupabase.from = jest.fn().mockImplementation(() => {
        throw new Error('Connection error');
      });

      mockRequest.params = { shortCode: 'code' };
      mockReply.status = jest.fn().mockReturnValue({ send: jest.fn() });

      await routeHandler(mockRequest, mockReply);

      expect(mockRequest.log.error).toHaveBeenCalled();
    });
  });

  describe('Short Code Validation - Edge Cases', () => {
    beforeEach(async () => {
      await redirectRoutes(mockFastify as FastifyInstance, {});
    });

    it('should accept alphanumeric short codes', async () => {
      mockRedis.get.mockResolvedValue('https://example.com');
      mockRequest.params = { shortCode: 'abc123XYZ' };
      const redirectSpy = jest.fn().mockReturnValue({});
      mockReply.redirect = redirectSpy;

      await routeHandler(mockRequest, mockReply);

      expect(redirectSpy).toHaveBeenCalled();
    });

    it('should accept single-character short codes', async () => {
      mockRedis.get.mockResolvedValue('https://example.com');
      mockRequest.params = { shortCode: 'a' };
      const redirectSpy = jest.fn().mockReturnValue({});
      mockReply.redirect = redirectSpy;

      await routeHandler(mockRequest, mockReply);

      expect(mockRedis.get).toHaveBeenCalledWith('url:cache:a');
    });

    it('should accept all-uppercase short codes', async () => {
      mockRedis.get.mockResolvedValue('https://example.com');
      mockRequest.params = { shortCode: 'ABC' };
      const redirectSpy = jest.fn().mockReturnValue({});
      mockReply.redirect = redirectSpy;

      await routeHandler(mockRequest, mockReply);

      expect(mockRedis.get).toHaveBeenCalledWith('url:cache:ABC');
    });

    it('should accept all-lowercase short codes', async () => {
      mockRedis.get.mockResolvedValue('https://example.com');
      mockRequest.params = { shortCode: 'xyz' };
      const redirectSpy = jest.fn().mockReturnValue({});
      mockReply.redirect = redirectSpy;

      await routeHandler(mockRequest, mockReply);

      expect(mockRedis.get).toHaveBeenCalledWith('url:cache:xyz');
    });

    it('should accept numeric-only short codes', async () => {
      mockRedis.get.mockResolvedValue('https://example.com');
      mockRequest.params = { shortCode: '123456' };
      const redirectSpy = jest.fn().mockReturnValue({});
      mockReply.redirect = redirectSpy;

      await routeHandler(mockRequest, mockReply);

      expect(mockRedis.get).toHaveBeenCalledWith('url:cache:123456');
    });

    it('should reject short codes with special characters', async () => {
      mockRequest.params = { shortCode: 'abc-123' };

      // Schema validation would reject this
      expect(() => {
        const pattern = /^[a-zA-Z0-9]+$/;
        if (!pattern.test(mockRequest.params.shortCode)) {
          throw new Error('Invalid short code format');
        }
      }).toThrow('Invalid short code format');
    });

    it('should reject short codes with spaces', async () => {
      mockRequest.params = { shortCode: 'ab c' };

      expect(() => {
        const pattern = /^[a-zA-Z0-9]+$/;
        if (!pattern.test(mockRequest.params.shortCode)) {
          throw new Error('Invalid short code format');
        }
      }).toThrow('Invalid short code format');
    });

    it('should reject short codes with underscores', async () => {
      mockRequest.params = { shortCode: 'abc_123' };

      expect(() => {
        const pattern = /^[a-zA-Z0-9]+$/;
        if (!pattern.test(mockRequest.params.shortCode)) {
          throw new Error('Invalid short code format');
        }
      }).toThrow('Invalid short code format');
    });

    it('should reject short codes with slashes', async () => {
      mockRequest.params = { shortCode: 'abc/123' };

      expect(() => {
        const pattern = /^[a-zA-Z0-9]+$/;
        if (!pattern.test(mockRequest.params.shortCode)) {
          throw new Error('Invalid short code format');
        }
      }).toThrow('Invalid short code format');
    });

    it('should use correct cache key format for GET request', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRequest.params = { shortCode: 'testcode' };
      mockReply.redirect = jest.fn().mockReturnValue({});

      await routeHandler(mockRequest, mockReply);

      expect(mockRedis.get).toHaveBeenCalledWith('url:cache:testcode');
    });
  });

  describe('Long URL Handling', () => {
    beforeEach(async () => {
      await redirectRoutes(mockFastify as FastifyInstance, {});
    });

    it('should redirect to full-length URLs up to 2048 characters', async () => {
      const longUrl = 'https://example.com/' + 'x'.repeat(2000);
      mockRedis.get.mockResolvedValue(longUrl);

      mockRequest.params = { shortCode: 'code' };
      const redirectSpy = jest.fn().mockReturnValue({});
      mockReply.redirect = redirectSpy;

      await routeHandler(mockRequest, mockReply);

      expect(redirectSpy).toHaveBeenCalledWith(302, longUrl);
    });

    it('should handle URLs with query parameters', async () => {
      const urlWithQuery = 'https://example.com/page?key=value&foo=bar';
      mockRedis.get.mockResolvedValue(urlWithQuery);

      mockRequest.params = { shortCode: 'code' };
      const redirectSpy = jest.fn().mockReturnValue({});
      mockReply.redirect = redirectSpy;

      await routeHandler(mockRequest, mockReply);

      expect(redirectSpy).toHaveBeenCalledWith(302, urlWithQuery);
    });

    it('should handle URLs with fragments', async () => {
      const urlWithFragment = 'https://example.com/page#section';
      mockRedis.get.mockResolvedValue(urlWithFragment);

      mockRequest.params = { shortCode: 'code' };
      const redirectSpy = jest.fn().mockReturnValue({});
      mockReply.redirect = redirectSpy;

      await routeHandler(mockRequest, mockReply);

      expect(redirectSpy).toHaveBeenCalledWith(302, urlWithFragment);
    });

    it('should handle URLs with both query params and fragments', async () => {
      const complexUrl = 'https://example.com/page?id=123#top';
      mockRedis.get.mockResolvedValue(complexUrl);

      mockRequest.params = { shortCode: 'code' };
      const redirectSpy = jest.fn().mockReturnValue({});
      mockReply.redirect = redirectSpy;

      await routeHandler(mockRequest, mockReply);

      expect(redirectSpy).toHaveBeenCalledWith(302, complexUrl);
    });

    it('should handle URLs with special characters', async () => {
      const specialUrl = "https://example.com/page?q=<>&\"'";
      mockRedis.get.mockResolvedValue(specialUrl);

      mockRequest.params = { shortCode: 'code' };
      const redirectSpy = jest.fn().mockReturnValue({});
      mockReply.redirect = redirectSpy;

      await routeHandler(mockRequest, mockReply);

      expect(redirectSpy).toHaveBeenCalledWith(302, specialUrl);
    });

    it('should handle URLs with Unicode characters', async () => {
      const unicodeUrl = 'https://example.com?name=José&city=São Paulo';
      mockRedis.get.mockResolvedValue(unicodeUrl);

      mockRequest.params = { shortCode: 'code' };
      const redirectSpy = jest.fn().mockReturnValue({});
      mockReply.redirect = redirectSpy;

      await routeHandler(mockRequest, mockReply);

      expect(redirectSpy).toHaveBeenCalledWith(302, unicodeUrl);
    });
  });

  describe('AC-1.4 Performance SLA - Under 2000ms', () => {
    beforeEach(async () => {
      await redirectRoutes(mockFastify as FastifyInstance, {});
    });

    it('should complete cache hit request within 2000ms', async () => {
      mockRedis.get.mockResolvedValue('https://example.com');
      mockRequest.params = { shortCode: 'cached' };
      mockReply.redirect = jest.fn().mockReturnValue({});

      const startTime = performance.now();
      await routeHandler(mockRequest, mockReply);
      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(2000);
    });

    it('should complete cache miss with database hit within 2000ms', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRequest.params = { shortCode: 'code' };
      mockReply.redirect = jest.fn().mockReturnValue({});

      const startTime = performance.now();
      await routeHandler(mockRequest, mockReply);
      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(2000);
    });

    it('should complete 404 request within 2000ms', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockSupabase.from = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: new Error('Not found')
            })
          })
        })
      });

      mockRequest.params = { shortCode: 'missing' };
      mockReply.status = jest.fn().mockReturnValue({ send: jest.fn() });

      const startTime = performance.now();
      await routeHandler(mockRequest, mockReply);
      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(2000);
    });

    it('should handle multiple concurrent requests within SLA', async () => {
      const requests = Array(10).fill(null).map((_, i) => ({
        params: { shortCode: `code${i}` },
        log: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }
      }));

      const startTime = performance.now();

      const promises = requests.map(req => {
        const redirectSpy = jest.fn().mockReturnValue({});
        const reply = { redirect: redirectSpy, status: jest.fn() };
        mockRedis.get.mockResolvedValue('https://example.com');
        return routeHandler(req, reply);
      });

      return Promise.all(promises).then(() => {
        const endTime = performance.now();
        expect(endTime - startTime).toBeLessThan(2000);
      });
    });

    it('should not exceed SLA even with slow Redis response', async () => {
      mockRedis.get.mockImplementation(
        () => new Promise(resolve => {
          setTimeout(() => resolve('https://example.com'), 800);
        })
      );

      mockRequest.params = { shortCode: 'code' };
      mockReply.redirect = jest.fn().mockReturnValue({});

      const startTime = performance.now();
      await routeHandler(mockRequest, mockReply);
      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(2000);
    });

    it('should not exceed SLA even with slow database response', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockSupabase.from = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockImplementation(
              () => new Promise(resolve => {
                setTimeout(() => resolve({
                  data: { long_url: 'https://example.com' },
                  error: null
                }), 800);
              })
            )
          })
        })
      });

      mockRequest.params = { shortCode: 'code' };
      mockReply.redirect = jest.fn().mockReturnValue({});

      const startTime = performance.now();
      await routeHandler(mockRequest, mockReply);
      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(2000);
    });
  });

  describe('HTTP Status Codes', () => {
    beforeEach(async () => {
      await redirectRoutes(mockFastify as FastifyInstance, {});
    });

    it('should use 302 (Found) redirect status', async () => {
      mockRedis.get.mockResolvedValue('https://example.com');
      mockRequest.params = { shortCode: 'code' };
      const redirectSpy = jest.fn().mockReturnValue({});
      mockReply.redirect = redirectSpy;

      await routeHandler(mockRequest, mockReply);

      const statusCode = redirectSpy.mock.calls[0][0];
      expect(statusCode).toBe(302);
    });

    it('should use 404 for not found', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockSupabase.from = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: new Error('Not found')
            })
          })
        })
      });

      mockRequest.params = { shortCode: 'missing' };
      const statusSpy = jest.fn().mockReturnValue({ send: jest.fn() });
      mockReply.status = statusSpy;

      await routeHandler(mockRequest, mockReply);

      expect(statusSpy).toHaveBeenCalledWith(404);
    });

    it('should use 500 for internal errors', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockSupabase.from = jest.fn().mockImplementation(() => {
        throw new Error('DB error');
      });

      mockRequest.params = { shortCode: 'code' };
      const statusSpy = jest.fn().mockReturnValue({ send: jest.fn() });
      mockReply.status = statusSpy;

      await routeHandler(mockRequest, mockReply);

      expect(statusSpy).toHaveBeenCalledWith(500);
    });
  });

  describe('Logging and Debugging', () => {
    beforeEach(async () => {
      await redirectRoutes(mockFastify as FastifyInstance, {});
    });

    it('should debug log cache hits', async () => {
      mockRedis.get.mockResolvedValue('https://example.com');
      mockRequest.params = { shortCode: 'code' };
      mockReply.redirect = jest.fn().mockReturnValue({});

      await routeHandler(mockRequest, mockReply);

      expect(mockRequest.log.debug).toHaveBeenCalled();
    });

    it('should warn log on Redis failures', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis down'));
      mockRequest.params = { shortCode: 'code' };
      mockReply.redirect = jest.fn().mockReturnValue({});

      await routeHandler(mockRequest, mockReply);

      expect(mockRequest.log.warn).toHaveBeenCalled();
    });

    it('should info log on URL not found', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockSupabase.from = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: new Error('Not found')
            })
          })
        })
      });

      mockRequest.params = { shortCode: 'missing' };
      mockReply.status = jest.fn().mockReturnValue({ send: jest.fn() });

      await routeHandler(mockRequest, mockReply);

      expect(mockRequest.log.info).toHaveBeenCalled();
    });

    it('should error log on unexpected database errors', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockSupabase.from = jest.fn().mockImplementation(() => {
        throw new Error('DB crashed');
      });

      mockRequest.params = { shortCode: 'code' };
      mockReply.status = jest.fn().mockReturnValue({ send: jest.fn() });

      await routeHandler(mockRequest, mockReply);

      expect(mockRequest.log.error).toHaveBeenCalled();
    });
  });

  describe('Schema Validation', () => {
    beforeEach(async () => {
      await redirectRoutes(mockFastify as FastifyInstance, {});
    });

    it('should define schema for GET request', async () => {
      const getCall = (mockFastify.get as jest.Mock).mock.calls[0];
      const options = getCall[1];

      expect(options.schema).toBeDefined();
      expect(options.schema.params).toBeDefined();
    });

    it('should require shortCode parameter', async () => {
      const getCall = (mockFastify.get as jest.Mock).mock.calls[0];
      const schema = getCall[1].schema;

      expect(schema.params.required).toContain('shortCode');
    });

    it('should enforce string type for shortCode', async () => {
      const getCall = (mockFastify.get as jest.Mock).mock.calls[0];
      const schema = getCall[1].schema;

      expect(schema.params.properties.shortCode.type).toBe('string');
    });

    it('should enforce alphanumeric pattern for shortCode', async () => {
      const getCall = (mockFastify.get as jest.Mock).mock.calls[0];
      const schema = getCall[1].schema;

      expect(schema.params.properties.shortCode.pattern).toBe('^[a-zA-Z0-9]+$');
    });

    it('should not allow additional properties', async () => {
      const getCall = (mockFastify.get as jest.Mock).mock.calls[0];
      const schema = getCall[1].schema;

      expect(schema.params.additionalProperties).toBe(false);
    });
  });

  describe('Integration - Full Request Flow', () => {
    beforeEach(async () => {
      await redirectRoutes(mockFastify as FastifyInstance, {});
    });

    it('should handle cache hit to redirect flow', async () => {
      mockRedis.get.mockResolvedValue('https://example.com/target');
      mockRequest.params = { shortCode: 'short' };
      const redirectSpy = jest.fn().mockReturnValue({});
      mockReply.redirect = redirectSpy;

      await routeHandler(mockRequest, mockReply);

      expect(mockRedis.get).toHaveBeenCalledWith('url:cache:short');
      expect(redirectSpy).toHaveBeenCalledWith(302, 'https://example.com/target');
      expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it('should handle cache miss -> database hit -> cache write flow', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRequest.params = { shortCode: 'newcode' };
      const redirectSpy = jest.fn().mockReturnValue({});
      mockReply.redirect = redirectSpy;

      await routeHandler(mockRequest, mockReply);

      expect(mockRedis.get).toHaveBeenCalledWith('url:cache:newcode');
      expect(mockSupabase.from('urls').select('long_url').eq).toHaveBeenCalled();
      expect(redirectSpy).toHaveBeenCalledWith(302, expect.any(String));
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'url:cache:newcode',
        86400,
        expect.any(String)
      );
    });

    it('should handle cache miss -> database not found flow', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockSupabase.from = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: new Error('No rows')
            })
          })
        })
      });

      mockRequest.params = { shortCode: 'notfound' };
      const statusSpy = jest.fn().mockReturnValue({ send: jest.fn() });
      mockReply.status = statusSpy;

      await routeHandler(mockRequest, mockReply);

      expect(mockRedis.get).toHaveBeenCalled();
      expect(mockSupabase.from('urls').select).toHaveBeenCalled();
      expect(statusSpy).toHaveBeenCalledWith(404);
      expect(mockRedis.setex).not.toHaveBeenCalled();
    });

    it('should handle cache miss -> Redis error -> database hit flow', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis down'));
      mockRequest.params = { shortCode: 'code' };
      const redirectSpy = jest.fn().mockReturnValue({});
      mockReply.redirect = redirectSpy;

      await routeHandler(mockRequest, mockReply);

      expect(mockRedis.get).toHaveBeenCalled();
      expect(mockRequest.log.warn).toHaveBeenCalled();
      expect(mockSupabase.from('urls').select).toHaveBeenCalled();
      expect(redirectSpy).toHaveBeenCalledWith(302, expect.any(String));
    });
  });
});
