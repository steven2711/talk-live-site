import { describe, it, expect } from 'vitest';
import { validateUsername, validateMessage } from './validation';

describe('validateUsername', () => {
  it('should validate valid usernames', () => {
    expect(validateUsername('John').isValid).toBe(true);
    expect(validateUsername('User123').isValid).toBe(true);
    expect(validateUsername('test_user').isValid).toBe(true);
    expect(validateUsername('My Name').isValid).toBe(true);
  });

  it('should reject invalid usernames', () => {
    expect(validateUsername('').isValid).toBe(false);
    expect(validateUsername('a').isValid).toBe(false);
    expect(validateUsername('verylongusernamethatexceedsthelimit').isValid).toBe(false);
    expect(validateUsername('user@name').isValid).toBe(false);
    expect(validateUsername('user#name').isValid).toBe(false);
  });

  it('should reject reserved usernames', () => {
    expect(validateUsername('admin').isValid).toBe(false);
    expect(validateUsername('system').isValid).toBe(false);
    expect(validateUsername('bot').isValid).toBe(false);
  });
});

describe('validateMessage', () => {
  it('should validate valid messages', () => {
    expect(validateMessage('Hello world!').isValid).toBe(true);
    expect(validateMessage('This is a test message.').isValid).toBe(true);
    expect(validateMessage('👋 Hello!').isValid).toBe(true);
  });

  it('should reject invalid messages', () => {
    expect(validateMessage('').isValid).toBe(false);
    expect(validateMessage('   ').isValid).toBe(false);
    expect(validateMessage('a'.repeat(1001)).isValid).toBe(false);
  });

  it('should reject spam messages', () => {
    expect(validateMessage('a'.repeat(25)).isValid).toBe(false);
    expect(validateMessage('!!!!!!!!!!!!!!!!!!!!!!!!').isValid).toBe(false);
  });
});