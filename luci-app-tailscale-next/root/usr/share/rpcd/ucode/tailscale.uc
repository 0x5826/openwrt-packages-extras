#!/usr/bin/env ucode

'use strict';

import { access, popen, readfile, writefile, unlink, stat } from 'fs';
import { cursor } from 'uci';

const uci = cursor();

function exec(command) {
	let stdout_content = '';
	let p = popen(command, 'r');
	sleep(100);
	if (p == null) {
		return { code: -1, stdout: '', stderr: `Failed to execute: ${command}` };
	}
	for (let line = p.read('line'); length(line); line = p.read('line')) {
		stdout_content = stdout_content+line;
	}
	stdout_content = rtrim(stdout_content);
	stdout_content = split(stdout_content, '\n');

	let exit_code = p.close();
	let stderr_content = '';
	if (exit_code != 0) {
		stderr_content = stdout_content;
	}
	return { code: exit_code, stdout: stdout_content, stderr: stderr_content };
}

function shell_quote(s) {
	if (s == null || s == '') return "''";
	return "'" + replace(s, "'", "'\\''") + "'";
}

function get_connectivity_data() {
	let ts_cmd = 'tailscale';
	if (access('/usr/sbin/tailscale')) ts_cmd = '/usr/sbin/tailscale';
	else if (access('/usr/bin/tailscale')) ts_cmd = '/usr/bin/tailscale';

	let res = exec('if [ ! -f /tmp/tailscale_netcheck.json ] || [ $(($(date +%s) - $(date -r /tmp/tailscale_netcheck.json +%s 2>/dev/null || stat -c %Y /tmp/tailscale_netcheck.json 2>/dev/null || echo 0))) -gt 60 ]; then ' + ts_cmd + ' netcheck --format=json > /tmp/tailscale_netcheck.tmp 2>/dev/null && mv /tmp/tailscale_netcheck.tmp /tmp/tailscale_netcheck.json; fi; cat /tmp/tailscale_netcheck.json 2>/dev/null');
	if (res.code == 0 && length(res.stdout) > 0) {
		try {
			return json(join('', res.stdout));
		} catch(e) { /* ignore */ }
	}
	return null;
}

const methods = {};

