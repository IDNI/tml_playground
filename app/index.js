const forever = require('forever-monitor');
const child = new (forever.Monitor)('app.js', { args: []});
child.start();
