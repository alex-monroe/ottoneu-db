import '@testing-library/jest-dom'

// Mock the Request and Response globals for Next.js API route tests in JSDOM
if (typeof Request === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Request: EdgeRequest, Response: EdgeResponse, Headers: EdgeHeaders } = require('next/dist/compiled/@edge-runtime/primitives');
  global.Request = EdgeRequest;
  global.Response = EdgeResponse;
  global.Headers = EdgeHeaders;
}
