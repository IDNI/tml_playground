require=(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){

/**
 * This is the common logic for both the Node.js and web browser
 * implementations of `debug()`.
 */

function setup(env) {
	createDebug.debug = createDebug;
	createDebug.default = createDebug;
	createDebug.coerce = coerce;
	createDebug.disable = disable;
	createDebug.enable = enable;
	createDebug.enabled = enabled;
	createDebug.humanize = require('ms');

	Object.keys(env).forEach(key => {
		createDebug[key] = env[key];
	});

	/**
	* Active `debug` instances.
	*/
	createDebug.instances = [];

	/**
	* The currently active debug mode names, and names to skip.
	*/

	createDebug.names = [];
	createDebug.skips = [];

	/**
	* Map of special "%n" handling functions, for the debug "format" argument.
	*
	* Valid key names are a single, lower or upper-case letter, i.e. "n" and "N".
	*/
	createDebug.formatters = {};

	/**
	* Selects a color for a debug namespace
	* @param {String} namespace The namespace string for the for the debug instance to be colored
	* @return {Number|String} An ANSI color code for the given namespace
	* @api private
	*/
	function selectColor(namespace) {
		let hash = 0;

		for (let i = 0; i < namespace.length; i++) {
			hash = ((hash << 5) - hash) + namespace.charCodeAt(i);
			hash |= 0; // Convert to 32bit integer
		}

		return createDebug.colors[Math.abs(hash) % createDebug.colors.length];
	}
	createDebug.selectColor = selectColor;

	/**
	* Create a debugger with the given `namespace`.
	*
	* @param {String} namespace
	* @return {Function}
	* @api public
	*/
	function createDebug(namespace) {
		let prevTime;

		function debug(...args) {
			// Disabled?
			if (!debug.enabled) {
				return;
			}

			const self = debug;

			// Set `diff` timestamp
			const curr = Number(new Date());
			const ms = curr - (prevTime || curr);
			self.diff = ms;
			self.prev = prevTime;
			self.curr = curr;
			prevTime = curr;

			args[0] = createDebug.coerce(args[0]);

			if (typeof args[0] !== 'string') {
				// Anything else let's inspect with %O
				args.unshift('%O');
			}

			// Apply any `formatters` transformations
			let index = 0;
			args[0] = args[0].replace(/%([a-zA-Z%])/g, (match, format) => {
				// If we encounter an escaped % then don't increase the array index
				if (match === '%%') {
					return match;
				}
				index++;
				const formatter = createDebug.formatters[format];
				if (typeof formatter === 'function') {
					const val = args[index];
					match = formatter.call(self, val);

					// Now we need to remove `args[index]` since it's inlined in the `format`
					args.splice(index, 1);
					index--;
				}
				return match;
			});

			// Apply env-specific formatting (colors, etc.)
			createDebug.formatArgs.call(self, args);

			const logFn = self.log || createDebug.log;
			logFn.apply(self, args);
		}

		debug.namespace = namespace;
		debug.enabled = createDebug.enabled(namespace);
		debug.useColors = createDebug.useColors();
		debug.color = selectColor(namespace);
		debug.destroy = destroy;
		debug.extend = extend;
		// Debug.formatArgs = formatArgs;
		// debug.rawLog = rawLog;

		// env-specific initialization logic for debug instances
		if (typeof createDebug.init === 'function') {
			createDebug.init(debug);
		}

		createDebug.instances.push(debug);

		return debug;
	}

	function destroy() {
		const index = createDebug.instances.indexOf(this);
		if (index !== -1) {
			createDebug.instances.splice(index, 1);
			return true;
		}
		return false;
	}

	function extend(namespace, delimiter) {
		const newDebug = createDebug(this.namespace + (typeof delimiter === 'undefined' ? ':' : delimiter) + namespace);
		newDebug.log = this.log;
		return newDebug;
	}

	/**
	* Enables a debug mode by namespaces. This can include modes
	* separated by a colon and wildcards.
	*
	* @param {String} namespaces
	* @api public
	*/
	function enable(namespaces) {
		createDebug.save(namespaces);

		createDebug.names = [];
		createDebug.skips = [];

		let i;
		const split = (typeof namespaces === 'string' ? namespaces : '').split(/[\s,]+/);
		const len = split.length;

		for (i = 0; i < len; i++) {
			if (!split[i]) {
				// ignore empty strings
				continue;
			}

			namespaces = split[i].replace(/\*/g, '.*?');

			if (namespaces[0] === '-') {
				createDebug.skips.push(new RegExp('^' + namespaces.substr(1) + '$'));
			} else {
				createDebug.names.push(new RegExp('^' + namespaces + '$'));
			}
		}

		for (i = 0; i < createDebug.instances.length; i++) {
			const instance = createDebug.instances[i];
			instance.enabled = createDebug.enabled(instance.namespace);
		}
	}

	/**
	* Disable debug output.
	*
	* @return {String} namespaces
	* @api public
	*/
	function disable() {
		const namespaces = [
			...createDebug.names.map(toNamespace),
			...createDebug.skips.map(toNamespace).map(namespace => '-' + namespace)
		].join(',');
		createDebug.enable('');
		return namespaces;
	}

	/**
	* Returns true if the given mode name is enabled, false otherwise.
	*
	* @param {String} name
	* @return {Boolean}
	* @api public
	*/
	function enabled(name) {
		if (name[name.length - 1] === '*') {
			return true;
		}

		let i;
		let len;

		for (i = 0, len = createDebug.skips.length; i < len; i++) {
			if (createDebug.skips[i].test(name)) {
				return false;
			}
		}

		for (i = 0, len = createDebug.names.length; i < len; i++) {
			if (createDebug.names[i].test(name)) {
				return true;
			}
		}

		return false;
	}

	/**
	* Convert regexp to namespace
	*
	* @param {RegExp} regxep
	* @return {String} namespace
	* @api private
	*/
	function toNamespace(regexp) {
		return regexp.toString()
			.substring(2, regexp.toString().length - 2)
			.replace(/\.\*\?$/, '*');
	}

	/**
	* Coerce `val`.
	*
	* @param {Mixed} val
	* @return {Mixed}
	* @api private
	*/
	function coerce(val) {
		if (val instanceof Error) {
			return val.stack || val.message;
		}
		return val;
	}

	createDebug.enable(createDebug.load());

	return createDebug;
}

module.exports = setup;

},{"ms":2}],2:[function(require,module,exports){
/**
 * Helpers.
 */

var s = 1000;
var m = s * 60;
var h = m * 60;
var d = h * 24;
var w = d * 7;
var y = d * 365.25;

/**
 * Parse or format the given `val`.
 *
 * Options:
 *
 *  - `long` verbose formatting [false]
 *
 * @param {String|Number} val
 * @param {Object} [options]
 * @throws {Error} throw an error if val is not a non-empty string or a number
 * @return {String|Number}
 * @api public
 */

module.exports = function(val, options) {
  options = options || {};
  var type = typeof val;
  if (type === 'string' && val.length > 0) {
    return parse(val);
  } else if (type === 'number' && isNaN(val) === false) {
    return options.long ? fmtLong(val) : fmtShort(val);
  }
  throw new Error(
    'val is not a non-empty string or a valid number. val=' +
      JSON.stringify(val)
  );
};

/**
 * Parse the given `str` and return milliseconds.
 *
 * @param {String} str
 * @return {Number}
 * @api private
 */

function parse(str) {
  str = String(str);
  if (str.length > 100) {
    return;
  }
  var match = /^((?:\d+)?\-?\d?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?$/i.exec(
    str
  );
  if (!match) {
    return;
  }
  var n = parseFloat(match[1]);
  var type = (match[2] || 'ms').toLowerCase();
  switch (type) {
    case 'years':
    case 'year':
    case 'yrs':
    case 'yr':
    case 'y':
      return n * y;
    case 'weeks':
    case 'week':
    case 'w':
      return n * w;
    case 'days':
    case 'day':
    case 'd':
      return n * d;
    case 'hours':
    case 'hour':
    case 'hrs':
    case 'hr':
    case 'h':
      return n * h;
    case 'minutes':
    case 'minute':
    case 'mins':
    case 'min':
    case 'm':
      return n * m;
    case 'seconds':
    case 'second':
    case 'secs':
    case 'sec':
    case 's':
      return n * s;
    case 'milliseconds':
    case 'millisecond':
    case 'msecs':
    case 'msec':
    case 'ms':
      return n;
    default:
      return undefined;
  }
}

/**
 * Short format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function fmtShort(ms) {
  var msAbs = Math.abs(ms);
  if (msAbs >= d) {
    return Math.round(ms / d) + 'd';
  }
  if (msAbs >= h) {
    return Math.round(ms / h) + 'h';
  }
  if (msAbs >= m) {
    return Math.round(ms / m) + 'm';
  }
  if (msAbs >= s) {
    return Math.round(ms / s) + 's';
  }
  return ms + 'ms';
}

/**
 * Long format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function fmtLong(ms) {
  var msAbs = Math.abs(ms);
  if (msAbs >= d) {
    return plural(ms, msAbs, d, 'day');
  }
  if (msAbs >= h) {
    return plural(ms, msAbs, h, 'hour');
  }
  if (msAbs >= m) {
    return plural(ms, msAbs, m, 'minute');
  }
  if (msAbs >= s) {
    return plural(ms, msAbs, s, 'second');
  }
  return ms + ' ms';
}

/**
 * Pluralization helper.
 */

function plural(ms, msAbs, n, name) {
  var isPlural = msAbs >= n * 1.5;
  return Math.round(ms / n) + ' ' + name + (isPlural ? 's' : '');
}

},{}],3:[function(require,module,exports){
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

},{}],4:[function(require,module,exports){
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
const _dbg_bdd   = require('debug')('tml:bdd');
const _dbg_node  = require('debug')('tml:bdd:node');
const _dbg_leaf  = require('debug')('tml:bdd:leaf');
const _dbg_apply = require('debug')('tml:bdd:apply');
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
		_dbg_leaf(`${res ? ' is' : 'not'} leaf ${n instanceof node ? n.key : n}`);
		return res;
	}
	// checks if node is terminal and is T
	static trueleaf(n) {
		const res = n instanceof node
			? bdds_base.leaf(n) && (n.hi > 0)
			: n === bdds_base.T;
		_dbg_leaf(`    leaf ${n instanceof node ? n.key : n} is ${res}`);
		return res;
	}
	// set virtual power
	setpow(root, dim, maxw) {
		this.root = root;
		this.dim = dim;
		this.maxbdd = 1<<(Math.floor(32/maxw));
		_dbg_bdd(`setpow(root:${root}, dim:${dim}, maxw:${maxw}), this.maxbdd:${this.maxbdd}`);
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
				_dbg_node(`add ${n.key} = ERR. Max varid:`, this.nvars);
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
		_dbg_node(`add ${r} (${n.key})${_dbg}`);
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
		_dbg_apply(`getnode(${nid}) = ${n.key} d:${d} ` + `this.V[m=${m}]: `, this.V[m].key);
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
		_dbg_bdd(`                    from_bit x:${x}, v:${v}, n:${n.key}, res:${res}`);
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
			_dbg_apply(`unary apply(${apply_id}) ${r} ${op._dbg}(${x})${src===dst?' on this':''} (unary)`);
			return r;
		}
		// binary op
		let t;
		if (options.memoization) {
			t = `${op._id}.${dst._id}.${x}.${y}`;
			if (src.memo_op.hasOwnProperty(t)) {
				_dbg_apply(`apply(${apply_id}) ${src.memo_op[t]} (${x} ${op._dbg} ${y})${src===dst?' on this':''} (memo:${t})`);
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
				_dbg_apply(`apply(${apply_id}) ${r} (${x} ${op._dbg} ${y})${src===dst?' on this':''} (xn is leaf)`);
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
		_dbg_apply(`apply(${apply_id}) ${r} (${x} ${op._dbg} ${y})${src===dst?' on this':''} (recursive)`);
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
		_dbg_apply(`apply_and_ex0(${apply_id}) (${x}, ${y})${src===dst?' on this':''}`);
		let t;
		if (options.memoization) {
			t = `${dst._id}.${s.join(',')}.${x}.${y}`;
			if (src.memo_and_ex.hasOwnProperty(t)) {
				_dbg_apply(`    ret from apply_and_ex1(${apply_id}) = ${src.memo_and_ex[t]} (${x} ${op._dbg} ${y})${src===dst?' on this':''} (memo:${t})`);
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
		_dbg_apply(`    ret from apply_and_ex2(${apply_id}) ${res} (${x} ${y})${src===dst?' on this':''}`);
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
		_dbg_bdd(`permute x:${x} (${n.key}) sz:${sz} m:[`, m.join(','), `] = ${r}`);
		return r;
	}
	// helper constructors
	from_eq(x, y) { // a bdd saying "x=y"
		const res = this.bdd_or(
			this.bdd_and(this.from_bit(y, false), this.from_bit(x, false)),
			this.bdd_and(this.from_bit(y, true),  this.from_bit(x, true)));
		_dbg_bdd(`from_eq x:${x} y:${y} = ${res}`);
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

},{"./bdds_non_rec":5,"debug":"debug"}],5:[function(require,module,exports){
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
const _dbg_apply = require('debug')('tml:bdd_non_rec:apply');
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
				_dbg_apply('apply LO n', n.key, n.lo);
				if(bdds_non_rec.leaf(n.lo)) {
					_dbg_apply('apply LO leaf', n.key, 'go HI');
					low = n.lo;    // remember last low leaf
					ts = s.HI;     // leaf, go search high
				} else {               // not a leaf
					_dbg_apply('apply LO not leaf', n.key, 'go LO id:', n.lo);
					parents.push(n); // store parent
					n = get(n.lo); // go low (and search low)
				}
			} else if (ts === s.HI) {      // search high
				_dbg_apply('apply HI n', n.key, n.hi);
				if (bdds_non_rec.leaf(n.hi)) {
					_dbg_apply('apply HI leaf', n.key);
					high = n.hi;   // remember last high leaf
					ts = s.OP;     // leaf, do op
				} else {               // not a leaf
					_dbg_apply('apply HI not leaf', n.key, 'go HI id:', n.hi);
					parents.push(n); // store parent
					n = get(n.hi); // go high
					ts = s.LO;     // and search low
				}
			} else if (ts === s.OP) {     // do op and go UP
				_dbg_apply('apply OP', n.key, 'high:', high, 'low:', low);
				nn = r.add(new node(n.v, high, low));
				_dbg_apply('applied child', nn, n.lo, n.key, x, parents);
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
		_dbg_apply('apply returning', nn, 'n:', n.key, 'nn:', nn);
		return nn; // return the last new node
	}
}

module.exports = bdds_non_rec;

},{"./bdds":4,"debug":"debug"}],6:[function(require,module,exports){
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
const _dbg_parser  = require('debug')('tml:parser');
const _dbg_dict    = require('debug')('tml:dict');
const _dbg_pfp     = require('debug')('tml:pfp');
const _dbg_rule    = require('debug')('tml:pfp:rule');
const _dbg_bdd     = require('debug')('tml:bdd:parsed');
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
			const r = s >= 0 ? this.syms[s] : this.vars[-s];
			_dbg_dict(`get(${s}) by id = ${r}`);
			return r;                 //     return symbol by index
		}
		if (s[0] === '?') {               // if s is variable
			const p = this.vars.indexOf(s);
			if (p >= 0) {             //     if variable already in dict
				_dbg_dict(`get(${s}) variable = -${p}`);
				return -p;        //        return its index negated
			}
			this.vars.push(s);        //     else store the variable in dict
			_dbg_dict(`get(${s}) variable = -${this.vars.length-1} (created)`);
			return -(this.vars.length-1); //     and return its index negated
		}
		const p = this.syms.indexOf(s);   // if s is symbol
		if (p >= 0) {                     //     if is symbol in dict
			_dbg_dict(`get(${s}) symbol = ${p}`);
			return p;                 //         return its index
		}
		this.syms.push(s);                //     else store the symbol in dict
		_dbg_dict(`get(${s}) symbol = ${this.syms.length-1} (created)`);
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
			_dbg_rule(`next m[vij]:${vij}:${m[vij]}`);
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
	get_heads(p, hsym, db) {
		_dbg_rule(`get_heads hsym:${hsym}`);
		let x, y, z;
		const n = ((this.w+1)*p.bits+1)*(p.ar+2);
		p.pdbs.setpow(db, this.w, p.maxw);
		if (bdds.leaf(db)) {
			_dbg_rule(`get_heads db:${db} (leaf)`);
			y = bdds.apply_ex(p.pprog, bdds.trueleaf(db) ? h : bdds.F,
				p.pprog, this.x);
			//x = bdds.trueleaf(p.db) ? this.h : bdds.F;
			//_dbg_rule(`     x: ${x} p.db:${p.db} this.h:${this.h}`);
			// remove nonhead variables
			//y = bdds.apply_ex(p.pprog, x, p.pprog, this.x);
			_dbg_rule(`     y: ${y} db:${db} this.h:${this.h}`);
		} else {
			// rule/db conjunction
			_dbg_rule(`get_heads db:${db} this.h:${this.h}`);
			// optimized apply_and_ex
			y = bdds.apply_and_ex(p.pdbs, db, p.pprog, this.h, this.x,
				this.hvars, n);
			// not optimized apply_and_ex (does not work)
			// x = bdds.apply_and(p.pdbs, p.db, p.pprog, this.h);
			// _dbg_rule(`     x: after 'and' ${x} p.db:${p.db} this.h:${this.h}`);
			// y = bdds.apply_ex(p.pprog, x, p.pprog, this.x);
			_dbg_rule(`     y: after 'and_ex' ${y} this.x:[`, this.x.map(x=>x?'1':'0').join(','), ']');
			_dbg_rule(`        this.hvars:[`, this.hvars.join(','), ']');
		}
		// reorder
		z = p.pprog.permute(y, this.hvars, n);
		_dbg_rule(`     z: after permute ${z} this.hvars:[`, this.hvars.join(','), ']');
		z = p.pprog.bdd_and(z, hsym);
		_dbg_rule(`     z: ${z}`);
		p.pdbs.setpow(db, 1, p.maxw);
		return z;
	}
}

// a P-DATALOG rule in bdd form
class rule {
	// initialize rule
	constructor(bdd, v, bits, ar, dsz) {
		_dbg_rule(`new rule bits: ${bits}, ar: ${ar}, v:`, v);
		this.hsym = bdds.T;
		this.hasnegs = false;
		this.hasposs = false;
		this.poss = new rule_items(bits, ar);
		this.negs = new rule_items(bits, ar);
		// hvars = how to permute body vars to head vars
		//   = map of variable's varid to its index in head
		const hvars = {};
		const head = v[v.length-1];
		this.neg = head[0] < 0;
		head.shift();
		_dbg_rule(`    rule head: [ ${head.join(', ')} ]${this.neg?' neg':''}`);
		const BIT = (term, arg, b) => ar*(term*bits+b)+arg;
		for (let i = 0; i != head.length; ++i) {
			if (head[i] < 0) { // var
				hvars[head[i]] = i;
				let rng = bdds.F;
				for (let j = 1; j != dsz; ++j) {
					let elem = bdds.T;
					for (let b = 0; b != bits; ++b) {
						elem = bdd.bdd_and(elem, bdd.from_bit(BIT(0, i, b), j&(1<<b)));
					}
					rng = bdd.bdd_or(rng, elem);
				}
				this.hsym = bdd.bdd_and(this.hsym, rng);
				_dbg_rule(`         head[${i}] = ${head[i]} (var)`, hvars);
			} else { // term
				_dbg_rule(`         head[${i}] = ${head[i]} (sym)`);
				for (let b = 0; b != bits; ++b) {
					const res = bdd.from_bit(BIT(0, i, b), (head[i]&(1<<b))>0);
					const _dbg = this.hsym;
					this.hsym = bdd.bdd_and(this.hsym, res);
					_dbg_rule(`           from_bit(BIT(0,${i},${b}):${BIT(0, i, b)}, ${(head[i]&(1<<b))>0}) = ${res} hsym ${_dbg}->${this.hsym}`);
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
				this.hasposs = true;
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
		for (let i = 0; i != pvars; ++i) { this.poss.hvars[i] = i; }
		for (let i = 0; i != nvars; ++i) { this.negs.hvars[i] = i; }

		// load rule's terms and terms' arguments
		const k = { k: null }; // k & npad are objecs for passing by ref
		const npad = { npad: bdds.F };
		let bneg = false;
		let pp = 0;
		let pn = 0;
		for (let i = 0; i != v.length-1; ++i) {
			k.k = bdds.T;
			bneg = v[i][0] < 0;
			v[i].shift();
			for (let j = 0; j != v[i].length; ++j) {
				const s = (bneg ? this.negs : this.poss);
				_dbg_rule(`\\from_arg i:${i}, j:${j}, k:${k.k}, vij:${v[i][j]}, bits:${bits}, ar:${ar}, npad:${npad.npad}, hvars:`, hvars);
				_dbg_rule(`m:`, m, 'v:', v);
				s.from_arg(bdd, (bneg?pn:pp), j, k, v[i][j], bits, ar, hvars, m, npad);
				_dbg_rule(`/from_arg i:${i}, j:${j}, k:${k.k}, vij:${v[i][j]}, bits:${bits}, ar:${ar}, npad:${npad.npad}, hvars:`, hvars);
				_dbg_rule(`m:`, m, 'v:', v);
			}
			if (bneg) {
				this.negs.h = bdd.bdd_and(this.negs.h, k.k);
				++pn;
			} else {
				this.poss.h = bdd.bdd_and(this.poss.h, k.k);
				++pp;
			}
		}
		const s = bneg ? this.negs : this.poss;
		s.h = bdd.bdd_and_not(s.h, npad.npad);
	}
	// get heads
	get_heads(p) {
		const poss = () => this.poss.get_heads(p, this.hsym, p.db);
		const negs = () => this.negs.get_heads(p, this.hsym, p.ndb);
		if (this.hasnegs && this.hasposs) {
			const possv = poss();
			const negsv = negs();
			return p.pprog.bdd_and(possv, negsv);
		}
		if (this.hasposs) return poss();
		if (this.hasnegs) return negs();
		return bdds.T;
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
		this.ndb = bdds.F;	 // negative root
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
			_dbg_match = t;
			return '';   // remove match from input
		})
		if (!r) {
			_dbg_parser(`str_read ERR from "${_dbg}..."`);
			throw new Error(identifier_expected);
		}
		_dbg_parser(`str_read "${_dbg_match}" (${r}) from "${_dbg}"`);
		return r;
	}
	// read raw term (no bdd)
	term_read(s) {
		const _dbg = s.s.slice(0, s.s.indexOf(`\n`));
		let r = [];
		skip_ws(s);
		if (s.s.length === 0) {
			_dbg_parser(`term_read [] (empty string)`);
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
						_dbg_parser(`term_read ERR from "${_dbg}"`);
						throw new Error(term_expected);
					}
					skip(s, ++i);
					_dbg_parser(`term_read [ ${r.join(', ')} ] from "${_dbg}"`);
					return r;
				}
				if (c === '.' || c === ':') {
					if (r.length === 1) {
						_dbg_parser(`term_read ERR from "${_dbg}"`);
						throw new Error(term_expected);
					}
					skip(s, i);
					_dbg_parser(`term_read [ ${r.join(', ')} ] from "${_dbg}"`);
					return r;
				}
				r.push(this.str_read(s)); i = 0;
			}
		} while (i < s.s.length);
		_dbg_parser(`term_read ERR from "${_dbg}"`);
		throw new Error(comma_dot_sep_expected);
	}
	// read raw rule (no bdd)
	rule_read(s) {
		const _dbg = s.s.slice(0, s.s.indexOf(`\n`));
		let t, r = [];
		if ((t = this.term_read(s)).length === 0) {
			_dbg_parser(`rule_read [] (empty string)`)
			return r;
		}
		r.push(t);
		skip_ws(s);
		if (s.s[0] === '.') { // fact
			skip(s);
			_dbg_parser(`rule_read [ ${r.map(sub=>`[ ${sub.join(', ')} ]`).join(', ')} ] from "${_dbg}"`)
			return r;
		}
		if (s.s.length < 2 || (s.s[0] !== ':' && s.s[1] !== '-')) {
			_dbg_parser(`rule_read ERR from "${_dbg}"`)
			throw new Error (sep_expected);
		}
		skip(s, 2);
		do {
			if ((t = this.term_read(s)).length === 0) {
				_dbg_parser(`rule_read ERR from "${_dbg}"`)
				throw new Error(term_expected);
			}
			r.splice(r.length-1, 0, t); // make sure head is last
			skip_ws(s);
			if (s.s[0] === '.') {
				skip(s);
				_dbg_parser(`rule_read [ ${r.map(sub=>`[ ${sub.join(', ')} ]`).join(', ')} ] from "${_dbg}"`)
				return r;
			}
			if (s.s[0] === ':') {
				_dbg_parser(`rule_read ERR from "${_dbg}"`)
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
		_dbg_parser(`prog_read bits:${this.bits} ar:${this.ar} maxw:${this.maxw}`);
		this.pdbs = new bdds(this.ar * this.bits);
		this.pprog = new bdds(this.maxw * this.ar * this.bits);

		for (let i = 0; i < r.length; i++) {
			const x = JSON.parse(JSON.stringify(r[i])); // clone through JSON
			if (x.length === 1) {
				_dbg_parser('prog_read store fact', x);
				this.db = this.pdbs.bdd_or(this.db,
					new rule(this.pdbs, x, this.bits,
						this.ar, this.d.nsyms).poss.h);
			} else {
				_dbg_parser('prog_read store rule', x);
				this.rules.push(
					new rule(this.pprog, x, this.bits, this.ar,
						this.d.nsyms));
				this.hasnegs = this.hasnegs || this.rules[this.rules.length-1].hasnegs;
			}
		}

		_dbg_bdd(`prog_read pdbs:`, this.pdbs.V.map(n=>`${this.pdbs.M[n.key]}=(${n.key})`).join(', '));
		_dbg_bdd(`prog_read pprog:`, this.pprog.V.map(n=>`${this.pprog.M[n.key]}=(${n.key})`).join(', '));
		_dbg_bdd(`prog_read bits:${this.bits} ar:${this.ar} maxw:${this.maxw} db(root):${this.db}`);

		return r; // return raw rules/facts;
	}
	// single pfp step
	step() {
		let add = bdds.F;
		let del = bdds.F;
		let s;
		if (this.hasnegs) this.ndb = this.pdbs.bdd_and_not(bdds.T, this.db);
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
		_dbg_pfp('db:', this.db, 'add:', add, 'del:', del, 's:', s);
		if ((s === bdds.F) && (add !== bdds.F)) {
			this.db = bdds.F;
			_dbg_pfp('t db set:', this.db);
		} else {
			this.db = dbs.bdd_or(dbs.bdd_and_not(this.db, del), s);
			_dbg_pfp('f db set:', this.db);
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
			_dbg_pfp(`____________________STEP_${t}________________________`);
			_dbg_pfp(`                                                     `);
			this.step();         // do pfp step
			_dbg_pfp('/STEP');
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

},{"./bdds":4,"debug":"debug"}],7:[function(require,module,exports){
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

},{"./lp":6,"_process":3}],"debug":[function(require,module,exports){
(function (process){
/* eslint-env browser */

/**
 * This is the web browser implementation of `debug()`.
 */

exports.log = log;
exports.formatArgs = formatArgs;
exports.save = save;
exports.load = load;
exports.useColors = useColors;
exports.storage = localstorage();

/**
 * Colors.
 */

exports.colors = [
	'#0000CC',
	'#0000FF',
	'#0033CC',
	'#0033FF',
	'#0066CC',
	'#0066FF',
	'#0099CC',
	'#0099FF',
	'#00CC00',
	'#00CC33',
	'#00CC66',
	'#00CC99',
	'#00CCCC',
	'#00CCFF',
	'#3300CC',
	'#3300FF',
	'#3333CC',
	'#3333FF',
	'#3366CC',
	'#3366FF',
	'#3399CC',
	'#3399FF',
	'#33CC00',
	'#33CC33',
	'#33CC66',
	'#33CC99',
	'#33CCCC',
	'#33CCFF',
	'#6600CC',
	'#6600FF',
	'#6633CC',
	'#6633FF',
	'#66CC00',
	'#66CC33',
	'#9900CC',
	'#9900FF',
	'#9933CC',
	'#9933FF',
	'#99CC00',
	'#99CC33',
	'#CC0000',
	'#CC0033',
	'#CC0066',
	'#CC0099',
	'#CC00CC',
	'#CC00FF',
	'#CC3300',
	'#CC3333',
	'#CC3366',
	'#CC3399',
	'#CC33CC',
	'#CC33FF',
	'#CC6600',
	'#CC6633',
	'#CC9900',
	'#CC9933',
	'#CCCC00',
	'#CCCC33',
	'#FF0000',
	'#FF0033',
	'#FF0066',
	'#FF0099',
	'#FF00CC',
	'#FF00FF',
	'#FF3300',
	'#FF3333',
	'#FF3366',
	'#FF3399',
	'#FF33CC',
	'#FF33FF',
	'#FF6600',
	'#FF6633',
	'#FF9900',
	'#FF9933',
	'#FFCC00',
	'#FFCC33'
];

/**
 * Currently only WebKit-based Web Inspectors, Firefox >= v31,
 * and the Firebug extension (any Firefox version) are known
 * to support "%c" CSS customizations.
 *
 * TODO: add a `localStorage` variable to explicitly enable/disable colors
 */

// eslint-disable-next-line complexity
function useColors() {
	// NB: In an Electron preload script, document will be defined but not fully
	// initialized. Since we know we're in Chrome, we'll just detect this case
	// explicitly
	if (typeof window !== 'undefined' && window.process && (window.process.type === 'renderer' || window.process.__nwjs)) {
		return true;
	}

	// Internet Explorer and Edge do not support colors.
	if (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().match(/(edge|trident)\/(\d+)/)) {
		return false;
	}

	// Is webkit? http://stackoverflow.com/a/16459606/376773
	// document is undefined in react-native: https://github.com/facebook/react-native/pull/1632
	return (typeof document !== 'undefined' && document.documentElement && document.documentElement.style && document.documentElement.style.WebkitAppearance) ||
		// Is firebug? http://stackoverflow.com/a/398120/376773
		(typeof window !== 'undefined' && window.console && (window.console.firebug || (window.console.exception && window.console.table))) ||
		// Is firefox >= v31?
		// https://developer.mozilla.org/en-US/docs/Tools/Web_Console#Styling_messages
		(typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/) && parseInt(RegExp.$1, 10) >= 31) ||
		// Double check webkit in userAgent just in case we are in a worker
		(typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().match(/applewebkit\/(\d+)/));
}

/**
 * Colorize log arguments if enabled.
 *
 * @api public
 */

function formatArgs(args) {
	args[0] = (this.useColors ? '%c' : '') +
		this.namespace +
		(this.useColors ? ' %c' : ' ') +
		args[0] +
		(this.useColors ? '%c ' : ' ') +
		'+' + module.exports.humanize(this.diff);

	if (!this.useColors) {
		return;
	}

	const c = 'color: ' + this.color;
	args.splice(1, 0, c, 'color: inherit');

	// The final "%c" is somewhat tricky, because there could be other
	// arguments passed either before or after the %c, so we need to
	// figure out the correct index to insert the CSS into
	let index = 0;
	let lastC = 0;
	args[0].replace(/%[a-zA-Z%]/g, match => {
		if (match === '%%') {
			return;
		}
		index++;
		if (match === '%c') {
			// We only are interested in the *last* %c
			// (the user may have provided their own)
			lastC = index;
		}
	});

	args.splice(lastC, 0, c);
}

/**
 * Invokes `console.log()` when available.
 * No-op when `console.log` is not a "function".
 *
 * @api public
 */
function log(...args) {
	// This hackery is required for IE8/9, where
	// the `console.log` function doesn't have 'apply'
	return typeof console === 'object' &&
		console.log &&
		console.log(...args);
}

/**
 * Save `namespaces`.
 *
 * @param {String} namespaces
 * @api private
 */
function save(namespaces) {
	try {
		if (namespaces) {
			exports.storage.setItem('debug', namespaces);
		} else {
			exports.storage.removeItem('debug');
		}
	} catch (error) {
		// Swallow
		// XXX (@Qix-) should we be logging these?
	}
}

/**
 * Load `namespaces`.
 *
 * @return {String} returns the previously persisted debug modes
 * @api private
 */
function load() {
	let r;
	try {
		r = exports.storage.getItem('debug');
	} catch (error) {
		// Swallow
		// XXX (@Qix-) should we be logging these?
	}

	// If debug isn't set in LS, and we're in Electron, try to load $DEBUG
	if (!r && typeof process !== 'undefined' && 'env' in process) {
		r = process.env.DEBUG;
	}

	return r;
}

/**
 * Localstorage attempts to return the localstorage.
 *
 * This is necessary because safari throws
 * when a user disables cookies/localstorage
 * and you attempt to access it.
 *
 * @return {LocalStorage}
 * @api private
 */

function localstorage() {
	try {
		// TVMLKit (Apple TV JS Runtime) does not have a window object, just localStorage in the global context
		// The Browser also has localStorage in the global context.
		return localStorage;
	} catch (error) {
		// Swallow
		// XXX (@Qix-) should we be logging these?
	}
}

module.exports = require('./common')(exports);

const {formatters} = module.exports;

/**
 * Map %j to `JSON.stringify()`, since no Web Inspectors do that by default.
 */

formatters.j = function (v) {
	try {
		return JSON.stringify(v);
	} catch (error) {
		return '[UnexpectedJSONParseError]: ' + error.message;
	}
};

}).call(this,require('_process'))

},{"./common":1,"_process":3}],"tml":[function(require,module,exports){
"use strict";

module.exports = require('./src/tml.js');

},{"./src/tml.js":7}]},{},[])
//# sourceMappingURL=tml.debug.js.map.js
