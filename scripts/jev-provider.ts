import type { JevAnswer, JevEvaluator, JevRequest, JevResponse } from './jev-types';

const TIMEOUT_MS = 30_000;
const MAX_BYTES = 1_048_576;
const MODEL = /^(?:typesafe\/)?jev-(?:latest|\d+\.\d+\.\d+)$/;

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${label}`);
  return value as Record<string, unknown>;
}

function sameKeys(value: Record<string, unknown>, keys: string[], label: string): void {
  if (Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) {
    throw new Error(`Invalid ${label} keys`);
  }
}

function unit(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

function validateRequest(request: JevRequest): void {
  record(request, 'request');
  const state = request.state;
  if (typeof state !== 'string' && (!state || typeof state !== 'object')) throw new Error('Invalid Jev state');
  const questions = record(request.questions, 'questions');
  if (Object.keys(questions).length === 0) throw new Error('Jev requires questions');
  for (const value of Object.values(questions)) {
    const question = record(value, 'question');
    if (question.type !== 'choice' || typeof question.instructions !== 'string' || !question.instructions.trim()) {
      throw new Error('Invalid Jev choice question');
    }
    const criteria = record(question.criteria, 'criteria');
    const count = Object.keys(criteria).length;
    if (count < 2 || count > 255) throw new Error('Jev choice requires 2..255 options');
    for (const rubric of Object.values(criteria)) {
      if (rubric !== null && typeof rubric !== 'string' && typeof rubric !== 'object') throw new Error('Invalid Jev criterion');
    }
  }
}

/** Validate untrusted answers before any chosen command can be dispatched. */
export function validateJevResponse(request: JevRequest, raw: unknown): JevResponse {
  validateRequest(request);
  const response = record(raw, 'Jev response');
  if (Object.hasOwn(response, 'error')) throw new Error('Jev returned an error');
  if (typeof response.model !== 'string' || !MODEL.test(response.model)) throw new Error('Invalid Jev response model');
  const source = record(response.answers, 'answers');
  sameKeys(source, Object.keys(request.questions), 'answers');
  const answers: Record<string, JevAnswer> = Object.create(null);
  for (const [id, question] of Object.entries(request.questions)) {
    const answer = record(source[id], 'answer');
    if (answer.type !== 'choice' || typeof answer.choice !== 'string' || !Object.hasOwn(question.criteria, answer.choice)) {
      throw new Error(`Invalid Jev choice for ${id}`);
    }
    const probabilities = record(answer.probabilities, 'probabilities');
    sameKeys(probabilities, Object.keys(question.criteria), 'probabilities');
    let total = 0;
    let highest = 0;
    let roundedToHundredths = true;
    const distribution: Record<string, number> = Object.create(null);
    for (const [option, value] of Object.entries(probabilities)) {
      const probability = unit(value, 'probability');
      roundedToHundredths &&= probability === Math.round(probability * 100) / 100;
      total += probability;
      highest = Math.max(highest, probability);
      distribution[option] = probability;
    }
    // OMP returns hundredth-rounded distributions (an observed seven-option
    // answer summed to 0.99). Permit only their bounded rounding error; retain
    // the original values as evidence rather than silently renormalizing.
    const tolerance = roundedToHundredths ? Object.keys(probabilities).length * 0.005 + 1e-12 : 0.00001;
    if (total <= 0 || Math.abs(total - 1) > tolerance) throw new Error('Invalid Jev probability sum');
    if (highest - distribution[answer.choice] > 1e-12) throw new Error('Jev choice is not a highest-probability option');
    answers[id] = { type: 'choice', choice: answer.choice, probabilities: distribution, confidence: unit(answer.confidence, 'confidence') };
  }
  const result: JevResponse = { model: response.model, answers };
  if (response.usage !== undefined) {
    const usage = record(response.usage, 'usage');
    for (const key of ['input_tokens', 'output_tokens']) {
      if (typeof usage[key] !== 'number' || !Number.isSafeInteger(usage[key]) || usage[key] < 0) throw new Error('Invalid Jev usage');
    }
    result.usage = { input_tokens: usage.input_tokens as number, output_tokens: usage.output_tokens as number };
  }
  if (response.costUsd !== undefined) {
    if (typeof response.costUsd !== 'number' || !Number.isFinite(response.costUsd) || response.costUsd < 0) throw new Error('Invalid Jev cost');
    result.costUsd = response.costUsd;
  }
  return result;
}

export interface JevClientStats {
  requests: number;
  models: string[];
  /** Null when any attempted request lacks this metadata. */
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
}

export function createJevClient(options: { transport: 'http' | 'stdio'; maxRequests: number; model?: string }): {
  evaluate: JevEvaluator;
  stats: JevClientStats;
  close(): void;
} {
  if (!Number.isSafeInteger(options.maxRequests) || options.maxRequests < 1) throw new Error('Invalid Jev maxRequests');
  if (options.transport !== 'http' && options.transport !== 'stdio') throw new Error('Invalid Jev transport');
  const model = options.model ?? 'jev-latest';
  if (model !== 'jev-latest' && !/^jev-\d+\.\d+\.\d+$/.test(model)) throw new Error('Jev requires jev-latest or a pinned model version, e.g. jev-1.13.0');
  const key = options.transport === 'http' ? process.env.TYPESAFE_API_KEY : undefined;
  if (options.transport === 'http' && !key?.trim()) throw new Error('TYPESAFE_API_KEY is required for Jev HTTP');
  const stats: JevClientStats = { requests: 0, models: [], inputTokens: 0, outputTokens: 0, costUsd: 0 };
  let failure: Error | undefined;
  let active = false;
  let controller: AbortController | undefined;
  let rejectActive: ((error: Error) => void) | undefined;
  let pending: { id: number; resolve(value: unknown): void; reject(error: Error): void } | undefined;
  let buffer = '';
  let timer: NodeJS.Timeout | undefined;

  function cleanup(): void {
    clearTimeout(timer);
    timer = undefined;
    if (options.transport === 'stdio') {
      process.stdin.off('data', onData);
      process.stdin.off('end', onEnd);
      process.stdin.off('error', onInputError);
      process.stdout.off('error', onOutputError);
      process.stdin.pause();
    }
  }
  function stop(error: Error): void {
    failure ??= error;
    controller?.abort();
    rejectActive?.(failure);
    pending?.reject(failure);
    pending = undefined;
    cleanup();
  }
  function onEnd(): void { stop(new Error('Jev stdio EOF')); }
  function onInputError(): void { stop(new Error('Jev stdio input failure')); }
  function onOutputError(): void { stop(new Error('Jev stdio output failure')); }
  function onData(chunk: string): void {
    buffer += chunk;
    if (Buffer.byteLength(buffer) > MAX_BYTES) return stop(new Error('Jev stdio response exceeds byte limit'));
    let newline: number;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      try {
        const message = record(JSON.parse(line), 'stdio message');
        if (!pending || message.kind !== 'answer' || message.id !== pending.id) throw new Error('Jev stdio correlation failure');
        if (Object.hasOwn(message, 'error')) throw new Error('Jev stdio judge failure');
        const current = pending;
        pending = undefined;
        current.resolve(message);
      } catch (error) {
        stop(error instanceof Error ? error : new Error('Invalid Jev stdio JSON'));
        return;
      }
    }
  }
  if (options.transport === 'stdio') {
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', onData);
    process.stdin.on('end', onEnd);
    process.stdin.on('error', onInputError);
    process.stdout.on('error', onOutputError);
  }

  const evaluate: JevEvaluator = async (request) => {
    if (failure) throw failure;
    if (active) throw new Error('Jev permits only one outstanding request');
    if (stats.requests >= options.maxRequests) throw new Error(`Jev request limit reached (${options.maxRequests})`);
    validateRequest(request);
    const id = stats.requests + 1;
    const body = { model, state: request.state, questions: request.questions };
    const payload = JSON.stringify(options.transport === 'stdio' ? { kind: 'judge', id, ...body } : body);
    if (Buffer.byteLength(payload) > MAX_BYTES) throw new Error('Jev request exceeds byte limit');
    // Snapshot the exact sent criteria; callers cannot change accepted choices while awaiting I/O.
    const sent = JSON.parse(payload) as JevRequest;
    validateRequest(sent);
    active = true;
    stats.requests++;
    const previousInput = stats.inputTokens;
    const previousOutput = stats.outputTokens;
    const previousCost = stats.costUsd;
    stats.inputTokens = stats.outputTokens = stats.costUsd = null;
    try {
      const cancellation = Promise.withResolvers<never>();
      rejectActive = cancellation.reject;
      timer = setTimeout(() => stop(new Error('Jev request timed out after 30000ms')), TIMEOUT_MS);
      let transport: Promise<unknown>;
      if (options.transport === 'http') {
        controller = new AbortController();
        transport = (async () => {
          const response = await fetch('https://api.typesafe.ai/v1/systemone', {
            method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: payload, signal: controller!.signal, redirect: 'error',
          });
          if (!response.ok) throw new Error(`Jev HTTP ${response.status}`);
          if (!response.body) throw new Error('Jev HTTP response has no body');
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let text = '';
          let bytes = 0;
          try {
            for (;;) {
              const next = await reader.read();
              if (next.done) break;
              bytes += next.value.byteLength;
              if (bytes > MAX_BYTES) throw new Error('Jev HTTP response exceeds byte limit');
              text += decoder.decode(next.value, { stream: true });
            }
            text += decoder.decode();
          } finally {
            await reader.cancel();
            reader.releaseLock();
          }
          return JSON.parse(text) as unknown;
        })();
      } else {
        const answer = Promise.withResolvers<unknown>();
        pending = { id, resolve: answer.resolve, reject: answer.reject };
        transport = answer.promise;
        process.stdout.write(`${payload}\n`, (error) => { if (error) onOutputError(); });
      }
      const raw = await Promise.race([transport, cancellation.promise]);
      if (failure) throw failure;
      const response = validateJevResponse(sent, raw);
      if (model !== 'jev-latest' && response.model.replace(/^typesafe\//, '') !== model) throw new Error(`Jev model mismatch: requested ${model}, received ${response.model}`);
      if (!stats.models.includes(response.model)) stats.models.push(response.model);
      stats.inputTokens = previousInput !== null && response.usage ? previousInput + response.usage.input_tokens : null;
      stats.outputTokens = previousOutput !== null && response.usage ? previousOutput + response.usage.output_tokens : null;
      stats.costUsd = previousCost !== null && response.costUsd !== undefined ? previousCost + response.costUsd : null;
      return response;
    } catch (error) {
      const reason = error instanceof Error ? error : new Error('Jev transport failure');
      stop(reason);
      throw reason;
    } finally {
      clearTimeout(timer);
      timer = undefined;
      controller = undefined;
      rejectActive = undefined;
      active = false;
    }
  };
  return { evaluate, stats, close: () => stop(new Error('Jev client closed')) };
}
