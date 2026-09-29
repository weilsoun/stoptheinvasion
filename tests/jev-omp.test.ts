import { expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { JevRequest, JevResponse } from '../scripts/jev-types';

interface BridgeReport {
  status: string;
  designs: {
    proposals: Array<{ strategy: string }>;
    decisions: Array<{ request: JevRequest; response: JevResponse }>;
  };
  results: Array<{ replayVerified: boolean }>;
  jevResults: Array<{ variant: string; replayVerified: boolean; trace: Array<{ decision: { kind: string; request?: JevRequest } }> }>;
  provider: { requests: number; transport: string; models: string[]; inputTokens: number | null; outputTokens: number | null; costUsd: number | null };
}

// Only the paid OMP host service is replaced. Python loads the actual helper,
// which owns the actual Bun CLI and executes design, combat, replay and reports.
const pythonFixture = `
import asyncio
import json
import pathlib
import runpy
import sys
from types import SimpleNamespace

root, output, wire_output, mode = sys.argv[1:]
seen = []
closed = 0
cancelled = 0

class Batch:
    def __init__(self, answers):
        self.answers = answers
        self.model = "typesafe/jev-latest" if len(seen) % 2 else "typesafe/jev-1.13.0"
    async def drain(self, timeout):
        return [("decision", SimpleNamespace(answers=self.answers, error=None))]
    def status(self):
        return {"total": 1, "done": 1, "failed": 0, "running": False,
                "model": self.model, "cost": 0.0001}
    def close(self):
        global closed
        closed += 1
    def cancel(self):
        global cancelled
        cancelled += 1

def text_only_judge_batch(states, questions, *, concurrency, retries, min_ok, intent):
    assert list(states) == ["decision"]
    assert concurrency == 1 and retries == 0 and min_ok == 1
    answers = {}
    for question_id, question in questions.items():
        assert question["type"] == "choice"
        criteria = question["criteria"]
        assert 2 <= len(criteria) <= 255
        for label, rubric in criteria.items():
            if rubric is not None and not isinstance(rubric, str):
                raise RuntimeError('choice question "' + question_id + '" criteria "' + label + '" must be a string or null')
        choice = next(iter(criteria))
        answers[question_id] = {"type": "choice", "choice": choice, "confidence": 1,
                                "probabilities": {label: int(label == choice) for label in criteria}}
    seen.append(questions)
    return Batch(answers)

namespace = runpy.run_path(str(pathlib.Path(root) / "scripts/jev-omp.py"),
                          init_globals={"judge_batch": text_only_judge_batch})
loop = asyncio.new_event_loop()
args = ["--seeds", "1", "--jev-seeds", "1", "--max-requests", "512", "--output", output]
if mode == "pin-reject":
    args += ["--model", "jev-1.13.0"]
try:
    try:
        result = loop.run_until_complete(namespace["run_jev"](args, root=root))
    except RuntimeError as error:
        assert mode == "pin-reject", str(error)
        assert "model mismatch" in str(error), str(error)
        assert closed == cancelled == len(seen) == 1
        assert not pathlib.Path(output).exists()
    else:
        assert mode == "latest", "Pinned version must not accept alias provenance"
        assert result["status"] == "complete"
        assert result["heuristicBattles"] == 30 and result["jevBattles"] == 4
        assert closed == len(seen) == result["requests"]
        assert cancelled == 0
        pathlib.Path(wire_output).write_text(json.dumps(seen), encoding="utf-8")
finally:
    loop.close()
`;

test('OMP text-only criteria boundary completes the real research workflow without mutating report requests', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const temporary = await mkdtemp(join(tmpdir(), 'jev-omp-regression-'));
  const output = join(temporary, 'report.json');
  const wireOutput = join(temporary, 'wire.json');
  const child = Bun.spawn(['python3', '-c', pythonFixture, root, output, wireOutput, 'latest'], {
    cwd: root, stdout: 'pipe', stderr: 'pipe',
  });
  const stdout = new Response(child.stdout).text();
  const stderr = new Response(child.stderr).text();
  try {
    const code = await child.exited;
    const diagnostics = `${await stdout}\n${await stderr}`;
    expect(code, diagnostics).toBe(0);
    const report = JSON.parse(await readFile(output, 'utf8')) as BridgeReport;
    const wire = JSON.parse(await readFile(wireOutput, 'utf8')) as Array<JevRequest['questions']>;
    expect(report.status).toBe('complete');
    expect(report.designs.proposals.map(proposal => proposal.strategy)).toEqual(['assault', 'bulwark', 'tempo']);
    expect(report.results).toHaveLength(30);
    expect(report.jevResults.map(record => record.variant).sort()).toEqual(['assault-combined', 'baseline', 'bulwark-combined', 'tempo-combined']);
    expect([...report.results, ...report.jevResults].every(record => record.replayVerified)).toBe(true);
    expect(report.provider).toMatchObject({ transport: 'stdio', models: ['typesafe/jev-latest', 'typesafe/jev-1.13.0'], inputTokens: null, outputTokens: null });
    expect(report.provider.costUsd).toBeCloseTo(report.provider.requests * 0.0001, 8);

    // Structured recipe/deck descriptions must survive the text-only boundary,
    // while persisted provenance remains the original structured API request.
    for (const [index, decision] of report.designs.decisions.entries()) {
      for (const [id, question] of Object.entries(decision.request.questions)) {
        expect(Object.keys(wire[index][id].criteria)).toEqual(Object.keys(question.criteria));
        for (const [label, rubric] of Object.entries(question.criteria)) {
          const sent = wire[index][id].criteria[label];
          expect(typeof rubric).toBe('object');
          expect(typeof sent).toBe('string');
          expect(JSON.parse(sent as string)).toEqual(rubric);
        }
        expect(decision.response.model).toBe(index % 2 === 0 ? 'typesafe/jev-latest' : 'typesafe/jev-1.13.0');
      }
    }
    // Gameplay rubrics already are text: they must not gain JSON quote wrappers.
    let index = report.designs.decisions.length;
    for (const battle of report.jevResults) {
      for (const step of battle.trace) {
        if (step.decision.kind !== 'jev') continue;
        expect(wire[index++]).toEqual(step.decision.request!.questions);
      }
    }
    expect(wire).toHaveLength(index + 1); // Final advisory assessment follows gameplay.
  } finally {
    child.kill();
    await child.exited;
    await rm(temporary, { recursive: true, force: true });
  }
}, 30_000);

test('OMP rejects cached alias provenance for an explicitly pinned request and cleans up its child', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const temporary = await mkdtemp(join(tmpdir(), 'jev-omp-pin-regression-'));
  const child = Bun.spawn(['python3', '-c', pythonFixture, root, join(temporary, 'report.json'), join(temporary, 'wire.json'), 'pin-reject'], {
    cwd: root, stdout: 'pipe', stderr: 'pipe',
  });
  const stdout = new Response(child.stdout).text();
  const stderr = new Response(child.stderr).text();
  try {
    const code = await child.exited;
    expect(code, `${await stdout}\n${await stderr}`).toBe(0);
  } finally {
    child.kill();
    await child.exited;
    await rm(temporary, { recursive: true, force: true });
  }
}, 10_000);
