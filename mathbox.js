/* mathbox.js
   a small math answer box. typing / stacks a fraction, ^ raises an
   exponent, and the arrow keys move in and out of both, the way a
   graphing calculator's input works.

   the answer is kept as a tree:
     row  = { items: [...], up: null or { row, node } }
     item = { c: 'x' }                 one typed character
          | { sup: row }               an exponent
          | { num: row, den: row }     a fraction
   and the cursor is a row plus a position in it

   usage:
     const st = MathBox.create()
     MathBox.mount(el, st, { onChange, onEnter, label, describedby, placeholder })
     MathBox.text(st)    the answer as plain text the parsers read, e.g. (x+1)/2
     MathBox.html(st)    the answer drawn without a cursor, for "you wrote"
     MathBox.focus(el)

   keys typed on a phone arrive as input events, not key presses, so the
   hidden text box always holds one invisible character. when it goes
   missing, the student pressed backspace
*/

const MathBox = (() => {
  const SENT = '​';
  const OPS = '+-=<>≤≥,';
  const SUP_IN = '⁰¹²³⁴⁵⁶⁷⁸⁹';

  const row = up => ({ items: [], up });

  function create() {
    const root = row(null);
    return { root, cur: { row: root, i: 0 } };
  }

  // which slot a row is: 'root', 'sup', 'num' or 'den'
  function slotOf(r) {
    if (!r.up) return 'root';
    const n = r.up.node;
    if (n.sup === r) return 'sup';
    return n.num === r ? 'num' : 'den';
  }

  const isOp = it => it && it.c !== undefined && OPS.includes(it.c);

  // a "(" in this row that hasn't been closed yet
  function openParen(r, upto) {
    let depth = 0;
    for (let k = 0; k < upto; k++) {
      const c = r.items[k].c;
      if (c === '(') depth++;
      if (c === ')') depth = Math.max(0, depth - 1);
    }
    return depth > 0;
  }

  /* ---------------------------------------------------------------
     cursor moves
     --------------------------------------------------------------- */

  // put the cursor just after the node that holds this row
  function exitRight(st) {
    const { row: r } = st.cur;
    const { row: parent, node } = r.up;
    if (node.num === r) {
      st.cur = { row: node.den, i: 0 };
      return;
    }
    st.cur = { row: parent, i: parent.items.indexOf(node) + 1 };
  }

  function exitLeft(st) {
    const { row: r } = st.cur;
    const { row: parent, node } = r.up;
    if (node.den === r) {
      st.cur = { row: node.num, i: node.num.items.length };
      return;
    }
    st.cur = { row: parent, i: parent.items.indexOf(node) };
  }

  function left(st) {
    const { row: r, i } = st.cur;
    if (i > 0) {
      const prev = r.items[i - 1];
      if (prev.sup) st.cur = { row: prev.sup, i: prev.sup.items.length };
      else if (prev.den) st.cur = { row: prev.den, i: prev.den.items.length };
      else st.cur.i--;
    } else if (r.up) {
      exitLeft(st);
    }
  }

  function right(st) {
    const { row: r, i } = st.cur;
    if (i < r.items.length) {
      const next = r.items[i];
      if (next.sup) st.cur = { row: next.sup, i: 0 };
      else if (next.num) st.cur = { row: next.num, i: 0 };
      else st.cur.i++;
    } else if (r.up) {
      exitRight(st);
    }
  }

  function upDown(st, dir) {
    // only fractions have an up and a down
    let r = st.cur.row;
    while (r.up) {
      const n = r.up.node;
      if (dir === 'down' && n.num === r) { st.cur = { row: n.den, i: Math.min(st.cur.i, n.den.items.length) }; return; }
      if (dir === 'up' && n.den === r) { st.cur = { row: n.num, i: Math.min(st.cur.i, n.num.items.length) }; return; }
      r = r.up.row;
    }
  }

  /* ---------------------------------------------------------------
     typing
     --------------------------------------------------------------- */

  function insertNode(st, node) {
    const { row: r, i } = st.cur;
    r.items.splice(i, 0, node);
    st.cur.i++;
  }

  function moveItems(items, to) {
    for (const it of items) {
      if (it.sup) it.sup.up.row = to;
      if (it.num) { it.num.up.row = to; it.den.up.row = to; }
    }
    return items;
  }

  function typeChar(st, ch) {
    if (/[−–—]/.test(ch)) ch = '-';
    if (ch === '×') ch = '*';

    // a pasted superscript digit, like the 2 in x²
    const s = SUP_IN.indexOf(ch);
    if (s >= 0) {
      const prev = st.cur.row.items[st.cur.i - 1];
      if (!(prev && prev.sup)) typeChar(st, '^');
      else st.cur = { row: prev.sup, i: prev.sup.items.length };
      typeChar(st, String(s));
      exitRight(st);
      return;
    }

    // an operator or space ends a short exponent or denominator, so
    // x^2+3x reads the way it was meant. parentheses keep it open: x^(n+1)
    if (OPS.includes(ch) || ch === ' ') {
      while (st.cur.row.up) {
        const r = st.cur.row;
        const slot = slotOf(r);
        if (slot !== 'sup' && slot !== 'den') break;
        if (!r.items.length || openParen(r, r.items.length)) break;
        st.cur = { row: r, i: r.items.length };
        exitRight(st);
      }
    }
    if (ch === ' ') return;

    // a letter after a plain number in an exponent or denominator steps
    // out first, so 1/2x is ½x and x^2y is x²y. write 1/(2x) for the other
    if (/[a-z]/i.test(ch)) {
      const r0 = st.cur.row;
      const slot = slotOf(r0);
      const allDigits = r0.items.length && r0.items.every(it => it.c !== undefined && /[0-9.]/.test(it.c));
      if ((slot === 'sup' || slot === 'den') && allDigits && st.cur.i === r0.items.length) exitRight(st);
    }

    const { row: r, i } = st.cur;
    const prev = r.items[i - 1];

    // <= and >= become ≤ and ≥
    if (ch === '=' && prev && (prev.c === '<' || prev.c === '>')) {
      prev.c = prev.c === '<' ? '≤' : '≥';
      return;
    }

    if (ch === '^') {
      if (prev && prev.sup) {
        st.cur = { row: prev.sup, i: prev.sup.items.length };
        return;
      }
      const node = {};
      node.sup = row({ row: r, node });
      insertNode(st, node);
      st.cur = { row: node.sup, i: 0 };
      return;
    }

    if (ch === '/') {
      // the numerator is the term just before the cursor: back to the
      // last operator, or a whole (group)
      let j = i;
      let depth = 0;
      while (j > 0) {
        const it = r.items[j - 1];
        if (it.c === ')') depth++;
        else if (it.c === '(') {
          if (depth === 0) break;
          depth--;
        } else if (depth === 0 && isOp(it)) break;
        j--;
      }
      // a minus sign in front stays outside, so −3/4 is minus three quarters
      let grabbed = r.items.splice(j, i - j);
      const first = grabbed[0];
      const last = grabbed[grabbed.length - 1];
      if (first && last && first.c === '(' && last.c === ')' && grabbed.length > 1) {
        // (x+1)/2: the parentheses only grouped the numerator
        let d = 0;
        let wraps = true;
        for (let k = 0; k < grabbed.length - 1; k++) {
          if (grabbed[k].c === '(') d++;
          if (grabbed[k].c === ')') d--;
          if (d === 0) { wraps = false; break; }
        }
        if (wraps) grabbed = grabbed.slice(1, -1);
      }
      const node = {};
      node.num = row({ row: r, node });
      node.den = row({ row: r, node });
      node.num.items = moveItems(grabbed, node.num);
      r.items.splice(j, 0, node);
      st.cur = node.num.items.length ? { row: node.den, i: 0 } : { row: node.num, i: 0 };
      return;
    }

    if (!/^[0-9a-zA-Z.+\-*()=<>≤≥,]$/.test(ch)) return;
    insertNode(st, { c: ch });
  }

  function backspace(st) {
    const { row: r, i } = st.cur;
    if (i > 0) {
      const prev = r.items[i - 1];
      if (prev.sup) {
        if (!prev.sup.items.length) { r.items.splice(i - 1, 1); st.cur.i--; }
        else st.cur = { row: prev.sup, i: prev.sup.items.length };
      } else if (prev.num) {
        st.cur = { row: prev.den, i: prev.den.items.length };
      } else {
        r.items.splice(i - 1, 1);
        st.cur.i--;
      }
      return;
    }
    if (!r.up) return;

    // at the start of a slot: take the box apart and keep what was in it
    const { row: parent, node } = r.up;
    const at = parent.items.indexOf(node);
    let inner;
    let caret;
    if (node.sup) {
      inner = moveItems(node.sup.items, parent);
      caret = at;
    } else {
      inner = moveItems([...node.num.items, ...node.den.items], parent);
      caret = at + node.num.items.length;
    }
    parent.items.splice(at, 1, ...inner);
    st.cur = { row: parent, i: caret };
  }

  /* ---------------------------------------------------------------
     reading the answer back
     --------------------------------------------------------------- */

  const simple = s => /^-?\d+(\.\d+)?$/.test(s) || /^[a-z]$/i.test(s);

  // true when the whole string is one (group), so it needs no more parentheses
  function grouped(s) {
    if (s[0] !== '(' || s[s.length - 1] !== ')') return false;
    let d = 0;
    for (let k = 0; k < s.length - 1; k++) {
      if (s[k] === '(') d++;
      if (s[k] === ')') d--;
      if (d === 0) return false;
    }
    return true;
  }
  const wrap = s => (simple(s) || grouped(s) ? s : '(' + s + ')');

  function rowText(r) {
    let out = '';
    r.items.forEach((it, k) => {
      if (it.c !== undefined) {
        out += it.c;
      } else if (it.sup) {
        const b = rowText(it.sup);
        out += '^' + wrap(b);
      } else {
        const n = rowText(it.num) || '0';
        const d = rowText(it.den) || '0';
        let f = wrap(n) + '/' + wrap(d);
        // 2 next to ½ must not read as 21/2
        const before = r.items[k - 1];
        if (before && !isOp(before) && before.c !== '(') f = '(' + f + ')';
        out += f;
      }
    });
    return out;
  }

  const text = st => rowText(st.root);
  const isEmpty = st => !st.root.items.length;

  /* ---------------------------------------------------------------
     drawing
     --------------------------------------------------------------- */

  const SHOW = { '-': '−', '*': '·', '<': '&lt;', '>': '&gt;' };

  // spots is filled with every place a tap can put the cursor
  function drawRow(r, st, spots) {
    const caretHere = st && st.cur.row === r;
    let s = '';
    const caret = () => (caretHere ? '<span class="mcaret"></span>' : '');

    if (!r.items.length) {
      if (caretHere) return caret();
      const n = spots ? spots.push({ row: r, i: 0 }) - 1 : -1;
      return r.up ? `<span class="mempty"${n >= 0 ? ` data-n="${n}"` : ''}></span>` : '';
    }

    r.items.forEach((it, k) => {
      if (caretHere && st.cur.i === k) s += caret();
      if (it.c !== undefined) {
        const n = spots ? spots.push({ row: r, i: k }) - 1 : -1;
        const op = isOp(it) && !(it.c === '-' && (k === 0 || isOp(r.items[k - 1]) || r.items[k - 1].c === '('));
        s += `<span class="mc${op ? ' mop' : ''}"${n >= 0 ? ` data-n="${n}"` : ''}>${SHOW[it.c] || it.c}</span>`;
      } else if (it.sup) {
        s += `<span class="msup">${drawRow(it.sup, st, spots)}</span>`;
      } else {
        s += `<span class="mfrac"><span class="mnum">${drawRow(it.num, st, spots)}</span>` +
          `<span class="mden">${drawRow(it.den, st, spots)}</span></span>`;
      }
    });
    if (caretHere && st.cur.i === r.items.length) s += caret();
    return s;
  }

  const html = st => `<span class="mview">${drawRow(st.root, null, null) || ''}</span>`;

  /* ---------------------------------------------------------------
     the box on the page
     --------------------------------------------------------------- */

  function mount(el, st, opts = {}) {
    el.classList.add('mbox');
    el.innerHTML = `<input class="min" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" ` +
      `aria-label="${opts.label || 'Your answer'}" ${opts.describedby ? `aria-describedby="${opts.describedby}"` : ''}>` +
      `<span class="mview" aria-hidden="true"></span>`;
    const input = el.querySelector('.min');
    const view = el.querySelector('.mview');
    let spots = [];

    const draw = () => {
      spots = [];
      const body = drawRow(st.root, st, spots);
      const ph = isEmpty(st) && document.activeElement !== input && opts.placeholder
        ? `<span class="mph">${opts.placeholder}</span>` : '';
      view.innerHTML = body + ph;
      // a long answer scrolls sideways, so keep the cursor in sight
      const caret = view.querySelector('.mcaret');
      if (caret) {
        const box = view.getBoundingClientRect();
        const c = caret.getBoundingClientRect();
        if (c.right > box.right - 4) view.scrollLeft += c.right - box.right + 4;
        if (c.left < box.left + 4) view.scrollLeft -= box.left + 4 - c.left;
      }
      // screen readers hear the plain-text answer
      input.setAttribute('aria-valuetext', text(st));
      input.title = text(st);
    };

    const changed = () => {
      draw();
      if (opts.onChange) opts.onChange(text(st));
    };

    const reset = () => {
      input.value = SENT;
      input.setSelectionRange(1, 1);
    };

    const readInput = () => {
      const v = input.value;
      if (!v.includes(SENT)) {
        // the invisible character was deleted: a backspace
        backspace(st);
        for (const ch of v) typeChar(st, ch);
      } else {
        for (const ch of v.replace(SENT, '')) typeChar(st, ch);
      }
      reset();
      changed();
    };

    input.addEventListener('input', e => { if (!e.isComposing) readInput(); });
    input.addEventListener('compositionend', readInput);

    input.addEventListener('keydown', e => {
      if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
      const keys = {
        Backspace: () => backspace(st),
        ArrowLeft: () => left(st),
        ArrowRight: () => right(st),
        ArrowUp: () => upDown(st, 'up'),
        ArrowDown: () => upDown(st, 'down'),
        Home: () => { st.cur = { row: st.root, i: 0 }; },
        End: () => { st.cur = { row: st.root, i: st.root.items.length }; }
      };
      if (e.key === 'Enter') {
        e.preventDefault();
        if (opts.onEnter) opts.onEnter();
        return;
      }
      if (keys[e.key]) {
        e.preventDefault();
        keys[e.key]();
        reset();
        changed();
      }
    });

    input.addEventListener('paste', e => {
      e.preventDefault();
      const t = (e.clipboardData || window.clipboardData).getData('text');
      for (const ch of t) typeChar(st, ch);
      changed();
    });

    input.addEventListener('focus', () => { el.classList.add('on'); reset(); draw(); });
    input.addEventListener('blur', () => { el.classList.remove('on'); draw(); });

    // a tap goes to the nearest character: before it on its left half,
    // after it on its right half
    el.addEventListener('pointerdown', e => {
      const hit = e.target.closest('[data-n]');
      if (hit) {
        const spot = spots[+hit.dataset.n];
        const box = hit.getBoundingClientRect();
        const after = hit.classList.contains('mc') && e.clientX > box.left + box.width / 2;
        st.cur = { row: spot.row, i: spot.i + (after ? 1 : 0) };
      } else if (e.target === el || e.target === view) {
        st.cur = { row: st.root, i: st.root.items.length };
      }
      e.preventDefault();
      input.focus();
      draw();
    });

    reset();
    draw();
  }

  function focus(el, options) {
    const input = el && el.querySelector('.min');
    if (input) input.focus(options);
  }

  return { create, mount, text, html, focus, isEmpty, _type: typeChar, _back: backspace, _left: left, _right: right };
})();
