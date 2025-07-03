import { describe, it, expect, vi } from 'vitest';
import { cn, validateUsername, formatTime, debounce } from './index';

describe('cn utility', () => {
  it('combines class names correctly', () => {
    expect(cn('a', 'b')).toBe('a b');
    expect(cn('a', undefined, 'b')).toBe('a b');
    expect(cn('a', false && 'b', 'c')).toBe('a c');
  });
});

describe('validateUsername', () => {
  it('validates correct usernames', () => {
    expect(validateUsername('John')).toEqual({ isValid: true });
    expect(validateUsername('User123')).toEqual({ isValid: true });
    expect(validateUsername('test_user')).toEqual({ isValid: true });
  });

  it('rejects invalid usernames', () => {
    expect(validateUsername('a')).toEqual({ 
      isValid: false, 
      error: 'Username must be at least 2 characters' 
    });
    expect(validateUsername('verylongusernamethatexceedslimit')).toEqual({ 
      isValid: false, 
      error: 'Username must be less than 20 characters' 
    });
    expect(validateUsername('user@name')).toEqual({ 
      isValid: false, 
      error: 'Username can only contain letters, numbers, spaces, hyphens, and underscores' 
    });
  });
});

describe('formatTime', () => {
  it('formats time correctly', () => {
    const date = new Date('2024-01-01T12:30:00');
    expect(formatTime(date.getTime())).toMatch(/12:30/);
  });
});

describe('debounce', () => {
  it('debounces function calls', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    debounced();
    debounced();

    expect(fn).not.toHaveBeenCalled();
    
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    
    vi.useRealTimers();
  });
});