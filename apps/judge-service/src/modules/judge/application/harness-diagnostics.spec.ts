import {
  findCrashLine,
  findFirstDiagnosticLine,
  keepLearnerDiagnostics,
  keepLearnerFrames,
} from './harness-diagnostics';

const gcc = [
  "main.cpp: In function 'int add(int, int)':",
  "main.cpp:2:12: error: 'c' was not declared in this scope",
  '    2 |   return a + c;',
  '      |              ^',
  "main.cpp: In function 'int main()':",
  "main.cpp:9:3: error: 'HIDDEN_CHECK' was not declared in this scope",
  '    9 |   HIDDEN_CHECK(add(1, 2));',
  '      |   ^~~~~~~~~~~~',
].join('\n');

// What g++ prints when the learner leaves a brace open: the first errors are in system headers.
const gccUnclosedBrace = [
  'In file included from main.cpp:3:',
  "/usr/include/c++/14.2.0/bits/c++config.h:308:1: error: 'namespace' definition is not allowed here",
  '  308 | namespace std',
  '      | ^~~~~~~~~',
  "main.cpp:4:58: error: expected '}' at end of input",
  '    4 | int main() { HIDDEN_CHECK(); }',
].join('\n');

const pythonSyntax = [
  '  File "main.py", line 7',
  '    secret_check(:',
  '    ^',
  'SyntaxError: bad',
].join('\n');

const pythonTrace = [
  'Traceback (most recent call last):',
  '  File "main.py", line 8, in <module>',
  '    print(HIDDEN_CASE(solve(int(input()))))',
  '  File "main.py", line 2, in solve',
  '    return 1 // n',
  'ZeroDivisionError: integer division or modulo by zero',
].join('\n');

// The exception is raised inside the standard library, called from the learner region.
const pythonLibraryTrace = [
  'Traceback (most recent call last):',
  '  File "main.py", line 8, in <module>',
  '    print(HIDDEN_CASE(solve(input())))',
  '  File "main.py", line 2, in solve',
  '    return json.loads(n)',
  '  File "/usr/local/lib/python3.13/json/decoder.py", line 345, in decode',
  '    obj, end = self.raw_decode(s)',
  'json.decoder.JSONDecodeError: Expecting value',
].join('\n');

const javaTrace = [
  'Exception in thread "main" java.lang.ArithmeticException: / by zero',
  '\tat Solution.solve(Main.java:3)',
  '\tat Main.main(Main.java:12)',
].join('\n');

describe('findFirstDiagnosticLine', () => {
  it('reads the first GCC error line', () => {
    expect(findFirstDiagnosticLine(gcc, 'main.cpp')).toBe(2);
  });
  it('reads a javac error line', () => {
    const javac = 'Main.java:14: error: cannot find symbol';
    expect(findFirstDiagnosticLine(javac, 'Main.java')).toBe(14);
  });
  it('reads a Python syntax error line', () => {
    expect(findFirstDiagnosticLine(pythonSyntax, 'main.py')).toBe(7);
  });
  it('returns nothing when no line is reported', () => {
    const linker = "ld: undefined reference to `solve'";
    expect(findFirstDiagnosticLine(linker, 'main.cpp')).toBeUndefined();
  });
  it('returns nothing when the first error is located in another file', () => {
    expect(findFirstDiagnosticLine(gccUnclosedBrace, 'main.cpp')).toBeUndefined();
  });
});

describe('findCrashLine', () => {
  it('uses the innermost Python frame', () => {
    expect(findCrashLine(pythonTrace, 'main.py')).toBe(2);
  });
  it('uses the innermost frame of the source file when a library raised', () => {
    expect(findCrashLine(pythonLibraryTrace, 'main.py')).toBe(2);
  });
  it('uses the innermost Java frame', () => {
    expect(findCrashLine(javaTrace, 'Main.java')).toBe(3);
  });
  it('returns nothing for a crash without a trace', () => {
    expect(findCrashLine('Segmentation fault', 'main.cpp')).toBeUndefined();
  });
});

describe('keepLearnerDiagnostics', () => {
  it('keeps learner-region blocks and drops harness-region blocks with their source', () => {
    const kept = keepLearnerDiagnostics(gcc, 4, 'main.cpp');
    expect(kept).toContain("main.cpp:2:12: error: 'c' was not declared");
    expect(kept).toContain('return a + c;');
    expect(kept).not.toContain('HIDDEN_CHECK');
    expect(kept).not.toContain('int main()');
  });
  it('drops a Python syntax block that points into the harness', () => {
    expect(keepLearnerDiagnostics(pythonSyntax, 4, 'main.py')).not.toContain('secret_check');
  });
  it('drops blocks located in other files and in the harness region', () => {
    const kept = keepLearnerDiagnostics(gccUnclosedBrace, 1, 'main.cpp');
    expect(kept).not.toContain('HIDDEN_CHECK');
    expect(kept).not.toContain('c++config.h');
  });
});

describe('keepLearnerFrames', () => {
  it('removes harness frames and their echoed source from a Python traceback', () => {
    const kept = keepLearnerFrames(pythonTrace, 4, 'main.py');
    expect(kept).toContain('File "main.py", line 2, in solve');
    expect(kept).toContain('ZeroDivisionError');
    expect(kept).not.toContain('HIDDEN_CASE');
    expect(kept).not.toContain('line 8');
  });
  it('keeps library frames that follow a learner frame', () => {
    const kept = keepLearnerFrames(pythonLibraryTrace, 4, 'main.py');
    expect(kept).toContain('decoder.py');
    expect(kept).toContain('JSONDecodeError');
    expect(kept).not.toContain('HIDDEN_CASE');
  });
  it('removes harness frames from a Java stack trace', () => {
    const kept = keepLearnerFrames(javaTrace, 6, 'Main.java');
    expect(kept).toContain('Main.java:3');
    expect(kept).not.toContain('Main.java:12');
  });
  it('leaves output without frames unchanged', () => {
    expect(keepLearnerFrames('plain warning\n', 3, 'main.py')).toBe('plain warning\n');
  });
});
