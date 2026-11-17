/**
 * Region rules of JDG-003 (D-09.3). A FUNCTION/OOP source file is the learner's code followed by the
 * hidden harness, so a line number reported for that file tells which side an error belongs to.
 * A location in any other file (a system header, a library module) says nothing about the region.
 * Everything here is pure text handling; nothing in it may put harness text back into a result.
 */

interface Location {
  readonly file: string;
  readonly line: number;
  readonly index: number;
}

const COMPILER_ERROR = /(?:^|\n)([^\n:]+):(\d+)(?::\d+)?:\s*(?:fatal\s+)?error/gi;
const PYTHON_LOCATION = /File "([^"\n]+)", line (\d+)/g;
const JAVA_FRAME = /\(([\w$]+\.java):(\d+)\)/g;
const LOCATED_DIAGNOSTIC = /^([^\s:][^:\n]*):(\d+)(?::\d+)?:/;
const CONTEXT_HEADER = /^[^\s:][^:\n]*: (?:In|At) /;

function findLocations(pattern: RegExp, text: string): Location[] {
  return [...text.matchAll(pattern)].map((match) => ({
    file: match[1] ?? '',
    line: Number(match[2]),
    index: match.index,
  }));
}

function locateLine(pattern: RegExp, line: string): Location | undefined {
  return findLocations(new RegExp(pattern.source, 'g'), line)[0];
}

/**
 * Line of the first compile error when it is located in `sourceFile`; `undefined` when the compiler
 * reported no line or the first error is in another file.
 */
export function findFirstDiagnosticLine(output: string, sourceFile: string): number | undefined {
  const first = [
    ...findLocations(COMPILER_ERROR, output),
    ...findLocations(PYTHON_LOCATION, output),
  ].sort((left, right) => left.index - right.index)[0];
  return first?.file === sourceFile ? first.line : undefined;
}

/** Line of the innermost `sourceFile` frame of a runtime crash, or `undefined` without one. */
export function findCrashLine(stderr: string, sourceFile: string): number | undefined {
  const python = findLocations(PYTHON_LOCATION, stderr).filter(
    (frame) => frame.file === sourceFile,
  );
  const java = findLocations(JAVA_FRAME, stderr).filter((frame) => frame.file === sourceFile);
  // Python prints the innermost frame last, Java prints it first.
  return (python.at(-1) ?? java[0])?.line;
}

/** Keeps compile diagnostics located in the learner region of `sourceFile`; drops everything else. */
export function keepLearnerDiagnostics(
  output: string,
  learnerLines: number,
  sourceFile: string,
): string {
  const kept: string[] = [];
  let header: string | undefined;
  let keeping = true;
  for (const line of output.split('\n')) {
    const location = locateLine(LOCATED_DIAGNOSTIC, line) ?? locateLine(PYTHON_LOCATION, line);
    if (location) {
      keeping = location.file === sourceFile && location.line <= learnerLines;
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
export function keepLearnerFrames(
  stderr: string,
  learnerLines: number,
  sourceFile: string,
): string {
  const kept: string[] = [];
  let skipping = false;
  for (const line of stderr.split('\n')) {
    const frame = locateLine(PYTHON_LOCATION, line) ?? locateLine(JAVA_FRAME, line);
    if (frame) skipping = frame.file === sourceFile && frame.line > learnerLines;
    else if (!/^\s/.test(line)) skipping = false;
    if (!skipping) kept.push(line);
  }
  return kept.join('\n');
}
