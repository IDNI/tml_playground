const status = Object.freeze({
	error: 0,
	init: 1,
	loaded: 2,
	running: 3,
	stopped: 4,
	finished: 5,
	unsat: 6,
	contradiction: 7
});
const status_name = [];
for (let name in status) {
	status_name[status[name]] = name;
}
module.exports = { status, status_name }
