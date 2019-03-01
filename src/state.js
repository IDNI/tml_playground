const ui = require('./ui')
const intros = require('./intros');
const { $, checked, get_param, update_location_url, get_title,
	get_link_with_updated_search } = require('./util');
const status = Object.freeze({ error: 0, loaded: 1, running: 2, stopped: 3, finished: 4, unsat: 5 });

class state {
	constructor(lp_class, is) {
		this.sc = 0;
		this.d = 0;
		this.s = [];
		this.p = null;
		this.intros = is;
		this.lp_class = lp_class;
		this.st = status.init;
		this.changed = false;
	}
	is_init()     { return this.st === status.init; }
	is_error()    { return this.st === status.error; }
	is_loaded()   { return this.st === status.loaded; }
	is_running()  { return this.st === status.running; }
	is_stopped()  { return this.st === status.stopped; }
	is_finished() { return this.st === status.finished; }
	is_unsat()    { return this.st === status.unsat; }
	status_toString() {
		if (this.st === undefined) { return 'init'; }
		return Object.keys(status)[this.st];
	}
	load_input() {
		if (this.st === status.running) {
			this.stop();
		}
		// clean output
		ui.clear_steps_tab();
		ui.output_result('');
		// init state
		this.sc = 0; // step counter
		this.d = 0;  // current db root
		this.s = []; // previous steps' db roots
		this.p = new this.lp_class();
		try {
			let source = ui.get_editor_text();
			source = lp.string_read_text(source);
			const raw = this.p.prog_read(source);
			ui.update_input_tab(raw);
			ui.add_step_output();
			ui.output_result(this.p.toString());
			this.st = status.loaded;
			this.changed = false;
			ui.update_status();
		} catch (err) { // parse error
			console.log('Parse error:', err);
			this.st = status.error
			ui.update_status(`parse error: ${err}`);
		}
	}
	reload() { this.stop(); this.load_input(); }
	rerun() { this.stop(); this.step(0); }
	run() { this.step(0); }
	stop() {
		this.st = status.stopped;
		ui.update_status();
		return true;
	}
	// Do N steps. default 1. 0 = infinity (ie. run until a fixed point)
	step(n = 1) {
		console.log(`step ${this.sc} + do ${n} steps. changed:${this.changed} status:${this.status_toString()}`)
		if (this.changed || (!this.is_running() && !this.is_loaded())) { this.load_input(); }
		if (!this.is_running()) { this.sc = 0; }
		this.st = status.running;
		for (let i = 0; n === 0 || i < n; i++) {
			this.d = this.p.db;  // get current db root
			this.s.push(this.d); // store current db root into previous steps
			++this.sc;
			try {
				this.p.step(); // do pfp step
			} catch (err) {
				console.log('error', err);
				this.st = status.error;
				ui.update_status(`error: ${err}`);
				ui.add_step_output();
				return false;
			}
			// FP if db root resulted already from a previous step
			if (this.s.includes(this.p.db)) {
				if (this.d === this.p.db) { // sat
					this.st = status.finished;
				} else {
					this.st = status.unsat;
					ui.output_result(this.p.toString());
				}
				break;
			}
			ui.add_step_output();
			ui.output_result(this.p.toString());
		}
		ui.update_status();
	}
	load_intro(n = 0) {
		let confirmed = true;
		const current = $('editor_textarea').value;;
		// if there is a custom program, ask for confirmation before discarding
		if (current && current.length > 0
		&& !this.intros.programs.includes(current)) {
			confirmed = confirmed
				&& confirm('Do you want to discard your program?');
		}
		if (confirmed) {
			// populate the logic program
			const el = $('editor_textarea');
			el.value = intros.programs[n];
			el.scrollTop = 0;
			this.ci = n;
			update_location_url(get_title(), get_link_with_updated_search('intro='+n));
			this.st = status.stopped;
			ui.update_status();
			if (checked('autorun')) { this.run(); } else {
				if (checked('autoload')) { this.load_input() ; }
			}
		}
		// update (or rollback) intro selection
		$('tests-select').value = this.ci || 0;
	}

	// gets raw facts from the db (sorts if sort_result checked).
	// TODO: move this to tml.js?
	get_raw_db(sort = false) {
		const p = this.p;
		let t = p.dbs.from_bits(p.db, p.bits, p.ar, 1).map(t => [t]);
		if (sort) {
			const cmp = (a, b) => {
				const l = a.length < b.length ? a.length : b.length;
				for (let i = 0; i < l; i++) {
					if (a[i] < b[i]) return -1;
					if (a[i] > b[i]) return 1;
				}
				if (a.length === b.length) return 0;
				return a.length < b.length ? -1 : 1;
			}
			t = t.sort(cmp);
		}
		return t;
	}
}

// create new state
state.create = function (lp) {
	const s = new state(lp, intros);
	const prog = get_param('prog'); // get prog from url
	ui.inject_state(s);
	if (prog && prog.length > 0)  {
		ui.update_editor_text(prog);
	} else { // or load intro if not in URL
		s.load_intro(get_param('intro') || 0);
	}
	ui.update_status();
	return s;
}
state.status = status;
module.exports = state
