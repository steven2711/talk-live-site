import { ErrorCodes } from '../types'

export interface ValidationResult {
  isValid: boolean
  error?: string
  code?: ErrorCodes
}

/**
 * Validates username according to chat application rules
 */
export function validateUsername(username: string): ValidationResult {
  // Check if username exists
  if (!username || typeof username !== 'string') {
    return {
      isValid: false,
      error: 'Username is required',
      code: ErrorCodes.INVALID_USERNAME
    }
  }

  const trimmed = username.trim()
  
  // Check empty after trim
  if (!trimmed) {
    return {
      isValid: false,
      error: 'Username cannot be empty',
      code: ErrorCodes.INVALID_USERNAME
    }
  }

  // Check minimum length
  if (trimmed.length < 2) {
    return {
      isValid: false,
      error: 'Username must be at least 2 characters long',
      code: ErrorCodes.INVALID_USERNAME
    }
  }

  // Check maximum length
  if (trimmed.length > 20) {
    return {
      isValid: false,
      error: 'Username must be less than 20 characters long',
      code: ErrorCodes.INVALID_USERNAME
    }
  }

  // Check for valid characters (letters, numbers, spaces, hyphens, underscores)
  if (!/^[a-zA-Z0-9_\-\s]+$/.test(trimmed)) {
    return {
      isValid: false,
      error: 'Username can only contain letters, numbers, spaces, hyphens, and underscores',
      code: ErrorCodes.INVALID_USERNAME
    }
  }

  // Check for profanity (basic list)
  const profanityList = [
    'admin', 'system', 'bot', 'moderator', 'support',
    // Add more as needed
  ]
  
  if (profanityList.some(word => trimmed.toLowerCase().includes(word))) {
    return {
      isValid: false,
      error: 'Username contains reserved words',
      code: ErrorCodes.INVALID_USERNAME
    }
  }

  return { isValid: true }
}

/**
 * Validates message content
 */
export function validateMessage(content: string): ValidationResult {
  if (!content || typeof content !== 'string') {
    return {
      isValid: false,
      error: 'Message content is required'
    }
  }

  const trimmed = content.trim()
  
  if (!trimmed) {
    return {
      isValid: false,
      error: 'Message cannot be empty'
    }
  }

  if (trimmed.length > 1000) {
    return {
      isValid: false,
      error: 'Message is too long (maximum 1000 characters)',
      code: ErrorCodes.MESSAGE_TOO_LONG
    }
  }

  // Check for spam patterns (repeated characters)
  if (/(.)\1{20,}/.test(trimmed)) {
    return {
      isValid: false,
      error: 'Message contains excessive repeated characters'
    }
  }

  return { isValid: true }
}

/**
 * Sanitizes user input by removing potentially dangerous characters
 */
export function sanitizeInput(input: string): string {
  if (!input || typeof input !== 'string') {
    return ''
  }

  return input
    .trim()
    .replace(/[<>]/g, '') // Remove angle brackets to prevent basic XSS
    .substring(0, 1000) // Limit length
}

/**
 * Checks if rate limit is exceeded for a user
 */
export function checkRateLimit(
  userActivity: Map<string, number[]>, 
  userId: string, 
  windowMs: number = 60000, // 1 minute
  maxRequests: number = 10
): ValidationResult {
  const now = Date.now()
  const userRequests = userActivity.get(userId) || []
  
  // Filter requests within the time window
  const recentRequests = userRequests.filter(timestamp => now - timestamp < windowMs)
  
  if (recentRequests.length >= maxRequests) {
    return {
      isValid: false,
      error: 'Rate limit exceeded. Please slow down.',
      code: ErrorCodes.RATE_LIMIT_EXCEEDED
    }
  }

  // Update user activity
  recentRequests.push(now)
  userActivity.set(userId, recentRequests)

  return { isValid: true }
}

/**
 * Validates socket connection data
 */
export function validateSocketData(data: any): ValidationResult {
  if (!data || typeof data !== 'object') {
    return {
      isValid: false,
      error: 'Invalid socket data format'
    }
  }

  return { isValid: true }
}