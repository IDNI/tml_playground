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
	memoization: false
}

// debug functions

// internal counters for apply calls
const _counters = { apply: 0, or: 0, ex: 0, and: 0, deltail: 0,
	and_deltail: 0, and_ex: 0, and_not: 0, and_not_ex: 0, permute: 0 };

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
class bdds {
	// F=0 and T=1 consants
	static get F() { return 0; }
	static get T() { return 1; }
	// initialize bdds
	constructor() {
		this._id = ++_counters.bdds;
		this.V = [];          // all nodes
		this.M = {};          // node to its index
		// initialize bdd with 0 and 1 terminals
		this.add_nocheck(new node(0, 0, 0));
		this.add_nocheck(new node(0, 1, 1));
		this.memos_clear();
	}
	// add node directly without checking
	add_nocheck(n) {
		const r = this.V.length;
		this.M[n.key] = r;
		this.V.push(n);
		return r;
	}
	// returns node by its index
	getnode(nid) { return this.V[nid]; }
	// checks if node is terminal (leaf)
	static leaf(n) {
		const res = n instanceof node
			? n.v === 0
			: n === bdds.T || n === bdds.F;
		return res;
	}
	// checks if node is terminal and is T
	static trueleaf(n) {
		const res = n instanceof node
			? bdds.leaf(n) && (n.hi > 0)
			: n === bdds.T;
		return res;
	}

	from_bit(x, v) {
		const n = v === true || v > 0
			? new node(x + 1, bdds.T, bdds.F)
			: new node(x + 1, bdds.F, bdds.T);
		const res = this.add(n);
		return res;
	}
	// adds new node
	add(n) {
		let r = null;
		let _dbg = '';
		do {
			if (n.hi === n.lo) { r = n.hi; break; }
			if (this.M.hasOwnProperty(n.key)) { r = this.M[n.key]; break; }
			r = this.add_nocheck(n);
			_dbg = ' nocheck';
		} while (0);
		return r;
	}

	sat(v, nvars, n, p, r) {
		if (bdds.leaf(n) && !bdds.trueleaf(n)) return;
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

	or(x, y) {
		const or_id = ++_counters.or;
		let t;
		let apply_ret = r => r;
		if (options.memoization) {
			t = x+'.'+y;
			apply_ret = (r, m) => { m[t] = r; return r; }
			if (this.memo_or.hasOwnProperty(t)) {
				return this.memo_or[t];
			}
		}
		const xn = this.getnode(x).clone();
		if (bdds.leaf(xn)) {
			const r = bdds.trueleaf(xn) ? bdds.T : y;
			return apply_ret(r, this.memo_or);
		}
		const yn = this.getnode(y).clone();
		if (bdds.leaf(yn)) {
			const r = bdds.trueleaf(yn) ? bdds.T : x;
			return apply_ret(r, this.memo_or);
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
				return apply_ret(r, this.memo_or);
			} else {
				v = xn.v;
				if ((v < yn.v) || yn.v === 0) {
					yn.hi = y;
					yn.lo = y;
				}
			}
		}
		const hi  = this.or(xn.hi, yn.hi);
		const lo = this.or(xn.lo, yn.lo);
		const r = this.add(new node(v, hi, lo));
		return apply_ret(r, this.memo_or);
	}

	ex(x, b) {
		const ex_id = ++_counters.ex;
		let t;
		let apply_ret = r => r;
		if (options.memoization) {
			t = x+'.'+b.join(',');
			apply_ret = (r, m) => { m[t] = r; return r; }
			if (this.memo_ex.hasOwnProperty(t)) {
				return this.memo_ex[t];
			}
		}
		let n = this.getnode(x);
		if (bdds.leaf(n)) return x;
		if (b[n.v-1] === true || b[n.v-1] > 0) {
			x = this.or(n.hi, n.lo);
			if (bdds.leaf(x)) { return apply_ret(x, this.memo_ex); }
			n = this.getnode(x);
		}
		const hi = this.ex(n.hi, b);
		const lo = this.ex(n.lo, b);
		const r = this.add(new node(n.v, hi, lo));
		return apply_ret(r, this.memo_ex);
	}

