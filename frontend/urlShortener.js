function sanitizeUrl(url) {
  let sanitized = String(url || '');
  sanitized = sanitized.replace(/<script[^>]*>(.|\n|\r)*?<\/script>/gi, '');
  sanitized = sanitized.replace(/[<>"'`]/g, '');
  return sanitized.trim();
}

function validateProtocol(url) {
  return /^https?:\/\//i.test(url);
}

function validateUrl(url) {
  if (!validateProtocol(url)) {
    return false;
  }

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname;
    if (!hostname) {
      return false;
    }

    const isIpAddress = /^\d+\.\d+\.\d+\.\d+$/.test(hostname);
    if (isIpAddress) {
      return hostname.split('.').every((part) => {
        const num = Number(part);
        return Number.isInteger(num) && num >= 0 && num <= 255;
      });
    }

    if (/^localhost$/i.test(hostname)) {
      return true;
    }

    return hostname.includes('.') && /^[a-z0-9.-]+$/i.test(hostname);
  } catch (error) {
    return false;
  }
}

if (typeof window !== 'undefined') {
  window.UrlShortener = {
    sanitizeUrl,
    validateProtocol,
    validateUrl
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    sanitizeUrl,
    validateProtocol,
    validateUrl
  };
}