methods.get_status = {
	call: function() {
		let data = {
			status: '',
			version: '',
			TUNMode: '',
			health: '',
			ipv4: "Not running",
			ipv6: null,
			domain_name: '',
			peers: [],
			connectivity: null
		};

		if (!access('/usr/sbin/tailscale') && !access('/usr/bin/tailscale')) {
			data.status = 'not_installed';
			return data;
		}

		let status_out = exec('tailscale status --json 2>/dev/null');
		let peer_map = {};

		if (status_out.code == 0 && length(status_out.stdout) > 0) {
			try {
				let status_data = json(join('', status_out.stdout));
				data.version = status_data?.Version || 'Unknown';
				data.health = status_data?.Health || '';
				data.TUNMode = (status_data?.TUN == false ? 'false' : 'true');
				if (status_data?.BackendState == 'Running') {
					data.status = 'running';
				} else if (status_data?.BackendState == 'NeedsLogin') {
					data.status = 'logout';
				}

				if (status_data?.Self?.TailscaleIPs) {
					data.ipv4 = status_data.Self.TailscaleIPs[0] || 'No IP assigned';
					data.ipv6 = status_data.Self.TailscaleIPs[1] || null;
				}

				let account_str = '';
				if (status_data?.CurrentTailnet?.Name) {
					account_str = status_data.CurrentTailnet.Name;
				}
				if (status_data?.Self?.UserID && status_data?.User) {
					let uid = tostring(status_data.Self.UserID);
					let uinfo = status_data.User[uid];
					if (uinfo?.DisplayName && uinfo.DisplayName != '' && uinfo.DisplayName != account_str) {
						account_str = (account_str != '' ? (account_str + ' (' + uinfo.DisplayName + ')') : uinfo.DisplayName);
					}
				}
				data.account = account_str;
				data.domain_name = account_str;

				if (status_data?.Peer) {
					for (let id, p in status_data.Peer) {
						let ips = '';
						if (p?.TailscaleIPs) {
							ips = join('<br>', p.TailscaleIPs);
						}
						let hostname = p?.DNSName || '';
						if (hostname != '') {
							let parts = split(hostname, '.');
							hostname = parts[0];
						}

						peer_map[id] = {
							ip: ips,
							hostname: hostname,
							ostype: p?.OS,
							online: p?.Online || false,
							linkadress: (!p?.CurAddr || p?.CurAddr == '') ? p?.Relay : p?.CurAddr,
							lastseen: p?.LastSeen,
							exit_node: !(!p?.ExitNode),
							exit_node_option: !(!p?.ExitNodeOption),
							tx: p?.TxBytes || '',
							rx: p?.RxBytes || ''
						};
					}
				}

				if (data.status == 'running') {
					let netcheck = get_connectivity_data();
					let derp_lat_str = '';
					let pref_derp = netcheck?.PreferredDERP || status_data?.Self?.Relay || 0;
					if (pref_derp != 0 && pref_derp != '' && netcheck?.DERPLatencies) {
						let lat = netcheck.DERPLatencies[tostring(pref_derp)];
						if (lat) {
							derp_lat_str = sprintf('%d ms', int(lat * 1000));
						}
					}

					let ep_list = [];
					if (status_data?.Self?.Addrs && length(status_data.Self.Addrs) > 0) {
						ep_list = status_data.Self.Addrs;
					} else if (status_data?.Self?.Endpoints && length(status_data.Self.Endpoints) > 0) {
						ep_list = status_data.Self.Endpoints;
					} else if (netcheck) {
						if (netcheck.GlobalV4) push(ep_list, netcheck.GlobalV4);
						if (netcheck.GlobalV6) push(ep_list, netcheck.GlobalV6);
						if (netcheck.GlobalAddrs && length(netcheck.GlobalAddrs) > 0) {
							for (let a in netcheck.GlobalAddrs) push(ep_list, a);
						}
					}

					data.connectivity = {
						varies: (netcheck?.MappingVariesByDestIP == true) ? 'Yes' : 'No',
						ipv4: (netcheck?.IPv4 == true || (ep_list && length(ep_list) > 0)) ? 'Yes' : 'No',
						ipv6: (netcheck?.IPv6 == true) ? 'Yes' : 'No',
						udp: (netcheck?.UDP == true || (ep_list && length(ep_list) > 0)) ? 'Yes' : 'No',
						upnp: (netcheck?.UPnP == true) ? 'Yes' : 'No',
						pcp: (netcheck?.PCP == true) ? 'Yes' : 'No',
						pmp: (netcheck?.PMP == true) ? 'Yes' : 'No',
						hairpinning: (netcheck?.HairPinning == true) ? 'Yes' : 'No',
						preferred_derp: pref_derp,
						derp_latency: derp_lat_str,
						endpoints: ep_list
					};
				}
			} catch (e) { /* ignore */ }
		} else {
			uci.load('tailscale');
			let state_file_path = uci.get('tailscale', 'settings', 'state_file') || "/etc/tailscale/tailscaled.state";
			if (access(state_file_path) && stat(state_file_path)?.size > 0) {
				data.status = 'stopped';
			} else {
				data.status = 'logout';
			}
		}

		data.peers = peer_map;
		return data;
	}
};

methods.get_settings = {
	call: function() {
		let settings = {};
		uci.load('tailscale');
		let state_file_path = uci.get('tailscale', 'settings', 'state_file') || "/etc/tailscale/tailscaled.state";
		if (access(state_file_path)) {
			try {
				let state_content = readfile(state_file_path);
				if (state_content != null) {
					let state_data = json(state_content);
					let profiles_b64 = state_data?._profiles;
					if (!profiles_b64) return settings;

					let profiles_data = json(b64dec(profiles_b64));
					let profiles_key = null;
					for (let key in profiles_data) {
						profiles_key = key;
						break;
					}
				profiles_key = 'profile-'+profiles_key;

				let status_data = json(b64dec(state_data?.[profiles_key]));
				if (status_data != null) {
					settings.accept_routes = status_data?.RouteAll || false;
					settings.advertise_exit_node = status_data?.AdvertiseExitNode || false;
					settings.advertise_routes = status_data?.AdvertiseRoutes || [];
					settings.exit_node = status_data?.ExitNodeID || "";
					settings.exit_node_allow_lan_access = status_data?.ExitNodeAllowLANAccess || false;
					settings.shields_up = status_data?.ShieldsUp || false;
					settings.ssh = status_data?.RunSSH || false;
					settings.runwebclient = status_data?.RunWebClient || false;
					settings.nosnat = status_data?.NoSNAT || false;
					settings.dns_mode = uci.get('tailscale', 'settings', 'dns_mode') || 'disabled';
					settings.fw_mode = split(uci.get('tailscale', 'settings', 'fw_mode'),' ')[0] || 'nftables';
				}
				}
			} catch (e) { /* ignore */ }
		}
		return settings;
	}
};


