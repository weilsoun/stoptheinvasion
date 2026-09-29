import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createJevClient, validateJevResponse } from '../scripts/jev-provider';
import type { JevRequest } from '../scripts/jev-types';

const request: JevRequest = {
  state: { hull: 12, shield: 0, incoming: 8 },
  questions: { action: { type: 'choice', instructions: 'Choose the immediate action.', criteria: { attack: 'Deal 6 damage', shield: 'Gain 8 shield' } } },
};
function response() {
  return {
    model: 'jev-1.13.0',
    answers: { action: { type: 'choice', choice: 'shield', probabilities: { attack: 0.1, shield: 0.9 }, confidence: 0.8 } },
    usage: { input_tokens: 120, output_tokens: 12 }, costUsd: 0.0001,
  };
}

describe('Jev response trust boundary', () => {
  test('accepts actual provider provenance and tied highest choices', () => {
    const raw = response();
    raw.model = 'typesafe/jev-1.13.0';
    raw.answers.action.probabilities = { attack: 0.5, shield: 0.5 };
    const accepted = validateJevResponse(request, raw);
    expect(accepted.model).toBe('typesafe/jev-1.13.0');
    expect(accepted.answers.action.choice).toBe('shield');
    raw.answers.action.probabilities.shield = 0;
    expect(accepted.answers.action.probabilities.shield).toBe(0.5);
  });

  test('preserves an observed IEEE754 highest-probability tie without admitting lower choices', () => {
    const probabilities = { option_2: 0.26, option_1: 0.06, option_0: 0.12, option_4: 0.28, option_3: 0.27999999999999997 };
    const observedRequest = { ...request, questions: { action: { ...request.questions.action, criteria: Object.fromEntries(Object.keys(probabilities).map(label => [label, null])) } } };
    const raw = { model: 'typesafe/jev-latest', answers: { action: { type: 'choice', choice: 'option_3', confidence: 0.11, probabilities } } };
    expect(validateJevResponse(observedRequest, raw)).toEqual(raw);
    expect(() => validateJevResponse(observedRequest, { ...raw, answers: { action: { ...raw.answers.action, choice: 'option_2' } } })).toThrow('highest-probability');
  });

  test('rejects wrong provider, absent answers, and missing or extra question answers', () => {
    for (const model of ['openai/jev-1.13.0', 'typesafe/other', 'smol', '', undefined]) {
      expect(() => validateJevResponse(request, { ...response(), model })).toThrow();
    }
    for (const answers of [undefined, [], {}, { ...response().answers, extra: response().answers.action }]) {
      expect(() => validateJevResponse(request, { ...response(), answers })).toThrow();
    }
    expect(() => validateJevResponse(request, { ...response(), error: 'failed' })).toThrow();
  });

  test('rejects forged choices, missing types, and nonmaximal selected choices', () => {
    for (const patch of [{ choice: 'repair' }, { choice: 'toString' }, { type: 'score' }, { type: undefined }, { choice: 'attack' }]) {
      expect(() => validateJevResponse(request, { ...response(), answers: { action: { ...response().answers.action, ...patch } } })).toThrow();
    }
  });

  test('rejects malformed probability keys, values, and unnormalized distributions', () => {
    for (const probabilities of [
      { shield: 1 }, { attack: 0.1, shield: 0.9, repair: 0 },
      { attack: -0.1, shield: 1.1 }, { attack: 0.1, shield: Number.NaN },
      { attack: 0.1, shield: Number.POSITIVE_INFINITY }, { attack: '0.1', shield: 0.9 },
      { attack: 0.1, shield: 0.8 }, [], null,
    ]) {
      expect(() => validateJevResponse(request, { ...response(), answers: { action: { ...response().answers.action, probabilities } } })).toThrow();
    }
    for (const confidence of [-0.01, 1.01, Number.NaN, Infinity, '0.9', undefined]) {
      expect(() => validateJevResponse(request, { ...response(), answers: { action: { ...response().answers.action, confidence } } })).toThrow();
    }
  });

  test('preserves the observed seven-option rounded response without normalization', () => {
    const probabilities = { option_4: 0.03, option_0: 0.06, option_6: 0.06, option_5: 0.23, option_2: 0.04, option_3: 0.55, option_1: 0.02 };
    const observedRequest = { ...request, questions: { action: { ...request.questions.action, criteria: Object.fromEntries(Object.keys(probabilities).map(label => [label, null])) } } };
    const raw = { model: 'typesafe/jev-latest', costUsd: 0, answers: { action: { type: 'choice', choice: 'option_3', confidence: 0.47, probabilities } } };
    const accepted = validateJevResponse(observedRequest, raw);
    expect(accepted).toEqual(raw);
    expect(Object.values(accepted.answers.action.probabilities).reduce((sum, probability) => sum + probability, 0)).toBeCloseTo(0.99, 12);
    for (const invalid of [
      { ...probabilities, option_3: 0.51 }, // 0.95: beyond seven rounding intervals.
      { ...probabilities, option_3: 0.60 }, // 1.04: beyond seven rounding intervals.
      { ...probabilities, option_4: 0.0301 }, // Higher precision must retain tight tolerance.
    ]) {
      expect(() => validateJevResponse(observedRequest, { ...raw, answers: { action: { ...raw.answers.action, probabilities: invalid } } })).toThrow('probability sum');
    }
    expect(() => validateJevResponse(observedRequest, { ...raw, answers: { action: { ...raw.answers.action, choice: 'option_5' } } })).toThrow('highest-probability');
    const allZero = Object.fromEntries(Array.from({ length: 255 }, (_, index) => [`option_${index}`, 0]));
    const zeroRequest = { ...observedRequest, questions: { action: { ...observedRequest.questions.action, criteria: Object.fromEntries(Object.keys(allZero).map(label => [label, null])) } } };
    expect(() => validateJevResponse(zeroRequest, { ...raw, answers: { action: { ...raw.answers.action, probabilities: allZero } } })).toThrow('probability sum');
  });

  test('rejects malformed usage and cost metadata rather than fabricating totals', () => {
    for (const usage of [null, {}, { input_tokens: -1, output_tokens: 2 }, { input_tokens: 1.5, output_tokens: 2 }, { input_tokens: 1, output_tokens: Infinity }]) {
      expect(() => validateJevResponse(request, { ...response(), usage })).toThrow();
    }
    for (const costUsd of [-1, Infinity, NaN, '0.1']) expect(() => validateJevResponse(request, { ...response(), costUsd })).toThrow();
    const accepted = validateJevResponse(request, { model: response().model, answers: response().answers });
    expect(accepted.usage).toBeUndefined();
    expect(accepted.costUsd).toBeUndefined();
  });
});

