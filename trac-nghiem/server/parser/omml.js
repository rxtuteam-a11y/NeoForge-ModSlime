// Chuyển công thức Word (OMML) sang LaTeX để hiển thị bằng KaTeX.
'use strict';

const SYM = {
  '≤': '\\le ', '≥': '\\ge ', '≠': '\\ne ', '±': '\\pm ', '∓': '\\mp ', '×': '\\times ', '÷': '\\div ',
  '·': '\\cdot ', '⋅': '\\cdot ', '∞': '\\infty ', '→': '\\to ', '←': '\\leftarrow ', '⇒': '\\Rightarrow ',
  '⇔': '\\Leftrightarrow ', '↔': '\\leftrightarrow ', '∈': '\\in ', '∉': '\\notin ', '⊂': '\\subset ',
  '⊃': '\\supset ', '⊆': '\\subseteq ', '⊇': '\\supseteq ', '∪': '\\cup ', '∩': '\\cap ', '∅': '\\emptyset ',
  '∀': '\\forall ', '∃': '\\exists ', '∂': '\\partial ', '∇': '\\nabla ', '≈': '\\approx ', '≡': '\\equiv ',
  '∼': '\\sim ', '≅': '\\cong ', '∝': '\\propto ', '⊥': '\\perp ', '∥': '\\parallel ', '∠': '\\angle ',
  '°': '^{\\circ}', '′': "'", '…': '\\ldots ', '⋯': '\\cdots ', '∑': '\\sum ', '∏': '\\prod ', '∫': '\\int ',
  '∬': '\\iint ', '∮': '\\oint ', '√': '\\surd ', 'α': '\\alpha ', 'β': '\\beta ', 'γ': '\\gamma ',
  'δ': '\\delta ', 'ε': '\\varepsilon ', 'ϵ': '\\epsilon ', 'ζ': '\\zeta ', 'η': '\\eta ', 'θ': '\\theta ',
  'ϑ': '\\vartheta ', 'ι': '\\iota ', 'κ': '\\kappa ', 'λ': '\\lambda ', 'μ': '\\mu ', 'ν': '\\nu ', 'ξ': '\\xi ',
  'π': '\\pi ', 'ρ': '\\rho ', 'σ': '\\sigma ', 'τ': '\\tau ', 'υ': '\\upsilon ', 'φ': '\\varphi ', 'ϕ': '\\phi ',
  'χ': '\\chi ', 'ψ': '\\psi ', 'ω': '\\omega ', 'Γ': '\\Gamma ', 'Δ': '\\Delta ', 'Θ': '\\Theta ',
  'Λ': '\\Lambda ', 'Ξ': '\\Xi ', 'Π': '\\Pi ', 'Σ': '\\Sigma ', 'Φ': '\\Phi ', 'Ψ': '\\Psi ', 'Ω': '\\Omega ',
  'ℝ': '\\mathbb{R}', 'ℕ': '\\mathbb{N}', 'ℤ': '\\mathbb{Z}', 'ℚ': '\\mathbb{Q}', 'ℂ': '\\mathbb{C}',
  '−': '-', '∗': '*', '⟨': '\\langle ', '⟩': '\\rangle ', '⌊': '\\lfloor ', '⌋': '\\rfloor ', '⌈': '\\lceil ',
  '⌉': '\\rceil ', '∘': '\\circ ', '△': '\\triangle ', '∆': '\\Delta ', '≺': '\\prec ', '≻': '\\succ ',
  '⃗': '', '{': '\\{', '}': '\\}', '%': '\\%', '#': '\\#', '&': '\\&', '_': '\\_', '$': '\\$', '\\': '\\backslash ',
  '\u00a0': '~', '\u2009': '\\,', '\u200b': '',
};

const FUNCS = new Set(['sin', 'cos', 'tan', 'tg', 'cot', 'cotg', 'log', 'ln', 'lg', 'exp', 'lim', 'max', 'min', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'det', 'sup', 'inf']);

function escText(s) {
  let out = '';
  for (const ch of s) out += SYM[ch] !== undefined ? SYM[ch] : ch;
  return out;
}

function kids(node) {
  const r = [];
  if (!node || !node.childNodes) return r;
  for (let i = 0; i < node.childNodes.length; i++) {
    const c = node.childNodes[i];
    if (c.nodeType === 1) r.push(c);
  }
  return r;
}
function child(node, name) { return kids(node).find((k) => k.nodeName === name) || null; }
function prop(node, prName, valName) {
  const pr = child(node, prName);
  if (!pr) return null;
  const v = child(pr, valName);
  if (!v) return null;
  return v.getAttribute('m:val');
}

