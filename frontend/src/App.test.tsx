import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

describe('App', () => {
  it('renders the app title', () => {
    render(<App />);
    expect(screen.getByText('Anonymous P2P Chat')).toBeInTheDocument();
  });

  it('renders the app description', () => {
    render(<App />);
    expect(screen.getByText('Connect instantly with someone new. No registration required.')).toBeInTheDocument();
  });

  it('renders the footer text', () => {
    render(<App />);
    expect(screen.getByText('Anonymous and secure. No data is stored or tracked.')).toBeInTheDocument();
  });
});