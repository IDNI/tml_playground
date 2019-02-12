const { lp } = require('tml');
const s = {    // running state
    running: false,
    result: '' // output of the program
}
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
    const lp_ta = document.getElementById('logic_program');
    let source = lp_ta.value;
    lp_ta.readOnly = "true";
    // clear output and show running status
    document.getElementById('output').innerText = 'running...';
    try {
         // strip comments and multiple lines
        source = lp.string_read_text(source);
        // document.getElementById('running_program')
        // 	.innerHTML = source.replace(/\n+/gm, `<br/>`);
        s.raw = s.p.prog_read(source);
        update_running_program();
        // console.log("program dict: ", s.p.d);
        // console.log('raw rules:', s.raw);
    } catch (err) { // parse error
        console.log('Parse error:', err);
        s.result = `Parse error: ${err}`;
    }
    show_status();
}
function restart() {
    s.running = false;
    start();
}
function stop() {
    s.running = false;
    document.getElementById('logic_program').readOnly = "false";
    show_status();
    output_result(s.p.toString());
}
function rerun() { s.running = false; run(); }
function run() { step(0); }
// Do N steps. default 1. 0 = infinity (ie. run until a fixed point)
function step(n = 1) {
    if (!s.running) {
        start();
    }
    for (let i = 0; n === 0 || i < n; i++) {
        s.d = s.p.db;  // get current db root
        s.s.push(s.d); // store current db root into previous steps
        console.log(`step: ${++s.step} nodes: ${s.p.pdbs.length}` +
            ` + ${s.p.pprog.length}\n`);
        try {
            s.p.step(); // do pfp step
        } catch (err) {
            console.log('Runtime error', err);
            s.result = `Runtime error: ${err}`;
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
            document.getElementById('logic_program').removeAttribute('readOnly');
            break;
        }
        output_result(s.p.toString());
    }
    show_status();
}
function output_result(result) {
    // sort output if sort-result checked
    if (document.getElementById('sort-result').checked) {
        result = result.split(`\n`).sort().join(`\n`);
    }
    result = result.trim();
    // add info if show-info checked
    if (document.getElementById('show-info').checked) {
        result = `# STEP: ${s.step} ` +
            `STATUS: ${s.running?'RUNNING':'STOPPED'}\n\n` + result;
    }
    // update output textarea with new output
    const output = document.getElementById('output');
    output.innerHTML = result;
    // autoscroll if checked
    if (document.getElementById('autoscroll').checked) {
        output.scrollTop = output.scrollHeight
    }
    // update output
    get_raw_db();
}
function update_dictionary() {
    const table = (a, neg = false) => {
        let res = `<table>\n    <tr><th colspan="2">${neg?'variables':'symbols'}</th></tr>\n`;
        for (let i = 1; i < a.length; i++) {
            res += `    <tr><td class="dict-value">${a[i]}</td><td class="dict-index">${neg?'-':''}${i}</td></tr>\n`
        }
        return res + `</table>\n`;
    }
    document.getElementById('dict_syms').innerHTML = table(s.p.d.syms);
    document.getElementById('dict_vars').innerHTML = table(s.p.d.vars, true);
}
// output content raw facts from the db
function get_raw_db() {
    const p = s.p;
    let t = p.pdbs.from_bits(p.db, p.bits, p.ar, 1);
    if (document.getElementById('sort-result').checked) {
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
    let res = '';
    console.log(t);
    return res;
}

function update_running_program() {
    const arg_toString = (a, hilight = 'body') => {
        if (a == 0) { return false; }
        return `<span title="${a}"><sub class="varid">${a}</sub><span class="hilight_${hilight}${a<0?' hilight_variable':''}">${s.p.d.get(a)}</span></span>`;
    }
    const term_toString = (t, hilight = 'body') => {
        const res = `${t[0]<0 ? '<span class="hilight_punctuation">~</span>' : ''}` +
            `${t.slice(1).map(a=>arg_toString(a, hilight)).filter(str=>str!==false).join(' ')}`;
        return res;
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
                //console.log('res before adding body term, ', i, res);
                res += term_toString(r[i], 'body') + (i+1 < body_len ? '<span class="hilight_punctuation">,</span> ' : '');
                //console.log('res after adding body term, ', i, res);
            }
        }
        res += `<span class="hilight_punctuation">.</span><br/>\n`;
        return res;
    }
    document.getElementById('running_program')
        .innerHTML = s.raw.map(rule_toString).join('');
    update_dictionary();
}
function show_status() {
    const rs = document.getElementById('running_status');
    const ss = document.getElementById('step_status');
    const sb = document.getElementById('stop_button');
    rs.innerText = s.running ? 'true' : 'false';
    ss.innerText = s.running ? s.step : 'n/a';
    sb.classList = "button" + (s.running ? "" : " disabled-button");
}
function link() {
    const href = window.location.href;
    const prog = document.getElementById('logic_program').value;
    href.search = 'prog=' + encodeURIComponent(prog);
    const link = prompt(`Open URL in new window?\nOr copy to clipboard and cancel.`, href);
    if (link != null) {
        window.open(linke, '_blank');
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
}
function init_playground() {
    const prog = new URLSearchParams(window.location.search).get('prog');
    if (prog && prog.length > 0)  { // load prog from URL
        document.getElementById('logic_program').value = prog;
    } else { // or load intro if not in URL
        test(9);
    }
    show_status();
}
