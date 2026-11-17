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

const javaTrace = [
  'Exception in thread "main" java.lang.ArithmeticException: / by zero',
  '\tat Solution.solve(Main.java:3)',
  '\tat Main.main(Main.java:12)',
].join('\n');

describe('findFirstDiagnosticLine', () => {
  it('reads the first GCC error line', () => {
    expect(findFirstDiagnosticLine(gcc)).toBe(2);
  });
  it('reads a javac error line', () => {
    expect(findFirstDiagnosticLine('Main.java:14: error: cannot find symbol')).toBe(14);
  });
  it('reads a Python syntax error line', () => {
    expect(findFirstDiagnosticLine(pythonSyntax)).toBe(7);
  });
  it('returns nothing when no line is reported', () => {
    expect(findFirstDiagnosticLine("ld: undefined reference to `solve'")).toBeUndefined();
  });
});

describe('findCrashLine', () => {
  it('uses the innermost Python frame', () => {
    expect(findCrashLine(pythonTrace)).toBe(2);
  });
  it('uses the innermost Java frame', () => {
    expect(findCrashLine(javaTrace)).toBe(3);
  });
  it('returns nothing for a crash without a trace', () => {
    expect(findCrashLine('Segmentation fault')).toBeUndefined();
  });
});

describe('keepLearnerDiagnostics', () => {
  it('keeps learner-region blocks and drops harness-region blocks with their source', () => {
    const kept = keepLearnerDiagnostics(gcc, 4);
    expect(kept).toContain("main.cpp:2:12: error: 'c' was not declared");
    expect(kept).toContain('return a + c;');
    expect(kept).not.toContain('HIDDEN_CHECK');
    expect(kept).not.toContain('int main()');
  });
  it('drops a Python syntax block that points into the harness', () => {
    expect(keepLearnerDiagnostics(pythonSyntax, 4)).not.toContain('secret_check');
  });
});

describe('keepLearnerFrames', () => {
  it('removes harness frames and their echoed source from a Python traceback', () => {
    const kept = keepLearnerFrames(pythonTrace, 4);
    expect(kept).toContain('File "main.py", line 2, in solve');
    expect(kept).toContain('ZeroDivisionError');
    expect(kept).not.toContain('HIDDEN_CASE');
    expect(kept).not.toContain('line 8');
  });
  it('removes harness frames from a Java stack trace', () => {
    const kept = keepLearnerFrames(javaTrace, 6);
    expect(kept).toContain('Main.java:3');
    expect(kept).not.toContain('Main.java:12');
  });
  it('leaves output without frames unchanged', () => {
    expect(keepLearnerFrames('plain warning\n', 3)).toBe('plain warning\n');
  });
});
