const $ = id => document.getElementById(id); // just a shortcut (jQuery like)

const add_trailing_nl = to => to + to[to.length-1]==`\n` ? '' : `\n`;

function checked(id) { return $(id).checked; } // checkbox checker

function add_class   (el, c) { if (!el.classList.contains(c)) el.classList.add(c); }
function remove_class(el, c) { if ( el.classList.contains(c)) el.classList.remove(c); }

// gets page title
function get_title() { return document.getElementsByTagName("title")[0].innerHTML; }
// gets url of the current page
function get_link() { return window.location.href; }
function get_link_with_updated_search(search) {
	const l = window.location;
	return loc = l.protocol+'//'+l.host+l.pathname+'?'+search;
}
function update_location_url(title, url) {
	if (typeof (history.pushState) !== 'undefined') {
		const s = { Title: title, Url: url };
		history.pushState(s, s.Title, s.Url);
	}
}
let params = null;
function get_param(p) {
	if (!params) params = new URLSearchParams(window.location.search);
	return params.get(p);
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

module.exports = {
	$, debounce, get_param, update_location_url,
	add_class, remove_class, checked, get_title,
	get_link, get_link_with_updated_search,
	add_trailing_nl
}
