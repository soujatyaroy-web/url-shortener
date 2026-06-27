const form = document.getElementById('shorten-form');
const longUrlInput = document.getElementById('longUrl');
const charCount = document.getElementById('charCount');
const messageBox = document.getElementById('message');
const resultBox = document.getElementById('result');
const shortLink = document.getElementById('shortLink');
const copyButton = document.getElementById('copyButton');
const submitButton = document.getElementById('submitButton');

const MAX_LENGTH = 2048;
const API_BASE_URL = window.API_BASE_URL || 'http://localhost:3000';

let sanitizeUrlFn;
let validateProtocolFn;
let validateUrlFn;

if (typeof module !== 'undefined' && module.exports) {
  ({ sanitizeUrl: sanitizeUrlFn, validateProtocol: validateProtocolFn, validateUrl: validateUrlFn } = require('./urlShortener'));
} else if (window.UrlShortener) {
  ({ sanitizeUrl: sanitizeUrlFn, validateProtocol: validateProtocolFn, validateUrl: validateUrlFn } = window.UrlShortener);
}

function updateCharCount() {
  charCount.textContent = `${longUrlInput.value.length} / ${MAX_LENGTH}`;
}

function showMessage(text, type = 'error') {
  messageBox.textContent = text;
  messageBox.className = `message ${type}`;
  messageBox.classList.remove('hidden');
}

function hideResult() {
  resultBox.classList.add('hidden');
  shortLink.textContent = '';
  shortLink.href = '#';
}

function showResult(url) {
  shortLink.textContent = url;
  shortLink.href = url;
  resultBox.classList.remove('hidden');
}

function setLoading(isLoading) {
  submitButton.disabled = isLoading;
  submitButton.textContent = isLoading ? 'Shortening...' : 'Shorten URL';
}

copyButton.addEventListener('click', () => {
  const url = shortLink.href;
  if (!url || url === '#') return;
  navigator.clipboard.writeText(url).then(() => {
    showMessage('Short URL copied to clipboard!', 'success');
  });
});

longUrlInput.addEventListener('input', updateCharCount);
updateCharCount();

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideResult();
  messageBox.classList.add('hidden');

  const rawUrl = longUrlInput.value;
  const url = sanitizeUrlFn(rawUrl);

  if (!url) {
    showMessage('Please enter a URL before submitting.');
    return;
  }

  if (url.length > MAX_LENGTH) {
    showMessage('URLs longer than 2,048 characters are not allowed.');
    return;
  }

  if (!validateProtocolFn(url)) {
    showMessage('URL must start with http:// or https://.');
    return;
  }

  if (!validateUrlFn(url)) {
    showMessage('Please enter a valid URL before submitting.');
    return;
  }

  setLoading(true);

  try {
    const startTime = performance.now();
    const response = await fetch(`${API_BASE_URL}/api/v1/shorten`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ long_url: url })
    });
    const elapsed = performance.now() - startTime;

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(errorData?.message || 'Unable to shorten the URL.');
    }

    const data = await response.json();
    const shortUrl = data.short_url || data.shortCode || data.short_code;

    if (!shortUrl) {
      throw new Error('Server returned an invalid short link.');
    }

    showMessage(`Round-trip completed in ${Math.round(elapsed)} ms.`, 'success');
    showResult(shortUrl);
  } catch (error) {
    showMessage(error.message || 'An unexpected error occurred.');
  } finally {
    setLoading(false);
  }
});
