import '@testing-library/jest-dom'

// Mock the Request and Response globals for Next.js API route tests in JSDOM
if (typeof Request === 'undefined') {
  const { Request, Response, Headers } = require('next/dist/compiled/@edge-runtime/primitives');
  global.Request = Request;
  global.Response = Response;
  global.Headers = Headers;
}
