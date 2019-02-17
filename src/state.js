const ui = require('./ui')
const intros = require('./intros');
const { $, get_param, update_location_url, get_title,
	get_link_with_updated_search } = require('./util');

class state {
	constructor(lp_class, is) {
		this.running = false;
		this.unsat = false;
		this.error = null;
		this.sc = 0;
		this.d = 0;
		this.s = [];
		this.p = null;
		this.intros = is;
		this.lp_class = lp_class;
	}
	load_input() {
		if (this.running) {
			console.log('stop running before load.');
			return;
		}
		// clean output
		ui.clear_steps_tab();
		ui.output_result('# loading...');
		// init state
		this.sc = 0; // step counter
		this.d = 0;    // current db root
		this.s = [];   // previous steps' db roots
		this.p = new this.lp_class();
		let source = ui.get_editor_text();
		try {
			// strip comments and multiple lines
			source = lp.string_read_text(source);
			const raw = this.p.prog_read(source);
			ui.update_input_tab(raw);
			ui.add_step_output();
			ui.output_result(ui.raw_toString(raw));
		} catch (err) { // parse error
			console.log('Parse error:', err);
			this.error = `Parse error: ${err}`;
			this.running = false;
		}
		ui.output_result('# loaded');
	}
	run() { return this.step(0); }
	stop() {
		this.running = false;
		this.stopped = true;
		ui.update_status_bar();
		return true;
	}
	// Do N steps. default 1. 0 = infinity (ie. run until a fixed point)
	step(n = 1) {
		this.unsat = false;
		this.stopped = false;
		if (!this.running) {
			this.load_input();
		}
		this.running = true;
		for (let i = 0; n === 0 || i < n; i++) {
			this.d = this.p.db;  // get current db root
			this.s.push(this.d); // store current db root into previous steps
			++this.sc;
			try {
				this.p.step(); // do pfp step
			} catch (err) {
				console.log('Runtime error', err);
				this.error = `Runtime error: ${err}`;
				this.running = false;
				ui.update_status_bar();
				ui.add_step_output();
				return false;
			}
			// FP if db root resulted already from a previous step
			if (this.s.includes(this.p.db)) {
				if (this.d === this.p.db) { // sat
					ui.output_result(this.p.toString());
				} else {
					this.unsat = true;
				}
				this.d = 0;
				this.running = false;
				break;
			}
			ui.add_step_output();
			ui.output_result(this.p.toString());
		}
		ui.update_status_bar();
	}
	load_intro(n = 0) {
		this.running = false;
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
		}
		// update (or rollback) intro selection
		$('tests-select').value = this.ci || 0;
	}

	// gets raw facts from the db (sorts if sort_result checked).
	// TODO: move this to tml.js?
	get_raw_db(sort = false) {
		const p = this.p;
		let t = p.pdbs.from_bits(p.db, p.bits, p.ar, 1).map(t => [t]);
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
		/* checked('live_coding') ? s.run() : */ s.load_input();
	}
	ui.update_status_bar();
	return s;
}

module.exports = state