	and(x, y) {
		const and_id = ++_counters.and;
		let t;
		let apply_ret = r => r;
		if (options.memoization) {
			t = `${x}.${y}`;
			apply_ret = (r, m) => { m[t] = r; return r; }
			if (this.memo_and.hasOwnProperty(t)) {
				return this.memo_and[t];
			}
		}
		const xn = this.getnode(x).clone();
		if (bdds.leaf(xn)) {
			const r = bdds.trueleaf(xn) ? y : bdds.F;
			return apply_ret(r, this.memo_and);
		}
		const yn = this.getnode(y).clone();
		if (bdds.leaf(yn)) {
			const r = !bdds.trueleaf(yn) ? bdds.F : x;
			return apply_ret(r, this.memo_and);
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
				return apply_ret(r, this.memo_and);
			} else {
				v = xn.v;
				if ((v < yn.v) || yn.v === 0) {
					yn.hi = y;
					yn.lo = y;
				}
			}
		}
		const hi  = this.and(xn.hi, yn.hi);
		const lo = this.and(xn.lo, yn.lo);
		const r = this.add(new node(v, hi, lo));
		return apply_ret(r, this.memo_and);
	}

	deltail(x, h) {
		const deltail_id = ++_counters.deltail;
		let t;
		let apply_ret = r => r;
		if (options.memoization) {
			t = `${x}.${h}`;
			apply_ret = (r, m) => { m[t] = r; return r; }
			if (this.memo_deltail.hasOwnProperty(t)) {
				return this.memo_deltail[t];
			}
		}
		if (bdds.leaf(x)) {
			return x;
		}
		const n = this.getnode(x).clone();
		if (n.v > h) {
			const r = n.hi === bdds.F && n.lo === bdds.F ? bdds.F : bdds.T;
			return apply_ret(r, this.memo_deltail);
		}
		const hi = this.deltail(n.hi, h);
		const lo = this.deltail(n.lo, h);
		const r = this.add(new node(n.v, hi, lo));
		return apply_ret(r, this.memo_deltail);
	}

	and_deltail(x, y, h) {
		const and_deltail_id = ++_counters.and_deltail;
		let t;
		let apply_ret = r => r;
		if (options.memoization) {
			t = `${x}.${y}.${h}`;
			apply_ret = (r, m) => { m[t] = r; return r; }
			if (this.memo_and_deltail.hasOwnProperty(t)) {
				return this.memo_and_deltail[t];
			}
		}
		const xn = this.getnode(x).clone();
		if (bdds.leaf(xn)) {
			const r = bdds.trueleaf(xn) ? this.deltail(y, h) : bdds.F;
			return apply_ret(r, this.memo_and_deltail);
		}
		const yn = this.getnode(y).clone();
		if (bdds.leaf(yn)) {
			const r = !bdds.trueleaf(yn) ? bdds.F : this.deltail(x, h);
			return apply_ret(r, this.memo_and_deltail);
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
				return apply_ret(r, this.memo_and_deltail);
			} else {
				v = xn.v;
				if ((v < yn.v) || yn.v === 0) {
					yn.hi = y;
					yn.lo = y;
				}
			}
		}
		const hi  = this.and_deltail(xn.hi, yn.hi, h);
		const lo = this.and_deltail(xn.lo, yn.lo, h);
		const r = this.deltail(this.add(new node(v, hi, lo)), h);
		return apply_ret(r, this.memo_and_deltail);
	}

	and_ex(x, y, s) {
		const and_ex_id = ++_counters.and_ex;
		let t;
		let apply_ret = r => r;
		if (options.memoization) {
			t = `${x}.${y}.${s.join(',')}`;
			apply_ret = (r, m) => { m[t] = r; return r; }
			if (this.memo_and_ex.hasOwnProperty(t)) {
				return this.memo_and_ex[t];
			}
		}
		const xn = this.getnode(x).clone();
		if (bdds.leaf(xn)) {
			const r = bdds.trueleaf(xn) ? this.ex(y, s) : bdds.F;
			return apply_ret(r, this.memo_and_ex);
		}
		const yn = this.getnode(y).clone();
		if (bdds.leaf(yn)) {
			const r = !bdds.trueleaf(yn) ? bdds.F : this.ex(x, s);
			return apply_ret(r, this.memo_and_ex);
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
				return apply_ret(r, this.memo_and_ex);
			} else {
				v = xn.v;
				if ((v < yn.v) || yn.v === 0) {
					yn.hi = y;
					yn.lo = y;
				}
			}
		}
		let r;
		if (s[v-1] === true || s[v-1] > 0) {
			const lo = this.and_ex(xn.lo, yn.lo, s);
			const hi  = this.and_ex(xn.hi, yn.hi, s);
			r = this.or(hi, lo);
		} else {
			const hi  = this.and_ex(xn.hi, yn.hi, s);
			const lo = this.and_ex(xn.lo, yn.lo, s);
			r = this.add(new node(v, hi, lo));
		}
		return apply_ret(r, this.memo_and_ex);
	}

	and_not(x, y) {
		const and_not_id = ++_counters.and_not;
		let t;
		let apply_ret = r => r;
		if (options.memoization) {
			t = x+'.'+y;
			apply_ret = (r, m) => { m[t] = r; return r; }
			if (this.memo_and_not.hasOwnProperty(t)) {
				return this.memo_and_not[t];
			}
		}
		const xn = this.getnode(x).clone();
		if (bdds.leaf(xn) && !bdds.trueleaf(xn)) {
			return apply_ret(bdds.F, this.memo_and_not);
		}
		const yn = this.getnode(y).clone();
		if (bdds.leaf(yn)) {
			const r = bdds.trueleaf(yn) ? bdds.F : x;
			return apply_ret(r, this.memo_and_not);
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
				return apply_ret(r, this.memo_and_not);
			} else {
				v = xn.v;
				if ((v < yn.v) || yn.v === 0) {
					yn.hi = y;
					yn.lo = y;
				}
			}
		}
		const hi = this.and_not(xn.hi, yn.hi);
		const lo = this.and_not(xn.lo, yn.lo);
		const r = this.add(new node(v, hi, lo));
		return apply_ret(r, this.memo_and_not);
	}

	and_not_ex(x, y, s) {
		const and_not_ex_id = ++_counters.and_not_ex;
		let t;
		let apply_ret = r => r;
		if (options.memoization) {
			t = `${x}.${y}.${s.join(',')}`;
			apply_ret = (r, m) => { m[t] = r; return r; }
			if (this.memo_and_not_ex.hasOwnProperty(t)) {
				return this.memo_and_not_ex[t];
			}
		}
		const xn = this.getnode(x).clone();
		if (bdds.leaf(xn)) {
			const r = bdds.trueleaf(xn) ? this.ex(y, s) : bdds.F;
			return apply_ret(r, this.memo_and_not_ex);
		}
		const yn = this.getnode(y).clone();
		if (bdds.leaf(yn)) {
			const r = !bdds.trueleaf(yn) ? bdds.F : this.ex(x, s);
			return apply_ret(r, this.memo_and_not_ex);
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
				return apply_ret(r, this.memo_and_not_ex);
			} else {
				v = xn.v;
				if ((v < yn.v) || yn.v === 0) {
					yn.hi = y;
					yn.lo = y;
				}
			}
		}
		const hi  = this.and_not_ex(xn.hi, yn.hi, s);
		const lo = this.and_not_ex(xn.lo, yn.lo, s);
		const r = s[v-1]
			? this.or(hi, lo)
			: this.add(new node(v, hi, lo));
		return apply_ret(r, this.memo_and_not_ex);
	}

	// if-then-else operator
	ite(v, t, e) {
		const x = this.getnode(t);
		const y = this.getnode(e);
		if ((bdds.leaf(x) || v < x.v)
		&&  (bdds.leaf(y) || v < y.v)) {
			return this.add(new node(v + 1, t, e));
		}
		const hi = this.and(this.from_bit(v, true), t);
		const lo = this.and(this.from_bit(v, false), e);
		return this.or(hi, lo);
	}

	permute(x, m) {
		const permute_id = ++_counters.permute;
		let t;
		let apply_ret = r => r;
		if (options.memoization) {
			t = `${x}.${m.join(',')}`;
			apply_ret = (r, m) => { m[t] = r; return r; }
			if (this.memo_permute.hasOwnProperty(t)) {
				return this.memo_permute[t];
			}
		}
		if (bdds.leaf(x)) { return x; }
		const n = this.getnode(x);
		const hi = this.permute(n.hi, m);
		const lo = this.permute(n.lo, m);
		const r = this.ite(m[n.v-1], hi, lo);
		return apply_ret(r, this.memo_permute);
	}

	from_eq(x, y) { // a bdd saying "x=y"
		const res = this.or(
			this.and(this.from_bit(y, false), this.from_bit(x, false)),
			this.and(this.from_bit(y, true),  this.from_bit(x, true)));
		return res;
	}

	memos_clear() {
		if (!options.memoization) return;
		this.memo_and = {};
		this.memo_and_not = {};
		this.memo_or = {};
		this.memo_permute = {};
		this.memo_and_ex = {};
		this.memo_and_not_ex = {};
		this.memo_deltail = {};
		this.memo_and_deltail = {};
		this.memo_ex = {};
	}
}