function group(s) {
  s = s.trim();
  if (s.length === 1 || /^\\[a-zA-Z]+\s*$/.test(s) || /^\d+$/.test(s)) return s.length === 1 ? s : `{${s}}`;
  return `{${s}}`;
}

function conv(node) {
  if (!node) return '';
  return kids(node).map(convNode).join('');
}

function convNode(n) {
  switch (n.nodeName) {
    case 'm:r': {
      let t = '';
      for (const k of kids(n)) if (k.nodeName === 'm:t' || k.nodeName === 'w:t') t += k.textContent;
      const sty = (() => { const rpr = child(n, 'm:rPr'); const s = rpr && child(rpr, 'm:sty'); return s && s.getAttribute('m:val'); })();
      const nor = (() => { const rpr = child(n, 'm:rPr'); return !!(rpr && child(rpr, 'm:nor')); })();
      const raw = t.trim();
      if (FUNCS.has(raw)) return `\\${raw === 'tg' ? 'tan' : raw === 'cotg' ? 'cot' : raw} `;
      if (nor || (sty === 'p' && /[A-Za-zÀ-ỹ]{2,}/.test(t) && /\s|[À-ỹ]/.test(t))) return `\\text{${t.replace(/[{}\\]/g, '')}}`;
      if (/[À-ỹĐđ]/.test(t)) return `\\text{${t.replace(/[{}\\]/g, '')}}`;
      return escText(t);
    }
    case 'm:f': {
      const type = prop(n, 'm:fPr', 'm:type');
      const num = conv(child(n, 'm:num')), den = conv(child(n, 'm:den'));
      if (type === 'lin') return `${group(num)}/${group(den)}`;
      if (type === 'noBar') return `\\genfrac{}{}{0pt}{}{${num}}{${den}}`;
      return `\\frac{${num}}{${den}}`;
    }
    case 'm:sSup': return `${group(conv(child(n, 'm:e')))}^{${conv(child(n, 'm:sup'))}}`;
    case 'm:sSub': return `${group(conv(child(n, 'm:e')))}_{${conv(child(n, 'm:sub'))}}`;
    case 'm:sSubSup': return `${group(conv(child(n, 'm:e')))}_{${conv(child(n, 'm:sub'))}}^{${conv(child(n, 'm:sup'))}}`;
    case 'm:sPre': return `{}_{${conv(child(n, 'm:sub'))}}^{${conv(child(n, 'm:sup'))}}${group(conv(child(n, 'm:e')))}`;
    case 'm:rad': {
      const deg = conv(child(n, 'm:deg')).trim();
      const e = conv(child(n, 'm:e'));
      return deg ? `\\sqrt[${deg}]{${e}}` : `\\sqrt{${e}}`;
    }
    case 'm:d': {
      const pr = child(n, 'm:dPr');
      const get = (name, def) => {
        if (!pr) return def;
        const c = child(pr, name);
        if (!c) return def;
        const v = c.getAttribute('m:val');
        return v == null ? def : v;
      };
      const beg = get('m:begChr', '('), end = get('m:endChr', ')'), sep = get('m:sepChr', '|');
      const parts = kids(n).filter((k) => k.nodeName === 'm:e').map(conv);
      const fix = (c, left) => {
        if (c === '') return '.';
        if (c === '{') return '\\{';
        if (c === '}') return '\\}';
        if (c === '⟨' || c === '〈') return '\\langle';
        if (c === '⟩' || c === '〉') return '\\rangle';
        if (c === '‖') return '\\|';
        if (c === '⌊') return '\\lfloor';
        if (c === '⌋') return '\\rfloor';
        if (c === '⌈') return '\\lceil';
        if (c === '⌉') return '\\rceil';
        if (c === '[' || c === ']' || c === '(' || c === ')' || c === '|') return c;
        return left ? '(' : ')';
      };
      // Hệ phương trình { ... (một bên)
      if (beg === '{' && end === '' && parts.length === 1 && /\\\\/.test(parts[0]) && /\\begin\{matrix\}|\\begin\{array\}/.test(parts[0]) === false) {
        return `\\begin{cases}${parts[0]}\\end{cases}`;
      }
      return `\\left${fix(beg, true)}${parts.join(sep === '|' ? '\\mid ' : escText(sep))}\\right${fix(end, false)}`;
    }
    case 'm:nary': {
      const pr = child(n, 'm:naryPr');
      let chr = '∫';
      if (pr) {
        const c = child(pr, 'm:chr');
        if (c) chr = c.getAttribute('m:val') || '∫';
      }
      const map = { '∑': '\\sum', '∏': '\\prod', '∫': '\\int', '∬': '\\iint', '∭': '\\iiint', '∮': '\\oint', '⋃': '\\bigcup', '⋂': '\\bigcap' };
      const op = map[chr] || escText(chr);
      const sub = conv(child(n, 'm:sub')).trim(), sup = conv(child(n, 'm:sup')).trim();
      return `${op}${sub ? `_{${sub}}` : ''}${sup ? `^{${sup}}` : ''}{${conv(child(n, 'm:e'))}}`;
    }
    case 'm:func': {
      const name = conv(child(n, 'm:fName')).trim();
      return `${name}{${conv(child(n, 'm:e'))}}`;
    }
    case 'm:limLow': return `${conv(child(n, 'm:e'))}_{${conv(child(n, 'm:lim'))}}`;
    case 'm:limUpp': return `${conv(child(n, 'm:e'))}^{${conv(child(n, 'm:lim'))}}`;
    case 'm:acc': {
      let chr = '̂';
      const pr = child(n, 'm:accPr');
      if (pr) { const c = child(pr, 'm:chr'); if (c) chr = c.getAttribute('m:val') || chr; }
      const e = conv(child(n, 'm:e'));
      const m = { '⃗': '\\overrightarrow', '→': '\\overrightarrow', '̂': '\\widehat', '^': '\\widehat', '̄': '\\overline', '¯': '\\overline', '̃': '\\widetilde', '~': '\\widetilde', '̇': '\\dot', '̈': '\\ddot', '⃖': '\\overleftarrow', '̌': '\\check' };
      return `${m[chr] || '\\hat'}{${e}}`;
    }
    case 'm:bar': {
      const pos = prop(n, 'm:barPr', 'm:pos');
      return `${pos === 'bot' ? '\\underline' : '\\overline'}{${conv(child(n, 'm:e'))}}`;
    }
    case 'm:groupChr': {
      const e = conv(child(n, 'm:e'));
      const chr = prop(n, 'm:groupChrPr', 'm:chr') || '⏟';
      const pos = prop(n, 'm:groupChrPr', 'm:pos');
      if (chr === '→' || chr === '⟶') return `\\xrightarrow{${e}}`;
      return pos === 'top' ? `\\overbrace{${e}}` : `\\underbrace{${e}}`;
    }
    case 'm:m': {
      const rows = kids(n).filter((k) => k.nodeName === 'm:mr').map((r) => kids(r).filter((k) => k.nodeName === 'm:e').map(conv).join(' & '));
      return `\\begin{matrix}${rows.join(' \\\\ ')}\\end{matrix}`;
    }
    case 'm:eqArr': {
      const rows = kids(n).filter((k) => k.nodeName === 'm:e').map(conv);
      return `\\begin{matrix}${rows.join(' \\\\ ')}\\end{matrix}`.replace('\\begin{matrix}', '\\begin{aligned}').replace('\\end{matrix}', '\\end{aligned}').replace(/&/g, '');
    }
    case 'm:box': case 'm:borderBox': case 'm:phant': case 'm:e': case 'm:oMath': case 'm:num': case 'm:den':
    case 'm:sub': case 'm:sup': case 'm:deg': case 'm:lim': case 'm:fName':
      return conv(n);
    case 'm:oMathPara': return kids(n).filter((k) => k.nodeName === 'm:oMath').map(conv).join(' \\\\ ');
    case 'w:r': {
      let t = '';
      for (const k of kids(n)) if (k.nodeName === 'w:t') t += k.textContent;
      return t ? `\\text{${t.replace(/[{}\\]/g, '')}}` : '';
    }
    default:
      if (/Pr$/.test(n.nodeName)) return '';
      return conv(n);
  }
}

function ommlToLatex(node) {
  let s = node.nodeName === 'm:oMathPara' ? convNode(node) : conv(node);
  // Hệ phương trình: \left\{ \begin{aligned} ... \right.
  s = s.replace(/\\left\\\{\s*\\begin\{aligned\}([\s\S]*?)\\end\{aligned\}\s*\\right\./g, '\\begin{cases}$1\\end{cases}');
  s = s.replace(/\\left\\\{\s*\\begin\{matrix\}([\s\S]*?)\\end\{matrix\}\s*\\right\./g, '\\begin{cases}$1\\end{cases}');
  s = s.replace(/\\left\[\s*\\begin\{(?:aligned|matrix)\}([\s\S]*?)\\end\{(?:aligned|matrix)\}\s*\\right\./g, '\\left[\\begin{aligned}$1\\end{aligned}\\right.');
  return s.replace(/\s+/g, ' ').trim();
}

module.exports = { ommlToLatex };
