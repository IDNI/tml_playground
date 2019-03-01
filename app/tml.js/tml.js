require=(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
// LICENSE
// This software is free for use and redistribution while including this
// license notice, unless:
// 1. is used for commercial or non-personal purposes, or
// 2. used for a product which includes or associated with a blockchain or other
// decentralized database technology, or
// 3. used for a product which includes or associated with the issuance or use
// of cryptographic or electronic currencies/coins/tokens.
// On all of the mentioned cases, an explicit and written permission is required
// from the Author (Ohad Asor).
// Contact ohad@idni.org for requesting a permission. This license may be
// modified over time by the Author.
// Author of the Javascript rewrite: Tomáš Klapka <tomas@klapka.cz>

"use strict";

// DEFAULT OPTIONS
const options = {
	memoization: true,
	recursive: false
}
let bdds = null; // bdds class (to be loaded when required)
// debug functions
// internal counters for every bdd and apply call
const _counters = { bdds: 0, apply: 0 };

// node in a bdd tree
class node {
	// initialize node
	constructor(varid, hi, lo) {
		this.v  = varid;
		this.hi = hi;
		this.lo = lo;
	}
	// clones the node object
	clone() { return new node(this.v, this.hi, this.lo); }
	// key used for "map" of nodes, or for debugging
	get key() { return `${this.v}:${this.hi}/${this.lo}`; }
}

// bdds base class
class bdds_base {
	// F=0 and T=1 consants
	static get F() { return 0; }
	static get T() { return 1; }
	// initialize bdds
	constructor(nvars) {
		this._id = ++_counters.bdds;
		this.V = [];          // all nodes
		this.M = {};          // node to its index
		this.nvars = nvars;   // number of vars
		this.offset = 0;
		// used for implicit power
		this.pdim = 1;
		this.ndim = 0;
		this.root = 0;        // root of bdd
		this.maxbdd = 0;
		// initialize bdd with 0 and 1 terminals
		this.add_nocheck(new node(0, 0, 0));
		this.add_nocheck(new node(0, 1, 1));
	}
	static flip(n) {
		if (bdds_base.leaf(n)) return bdds_base.trueleaf(n) ? new node(0,0,0) : new node (0,1,1);
		const nn = n.clone();
		if (bdds_base.leaf(nn.hi)) nn.hi = bdds_base.trueleaf(nn.hi) ? bdds_base.F : bdds_base.T;
		if (bdds_base.leaf(nn.lo)) nn.lo = bdds_base.trueleaf(nn.lo) ? bdds_base.F : bdds_base.T;
		return nn;
	}
	// checks if node is terminal (leaf)
	static leaf(n) {
		const res = n instanceof node
			? n.v === 0
			: n === bdds_base.T || n === bdds_base.F;
		return res;
	}
	// checks if node is terminal and is T
	static trueleaf(n) {
		const res = n instanceof node
			? bdds_base.leaf(n) && (n.hi > 0)
			: n === bdds_base.T;
		return res;
	}
	shift(n) {
		const nn = n.clone();
		if (!bdds_base.leaf(nn)) { nn.v += this.offset; }
		return nn;
	}
	// set virtual power
	setpow(root, p, n, maxw, offset) {
		this.root = root;
		this.pdim = p;
		this.ndim = n;
		this.offset = offset;
		this.maxbdd = 1<<(Math.floor(32/maxw));
		return this.root;
	}
	// add node directly without checking
	add_nocheck(n) {
		const r = this.V.length;
		this.M[n.key] = r;
		this.V.push(n);
		return r;
	}
	// adds new node
	add(n) {
		let r = null;
		let _dbg = '';
		do {
			if (n.v > this.nvars) {
				throw Error('Node id too big.');
			}
			if (n.hi === n.lo) {
				r = n.hi;
				break;
			}
			if (this.M.hasOwnProperty(n.key)) {
				r = this.M[n.key];
				break;
			}
			r = this.add_nocheck(n);
			_dbg = ' nocheck'
		} while (0);
		return r;
	}
	// returns node by its index
	getnode(nid) {
		if (this.pdim === 1 && this.ndim === 0) {
			const r = this.shift(this.V[nid])
			return r;
		}
		if (this.pdim === 0 && this.ndim === 1) {
			const r = this.shift(bdds_base.leaf(nid) ? this.V[nid] : bdds_base.flip(this.V[nid]));
			return r;
		}
		const m = nid % this.maxbdd;
		const d = Math.floor(nid / this.maxbdd);
		const n = d < this.pdim ? this.V[m].clone() : (bdds_base.leaf(m) ? this.V[m].clone() : bdds_base.flip(this.V[m]));
		if (n.v > 0) n.v += this.nvars * d;
		if (bdds_base.trueleaf(n.hi)) {
			if (d < this.pdim+this.ndim-1) {
				n.hi = this.root + this.maxbdd * (d + 1);
			}
		} else {
			if (!bdds_base.leaf(n.hi)) {
				n.hi = n.hi + this.maxbdd * d;
			}
		}
		if (bdds_base.trueleaf(n.lo)) {
			if (d < this.pdim+this.ndim-1) {
				n.lo = this.root + this.maxbdd * (d + 1);
			}
		} else {
			if (!bdds_base.leaf(n.lo)) {
				n.lo = n.lo + this.maxbdd * d;
			}
		}
		// _dbg_apply(`        ` + `this.maxbdd:${this.maxbdd} this.nvars:`, this.nvars);
		return this.shift(n);
	}
	// returns bdd's length = number of nodes
	get length() { return this.V.length; }
}

// bdds class with recursive algos
class bdds_rec extends bdds_base {
	constructor(nvars) {
		super(nvars);
		if (options.memoization) this.memos_clear();
	}
	sat(v, nvars, n, p, r) {
		if (bdds.leaf(n) && !bdds.trueleaf(n)) return;
		if (v > nvars+1) throw new Error(`(v = ${v}) > (nvars+1 = ${nvars+1})`);
		if (v < n.v) {
			p[v-1] = true;
			this.sat(v+1, nvars, n, p, r);
			p[v-1] = false;
			this.sat(v+1, nvars, n, p, r);
		} else {
			if (v !== nvars+1) {
				p[v-1] = true;
				this.sat(v+1, nvars, this.getnode(n.hi), p, r);
				p[v-1] = false;
				this.sat(v+1, nvars, this.getnode(n.lo), p, r);
			}	else {
				r.push(p.slice());
			}
		}
	}
	allsat(x, nvars) {
		const p = Array(nvars).fill(false); const r = [];
		this.sat(1, nvars, this.getnode(x), p, r)
		return r;
	}
	from_bit(x, v) {
		const n = v === true || v > 0
			? new node(x + 1, bdds_base.T, bdds_base.F)
			: new node(x + 1, bdds_base.F, bdds_base.T);
		const res = this.add(n);
		return res;
	}
	// if-then-else operator
	ite(v, t, e) {
		const x = this.getnode(t);
		const y = this.getnode(e);
		if ((bdds.leaf(x) || v < x.v)
		&&  (bdds.leaf(y) || v < y.v)) {
			return this.add(new node(v + 1, t, e));
		}
		const hi = this.bdd_and(this.from_bit(v, true), t);
		const lo = this.bdd_and(this.from_bit(v, false), e);
		return this.bdd_or(hi, lo);
	}
	copy(b, x) {
		if (bdds.leaf(x)) return x;
		let t;
		if (options.memoization) {
			t = b._id+'.'+x;
			if (this.memo_copy.hasOwnProperty(t)) {
				return this.memo_copy[t];
			}
		}
		const n = b.getnode(x);
		const hi = this.copy(b, n.hi);
		const lo = this.copy(b, n.lo);
		const res = this.add(new node(n.v, hi, lo));
		if (options.memoization) this.memo_copy[t] = res;
		return res;
	}
	delhead(x, h) {
		if (bdds.leaf(x)) {
			return x;
		}
		const n = this.getnode(x).clone();
		if (n.v > h) {
			return x;
		}
		const hi = this.delhead(n.hi, h);
		const lo = this.delhead(n.lo, h);
		const r = this.bdd_or(hi, lo);
		return r;
	}

	static apply_and(src, x, dst, y) {
		const apply_id = ++_counters.apply;
		let t;
		let apply_ret = r => r;
		if (options.memoization) {
			t = `${dst._id}.${x}.${y}`;
			apply_ret = (r, m) => { m[t] = r; return r; }
			if (src.memo_and.hasOwnProperty(t)) {
				return src.memo_and[t];
			}
		}
		const xn = src.getnode(x).clone();
		if (bdds.leaf(xn)) {
			const r = bdds.trueleaf(xn) ? y : bdds.F;
			return apply_ret(r, src.memo_and);
		}
		const yn = dst.getnode(y).clone();
		if (bdds.leaf(yn)) {
			const r = !bdds.trueleaf(yn)
				? bdds.F
				: (src === dst ? x : dst.copy(src, x));
			return apply_ret(r, src.memo_and);
		}
		let v;
		if (((xn.v === 0) && (yn.v > 0))
		|| ((yn.v > 0) && (xn.v > yn.v))) {
			v = yn.v;
			xn.hi = x;
			xn.lo = x;
		} else {
			if (xn.v === 0) {
				const r = (a && b) ? bdds.T : bdds.F;
				return apply_ret(r, src.memo_and);
			} else {
				v = xn.v;
				if ((v < yn.v) || yn.v === 0) {
					yn.hi = y;
					yn.lo = y;
				}
			}
		}
		const hi  = bdds.apply_and(src, xn.hi, dst, yn.hi);
		const lo = bdds.apply_and(src, xn.lo, dst, yn.lo);
		const r = dst.add(new node(v, hi, lo));
		return apply_ret(r, src.memo_and);
	}

	static apply_and_not(src, x, dst, y) {
		const apply_id = ++_counters.apply;
		let t;
		let apply_ret = r => r;
		if (options.memoization) {
			t = `${dst._id}.${x}.${y}`;
			apply_ret = (r, m) => { m[t] = r; return r; }
			if (src.memo_and.hasOwnProperty(t)) {
				return src.memo_and[t];
			}
		}
		const xn = src.getnode(x).clone();
		if (bdds.leaf(xn) && !bdds.trueleaf(xn)) {
			return apply_ret(bdds.F, src.memo_and_not);
		}
		const yn = dst.getnode(y).clone(); // copy from src?
		if (bdds.leaf(yn)) {
			const r = bdds.trueleaf(yn)
				? bdds.F
				: (src === dst ? x : dst.copy(src, x));
			return apply_ret(r, src.memo_and_not);
		}
		let v;
		if (((xn.v === 0) && (yn.v > 0))
		|| ((yn.v > 0) && (xn.v > yn.v))) {
			v = yn.v;
			xn.hi = x;
			xn.lo = x;
		} else {
			if (xn.v === 0) {
				const r = (a && !b) ? bdds.T : bdds.F;
				return apply_ret(r, src.memo_and_not);
			} else {
				v = xn.v;
				if ((v < yn.v) || yn.v === 0) {
					yn.hi = y;
					yn.lo = y;
				}
			}
		}
		const hi  = bdds.apply_and_not(src, xn.hi, dst, yn.hi);
		const lo = bdds.apply_and_not(src, xn.lo, dst, yn.lo);
		const r = dst.add(new node(v, hi, lo));
		return apply_ret(r, src.memo_and_not);
	}

	static apply_or(src, x, dst, y) {
		const apply_id = ++_counters.apply;
		let t;
		let apply_ret = r => r;
		if (options.memoization) {
			t = `${dst._id}.${x}.${y}`;
			apply_ret = (r, m) => { m[t] = r; return r; }
			if (src.memo_or.hasOwnProperty(t)) {
				return src.memo_or[t];
			}
		}
		const xn = src.getnode(x).clone();
		if (bdds.leaf(xn)) {
			const r = bdds.trueleaf(xn) ? bdds.T : y;
			return apply_ret(r, src.memo_or);
		}
		const yn = dst.getnode(y).clone();
		if (bdds.leaf(yn)) {
			const r = bdds.trueleaf(yn)
				? bdds.T
				: (src === dst ? x : dst.copy(src, x));
			return apply_ret(r, src.memo_or);
		}
		let v;
		if (((xn.v === 0) && (yn.v > 0))
		|| ((yn.v > 0) && (xn.v > yn.v))) {
			v = yn.v;
			xn.hi = x;
			xn.lo = x;
		} else {
			if (xn.v === 0) {
				const r = (a && b) ? bdds.T : bdds.F;
				return apply_ret(r, src.memo_or);
			} else {
				v = xn.v;
				if ((v < yn.v) || yn.v === 0) {
					yn.hi = y;
					yn.lo = y;
				}
			}
		}
		const hi  = bdds.apply_or(src, xn.hi, dst, yn.hi);
		const lo = bdds.apply_or(src, xn.lo, dst, yn.lo);
		const r = dst.add(new node(v, hi, lo));
		return apply_ret(r, src.memo_or);
	}
	// helper constructors
	from_eq(x, y) { // a bdd saying "x=y"
		const res = this.bdd_or(
			this.bdd_and(this.from_bit(y, false), this.from_bit(x, false)),
			this.bdd_and(this.from_bit(y, true),  this.from_bit(x, true)));
		return res;
	}
	from_bits(x, bits, ar, w) {
		const BIT = (term, arg, b) => (term*ar+arg)*bits+b;
		const s = this.allsat(x, bits * ar * w);
		const r = Array(s.length);
		for (let k = 0; k < r.length; k++) {
			r[k] = Array(w * ar).fill(0);
		}
		let n = 0;
		for (let z = 0; z < s.length; z++) {
			for (let j = 0; j != w; ++j) {
				for (let i = 0; i != ar; ++i) {
					for (let b = 0; b != bits; ++b) {
						if (s[z][BIT(j, i, b)] > 0) {
							r[n][j * ar + i] |= 1 << b;
						}
					}
				}
			}
			++n;
		}
		return r;
	}
	bdd_or(x, y) { return bdds.apply_or(this, x, this, y); }
	bdd_and(x, y) { return bdds.apply_and(this, x, this, y); }
	bdd_and_not(x, y) { return bdds.apply_and_not(this, x, this, y); }
	memos_clear() {
		if (!options.memoization) return;
		this.memo_and = {};
		this.memo_and_not = {};
		this.memo_or = {};
		this.memo_copy = {};
	}
}

module.exports = (o = {}) => {
	options.memoization = o.hasOwnProperty('memoization')
		? o.memoization
		: options.memoization;
	options.recursive = o.hasOwnProperty('recursive')
		? o.recursive
		: options.recursive;
	// load rec or non rec version of bdds class
	bdds = options.recursive ? bdds_rec : require('./bdds_non_rec');
	bdds.node = node;
	bdds.bdds_rec = bdds_rec;
	bdds.bdds_base = bdds_base;
	bdds.options = options;
	return bdds
}

},{"./bdds_non_rec":2}],2:[function(require,module,exports){
// LICENSE
// This software is free for use and redistribution while including this
// license notice, unless:
// 1. is used for commercial or non-personal purposes, or
// 2. used for a product which includes or associated with a blockchain or other
// decentralized database technology, or
// 3. used for a product which includes or associated with the issuance or use
// of cryptographic or electronic currencies/coins/tokens.
// On all of the mentioned cases, an explicit and written permission is required
// from the Author (Ohad Asor).
// Contact ohad@idni.org for requesting a permission. This license may be
// modified over time by the Author.
// Author of the Javascript rewrite: Tomáš Klapka <tomas@klapka.cz>

"use strict";

const bdds = require('./bdds')({ recursive:false });
const { bdds_rec, node } = bdds;

// debug functions
// JS enum emulated by freezing the object
const _enum = obj => Object.freeze(obj);

// traversing states enum
const s = _enum({ "LO": 1, "HI": 2, "OP": 3 });

// extending bdds class for non recursive algos
class bdds_non_rec extends bdds_rec {
	// apply unary (ie. op_exists(existentials))
	static apply_unary(b, x, r, op) {
		const get = id => op.eval(b, id); // evaluates the operator
		const parents = [];        // path from root to the current node
		let ts = s.LO;                    // current traversing state
		let n = get(x);                   // current node
		let nn = bdds_non_rec.F;          // new node
		let high = bdds_non_rec.F;        // last high leaf
		let low = bdds_non_rec.F;         // last low leaf
		do {                              // traversing the binary tree
			if (ts === s.LO) {                  // search low
				if(bdds_non_rec.leaf(n.lo)) {
					low = n.lo;    // remember last low leaf
					ts = s.HI;     // leaf, go search high
				} else {               // not a leaf
					parents.push(n); // store parent
					n = get(n.lo); // go low (and search low)
				}
			} else if (ts === s.HI) {      // search high
				if (bdds_non_rec.leaf(n.hi)) {
					high = n.hi;   // remember last high leaf
					ts = s.OP;     // leaf, do op
				} else {               // not a leaf
					parents.push(n); // store parent
					n = get(n.hi); // go high
					ts = s.LO;     // and search low
				}
			} else if (ts === s.OP) {     // do op and go UP
				nn = r.add(new node(n.v, high, low));
				if (parents.length === 0)
					break; // we are back at the top -> break inf. loop
				n = parents.pop(); // go up
				if (nn === n.lo) { // if we operated on low
					low = nn; ts = s.HI;  // set new low and go high
				} else {           // else we operated on high already
					high = nn; ts = s.OP; // set new high and go op
				}
			}
		} while (true);
		return nn; // return the last new node
	}
}

module.exports = bdds_non_rec;

},{"./bdds":1}],3:[function(require,module,exports){
// LICENSE
// This software is free for use and redistribution while including this
// license notice, unless:
// 1. is used for commercial or non-personal purposes, or
// 2. used for a product which includes or associated with a blockchain or other
// decentralized database technology, or
// 3. used for a product which includes or associated with the issuance or use
// of cryptographic or electronic currencies/coins/tokens.
// On all of the mentioned cases, an explicit and written permission is required
// from the Author (Ohad Asor).
// Contact ohad@idni.org for requesting a permission. This license may be
// modified over time by the Author.
// Author of the Javascript rewrite: Tomáš Klapka <tomas@klapka.cz>

"use strict";

// DEFAULT OPTIONS
const options = {
	recursive: false, // use rec or non rec algos
}
let bdds = null; // bdds class (to be loaded when required)
// load helper function for exporting bdds to dot, svg and/or png
// const { bdd_out } = require('./util');

// debug functions
// internal counter for lps (lp._id)
const _counters = { lp: 0 };

// messages
const identifier_expected     = `Identifier expected`;
const term_expected           = `Term expected`;
const comma_dot_sep_expected  = `',', '.' or ':-' expected`;
const sep_expected            = `Term or ':-' or '.' expected`;
const unexpected_char         = `Unexpected char`;

// skip_ws or skip 1 or more characters from parsing input
const skip_ws = s           => { s.s = s.s.replace(/^\s+/, ''); };
const skip    = (s, n = 1)  => { s.s = s.s.slice(n); }

// dict represents strings as unique integers
class dict {
	// pad = 0 constant
	static get pad() { return 0; }
	// nsyms = number of stored symbols
	get nsyms() { return this.syms.length; }
	// returns bit size of the dictionary
	get bits() { return 32 - Math.clz32(this.syms.length-1); }
	// initialize symbols and variables tables
	constructor() {
		this.syms = [ dict.pad ];
		this.vars = [ dict.pad ];
	}
	// gets and remembers the identifier and returns it's unique index
	// positive indexes are for symbols and negative indexes are for vars
	get(s) {
		if (typeof(s) === 'number') {     // if s is number
			const r = s >= 0 ? this.syms[s] : this.vars[-s];
			return r;                 //     return symbol by index
		}
		if (s[0] === '?') {               // if s is variable
			const p = this.vars.indexOf(s);
			if (p >= 0) {             //     if variable already in dict
				return -p;        //        return its index negated
			}
			this.vars.push(s);        //     else store the variable in dict
			return -(this.vars.length-1); //     and return its index negated
		}
		const p = this.syms.indexOf(s);   // if s is symbol
		if (p >= 0) {                     //     if is symbol in dict
			return p;                 //         return its index
		}
		this.syms.push(s);                //     else store the symbol in dict
		return this.syms.length-1;        //         and return its index
	}
}

function get_range(bdd, i, j, s, bits, ar) {
	const BIT = (term, arg, b) => (term*ar+arg)*bits+b;
	let rng = bdds.F;
	for (let k = 1; k != s; ++k) {
		let elem = bdds.T;
		for (let b = 0; b != bits; ++b) {
			elem = bdd.bdd_and(elem, bdd.from_bit(BIT(i, j, b), k & (1 << b)));
		}
		rng = bdd.bdd_or(rng, elem);
	}
	return rng;
}

function from_term(bdd, i, s, bits, ar, v, r, m) {
	const BIT = (term, arg, b) => (term*ar+arg)*bits+b;
	let b = bits;
	v.shift();
	for (let j = 0; j != v.length; ++j) {
		if (v[j] < 0) {
			r.hsym = bdd.bdd_and(r.hsym, get_range(bdd, i , j, s, bits, ar));
			if (m.hasOwnProperty(v[j])) {
				while (b-- > 0) {
					r.hsym = bdd.bdd_and(r.hsym, bdd.from_eq(
						BIT(i, j, b),
						BIT(m[v[j]][0], m[v[j]][1], b)));
				}
			} else {
				m[v[j]] = [ i, j ];
			}
		} else {
			while (b-- > 0) {
				r.h = bdd.bdd_and(r.h, bdd.from_bit(BIT(i, j, b), (v[j] & (1 << b)) > 0));
			}
		}
		b = bits;
	}
}
// a P-DATALOG rule in bdd form
class rule {
	// initialize rule
	constructor(bdd, v, bits, ar, dsz) {
		this.neg =  false;
		this.h = bdds.T;   // bdd root
		this.hsym = bdds.T;
		this.npos = 0;
		this.nneg = 0;
		this.neg = v[0][0] < 0;
		const m = {};
		const t = [];
		for (let i = 1; i != v.length; ++i) { if (v[i][0] > 0) { ++this.npos; t.push(v[i].slice()); } }
		for (let i = 1; i != v.length; ++i) { if (v[i][0] < 0) { ++this.nneg; t.push(v[i].slice()); } }
		t.push(v[0].slice());
		v = t;
		for (let i = 0; i != v.length; ++i) {
			from_term(bdd, i, dsz, bits, ar, v[i], this, m);
		}
		if (v.length == 1) {
			this.h = bdd.bdd_and(this.h, this.hsym);
		}
	}

	step(p) {
		p.dbs.setpow(p.db, this.npos, this.nneg, p.maxw, 0);
		const x = bdds.apply_and(p.dbs, p.db, p.prog, this.h);
		const y = p.prog.bdd_and(x, this.hsym);
		const z = p.prog.delhead(y, (this.npos + this.nneg) * p.bits * p.ar);
		p.dbs.setpow(p.db, 1, 0, p.maxw, 0);
		return z;
	}
}

// [pfp] logic program
class lp {
	constructor() {
		this._id = ++_counters.lp;
		// holds its own dict so we can determine the universe size
		this.d = new dict();
		this.dbs = null;     // db bdd (as db has virtual power)
		this.prog = null;    // prog bdd
		this.db = bdds.F;    // db's bdd root
		this.rules = [];     // p-datalog rules
		this.ar = 0;         // arity
		this.maxw = 0;       // number of bodies in db
		this.bits = 0;       // bitsize
	}
	// parse a string and returns its dict id
	str_read(s) {
		const _dbg = s.s.slice(0, s.s.indexOf(`\n`));
		let _dbg_match;
		let r = null;
		s.s = s.s.replace(/^\s*(\??[\w|\d]+)\s*/, (_, t) => {
			r = this.d.get(t);
			return '';   // remove match from input
		})
		if (!r) {
			throw new Error(identifier_expected);
		}
		return r;
	}
	// read raw term (no bdd)
	term_read(s) {
		const _dbg = s.s.slice(0, s.s.indexOf(`\n`));
		let r = [];
		skip_ws(s);
		if (s.s.length === 0) {
			return r;
		}
		let b;
		if (s.s[0] === '~') {
			b = -1;
			skip(s); skip_ws(s);
		} else {
			b = 1;
		}
		r.push(b);
		let i = 0;
		do {
			const c = s.s[i];
			if (/\s/.test(c)) i++;
			else {
				if (c === ',') {
					if (r.length === 1) {
						throw new Error(term_expected);
					}
					skip(s, ++i);
					return r;
				}
				if (c === '.' || c === ':') {
					if (r.length === 1) {
						throw new Error(term_expected);
					}
					skip(s, i);
					return r;
				}
				r.push(this.str_read(s)); i = 0;
			}
		} while (i < s.s.length);
		throw new Error(comma_dot_sep_expected);
	}
	// read raw rule (no bdd)
	rule_read(s) {
		const _dbg = s.s.slice(0, s.s.indexOf(`\n`));
		let t, r = [];
		if ((t = this.term_read(s)).length === 0) {
			return r;
		}
		r.push(t);
		skip_ws(s);
		if (s.s[0] === '.') { // fact
			skip(s);
			return r;
		}
		if (s.s.length < 2 || (s.s[0] !== ':' && s.s[1] !== '-')) {
			throw new Error (sep_expected);
		}
		skip(s, 2);
		do {
			if ((t = this.term_read(s)).length === 0) {
				throw new Error(term_expected);
			}
			r.push(t);
			skip_ws(s);
			if (s.s[0] === '.') {
				skip(s);
				return r;
			}
			if (s.s[0] === ':') {
				throw new Error(unexpected_char);
			};
		} while (true);
	}
	// parses prog
	prog_read(prog) {
		const s   = { s: prog }; // source into string to parse
		this.ar   = 0;           // arity
		this.maxw = 0;           // number of rules
		this.db   = bdds.F;      // set db root to 0
		let l, r  = [];          // length and rules

		for (let t; !((t = this.rule_read(s)).length === 0); r.push(t)) {
			let i = 0;
			for (let x = t[0]; i < t.length; x = t[++i]) {
				this.ar = Math.max(this.ar, x.length - 1);
			}
			this.maxw = Math.max(this.maxw, t.length - 1);
		}
		for (let i = 0; i < r.length; i++) {
			for (let j = 0; j < r[i].length; j++) {
				l = r[i][j].length;
				if (l < (this.ar+1)) {
					r[i][j] = r[i][j]
						.concat(Array(this.ar + 1 - l).fill(dict.pad));
				}
			}
		}

		this.bits = this.d.bits;
		this.dbs = new bdds(this.ar * this.bits);
		this.prog = new bdds((this.maxw + 1) * this.ar * this.bits);

		for (let i = 0; i < r.length; i++) {
			const x = JSON.parse(JSON.stringify(r[i])); // clone through JSON
			if (x.length === 1) {
				this.db = this.dbs.bdd_or(this.db,
					new rule(this.dbs, x, this.bits, this.ar, this.d.nsyms).h);
			} else {
				this.rules.push(
					new rule(this.prog, x, this.bits, this.ar, this.d.nsyms));
			}
		}


		return r; // return raw rules/facts;
	}
	// single pfp step
	step() {
		let add = bdds.F;
		let del = bdds.F;
		for (let i = 0; i < this.rules.length; i++) {
			const r = this.rules[i];
			const x = r.step(this);
			this.prog.setpow(x, 1, 0, 1, -(r.npos + r.nneg) * this.bits * this.ar);
			const t = bdds.apply_or(this.prog, x, this.dbs, r.neg ? del : add);
			if (r.neg) { del = t; } else { add = t; }
			this.prog.setpow(x, 1, 0, 1, 0);
			this.dbs.memos_clear();
			this.prog.memos_clear();
		}
		let s = this.dbs.bdd_and_not(add, del);
		if (s === bdds.F && add !== bdds.F) {
			this.db = bdds.F; // detect contradiction
		} else {
			this.db = this.dbs.bdd_or(this.dbs.bdd_and_not(this.db, del), s);
		}
	}
	// pfp logic
	pfp() {
		let d;                       // current db root
		let t = 0;                   // step counter
		const s = [];                // db roots of previous steps
		do {
			d = this.db;         // get current db root
			s.push(d);           // store current db root into steps
			this.step();         // do pfp step
			// if db root already resulted from previous step
			if (s.includes(this.db)) {
				// this.printdb();
				// return true(sat) or false(unsat)
				return d === this.db;
			}
		} while (true);
	}
	// prints db (bdd -> tml facts)
	printdb(os) {
		console.log(out(os, this.dbs, this.db, this.bits, this.ar, this.dbs.pdim+this.dbs.ndim, this.d));
		if (!os) {
			const o = { dot: true, svg: false };
			// bdd_out(this.dbs, this.d, o);
			// bdd_out(this.prog, this.d, o);
		}
	}
	toString() {
		return out('', this.dbs, this.db, this.bits, this.ar, this.dbs.pdim+this.dbs.ndim, this.d);
	}
}
// removes comments
function string_read_text(data) {
	let s = '', skip = false;
	for (let n = 0; n < data.length; n++) {
		const c = data[n];
		if (c === '#') skip = true;
		else if (c === `\r` || c === `\n`) { skip = false; s += c; }
		else if (!skip) s += c;
	}
	return s;
}
// output content (TML facts) from the db
function out(os, b, db, bits, ar, w, d) {
	os = os || '';
	const t = b.from_bits(db, bits, ar, w);
	const s = [];
	for (let i = 0; i < t.length; i++) {
		const v = t[i];
		let ss = '';
		for (let j = 0; j < v.length; j++) {
			const k = v[j];
			if (k === 0) ss += '* ';
			else if (k < d.nsyms) ss += d.get(k) + ' ';
			else ss += `[${k}]`;
		}
		s.push(ss.slice(0, -1) + '.');
	}
	os += s.sort().join(`\n`);
	return os;
}

module.exports = (o = {}) => {
	options.recursive = o.hasOwnProperty('recursive')
		? o.recursive
		: options.recursive;
	// load rec or non_rec version of bdds class
	bdds = require('./bdds')(options);
	lp.bdds = bdds;
	lp.dict = dict;
	lp.rule = rule;
	lp.options = options
	lp.string_read_text = string_read_text;
	lp.out = out;
	return lp;
}

},{"./bdds":1}],4:[function(require,module,exports){
(function (process){
// LICENSE
// This software is free for use and redistribution while including this
// license notice, unless:
// 1. is used for commercial or non-personal purposes, or
// 2. used for a product which includes or associated with a blockchain or other
// decentralized database technology, or
// 3. used for a product which includes or associated with the issuance or use
// of cryptographic or electronic currencies/coins/tokens.
// On all of the mentioned cases, an explicit and written permission is required
// from the Author (Ohad Asor).
// Contact ohad@idni.org for requesting a permission. This license may be
// modified over time by the Author.
// Author of the Javascript rewrite: Tomáš Klapka <tomas@klapka.cz>

"use strict";

// DEFAULT OPTIONS
const options = {
	recursive: true, // set to false to use bdds_non_rec
}

const lp = require("./lp")(options);

// loads string from stream
function load_stream(stream) {
	return new Promise((resolve, reject) => {
		let r = '';                         // resulting string
		stream.on('readable', () => {       // if we can read
			let chunk;
			while ((chunk = stream.read()) !== null)
				r += chunk;                 // add stream chunks to string
		});
		stream.on('end', () => resolve(r)); // resolve string
		stream.on('error', reject);         // reject if error
	});
}

// main
async function main() {
	let s = null;
	//// input for IDE debugging (avoids configuration of stdin)
	// s = "e 1 2. e 2 3. e 3 1. e ?x ?y :- e ?x ?z, e ?z ?y.";
	// s = "father Tom Amy. parent ?X ?Y :- father ?X ?Y.";
	// s = "1 2. 2 1. ?x ?y :- ?y ?x.";
	// s = "1 2. 3 4. ?x ?y :- ?y ?x.";
	// unless s, read source from stdin
	if (s === null) {
		try {
			process.stdin.setEncoding('utf8');
			s = lp.string_read_text(await load_stream(process.stdin));
		} catch (err) {   // stdin read error
			console.log('Read error:', err);
			return 4;
		}
	}
	const p = new lp(); // p = logic program
	try {
		p.prog_read(s); // parse source from s
	} catch (err) {
		console.log('Parse error:', err);
		return 3;
	}
	let r = false;
	try {
		r = p.pfp();    // run pfp logic program
	} catch (err) {
		console.log('PFP error', err);
		return 2;
	}
	console.log(r ? p.toString() : 'unsat');

	return r ? 0 : 1;
}

module.exports = { lp, main };

}).call(this,require('_process'))

},{"./lp":3,"_process":5}],5:[function(require,module,exports){
// shim for using process in browser
var process = module.exports = {};

// cached from whatever global is present so that test runners that stub it
// don't break things.  But we need to wrap it in a try catch in case it is
// wrapped in strict mode code which doesn't define any globals.  It's inside a
// function because try/catches deoptimize in certain engines.

var cachedSetTimeout;
var cachedClearTimeout;

function defaultSetTimout() {
    throw new Error('setTimeout has not been defined');
}
function defaultClearTimeout () {
    throw new Error('clearTimeout has not been defined');
}
(function () {
    try {
        if (typeof setTimeout === 'function') {
            cachedSetTimeout = setTimeout;
        } else {
            cachedSetTimeout = defaultSetTimout;
        }
    } catch (e) {
        cachedSetTimeout = defaultSetTimout;
    }
    try {
        if (typeof clearTimeout === 'function') {
            cachedClearTimeout = clearTimeout;
        } else {
            cachedClearTimeout = defaultClearTimeout;
        }
    } catch (e) {
        cachedClearTimeout = defaultClearTimeout;
    }
} ())
function runTimeout(fun) {
    if (cachedSetTimeout === setTimeout) {
        //normal enviroments in sane situations
        return setTimeout(fun, 0);
    }
    // if setTimeout wasn't available but was latter defined
    if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
        cachedSetTimeout = setTimeout;
        return setTimeout(fun, 0);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedSetTimeout(fun, 0);
    } catch(e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
            return cachedSetTimeout.call(null, fun, 0);
        } catch(e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error
            return cachedSetTimeout.call(this, fun, 0);
        }
    }


}
function runClearTimeout(marker) {
    if (cachedClearTimeout === clearTimeout) {
        //normal enviroments in sane situations
        return clearTimeout(marker);
    }
    // if clearTimeout wasn't available but was latter defined
    if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
        cachedClearTimeout = clearTimeout;
        return clearTimeout(marker);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedClearTimeout(marker);
    } catch (e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
            return cachedClearTimeout.call(null, marker);
        } catch (e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error.
            // Some versions of I.E. have different rules for clearTimeout vs setTimeout
            return cachedClearTimeout.call(this, marker);
        }
    }



}
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    if (!draining || !currentQueue) {
        return;
    }
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = runTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    runClearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        runTimeout(drainQueue);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;
process.prependListener = noop;
process.prependOnceListener = noop;

process.listeners = function (name) { return [] }

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],"tml":[function(require,module,exports){
"use strict";

module.exports = require('./build/tml.js');

},{"./build/tml.js":4}]},{},[])
//# sourceMappingURL=tml.js.map.js
