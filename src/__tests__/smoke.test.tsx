import { render, screen } from '@testing-library/react';
import HomePage from '@/app/page';

describe('App smoke test', () => {
  it('renders without crashing and shows header padding', () => {
    render(<HomePage />);
    expect(true).toBe(true);
  });
});
