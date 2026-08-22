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
	expect: { peers: [] }
});

const callGetLogs = rpc.declare({
	object: 'easytier',
	method: 'get_logs',
	expect: { logs: [] }
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
		text += ` [PID: ${pid}]`;
	}

	return E('div', { 'class': 'cbi-value' }, [
		E('label', { 'class': 'cbi-value-title' }, title),
		E('div', { 'class': 'cbi-value-field' }, [
			E('strong', { 'style': `color: ${color}; font-size: 1.1em;` }, text)
		])
	]);
}

function renderPeersTable(peerData) {
	const peers = (peerData && peerData.peers) ? peerData.peers : [];
	if (!peers || peers.length === 0) {
		if (peerData && peerData.raw && peerData.raw.length > 0) {
			return E('pre', { 'style': 'padding: 10px; border-radius: 4px; overflow-x: auto; max-height: 350px;' }, peerData.raw);
		}
		return E('em', {}, _('No connected peers found.'));
	}

	const headers = [
		_('Peer ID'),
		_('Virtual IP'),
		_('Hostname'),
		_('Cost'),
		_('Latency'),
		_('Loss Rate'),
		_('RX'),
		_('TX'),
		_('Tunnel')
	];

	const tableNode = E('table', { 'class': 'cbi-table' }, [
		E('tr', { 'class': 'cbi-table-header' }, headers.map(h => E('th', { 'class': 'cbi-table-cell' }, h))),
		...peers.map(p => E('tr', { 'class': 'cbi-row' }, [
			E('td', { 'class': 'cbi-value-field' }, E('strong', {}, p.id || '-')),
			E('td', { 'class': 'cbi-value-field' }, p.ipv4 || '-'),
			E('td', { 'class': 'cbi-value-field' }, p.hostname || '-'),
			E('td', { 'class': 'cbi-value-field' }, p.cost || '-'),
			E('td', { 'class': 'cbi-value-field' }, p.latency ? E('span', { 'style': 'color: green;' }, p.latency) : '-'),
			E('td', { 'class': 'cbi-value-field' }, p.loss_rate || '0%'),
			E('td', { 'class': 'cbi-value-field' }, p.rx_bytes || '-'),
			E('td', { 'class': 'cbi-value-field' }, p.tx_bytes || '-'),
			E('td', { 'class': 'cbi-value-field' }, p.tunnel_info || '-')
		]))
	]);

	return E('div', { 'style': 'overflow-x: auto; -webkit-overflow-scrolling: touch; margin-bottom: 10px;' }, tableNode);
}

function renderLogsView(logData) {
	const lines = (logData && logData.logs) ? logData.logs : [];
	if (lines.length === 0) {
		return E('em', {}, _('No logs available.'));
	}
	const content = lines.map(line => E('div', { 'style': 'white-space: pre-wrap; font-family: monospace; font-size: 12px; line-height: 1.4;' }, line));
	return E('div', {
		'style': 'max-height: 450px; overflow-y: auto; background: #1e1e1e; color: #f1f1f1; padding: 12px; border-radius: 4px;'
	}, content);
}

return view.extend({
	load: function() {
		return Promise.all([
			L.resolveDefault(callGetStatus(), {}),
			L.resolveDefault(callGetPeers(), { peers: [] }),
			uci.load('easytier')
		]);
	},

	render: function(data) {
		const status = data[0] || {};
		const peerData = data[1] || {};

		const map = new form.Map('easytier', _('EasyTier Next'),
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
					E('h3', {}, _('Connected Peer Nodes')),
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
			const url = `http://${window.location.hostname}:${port}`;
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
		const logsSection = s.taboption('logs', form.DummyValue, '_logs');
		logsSection.render = function() {
			return E('div', { 'id': 'easytier_logs_display', 'class': 'cbi-value' },
				E('em', {}, _('Collecting logs...'))
			);
		};

		const refreshLogsBtn = s.taboption('logs', form.Button, '_refresh_logs', _('Refresh Logs'));
		refreshLogsBtn.inputstyle = 'action';
		refreshLogsBtn.onclick = function() {
			const display = document.getElementById('easytier_logs_display');
			if (display) {
				display.replaceChildren(E('em', {}, _('Collecting logs...')));
			}
			return callGetLogs().then(function(res) {
				if (display) {
					display.replaceChildren(renderLogsView(res));
				}
			});
		};

		const clearLogsBtn = s.taboption('logs', form.Button, '_clear_logs', _('Clear Logs'));
		clearLogsBtn.inputstyle = 'reset';
		clearLogsBtn.onclick = function() {
			return callClearLogs().then(function() {
				const display = document.getElementById('easytier_logs_display');
				if (display) {
					display.replaceChildren(E('em', {}, _('Logs cleared.')));
				}
			});
		};

		return map.render();
	},

	handleSaveApply: function(ev, mode) {
		return this.super('handleSaveApply', [ev, mode]).then(function() {
			return callServiceAction('restart');
		});
	}
});