methods.do_login = {
	args: { form_data: {} },
	call: function(request) {
		const form_data = request.args.form_data;
		if (form_data == null || length(form_data) == 0) {
			return { error: 'Missing or invalid form_data parameter. Please provide login data.' };
		}

		let status = methods.get_status.call();
		if (status.status == 'running') {
			return { error: 'Tailscale is already logged in and running.' };
		}

		let status_test = exec('tailscale status >/dev/null 2>&1');
		if (status_test.code != 0) {
			exec('/etc/init.d/tailscale start >/dev/null 2>&1');
			for (let i = 0; i < 3; i++) {
				sleep(1000);
				let res = exec('tailscale status >/dev/null 2>&1');
				if (res.code == 0) break;
			}
		}

		// --- 1. Prepare and Run Login Command (Once) ---
		let loginargs = [];
		const loginserver = trim(form_data.loginserver) || '';
		const loginserver_authkey = trim(form_data.loginserver_authkey) || '';

		if (loginserver != '') {
			push(loginargs, '--login-server ' + shell_quote(loginserver));
			if (loginserver_authkey != '') {
				push(loginargs, '--auth-key ' + shell_quote(loginserver_authkey));
			}
		}

		// Run the command in the background using /bin/sh -c to handle the '&' correctly
		let login_cmd = 'tailscale login ' + join(' ', loginargs);
		popen('/bin/sh -c ' + shell_quote(login_cmd + ' &'), 'r');

		// --- 2. Loop to Check Status for URL ---
		let max_attempts = 15;
		let interval = 2000;

		for (let i = 0; i < max_attempts; i++) {
			let tresult = exec('tailscale status 2>&1');
			for (let line in tresult.stdout) {
				let trline = trim(line);
				if (index(trline, 'http') != -1) {
					let parts = split(trline, ' ');
					for (let part in parts) {
						if (index(part, 'http') != -1) {
							return { url: part };
						}
					}
				}
			}
			sleep(interval);
		}
		return { error: 'Could not retrieve login URL from tailscale command after 30 seconds.' };
	}
};

methods.do_logout = {
	call: function() {
		let status = methods.get_status.call();
		if (status.status == 'not_installed') {
			return { error: 'Tailscale is not installed.' };
		}
		if (status.status == 'logout') {
			return { success: true };
		}

		uci.load('tailscale');
		let state_file_path = uci.get('tailscale', 'settings', 'state_file') || "/etc/tailscale/tailscaled.state";

		if (status.status == 'running') {
			exec('tailscale logout 2>/dev/null');
		} else {
			exec('/etc/init.d/tailscale start >/dev/null 2>&1');
			for (let i = 0; i < 3; i++) {
				sleep(1000);
				let res = exec('tailscale logout 2>/dev/null');
				if (res.code == 0) break;
			}
		}

		exec('/etc/init.d/tailscale stop >/dev/null 2>&1');

		if (access(state_file_path)) {
			unlink(state_file_path);
		}

		return { success: true };
	}
};

methods.get_subroutes = {
	call: function() {
		try {
			let cmd = 'ip -j route';
			let result = exec(cmd);
			let subnets = [];

			if (result.code == 0 && length(result.stdout) > 0) {
				let routes_json = json(join('',result.stdout));

				for (let route in routes_json) {
					// We need to filter out local subnets
					// 1. 'dst' (target address) is not' default' (default gateway)
					// 2. 'scope' is' link' (indicating directly connected network)
					// 3. It is an IPv4 address (simple judgment: including'.')
					if (route?.dst && route.dst != 'default' && route?.scope == 'link' && index(route.dst,'.') != -1) {
						push(subnets,route.dst);
					}
				}
			}
			return { routes: subnets };
		}
		catch(e) {
			return { routes: [] };
		}
	}
};