module.exports = (o = {}) => {
	options.memoization = o.hasOwnProperty('memoization')
		? o.memoization
		: options.memoization;
	return { node, bdds };
}

},{}],2:[function(require,module,exports){
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

const lp = require("./lp")();


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

class driver {
	constructor() {
		this.d = new dict();
		this.p = null;
	}
	get db() { return this.p.getdb(); }
	printdb(os) {
		os = os || '';
		const vs = this.db;
		const s = [];
		for (let i = 0; i < vs.length; i++) {
			const v = vs[i];
			let ss = '';
			for (let j = 0; j < v.length; j++) {
				const k = v[j];
				if (k === dict.pad) ;
				else if (k < this.d.nsyms) ss += this.d.get(k) + ' ';
				else ss += '[' + k + '] ';
			}
			s.push(ss.slice(0, -1) + '.');
		}
		os += s.sort().join(`\n`);
		return os;
	}
	toString() { return this.printdb(); }
	pfp() {
		const r = this.p.pfp();
		console.log(this.printdb());
		return r;
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
		let ar    = 0;           // arity
		let l, r  = [];          // length and rules

		for (let t; !((t = this.rule_read(s)).length === 0); r.push(t)) {
			let i = 0;
			for (let x = t[0]; i < t.length; x = t[++i]) {
				ar = Math.max(ar, x.length - 1);
			}
		}
		this.p = new lp(this.d.bits, ar, this.d.nsyms);
		for (let i = r.length-1; i >= 0; i--) {
			for (let j = 0; j < r[i].length; j++) {
				l = r[i][j].length;
				if (l < ar+1) {
					r[i][j] = r[i][j].concat(Array(ar + 1 - l).fill(dict.pad));
				}
			}
			this.p.rule_add(r[i]);
		}
		return r; // return raw rules/facts;
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
			s = string_read_text(await load_stream(process.stdin));
		} catch (err) {   // stdin read error
			console.log('Read error:', err);
			return 4;
		}
	}
	const d = new driver();
	try {
		d.prog_read(s); // parse source from s
	} catch (err) {
		console.log('Parse error:', err);
		return 3;
	}
	let r = false;
	try {
		r = d.pfp();    // run pfp logic program
	} catch (err) {
		console.log('PFP error', err);
		return 2;
	}
	if (!r) {
		console.log('unsat');
		return 1;
	}
	return 0;
}

module.exports = { driver, string_read_text, load_stream, main };

}).call(this,require('_process'))

},{"./lp":3,"_process":4}],3:[function(require,module,exports){
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

const { bdds } = require('./bdds')();

// debug functions

// internal counter for lps (lp._id)
const _counters = { lp: 0 };

// a P-DATALOG rule in bdd form
class rule {

	from_int(x, bits, offset) {
		let r = bdds.T;
		let b = bits--;
		while (b--) r = this.bdds.and(r, this.bdds.from_bit(bits - b + offset, x & (1 << b)));
		return r;
	}

	from_range(max, bits, offset) {
		let x = bdds.F;
		for (let n = 1; n < max; ++n) {
			x = this.bdds.or(x, this.from_int(n, bits, offset));
		}
		return x;
	}

	// initialize rule
	constructor(bdb, v, bits, dsz) {
		this.bdds = bdb;
		this.neg  = false;
		this.hsym = bdds.T;
		this.npos = 0;
		this.nneg = 0;
		this.sels = [];
		this.bd = [];
		const ar = v[0].length - 1;
		const t = [ v[0].slice() ];
		for (let i = 1; i != v.length; ++i) { if (v[i][0] > 0) { ++this.npos; t.push(v[i].slice()); } }
		for (let i = 1; i != v.length; ++i) { if (v[i][0] < 0) { ++this.nneg; t.push(v[i].slice()); } }
		v = t;
		this.neg = v[0][0] < 0;
		const vars = [];
		for (let i = 0; i != v.length; ++i) {
			const x = v[i];
			x.shift();
			for (let j = 0; j != x.length; ++j) {
				const y = x[j];
				if (y < 0 && !vars.includes(y)) {
					vars.push(y);
				}
			}
		}
		const nvars = vars.length;
		let m = {};
		for (let i = 1; i != v.length; ++i) {
			const d = {
				sel: bdds.T,
				perm: [],
				ex: []
			};
			d.ex = new Array(bits*ar).fill(0);
			d.perm = new Array((ar + nvars) * bits);
			for (let b = 0; b != (ar + nvars) * bits; ++b) {
				d.perm[b] = b;
			}
			for (let j = 0; j != ar; ++j) {
				if (v[i][j] >= 0) {
					d.sel = this.bdds.and(d.sel, this.from_int(v[i][j], bits, j * bits));
					for (let b = 0; b != bits; ++b) {
						d.ex[b+j*bits] = true;
					}
				} else {
					if (m.hasOwnProperty(v[i][j])) {
						for (let b = 0; b != bits; ++b) {
							d.ex[b+j*bits] = true;
							d.sel = this.bdds.and(d.sel, this.bdds.from_eq(b+j*bits, b+m[v[i][j]]*bits));
						}
					} else {
						m[v[i][j]] = j;
						d.sel = this.bdds.and(d.sel, this.from_range(dsz, bits, j * bits));
					}
				}
			}
			m = {};
			this.bd.push(d);
		}
		for (let j = 0; j != ar; ++j) {
			if (v[0][j] >= 0) {
				this.hsym = this.bdds.and(this.hsym, this.from_int(v[0][j], bits, j * bits));
			} else {
				if (m.hasOwnProperty(v[0][j])) {
					for (let b = 0; b != bits; ++b) {
						this.hsym = this.bdds.and(this.hsym, this.bdds.from_eq(b+j*bits, b+m[v[0][j]]*bits));
					}
				} else {
					m[v[0][j]] = j;
				}
			}
		}
		let k = ar;
		for (let i = 0; i != v.length-1; ++i) {
			for (let j = 0; j != ar; ++j) {
				if (v[i+1][j] < 0) {
					if (!m.hasOwnProperty(v[i+1][j])) {
						m[v[i+1][j]] = k++;
					}
					for (let b = 0; b != bits; ++b) {
						this.bd[i].perm[b+j*bits]=b+m[v[i+1][j]]*bits;
					}
				}
			}
		}
		if (v.length > 1) {
			this.sels = new Array(v.length-1);
		}
	}

	step(db, bits, ar) {
		let n = 0;
		for (; n != this.npos; ++n) {
			this.sels[n] = this.bdds.and_ex(this.bd[n].sel, db, this.bd[n].ex);
			if (bdds.F === this.sels[n]) return bdds.F;
		}
		for (; n != this.nneg+this.npos; ++n) {
			this.sels[n] = this.bdds.and_not_ex(this.bd[n].sel, db, this.bd[n].ex);
			if (bdds.F === this.sels[n]) return bdds.F;
		}
		let vars = bdds.T;
		for (n = 0; n != this.bd.length; ++n) {
			const p = this.bdds.permute(this.sels[n], this.bd[n].perm);
			vars = this.bdds.and(vars, p);
			if (bdds.F === vars) return bdds.F;
		}
		return this.bdds.and_deltail(this.hsym, vars, bits*ar);
	}
}

// [pfp] logic program
class lp {
	constructor(maxbits, arity, dsz) {
		this._id = ++_counters.lp;
		// holds its own dict so we can determine the universe size
		this.bdds = new bdds();
		this.db = bdds.F;
		this.rules = [];     // p-datalog rules
		this.ar = arity;
		this.dsz = dsz;
		this.bits = maxbits;
	}
	getdb() { return this.from_bits(this.db); }
	// single pfp step
	rule_add(x) {
		const r = new rule(this.bdds, x, this.bits, this.dsz);
		if (x.length === 1) {
			this.db = this.bdds.or(this.db, r.hsym); // fact
		} else {
			this.rules.push(r);
		}
	}
	step() {
		let add = bdds.F;
		let del = bdds.F;
		for (let i = 0; i < this.rules.length; i++) {
			const r = this.rules[i];
			const t = this.bdds.or(r.step(this.db, this.bits, this.ar), r.neg ? del : add);
			if (r.neg) { del = t; } else { add = t; }
		}
		let s = this.bdds.and_not(add, del);
		if (s === bdds.F && add !== bdds.F) {
			this.db = bdds.F; // detect contradiction
		} else {
			this.db = this.bdds.or(this.bdds.and_not(this.db, del), s);
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
				return d === this.db;
			}
		} while (true);
	}

	from_bits(x) {
		const s = this.bdds.allsat(x, this.bits * this.ar);
		const r = Array(s.length);
		for (let k = 0; k < r.length; k++) {
			r[k] = Array(this.ar).fill(0);
		}
		let n = s.length;
		while (n--) {
			for (let i = 0; i != this.ar; ++i) {
				for (let b = 0; b != this.bits; ++b) {
					if (s[n][i * this.bits + b] > 0) {
						r[n][i] |= 1 << (this.bits - b - 1);
					}
				}
			}
		}
		return r;
	}
}

module.exports = () => {
	lp.rule = rule;
	return lp;
}

},{"./bdds":1}],4:[function(require,module,exports){
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

module.exports = require('./build/driver.js');

},{"./build/driver.js":2}]},{},[])
//# sourceMappingURL=tml.js.map.js
