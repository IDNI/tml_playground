const tml = require('tml.js/browser.js');
const bdd = tml.bdd;
const orig_driver = tml.driver;
const { status } = require('./status');

class driver extends orig_driver {
	static get bdd() { return bdd; }
	constructor(rp) {
		super(rp);
		this.step = 0;
		this.db = 0;
		this.s = [];
		this.bdd = bdd;
		this.add = { add: bdd.F };
		this.del = { del: bdd.F };
		this.steps = [];
		this.steps_raw = [];
		this.remember_step();
	}
	remember_step() {
		if (this.prog) {
			this.steps[this.steps.length] = this.toString();
			this.steps_raw[this.steps_raw.length] = this.prog.getbdd(this.prog.db);
		}
	}
	pfp() {
		const st = this.pfp_step(0);
		return st === status.running || st === status.finished;
	}
	pfp_step(n = 1) {
		if (!this.prog) return 0;
		let st = status.running;
		//console.log(`step ${this.step}, ${n===0?'run':n===1?'do step':`do ${n} steps`}`);
		for (let i = 0; n === 0 || i < n; i++) {
			this.db = this.prog.db;  // get current db root
			this.s[this.s.length] = this.db; // store current db root into previous steps
			try {
				this.prog.fwd(this.add, this.del); // do pfp step
			} catch (err) {
				console.log('error', err);
				return status.error;
			}
			++this.step;
			this.remember_step();
			const t = bdd.and_not(this.add.add, this.del.del);
			if (t === bdd.F && this.add.add !== bdd.F) {
				return status.contradiction;
			} else {
				this.prog.db = bdd.or(bdd.and_not(this.prog.db, this.del.del), t)
			}
			if (this.db === this.prog.db) {
				st = status.finished;
				this.db = this.prog.db;
				for (let i = 0; i !== this.builtin_symbdds.length; ++i) {
					this.db = bdd.and_not(this.db, this.builtin_symbdds[i]);
				}
				break;
			}
			if (this.s.includes(this.prog.db)) {
				return status.unsat;
			}
		}
		return st;
	}
}

module.exports = driver;
