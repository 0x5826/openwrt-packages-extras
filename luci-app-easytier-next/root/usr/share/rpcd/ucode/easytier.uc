'use strict';

import { connect } from 'ubus';
import { access, readfile, writefile, stat, popen } from 'fs';

function exec(cmd) {
	let p = popen(cmd, 'r');
	if (!p) return { code: -1, stdout: [] };
	let out = [];
	while (true) {
		let line = p.read('line');
		if (line == null) break;
		push(out, rtrim(line, '\r\n'));
	}
	let code = p.close();
	return { code: code, stdout: out };
}

function trim(s) {
	if (s == null) return '';
	return replace('' + s, /^[\s\r\n]+|[\s\r\n]+$/g, '');
}

function get_procd_status(instance_name) {
	let u = connect();
	if (!u) return { running: false };

	let res = u.call('service', 'list', { name: 'easytier' });
	if (res && res['easytier'] && res['easytier'].instances) {
		let instances = res['easytier'].instances;
		let inst = instances[instance_name || 'core'];
		if (inst && inst.running)
			return { running: true, pid: inst.pid };
	}
	return { running: false };
}

function get_rogue_pid(bin_name, managed_pid) {
	let res = exec('pidof ' + bin_name + ' 2>/dev/null');
	if (res.code == 0 && length(res.stdout) > 0) {
		let pid_str = trim(join(' ', res.stdout));
		if (pid_str != '') {
			let pids = split(pid_str, /\s+/);
			for (let i = 0; i < length(pids); i++) {
				let pid = pids[i];
				if (pid != '' && (managed_pid == null || pid != ('' + managed_pid)))
					return +pid;
			}
		}
	}
	return null;
}

function get_service_state(bin_name, instance_name) {
	let procd_st = get_procd_status(instance_name);
	let rogue_pid = get_rogue_pid(bin_name, procd_st.pid);

	let state = 'stopped';
	if (procd_st.running)
		state = 'managed';
	else if (rogue_pid)
		state = 'unmanaged';

	return {
		state: state,
		running: (state != 'stopped'),
		pid: procd_st.pid || rogue_pid || null
	};
}

function get_cached_version() {
	const cache_file = '/tmp/easytier_version.cache';
	const bin_path = '/usr/bin/easytier-core';
	if (!access(bin_path)) return 'Unknown';

	let bin_st = stat(bin_path);
	let cache_st = access(cache_file) ? stat(cache_file) : null;

	if (cache_st && cache_st.size > 0 && bin_st && cache_st.mtime >= bin_st.mtime) {
		let cached = trim(readfile(cache_file) || '');
		if (cached != '') return cached;
	}

	let ver_res = exec(bin_path + ' --version 2>/dev/null');
	if (ver_res.code == 0 && length(ver_res.stdout) > 0) {
		let ver_line = trim(ver_res.stdout[0]);
		if (ver_line != '') {
			writefile(cache_file, ver_line + '\n');
			return ver_line;
		}
	}
	return 'Unknown';
}

const methods = {};

methods.get_status = {
	call: function() {
		let core_st = get_service_state('/usr/bin/easytier-core', 'core');
		let web_st = get_service_state('/usr/bin/easytier-web', 'web');

		let data = {
			installed: access('/usr/bin/easytier-core'),
			version: get_cached_version(),
			core: core_st,
			web: web_st,
			node_info: null
		};

		if (core_st.running && access('/usr/bin/easytier-cli')) {
			let node_res = exec('/usr/bin/easytier-cli node 2>/dev/null');
			if (node_res.code == 0 && length(node_res.stdout) > 0) {
				data.node_info = join('\n', node_res.stdout);
			}
		}

		return data;
	}
};

methods.get_peers = {
	call: function() {
		if (!access('/usr/bin/easytier-cli')) {
			return { peers: [], raw: '' };
		}

		let peer_res = exec('/usr/bin/easytier-cli peer 2>/dev/null');
		let raw_output = (peer_res.code == 0) ? join('\n', peer_res.stdout) : '';
		let peers = [];
		if (peer_res.code == 0 && length(peer_res.stdout) > 0) {
			for (let i = 0; i < length(peer_res.stdout); i++) {
				let line = trim(peer_res.stdout[i]);
				if (line == '' || match(line, /ipv4|hostname|--/i) && match(line, /\|/)) continue;
				if (match(line, /^[-+─━=| ]+$/)) continue;

				let parts = split(line, '|');
				let cols = [];
				for (let p in parts) {
					push(cols, trim(p));
				}
				if (length(cols) > 0 && cols[0] == '') shift(cols);
				if (length(cols) > 0 && cols[length(cols) - 1] == '') pop(cols);

				if (length(cols) >= 2) {
					push(peers, {
						ipv4: trim(cols[0] || ''),
						hostname: trim(cols[1] || ''),
						cost: trim(cols[2] || ''),
						latency: trim(cols[3] || ''),
						loss_rate: trim(cols[4] || ''),
						rx: trim(cols[5] || ''),
						tx: trim(cols[6] || ''),
						tunnel: trim(cols[7] || ''),
						nat: trim(cols[8] || ''),
						version: trim(cols[9] || '')
					});
				}
			}
		}

		return { peers: peers, raw: raw_output };
	}
};

methods.get_logs = {
	call: function() {
		let logs = [];
		let res = exec('logread -e easytier 2>/dev/null | tail -n 80');
		if (res.code == 0 && length(res.stdout) > 0) {
			logs = res.stdout;
		} else if (access('/tmp/easytier.log')) {
			let f_res = exec('tail -n 80 /tmp/easytier.log 2>/dev/null');
			if (f_res.code == 0) logs = f_res.stdout;
		}
		return { logs: logs };
	}
};

methods.clear_logs = {
	call: function() {
		writefile('/tmp/easytier.log', '');
		writefile('/tmp/easytier-web.log', '');
		return { success: true };
	}
};

methods.service_action = {
	args: { action: 'action' },
	call: function(req) {
		let action = req.args?.action;
		if (!action) return { success: false, error: 'Missing action' };

		if (action == 'restart' || action == 'stop') {
			exec('killall -9 easytier-core easytier-web 2>/dev/null');
		}

		if (action == 'start' || action == 'restart') {
			exec('/etc/init.d/easytier restart >/dev/null 2>&1');
		} else if (action == 'stop') {
			exec('/etc/init.d/easytier stop >/dev/null 2>&1');
		}

		return { success: true };
	}
};

return { 'easytier': methods };
