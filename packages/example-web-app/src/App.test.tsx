import React from 'react';
import { render, screen } from '@testing-library/react';
// import App from './App';

// Module imports throw error
// https://github.com/facebook/create-react-app/issues/12063
xtest('renders nitro-client test output paragraph', () => {
  // render(<App />);
  const paraElement = screen.getByText(/test output/i);
  expect(paraElement).toBeInTheDocument();
});
