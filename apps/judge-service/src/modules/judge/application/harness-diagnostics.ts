/**
 * Region rules of JDG-003 (D-09.3). A FUNCTION/OOP source file is the learner's code followed by the
 * hidden harness, so a reported line number tells which side an error belongs to. Everything here
 * is pure text handling; nothing in it may put harness text back into a result.
 */

const COMPILER_ERROR = /(?:^|\n)[^\n:]+:(\d+)(?::\d+)?:\s*(?:fatal\s+)?error/i;
const PYTHON_LOCATION = /File "[^"\n]+", line (\d+)/;
const PYTHON_LOCATIONS = /File "[^"\n]+", line (\d+)/g;
const JAVA_FRAME = /\(Main\.java:(\d+)\)/;
const LOCATED_DIAGNOSTIC = /^[^\s:][^:\n]*:(\d+)(?::\d+)?:/;
const CONTEXT_HEADER = /^[^\s:][^:\n]*: (?:In|At) /;

/** Line of the first compile error, or `undefined` when the compiler reported no line. */
export function findFirstDiagnosticLine(output: string): number | undefined {
  const matches = [COMPILER_ERROR.exec(output), PYTHON_LOCATION.exec(output)]
    .filter((match): match is RegExpExecArray => match !== null)
    .sort((left, right) => left.index - right.index);
  return matches[0] ? Number(matches[0][1]) : undefined;
}

/** Line of the innermost frame of a runtime crash, or `undefined` without a trace. */
export function findCrashLine(stderr: string): number | undefined {
  const python = [...stderr.matchAll(PYTHON_LOCATIONS)].at(-1);
  const frame = python ?? JAVA_FRAME.exec(stderr);
  return frame ? Number(frame[1]) : undefined;
}

/** Keeps compile diagnostics located in the learner region and drops the rest with their source. */
export function keepLearnerDiagnostics(output: string, learnerLines: number): string {
  const kept: string[] = [];
  let header: string | undefined;
  let keeping = true;
  for (const line of output.split('\n')) {
    const location = LOCATED_DIAGNOSTIC.exec(line) ?? PYTHON_LOCATION.exec(line);
    if (location) {
      keeping = Number(location[1]) <= learnerLines;
      if (keeping && header !== undefined) kept.push(header);
      header = undefined;
    } else if (CONTEXT_HEADER.test(line)) {
      header = line;
      continue;
    }
    if (keeping) kept.push(line);
  }
  return kept.join('\n');
}

/** Removes harness-region stack frames, and the source lines echoed under them, from stderr. */
export function keepLearnerFrames(stderr: string, learnerLines: number): string {
  const kept: string[] = [];
  let skipping = false;
  for (const line of stderr.split('\n')) {
    const frame = PYTHON_LOCATION.exec(line) ?? JAVA_FRAME.exec(line);
    if (frame) skipping = Number(frame[1]) > learnerLines;
    else if (!/^\s/.test(line)) skipping = false;
    if (!skipping) kept.push(line);
  }
  return kept.join('\n');
}
