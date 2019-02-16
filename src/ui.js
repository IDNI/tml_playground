const { $, debounce, checked, add_class, remove_class,
	update_location_url, add_trailing_nl, get_title,
	get_link_with_updated_search } = require('./util');
const { find_intro } = require('./intros');

let s = {}; // state
const tabs = Object.freeze([ 'output', 'input', 'steps' ]);

function clear_steps_tab() { $('steps').innerText = ''; }
function debounce_live_coding () { return debounce(rerun, 200); }
function on_program_change() {
	if (checked('live_coding')) {
		debounce_live_coding();
	}
	const intro_id = find_intro(ui.get_editor_text());
	const search = intro_id === -1 // no intro in editor
		? 'prog=' +
			encodeURIComponent(add_trailing_nl(get_editor_text()))
			.replace(/%20/g, '+') // post-encode spaces as pluses
		: `intro=${intro_id}`;
	update_location_url(get_title(), get_link_with_updated_search(search));
	return true;
}
function activate_tab(tab) {
	// hide all tabs but the 'tab'
	for (let i = 0; i < tabs.length; i++) {
		if (tabs[i] == tab) {
			remove_class( $(`tab_${tabs[i]}`), "hide");
			add_class($(`tab_${tabs[i]}_activator`), "active-tab-activator");
		} else {
			add_class( $(`tab_${tabs[i]}`), "hide");
			remove_class($(`tab_${tabs[i]}_activator`), "active-tab-activator");
		}
	}
}
function toggle_step_details(step) {
	$(`step_${step}_details`).classList.toggle("hide");
	$(`step_${step}_activator`).classList.toggle("step-active");
}
function update_input_tab(raw) {
	const dict_out = (a, vars = false) => {
	let res = `#<br/>\n# <strong>${vars?'variables':'symbols'}</strong>:${a.length===1?' n/a':'<br/>\n# '}`;
		for (let i = 1; i < a.length; i++) {
			res += `<sub class="dictid">${vars?'-':''}${i}</sub><span title="${a[i]}"${vars?` class="hilight_variable"`:''}>${a[i]}${i<a.length-1?', ':''}</span> `;
			if (i < a.length-1 && i % 10 === 0) res += `<br/>\n#`;
		}
		return res + `<br/>\n`;
	}
	$('input_program').innerHTML = raw_toString(raw, true);
	$('dict_vars').innerHTML = dict_out(s.p.d.vars, true);
	$('dict_syms').innerHTML = dict_out(s.p.d.syms);
}
function get_editor_text() { return $('editor_textarea').value; }
function update_editor_text(text) { $('editor_textarea').value = text; }
function update_output_text(text) { $('output_textarea').value = text; }
function update_status_bar() {
	const sb = $('stop_button');
	sb.classList = "button" + (s.running ? "" : " disabled-button");
	// status-bar update
	$('status_bar').innerHTML = 'status: ' + (s.running
		? '<span class="status running">' + (s.sc > 0
				? `running</span> step: <strong>${s.sc}</strong>`
				: `started</span>`)
		: ((s.stopped
				? `<span class="status stopped">stopped`
				: `<span class="status finished">finished`) +
			`</span> step: <strong>${s.sc}</strong>`)) +
		(s.p ? ` nodes: <strong>${s.p.pdbs.length} + ${s.p.pprog.length}</strong>` : '');
}
function output_result(result) {
	// sort output if sort-result checked
	if (checked('sort_result')) {
		result = result.split(`\n`).sort().join(`\n`);
	}
	// update output textarea
	update_output_text(result.trim());
}
function add_step_output(result) {
	// add step output from raw db
	const facts = s.get_raw_db(checked('sort_result'));
	const s_div = document.createElement('div');
	s_div.id = `step_${s.sc}`;
	s_div.innerHTML =
		`	<div id="step_${s.sc}_activator" class="step-activator" onclick="toggle_step_details(${s.sc})">` +
		`STEP ${s.sc} <span class="collapser">&#9654;</span>` +
		(s.p ? ` nodes: ${s.p.pdbs.length} + ${s.p.pprog.length}` : '') +
		`</div>\n` +
		`	<div id="step_${s.sc}_details" class="step-details">\n` + raw_toString(facts) + `\n</div>`
	$('steps').insertAdjacentElement("beforeend", s_div);
	if (s.sc > 0) { // collapse previous step
		add_class($(`step_${s.sc-1}_details`), "hide");
	}
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
// offers to open the current editor source in a new window.
function link() {
	const link = prompt(`Open URL in new window?\n` +
	`Or copy to clipboard and cancel.`, get_link());
	if (link != null) {
		window.open(link, '_blank');
	}
}

function inject_state(state) {
	s = state;
}

module.exports = {
	inject_state,
	tabs, link, clear_steps_tab, debounce_live_coding, on_program_change,
	activate_tab, toggle_step_details, update_input_tab,
	get_editor_text, update_editor_text, update_output_text,
	update_status_bar, output_result, add_step_output, raw_toString
}
