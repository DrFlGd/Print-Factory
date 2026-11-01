/**
 * A tiny expression language for `showIf` conditions in parameter schemas:
 *
 *   rim > 0
 *   style == 'pill' && !flatBack
 *   (holes == 'keyhole' || holes == 'screw') && width >= 80
 *
 * Numbers, single- or double-quoted strings, true/false, identifiers (parameter names),
 * + - * / %, comparisons, && || !, and parentheses. Evaluated by walking a parsed tree, never
 * with `eval` or `new Function`, so it runs under a strict Content-Security-Policy and a
 * schema cannot run code.
 */

type Node =
  | { k: 'lit'; v: unknown }
  | { k: 'id'; name: string }
  | { k: 'un'; op: '!' | '-'; a: Node }
  | { k: 'bin'; op: string; a: Node; b: Node };

type Token = { t: 'num' | 'str' | 'id' | 'op' | 'end'; v: string };

const OPS = ['&&', '||', '==', '!=', '<=', '>=', '===', '!==', '<', '>', '+', '-', '*', '/', '%', '!', '(', ')'];

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      const m = /^[0-9]*\.?[0-9]+(e[+-]?[0-9]+)?/i.exec(src.slice(i));
      if (!m) throw new SyntaxError(`Bad number at ${i} in "${src}"`);
      out.push({ t: 'num', v: m[0] });
      i += m[0].length;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      let s = '';
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\' && j + 1 < src.length) j++;
        s += src[j];
        j++;
      }
      if (j >= src.length) throw new SyntaxError(`Unclosed string in "${src}"`);
      out.push({ t: 'str', v: s });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      const m = /^[A-Za-z_$][A-Za-z0-9_$.]*/.exec(src.slice(i))!;
      out.push({ t: 'id', v: m[0] });
      i += m[0].length;
      continue;
    }
    const op = [...OPS].sort((a, b) => b.length - a.length).find((o) => src.startsWith(o, i));
    if (!op) throw new SyntaxError(`Unexpected "${c}" at ${i} in "${src}"`);
    out.push({ t: 'op', v: op === '===' ? '==' : op === '!==' ? '!=' : op });
    i += op.length;
  }
  out.push({ t: 'end', v: '' });
  return out;
}

const PRECEDENCE: Record<string, number> = {
  '||': 1,
  '&&': 2,
  '==': 3,
  '!=': 3,
  '<': 4,
  '<=': 4,
  '>': 4,
  '>=': 4,
  '+': 5,
  '-': 5,
  '*': 6,
  '/': 6,
  '%': 6,
};

function parse(src: string): Node {
  const toks = tokenize(src);
  let pos = 0;
  const peek = () => toks[pos]!;
  const next = () => toks[pos++]!;

  function primary(): Node {
    const t = next();
    if (t.t === 'num') return { k: 'lit', v: Number(t.v) };
    if (t.t === 'str') return { k: 'lit', v: t.v };
    if (t.t === 'id') {
      if (t.v === 'true') return { k: 'lit', v: true };
      if (t.v === 'false') return { k: 'lit', v: false };
      return { k: 'id', name: t.v };
    }
    if (t.t === 'op' && t.v === '(') {
      const e = expr(0);
      const close = next();
      if (close.v !== ')') throw new SyntaxError(`Expected ")" in "${src}"`);
      return e;
    }
    if (t.t === 'op' && (t.v === '!' || t.v === '-')) return { k: 'un', op: t.v, a: primary() };
    throw new SyntaxError(`Unexpected "${t.v || 'end'}" in "${src}"`);
  }

  function expr(min: number): Node {
    let left = primary();
    for (;;) {
      const t = peek();
      const p = t.t === 'op' ? PRECEDENCE[t.v] : undefined;
      if (p === undefined || p <= min) break;
      next();
      left = { k: 'bin', op: t.v, a: left, b: expr(p) };
    }
    return left;
  }

  const tree = expr(0);
  if (peek().t !== 'end') throw new SyntaxError(`Unexpected "${peek().v}" in "${src}"`);
  return tree;
}

function lookup(scope: Record<string, unknown>, name: string): unknown {
  let v: unknown = scope;
  for (const key of name.split('.')) {
    if (v === null || typeof v !== 'object') return undefined;
    v = (v as Record<string, unknown>)[key];
  }
  return v;
}

function run(n: Node, scope: Record<string, unknown>): unknown {
  switch (n.k) {
    case 'lit':
      return n.v;
    case 'id':
      return lookup(scope, n.name);
    case 'un':
      return n.op === '!' ? !run(n.a, scope) : -(run(n.a, scope) as number);
    case 'bin': {
      if (n.op === '&&') return run(n.a, scope) && run(n.b, scope);
      if (n.op === '||') return run(n.a, scope) || run(n.b, scope);
      const a = run(n.a, scope) as never;
      const b = run(n.b, scope) as never;
      switch (n.op) {
        case '==':
          // eslint-disable-next-line eqeqeq
          return a == b;
        case '!=':
          // eslint-disable-next-line eqeqeq
          return a != b;
        case '<':
          return a < b;
        case '<=':
          return a <= b;
        case '>':
          return a > b;
        case '>=':
          return a >= b;
        case '+':
          return (a as number) + (b as number);
        case '-':
          return a - b;
        case '*':
          return a * b;
        case '/':
          return a / b;
        case '%':
          return a % b;
      }
    }
  }
  return undefined;
}

const cache = new Map<string, Node>();

/** Compiles once per distinct source string. Throws SyntaxError on a malformed expression. */
export function compileExpression(src: string): (scope: Record<string, unknown>) => unknown {
  let tree = cache.get(src);
  if (!tree) {
    tree = parse(src);
    cache.set(src, tree);
  }
  const t = tree;
  return (scope) => run(t, scope);
}

export function evaluate(src: string, scope: Record<string, unknown>): unknown {
  return compileExpression(src)(scope);
}

/** The parameter names an expression reads, for dependency tracking. */
export function identifiers(src: string): string[] {
  return [...new Set(tokenize(src).filter((t) => t.t === 'id' && t.v !== 'true' && t.v !== 'false').map((t) => t.v.split('.')[0]!))];
}
