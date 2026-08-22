'use strict';
'require view';
'require form';
'require uci';
'require rpc';
'require ui';
'require poll';
'require dom';

const callGetStatus = rpc.declare({
	object: 'easytier',
	method: 'get_status',
	expect: { }
});

const callGetPeers = rpc.declare({
	object: 'easytier',
	method: 'get_peers',
	expect: { }
});

const callGetLogs = rpc.declare({
	object: 'easytier',
	method: 'get_logs',
	expect: { }
});

const callClearLogs = rpc.declare({
	object: 'easytier',
	method: 'clear_logs'
});

const callServiceAction = rpc.declare({
	object: 'easytier',
	method: 'service_action',
	params: ['action']
});

function renderStatusBadge(stateObj, title) {
	const state = stateObj ? stateObj.state : 'stopped';
	const pid = stateObj ? stateObj.pid : null;
	let text = _('Stopped');
	let color = 'red';

	if (state === 'managed') {
		text = _('Running (Managed)');
		color = 'green';
	} else if (state === 'unmanaged') {
		text = _('Running (Unmanaged)');
		color = 'orange';
	}

	if (pid) {
		text += ' [PID: ' + pid + ']';
	}

	return E('div', { 'class': 'cbi-value' }, [
		E('label', { 'class': 'cbi-value-title' }, title),
		E('div', { 'class': 'cbi-value-field' }, [
			E('strong', { 'style': 'color: ' + color + '; font-size: 1.1em;' }, text)
		])
	]);
}

function renderLocalNodeInfo(peerData) {
	let peers = [];
	if (Array.isArray(peerData)) {
		peers = peerData;
	} else if (peerData && Array.isArray(peerData.peers)) {
		peers = peerData.peers;
	}

	let local = null;
	for (let i = 0; i < peers.length; i++) {
		if (peers[i].cost && String(peers[i].cost).trim().toLowerCase() === 'local') {
			local = peers[i];
			break;
		}
	}

	const ipv4Val = (local && local.ipv4) ? String(local.ipv4).trim() : '-';
	const hostnameVal = (local && local.hostname) ? String(local.hostname).trim() : '-';
	const natVal = (local && local.nat) ? String(local.nat).trim() : '-';
	const versionVal = (local && local.version) ? String(local.version).trim() : '-';
	const netNameVal = uci.get('easytier', 'settings', 'network_name') || 'easytier';
	const devNameVal = uci.get('easytier', 'settings', 'dev_name') || 'easytier0';

	const infoItems = [
		{ label: _('EasyTier IPv4'), value: E('strong', { 'style': 'color: #007bff; font-size: 1.1em;' }, ipv4Val) },
		{ label: _('Hostname'), value: E('strong', {}, hostnameVal) },
		{ label: _('Network Name'), value: netNameVal },
		{ label: _('Virtual Interface'), value: devNameVal },
		{ label: _('NAT Type'), value: natVal },
		{ label: _('Client Version'), value: versionVal }
	];

	return E('div', { 'class': 'cbi-section-node' }, [
		E('div', { 'style': 'overflow-x: auto; -webkit-overflow-scrolling: touch; margin-bottom: 10px; border: 1px solid #e5e5e5; border-radius: 4px;' }, [
			E('table', { 'class': 'cbi-table', 'style': 'width: 100%; border-collapse: separate; border-spacing: 0;' }, [
				E('tr', { 'class': 'cbi-table-header' }, infoItems.map(item => E('th', { 'class': 'cbi-table-cell', 'style': 'padding: 10px 14px; text-align: left; white-space: nowrap; font-weight: bold; min-width: 120px;' }, item.label))),
				E('tr', { 'class': 'cbi-row' }, infoItems.map(item => E('td', { 'class': 'cbi-value-field', 'style': 'padding: 8px 14px; text-align: left; white-space: nowrap;' }, item.value)))
			])
		])
	]);
}

