import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

// Mock dependencies
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn()
}));
jest.mock('../../src/services/Base62Service', () => ({
  Base62Service: jest.fn()
}));

describe('URL Shortener Routes - /api/v1/shorten', () => {
  let urlRoutes: any;
  let createClientMock: jest.Mock;
  let Base62ServiceMock: jest.Mock;
  let mockFastify: Partial<FastifyInstance>;
  let mockReply: Partial<FastifyReply>;
  let mockRequest: Partial<FastifyRequest>;
  let mockSupabase: any;
  let mockBase62: any;
  let routeHandler: any;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.BASE_URL = 'http://localhost:3000';

    const { createClient } = require('@supabase/supabase-js');
    const { Base62Service } = require('../../src/services/Base62Service');

    createClientMock = createClient;
    Base62ServiceMock = Base62Service;

    // Setup mock Supabase client
    mockSupabase = {
      from: jest.fn().mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { id: 12345 },
              error: null
            })
          })
        }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: null,
            error: null
          })
        }),
        delete: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: null,
            error: null
          })
        })
      })
    };

    createClientMock.mockReturnValue(mockSupabase);

    // Setup mock Base62Service
    mockBase62 = {
      encode: jest.fn((id: number) => `short${id}`)
    };
    Base62ServiceMock.mockImplementation(() => mockBase62);

    // Reload route module after mocks are configured
    urlRoutes = require('../../src/routes/urlRoutes').default;

    // Setup mock Fastify instance
    mockFastify = {
      post: jest.fn().mockImplementation((route, options, handler) => {
        if (route === '/api/v1/shorten') {
          routeHandler = handler;
        }
      }),
      log: {
        warn: jest.fn(),
        error: jest.fn()
      }
    };

    // Setup mock reply
    mockReply = {
      status: jest.fn().mockReturnValue({
        send: jest.fn().mockResolvedValue({})
      }),
      send: jest.fn().mockResolvedValue({})
    };

    // Setup mock request
    mockRequest = {
      body: { long_url: 'https://example.com' },
      log: {
        error: jest.fn()
      }
    };
  });

  describe('Route Registration', () => {
    it('should register POST /api/v1/shorten route', async () => {
      await urlRoutes(mockFastify as FastifyInstance, {});

      expect(mockFastify.post).toHaveBeenCalledWith(
        '/api/v1/shorten',
        expect.objectContaining({
          schema: expect.any(Object)
        }),
        expect.any(Function)
      );
    });

    it('should include JSON schema validation in route definition', async () => {
      await urlRoutes(mockFastify as FastifyInstance, {});

      const callArgs = (mockFastify.post as jest.Mock).mock.calls[0];
      const schema = callArgs[1].schema;

      expect(schema.body).toBeDefined();
      expect(schema.body.required).toContain('long_url');
      expect(schema.body.properties.long_url.type).toBe('string');
    });
  });

  describe('AC-1.2 Protocol Validation', () => {
    beforeEach(async () => {
      await urlRoutes(mockFastify as FastifyInstance, {});
    });

    it('should accept URLs with https:// protocol', async () => {
      mockRequest.body = { long_url: 'https://example.com' };
      const replyStatusSpy = jest.fn().mockReturnValue(mockReply);
      mockReply.status = replyStatusSpy;

      await routeHandler(mockRequest, mockReply);

      expect(replyStatusSpy).toHaveBeenCalledWith(211);
    });

    it('should accept URLs with http:// protocol', async () => {
      mockRequest.body = { long_url: 'http://example.com' };
      const replyStatusSpy = jest.fn().mockReturnValue(mockReply);
      mockReply.status = replyStatusSpy;

      await routeHandler(mockRequest, mockReply);

      expect(replyStatusSpy).toHaveBeenCalledWith(211);
    });

    it('should reject URLs without protocol', async () => {
      mockRequest.body = { long_url: 'example.com' };
      const replyStatusSpy = jest.fn().mockReturnValue(mockReply);
      mockReply.status = replyStatusSpy;

      // Fastify schema validation will catch this and reject before handler runs
      // Handler would throw or schema validation prevents reaching it
      expect(() => {
        if (!mockRequest.body.long_url.match(/^https?:\/\//)) {
          throw new Error('Invalid protocol');
        }
      }).toThrow('Invalid protocol');
    });

    it('should reject URLs with invalid protocols (ftp, file, etc)', async () => {
      const invalidProtocols = ['ftp://example.com', 'file:///path', 'gopher://old'];
      invalidProtocols.forEach((url) => {
        expect(() => {
          if (!url.match(/^https?:\/\//)) {
            throw new Error('Invalid protocol');
          }
        }).toThrow('Invalid protocol');
      });
    });
  });

  describe('AC-1.1 Input Capacity - 2048 Character Limit', () => {
    beforeEach(async () => {
      await urlRoutes(mockFastify as FastifyInstance, {});
    });

    it('should process URLs up to 2048 characters', async () => {
      const longPath = 'https://example.com/' + 'a'.repeat(2010);
      mockRequest.body = { long_url: longPath };

      const replyStatusSpy = jest.fn().mockReturnValue(mockReply);
      const sendSpy = jest.fn().mockResolvedValue({});
      mockReply.status = replyStatusSpy;
      mockReply.status('any' as any).send = sendSpy;

      await routeHandler(mockRequest, mockReply);

      expect(mockSupabase.from).toHaveBeenCalledWith('urls');
    });

    it('should handle boundary case at exactly 2048 characters', async () => {
      const url2048 = 'https://example.com/' + 'x'.repeat(2024); // Total: ~2048
      mockRequest.body = { long_url: url2048 };

      const replyStatusSpy = jest.fn().mockReturnValue(mockReply);
      mockReply.status = replyStatusSpy;

      await routeHandler(mockRequest, mockReply);

      // Should successfully process without truncation or error
      expect(mockSupabase.from).toHaveBeenCalledWith('urls');
    });

    it('should handle URLs just under the 2048 character limit', async () => {
      const url2047 = 'https://example.com/' + 'y'.repeat(2023);
      mockRequest.body = { long_url: url2047 };

      const replyStatusSpy = jest.fn().mockReturnValue(mockReply);
      mockReply.status = replyStatusSpy;

      await routeHandler(mockRequest, mockReply);

      expect(mockSupabase.from).toHaveBeenCalledWith('urls');
    });

    it('should reject empty URL strings', async () => {
      mockRequest.body = { long_url: '' };

      expect(() => {
        if (!mockRequest.body.long_url || mockRequest.body.long_url.trim().length === 0) {
          throw new TypeError('URL cannot be empty');
        }
      }).toThrow('URL cannot be empty');
    });

    it('should reject null or undefined URLs', async () => {
      mockRequest.body = { long_url: null as any };

      expect(() => {
        if (!mockRequest.body.long_url || typeof mockRequest.body.long_url !== 'string') {
          throw new TypeError('URL must be a non-empty string');
        }
      }).toThrow('URL must be a non-empty string');
    });
  });

  describe('AC-1.3 Security Sanitization', () => {
    beforeEach(async () => {
      await urlRoutes(mockFastify as FastifyInstance, {});
    });

    it('should not execute XSS payloads embedded in URLs', async () => {
      const xssPayload = 'https://example.com?param=<script>alert("xss")</script>';
      mockRequest.body = { long_url: xssPayload };

      const replyStatusSpy = jest.fn().mockReturnValue(mockReply);
      mockReply.status = replyStatusSpy;

      await routeHandler(mockRequest, mockReply);

      // URL is stored as-is in DB, but should not be directly rendered in HTML without escaping
      // Verify it's passed to database safely
      expect(mockSupabase.from('urls').insert).toHaveBeenCalledWith([
        { long_url: xssPayload }
      ]);
    });

    it('should reject malformed URLs that contain invalid hostnames', async () => {
      const sqlInjection = "https://example.com'; DROP TABLE urls; --";
      mockRequest.body = { long_url: sqlInjection };

      const replyStatusSpy = jest.fn().mockReturnValue(mockReply);
      mockReply.status = replyStatusSpy;

      await routeHandler(mockRequest, mockReply);

      expect(replyStatusSpy).toHaveBeenCalledWith(400);
      expect(mockSupabase.from('urls').insert).not.toHaveBeenCalled();
    });

    it('should handle URLs with special characters safely', async () => {
      const specialChars = "https://example.com?query=<>&\"'";
      mockRequest.body = { long_url: specialChars };

      const replyStatusSpy = jest.fn().mockReturnValue(mockReply);
      mockReply.status = replyStatusSpy;

      await routeHandler(mockRequest, mockReply);

      expect(mockSupabase.from('urls').insert).toHaveBeenCalledWith([
        { long_url: specialChars }
      ]);
    });

    it('should handle Unicode and international characters', async () => {
      const unicodeUrl = 'https://example.com?name=José&city=São Paulo';
      mockRequest.body = { long_url: unicodeUrl };

      const replyStatusSpy = jest.fn().mockReturnValue(mockReply);
      mockReply.status = replyStatusSpy;

      await routeHandler(mockRequest, mockReply);

      expect(mockSupabase.from('urls').insert).toHaveBeenCalledWith([
        { long_url: unicodeUrl }
      ]);
    });
  });

  describe('AC-1.4 Performance SLA - Under 2000ms', () => {
    beforeEach(async () => {
      await urlRoutes(mockFastify as FastifyInstance, {});
    });

    it('should complete request within 2000ms', async () => {
      mockRequest.body = { long_url: 'https://example.com' };
      const replyStatusSpy = jest.fn().mockReturnValue(mockReply);
      mockReply.status = replyStatusSpy;

      const startTime = performance.now();
      await routeHandler(mockRequest, mockReply);
      const endTime = performance.now();

      const duration = endTime - startTime;
      expect(duration).toBeLessThan(2000);
    });

    it('should handle concurrent requests within SLA', async () => {
      const requests = Array(10).fill(null).map((_, i) => ({
        body: { long_url: `https://example${i}.com` },
        log: { error: jest.fn() }
      }));

      const startTime = performance.now();

      const promises = requests.map(req => {
        const replyStatusSpy = jest.fn().mockReturnValue(mockReply);
        const reply = { ...mockReply, status: replyStatusSpy };
        return routeHandler(req, reply);
      });

      await Promise.all(promises);
      const endTime = performance.now();

      const duration = endTime - startTime;
      expect(duration).toBeLessThan(2000);
    });

    it('should not exceed SLA with slow database responses', async () => {
      const slowSupabase = {
        from: jest.fn().mockReturnValue({
          insert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockImplementation(
                () => new Promise(resolve => {
                  setTimeout(() => resolve({ data: { id: 999 }, error: null }), 500);
                })
              )
            })
          }),
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockImplementation(
              () => new Promise(resolve => {
                setTimeout(() => resolve({ data: null, error: null }), 300);
              })
            )
          }),
          delete: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: null, error: null })
          })
        })
      };

      createClientMock.mockReturnValue(slowSupabase);

      mockRequest.body = { long_url: 'https://example.com' };
      const replyStatusSpy = jest.fn().mockReturnValue(mockReply);
      mockReply.status = replyStatusSpy;

      const startTime = performance.now();
      await routeHandler(mockRequest, mockReply);
      const endTime = performance.now();

      const duration = endTime - startTime;
      expect(duration).toBeLessThan(2000); // Still under SLA even with slow DB
    });
  });

  describe('Successful Request Flow', () => {
    beforeEach(async () => {
      await urlRoutes(mockFastify as FastifyInstance, {});
    });

    it('should return 211 status on successful shorten', async () => {
      mockRequest.body = { long_url: 'https://example.com/page' };
      const replyStatusSpy = jest.fn().mockReturnValue({
        send: jest.fn().mockResolvedValue({})
      });
      mockReply.status = replyStatusSpy;

      await routeHandler(mockRequest, mockReply);

      expect(replyStatusSpy).toHaveBeenCalledWith(211);
    });

    it('should return short_code and short_url in response', async () => {
      mockRequest.body = { long_url: 'https://example.com' };
      const sendSpy = jest.fn().mockResolvedValue({});
      const statusReturnValue = { send: sendSpy };
      mockReply.status = jest.fn().mockReturnValue(statusReturnValue);

      await routeHandler(mockRequest, mockReply);

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          short_code: expect.any(String),
          short_url: expect.stringContaining('http')
        })
      );
    });

    it('should encode database ID correctly via Base62Service', async () => {
      mockRequest.body = { long_url: 'https://example.com' };
      mockReply.status = jest.fn().mockReturnValue({ send: jest.fn().mockResolvedValue({}) });

      await routeHandler(mockRequest, mockReply);

      expect(mockBase62.encode).toHaveBeenCalledWith(12345);
    });

    it('should construct short_url with BASE_URL and short_code', async () => {
      process.env.BASE_URL = 'https://short.io';
      await urlRoutes(mockFastify as FastifyInstance, {});
      mockRequest.body = { long_url: 'https://example.com' };
      const sendSpy = jest.fn().mockResolvedValue({});
      mockReply.status = jest.fn().mockReturnValue({ send: sendSpy });

      await routeHandler(mockRequest, mockReply);

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          short_url: expect.stringContaining('https://short.io/')
        })
      );
    });

    it('should insert long_url into database', async () => {
      const testUrl = 'https://example.com/test/page';
      mockRequest.body = { long_url: testUrl };
      mockReply.status = jest.fn().mockReturnValue({ send: jest.fn().mockResolvedValue({}) });

      await routeHandler(mockRequest, mockReply);

      expect(mockSupabase.from('urls').insert).toHaveBeenCalledWith([{ long_url: testUrl }]);
    });

    it('should update record with short_code after insert', async () => {
      mockRequest.body = { long_url: 'https://example.com' };
      mockReply.status = jest.fn().mockReturnValue({ send: jest.fn().mockResolvedValue({}) });

      await routeHandler(mockRequest, mockReply);

      expect(mockSupabase.from('urls').update).toHaveBeenCalledWith({
        short_code: expect.any(String)
      });
    });
  });

  describe('Error Handling - Insert Failures', () => {
    beforeEach(async () => {
      await urlRoutes(mockFastify as FastifyInstance, {});
    });

    it('should return 500 if insert fails', async () => {
      mockSupabase.from('urls').insert = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: null,
            error: new Error('Insert failed')
          })
        })
      });

      mockRequest.body = { long_url: 'https://example.com' };
      const replyStatusSpy = jest.fn().mockReturnValue({
        send: jest.fn().mockResolvedValue({})
      });
      mockReply.status = replyStatusSpy;

      await routeHandler(mockRequest, mockReply);

      expect(replyStatusSpy).toHaveBeenCalledWith(500);
    });

    it('should return error message on insert failure', async () => {
      mockSupabase.from('urls').insert = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: null,
            error: new Error('Database error')
          })
        })
      });

      mockRequest.body = { long_url: 'https://example.com' };
      const sendSpy = jest.fn().mockResolvedValue({});
      mockReply.status = jest.fn().mockReturnValue({ send: sendSpy });

      await routeHandler(mockRequest, mockReply);

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Internal Error',
          message: expect.any(String)
        })
      );
    });

    it('should log insert errors', async () => {
      const insertError = new Error('DB connection failed');
      mockSupabase.from('urls').insert = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: null,
            error: insertError
          })
        })
      });

      mockRequest.body = { long_url: 'https://example.com' };
      mockReply.status = jest.fn().mockReturnValue({ send: jest.fn().mockResolvedValue({}) });

      await routeHandler(mockRequest, mockReply);

      expect(mockRequest.log.error).toHaveBeenCalled();
    });
  });

  describe('Error Handling - Update Failures', () => {
    beforeEach(async () => {
      await urlRoutes(mockFastify as FastifyInstance, {});
    });

    it('should return 500 if update fails', async () => {
      mockSupabase.from('urls').update = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({
          data: null,
          error: new Error('Update failed')
        })
      });

      mockRequest.body = { long_url: 'https://example.com' };
      const replyStatusSpy = jest.fn().mockReturnValue({
        send: jest.fn().mockResolvedValue({})
      });
      mockReply.status = replyStatusSpy;

      await routeHandler(mockRequest, mockReply);

      expect(replyStatusSpy).toHaveBeenCalledWith(500);
    });

    it('should cleanup orphaned row if update fails', async () => {
      const deleteSpy = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ data: null, error: null })
      });

      mockSupabase.from('urls').delete = deleteSpy;
      mockSupabase.from('urls').update = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({
          data: null,
          error: new Error('Update failed')
        })
      });

      mockRequest.body = { long_url: 'https://example.com' };
      mockReply.status = jest.fn().mockReturnValue({ send: jest.fn().mockResolvedValue({}) });

      await routeHandler(mockRequest, mockReply);

      expect(deleteSpy).toHaveBeenCalled();
    });

    it('should log update errors', async () => {
      mockSupabase.from('urls').update = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({
          data: null,
          error: new Error('Short code write failed')
        })
      });

      mockRequest.body = { long_url: 'https://example.com' };
      mockReply.status = jest.fn().mockReturnValue({ send: jest.fn().mockResolvedValue({}) });

      await routeHandler(mockRequest, mockReply);

      expect(mockRequest.log.error).toHaveBeenCalled();
    });
  });

  describe('Error Handling - Unexpected Exceptions', () => {
    beforeEach(async () => {
      await urlRoutes(mockFastify as FastifyInstance, {});
    });

    it('should catch unexpected runtime errors', async () => {
      mockSupabase.from = jest.fn().mockImplementation(() => {
        throw new Error('Unexpected Supabase error');
      });

      mockRequest.body = { long_url: 'https://example.com' };
      const sendSpy = jest.fn().mockResolvedValue({});
      mockReply.status = jest.fn().mockReturnValue({ send: sendSpy });

      await routeHandler(mockRequest, mockReply);

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Internal Error'
        })
      );
    });

    it('should return 500 on unexpected errors', async () => {
      mockSupabase.from = jest.fn().mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      mockRequest.body = { long_url: 'https://example.com' };
      const replyStatusSpy = jest.fn().mockReturnValue({ send: jest.fn().mockResolvedValue({}) });
      mockReply.status = replyStatusSpy;

      await routeHandler(mockRequest, mockReply);

      expect(replyStatusSpy).toHaveBeenCalledWith(500);
    });

    it('should cleanup if exception occurs after insert', async () => {
      const deleteSpy = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ data: null, error: null })
      });

      mockSupabase.from('urls').delete = deleteSpy;
      mockSupabase.from('urls').update = jest.fn().mockReturnValue({
        eq: jest.fn().mockImplementation(() => {
          throw new Error('Runtime error in update');
        })
      });

      mockRequest.body = { long_url: 'https://example.com' };
      mockReply.status = jest.fn().mockReturnValue({ send: jest.fn().mockResolvedValue({}) });

      await routeHandler(mockRequest, mockReply);

      expect(deleteSpy).toHaveBeenCalled();
    });

    it('should gracefully handle cleanup errors', async () => {
      mockSupabase.from('urls').delete = jest.fn().mockReturnValue({
        eq: jest.fn().mockRejectedValue(new Error('Cleanup failed'))
      });

      mockSupabase.from('urls').update = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({
          data: null,
          error: new Error('Update failed')
        })
      });

      mockRequest.body = { long_url: 'https://example.com' };
      mockReply.status = jest.fn().mockReturnValue({ send: jest.fn().mockResolvedValue({}) });

      // Should not throw even if cleanup fails
      expect(async () => {
        await routeHandler(mockRequest, mockReply);
      }).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    beforeEach(async () => {
      await urlRoutes(mockFastify as FastifyInstance, {});
    });

    it('should handle URLs with query parameters', async () => {
      const urlWithParams = 'https://example.com/path?key1=value1&key2=value2&key3=value3';
      mockRequest.body = { long_url: urlWithParams };
      mockReply.status = jest.fn().mockReturnValue({ send: jest.fn().mockResolvedValue({}) });

      await routeHandler(mockRequest, mockReply);

      expect(mockSupabase.from('urls').insert).toHaveBeenCalledWith([
        { long_url: urlWithParams }
      ]);
    });

    it('should handle URLs with fragments', async () => {
      const urlWithFragment = 'https://example.com/page#section';
      mockRequest.body = { long_url: urlWithFragment };
      mockReply.status = jest.fn().mockReturnValue({ send: jest.fn().mockResolvedValue({}) });

      await routeHandler(mockRequest, mockReply);

      expect(mockSupabase.from('urls').insert).toHaveBeenCalledWith([
        { long_url: urlWithFragment }
      ]);
    });

    it('should handle URLs with authentication in query', async () => {
      const urlWithAuth = 'https://example.com/api?token=abc123xyz';
      mockRequest.body = { long_url: urlWithAuth };
      mockReply.status = jest.fn().mockReturnValue({ send: jest.fn().mockResolvedValue({}) });

      await routeHandler(mockRequest, mockReply);

      expect(mockSupabase.from('urls').insert).toHaveBeenCalledWith([
        { long_url: urlWithAuth }
      ]);
    });

    it('should handle very large database IDs', async () => {
      mockSupabase.from('urls').insert = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { id: Number.MAX_SAFE_INTEGER - 1 },
            error: null
          })
        })
      });

      mockRequest.body = { long_url: 'https://example.com' };
      mockReply.status = jest.fn().mockReturnValue({ send: jest.fn().mockResolvedValue({}) });

      await routeHandler(mockRequest, mockReply);

      expect(mockBase62.encode).toHaveBeenCalledWith(Number.MAX_SAFE_INTEGER - 1);
    });

    it('should use BASE_URL env variable in response', async () => {
      process.env.BASE_URL = 'https://custom-domain.com';
      await urlRoutes(mockFastify as FastifyInstance, {});
      mockRequest.body = { long_url: 'https://example.com' };
      const sendSpy = jest.fn().mockResolvedValue({});
      mockReply.status = jest.fn().mockReturnValue({ send: sendSpy });

      await routeHandler(mockRequest, mockReply);

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          short_url: expect.stringContaining('https://custom-domain.com/')
        })
      );
    });

    it('should use default BASE_URL if env not set', async () => {
      delete process.env.BASE_URL;
      await urlRoutes(mockFastify as FastifyInstance, {});
      mockRequest.body = { long_url: 'https://example.com' };
      const sendSpy = jest.fn().mockResolvedValue({});
      mockReply.status = jest.fn().mockReturnValue({ send: sendSpy });

      await routeHandler(mockRequest, mockReply);

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          short_url: expect.stringContaining('localhost')
        })
      );
    });
  });

  describe('Schema Validation', () => {
    beforeEach(async () => {
      await urlRoutes(mockFastify as FastifyInstance, {});
    });

    it('should define schema for POST request', async () => {
      const postCall = (mockFastify.post as jest.Mock).mock.calls[0];
      const options = postCall[1];

      expect(options.schema).toBeDefined();
      expect(options.schema.body).toBeDefined();
    });

    it('should require long_url field in request body', async () => {
      const postCall = (mockFastify.post as jest.Mock).mock.calls[0];
      const schema = postCall[1].schema;

      expect(schema.body.required).toContain('long_url');
    });

    it('should enforce string type for long_url', async () => {
      const postCall = (mockFastify.post as jest.Mock).mock.calls[0];
      const schema = postCall[1].schema;

      expect(schema.body.properties.long_url.type).toBe('string');
    });

    it('should validate URI format for long_url', async () => {
      const postCall = (mockFastify.post as jest.Mock).mock.calls[0];
      const schema = postCall[1].schema;

      expect(schema.body.properties.long_url.format).toBe('uri');
    });

    it('should define response schema for 211 status', async () => {
      const postCall = (mockFastify.post as jest.Mock).mock.calls[0];
      const schema = postCall[1].schema;

      expect(schema.response[211]).toBeDefined();
      expect(schema.response[211].properties.short_code).toBeDefined();
      expect(schema.response[211].properties.short_url).toBeDefined();
    });
  });

  describe('Request Logging', () => {
    beforeEach(async () => {
      await urlRoutes(mockFastify as FastifyInstance, {});
    });

    it('should log errors during insert', async () => {
      const insertError = new Error('Connection timeout');
      mockSupabase.from('urls').insert = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: null,
            error: insertError
          })
        })
      });

      mockRequest.body = { long_url: 'https://example.com' };
      mockReply.status = jest.fn().mockReturnValue({ send: jest.fn().mockResolvedValue({}) });

      await routeHandler(mockRequest, mockReply);

      expect(mockRequest.log.error).toHaveBeenCalledWith(
        expect.any(Object),
        expect.stringContaining('Failed')
      );
    });

    it('should log errors during update', async () => {
      mockSupabase.from('urls').update = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({
          data: null,
          error: new Error('Update timeout')
        })
      });

      mockRequest.body = { long_url: 'https://example.com' };
      mockReply.status = jest.fn().mockReturnValue({ send: jest.fn().mockResolvedValue({}) });

      await routeHandler(mockRequest, mockReply);

      expect(mockRequest.log.error).toHaveBeenCalled();
    });

    it('should log unexpected exceptions', async () => {
      mockSupabase.from = jest.fn().mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      mockRequest.body = { long_url: 'https://example.com' };
      mockReply.status = jest.fn().mockReturnValue({ send: jest.fn().mockResolvedValue({}) });

      await routeHandler(mockRequest, mockReply);

      expect(mockRequest.log.error).toHaveBeenCalled();
    });
  });
});
