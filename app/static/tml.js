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
// internal counters for every bdds, apply calls and ops.
const _counters = { bdds: 0, apply: 0, apply_and_ex: 0, op: 0 };

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

// op class wrapping evaluation function and helper _dbg string
class op {
	constructor(_eval, _dbg) {
		this.eval = _eval;
		this._dbg = _dbg;
		this._id = ++_counters.op;
	}
}
// operators, to be used with apply()
const op_and      = new op((x, y) =>
	((x || x>0) && ( y || y>0))   ? bdds_base.T : bdds_base.F, '&&');
const op_and_not  = new op((x, y) =>
	((x || x>0) && (!y || y===0)) ? bdds_base.T : bdds_base.F, '&&!');
const op_or       = new op((x, y) =>
	((x || x>0) || ( y || y>0))   ? bdds_base.T : bdds_base.F, '||');
// existential quantification (initialize with s = existentials)
const op_exists   = s => new op((b, x) => {
	// operator evaluation, b = bdd, x = node's index
	const n = b.getnode(x);
	if ((n.v > 0) && (n.v <= s.length) && s[n.v-1]) {
		return b.getnode(b.bdd_or(n.hi, n.lo));
	}
	return n;
}, 'exists?');

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
		this.dim = 1;         // used for implicit power
		this.nvars = nvars;   // number of vars
		this.root = 0;        // root of bdd
		this.maxbdd = 0;      // used for implicit power
		// initialize bdd with 0 and 1 terminals
		this.add_nocheck(new node(0, 0, 0));
		this.add_nocheck(new node(0, 1, 1));
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
	// set virtual power
	setpow(root, dim, maxw) {
		this.root = root;
		this.dim = dim;
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
		if (this.dim === 1) return this.V[nid];
		// dim > 1 ...
		const m = nid % this.maxbdd;
		const d = Math.floor(nid / this.maxbdd);
		const n = this.V[m].clone(); // this damn clone!!!
		if (n.v > 0) n.v += this.nvars * d;
		if (bdds.trueleaf(n.hi)) {
			if (d < this.dim-1) {
				n.hi = this.root + this.maxbdd * (d + 1);
			}
		} else {
			if (!bdds.leaf(n.hi)) {
				n.hi = n.hi + this.maxbdd * d;
			}
		}
		if (bdds.trueleaf(n.lo)) {
			if (d < this.dim-1) {
				n.lo = this.root + this.maxbdd * (d + 1);
			}
		} else {
			if (!bdds.leaf(n.lo)) {
				n.lo = n.lo + this.maxbdd * d;
			}
		}
		// _dbg_apply(`        ` + `this.maxbdd:${this.maxbdd} this.nvars:`, this.nvars);
		return n;
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
			if (v === nvars+1) {
				r.push(p.slice());
			}	else {
				p[v-1] = true;
				this.sat(v+1, nvars, this.getnode(n.hi), p, r);
				p[v-1] = false;
				this.sat(v+1, nvars, this.getnode(n.lo), p, r);
			}
		}
	}
	allsat(x, nvars) {
		const p = Array(nvars).fill(false); const r = [];
		this.sat(1, nvars, this.getnode(x), p, r)
		return r;
	}
	from_bit(x, v) {
		const n = v
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
	static apply(src, x, dst, y, op) {
		const apply_id = ++_counters.apply;
		// unary op
		if (op === undefined) {
			op = y; // take op from the third argument
			const r = bdds.apply_unary(src, x, dst, op);
			return r;
		}
		// binary op
		let t;
		if (options.memoization) {
			t = `${op._id}.${dst._id}.${x}.${y}`;
			if (src.memo_op.hasOwnProperty(t)) {
				return src.memo_op[t];
			}
		}
		const xn = src.getnode(x).clone();
		const yn = dst.getnode(y).clone();
		let v;

		if (((xn.v === 0) && (yn.v > 0))
		|| ((yn.v > 0) && (xn.v > yn.v))) {
			v = yn.v;
			xn.hi = x;
			xn.lo = x;
		} else {
			if (xn.v === 0) {
				const r = op.eval(xn.hi, yn.hi);
				return r;
			} else {
				v = xn.v;
				if ((v < yn.v) || yn.v === 0) {
					yn.hi = y; yn.lo = y;
				}
			}
		}
		const hi  = bdds.apply(src, xn.hi, dst, yn.hi, op);
		const lo = bdds.apply(src, xn.lo, dst, yn.lo, op);
		const r = dst.add(new node(v, hi, lo));
		if (options.memoization) src.memo_op[t] = r;
		return r;
	}
	static apply_ex     (src, x, dst, s) {
		return bdds.apply(src, x, dst, op_exists(s)); }
	static apply_and    (src, x, dst, y) {
		return bdds.apply(src, x, dst, y, op_and); }
	static apply_and_not(src, x, dst, y) {
		return bdds.apply(src, x, dst, y, op_and_not); }
	static apply_or     (src, x, dst, y) {
		return bdds.apply(src, x, dst, y, op_or); }
	static apply_and_ex (src, x, dst, y, s, p, sz) {
		const apply_id = ++_counters.apply_and_ex;
		let t;
		if (options.memoization) {
			t = `${dst._id}.${s.join(',')}.${x}.${y}`;
			if (src.memo_and_ex.hasOwnProperty(t)) {
				return src.memo_and_ex[t];
			}
		}
		const xn = src.getnode(x).clone();
		const yn = dst.getnode(y).clone();
		let v, res, hi, lo;
		do {
			if (bdds.leaf(xn)) {
				res = bdds.trueleaf(xn)
					? bdds.apply_ex(dst, y, dst, s)
					: bdds.F;
				break;
			}
			if (bdds.leaf(yn)) {
				res = !bdds.trueleaf(yn)
					? bdds.F
					: ((src === dst)
						? bdds.apply_ex(dst, x, dst, s)
						: bdds.apply_ex(dst, dst.copy(src, x), dst, s));
				break;
			}
			if (((xn.v === 0) && (yn.v > 0))
			|| ((yn.v > 0) && (xn.v > yn.v))) {
				v = yn.v;
				xn.hi = x;
				xn.lo = x;
			} else {
				if (xn.v === 0) {
					res = (xn.hi > 0) && (yn.hi > 0) ? bdds.T : bdds.F;
					break;
				} else {
					v = xn.v;
					if ((v < yn.v) || yn.v === 0) {
						yn.hi = y; yn.lo = y;
					}
				}
			}
			hi = bdds.apply_and_ex(src, xn.hi, dst, yn.hi, s, p, sz);
			lo = bdds.apply_and_ex(src, xn.lo, dst, yn.lo, s, p, sz);
			if ((v <= sz) && s[v-1]) {
				res = dst.bdd_or(hi, lo);
				break;
			}
			res = dst.add(new node(v, hi, lo));
		} while(0);
		if (options.memoization) { src.memo_and_ex[t] = res; }
		return res;
	}
	static apply_unary(b, x, r, op) {
		const n = op.eval(b, x);
		return r.add(new node(n.v,
			bdds.leaf(n.hi) ? n.hi : bdds.apply(b, n.hi, r, op),
			bdds.leaf(n.lo) ? n.lo : bdds.apply(b, n.lo, r, op)));
	}
	// [overlapping] rename
	permute(x, m, sz) {
		let t;
		if (options.memoization) {
			t = `${x}.${m.join(',')}`;
			if (this.memo_permute.hasOwnProperty(t)) {
				 return this.memo_permute[t];
			}
		}
		const n = this.getnode(x);
		let r; // return value
		if (bdds.leaf(n)) {
			r = x;
		} else {
			const hi = this.permute(n.hi, m, sz);
			const lo = this.permute(n.lo, m, sz);
			r = this.ite(n.v <= sz ? m[n.v-1] : n.v-1, hi, lo);
		}
		if (options.memoization) this.memo_permute[t] = r;
		return r;
	}
	// helper constructors
	from_eq(x, y) { // a bdd saying "x=y"
		const res = this.bdd_or(
			this.bdd_and(this.from_bit(y, false), this.from_bit(x, false)),
			this.bdd_and(this.from_bit(y, true),  this.from_bit(x, true)));
		return res;
	}
	from_bits(x, bits, ar, w) {
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
						if (s[z][(ar*(j*bits+b)+i)] > 0) {
							r[n][ar*j+i] |= (1 << b);
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
		this.memo_op = {};
		this.memo_and_ex = {};
		this.memo_copy = {};
		this.memo_permute = {};
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
	bdds.op = op;
	bdds.op_exists = op_exists;
	bdds.op_and = op_and;
	bdds.op_and_not = op_and_not;
	bdds.op_or = op_or;
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
	get bits() { return 32 - Math.clz32(this.syms.length); }
	// initialize symbols and variables tables
	constructor() {
		this.syms = [ dict.pad ];
		this.vars = [ dict.pad ];
	}
	// gets and remembers the identifier and returns it's unique index
	// positive indexes are for symbols and negative indexes are for vars
	get(s) {
		if (typeof(s) === 'number') {     // if s is number
			return this.syms[s];      //     return symbol by index
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
// helper class for negs or poss of a rule
class rule_items {
	// initialize
	constructor(bits, ar) {
		this.h = bdds.T;  // bdd root
		this.w = 0;       // nbodies, will determine the virtual power
		this.x = [];      // existentials
		this.hvars = {};  // how to permute body vars to head vars
		this.bits = bits; // bitsize
		this.ar = ar;     // arity
	}

	// from arg
	// i = term's index in a rule
	// j = arg's index in a term
	// k?
	// vij = arg's varid
	// bits = bitsize
	// ar = arity
	// hvars = map of head vars to var's index in the head term
	// m = map of vars to their position in a rule
	// npad?
	from_arg(bdd, i, j, k, vij, bits, ar, hvars, m, npad) {
		// helper fn to count BIT from term, arg and bit
		const BIT = (term, arg, b) => ar*(term*bits+b)+arg;
		let notpad = bdds.T;
		if (m.hasOwnProperty(vij)) {                 // if seen
			for (let b = 0; b != bits; ++b) {    // for all bits
				k.k = bdd.bdd_and(k.k,
					bdd.from_eq(BIT(i, j, b), BIT(m[vij][0], m[vij][1], b)));
				this.x[BIT(i, j, b)] = true; // existential out
			}
		} else {
			m[vij] = [i, j];
			if (vij >= 0) { // sym
				for (let b = 0; b != bits; ++b) {
					k.k = bdd.bdd_and(k.k, bdd.from_bit(BIT(i, j, b), (vij&(1<<b))>0));
					this.x[BIT(i, j, b)] = true;
				}
			} else { // var
				for (let b = 0; b != bits; ++b) {
					notpad = bdd.bdd_and(notpad, bdd.from_bit(BIT(i, j, b), false));
				}
				npad.npad = bdd.bdd_or(npad.npad, notpad);
				if (hvars.hasOwnProperty(vij)) {
					const hvar = hvars[vij];
					for (let b = 0; b != this.bits; ++b) {
						if (BIT(i, j, b) != BIT(0, hvar, b)) {
							this.hvars[BIT(i, j, b)] = BIT(0, hvar, b);
						}
					}
				} else {
					for (let b = 0; b != this.bits; ++b) {
						this.x[BIT(i, j, b)] = true;
					}
				}
			}
		}
	}
	// get heads
	get_heads(p, hsym) {
		let x, y, z;
		p.pdbs.setpow(p.db, this.w, p.maxw);
		if (bdds.leaf(p.db)) {
			x = bdds.trueleaf(p.db) ? this.h : bdds.F;
			// remove nonhead variables
			y = bdds.apply_ex(p.pprog, x, p.pprog, this.x);
		} else {
			// rule/db conjunction
			// optimized apply_and_ex
			y = bdds.apply_and_ex(p.pdbs, p.db, p.pprog, this.h, this.x,
				this.hvars, ((this.w+1)*p.bits+1)*(p.ar+2));
			// not optimized apply_and_ex (does not work)
			// x = bdds.apply_and(p.pdbs, p.db, p.pprog, this.h);
			// _dbg_rule(`     x: after 'and' ${x} p.db:${p.db} this.h:${this.h}`);
			// y = bdds.apply_ex(p.pprog, x, p.pprog, this.x);
		}
		// reorder
		z = p.pprog.permute(y, this.hvars, ((this.w+1)*p.bits+1)*(p.ar+2));
		z = p.pprog.bdd_and(z, hsym);
		p.pdbs.setpow(p.db, 1, p.maxw);
		return z;
	}
}

// a P-DATALOG rule in bdd form
class rule {
	// initialize rule
	constructor(bdd, v, bits, ar) {
		this.hsym = bdds.T;
		this.hasnegs = false;
		this.poss = new rule_items(bits, ar);
		this.negs = new rule_items(bits, ar);
		// hvars = how to permute body vars to head vars
		//   = map of variable's varid to its index in head
		const hvars = {};
		const head = v[v.length-1];
		this.neg = head[0] < 0;
		head.shift();
		for (let i = 0; i != head.length; ++i) {
			if (head[i] < 0) { // var
				hvars[head[i]] = i;
			} else { // term
				for (let b = 0; b != bits; ++b) {
					const BIT = (term, arg, b) => ar*(term*bits+b)+arg;
					const res = bdd.from_bit(BIT(0, i, b), (head[i]&(1<<b))>0);
					const _dbg = this.hsym;
					this.hsym = bdd.bdd_and(this.hsym, res);
				}
			}
		}
		if (v.length === 1) {
			this.poss.h = this.hsym;
			return;
		}
		const m = {};
		for (let i=0; i != v.length-1; ++i) {
			if (v[i][0] < 0) {
				this.hasnegs = true;
				++this.negs.w;
			} else {
				++this.poss.w;
			}
		}
		// init poss' and negs' hvars and x
		const pvars = ((this.poss.w+1)*bits+1)*(ar + 2);
		const nvars = ((this.negs.w+1)*bits+1)*(ar + 2);
		this.poss.x     = Array(pvars).fill(false);
		this.negs.x     = Array(nvars).fill(false);
		this.poss.hvars = Array(pvars);
		this.negs.hvars = Array(nvars);
		for (let i = 0; i < pvars; ++i) { this.poss.hvars[i] = i; }
		for (let i = 0; i < nvars; ++i) { this.negs.hvars[i] = i; }

		// load rule's terms and terms' arguments
		const k = { k: null }; // k & npad are objecs for passing by ref
		const npad = { npad: bdds.F };
		let bneg = false;
		for (let i = 0; i != v.length-1; ++i) {
			k.k = bdds.T;
			bneg = v[i][0] < 0;
			v[i].shift();
			for (let j = 0;	j != v[i].length; ++j) {
				const s = (bneg ? this.negs : this.poss);
				s.from_arg(bdd, i, j, k, v[i][j], bits, ar, hvars, m, npad);
			}
			this.hasnegs = this.hasnegs || bneg;
			const s = bneg ? this.negs : this.poss;
			const h = bdd.bdd_and(k.k, bneg
				? bdd.bdd_and_not(s.h, k.k)
				: bdd.bdd_and(s.h, k.k));
			if (bneg) { this.negs.h = h; } else { this.poss.h = h; }
		}
		const s = bneg ? this.negs : this.poss;
		s.h = bdd.bdd_and_not(s.h, npad.npad);
	}
	// get heads
	get_heads(p) {
		if (this.hasnegs) {
			return p.pdbs.bdd_and(
				this.poss.get_heads(p, this.hsym),
				this.negs.get_heads(p, this.hsym));
		}
		return this.poss.get_heads(p, this.hsym);
	}
}

// [pfp] logic program
class lp {
	constructor() {
		this._id = ++_counters.lp;
		// holds its own dict so we can determine the universe size
		this.d = new dict();
		this.pdbs = null;    // db bdd (as db has virtual power)
		this.pprog = null;   // prog bdd
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
			r.splice(r.length-1, 0, t); // make sure head is last
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
		this.pdbs = new bdds(this.ar * this.bits);
		this.pprog = new bdds(this.maxw * this.ar * this.bits);

		for (let i = 0; i < r.length; i++) {
			const x = r[i];
			if (x.length === 1) {
				this.db = this.pdbs.bdd_or(this.db,
					new rule(this.pdbs, x, this.bits, this.ar).poss.h);
			} else {
				this.rules.push(new rule(this.pprog, x, this.bits, this.ar));
			}
		}


		return r; // return raw rules/facts;
	}
	// single pfp step
	step() {
		let add = bdds.F;
		let del = bdds.F;
		let s;
		const dbs = this.pdbs;
		const prog = this.pprog;
		for (let i = 0; i < this.rules.length; i++) {
			const r = this.rules[i];
			const t = bdds.apply_or(
				this.pprog, r.get_heads(this),
				this.pdbs, r.neg ? del : add);
			if (r.neg) { del = t; } else { add = t; }
		}
		s = dbs.bdd_and_not(add, del);
		if ((s === bdds.F) && (add !== bdds.F)) {
			this.db = bdds.F;
		} else {
			this.db = dbs.bdd_or(dbs.bdd_and_not(this.db, del), s);
		}
		dbs.memos_clear();
		prog.memos_clear();
	}
	// pfp logic
	pfp() {
		let d;                       // current db root
		let t = 0;                   // step counter
		const s = [];                // db roots of previous steps
		do {
			d = this.db;         // get current db root
			s.push(d);           // store current db root into steps
			// show step info
			console.log(`step: ${++t} nodes: ${this.pdbs.length}` +
				` + ${this.pprog.length}\n`)
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
		console.log(out(os, this.pdbs, this.db, this.bits, this.ar, 1, this.d));
		if (!os) {
			const o = { dot: true, svg: false };
			// bdd_out(this.pdbs, this.d, o);
			// bdd_out(this.pprog, this.d, o);
		}
	}
	toString() {
		return out('', this.pdbs, this.db, this.bits, this.ar, 1, this.d);
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
	const t = b.from_bits(db, bits, ar, w)
	os = os || '';
	for (let i = 0; i < t.length; i++) {
		const v = t[i];
		for (let j = 0; j < v.length; j++) {
			const k = v[j];
			if (!k) os += '* ';
			else if (k < d.nsyms) os += d.get(k) + ' ';
			else os += `[${k}]`;
		}
		os += `\n`;
	}
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
	lp.rule_items = rule_items;
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