function renderPeersTable(peerData) {
	let peers = [];
	if (Array.isArray(peerData)) {
		peers = peerData;
	} else if (peerData && Array.isArray(peerData.peers)) {
		peers = peerData.peers;
	}

	const remotePeers = peers.filter(p => !p.cost || String(p.cost).trim().toLowerCase() !== 'local');

	if (!remotePeers || remotePeers.length === 0) {
		if (peerData && peerData.raw && peerData.raw.length > 0 && peers.length === 0) {
			return E('pre', { 'style': 'padding: 10px; border-radius: 4px; overflow-x: auto; max-height: 350px; font-family: monospace;' }, peerData.raw);
		}
		return E('em', {}, _('No connected remote peers found.'));
	}

	const headers = [
		{ title: _('IPv4'), minWidth: '140px' },
		{ title: _('Hostname'), minWidth: '160px' },
		{ title: _('Cost'), minWidth: '80px' },
		{ title: _('Latency'), minWidth: '90px' },
		{ title: _('Loss Rate'), minWidth: '80px' },
		{ title: _('RX'), minWidth: '90px' },
		{ title: _('TX'), minWidth: '90px' },
		{ title: _('Tunnel'), minWidth: '80px' },
		{ title: _('NAT Type'), minWidth: '130px' },
		{ title: _('Version'), minWidth: '130px' }
	];

	const thStyle = 'padding: 10px 14px; text-align: left; white-space: nowrap; font-weight: bold; vertical-align: middle;';
	const tdStyle = 'padding: 8px 14px; text-align: left; white-space: nowrap; vertical-align: middle;';

	const rows = [
		E('tr', { 'class': 'cbi-table-header' }, headers.map(function(h) {
			return E('th', { 'class': 'cbi-table-cell', 'style': thStyle + (h.minWidth ? (' min-width: ' + h.minWidth + ';') : '') }, h.title);
		}))
	];

	for (let i = 0; i < remotePeers.length; i++) {
		const p = remotePeers[i];
		const costStr = p.cost ? String(p.cost).trim() : '-';
		const latencyVal = p.latency ? String(p.latency).trim() : '-';
		const latencyColor = (latencyVal !== '-' && !isNaN(parseFloat(latencyVal))) ? '#28a745' : '#6c757d';

		rows.push(E('tr', { 'class': 'cbi-row' }, [
			E('td', { 'class': 'cbi-value-field', 'style': tdStyle }, E('strong', {}, p.ipv4 ? String(p.ipv4).trim() : '-')),
			E('td', { 'class': 'cbi-value-field', 'style': tdStyle }, p.hostname ? String(p.hostname).trim() : '-'),
			E('td', { 'class': 'cbi-value-field', 'style': tdStyle }, costStr),
			E('td', { 'class': 'cbi-value-field', 'style': tdStyle }, (latencyVal !== '-') ? E('span', { 'style': 'color: ' + latencyColor + '; font-weight: bold;' }, latencyVal + ' ms') : '-'),
			E('td', { 'class': 'cbi-value-field', 'style': tdStyle }, p.loss_rate ? String(p.loss_rate).trim() : '-'),
			E('td', { 'class': 'cbi-value-field', 'style': tdStyle }, p.rx ? String(p.rx).trim() : '-'),
			E('td', { 'class': 'cbi-value-field', 'style': tdStyle }, p.tx ? String(p.tx).trim() : '-'),
			E('td', { 'class': 'cbi-value-field', 'style': tdStyle }, p.tunnel ? String(p.tunnel).trim() : '-'),
			E('td', { 'class': 'cbi-value-field', 'style': tdStyle }, p.nat ? String(p.nat).trim() : '-'),
			E('td', { 'class': 'cbi-value-field', 'style': tdStyle }, p.version ? String(p.version).trim() : '-')
		]));
	}

	const tableNode = E('table', { 'class': 'cbi-table', 'style': 'width: 100%; border-collapse: separate; border-spacing: 0;' }, rows);
	return E('div', { 'style': 'overflow-x: auto; -webkit-overflow-scrolling: touch; margin-bottom: 10px; border: 1px solid #e5e5e5; border-radius: 4px;' }, tableNode);
}

