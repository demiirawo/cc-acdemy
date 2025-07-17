import DOMPurify from 'dompurify';

// Configure DOMPurify for safe HTML sanitization
const sanitizeConfig = {
  ALLOWED_TAGS: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'br', 'strong', 'em', 'u', 's',
    'ul', 'ol', 'li',
    'blockquote', 'pre', 'code',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'a', 'img',
    'div', 'span'
  ],
  ALLOWED_ATTR: [
    'href', 'target', 'rel',
    'src', 'alt', 'width', 'height',
    'class', 'style',
    'contenteditable', 'dir'
  ],
  ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  ADD_ATTR: ['target'],
  FORBID_TAGS: ['script', 'object', 'embed', 'form', 'input', 'button'],
  FORBID_ATTR: ['onload', 'onerror', 'onclick', 'onmouseover']
};

/**
 * Sanitize HTML content to prevent XSS attacks
 * @param html - The HTML string to sanitize
 * @returns Sanitized HTML string safe for rendering
 */
export const sanitizeHtml = (html: string): string => {
  return DOMPurify.sanitize(html, sanitizeConfig);
};

/**
 * Validate URL format for security
 * @param url - URL to validate
 * @returns true if URL is valid and safe
 */
export const validateUrl = (url: string): boolean => {
  try {
    const urlObj = new URL(url);
    // Only allow http and https protocols
    return ['http:', 'https:'].includes(urlObj.protocol);
  } catch {
    return false;
  }
};

/**
 * Validate and sanitize user input text
 * @param text - Text to validate
 * @param maxLength - Maximum allowed length
 * @returns Sanitized text or throws error if invalid
 */
export const validateText = (text: string, maxLength: number = 1000): string => {
  if (typeof text !== 'string') {
    throw new Error('Input must be a string');
  }
  
  if (text.length > maxLength) {
    throw new Error(`Text exceeds maximum length of ${maxLength} characters`);
  }
  
  // Remove potential script injections
  const cleaned = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  
  return cleaned.trim();
};

/**
 * Validate recommended reading data structure
 * @param data - Recommended reading array to validate
 * @returns true if data structure is valid
 */
export const validateRecommendedReading = (data: any[]): boolean => {
  if (!Array.isArray(data)) {
    return false;
  }
  
  return data.every(item => {
    return (
      item &&
      typeof item === 'object' &&
      typeof item.title === 'string' &&
      typeof item.url === 'string' &&
      typeof item.type === 'string' &&
      item.title.length <= 255 &&
      validateUrl(item.url) &&
      ['link', 'document', 'video', 'article'].includes(item.type)
    );
  });
};