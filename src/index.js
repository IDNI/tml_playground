const index = require('marko').load(require.resolve('./index.marko'));
index
	.render({})
	.then (t => { const el = document.getElementById('playground'); t.appendTo(el); })
	.catch (console.log);
