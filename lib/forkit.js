var TCP = process.binding("tcp_wrap").TCP;
var Pipe = process.binding("pipe_wrap").Pipe;
var Process = process.binding("process_wrap").Process;
var constants = process.binding("constants");

function cluster(options) {
	if (!(this instanceof cluster)) return new cluster(options);
	var _cluster = this;
	var id = 0;
	var workers = [];
	var magic = new Buffer([0,1,2,3]);
	this.workers = workers;
	options.args.unshift(process.execPath);
	this.fork = function(cb) {
		var children = options.workers;
		process.on("uncaughtException", function(ex) {
			workers.forEach(function(worker) {
				worker.kill();
			});
			process.exit(1)
		});
		function Worker(socket) {
			var _worker = this;
			var ipc = new Pipe(true);
			var env = process.env;
			var cenv = [];
			_worker.onexit = function() {};
			for (var key in env) {
				cenv.push(key + "=" + env[key]);
			}
			var opt = {
				file: process.execPath,
				args: options.args,
				cwd: options.cwd,
				envPairs: cenv,
				stdinStream: ipc,
				stdoutStream: new Pipe(false),
				stderrStream: new Pipe(false)
			};
			var worker = new Process();
			function start() {
				worker.spawn(opt);
				_worker.pid = worker.pid;
				_worker.exitCode = 0;
				_worker.signalCode = 0;
				_worker.id = id++;
				worker.onexit = function(exitCode, signalCode) {
					_worker.exitCode = exitCode;
					_worker.signalCode = signalCode;
					//worker.close();
					if(options.onexit) {
						if(options.onexit.call(_cluster, _worker)) {
							start();
						}
					}
				}
				var writeReq = ipc.write(magic, 0, 4, socket);
			    if (!writeReq) {
					if(options.onstart) options.onstart(_cluster, new Error("IPC write error: " + errno));
			    }
			    writeReq.oncomplete = function(status, handle, r, buffer) {
					if(status != 0) {
						if(options.onstart) options.onstart.call(_cluster, new Error("IPC failed: " + errno));
					}
					else {
						if(options.onstart) options.onstart.call(_cluster, null, _worker);
					}
				};
			}
			this.stop = function() {
				worker.kill(constants.SIGTERM);
			}
			start();
		}
		var socket;
		var res;
		if(options.type.toLowerCase() === "tcp") {
			socket = new TCP();
			res = socket.bind(options.host, options.port);
		}
		else {
			socket = new Pipe();
			res = socket.bind(options.port);
		}
		if(res != 0) {
			if(options.onerror) options.onerror.call(_cluster, new Error("bind error: " + errno));
		}
		else {
			while(children--) {
				try {
					var w = new Worker(socket);
					workers.push(w);
				}
				catch(err) {
					if(options.onerror) options.onerror.call(_cluster, err);
				}
			}
		}
	}
}
function worker(cb) {
	if (!(this instanceof worker)) return new worker(cb);
	try {
		var p = new Pipe(true);
		p.open(0);
		p.onread = function(pool, offset, length, handle) {
			if(handle) {
				cb(null, handle, pool.slice(offset, offset + length));
				// close stdin
				p.onread = function() {};
				p.close();
			}
			else {
				cb(err);
			}
		}
		p.readStart();
	}
	catch(err) {
		cb(err);
	}
}
exports.Cluster = cluster;
exports.Worker = worker;