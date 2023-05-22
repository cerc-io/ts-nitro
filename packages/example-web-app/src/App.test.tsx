import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders nitro-client test output paragraph', () => {
  render(<App />);
  const paraElement = screen.getByText(/test output/i);
  expect(paraElement).toBeInTheDocument();
});
