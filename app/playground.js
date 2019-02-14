const { lp } = require('tml');
const s = {    // running state
	running: false,
	result: '' // output of the program
}
const _counters = {
	output: 0
}
const tabs = [ 'output', 'input', 'steps' ];

function start() {
	if (s.running) {
		console.log('Already running. Cannot start.');
		return;
	}
	// init state
	s.running = true;
	s.result = '';
	s.step = 0; // step counter
	s.d = 0;    // current db root
	s.s = [];   // previous steps' db roots
	s.raw = []; // empty raw program
	s.p = new lp();
	// read logic program from the input textarea
	let source = document.getElementById('editor_textarea').value;
	// clear steps, output and show running status
	document.getElementById('steps').innerText = '';
	document.getElementById('output_textarea').innerText = '';
	try {
		// strip comments and multiple lines
		source = lp.string_read_text(source);
		s.raw = s.p.prog_read(source);
		update_input_program();
		output_result(s.p.toString());
	} catch (err) { // parse error
		console.log('Parse error:', err);
		s.result = `Parse error: ${err}`;
		s.running = false;
	}
	update_status();
}
function restart() {
	s.running = false;
	start();
}
function stop() {
	s.running = false;
	s.stopped = true;
	update_status();
}
function rerun() { s.running = false; run(); }
function run() { step(0); }
// Do N steps. default 1. 0 = infinity (ie. run until a fixed point)
function step(n = 1) {
	s.stopped = false;
	if (!s.running) {
		start();
	}
	for (let i = 0; n === 0 || i < n; i++) {
		s.d = s.p.db;  // get current db root
		s.s.push(s.d); // store current db root into previous steps
		++s.step;
		try {
			s.p.step(); // do pfp step
		} catch (err) {
			console.log('Runtime error', err);
			s.result = `Runtime error: ${err}`;
			s.running = false;
			update_status();
			output_result(s.result);
			return false;
		}
		// FP if db root resulted already from a previous step
		if (s.s.includes(s.p.db)) {
			if (s.d === s.p.db) {
				s.result = s.p.toString(); // sat
			} else {
				s.result = 'unsat';
			}
			s.d = 0;
			s.running = false;
			output_result(s.result);
			break;
		}
		output_result(s.result);
	}
	update_status();
}
function toggle_step_details(step) {
	document.getElementById(`step_${step}_details`).classList.toggle("hide");
	document.getElementById(`step_${step}_activator`).classList.toggle("step-active");
}
function output_result(result) {
	// add step output from raw db
	const facts = get_raw_db();
	const s_div = document.createElement('div'); s_div.id = `step_${s.step}`;
	s_div.innerHTML =
		`	<div id="step_${s.step}_activator" class="step-activator" onclick="toggle_step_details(${s.step})">` +
		`STEP ${s.step} <span class="collapser">&#9654;</span>` +
		` nodes: ${s.p.pdbs.length} + ${s.p.pprog.length}` +
		`</div>\n` +
		`	<div id="step_${s.step}_details" class="step-details">\n` + raw_toString(facts) + `\n</div>`
	document.getElementById('steps').insertAdjacentElement("beforeend", s_div);
	if (s.step > 0) { // collapse previous step
		addClass(document.getElementById(`step_${s.step-1}_details`), "hide");
	}
	// sort output if sort-result checked
	if (document.getElementById('sort_result').checked) {
		result = result.split(`\n`).sort().join(`\n`);
	}
	result = result.trim();
	// update output textarea with new output
	document.getElementById('output_textarea').value = result;
}
function addClass   (elem, c) { if (!elem.classList.contains(c)) elem.classList.add(c); }
function removeClass(elem, c) { if ( elem.classList.contains(c)) elem.classList.remove(c); }
function activate_tab(tab) {
	// hide all tabs but the 'tab'
	for (let i = 0; i < tabs.length; i++) {
		const el_tab = document.getElementById(`tab_${tabs[i]}`);
		const el_activator = document.getElementById(`tab_${tabs[i]}_activator`);
		if (tabs[i] == tab) {
			removeClass(el_tab, "hide");
			addClass(el_activator, "active-tab-activator");
		} else {
			addClass(el_tab, "hide");
			removeClass(el_activator, "active-tab-activator");
		}
	}
}
// output content raw facts from the db
function get_raw_db() {
	const p = s.p;
	let t = p.pdbs.from_bits(p.db, p.bits, p.ar, 1).map(t=>[t]);
	if (document.getElementById('sort_result').checked) {
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
function raw_toString(raw, negs = false) {
	const arg_toString = (a, hilight = 'body') => {
		if (a == 0) { return false; }
		const str = s.p.d.get(a);
		return `<span title="${str}"><sub class="dictid">${a}</sub><span class="hilight_${hilight}${a<0?' hilight_variable':''}">${str}</span></span>`;
	}
	const term_toString = (t, hilight = 'body') => {
		const neg = negs && (t[0] < 0);
		const negative_head = neg && (hilight === 'head');
		return (neg // if neg negative add '~'
				? `<span class="hilight_${negative_head ? 'negative_head' : hilight}">~</span>`
				: '') +
			t.slice(negs?1:0).map(a => arg_toString(a, negative_head ? 'negative_head' : hilight))
				.filter(str=>str!==false)
				.join(' ');
	}
	const rule_toString = r => {
		const body_len = r.length-1;
		const is_rule = body_len > 0;
		// head or fact
		let res = term_toString(r[r.length-1], is_rule ? 'head' : 'fact');
		 // and rule body terms if any
		 if (is_rule) {
			res += ' <span class="hilight_punctuation">:-</span> ';
			for (let i = 0; i < body_len; i++) {
				res += term_toString(r[i], 'body') + (i+1 < body_len ? '<span class="hilight_punctuation">,</span> ' : '');
			}
		}
		res += `<span class="hilight_punctuation">.</span><br/>\n`;
		return res;
	}
	const rendered = raw.map(rule_toString).join('');
	if (!negs) return rendered;
	const legend = (rendered.length > 0 ? `<br/>\n` : '') +
		'# <strong>legend</strong>:<br/>\n# <sub class="dictid">var/sym id</sub><span class="hilight_fact">facts</span>' +
		(negs ? `, <span class="hilight_head">heads (adds)</span>, <span class="hilight_negative_head">negative heads (dels)</span>, `+
			`<span class="hilight_body">bodies (conditions)</span>` : '');
	return rendered + legend;
}
function update_input_program() {
	const dict_out = (a, vars = false) => {
	let res = `#<br/>\n# <strong>${vars?'variables':'symbols'}</strong>:${a.length===1?' n/a':'<br/>\n# '}`;
		for (let i = 1; i < a.length; i++) {
			res += `<sub class="dictid">${vars?'-':''}${i}</sub><span title="${a[i]}"${vars?` class="hilight_variable"`:''}>${a[i]}${i<a.length-1?', ':''}</span> `;
			if (i < a.length-1 && i % 10 === 0) res += `<br/>\n#`;
		}
		return res + `<br/>\n`;
	}
	document.getElementById('input_program').innerHTML = raw_toString(s.raw, true);
	document.getElementById('dict_vars').innerHTML = dict_out(s.p.d.vars, true);
	document.getElementById('dict_syms').innerHTML = dict_out(s.p.d.syms);
}
function update_status() {
	const sb = document.getElementById('stop_button');
	sb.classList = "button" + (s.running ? "" : " disabled-button");
	// status-bar update
	document.getElementById('status_bar').innerHTML = 'status: ' + (s.running
		? '<span class="status running">' + (s.step > 0
				? `running</span> step: <strong>${s.step}</strong>`
				: `started</span>`)
		: ((s.stopped
				? `<span class="status stopped">stopped`
				: `<span class="status finished">finished`) +
			`</span> step: <strong>${s.step}</strong>`)) +
		` nodes: <strong>${s.p.pdbs.length} + ${s.p.pprog.length}</strong>`;
}
function link() {
	const prog = document.getElementById('editor_textarea').value;
	const intro_id = get_intro_id(prog);
	const search = intro_id === -1 ? 'prog=' + encodeURIComponent(prog + `\n`) : `intro=${intro_id}`;
	const loc = window.location.protocol + '//' + window.location.host +
		window.location.pathname + '?' + search;
	const link = prompt(`Open URL in new window?\nOr copy to clipboard and cancel.`, loc);
	if (link != null) {
		window.open(link, '_blank');
	}
}
// Returns a function, that, as long as it continues to be invoked, will not
// be triggered. The function will be called after it stops being called for
// N milliseconds. If `immediate` is passed, trigger the function on the
// leading edge, instead of the trailing.
// https://davidwalsh.name/javascript-debounce-function
function debounce(fn, wait, immediate) {
	let t;
	return () => {
		const a = arguments;
		const l = () => {
			t = null;
			if (!immediate) fn.apply(this, a);
		};
		var its_time = immediate && !t;
		clearTimeout(t);
		t = setTimeout(l, wait);
		if (its_time) fn.apply(this, a);
	};
};
const debounce_live_coding = debounce(rerun, 200);
function on_program_change() {
	if (document.getElementById('live_coding').checked) {
		debounce_live_coding();
	}
	return true;
}
function init_playground() {
	const params = new URLSearchParams(window.location.search);
	const prog = params.get('prog');
	if (prog && prog.length > 0)  { // load prog from URL
		document.getElementById('editor_textarea').value = prog;
	} else { // or load intro if not in URL
		intro(params.get('intro') || 0);
	}
	update_status();
}
