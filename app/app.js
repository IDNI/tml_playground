const express = require('express');
const logger = require('morgan');
const { join } = require('path');
const { spawn } = require('child_process');

const app = express();

function error(status, msg) {
  var err = new Error(msg);
  err.status = status;
  return err;
}

function tml(logic_program) {
  return new Promise((resolve, reject) => {
	const tml = spawn('/home/tau/tml');
	let data = '';
	tml.stdout.on('data', (chunk) => { data += chunk; });
	tml.stderr.on('data', (err) => {
	  console.log('rejecting from stderr: ', err.toString());
	  reject(err.toString());
	});
	tml.on('error', (err) => {
	  console.log('error: ', err);
	  reject(err);
	});
	tml.on('close', (code) => {
	  //console.log(`child process exited with code ${code}`);
	  if (code == 0) {
		//console.log('resolving: ', data.toString());
		resolve(data.toString());
	  } else {
		if (!code) {
		  reject(`tml haven't returned any exit code (probably segmentation fault)\n\noutput:\n\n${data}`)
		} else {
		  reject(`tml exited with code ${code}\n\noutput:\n\n${data}`)
		}
	  }
	});
	tml.stdin.write(logic_program);
	tml.stdin.end();
  });
}

// log HTTP requests
app.use(logger('default'));

// remote running endpoint if not disabled by DISABLE_REMOTE=true
if (process.env.DISABLE_REMOTE !== "true") {
	// body parser
	app.use (function(req, res, next) {
		var data='';
		req.setEncoding('utf8');
		req.on('data', function(chunk) {
		data += chunk;
		});
		req.on('end', function() {
			req.body = data;
			next();
		});
	});
	// tml endpoint
	app.post('/tml', async function(req, res, next) {
		try {
			let output = await tml(req.body);
			console.log('Tau-commit:', process.env.TAU_COMMIT);
			res.header('Tau-commit', process.env.TAU_COMMIT);
			//output = `# `+process.env.TAU_COMMIT+`\n\n`+output;
			res.send(output);
		} catch (e) {
			next(error(500, e));
		}
	});
}

// provide static files: index.html and tml*.js
app.use('/', express.static(join(__dirname, 'static')));

// error handler fallback
app.use(function(err, req, res, next){
  res.status(err.status || 500);
  res.send({ error: err.message });
});

// 404 error handler fallback
app.use(function(req, res){
  res.status(404);
  res.send({ error: "Not found" });
});

if (!module.parent) {
  app.listen(4000);
  console.log('Tau started on port 4000');
}