function renderLogsView(logData) {
	let lines = [];
	if (Array.isArray(logData)) {
		lines = logData;
	} else if (logData && Array.isArray(logData.logs)) {
		lines = logData.logs;
	} else if (typeof logData === 'string') {
		lines = logData.split('\n');
	} else if (logData && typeof logData.logs === 'string') {
		lines = logData.logs.split('\n');
	}

	lines = lines.filter(function(l) {
		return l && String(l).trim().length > 0;
	});

	if (lines.length === 0) {
		return E('em', {}, _('No logs available.'));
	}

	const content = lines.map(function(line) {
		return E('div', {
			'style': 'white-space: pre-wrap; font-family: monospace; font-size: 12px; line-height: 1.4;'
		}, String(line));
	});

	return E('div', {
		'style': 'max-height: 450px; overflow-y: auto; background: #1e1e1e; color: #f1f1f1; padding: 12px; border-radius: 4px;'
	}, content);
}

return view.extend({
	load: function() {
		return Promise.all([
			L.resolveDefault(callGetStatus(), {}),
			L.resolveDefault(callGetPeers(), {}),
			uci.load('easytier')
		]);
	},

	render: function(data) {
		const status = data[0] || {};
		const peerData = data[1] || {};

		const map = new form.Map('easytier', _('EasyTier'),
			_('EasyTier is a simple, secure, decentralized mesh VPN for intranet penetration, implemented in Rust.')
		);

		// ==================== Tab 1: Overview & Peers ====================
		const s_overview = map.section(form.NamedSection, '_status', '_status');
		s_overview.anonymous = true;
		s_overview.render = function() {
			poll.add(function() {
				return Promise.all([
					L.resolveDefault(callGetStatus(), {}),
					L.resolveDefault(callGetPeers(), {})
				]).then(function(res) {
					const curStatus = res[0] || {};
					const curPeers = res[1] || {};

					const statusContainer = document.getElementById('easytier_service_status_display');
					if (statusContainer) {
						statusContainer.replaceChildren(
							renderStatusBadge(curStatus.core, _('Core Service Status')),
							renderStatusBadge(curStatus.web, _('Web Console Status'))
						);
					}

					const localNodeContainer = document.getElementById('easytier_local_node_display');
					if (localNodeContainer) {
						localNodeContainer.replaceChildren(renderLocalNodeInfo(curPeers));
					}

					const peersContainer = document.getElementById('easytier_peers_display');
					if (peersContainer) {
						peersContainer.replaceChildren(renderPeersTable(curPeers));
					}
				});
			}, 5);

			return E('div', {}, [
				E('hr', { 'style': 'margin: 5px 0 15px 0; border: 0; border-top: 1px solid #e5e5e5;' }),
				E('div', { 'class': 'cbi-section' }, [
					E('h3', {}, _('Service Status')),
					E('div', { 'id': 'easytier_service_status_display' }, [
						renderStatusBadge(status.core, _('Core Service Status')),
						renderStatusBadge(status.web, _('Web Console Status'))
					]),
					E('div', { 'class': 'cbi-value' }, [
						E('label', { 'class': 'cbi-value-title' }, _('Service Actions')),
						E('div', { 'class': 'cbi-value-field' }, [
							E('button', {
								'class': 'btn cbi-button cbi-button-action',
								'click': function(ev) {
									ui.showModal(_('Action'), [ E('p', {}, _('Restarting service...')) ]);
									return callServiceAction('restart').then(function() {
										window.location.reload();
									});
								}
							}, _('Restart Service')),
							' ',
							E('button', {
								'class': 'btn cbi-button cbi-button-reset',
								'click': function(ev) {
									return callServiceAction('stop').then(function() {
										window.location.reload();
									});
								}
							}, _('Stop Service'))
						])
					])
				]),
				E('div', { 'class': 'cbi-section' }, [
					E('h3', {}, _('Local Node Information')),
					E('div', { 'id': 'easytier_local_node_display' }, renderLocalNodeInfo(peerData))
				]),
				E('div', { 'class': 'cbi-section' }, [
					E('div', { 'style': 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;' }, [
						E('h3', { 'style': 'margin: 0;' }, _('Connected Peer Nodes')),
						E('button', {
							'class': 'btn cbi-button cbi-button-action',
							'click': function(ev) {
								const localContainer = document.getElementById('easytier_local_node_display');
								const peersContainer = document.getElementById('easytier_peers_display');
								if (peersContainer) {
									peersContainer.replaceChildren(E('em', {}, _('Collecting data ...')));
								}
								return callGetPeers().then(function(res) {
									if (localContainer) {
										localContainer.replaceChildren(renderLocalNodeInfo(res));
									}
									if (peersContainer) {
										peersContainer.replaceChildren(renderPeersTable(res));
									}
								}).catch(function(err) {
									ui.addTimeLimitedNotification(null, [ E('p', {}, _('Failed to load peers: %s').format(err.message || err)) ], 5000, 'error');
								});
							}
						}, _('Refresh'))
					]),
					E('div', { 'id': 'easytier_peers_display' }, renderPeersTable(peerData))
				])
			]);
		};

		// ==================== Tab 2: Settings ====================
		const s = map.section(form.NamedSection, 'settings', 'easytier', _('Settings'));
		s.tab('general', _('Core Settings'));
		s.tab('advanced', _('Advanced Options'));
		s.tab('web', _('Web Console'));
		s.tab('logs', _('Logs'));

		// --- Core Settings ---
		let o;
		o = s.taboption('general', form.Flag, 'enabled', _('Enable Core Service'));
		o.rmempty = false;

		o = s.taboption('general', form.ListValue, 'etcmd', _('Startup Method'));
		o.value('etcmd', _('Command-line'));
		o.value('config', _('Configuration File'));
		o.value('web', _('Cloud Web Config'));
		o.default = 'etcmd';

		o = s.taboption('general', form.Value, 'network_name', _('Network Name'),
			_('The VPN network name to identify this virtual network.')
		);
		o.placeholder = 'easytier';
		o.depends('etcmd', 'etcmd');

		o = s.taboption('general', form.Value, 'network_secret', _('Network Secret'),
			_('The secret phrase used to authorize and encrypt traffic.')
		);
		o.password = true;
		o.depends('etcmd', 'etcmd');

		o = s.taboption('general', form.Flag, 'ip_dhcp', _('Enable DHCP IP Allocation'),
			_('Automatically determine and assign an IP address.')
		);
		o.default = '1';
		o.depends('etcmd', 'etcmd');

		o = s.taboption('general', form.Value, 'ipaddr', _('Interface IPv4 Address'),
			_('The static IPv4 address of this node. Ignored when DHCP is enabled.')
		);
		o.datatype = 'ip4addr';
		o.placeholder = '10.144.144.1';
		o.depends({ 'etcmd': 'etcmd', 'ip_dhcp': '0' });

		o = s.taboption('general', form.Value, 'ip6addr', _('Interface IPv6 Address'),
			_('The static IPv6 address of this node.')
		);
		o.datatype = 'ip6addr';
		o.placeholder = 'fd00:144::1';
		o.depends('etcmd', 'etcmd');

		o = s.taboption('general', form.DynamicList, 'peeradd', _('Peer Nodes'),
			_('Initial connection peer node URLs.')
		);
		o.depends('etcmd', 'etcmd');

		o = s.taboption('general', form.Value, 'external_node', _('Public Discovery Node'),
			_('Public discovery node URL.')
		);
		o.placeholder = 'tcp://public.easytier.top:11010';
		o.depends('etcmd', 'etcmd');

		o = s.taboption('general', form.DynamicList, 'proxy_networks', _('Proxy Networks'),
			_('Subnet CIDRs to proxy and announce through this node.')
		);
		o.datatype = 'cidr4';
		o.depends('etcmd', 'etcmd');

		// Web Server URL under 'web' mode
		o = s.taboption('general', form.Value, 'web_config', _('Web Config Server URL'),
			_('Remote web configuration server address.')
		);
		o.depends('etcmd', 'web');

		// --- Advanced Options ---
		o = s.taboption('advanced', form.Value, 'rpc_port', _('RPC Management Port'),
			_('Port for local CLI and RPC management portal.')
		);
		o.datatype = 'port';
		o.default = '15888';
		o.placeholder = '15888';

		o = s.taboption('advanced', form.Value, 'dev_name', _('TUN Device Name'),
			_('Virtual TUN network interface name.')
		);
		o.default = 'easytier0';
		o.placeholder = 'easytier0';

		o = s.taboption('advanced', form.ListValue, 'encryption_algorithm', _('Encryption Algorithm'));
		o.value('aes-gcm', 'AES-GCM');
		o.value('chacha20-poly1305', 'ChaCha20-Poly1305');
		o.value('none', _('None'));
		o.default = 'aes-gcm';

		o = s.taboption('advanced', form.Flag, 'multi_thread', _('Multi-threaded Mode'),
			_('Enable multi-threaded packet processing for higher throughput.')
		);
		o.default = '0';

		o = s.taboption('advanced', form.Flag, 'tunnel_snat', _('Enable Tunnel Traffic SNAT'),
			_('Use OpenWrt system firewall to manage NAT for EasyTier tunnel and subnet traffic. Disabling this option disables source address masquerading to preserve real source IPs of remote peers and subnets in the local network.')
		);
		o.default = '0';

		o = s.taboption('advanced', form.Value, 'custom_params', _('Custom Command Parameters'),
			_('Additional command-line parameters appended to easytier-core.')
		);

		// --- Web Console ---
		o = s.taboption('web', form.Flag, 'web_enabled', _('Enable Web Console Service'));
		o.rmempty = false;

		o = s.taboption('web', form.Value, 'web_html_port', _('Web Console Port'),
			_('HTTP listen port for easytier-web embedded web dashboard.')
		);
		o.datatype = 'port';
		o.default = '22020';
		o.placeholder = '22020';

		o = s.taboption('web', form.Value, 'web_dir', _('Web Data Directory'),
			_('Directory to store SQLite database for easytier-web.')
		);
		o.default = '/etc/easytier';
		o.placeholder = '/etc/easytier';

		const webConsoleLink = s.taboption('web', form.DummyValue, '_web_link', _('Open Web Console'));
		webConsoleLink.render = function() {
			const port = uci.get('easytier', 'settings', 'web_html_port') || '22020';
			const url = 'http://' + window.location.hostname + ':' + port;
			return E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, _('Dashboard URL')),
				E('div', { 'class': 'cbi-value-field' }, [
					E('a', {
						'class': 'btn cbi-button cbi-button-action',
						'href': url,
						'target': '_blank'
					}, _('Open Web Console in New Tab (%s)').format(url))
				])
			]);
		};

		// --- Logs ---
		const logActions = s.taboption('logs', form.DummyValue, '_log_actions');
		logActions.render = function() {
			return E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, _('Log Actions')),
				E('div', { 'class': 'cbi-value-field' }, [
					E('button', {
						'class': 'btn cbi-button cbi-button-action',
						'click': function(ev) {
							const display = document.getElementById('easytier_logs_display');
							if (display) {
								display.replaceChildren(E('em', {}, _('Collecting logs...')));
							}
							return callGetLogs().then(function(res) {
								if (display) {
									display.replaceChildren(renderLogsView(res));
								}
							}).catch(function(err) {
								if (display) {
									display.replaceChildren(E('em', {}, _('No logs available.')));
								}
								ui.addTimeLimitedNotification(null, [ E('p', {}, _('Failed to load logs: %s').format(err.message || err)) ], 5000, 'error');
							});
						}
					}, _('Refresh Logs')),
					' ',
					E('button', {
						'class': 'btn cbi-button cbi-button-reset',
						'click': function(ev) {
							return callClearLogs().then(function() {
								const display = document.getElementById('easytier_logs_display');
								if (display) {
									display.replaceChildren(E('em', {}, _('Logs cleared.')));
								}
							});
						}
					}, _('Clear Logs'))
				])
			]);
		};

		const logsSection = s.taboption('logs', form.DummyValue, '_logs');
		logsSection.render = function() {
			window.setTimeout(function() {
				const display = document.getElementById('easytier_logs_display');
				if (display) {
					callGetLogs().then(function(res) {
						display.replaceChildren(renderLogsView(res));
					}).catch(function(err) {
						display.replaceChildren(E('em', {}, _('No logs available.')));
					});
				}
			}, 100);

			return E('div', { 'id': 'easytier_logs_display', 'class': 'cbi-value' },
				E('em', {}, _('Collecting logs...'))
			);
		};

		return map.render();
	},

	handleSaveApply: function(ev, mode) {
		return this.super('handleSaveApply', [ev, mode]).then(function() {
			return callServiceAction('restart');
		});
	}
});
