async def run_jev(args=None, root=None):
    """OMP Eval only: %load scripts/jev-omp.py; await run_jev([...], root=...).

    Uses the existing judge_batch subscription, never credentials or an SDK.
    All imports/process/batch state stay local to this invocation. The child
    owns the report and its request quota; failure never substitutes a policy.
    """
    import asyncio
    import json
    import math
    import os
    import re
    import sys

    judge = globals().get("judge_batch")
    if not callable(judge):
        raise RuntimeError("run_jev requires OMP Python Eval with judge_batch available")
    if args is None:
        args = []
    if not isinstance(args, (list, tuple)) or any(not isinstance(arg, str) for arg in args):
        raise ValueError("run_jev args must be an argument array of strings")
    if any(arg == "--transport" or arg.startswith("--transport=") for arg in args):
        raise ValueError("run_jev owns --transport stdio; omit transport from args")

    child = await asyncio.create_subprocess_exec(
        "bun", "scripts/jev-ship.ts", *args, "--transport", "stdio",
        cwd=os.fspath(root) if root is not None else os.getcwd(),
        stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE, limit=1_048_576,
    )
    stderr_parts = []

    async def drain_stderr():
        while True:
            chunk = await child.stderr.read(4096)
            if not chunk:
                return
            text = chunk.decode("utf-8", errors="replace")
            stderr_parts.append(text)
            if len(stderr_parts) > 8:
                del stderr_parts[0]
            print(text, end="", file=sys.stderr, flush=True)

    stderr_task = asyncio.create_task(drain_stderr())
    result = None
    previous_id = 0
    batch = None
    try:
        while True:
            line = await asyncio.wait_for(child.stdout.readline(), timeout=35)
            if not line:
                break
            message = json.loads(line)
            if not isinstance(message, dict):
                raise RuntimeError("Invalid Jev child protocol message")
            kind = message.get("kind")
            if kind == "result":
                if result is not None:
                    raise RuntimeError("Duplicate Jev child result")
                if message.get("status") != "complete":
                    raise RuntimeError("Jev child did not report a complete study")
                result = message
                continue
            if kind == "error":
                raise RuntimeError("Jev study failed: " + str(message.get("error", message.get("message", "unknown error"))))
            if kind != "judge" or result is not None:
                raise RuntimeError("Unexpected Jev child protocol message")
            request_id = message.get("id")
            if type(request_id) is not int or request_id != previous_id + 1:
                raise RuntimeError("Invalid Jev child request correlation")
            previous_id = request_id
            model = message.get("model")
            if not isinstance(model, str) or re.fullmatch(r"jev-(?:latest|\d+\.\d+\.\d+)", model) is None:
                raise RuntimeError("Invalid requested Jev model")
            questions = message.get("questions")
            if not isinstance(questions, dict) or not questions:
                raise RuntimeError("Invalid Jev child questions")
            # HTTP accepts structured rubrics; OMP's choice helper accepts only
            # text/null. Adapt that boundary without changing labels, original
            # child requests, or returned probability/provenance values.
            omp_questions = {}
            for question_id, question in questions.items():
                if (not isinstance(question, dict) or question.get("type") != "choice"
                        or not isinstance(question.get("instructions"), str)
                        or not question["instructions"].strip()):
                    raise RuntimeError("Invalid Jev child choice question")
                criteria = question.get("criteria")
                if not isinstance(criteria, dict) or not 2 <= len(criteria) <= 255:
                    raise RuntimeError("Invalid Jev child choice criteria")
                omp_criteria = {}
                for label, rubric in criteria.items():
                    if rubric is None or isinstance(rubric, str):
                        omp_criteria[label] = rubric
                    elif isinstance(rubric, (dict, list)):
                        omp_criteria[label] = json.dumps(
                            rubric, sort_keys=True, ensure_ascii=False,
                            allow_nan=False, separators=(",", ":"),
                        )
                    else:
                        raise RuntimeError("Invalid Jev child criterion rubric")
                omp_questions[question_id] = {
                    "type": "choice", "instructions": question["instructions"],
                    "criteria": omp_criteria,
                }
            # One named state exposes actual routing metadata unavailable from judge().
            batch = judge(
                {"decision": message["state"]}, omp_questions,
                concurrency=1, retries=0, min_ok=1, intent="Kestrel Jev decision",
            )
            settled = await asyncio.wait_for(batch.drain(timeout=25), timeout=27)
            status = batch.status()
            actual_model = status.get("model")
            if not isinstance(actual_model, str) or re.fullmatch(r"typesafe/jev-(?:latest|\d+\.\d+\.\d+)", actual_model) is None:
                raise RuntimeError("OMP did not route the decision to TypeSafe Jev; refusing fallback")
            if model != "jev-latest" and actual_model != "typesafe/" + model:
                raise RuntimeError("OMP Jev model mismatch: requested " + model + ", received " + actual_model)
            if status.get("running") or status.get("failed") or status.get("done") != 1:
                raise RuntimeError("OMP Jev decision did not complete successfully")
            if len(settled) != 1 or settled[0][0] != "decision":
                raise RuntimeError("OMP Jev returned an uncorrelated decision")
            item = settled[0][1]
            if item.error:
                raise RuntimeError("OMP Jev decision failed: " + str(item.error))
            cost = status.get("cost")
            if type(cost) not in (int, float) or not math.isfinite(cost) or cost < 0:
                raise RuntimeError("Invalid OMP Jev cost metadata")
            answer = {
                "kind": "answer", "id": request_id, "model": actual_model,
                "answers": item.answers, "costUsd": cost,
            }
            # The child performs full fixed-choice/probability validation before dispatch.
            wire = json.dumps(answer, allow_nan=False, separators=(",", ":")).encode("utf-8") + b"\n"
            if len(wire) > 1_048_576:
                raise RuntimeError("OMP Jev answer exceeds protocol byte limit")
            batch.close()
            batch = None
            child.stdin.write(wire)
            await asyncio.wait_for(child.stdin.drain(), timeout=2)
        code = await asyncio.wait_for(child.wait(), timeout=5)
        await stderr_task
        if code != 0:
            raise RuntimeError("Jev child exited with code " + str(code) + ": " + "".join(stderr_parts)[-8192:])
        if result is None:
            raise RuntimeError("Jev child exited without a study result")
        print("Jev study complete: " + str(previous_id) + " subscription decisions; " + str(result.get("output", "report written")))
        return result
    finally:
        try:
            if batch is not None:
                try:
                    batch.cancel()
                finally:
                    batch.close()
        finally:
            if child.returncode is None:
                child.kill()
            await child.wait()
            if child.stdin is not None:
                child.stdin.close()
            if not stderr_task.done():
                stderr_task.cancel()
            try:
                await stderr_task
            except asyncio.CancelledError:
                pass