describe('bounded HTTP transport', () => {
  let previousKey: string | undefined;
  let restoreFetch: (() => void) | undefined;
  beforeEach(() => {
    previousKey = process.env.TYPESAFE_API_KEY;
    process.env.TYPESAFE_API_KEY = 'unit-test-only-not-a-credential';
    // Every test starts with a denied network path, including configuration errors.
    const mocked = spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected test network call'));
    restoreFetch = () => mocked.mockRestore();
  });
  afterEach(() => {
    restoreFetch?.();
    if (previousKey === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = previousKey;
  });

  test('requires credentials, a finite request quota, and an official Jev alias or version', () => {
    for (const maxRequests of [0, -1, 1.5, NaN, Infinity]) expect(() => createJevClient({ transport: 'http', maxRequests })).toThrow();
    for (const model of ['gpt-4', 'typesafe/jev-1.13.0', 'jev-unknown']) expect(() => createJevClient({ transport: 'http', maxRequests: 1, model })).toThrow();
    delete process.env.TYPESAFE_API_KEY;
    expect(() => createJevClient({ transport: 'http', maxRequests: 1 })).toThrow('TYPESAFE_API_KEY');
  });

  test('default latest alias accepts concrete or alias provenance without inventing a version', async () => {
    const models = ['jev-latest', 'typesafe/jev-latest', 'jev-1.13.0', 'typesafe/jev-1.13.0'];
    const fetchMock = spyOn(globalThis, 'fetch');
    const client = createJevClient({ transport: 'http', maxRequests: models.length });
    try {
      for (const model of models) {
        fetchMock.mockResolvedValueOnce(Response.json({ ...response(), model }));
        expect((await client.evaluate(request)).model).toBe(model);
      }
      expect(client.stats.models).toEqual(models);
    } finally { client.close(); }
  });

  test('caps accepted requests and records only validated actual usage', async () => {
    const fetchMock = spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(response()));
    const client = createJevClient({ transport: 'http', maxRequests: 1 });
    try {
      expect((await client.evaluate(request)).answers.action.choice).toBe('shield');
      await expect(client.evaluate(request)).rejects.toThrow('request limit');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(client.stats).toEqual({ requests: 1, models: ['jev-1.13.0'], inputTokens: 120, outputTokens: 12, costUsd: 0.0001 });
    } finally { client.close(); }
  });

  test('rejects invalid choice cardinality and oversized requests before I/O', async () => {
    const fetchMock = spyOn(globalThis, 'fetch');
    const client = createJevClient({ transport: 'http', maxRequests: 1 });
    try {
      for (const count of [1, 256]) {
        const invalid = { ...request, questions: { action: { ...request.questions.action, criteria: Object.fromEntries(Array.from({ length: count }, (_, i) => [`option${i}`, null])) } } };
        await expect(client.evaluate(invalid)).rejects.toThrow('2..255');
      }
      await expect(client.evaluate({ ...request, state: 'x'.repeat(1_048_576) })).rejects.toThrow('byte limit');
      expect(client.stats.requests).toBe(0);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally { client.close(); }
  });

  test('network, HTTP, JSON, model, and choice failures are terminal with no retry', async () => {
    const cases: Array<() => Promise<Response>> = [
      async () => { throw new Error('transport disconnected'); },
      async () => new Response('service unavailable', { status: 503 }),
      async () => new Response('{'),
      async () => Response.json({ ...response(), model: 'openai/small' }),
      async () => Response.json({ ...response(), model: 'jev-1.12.0' }),
      async () => Response.json({ ...response(), model: 'typesafe/jev-latest' }),
      async () => Response.json({ ...response(), answers: {} }),
    ];
    for (const implementation of cases) {
      const fetchMock = spyOn(globalThis, 'fetch').mockImplementation(implementation);
      fetchMock.mockClear();
      const client = createJevClient({ transport: 'http', maxRequests: 4, model: 'jev-1.13.0' });
      try {
        await expect(client.evaluate(request)).rejects.toThrow();
        await expect(client.evaluate(request)).rejects.toThrow();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(client.stats.requests).toBe(1);
        expect(client.stats.models).toEqual([]);
        expect(client.stats.inputTokens).toBeNull();
      } finally { client.close(); }
    }
  });

  test('missing usage stays unknown even when subsequent answers report it', async () => {
    const withoutUsage = { model: response().model, answers: response().answers, costUsd: 0.0002 };
    spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json(withoutUsage)).mockResolvedValueOnce(Response.json(response()));
    const client = createJevClient({ transport: 'http', maxRequests: 2 });
    try {
      await client.evaluate(request);
      expect(client.stats.inputTokens).toBeNull();
      expect(client.stats.outputTokens).toBeNull();
      expect(client.stats.costUsd).toBe(0.0002);
      await client.evaluate(request);
      expect(client.stats.inputTokens).toBeNull();
      expect(client.stats.costUsd).toBeCloseTo(0.0003, 8);
    } finally { client.close(); }
  });

  test('an unresponsive provider times out, aborts, and never retries', async () => {
    const nativeTimeout = globalThis.setTimeout;
    const timerMock = spyOn(globalThis, 'setTimeout').mockImplementation((handler, delay, ...args) => nativeTimeout(handler, delay === 30_000 ? 1 : delay, ...args));
    const gate = Promise.withResolvers<Response>();
    let signal: AbortSignal | null | undefined;
    const fetchMock = spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => { signal = init?.signal; return gate.promise; });
    const client = createJevClient({ transport: 'http', maxRequests: 3 });
    try {
      await expect(client.evaluate(request)).rejects.toThrow('timed out');
      expect(signal?.aborted).toBe(true);
      await expect(client.evaluate(request)).rejects.toThrow('timed out');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      gate.resolve(Response.json(response()));
      client.close();
      timerMock.mockRestore();
    }
  });

  test('rejects overlapping evaluations and close aborts an outstanding request', async () => {
    const gate = Promise.withResolvers<Response>();
    let signal: AbortSignal | null | undefined;
    const fetchMock = spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => { signal = init?.signal; return gate.promise; });
    const client = createJevClient({ transport: 'http', maxRequests: 3 });
    const running = client.evaluate(request);
    const rejected = running.catch(error => error);
    await expect(client.evaluate(request)).rejects.toThrow('one outstanding');
    client.close();
    expect(await rejected).toMatchObject({ message: 'Jev client closed' });
    expect(signal?.aborted).toBe(true);
    gate.resolve(Response.json(response()));
    await expect(client.evaluate(request)).rejects.toThrow('closed');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

interface StdioMessage { kind: string; id?: number; [key: string]: unknown }
async function withStdio(action: (io: {
  next(): Promise<StdioMessage>;
  send(value: unknown): void;
  sendRaw(value: string): void;
  end(): void;
}) => Promise<void>, maxRequests = 3) {
  const moduleUrl = new URL('../scripts/jev-provider.ts', import.meta.url).href;
  const script = `
    import { createJevClient } from ${JSON.stringify(moduleUrl)};
    const client = createJevClient({transport:'stdio',maxRequests:${maxRequests}});
    const outcomes = [];
    try {
      for (let i=0;i<2;i++) {
        try { const answer = await client.evaluate(${JSON.stringify(request)}); outcomes.push({choice:answer.answers.action.choice}); }
        catch(error) { outcomes.push({error:error.message}); }
      }
    } finally { client.close(); }
    console.log(JSON.stringify({kind:'test-result',outcomes,stats:client.stats}));
  `;
  const child = spawn(process.execPath, ['--eval', script], { stdio: ['pipe', 'pipe', 'pipe'] });
  const lines = createInterface({ input: child.stdout });
  const iterator = lines[Symbol.asyncIterator]();
  const exit = Promise.withResolvers<number | null>();
  child.on('exit', exit.resolve);
  child.on('error', exit.reject);
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  try {
    await action({
      next: async () => {
        const line = await iterator.next();
        if (line.done) throw new Error(`Jev fixture ended early: ${stderr}`);
        return JSON.parse(line.value) as StdioMessage;
      },
      send: (value) => { child.stdin.write(`${JSON.stringify(value)}\n`); },
      sendRaw: (value) => { child.stdin.write(value); },
      end: () => { child.stdin.end(); },
    });
    expect(await exit.promise).toBe(0);
  } finally {
    child.kill();
    lines.close();
    child.stdin.destroy();
  }
}

describe('correlated stdio transport', () => {
  test('accepts a correlated actual model answer then enforces the request cap', async () => {
    await withStdio(async (io) => {
      const outgoing = await io.next();
      expect(outgoing.kind).toBe('judge');
      io.send({ kind: 'answer', id: outgoing.id, ...response(), model: 'typesafe/jev-1.13.0' });
      const result = await io.next();
      expect(result.kind).toBe('test-result');
      expect(result.outcomes).toEqual([{ choice: 'shield' }, { error: 'Jev request limit reached (1)' }]);
      expect(result.stats).toMatchObject({ requests: 1, models: ['typesafe/jev-1.13.0'] });
    }, 1);
  });

  test('uncorrelated, malformed, error, wrong-provider, and EOF replies stop all later requests', async () => {
    for (const failure of ['id', 'kind', 'json', 'error', 'model', 'eof']) {
      await withStdio(async (io) => {
        const outgoing = await io.next();
        if (failure === 'json') io.sendRaw('{invalid}\n');
        else if (failure === 'eof') io.end();
        else io.send({ kind: failure === 'kind' ? 'result' : 'answer', id: failure === 'id' ? 999 : outgoing.id, ...response(), ...(failure === 'error' ? { error: 'judge failed' } : {}), ...(failure === 'model' ? { model: 'openai/small' } : {}) });
        const result = await io.next();
        expect(result.kind).toBe('test-result');
        const outcomes = result.outcomes as Array<{ error: string }>;
        expect(outcomes[0].error).toBeString();
        expect(outcomes[1].error).toBe(outcomes[0].error);
        expect(result.stats).toMatchObject({ requests: 1, models: [] });
      });
    }
  });

  test('a previous answer cannot satisfy the next decision', async () => {
    await withStdio(async (io) => {
      const first = await io.next();
      io.send({ kind: 'answer', id: first.id, ...response() });
      const second = await io.next();
      expect(second.kind).toBe('judge');
      expect(second.id).not.toBe(first.id);
      io.send({ kind: 'answer', id: first.id, ...response() });
      const result = await io.next();
      expect(result.outcomes).toEqual([{ choice: 'shield' }, { error: 'Jev stdio correlation failure' }]);
      expect(result.stats).toMatchObject({ requests: 2 });
    });
  });
});
