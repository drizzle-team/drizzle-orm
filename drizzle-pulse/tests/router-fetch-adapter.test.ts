/**
 * DB-free unit test for createRouterFetchAdapter (the 22-line fetch-compatible shim
 * wrapping a Hono router). No database, slot, or WAL provisioning: the adapter is
 * exercised against a stub in-process Hono echo app.
 *
 * The subscribe/pull/PulseQuery DB round-trips this suite used to cover live on:
 * runtime-contracts.test.ts (route contracts), client-state.test.ts, property.test.ts,
 * and consistency-oracle.test.ts (PulseQuery-through-router paths) — all of them already
 * go through createRouterFetchAdapter in production-shaped scenarios.
 */

import { describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { createRouterFetchAdapter } from './helpers/test-harness.js';

type EchoBody = {
  method: string;
  path: string;
  search: Record<string, string>;
  headers: Record<string, string>;
  body: string;
};

function createEchoApp(): Hono {
  const app = new Hono();
  app.all('*', async (c) => {
    const headers: Record<string, string> = {};
    c.req.raw.headers.forEach((value, key) => {
      headers[key] = value;
    });
    const echo: EchoBody = {
      method: c.req.method,
      path: c.req.path,
      search: c.req.query(),
      headers,
      body: await c.req.text(),
    };
    return c.json(echo);
  });
  return app;
}

async function echo(response: Response): Promise<EchoBody> {
  return (await response.json()) as EchoBody;
}

describe('createRouterFetchAdapter', () => {
  test('string-URL input reaches the app with the right method, path, and body', async () => {
    const fetchImpl = createRouterFetchAdapter(createEchoApp());

    const response = await fetchImpl('http://localhost/echo?x=1', {
      method: 'POST',
      body: 'hello',
    });

    const body = await echo(response);
    expect(body.method).toBe('POST');
    expect(body.path).toBe('/echo');
    expect(body.search).toEqual({ x: '1' });
    expect(body.body).toBe('hello');
  });

  test('URL-object input behaves identically to a string URL', async () => {
    const fetchImpl = createRouterFetchAdapter(createEchoApp());

    const response = await fetchImpl(new URL('http://localhost/echo?x=1'), {
      method: 'POST',
      body: 'hello',
    });

    const body = await echo(response);
    expect(body.method).toBe('POST');
    expect(body.path).toBe('/echo');
    expect(body.search).toEqual({ x: '1' });
    expect(body.body).toBe('hello');
  });

  test('Request-object input carries its url, method, headers, and body through (previously untested)', async () => {
    const fetchImpl = createRouterFetchAdapter(createEchoApp());
    const request = new Request('http://localhost/echo?x=1', {
      method: 'POST',
      headers: { 'x-custom': 'from-request' },
      body: 'request-body',
    });

    const response = await fetchImpl(request);

    const body = await echo(response);
    expect(body.method).toBe('POST');
    expect(body.path).toBe('/echo');
    expect(body.search).toEqual({ x: '1' });
    expect(body.headers['x-custom']).toBe('from-request');
    expect(body.body).toBe('request-body');
  });

  test('init overrides a Request input when both are provided', async () => {
    const fetchImpl = createRouterFetchAdapter(createEchoApp());
    const request = new Request('http://localhost/echo', {
      method: 'POST',
      headers: { 'x-custom': 'from-request' },
      body: 'request-body',
    });

    const response = await fetchImpl(request, {
      method: 'PUT',
      headers: { 'x-custom': 'from-init' },
      body: 'init-body',
    });

    const body = await echo(response);
    expect(body.method).toBe('PUT');
    expect(body.headers['x-custom']).toBe('from-init');
    expect(body.body).toBe('init-body');
  });

  test('header normalization: plain-object and Headers-instance inputs both arrive usable', async () => {
    const fetchImpl = createRouterFetchAdapter(createEchoApp());

    const plainObjectResponse = await fetchImpl('http://localhost/echo', {
      headers: { 'X-Test': 'plain-object' },
    });
    const plainObjectBody = await echo(plainObjectResponse);
    expect(plainObjectBody.headers['x-test']).toBe('plain-object');

    const headersInstanceResponse = await fetchImpl('http://localhost/echo', {
      headers: new Headers({ 'X-Test': 'headers-instance' }),
    });
    const headersInstanceBody = await echo(headersInstanceResponse);
    expect(headersInstanceBody.headers['x-test']).toBe('headers-instance');
  });

  test('preconnect is a callable no-op', () => {
    const fetchImpl = createRouterFetchAdapter(createEchoApp());
    expect(typeof fetchImpl.preconnect).toBe('function');
    expect(() => fetchImpl.preconnect('http://localhost')).not.toThrow();
  });
});
