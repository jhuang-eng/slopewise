/* topics.js
   the algebra 1 topic engine: problem generators, answer parsing, and
   mistake diagnosis for every topic beyond graphing lines and slope.

   every generator returns a problem:
     format      how the answer is entered: num, list, pair, ineq,
                 compound, expr, factored, choice, line, point
     ask, eq     the instruction and the math shown to the student
     answer      the correct answer, in the format's parsed shape
     cands       [{id, value}] the answer each known mistake produces
     steps       worked solution, one html string per step
     answerHTML  the correct answer, formatted
     sample      a correct answer typed the way a student would type it
     board       board options before answering (graph topics)
     after(res)  the visual shown with feedback, {board} or {html}
     hint        one line on how to type the answer
     tol         how close a number has to be (quadratic formula only)

   diagnosis works the same way as the graphing topic: match the
   student's answer against the correct one, then against each
   mistake's answer

   relies on helpers from index.html (frac, gcd, ri, pick, near,
   parseNum, fracHTML, eqHTML, keyPoints, graphCands, genGraph), which
   only run once a problem is generated, after index.html has loaded
*/

const ENGINE = (() => {
  const M = '−';

  /* ---------------------------------------------------------------
     small helpers
     --------------------------------------------------------------- */

  const sgn = n => (n < 0 ? M + (-n) : String(n));
  const par = n => (n < 0 ? `(${M}${-n})` : String(n));
  const nz = (a, b) => {
    let v;
    do v = ri(a, b); while (v === 0);
    return v;
  };
  const shuffle = arr => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const F = (top, bottom) => `<span class="frac"><span>${top}</span><span>${bottom}</span></span>`;

  // a decimal back to a fraction with a small denominator, if it is one
  function toFrac(v) {
    for (let d = 1; d <= 12; d++) {
      if (near(v * d, Math.round(v * d), 1e-9)) return frac(Math.round(v * d), d);
    }
    return null;
  }

  function fmtNum(v) {
    if (Number.isInteger(v)) return sgn(v);
    const f = toFrac(v);
    return f ? fracHTML(f) : sgn(+v.toFixed(2));
  }

  function numText(v) {
    if (Number.isInteger(v)) return String(v);
    const f = toFrac(v);
    return f ? `${f.n}/${f.d}` : v.toFixed(2);
  }

  // undo a constant: "Subtract 5 from" or "Add 5 to"
  const move = b => (b > 0 ? `Subtract ${b} from` : `Add ${-b} to`);

  // a sum of terms with clean signs: [[3,'x'],[-2,'y'],[5,'']] -> 3x − 2y + 5
  function lin(terms) {
    let s = '';
    for (const [c, v] of terms) {
      if (!c) continue;
      const abs = Math.abs(c);
      const body = v ? (abs === 1 ? v : abs + v) : String(abs);
      if (!s) s = (c < 0 ? M : '') + body;
      else s += (c < 0 ? ` ${M} ` : ' + ') + body;
    }
    return s || '0';
  }

  // the coefficient in front of a parenthesis: 1 hidden, -1 as a minus sign
  const lead = c => (c === 1 ? '' : c === -1 ? M : sgn(c));

  // strips markup for the plain-text log
  const plain = html => html
    .replace(/<span class="frac"><span>(.*?)<\/span><span>(.*?)<\/span><\/span>/g, '($1)/($2)')
    .replace(/<sup>(.*?)<\/sup>/g, '^$1')
    .replace(/<br>/g, '; ')
    .replace(/<[^>]+>/g, '')
    .replace(/−/g, '-')
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

  /* ---------------------------------------------------------------
     polynomials in x, stored as {degree: coefficient}
     --------------------------------------------------------------- */

  function clean(p) {
    const r = {};
    for (const d in p) if (Math.abs(p[d]) > 1e-9) r[d] = p[d];
    return r;
  }

  function padd(a, b, k = 1) {
    const r = { ...a };
    for (const d in b) r[d] = (r[d] || 0) + k * b[d];
    return clean(r);
  }

  function pmul(a, b) {
    const r = {};
    for (const i in a) {
      for (const j in b) {
        const d = +i + +j;
        r[d] = (r[d] || 0) + a[i] * b[j];
      }
    }
    return clean(r);
  }

  function peq(a, b) {
    const degrees = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const d of degrees) if (!near(a[d] || 0, b[d] || 0)) return false;
    return true;
  }

  const degrees = p => Object.keys(p).map(Number).sort((x, y) => y - x);

  function polyHTML(p) {
    let s = '';
    for (const d of degrees(p)) {
      const c = p[d];
      const abs = Math.abs(c);
      const num = Number.isInteger(abs) ? String(abs) : fmtNum(abs);
      const body = d === 0 ? num : (abs === 1 ? '' : num) + 'x' + (d > 1 ? `<sup>${d}</sup>` : '');
      if (!s) s = (c < 0 ? M : '') + body;
      else s += (c < 0 ? ` ${M} ` : ' + ') + body;
    }
    return s || '0';
  }

  function polyText(p) {
    let s = '';
    for (const d of degrees(p)) {
      const c = p[d];
      const abs = Math.abs(c);
      const num = numText(abs);
      const body = d === 0 ? num : (abs === 1 ? '' : num) + 'x' + (d > 1 ? '^' + d : '');
      if (!s) s = (c < 0 ? '-' : '') + body;
      else s += (c < 0 ? ' - ' : ' + ') + body;
    }
    return s || '0';
  }

  /* ---------------------------------------------------------------
     expression parser
     reads things like 3x^2 - 5x + 1, (x + 2)(x - 3), 1/2x + 4, and
     "y = 2x - 3". returns the polynomial plus how many top-level terms
     it had and how many non-constant factors, which is how factored
     form is told apart from expanded form
     --------------------------------------------------------------- */

  function tokenize(s) {
    s = s.toLowerCase()
      .replace(/[−–—]/g, '-')
      .replace(/[×·]/g, '*')
      // raised characters typed or pasted in, like x² or x⁻¹
      .replace(/[⁻]?[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, m => '^' + [...m].map(c => '⁻⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(c) === 0 ? '-' : '⁻⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(c) - 1).join(''))
      .replace(/\s+/g, '')
      .replace(/^(y|f\(x\))=/, '');

    const out = [];
    let i = 0;
    while (i < s.length) {
      const num = s.slice(i).match(/^\d*\.?\d+/);
      if (num) {
        out.push({ t: 'n', v: parseFloat(num[0]) });
        i += num[0].length;
        continue;
      }
      const ch = s[i];
      if (ch === 'x') out.push({ t: 'x' });
      else if ('+-*^()/'.includes(ch)) out.push({ t: ch });
      else return null;
      i++;
    }
    return out;
  }

  function parseExpr(str) {
    const toks = tokenize(str);
    if (!toks || !toks.length) return null;

    let i = 0;
    const peek = () => toks[i];
    const next = () => toks[i++];
    const isConst = p => Object.keys(p).every(d => d === '0');

    function expr() {
      const first = term();
      if (!first) return null;
      let acc = first.p;
      let terms = 1;
      while (peek() && (peek().t === '+' || peek().t === '-')) {
        const op = next().t;
        const t = term();
        if (!t) return null;
        acc = padd(acc, t.p, op === '+' ? 1 : -1);
        terms++;
      }
      return { p: acc, terms, factors: first.factors };
    }

    function term() {
      const f = unary();
      if (!f) return null;
      let p = f.p;
      let factors = f.nc;
      for (;;) {
        const tk = peek();
        if (!tk) break;
        if (tk.t === '*') {
          next();
          const g = unary();
          if (!g) return null;
          p = pmul(p, g.p);
          factors += g.nc;
        } else if (tk.t === '/') {
          // only dividing by a plain number is allowed
          next();
          const g = unary();
          if (!g || !isConst(g.p) || !g.p[0]) return null;
          p = pmul(p, { 0: 1 / g.p[0] });
        } else if (tk.t === 'n' || tk.t === 'x' || tk.t === '(') {
          // implied multiplication, as in 3x or (x+1)(x+2)
          const g = power();
          if (!g) return null;
          p = pmul(p, g.p);
          factors += g.nc;
        } else {
          break;
        }
      }
      return { p, factors };
    }

    function unary() {
      const tk = peek();
      if (tk && (tk.t === '-' || tk.t === '+')) {
        next();
        const f = unary();
        if (!f) return null;
        return { p: tk.t === '-' ? pmul(f.p, { 0: -1 }) : f.p, nc: f.nc };
      }
      return power();
    }

    function power() {
      const a = atom();
      if (!a) return null;
      if (peek() && peek().t === '^') {
        next();
        const e = next();
        // power of a power problems go up to x^30
        if (!e || e.t !== 'n' || !Number.isInteger(e.v) || e.v > 40) return null;
        let p = { 0: 1 };
        for (let k = 0; k < e.v; k++) p = pmul(p, a.p);
        // (x+3)^2 counts as two factors, x^2 as one
        const nc = isConst(a.p) ? 0 : (a.paren ? e.v : 1);
        return { p, nc };
      }
      return { p: a.p, nc: isConst(a.p) ? 0 : 1 };
    }

    function atom() {
      const tk = next();
      if (!tk) return null;
      if (tk.t === 'n') return { p: { 0: tk.v } };
      if (tk.t === 'x') return { p: { 1: 1 } };
      if (tk.t === '(') {
        const e = expr();
        if (!e || !peek() || next().t !== ')') return null;
        return { p: e.p, paren: true };
      }
      return null;
    }

    const r = expr();
    if (!r || i !== toks.length) return null;
    return { p: clean(r.p), terms: r.terms, factors: r.factors };
  }

  /* ---------------------------------------------------------------
     answer parsing, one parser per format
     --------------------------------------------------------------- */

  const REL = { '<': '<', '>': '>', '<=': '<=', '>=': '>=', '=<': '<=', '=>': '>=', '≤': '<=', '≥': '>=' };
  const FLIP = { '<': '>', '>': '<', '<=': '>=', '>=': '<=' };
  const TOGGLE = { '<': '<=', '<=': '<', '>': '>=', '>=': '>' };
  const RELH = { '<': '&lt;', '>': '&gt;', '<=': '≤', '>=': '≥' };

  const tidy = s => s.toLowerCase().replace(/[−–—]/g, '-').replace(/\s+/g, '');

  function parseList(s) {
    const parts = s.toLowerCase()
      .replace(/\b(and|or)\b/g, ',')
      .replace(/[{}]/g, '')
      .split(/[,;]/)
      .map(t => t.replace(/[xy]\s*=/, '').trim())
      .filter(Boolean);
    if (!parts.length) return null;
    const vals = parts.map(parseNum);
    return vals.some(v => v === null) ? null : vals;
  }

  function parsePair(s) {
    const t = tidy(s).replace(/[()]/g, '');
    const named = t.match(/^x=([^,;]+)[,;]y=([^,;]+)$/);
    let a, b;
    if (named) {
      [, a, b] = named;
    } else {
      const parts = t.split(/[,;]/);
      if (parts.length !== 2) return null;
      [a, b] = parts;
    }
    const x = parseNum(a);
    const y = parseNum(b);
    return x === null || y === null ? null : [x, y];
  }

  function parseIneq(s) {
    const t = tidy(s);
    let m = t.match(/^x(<=|>=|=<|=>|<|>|≤|≥)(.+)$/);
    if (m) {
      const v = parseNum(m[2]);
      return v === null ? null : { rel: REL[m[1]], v };
    }
    // written backwards, like 3 < x
    m = t.match(/^(.+?)(<=|>=|=<|=>|<|>|≤|≥)x$/);
    if (m) {
      const v = parseNum(m[1]);
      return v === null ? null : { rel: FLIP[REL[m[2]]], v };
    }
    return null;
  }

  function parseCompound(s) {
    const t = tidy(s);
    let m = t.match(/^(.+?)(<=|=<|<|≤)x(<=|=<|<|≤)(.+)$/);
    if (m) {
      const lo = parseNum(m[1]);
      const hi = parseNum(m[4]);
      if (lo === null || hi === null) return null;
      return { lo, loIn: REL[m[2]] === '<=', hi, hiIn: REL[m[3]] === '<=' };
    }
    // written high to low, like 3 >= x > -2
    m = t.match(/^(.+?)(>=|=>|>|≥)x(>=|=>|>|≥)(.+)$/);
    if (m) {
      const hi = parseNum(m[1]);
      const lo = parseNum(m[4]);
      if (lo === null || hi === null) return null;
      return { lo, loIn: REL[m[3]] === '>=', hi, hiIn: REL[m[2]] === '>=' };
    }
    return null;
  }

  function parse(format, raw) {
    if (format === 'num') return parseNum(raw);
    if (format === 'list') return parseList(raw);
    if (format === 'pair') return parsePair(raw);
    if (format === 'ineq') return parseIneq(raw);
    if (format === 'compound') return parseCompound(raw);
    if (format === 'expr' || format === 'factored') return parseExpr(raw);
    return null;
  }

  /* ---------------------------------------------------------------
     comparing answers and naming mistakes
     --------------------------------------------------------------- */

  const uniq = arr => {
    const s = arr.slice().sort((p, q) => p - q);
    return s.filter((v, i) => i === 0 || !near(v, s[i - 1], 1e-6));
  };

  const polyOf = v => (v && v.p ? v.p : v);

  function same(format, a, b, tol) {
    switch (format) {
      case 'num':
        return near(a, b, tol);
      case 'list': {
        const x = uniq(a);
        const y = uniq(b);
        return x.length === y.length && x.every((v, i) => near(v, y[i], tol));
      }
      case 'pair':
      case 'point':
        return near(a[0], b[0], tol) && near(a[1], b[1], tol);
      case 'ineq':
        return a.rel === b.rel && near(a.v, b.v, tol);
      case 'compound':
        return near(a.lo, b.lo, tol) && near(a.hi, b.hi, tol) && a.loIn === b.loIn && a.hiIn === b.hiIn;
      case 'expr':
      case 'factored':
        return peq(polyOf(a), polyOf(b));
      case 'choice':
        return a === b;
      case 'line':
        return a.vx === undefined && b.vx === undefined && near(a.m, b.m) && near(a.b, b.b);
      default:
        return false;
    }
  }

  function diagnose(item, value) {
    const tol = item.tol || 1e-9;

    if (item.format === 'line' && value.vx !== undefined) return { ok: false, id: 'vertical' };

    if (same(item.format, value, item.answer, tol)) {
      if (item.format === 'factored' && !(value.terms === 1 && value.factors >= 2)) {
        return { ok: false, id: 'fac_expanded' };
      }
      return { ok: true };
    }

    for (const c of item.cands) {
      if (same(item.format, value, c.value, tol)) return { ok: false, id: c.id };
    }

    if (item.extra) {
      const id = item.extra(value);
      if (id) return { ok: false, id };
    }
    return { ok: false, id: 'other' };
  }

  // drops mistake answers that equal the right answer or each other,
  // so a correct answer is never reported as a mistake
  function finish(item) {
    const tol = item.tol || 1e-9;
    const valid = v => {
      if (v === null || v === undefined) return false;
      if (typeof v === 'number') return Number.isFinite(v);
      if (Array.isArray(v)) return v.every(Number.isFinite);
      return true;
    };

    const out = [];
    for (const c of item.cands) {
      if (!valid(c.value)) continue;
      if (same(item.format, c.value, item.answer, tol)) continue;
      if (out.some(o => same(item.format, o.value, c.value, tol))) continue;
      out.push(c);
    }
    item.cands = out;
    item.text = plain(item.eq || item.ask);
    return item;
  }

  // shared fallback for answers in slope-intercept form
  const linearExtra = (m, b) => v => {
    const p = polyOf(v);
    if (Object.keys(p).some(d => +d > 1)) return null;
    if (near(p[1] || 0, m)) return 'intoff';
    if (near(p[0] || 0, b)) return 'slopeoff';
    return null;
  };

  /* ---------------------------------------------------------------
     visuals
     --------------------------------------------------------------- */

  function numberLine(sol) {
    const ray = sol.kind === 'ray';
    const c = ray ? Math.round(sol.v) : Math.round((sol.lo + sol.hi) / 2);
    const half = ray ? 6 : Math.max(6, Math.ceil((sol.hi - sol.lo) / 2) + 2);
    const min = c - half;
    const max = c + half;
    const X = v => ((v - min) / (max - min)) * 100;
    const every = half > 8 ? 2 : 1;

    let s = `<svg class="nl" viewBox="-5 -7 110 15" role="img" aria-label="Number line showing the solution">`;
    s += `<path class="nl-axis" d="M-3 0 H103 M-1 -1.5 L-3 0 L-1 1.5 M101 -1.5 L103 0 L101 1.5"/>`;
    for (let v = min; v <= max; v++) {
      if ((v - min) % every) continue;
      s += `<line class="nl-tick" x1="${X(v)}" y1="-1.3" x2="${X(v)}" y2="1.3"/>`;
      s += `<text class="nl-lbl" x="${X(v)}" y="5.4" text-anchor="middle">${sgn(v)}</text>`;
    }

    // open circle leaves the number out, filled circle includes it
    const dot = (v, incl) =>
      `<circle class="nl-dot${incl ? '' : ' open'} step" style="--i:0" cx="${X(v)}" cy="0" r="1.3"/>`;

    if (ray) {
      const right = sol.rel === '>' || sol.rel === '>=';
      s += `<path class="nl-ray draw" pathLength="1" style="--i:1" d="M${X(sol.v)} 0 H${right ? 103 : -3}"/>`;
      s += dot(sol.v, sol.rel.length === 2);
    } else {
      s += `<path class="nl-ray draw" pathLength="1" style="--i:1" d="M${X(sol.lo)} 0 H${X(sol.hi)}"/>`;
      s += dot(sol.lo, sol.loIn) + dot(sol.hi, sol.hiIn);
    }
    return `<div class="nlwrap">${s}</svg></div>`;
  }

  function parabolaPath(a, h, k) {
    let d = '';
    for (let x = -7.5; x <= 7.51; x += 0.1) {
      const y = a * (x - h) ** 2 + k;
      const cy = Math.max(-20, Math.min(20, -y));
      d += (d ? ' L' : 'M') + x.toFixed(2) + ' ' + cy.toFixed(2);
    }
    return d;
  }

  // the replay of a line, reusing the graphing topic's explain steps
  function lineReplay(line, res, extra = {}) {
    const kp = keyPoints(line);
    return {
      board: {
        id: 'ta',
        ...extra,
        explain: { p: kp[0], q: kp[1], emph: res.ok ? null : EMPHASIS[res.id], startLabel: `b = ${sgn(line.b)}` },
        aria: 'The correct line drawn step by step'
      }
    };
  }

  const pointReplay = (p, extra = {}) => ({
    id: 'ta',
    ...extra,
    dots: [
      { p, cls: 'ex-ring step', r: 0.55, i: 0 },
      { p, cls: 'ex-pt step', r: 0.24, i: 0 }
    ]
  });

  const HINT = {
    num: 'Type a number. Typing / stacks a fraction, like 3/4.',
    list: 'Type every answer, separated by commas, like 2, −5.',
    pair: 'Type the point as (x, y), like (2, −1).',
    ineq: 'Type it like x > 3 or x <= −2.',
    compound: 'Type it like −2 < x <= 3.',
    expr: 'Type ^ for a power and / for a fraction. Arrow keys move in and out of them.',
    linear: 'Type it like y = 2x − 3. Fractions like 1/2x work.',
    factored: 'Type the factors, like (x + 2)(x − 5).'
  };

  /* ---------------------------------------------------------------
     linear equations and graphs
     --------------------------------------------------------------- */

  function writeeq(tier) {
    const g = genGraph(tier);
    const m = val(g.m);
    const kp = keyPoints(g);
    return finish({
      format: 'expr',
      ask: 'Write the equation of this line in slope-intercept form.',
      eq: '',
      board: {
        lines: [{ m, b: g.b, cls: 'ul' }],
        dots: kp.map(p => ({ p, cls: 'pt', r: 0.2 }))
      },
      answer: { 1: m, 0: g.b },
      answerHTML: eqHTML(g.m, g.b),
      sample: `y = ${mTextOf(g.m)}x + ${g.b}`,
      cands: graphCands(g).map(c => ({ id: c.id, value: { 1: c.m, 0: c.b } })),
      extra: linearExtra(m, g.b),
      steps: [
        `It crosses the y-axis at (0, ${sgn(g.b)}), so b = ${sgn(g.b)}.`,
        `From there, rise ${sgn(g.m.n)} and run ${g.m.d}, so m = ${fracHTML(g.m)}.`,
        eqHTML(g.m, g.b)
      ],
      after: res => lineReplay(g, res),
      hint: HINT.linear,
      tier
    });
  }

  const mTextOf = m => (m.d === 1 ? String(m.n) : `${m.n}/${m.d}`);
  const slopeLead = m => (m.d === 1 ? lead(m.n) : fracHTML(m));

  function pointslope(tier) {
    for (;;) {
      const m = tier === 3
        ? frac(pick([-3, -1, 1, 3]), 2)
        : frac(tier === 1 ? ri(1, 4) : nz(-4, 4));
      const x1 = tier === 3 ? pick([-4, -2, 2, 4]) : nz(-5, 5);
      const y1 = nz(-6, 6);
      const mv = val(m);
      const b = y1 - mv * x1;
      if (!Number.isInteger(b) || Math.abs(b) > 6) continue;

      const yPart = `y ${y1 > 0 ? M + ' ' + y1 : '+ ' + -y1}`;
      const xPart = `(${lin([[1, 'x'], [-x1, '']])})`;

      return finish({
        format: 'expr',
        ask: 'Rewrite this line in slope-intercept form, y = mx + b.',
        eq: `${yPart} = ${slopeLead(m)}${xPart}`,
        answer: { 1: mv, 0: b },
        answerHTML: eqHTML(m, b),
        sample: `y = ${mTextOf(m)}x + ${b}`,
        cands: [
          { id: 'ps_xsign', value: { 1: mv, 0: y1 + mv * x1 } },
          { id: 'ps_nodist', value: { 1: mv, 0: y1 - x1 } },
          { id: 'ps_ysign', value: { 1: mv, 0: -y1 - mv * x1 } }
        ],
        extra: linearExtra(mv, b),
        steps: [
          `Distribute ${fracHTML(m)}: ${yPart} = ${fracHTML(m)}x ${-mv * x1 < 0 ? M : '+'} ${fmtNum(Math.abs(mv * x1))}`,
          `${y1 > 0 ? 'Add ' + y1 + ' to' : 'Subtract ' + -y1 + ' from'} both sides.`,
          eqHTML(m, b)
        ],
        after: res => lineReplay({ m, b }, res),
        hint: HINT.linear,
        tier
      });
    }
  }

  function standardForm(tier) {
    for (;;) {
      const B = tier === 1 ? 1 : tier === 2 ? pick([1, 2]) : pick([2, 3]);
      const A = nz(-4, 4);
      if (gcd(A, B) !== 1) continue;
      const b = nz(-4, 4);
      const C = B * b;
      const m = frac(-A, B);
      const line = { m, b };

      const cands = [
        { id: 'std_nodiv', value: { m: -A, b: C } },
        { id: 'std_sign', value: { m: A / B, b } },
        ...graphCands(line).map(c => ({ id: c.id, value: { m: c.m, b: c.b } }))
      ];

      return finish({
        format: 'line',
        ask: 'Graph this line. Tap two points that are on it.',
        eq: `${lin([[A, 'x'], [B, 'y']])} = ${sgn(C)}`,
        board: {},
        answer: { m: val(m), b },
        answerHTML: eqHTML(m, b),
        sample: keyPoints(line),
        cands,
        extra: v => (v.vx !== undefined ? null : near(v.m, val(m)) ? 'intoff' : near(v.b, b) ? 'slopeoff' : null),
        steps: [
          `Move the x term: ${lin([[B, 'y']])} = ${lin([[-A, 'x'], [C, '']])}`,
          B === 1 ? `That is already y = mx + b: ${eqHTML(m, b)}` : `Divide every term by ${B}: ${eqHTML(m, b)}`,
          `Start at (0, ${sgn(b)}), then rise ${sgn(m.n)} and run ${m.d}.`
        ],
        after: res => lineReplay(line, res),
        tier
      });
    }
  }

  function parperp(tier) {
    for (;;) {
      const perp = tier === 3 || (tier === 2 && Math.random() < 0.6);
      const m = tier === 1 ? frac(nz(-3, 3)) : frac(pick([-3, -2, -1, 1, 2, 3]), pick([1, 2]));
      const b0 = nz(-5, 5);
      const mNew = perp ? frac(-m.d, m.n) : m;
      const px = mNew.d * nz(-2, 2);
      const py = nz(-5, 5);
      const mv = val(mNew);
      const b = py - mv * px;
      if (!Number.isInteger(b) || Math.abs(b) > 6 || b === b0) continue;
      if (Math.abs(px) > 6) continue;

      const through = mm => py - mm * px;
      const cands = [{ id: 'pp_keptb', value: { 1: mv, 0: b0 } }];
      if (perp) {
        const old = val(m);
        cands.push({ id: 'pp_same', value: { 1: old, 0: through(old) } });
        cands.push({ id: 'pp_recip', value: { 1: 1 / old, 0: through(1 / old) } });
        cands.push({ id: 'pp_neg', value: { 1: -old, 0: through(-old) } });
      }

      return finish({
        format: 'expr',
        ask: `Write the line ${perp ? 'perpendicular' : 'parallel'} to this one that passes through (${sgn(px)}, ${sgn(py)}).`,
        eq: eqHTML(m, b0),
        answer: { 1: mv, 0: b },
        answerHTML: eqHTML(mNew, b),
        sample: `y = ${mTextOf(mNew)}x + ${b}`,
        cands,
        extra: linearExtra(mv, b),
        steps: [
          perp
            ? `Perpendicular slopes are negative reciprocals: ${fracHTML(m)} becomes ${fracHTML(mNew)}.`
            : `Parallel lines have the same slope: ${fracHTML(m)}.`,
          `Use the point: ${sgn(py)} = ${fracHTML(mNew)}(${sgn(px)}) + b, so b = ${sgn(b)}.`,
          eqHTML(mNew, b)
        ],
        after: res => lineReplay({ m: mNew, b }, res, {
          lines: [{ m: val(m), b: b0, cls: 'gv' }],
          stars: [[px, py]]
        }),
        hint: HINT.linear,
        tier
      });
    }
  }

  /* ---------------------------------------------------------------
     solving equations
     --------------------------------------------------------------- */

  function onestep(tier) {
    const kind = tier === 1 ? pick(['add', 'mul']) : tier === 2 ? pick(['add', 'mul']) : pick(['mul', 'div', 'add']);

    if (kind === 'add') {
      const x0 = tier === 1 ? ri(1, 12) : nz(-12, 12);
      const a = tier === 1 ? ri(1, 15) : nz(-15, 15);
      const b = x0 + a;
      return finish({
        format: 'num',
        ask: 'Solve for x.',
        eq: `${lin([[1, 'x'], [a, '']])} = ${sgn(b)}`,
        answer: x0,
        answerHTML: `x = ${sgn(x0)}`,
        sample: String(x0),
        cands: [
          { id: 'eq_wrongop', value: b + a },
          { id: 'eq_sign', value: -x0 }
        ],
        steps: [`${move(a)} both sides.`, `x = ${sgn(b)} ${a > 0 ? M + ' ' + a : '+ ' + -a} = ${sgn(x0)}`],
        hint: HINT.num,
        tier
      });
    }

    if (kind === 'mul') {
      const a = (tier === 1 ? 1 : pick([-1, 1])) * ri(2, 9);
      const x0 = tier === 1 ? ri(1, 10) : nz(-10, 10);
      const b = a * x0;
      return finish({
        format: 'num',
        ask: 'Solve for x.',
        eq: `${lin([[a, 'x']])} = ${sgn(b)}`,
        answer: x0,
        answerHTML: `x = ${sgn(x0)}`,
        sample: String(x0),
        cands: [
          { id: 'eq_wrongop', value: a * b },
          { id: 'eq_flipdiv', value: a / b },
          { id: 'eq_sign', value: -x0 }
        ],
        steps: [`Divide both sides by ${sgn(a)}.`, `x = ${sgn(b)} ÷ ${par(a)} = ${sgn(x0)}`],
        hint: HINT.num,
        tier
      });
    }

    const a = ri(2, 9);
    const q = nz(-9, 9);
    const x0 = a * q;
    return finish({
      format: 'num',
      ask: 'Solve for x.',
      eq: `${F('x', a)} = ${sgn(q)}`,
      answer: x0,
      answerHTML: `x = ${sgn(x0)}`,
      sample: String(x0),
      cands: [
        { id: 'eq_wrongop', value: q / a },
        { id: 'eq_sign', value: -x0 }
      ],
      steps: [`Multiply both sides by ${a}.`, `x = ${sgn(q)} × ${a} = ${sgn(x0)}`],
      hint: HINT.num,
      tier
    });
  }

  function twostep(tier) {
    const a = (tier === 3 ? -1 : 1) * ri(2, 9);
    const x0 = tier === 1 ? ri(1, 10) : nz(-10, 10);
    const b = tier === 1 ? ri(1, 15) : nz(-15, 15);
    const c = a * x0 + b;

    return finish({
      format: 'num',
      ask: 'Solve for x.',
      eq: `${lin([[a, 'x'], [b, '']])} = ${sgn(c)}`,
      answer: x0,
      answerHTML: `x = ${sgn(x0)}`,
      sample: String(x0),
      cands: [
        { id: 'eq_order', value: c / a - b },
        { id: 'eq_addconst', value: (c + b) / a },
        { id: 'eq_sign', value: -x0 }
      ],
      steps: [
        `${move(b)} both sides: ${lin([[a, 'x']])} = ${sgn(c - b)}`,
        `Divide both sides by ${sgn(a)}: x = ${sgn(x0)}`
      ],
      hint: HINT.num,
      tier
    });
  }

  function multistep(tier) {
    const a = tier === 3 ? -ri(2, 6) : ri(2, 6);
    const b = tier === 1 ? ri(1, 6) : nz(-6, 6);
    const c = tier === 1 ? ri(1, 10) : nz(-10, 10);
    const x0 = tier === 1 ? ri(1, 8) : nz(-8, 8);
    const d = a * (x0 + b) + c;

    const cands = [
      { id: 'eq_nodist', value: (d - b - c) / a },
      { id: 'eq_addconst', value: (d + c) / a - b }
    ];
    if (a < 0) cands.push({ id: 'eq_negdist', value: (d + a * b - c) / a });

    return finish({
      format: 'num',
      ask: 'Solve for x.',
      eq: `${lead(a)}(${lin([[1, 'x'], [b, '']])}) ${c > 0 ? '+ ' + c : M + ' ' + -c} = ${sgn(d)}`,
      answer: x0,
      answerHTML: `x = ${sgn(x0)}`,
      sample: String(x0),
      cands,
      steps: [
        `Distribute ${sgn(a)}: ${lin([[a, 'x'], [a * b, ''], [c, '']])} = ${sgn(d)}`,
        `Combine the numbers: ${lin([[a, 'x'], [a * b + c, '']])} = ${sgn(d)}`,
        `${move(a * b + c)} both sides: ${lin([[a, 'x']])} = ${sgn(d - a * b - c)}`,
        `Divide both sides by ${sgn(a)}: x = ${sgn(x0)}`
      ],
      hint: HINT.num,
      tier
    });
  }

  function bothsides(tier) {
    let a, c;
    if (tier === 1) {
      a = ri(3, 9);
      c = ri(1, a - 1);
    } else {
      do {
        a = tier === 2 ? ri(1, 9) * pick([1, 1, -1]) : nz(-9, 9);
        c = nz(-9, 9);
      } while (a === c);
    }
    const x0 = tier === 1 ? ri(1, 9) : nz(-9, 9);
    const b = nz(-12, 12);
    const d = (a - c) * x0 + b;

    const cands = [{ id: 'eq_sign', value: -x0 }];
    if (a + c !== 0) cands.push({ id: 'eq_combine', value: (d - b) / (a + c) });

    return finish({
      format: 'num',
      ask: 'Solve for x.',
      eq: `${lin([[a, 'x'], [b, '']])} = ${lin([[c, 'x'], [d, '']])}`,
      answer: x0,
      answerHTML: `x = ${sgn(x0)}`,
      sample: String(x0),
      cands,
      steps: [
        `${c > 0 ? 'Subtract ' + lin([[c, 'x']]) + ' from' : 'Add ' + lin([[-c, 'x']]) + ' to'} both sides: ${lin([[a - c, 'x'], [b, '']])} = ${sgn(d)}`,
        `${move(b)} both sides: ${lin([[a - c, 'x']])} = ${sgn(d - b)}`,
        `Divide both sides by ${sgn(a - c)}: x = ${sgn(x0)}`
      ],
      hint: HINT.num,
      tier
    });
  }

  // each formula with one right rearrangement and three that come from
  // a specific mistake
  const LITERALS = [
    {
      tier: 1, formula: 'A = lw', v: 'w', how: 'Divide both sides by l.',
      right: `w = ${F('A', 'l')}`,
      wrong: [[`w = Al`, 'eq_wrongop'], [`w = ${F('l', 'A')}`, 'eq_flipdiv'], [`w = A ${M} l`, 'lit_subtract']]
    },
    {
      tier: 1, formula: 'd = rt', v: 't', how: 'Divide both sides by r.',
      right: `t = ${F('d', 'r')}`,
      wrong: [[`t = dr`, 'eq_wrongop'], [`t = ${F('r', 'd')}`, 'eq_flipdiv'], [`t = d ${M} r`, 'lit_subtract']]
    },
    {
      tier: 2, formula: 'P = 2l + 2w', v: 'w', how: 'Subtract 2l from both sides, then divide both sides by 2.',
      right: `w = ${F(`P ${M} 2l`, '2')}`,
      wrong: [[`w = ${F('P', '2')} ${M} 2l`, 'eq_order'], [`w = ${F('P + 2l', '2')}`, 'eq_addconst'], [`w = P ${M} 2l`, 'lit_partial']]
    },
    {
      tier: 2, formula: 'y = mx + b', v: 'x', how: 'Subtract b from both sides, then divide both sides by m.',
      right: `x = ${F(`y ${M} b`, 'm')}`,
      wrong: [[`x = ${F('y', 'm')} ${M} b`, 'eq_order'], [`x = ${F('y + b', 'm')}`, 'eq_addconst'], [`x = m(y ${M} b)`, 'eq_wrongop']]
    },
    {
      tier: 2, formula: 'C = 2πr', v: 'r', how: 'Divide both sides by 2π.',
      right: `r = ${F('C', '2π')}`,
      wrong: [[`r = 2πC`, 'eq_wrongop'], [`r = ${F('2π', 'C')}`, 'eq_flipdiv'], [`r = C ${M} 2π`, 'lit_subtract']]
    },
    {
      tier: 3, formula: 'I = Prt', v: 'r', how: 'Divide both sides by Pt.',
      right: `r = ${F('I', 'Pt')}`,
      wrong: [[`r = IPt`, 'eq_wrongop'], [`r = ${F('Pt', 'I')}`, 'eq_flipdiv'], [`r = ${F('I', 'P')} ${M} t`, 'lit_subtract']]
    },
    {
      tier: 3, formula: `F = ${F('9', '5')}C + 32`, v: 'C', how: `Subtract 32 from both sides, then multiply both sides by ${F('5', '9')}.`,
      right: `C = ${F('5', '9')}(F ${M} 32)`,
      wrong: [[`C = ${F('5', '9')}F ${M} 32`, 'eq_order'], [`C = ${F('5', '9')}(F + 32)`, 'eq_addconst'], [`C = ${F('9', '5')}(F ${M} 32)`, 'eq_flipdiv']]
    },
    {
      tier: 3, formula: `A = ${F('1', '2')}bh`, v: 'h', how: 'Multiply both sides by 2, then divide both sides by b.',
      right: `h = ${F('2A', 'b')}`,
      wrong: [[`h = ${F('A', '2b')}`, 'lit_half'], [`h = ${F('Ab', '2')}`, 'eq_wrongop'], [`h = 2A ${M} b`, 'lit_subtract']]
    }
  ];

  function literal(tier) {
    const t = pick(LITERALS.filter(l => l.tier === tier));
    const options = shuffle([{ html: t.right, id: null }, ...t.wrong.map(([html, id]) => ({ html, id }))]);
    const answer = options.findIndex(o => !o.id);

    return finish({
      format: 'choice',
      ask: `Solve for ${t.v}.`,
      eq: t.formula,
      choices: options.map(o => o.html),
      answer,
      answerHTML: t.right,
      sample: answer,
      cands: options.map((o, i) => (o.id ? { id: o.id, value: i } : null)).filter(Boolean),
      steps: [t.how, t.right],
      tier
    });
  }

  /* ---------------------------------------------------------------
     inequalities
     --------------------------------------------------------------- */

  const ineqHTML = s => `x ${RELH[s.rel]} ${fmtNum(s.v)}`;
  const compoundHTML = s => `${fmtNum(s.lo)} ${s.loIn ? '≤' : '&lt;'} x ${s.hiIn ? '≤' : '&lt;'} ${fmtNum(s.hi)}`;

  function ineq(tier) {
    const a = tier === 1 ? ri(2, 6) : tier === 2 ? pick([-1, 1]) * ri(2, 6) : -ri(2, 6);
    const v = nz(-8, 8);
    const b = nz(-12, 12);
    const rel = pick(['<', '>', '<=', '>=']);
    const c = a * v + b;
    const solRel = a < 0 ? FLIP[rel] : rel;
    const answer = { rel: solRel, v };

    const cands = [
      a < 0 ? { id: 'in_noflip', value: { rel, v } } : { id: 'in_flipwrong', value: { rel: FLIP[rel], v } },
      { id: 'in_endpoint', value: { rel: TOGGLE[solRel], v } },
      { id: 'eq_addconst', value: { rel: solRel, v: (c + b) / a } }
    ];

    return finish({
      format: 'ineq',
      ask: 'Solve the inequality.',
      eq: `${lin([[a, 'x'], [b, '']])} ${RELH[rel]} ${sgn(c)}`,
      answer,
      answerHTML: ineqHTML(answer),
      sample: `x ${solRel} ${v}`,
      cands,
      steps: [
        `${move(b)} both sides: ${lin([[a, 'x']])} ${RELH[rel]} ${sgn(c - b)}`,
        `Divide both sides by ${sgn(a)}${a < 0 ? ', and flip the sign because it is negative' : ''}: ${ineqHTML(answer)}`
      ],
      after: () => ({ html: numberLine({ kind: 'ray', v, rel: solRel }) }),
      hint: HINT.ineq,
      tier
    });
  }

  function compound(tier) {
    const L = nz(-6, 3);
    const H = L + ri(2, 7);
    const loIn = Math.random() < 0.5;
    const hiIn = Math.random() < 0.5;
    const a = tier === 1 ? 1 : tier === 2 ? ri(2, 4) : -ri(2, 4);
    const b = nz(-9, 9);
    const sym = incl => (incl ? '≤' : '&lt;');
    const middle = lin([[a, 'x'], [b, '']]);
    const answer = { lo: L, loIn, hi: H, hiIn };

    let eq, cands, left, right;
    if (a > 0) {
      left = a * L + b;
      right = a * H + b;
      eq = `${sgn(left)} ${sym(loIn)} ${middle} ${sym(hiIn)} ${sgn(right)}`;
      cands = [{ id: 'in_middle', value: { lo: left, loIn, hi: right, hiIn } }];
    } else {
      // a negative coefficient reverses the order of the endpoints
      left = a * H + b;
      right = a * L + b;
      eq = `${sgn(left)} ${sym(hiIn)} ${middle} ${sym(loIn)} ${sgn(right)}`;
      cands = [
        { id: 'in_noflip', value: { lo: H, loIn: hiIn, hi: L, hiIn: loIn } },
        { id: 'in_middle', value: { lo: left, loIn: hiIn, hi: right, hiIn: loIn } }
      ];
    }
    cands.push({ id: 'in_endpoint', value: { ...answer, loIn: !loIn } });
    cands.push({ id: 'in_endpoint', value: { ...answer, hiIn: !hiIn } });

    const steps = [];
    steps.push(`${move(b)} all three parts: ${sgn(left - b)} … ${lin([[a, 'x']])} … ${sgn(right - b)}`);
    if (a !== 1) {
      steps.push(`Divide all three parts by ${sgn(a)}${a < 0 ? ', which flips both signs and swaps the ends' : ''}.`);
    }
    steps.push(compoundHTML(answer));

    return finish({
      format: 'compound',
      ask: 'Solve the compound inequality.',
      eq,
      answer,
      answerHTML: compoundHTML(answer),
      sample: `${L} ${loIn ? '<=' : '<'} x ${hiIn ? '<=' : '<'} ${H}`,
      cands,
      steps,
      after: () => ({ html: numberLine({ kind: 'seg', lo: L, hi: H, loIn, hiIn }) }),
      hint: HINT.compound,
      tier
    });
  }

  function absval(tier) {
    const h = tier === 1 ? ri(1, 6) : nz(-6, 6);
    const k = ri(1, 8);
    const inside = lin([[1, 'x'], [-h, '']]);
    const answer = [h + k, h - k];

    const cands = [
      { id: 'abs_onecase', value: [h + k] },
      { id: 'abs_onecase', value: [h - k] },
      { id: 'abs_negdist', value: [h + k, -h - k] },
      { id: 'abs_sign', value: [k - h, -k - h] }
    ];

    let eq;
    const steps = [];
    if (tier < 3) {
      eq = `|${inside}| = ${k}`;
    } else {
      const c = nz(-6, 6);
      const d = k + c;
      eq = `|${inside}| ${c > 0 ? '+ ' + c : M + ' ' + -c} = ${sgn(d)}`;
      cands.push({ id: 'abs_isolate', value: [h + d, h - d] });
      steps.push(`${move(c)} both sides: |${inside}| = ${k}`);
    }
    steps.push(`Split into two cases: ${inside} = ${k} or ${inside} = ${M}${k}`);
    steps.push(`x = ${sgn(h + k)} or x = ${sgn(h - k)}`);

    return finish({
      format: 'list',
      ask: 'Solve. List every solution.',
      eq,
      answer,
      answerHTML: `x = ${sgn(h + k)} or x = ${sgn(h - k)}`,
      sample: `${h + k}, ${h - k}`,
      cands,
      steps,
      hint: HINT.list,
      tier
    });
  }

  /* ---------------------------------------------------------------
     systems of equations
     --------------------------------------------------------------- */

  const pairHTML = ([x, y]) => `(${fmtNum(x)}, ${fmtNum(y)})`;

  function sysgraph(tier) {
    const pool = tier === 1
      ? [1, 2, 3, -1, -2, -3]
      : tier === 2
        ? [1, 2, 3, -1, -2, -3, 0.5, -0.5]
        : [0.5, -0.5, 1.5, -1.5, 2, -2, 1 / 3, -1 / 3];

    for (;;) {
      const x0 = ri(-3, 3);
      const y0 = ri(-3, 3);
      const m1 = pick(pool);
      const m2 = pick(pool);
      if (m1 === m2) continue;
      const b1 = y0 - m1 * x0;
      const b2 = y0 - m2 * x0;
      if (!near(b1, Math.round(b1)) || !near(b2, Math.round(b2))) continue;
      const B1 = Math.round(b1);
      const B2 = Math.round(b2);
      if (Math.abs(B1) > 6 || Math.abs(B2) > 6) continue;

      const lines = [{ m: m1, b: B1, cls: 'sys1' }, { m: m2, b: B2, cls: 'sys2' }];

      return finish({
        format: 'point',
        ask: 'Tap the point where the two lines cross.',
        eq: `<span class="key1">${eqHTML(toFrac(m1), B1)}</span><br><span class="key2">${eqHTML(toFrac(m2), B2)}</span>`,
        board: { lines },
        answer: [x0, y0],
        answerHTML: pairHTML([x0, y0]),
        sample: [x0, y0],
        cands: [
          { id: 'sys_intercept', value: [0, B1] },
          { id: 'sys_intercept', value: [0, B2] },
          { id: 'sys_swap', value: [y0, x0] }
        ],
        steps: [
          'Follow both lines to the one point they share.',
          `Check it in both equations: ${sgn(y0)} = ${fmtNum(m1)}(${sgn(x0)}) + ${par(B1)} and ${sgn(y0)} = ${fmtNum(m2)}(${sgn(x0)}) + ${par(B2)}.`,
          `The solution is ${pairHTML([x0, y0])}.`
        ],
        after: () => ({ board: pointReplay([x0, y0], { lines }) }),
        tier
      });
    }
  }

  function substitution(tier) {
    for (;;) {
      const x0 = nz(-6, 6);
      const y0 = nz(-6, 6);
      const m = tier === 1 ? ri(1, 4) : nz(-4, 4);
      const b = y0 - m * x0;
      const a = tier === 1 ? ri(1, 5) : nz(-5, 5);
      const c = nz(-5, 5);
      if (a + c * m === 0 || Math.abs(b) > 15) continue;
      const d = a * x0 + c * y0;

      const cands = [
        { id: 'sys_swap', value: [y0, x0] },
        { id: 'sys_ysign', value: [x0, -y0] },
        { id: 'sys_xsign', value: [-x0, y0] }
      ];
      if (c * b !== 0) {
        const xs = (d + c * b) / (a + c * m);
        cands.push({ id: 'sys_subsign', value: [xs, m * xs + b] });
      }

      const yExpr = lin([[m, 'x'], [b, '']]);
      const cAbs = Math.abs(c) === 1 ? '' : Math.abs(c);

      return finish({
        format: 'pair',
        ask: 'Solve the system by substitution.',
        eq: `y = ${yExpr}<br>${lin([[a, 'x'], [c, 'y']])} = ${sgn(d)}`,
        answer: [x0, y0],
        answerHTML: pairHTML([x0, y0]),
        sample: `(${x0}, ${y0})`,
        cands,
        steps: [
          `Replace y in the second equation: ${lin([[a, 'x']])} ${c < 0 ? M : '+'} ${cAbs}(${yExpr}) = ${sgn(d)}`,
          `Distribute and combine: ${lin([[a + c * m, 'x'], [c * b, '']])} = ${sgn(d)}`,
          `So x = ${sgn(x0)}.`,
          `Then y = ${lin([[m, '']])}(${sgn(x0)}) ${b < 0 ? M : '+'} ${Math.abs(b)} = ${sgn(y0)}.`
        ].map(s => s.replace(/^(Then y = )1\(/, '$1(')),
        hint: HINT.pair,
        tier
      });
    }
  }

  function elimination(tier) {
    for (;;) {
      const x0 = nz(-6, 6);
      const y0 = nz(-6, 6);
      const a1 = nz(-5, 5);
      const b1 = nz(-5, 5);
      const a2 = nz(-5, 5);
      let b2, how, k = 1;
      if (tier === 1) {
        b2 = -b1;
        how = 'add';
      } else if (tier === 2) {
        b2 = b1;
        how = 'sub';
      } else {
        k = pick([2, 3, -2]);
        b2 = k * b1;
        how = 'mult';
      }
      if (a1 * b2 - a2 * b1 === 0) continue;
      const c1 = a1 * x0 + b1 * y0;
      const c2 = a2 * x0 + b2 * y0;

      const cands = [
        { id: 'sys_swap', value: [y0, x0] },
        { id: 'sys_ysign', value: [x0, -y0] },
        { id: 'sys_xsign', value: [-x0, y0] }
      ];
      const yFrom = xs => (c1 - a1 * xs) / b1;
      if (how === 'sub' && a1 - a2 !== 0) {
        const xs = (c1 + c2) / (a1 - a2);
        cands.push({ id: 'sys_elimsign', value: [xs, yFrom(xs)] });
      }
      if (how === 'add' && a1 + a2 !== 0) {
        const xs = (c1 - c2) / (a1 + a2);
        cands.push({ id: 'sys_elimsign', value: [xs, yFrom(xs)] });
      }
      if (how === 'mult' && k * a1 - a2 !== 0) {
        const xs = (c1 - c2) / (k * a1 - a2);
        cands.push({ id: 'sys_multconst', value: [xs, yFrom(xs)] });
      }

      let first;
      if (how === 'add') {
        first = `Add the equations so the y terms cancel: ${lin([[a1 + a2, 'x']])} = ${sgn(c1 + c2)}`;
      } else if (how === 'sub') {
        first = `Subtract the second equation from the first so the y terms cancel: ${lin([[a1 - a2, 'x']])} = ${sgn(c1 - c2)}`;
      } else {
        first = `Multiply the first equation by ${k}, then subtract the second: ${lin([[k * a1 - a2, 'x']])} = ${sgn(k * c1 - c2)}`;
      }

      return finish({
        format: 'pair',
        ask: 'Solve the system by elimination.',
        eq: `${lin([[a1, 'x'], [b1, 'y']])} = ${sgn(c1)}<br>${lin([[a2, 'x'], [b2, 'y']])} = ${sgn(c2)}`,
        answer: [x0, y0],
        answerHTML: pairHTML([x0, y0]),
        sample: `(${x0}, ${y0})`,
        cands,
        steps: [
          first,
          `So x = ${sgn(x0)}.`,
          `Put x back into the first equation and solve: y = ${sgn(y0)}.`
        ],
        hint: HINT.pair,
        tier
      });
    }
  }

  /* ---------------------------------------------------------------
     exponents and polynomials
     --------------------------------------------------------------- */

  const mono = (c, n) => ({ [n]: c });
  const xp = n => (n === 1 ? 'x' : `x<sup>${n}</sup>`);
  const monoHTML = (c, n) => (c === 1 ? '' : sgn(c)) + xp(n);

  function exprules(tier) {
    const kind = tier === 1
      ? pick(['prod', 'pow'])
      : tier === 2
        ? pick(['prod', 'pow', 'quot'])
        : pick(['prodc', 'powc', 'quot']);
    const a = ri(2, 6);
    const b = ri(2, 5);
    let eq, answer, cands, steps;

    if (kind === 'prod') {
      eq = `${xp(a)} · ${xp(b)}`;
      answer = mono(1, a + b);
      cands = [{ id: 'exp_mult', value: mono(1, a * b) }];
      steps = ['Same base, multiplying: add the exponents.', `${xp(a + b)}`];
    } else if (kind === 'prodc') {
      const c1 = ri(2, 5);
      const c2 = ri(2, 5);
      eq = `(${monoHTML(c1, a)})(${monoHTML(c2, b)})`;
      answer = mono(c1 * c2, a + b);
      cands = [
        { id: 'exp_mult', value: mono(c1 * c2, a * b) },
        { id: 'exp_coefadd', value: mono(c1 + c2, a + b) }
      ];
      steps = [`Multiply the numbers: ${c1} × ${c2} = ${c1 * c2}.`, `Add the exponents: ${a} + ${b} = ${a + b}.`, monoHTML(c1 * c2, a + b)];
    } else if (kind === 'pow') {
      eq = `(${xp(a)})<sup>${b}</sup>`;
      answer = mono(1, a * b);
      cands = [{ id: 'exp_add', value: mono(1, a + b) }];
      steps = ['A power of a power: multiply the exponents.', xp(a * b)];
    } else if (kind === 'powc') {
      const c = ri(2, 3);
      const e = ri(2, 3);
      eq = `(${monoHTML(c, a)})<sup>${e}</sup>`;
      answer = mono(c ** e, a * e);
      cands = [
        { id: 'exp_add', value: mono(c ** e, a + e) },
        { id: 'exp_coef', value: mono(c, a * e) },
        { id: 'exp_coefmult', value: mono(c * e, a * e) }
      ];
      steps = [`Raise the number to the power: ${c}<sup>${e}</sup> = ${c ** e}.`, `Multiply the exponents: ${a} × ${e} = ${a * e}.`, monoHTML(c ** e, a * e)];
    } else {
      eq = F(xp(a + b), xp(b));
      answer = mono(1, a);
      cands = [{ id: 'exp_quotadd', value: mono(1, a + 2 * b) }];
      if (Number.isInteger((a + b) / b)) cands.push({ id: 'exp_div', value: mono(1, (a + b) / b) });
      steps = ['Same base, dividing: subtract the exponents.', `${a + b} ${M} ${b} = ${a}, so ${xp(a)}.`];
    }

    return finish({
      format: 'expr',
      ask: 'Simplify.',
      eq,
      answer,
      answerHTML: polyHTML(answer),
      sample: polyText(answer),
      cands,
      steps,
      hint: HINT.expr,
      tier
    });
  }

  function addpoly(tier) {
    const coef = r => (tier === 1 ? ri(1, r) : nz(-r, r));
    const p1 = clean({ 2: coef(6), 1: coef(9), 0: coef(9) });
    const p2 = clean({ 2: coef(6), 1: coef(9), 0: coef(9) });
    const sub = tier > 1;
    const answer = padd(p1, p2, sub ? -1 : 1);

    const cands = [];
    if (sub) {
      cands.push({ id: 'poly_nodist', value: clean({ 2: (p1[2] || 0) - (p2[2] || 0), 1: (p1[1] || 0) + (p2[1] || 0), 0: (p1[0] || 0) + (p2[0] || 0) }) });
      cands.push({ id: 'poly_order', value: padd(p2, p1, -1) });
    }

    return finish({
      format: 'expr',
      ask: 'Simplify.',
      eq: `(${polyHTML(p1)}) ${sub ? M : '+'} (${polyHTML(p2)})`,
      answer,
      answerHTML: polyHTML(answer),
      sample: polyText(answer),
      cands,
      steps: [
        sub
          ? `Change the sign of every term in the second polynomial: ${polyHTML(p1)} + ${polyHTML(pmul(p2, { 0: -1 }))}`
          : `Drop the parentheses: ${polyHTML(p1)} + ${polyHTML(p2)}`,
        `Combine like terms: ${polyHTML(answer)}`
      ],
      hint: HINT.expr,
      tier
    });
  }

  function multpoly(tier) {
    if (tier === 3 && Math.random() < 0.5) {
      const b = nz(-6, 6);
      const answer = { 2: 1, 1: 2 * b, 0: b * b };
      return finish({
        format: 'expr',
        ask: 'Multiply.',
        eq: `(${lin([[1, 'x'], [b, '']])})<sup>2</sup>`,
        answer,
        answerHTML: polyHTML(answer),
        sample: polyText(answer),
        cands: [{ id: 'poly_square', value: { 2: 1, 0: b * b } }],
        steps: [
          `Write it out: (${lin([[1, 'x'], [b, '']])})(${lin([[1, 'x'], [b, '']])})`,
          `Multiply every pair: x<sup>2</sup> + ${lin([[b, 'x']])} + ${lin([[b, 'x']])} + ${b * b}`,
          polyHTML(answer)
        ],
        hint: HINT.expr,
        tier
      });
    }

    const a = tier === 1 ? 1 : ri(1, 3);
    const c = tier === 1 ? 1 : ri(1, 3);
    const b = tier === 1 ? ri(1, 6) : nz(-6, 6);
    const d = tier === 1 ? ri(1, 6) : nz(-6, 6);
    const answer = clean({ 2: a * c, 1: a * d + b * c, 0: b * d });
    const f1 = lin([[a, 'x'], [b, '']]);
    const f2 = lin([[c, 'x'], [d, '']]);

    return finish({
      format: 'expr',
      ask: 'Multiply.',
      eq: `(${f1})(${f2})`,
      answer,
      answerHTML: polyHTML(answer),
      sample: polyText(answer),
      cands: [
        { id: 'poly_foil', value: clean({ 2: a * c, 0: b * d }) },
        { id: 'poly_middle', value: clean({ 2: a * c, 1: a * d - b * c, 0: b * d }) },
        { id: 'poly_lastsign', value: clean({ 2: a * c, 1: a * d + b * c, 0: -b * d }) }
      ],
      steps: [
        `Multiply every term by every term: ${monoHTML(a * c, 2)}, ${lin([[a * d, 'x']])}, ${lin([[b * c, 'x']])}, ${sgn(b * d)}`,
        `Combine the x terms: ${polyHTML(answer)}`
      ],
      hint: HINT.expr,
      tier
    });
  }

  function factor(tier) {
    let p, q;
    do {
      p = tier === 1 ? ri(1, 7) : nz(-9, 9);
      q = tier === 1 ? ri(1, 7) : nz(-9, 9);
    } while (p === q || p === -q || (tier === 3 && Math.abs(p * q) < 12));

    const answer = { 2: 1, 1: p + q, 0: p * q };
    const factored = `(${lin([[1, 'x'], [p, '']])})(${lin([[1, 'x'], [q, '']])})`;

    return finish({
      format: 'factored',
      ask: 'Factor completely.',
      eq: polyHTML(answer),
      answer,
      answerHTML: factored,
      sample: plain(factored),
      cands: [{ id: 'fac_sign', value: { 2: 1, 1: -(p + q), 0: p * q } }],
      extra: v => (v.terms === 1 && v.factors >= 2 && near(v.p[0] || 0, p * q) && near(v.p[2] || 0, 1) ? 'fac_sum' : null),
      steps: [
        `Find two numbers that multiply to ${sgn(p * q)} and add to ${sgn(p + q)}: ${sgn(p)} and ${sgn(q)}.`,
        factored
      ],
      hint: HINT.factored,
      tier
    });
  }

  /* ---------------------------------------------------------------
     quadratics
     --------------------------------------------------------------- */

  function parabola(tier) {
    const h = nz(-4, 4);
    const k = nz(-4, 4);
    let a = 1, eq, cands, steps;

    if (tier < 3) {
      a = tier === 1 ? 1 : pick([1, -1]);
      eq = `y = ${a < 0 ? M : ''}(${lin([[1, 'x'], [-h, '']])})<sup>2</sup> ${k > 0 ? '+ ' + k : M + ' ' + -k}`;
      cands = [
        { id: 'par_hsign', value: [-h, k] },
        { id: 'par_ksign', value: [h, -k] },
        { id: 'par_swap', value: [k, h] }
      ];
      steps = [
        `Vertex form is y = a(x ${M} h)<sup>2</sup> + k, and the vertex is (h, k).`,
        `Here h = ${sgn(h)} and k = ${sgn(k)}, so the vertex is (${sgn(h)}, ${sgn(k)}).`
      ];
    } else {
      const b = -2 * h;
      const c = h * h + k;
      eq = `y = ${polyHTML(clean({ 2: 1, 1: b, 0: c }))}`;
      const wrongX = -h;
      cands = [
        { id: 'par_hsign', value: [wrongX, wrongX * wrongX + b * wrongX + c] },
        { id: 'par_swap', value: [k, h] }
      ];
      steps = [
        `The vertex is at x = ${M}b ÷ 2a = ${sgn(-b)} ÷ 2 = ${sgn(h)}.`,
        `Put x = ${sgn(h)} into the equation: y = ${sgn(k)}.`,
        `The vertex is (${sgn(h)}, ${sgn(k)}).`
      ];
    }

    return finish({
      format: 'point',
      ask: 'Tap the vertex of this parabola.',
      eq,
      board: {},
      answer: [h, k],
      answerHTML: `(${sgn(h)}, ${sgn(k)})`,
      sample: [h, k],
      cands,
      steps,
      after: () => ({
        board: {
          ...pointReplay([h, k]),
          paths: [{ d: parabolaPath(a, h, k), cls: 'ex-line draw', i: 1 }],
          aria: 'The parabola with its vertex marked'
        }
      }),
      tier
    });
  }

  function solvefactor(tier) {
    let r1, r2;
    do {
      r1 = nz(-8, 8);
      r2 = nz(-8, 8);
    } while (r1 === r2 || r1 === -r2);

    const f1 = lin([[1, 'x'], [-r1, '']]);
    const f2 = lin([[1, 'x'], [-r2, '']]);
    const expanded = polyHTML({ 2: 1, 1: -(r1 + r2), 0: r1 * r2 });

    const steps = [];
    if (tier > 1) steps.push(`Factor: (${f1})(${f2}) = 0`);
    steps.push(`Set each factor to zero: ${f1} = 0 or ${f2} = 0`);
    steps.push(`x = ${sgn(r1)} or x = ${sgn(r2)}`);

    return finish({
      format: 'list',
      ask: 'Solve. List every solution.',
      eq: tier === 1 ? `(${f1})(${f2}) = 0` : `${expanded} = 0`,
      answer: [r1, r2],
      answerHTML: `x = ${sgn(r1)} or x = ${sgn(r2)}`,
      sample: `${r1}, ${r2}`,
      cands: [
        { id: 'rt_sign', value: [-r1, -r2] },
        { id: 'rt_one', value: [r1] },
        { id: 'rt_one', value: [r2] }
      ],
      steps,
      hint: HINT.list,
      tier
    });
  }

  function quadform(tier) {
    for (;;) {
      const a = tier === 1 ? 1 : ri(1, 3);
      const b = nz(-9, 9);
      const c = nz(-9, 9);
      const D = b * b - 4 * a * c;
      if (D <= 0) continue;
      const sq = Math.sqrt(D);
      const perfect = Number.isInteger(sq);
      if (tier === 1 ? !perfect : perfect) continue;

      const roots = [(-b + sq) / (2 * a), (-b - sq) / (2 * a)];
      const cands = [
        { id: 'qf_negb', value: [(b + sq) / (2 * a), (b - sq) / (2 * a)] },
        { id: 'qf_2a', value: [(-b + sq) / a, (-b - sq) / a] }
      ];
      const D2 = b * b + 4 * a * c;
      if (D2 > 0) {
        cands.push({ id: 'qf_disc', value: [(-b + Math.sqrt(D2)) / (2 * a), (-b - Math.sqrt(D2)) / (2 * a)] });
      }

      const shown = roots.map(r => (perfect ? fmtNum(r) : sgn(+r.toFixed(2))));

      return finish({
        format: 'list',
        ask: perfect ? 'Solve with the quadratic formula.' : 'Solve with the quadratic formula. Round to the nearest hundredth.',
        eq: `${polyHTML(clean({ 2: a, 1: b, 0: c }))} = 0`,
        answer: roots,
        answerHTML: `x ${perfect ? '=' : '≈'} ${shown[0]} or x ${perfect ? '=' : '≈'} ${shown[1]}`,
        sample: roots.map(r => (perfect ? numText(r) : r.toFixed(2))).join(', '),
        tol: perfect ? 1e-9 : 0.0051,
        cands,
        steps: [
          `a = ${a}, b = ${sgn(b)}, c = ${sgn(c)}`,
          `b<sup>2</sup> ${M} 4ac = ${b * b} ${4 * a * c < 0 ? '+ ' + -4 * a * c : M + ' ' + 4 * a * c} = ${D}`,
          `x = (${sgn(-b)} ± √${D}) ÷ ${2 * a}`,
          `x ${perfect ? '=' : '≈'} ${shown[0]} or x ${perfect ? '=' : '≈'} ${shown[1]}`
        ],
        hint: perfect ? HINT.list : 'Round to the nearest hundredth, separated by commas, like 1.24, −3.24.',
        tier
      });
    }
  }

  /* ---------------------------------------------------------------
     functions
     --------------------------------------------------------------- */

  function funcnot(tier) {
    if (tier === 1) {
      const a = nz(-6, 6);
      const b = nz(-9, 9);
      const n = ri(1, 6);
      const ans = a * n + b;
      return finish({
        format: 'num',
        ask: `Find f(${n}).`,
        eq: `f(x) = ${lin([[a, 'x'], [b, '']])}`,
        answer: ans,
        answerHTML: `f(${n}) = ${sgn(ans)}`,
        sample: String(ans),
        cands: [
          { id: 'fn_sign', value: -a * n + b },
          { id: 'fn_add', value: a + n + b }
        ],
        steps: [
          `Replace x with ${n}: f(${n}) = ${sgn(a)}(${n}) ${b < 0 ? M : '+'} ${Math.abs(b)}`,
          `= ${sgn(a * n)} ${b < 0 ? M : '+'} ${Math.abs(b)} = ${sgn(ans)}`
        ],
        hint: HINT.num,
        tier
      });
    }

    const a = nz(-3, 3);
    const b = nz(-7, 7);
    const c = nz(-9, 9);
    const n = tier === 2 ? ri(1, 4) : -ri(1, 4);
    const ans = a * n * n + b * n + c;
    const op = v => (v < 0 ? M : '+');

    return finish({
      format: 'num',
      ask: `Find f(${sgn(n)}).`,
      eq: `f(x) = ${polyHTML(clean({ 2: a, 1: b, 0: c }))}`,
      answer: ans,
      answerHTML: `f(${sgn(n)}) = ${sgn(ans)}`,
      sample: String(ans),
      cands: [
        { id: 'fn_square', value: -a * n * n + b * n + c },
        { id: 'fn_coefsq', value: (a * n) ** 2 + b * n + c },
        { id: 'fn_sign', value: a * n * n - b * n + c }
      ],
      steps: [
        `Replace every x with (${sgn(n)}): ${lead(a)}(${sgn(n)})<sup>2</sup> ${op(b)} ${Math.abs(b)}(${sgn(n)}) ${op(c)} ${Math.abs(c)}`,
        `Square first: (${sgn(n)})<sup>2</sup> = ${n * n}.`,
        `${sgn(a * n * n)} ${op(b * n)} ${Math.abs(b * n)} ${op(c)} ${Math.abs(c)} = ${sgn(ans)}`
      ],
      hint: HINT.num,
      tier
    });
  }

  function domainrange(tier) {
    const count = tier + 2;
    const pairs = [];
    while (pairs.length < count) {
      const p = [ri(-6, 6), ri(-6, 6)];
      // tier 3 relations can repeat an x, which the domain lists once
      const clash = pairs.some(q => q[0] === p[0] && (tier < 3 || q[1] === p[1]));
      if (!clash) pairs.push(p);
    }

    const which = pick(['domain', 'range']);
    const xs = uniq(pairs.map(p => p[0]));
    const ys = uniq(pairs.map(p => p[1]));
    const answer = which === 'domain' ? xs : ys;
    const set = vals => `{${vals.map(sgn).join(', ')}}`;

    return finish({
      format: 'list',
      ask: `List the ${which} of this relation.`,
      eq: `{${pairs.map(([x, y]) => `(${sgn(x)}, ${sgn(y)})`).join(', ')}}`,
      answer,
      answerHTML: set(answer),
      sample: answer.join(', '),
      cands: [
        { id: 'dr_swap', value: which === 'domain' ? ys : xs },
        { id: 'dr_both', value: uniq([...xs, ...ys]) }
      ],
      steps: [
        `The ${which} is every ${which === 'domain' ? 'x' : 'y'}-value, the ${which === 'domain' ? 'first' : 'second'} number in each pair.`,
        `List each one once: ${set(answer)}`
      ],
      hint: 'Type each value once, separated by commas.',
      tier
    });
  }

  /* ---------------------------------------------------------------
     mistakes: what each diagnosis says to the student
     --------------------------------------------------------------- */

  const mistakes = {
    eq_wrongop: { label: 'Wrong inverse operation', tip: 'Undo what is happening to x. To undo adding, subtract. To undo multiplying, divide.' },
    eq_sign: { label: 'Sign slip', tip: 'Your answer has the right size but the wrong sign. Track each negative one step at a time.' },
    eq_flipdiv: { label: 'Divided the wrong way', tip: 'Divide the other side by the number next to x, not the other way around.' },
    eq_order: { label: 'Divided too early', tip: 'Undo adding or subtracting first, then divide. Dividing first means every term has to be divided.' },
    eq_addconst: { label: 'Moved a number the wrong way', tip: 'When a number moves to the other side, its operation flips. +5 on one side becomes −5 on the other.' },
    eq_nodist: { label: 'Didn’t distribute', tip: 'The number outside the parentheses multiplies every term inside, not just x.' },
    eq_negdist: { label: 'Negative not distributed', tip: 'A negative outside the parentheses changes the sign of every term inside.' },
    eq_combine: { label: 'Added the x terms', tip: 'To get the x terms on one side, subtract one from both sides. Adding them doubles up instead of canceling.' },
    lit_subtract: { label: 'Subtracted instead of divided', tip: 'The variables are multiplied together, so undo it by dividing.' },
    lit_partial: { label: 'Stopped one step early', tip: 'After subtracting, the variable still has a number multiplied on it. Divide by that too.' },
    lit_half: { label: 'Lost the 2', tip: 'Multiplying both sides by 2 clears the fraction. The 2 ends up on top, next to A.' },
    in_noflip: { label: 'Forgot to flip the sign', tip: 'When you multiply or divide both sides by a negative number, the inequality sign flips direction.' },
    in_flipwrong: { label: 'Flipped when you didn’t need to', tip: 'The sign only flips when you multiply or divide by a negative. Dividing by a positive keeps it the same.' },
    in_endpoint: { label: 'Wrong kind of endpoint', tip: 'Less than (<) leaves the number out. Less than or equal to (≤) includes it. Keep the kind the problem uses.' },
    in_middle: { label: 'Only changed the middle', tip: 'In a compound inequality, whatever you do to the middle you do to all three parts.' },
    abs_onecase: { label: 'Only one case', tip: 'Absolute value equations usually have two answers: the inside equals the number, or the inside equals its negative.' },
    abs_negdist: { label: 'Second case sign slip', tip: 'In the negative case, the whole inside equals the negative number. Solve x − 3 = −5, not −x − 3 = 5.' },
    abs_sign: { label: 'Wrong sign inside', tip: 'Check the sign of the number inside the bars when you solve each case.' },
    abs_isolate: { label: 'Didn’t isolate first', tip: 'Get the absolute value by itself on one side before splitting into two cases.' },
    sys_intercept: { label: 'Picked a y-intercept', tip: 'The solution is where the two lines cross each other, not where one line crosses the y-axis.' },
    sys_swap: { label: 'Swapped x and y', tip: 'Write points as (x, y): across first, then up or down.' },
    sys_ysign: { label: 'Sign slip on y', tip: 'Your x is right. Recheck the sign when you solve for y.' },
    sys_xsign: { label: 'Sign slip on x', tip: 'Your y is right. Recheck the sign when you solve for x.' },
    sys_subsign: { label: 'Substitution sign slip', tip: 'When you substitute an expression, put it in parentheses so the number in front multiplies every term.' },
    sys_elimsign: { label: 'Mixed adding and subtracting', tip: 'When you add or subtract the equations, do the same thing to every part, including the numbers on the right.' },
    sys_multconst: { label: 'Didn’t multiply the whole equation', tip: 'When you multiply an equation to line up a variable, multiply every term, including the number on the right.' },
    exp_mult: { label: 'Multiplied the exponents', tip: 'When you multiply powers with the same base, add the exponents. x² · x³ = x⁵.' },
    exp_add: { label: 'Added the exponents', tip: 'A power raised to a power multiplies the exponents. (x²)³ = x⁶.' },
    exp_coef: { label: 'Number not raised to the power', tip: 'The exponent outside the parentheses applies to the number too. (3x)² = 9x².' },
    exp_coefadd: { label: 'Added the numbers', tip: 'Multiply the numbers in front, and add the exponents.' },
    exp_coefmult: { label: 'Multiplied by the exponent', tip: 'Raising 3 to the 2nd power is 3 × 3 = 9, not 3 × 2 = 6.' },
    exp_div: { label: 'Divided the exponents', tip: 'When you divide powers with the same base, subtract the exponents.' },
    exp_quotadd: { label: 'Added the exponents', tip: 'Dividing powers with the same base means subtracting the exponents, not adding.' },
    poly_nodist: { label: 'Only the first term changed sign', tip: 'Subtracting a polynomial changes the sign of every term in it, not just the first.' },
    poly_order: { label: 'Subtracted in the wrong order', tip: 'Keep the first polynomial as it is and subtract the second one from it.' },
    poly_foil: { label: 'Missed the middle terms', tip: 'Every term in the first parentheses multiplies every term in the second. That gives four products, not two.' },
    poly_middle: { label: 'Sign slip in the middle term', tip: 'Recheck the signs on the outer and inner products before you combine them.' },
    poly_lastsign: { label: 'Sign slip on the last term', tip: 'A negative times a positive is negative. Recheck the product of the last terms.' },
    poly_square: { label: 'Squared each term separately', tip: '(x + 3)² means (x + 3)(x + 3), which has a middle term: x² + 6x + 9.' },
    fac_sign: { label: 'Signs flipped', tip: 'Multiply your factors back out. The middle term has the wrong sign, so both numbers need the opposite sign.' },
    fac_sum: { label: 'Right product, wrong sum', tip: 'Your numbers multiply to the last term, but they also need to add up to the middle number.' },
    fac_expanded: { label: 'Not factored', tip: 'That is the same polynomial written out. Factoring means writing it as a product, like (x + 2)(x + 3).' },
    par_hsign: { label: 'Wrong sign on h', tip: 'In y = (x − 3)², the vertex is at x = 3. The sign inside the parentheses is the opposite of the vertex’s x.' },
    par_ksign: { label: 'Wrong sign on k', tip: 'The number added at the end is the vertex’s y-value, with its sign as written.' },
    par_swap: { label: 'Swapped h and k', tip: 'The number inside the parentheses gives the x-value. The number outside gives the y-value.' },
    rt_sign: { label: 'Roots with the wrong sign', tip: 'Set each factor to zero. x − 3 = 0 gives x = 3, not −3.' },
    rt_one: { label: 'Missing a solution', tip: 'Each factor gives its own solution. Set both factors equal to zero.' },
    qf_negb: { label: 'Forgot the −b', tip: 'The formula starts with −b. If b is already negative, −b is positive.' },
    qf_2a: { label: 'Divided by a, not 2a', tip: 'The whole top is divided by 2a, twice the first number.' },
    qf_disc: { label: 'Discriminant sign slip', tip: 'Under the square root it is b² − 4ac. Watch the sign when c is negative.' },
    fn_square: { label: 'Squared a negative wrong', tip: 'A negative number squared is positive. (−3)² = 9.' },
    fn_coefsq: { label: 'Squared the number in front too', tip: 'In 2x², only x is squared. Square the input first, then multiply by 2.' },
    fn_sign: { label: 'Sign slip on the x term', tip: 'Multiply the number by the input with its sign. A negative times a negative is positive.' },
    fn_add: { label: 'Added instead of multiplied', tip: 'A number next to x means multiply. 3x with x = 2 is 3 × 2 = 6.' },
    dr_swap: { label: 'Domain and range swapped', tip: 'The domain is the x-values, the first number in each pair. The range is the y-values.' },
    dr_both: { label: 'Listed every number', tip: 'Only list one coordinate: x-values for the domain, y-values for the range.' },
    ps_xsign: { label: 'Sign slip on x₁', tip: 'In y − y₁ = m(x − x₁), the sign inside the parentheses is the opposite of the point’s x.' },
    ps_nodist: { label: 'Didn’t distribute the slope', tip: 'Multiply the slope by both terms inside the parentheses.' },
    ps_ysign: { label: 'Moved y₁ the wrong way', tip: 'To get y alone, undo what is next to y on the left side and do the same to the right side.' },
    std_nodiv: { label: 'Didn’t divide by the y number', tip: 'After moving the x term, divide every term by the number in front of y.' },
    std_sign: { label: 'Slope sign slip', tip: 'Moving Ax to the other side makes it −Ax, so the slope is −A ÷ B.' },
    pp_same: { label: 'Used the same slope', tip: 'Parallel lines share a slope. Perpendicular lines use the negative reciprocal: flip it and change the sign.' },
    pp_recip: { label: 'Flipped but kept the sign', tip: 'A perpendicular slope is the reciprocal with the opposite sign. 2 becomes −1/2.' },
    pp_neg: { label: 'Changed the sign but didn’t flip', tip: 'A perpendicular slope is flipped as well as negated. 2 becomes −1/2, not −2.' },
    pp_keptb: { label: 'Kept the old y-intercept', tip: 'The new line goes through a different point. Use that point to find its own b.' }
  };

  const topics = {
    writeeq, pointslope, standard: standardForm, parperp,
    onestep, twostep, multistep, bothsides, literal,
    ineq, compound, absval,
    sysgraph, substitution, elimination,
    exprules, addpoly, multpoly, factor,
    parabola, solvefactor, quadform,
    funcnot, domainrange
  };

  return { topics, mistakes, parse, diagnose, same };
})();
