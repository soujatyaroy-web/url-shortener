# AI Engineering Traceability Log

## Product Requirement Document
* **Intent:** [Create Product Requirement Document to describe the use case, high-level functional requirements, success metric, Non-functional Requirement]


### Initial Prompting Strategy
**Prompt:**
> "As a Product Manager, create a Product Requirement Document for a web-hosted url-shortener in the format of Usecase--> Success Metric--> Functional Requirements-->Out-of-Scope-->Non-Functional Requirements. The user can submit a long URL which is validated and receives back a short URL in less than 2 seconds and on click of the short url, the system redirects to the long url."

### AI Output Evaluation & Quality Gates
* **Accepted Components:** Product Usecase definition, partial functional requirements, partial success metrics list.
* **Rejected/Modified Components with Rationale:** Included the url validation for invalid urls, updated the out of scope definitions, included performance aspect on the sucess criteria.

## User Stories
* **Intent:** [Create functional user stories and technical enabler stories from the PRD and architecture overview]


### Initial Prompting Strategy
**Prompt:**
> "As a Technical Product Manager, create functional user stories with clear, testable acceptance criteria in the format of "Given [The initial context or precondition] When [The action or event taken by the user] Then [The expected outcome or system response] based on product usecase definition and functional requirements and UX designs. Create enabler stories based on the attached architecture overview and technical stack as on the attached README.md file."

### AI Output Evaluation & Quality Gates
* **Accepted Components:** Partial acceptance of user stories and enabler stories list.
* **Rejected/Modified Components with Rationale:** Included a sample example on the user story for Base62 encoding. Included the cold-start tuning and target latency for warm requests.


## Base62 Short Code Utility | Development
* **Intent:** Implement bidirectional Base62 encoding/decoding utility.
* **Technical Context & Constraints:** Node.js, TypeScript, mathematical precision, avoid external heavy libraries, handle boundary edge-cases.

### Initial Prompting Strategy
**Prompt:**
> "Act as a Staff Engineer working on a production-grade Fastify stack. Write a standalone TypeScript utility class named Base62Service in typescript.It must include two public methods:
encode(id: number): string -> Converts a base-10 integer to a Base62 string (0-9, a-z, A-Z).
decode(code: string): number -> Converts a Base62 string back into a base-10 integer.
Constraints:
Explicitly handle the edge case where the input id is 0.
Do not use large external NPM packages for the base conversion; use standard mathematical manipulation.
Add clear structural TypeScript types and error boundaries if an invalid character is passed to the decoder.
Provide clean code without any framework code or database bindings."

### AI Output Evaluation & Quality Gates
* **Accepted Components:** The overall structure, input sanitization bounds, and constructor map pre-computation.
* **Rejected/Modified Components with Rationale:**
  * *Rejected:* Dynamic string accumulation (`encoded = ... + encoded`) inside the encoding `while` loop.
  * *Rationale:* String concatenation allocates new objects repeatedly. Swapped to an array-push model with a terminal `.reverse().join('')` to minimize memory churn under high concurrency. Added a proactive max integer check in the encoder block to safeguard database boundaries.

## Fastify Route Integration with Supabase | Development
* **Intent:** Expose shortener generation API with schema-enforced validation.
### Initial Prompting Strategy
**Prompt:**
"Act as a Senior Backend Engineer, write a Fastify route plugin in TypeScript for our URL shortener service.
Requirements:
Expose a POST /api/v1/shorten endpoint.
Validate the request body to ensure a valid long_url string is provided (use Fastify's native JSON Schema validation).
Inject and use the official Supabase JS client (@supabase/supabase-js) and our Base62Service class.
Implementation flow:
Insert the long_url into the urls table.
Retrieve the newly generated database id.
Call Base62Service.encode(id) to get the short code.
Update that row in Supabase with the generated short_code.
Return a 211 Created status code with JSON payload: { "short_code": "X", "short_url": "http://localhost:3000/X" }.
Constraints:
Wrap operations in try/catch blocks and return uniform API error responses.
Assume the Supabase client is passed via Fastify decoration or initialized from environment variables (SUPABASE_URL, SUPABASE_KEY)."


### AI Output Evaluation & Quality Gates
* **Accepted Components:** Schema validation properties (`format: 'uri'`), native AJV request payload validation rules, and error logging contexts.
* **Rejected/Modified Components with Rationale:**
  * *Rejected:* Leaving the service/client initializations scoped inside the plugin instantiation loop. Moved them to the file level to block redundant garbage initialization cycles.
  * *Rejected:* Vulnerable step execution where a middle-tier network or logic crash leaves an orphaned database entry with a `NULL` unique field.
  * *Rationale:* Added catch-block cascade delete tracking to guarantee database structural normalization and prevent key collision gridlocks.


  ## Fastify Redirection Route| Development
* **Intent:** High-throughput URL resolution with resilient fallback architecture.


### Initial Prompting Strategy
**Prompt:**
"Act as a Principal Engineer. Write a Fastify route plugin in TypeScript for handling the URL redirection path.
Requirements:
Expose a GET /:shortCode endpoint.
Validate that shortCode is an alphanumeric string using Fastify schema validation.
Implement Cache-Aside logic using an injected or imported Redis client:
Key schema: url:cache:{shortCode}
If the key exists in Redis, immediately redirect the user to the cached long_url using reply.redirect(302, longUrl).
If it's a cache miss, query the Supabase urls table by short_code.
If found in Supabase, write it to Redis with an expiration TTL of 86400 seconds (24 hours) and then execute the 302 redirect.
If not found anywhere, return a uniform 404 error payload.
Constraints:
Ensure all Redis operations are wrapped in try/catch blocks so that if Redis goes down, the application gracefully degrades and falls back directly to the database without crashing the whole request thread." 



### AI Output Evaluation & Quality Gates
* **Accepted Components:** Alphanumeric parameter schemas, independent error isolation per service block, and fallback logic paths.
* **Rejected/Modified Components with Rationale:**
  * *Rejected:* In-plugin database and cache client instantiation. Moved clients to global scope to safeguard connection limits.
  * *Rejected:* Synchronously awaiting (`await`) cache-aside backfills before serving the user payload.
  * *Rationale:* Writing to a cache is an internal side-effect. Offloaded the `SETEX` command to a non-blocking background micro-task to shave off critical milliseconds from the user's redirection loop.



##  Unit Test: Test script generation
* **Date & Time:** 2026-06-26
* **Intent:** Generate comprehensive unit test script fior each file
### 1. Initial Prompting Strategy
"Using [filename] file, generate a unit test script using Jest. Ensure tests cover all public methods and edge cases (invalid inputs, nulls, boundary conditions). Mock external dependencies like Supabase or Redis to keep these true unit tests. Reference the acceptance criteria from the attached README.md file "
### 2. AI Output Evaluation & Quality Gates:**
  * *Accepted:* The mocked Supabase and Redis interactions, and standard boundary tests.
  * *Modifications:* Fixed tests/unit/urlRoutes.test.ts so mockReply.status() always returns an object with .send(), preventing the send is not a function error.
Corrected route-module reloading after mocking @supabase/supabase-js and BASE_URL so tests use the updated mocked dependencies and env settings.
Updated tests/unit/Base62Service.test.ts expectations to match the actual alphabet mapping and corrected import paths.
Adjusted the update failure cleanup test to assert the rollback delete path was called, instead of checking the wrong argument.