methods.setup_firewall = {
	call: function() {
		try {
			uci.load('tailscale');

			uci.load('network');
			uci.load('firewall');

			let changed_network = false;
			let changed_firewall = false;

			// 1. config Network Interface
			let net_ts = uci.get('network', 'tailscale');
			if (net_ts == null) {
				uci.set('network', 'tailscale', 'interface');
				uci.set('network', 'tailscale', 'proto', 'none');
				uci.set('network', 'tailscale', 'device', 'tailscale0');
				changed_network = true;
			} else {
				let current_dev = uci.get('network', 'tailscale', 'device');
				if (current_dev != 'tailscale0') {
					uci.set('network', 'tailscale', 'device', 'tailscale0');
					changed_network = true;
				}
			}

			// 2. config Firewall Zone
			let ts_zone_section = null;
			let fwd_lan_to_ts = false;
			let fwd_ts_to_lan = false;

			uci.foreach('firewall', 'zone', function(s) {
				if (s['name'] == 'tailscale')
				ts_zone_section = s['.name'];
				});
				uci.foreach('firewall', 'forwarding', function(s) {
					if (s['src'] == 'lan' && s['dest'] == 'tailscale') fwd_lan_to_ts = true;
					if (s['src'] == 'tailscale' && s['dest'] == 'lan') fwd_ts_to_lan = true;
				});

			if (ts_zone_section == null) {
				let zid = uci.add('firewall', 'zone');
				uci.set('firewall', zid, 'name', 'tailscale');
				uci.set('firewall', zid, 'input', 'ACCEPT');
				uci.set('firewall', zid, 'output', 'ACCEPT');
				uci.set('firewall', zid, 'forward', 'ACCEPT');
				uci.set('firewall', zid, 'masq', '1');
				uci.set('firewall', zid, 'mtu_fix', '1');
				uci.set('firewall', zid, 'network', ['tailscale']);
				changed_firewall = true;
			} else {
				let nets = uci.get('firewall', ts_zone_section, 'network');
				let net_list = [];
				let has_ts_net = false;

				if (type(nets) == 'array') {
					net_list = nets;
				} else if (type(nets) == 'string') {
					net_list = [nets];
				}

				// check if 'tailscale' is already in the list
				for (let n in net_list) {
					if (n == 'tailscale') {
						has_ts_net = true;
						break;
					}
				}

				if (!has_ts_net) {
					push(net_list, 'tailscale');
					uci.set('firewall', ts_zone_section, 'network', net_list);
					changed_firewall = true;
				}
			}

			// 3. config Forwarding
			if (!fwd_lan_to_ts) {
				let fid = uci.add('firewall', 'forwarding');
				uci.set('firewall', fid, 'src', 'lan');
				uci.set('firewall', fid, 'dest', 'tailscale');
				changed_firewall = true;
			}

			if (!fwd_ts_to_lan) {
				let fid = uci.add('firewall', 'forwarding');
				uci.set('firewall', fid, 'src', 'tailscale');
				uci.set('firewall', fid, 'dest', 'lan');
				changed_firewall = true;
			}

			// Exit node requires WAN <- tailscale forwarding
			let fwd_ts_to_wan = false;
			uci.foreach('firewall', 'forwarding', function(s) {
				if (s['src'] == 'tailscale' && s['dest'] == 'wan') fwd_ts_to_wan = true;
			});

			if (!fwd_ts_to_wan) {
				let fid = uci.add('firewall', 'forwarding');
				uci.set('firewall', fid, 'src', 'tailscale');
				uci.set('firewall', fid, 'dest', 'wan');
				changed_firewall = true;
			}

			// 4. save
			if (changed_network) {
				uci.save('network');
				uci.commit('network');
				exec('/etc/init.d/network reload');
			}

			if (changed_firewall) {
				uci.save('firewall');
				uci.commit('firewall');
				exec('/etc/init.d/firewall reload');
			}

			return {
				success: true,
				changed_network: changed_network,
				changed_firewall: changed_firewall,
				message: (changed_network || changed_firewall) ? 'Tailscale firewall/interface configuration applied.' : 'Tailscale firewall/interface already configured.'
			};

		} catch (e) {
			return { error: 'Exception in setup_firewall: ' + e + '\nStack: ' + (e.stacktrace || '') };
		}
	}
};

methods.get_logs = {
	args: { lines: 200 },
	call: function(request) {
		let lines = int(request?.args?.lines) || 200;
		let cmd = 'logread -l ' + lines + ' 2>/dev/null | grep -i -E "tailscale" || true';
		let result = exec(cmd);
		if (result.code == 0) {
			return { logs: result.stdout };
		}
		return { logs: [], error: join(' ', result.stderr) };
	}
};

methods.reload_settings = {
	call: function() {
		exec('/etc/init.d/tailscale-settings reload');
		return { success: true };
	}
};

return { 'tailscale': methods };
