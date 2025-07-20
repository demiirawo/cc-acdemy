import DOMPurify from 'dompurify';

// Configure DOMPurify for safe HTML sanitization
const createDOMPurifyConfig = () => ({
  ALLOWED_TAGS: [
    'p', 'br', 'strong', 'em', 'u', 's', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li', 'blockquote', 'a', 'img', 'div', 'span', 'pre', 'code',
    'table', 'thead', 'tbody', 'tr', 'th', 'td'
  ],
  ALLOWED_ATTR: [
    'href', 'src', 'alt', 'title', 'class', 'id', 'style', 'target',
    'rel', 'width', 'height'
  ],
  ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  FORBID_SCRIPTS: true,
  FORBID_TAGS: ['script', 'object', 'embed', 'form', 'input', 'textarea', 'select', 'button'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
  KEEP_CONTENT: true,
  RETURN_DOM: false,
  RETURN_DOM_FRAGMENT: false,
  RETURN_TRUSTED_TYPE: false
});

/**
 * Sanitize HTML content to prevent XSS attacks
 * @param html - Raw HTML string to sanitize
 * @returns Sanitized HTML string safe for rendering
 */
export const sanitizeHtml = (html: string): string => {
  if (!html || typeof html !== 'string') {
    return '';
  }
  
  return DOMPurify.sanitize(html, createDOMPurifyConfig());
};

/**
 * Sanitize text content by escaping HTML entities
 * @param text - Raw text to sanitize
 * @returns HTML-escaped text safe for rendering
 */
export const sanitizeText = (text: string): string => {
  if (!text || typeof text !== 'string') {
    return '';
  }
  
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
};

/**
 * Validate email domain against allowed domains
 * @param email - Email address to validate
 * @returns boolean indicating if email domain is allowed
 */
export const validateEmailDomain = (email: string): boolean => {
  if (!email || typeof email !== 'string') {
    return false;
  }
  
  const allowedDomains = ['care-cuddle.co.uk'];
  const emailDomain = email.split('@')[1]?.toLowerCase();
  
  return allowedDomains.includes(emailDomain || '');
};

/**
 * Validate and sanitize URL
 * @param url - URL to validate and sanitize
 * @returns Sanitized URL or empty string if invalid
 */
export const sanitizeUrl = (url: string): string => {
  if (!url || typeof url !== 'string') {
    return '';
  }
  
  try {
    const parsedUrl = new URL(url);
    
    // Only allow http, https, and mailto protocols
    if (!['http:', 'https:', 'mailto:'].includes(parsedUrl.protocol)) {
      return '';
    }
    
    return parsedUrl.toString();
  } catch {
    return '';
  }
};

/**
 * Rate limiting helper for client-side operations
 */
export const createRateLimiter = (maxRequests: number, windowMs: number) => {
  const requests = new Map<string, number[]>();
  
  return (key: string): boolean => {
    const now = Date.now();
    const windowStart = now - windowMs;
    
    // Get existing requests for this key
    const keyRequests = requests.get(key) || [];
    
    // Filter out old requests
    const recentRequests = keyRequests.filter(time => time > windowStart);
    
    // Check if we're over the limit
    if (recentRequests.length >= maxRequests) {
      return false;
    }
    
    // Add current request
    recentRequests.push(now);
    requests.set(key, recentRequests);
    
    return true;
  };
};

/**
 * Content Security Policy configuration
 */
export const getCSPDirectives = () => ({
  'default-src': ["'self'"],
  'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
  'style-src': ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
  'font-src': ["'self'", "https://fonts.gstatic.com"],
  'img-src': ["'self'", "data:", "https:", "blob:"],
  'connect-src': ["'self'", "https://*.supabase.co", "wss://*.supabase.co"],
  'frame-ancestors': ["'none'"],
  'object-src': ["'none'"],
  'base-uri': ["'self'"]
});