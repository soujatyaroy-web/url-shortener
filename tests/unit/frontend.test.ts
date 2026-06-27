/**
 * @jest-environment jsdom
 */

import { sanitizeUrl, validateProtocol, validateUrl } from '../../frontend/urlShortener';

describe('Frontend helper functions', () => {
  it('sanitizes URLs by removing script content and unsafe characters', () => {
    const raw = 'https://example.com/<script>alert(1)</script>?a=1"<';
    const sanitized = sanitizeUrl(raw);

    expect(sanitized).toBe('https://example.com/?a=1');
  });

  it('validates http and https protocols', () => {
    expect(validateProtocol('https://example.com')).toBe(true);
    expect(validateProtocol('http://example.com')).toBe(true);
    expect(validateProtocol('ftp://example.com')).toBe(false);
    expect(validateProtocol('example.com')).toBe(false);
  });

  it('rejects invalid hostnames such as https://whahsh', () => {
    expect(validateUrl('https://whahsh')).toBe(false);
    expect(validateUrl('https://example.com')).toBe(true);
    expect(validateUrl('https://localhost')).toBe(true);
  });
});

describe('Frontend UI integration', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = `
      <form id="shorten-form">
        <textarea id="longUrl"></textarea>
      </form>
      <div id="message" class="message hidden"></div>
      <div id="result" class="result hidden">
        <a id="shortLink"></a>
      </div>
      <button id="copyButton"></button>
      <button id="submitButton"></button>
      <span id="charCount"></span>
    `;

    global.fetch = jest.fn();
  });

  it('shows a clear error when protocol is invalid', async () => {
    require('../../frontend/script.js');

    const textarea = document.getElementById('longUrl');
    const form = document.getElementById('shorten-form');
    const message = document.getElementById('message');

    textarea.value = 'ftp://example.com';
    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(message.textContent).toContain('URL must start with http:// or https://.');
  });

  it('shows a clear error when the hostname is invalid', async () => {
    require('../../frontend/script.js');

    const textarea = document.getElementById('longUrl');
    const form = document.getElementById('shorten-form');
    const message = document.getElementById('message');

    textarea.value = 'https://whahsh';
    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(message.textContent).toContain('Please enter a valid URL before submitting.');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('posts a valid URL and displays the returned short link', async () => {
    const fakeResponse = {
      ok: true,
      json: jest.fn().mockResolvedValue({ short_url: 'https://short.io/abc123' })
    };
    global.fetch = jest.fn().mockResolvedValue(fakeResponse as any);

    require('../../frontend/script.js');

    const textarea = document.getElementById('longUrl');
    const form = document.getElementById('shorten-form');
    const message = document.getElementById('message');
    const shortLink = document.getElementById('shortLink');

    textarea.value = 'https://example.com/page';
    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(global.fetch).toHaveBeenCalledWith('http://localhost:3000/api/v1/shorten', expect.objectContaining({
      method: 'POST'
    }));
    expect(message.textContent).toContain('Round-trip completed');
    expect(shortLink.textContent).toBe('https://short.io/abc123');
  });
});
