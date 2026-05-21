'use strict';
'require view';
'require rpc';
'require ui';
'require uci';
'require form';
'require poll';

var callGetStatus = rpc.declare({
	object: 'luci.linkback',
	method: 'get_status'
});

var callGetLog = rpc.declare({
	object: 'luci.linkback',
	method: 'get_log'
});

var callManageService = rpc.declare({
	object: 'luci.linkback',
	method: 'manage_service',
	params: ['action']
});

return L.view.extend({
	load: function() {
		return Promise.all([
			callGetStatus(),
			uci.load('linkback')
		]);
	},

	render: function(data) {
		var self = this;
		var status = data[0];
		
		// 1. Inject Premium CSS Styles
		var styleNode = E('style', {}, [
			'@keyframes breathe-green { 0% { box-shadow: 0 0 4px rgba(76, 175, 80, 0.4); } 50% { box-shadow: 0 0 16px rgba(76, 175, 80, 0.9); border-color: #4CAF50; } 100% { box-shadow: 0 0 4px rgba(76, 175, 80, 0.4); } }',
			'.linkback-card-active { border: 2px solid #4CAF50 !important; animation: breathe-green 2.5s infinite ease-in-out; background-color: rgba(76, 175, 80, 0.05) !important; }',
			'.linkback-card-standby { border: 1px solid #2196F3 !important; background-color: rgba(33, 150, 243, 0.03) !important; }',
			'.linkback-card-faulted { border: 1px solid #f44336 !important; background-color: rgba(244, 67, 54, 0.03) !important; opacity: 0.8; }',
			'.linkback-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }',
			'.linkback-dot-green { background-color: #4CAF50; box-shadow: 0 0 6px #4CAF50; }',
			'.linkback-dot-red { background-color: #f44336; box-shadow: 0 0 6px #f44336; }',
			'.linkback-dot-grey { background-color: #9e9e9e; }',
			'.linkback-indicator { display: inline-flex; align-items: center; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: bold; margin-right: 10px; background-color: rgba(0,0,0,0.05); }',
			'.linkback-stack { position: relative; margin-left: 20px; padding: 10px 0; }',
			'.linkback-stack::before { content: ""; position: absolute; left: 14px; top: 20px; bottom: 20px; width: 2px; background: #e0e0e0; z-index: 1; }',
			'.linkback-node { display: flex; align-items: flex-start; margin-bottom: 25px; position: relative; z-index: 2; }',
			'.linkback-num { display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 50%; background: #2196F3; color: white; font-weight: bold; margin-right: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.15); flex-shrink: 0; }',
			'.linkback-card { flex-grow: 1; padding: 15px; border-radius: 8px; background: #fff; box-shadow: 0 2px 5px rgba(0,0,0,0.05); transition: all 0.3s ease; }',
			'.linkback-card:hover { transform: translateY(-2px); box-shadow: 0 4px 10px rgba(0,0,0,0.1); }',
			'.linkback-badge { display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; color: #fff; }',
			'.linkback-badge-active { background-color: #4CAF50; }',
			'.linkback-badge-standby { background-color: #2196F3; }',
			'.linkback-badge-faulted { background-color: #f44336; }',
			'.linkback-log-area { font-family: monospace; font-size: 12px; background-color: #333; color: #fff; padding: 15px; border-radius: 5px; height: 350px; overflow-y: auto; white-space: pre-wrap; }'
		]);
		document.head.appendChild(styleNode);

		// 2. Build Tab structure
		var tabmenu = E('ul', { 'class': 'cbi-tabmenu' });
		var tabcontainer = E('div', { 'class': 'cbi-tabcontainer' });

		var tabs = [
			{ id: 'status', title: _('Status Overview') },
			{ id: 'config', title: _('Link Configuration') },
			{ id: 'logs', title: _('System Logs') }
		];

		tabs.forEach(function(tab, index) {
			var activeClass = (index === 0) ? 'cbi-tab' : 'cbi-tab-disabled';
			var li = E('li', {
				'class': activeClass,
				'click': function(ev) {
					tabmenu.querySelectorAll('li').forEach(function(el) {
						el.className = 'cbi-tab-disabled';
					});
					ev.currentTarget.className = 'cbi-tab';

					tabcontainer.querySelectorAll('.tab-pane').forEach(function(el) {
						el.style.display = 'none';
					});
					document.getElementById('tab-' + tab.id).style.display = 'block';
				}
			}, [ E('a', { 'href': '#' }, tab.title) ]);
			tabmenu.appendChild(li);
		});

		// --- TAB 1: Status Overview Pane ---
		var statusPane = E('div', { 'id': 'tab-status', 'class': 'tab-pane', 'style': 'display: block;' }, [
			E('h3', {}, _('LinkBack Multi-WAN Runtime Status')),
			E('div', { 'class': 'cbi-section-descr' }, _('Dynamic health state and priority mapping for Multi-WAN default routing metrics.')),
			E('div', { 'id': 'linkback-status-box' }, [
				E('p', { 'class': 'spinning' }, _('Loading real-time link status...'))
			]),
			E('hr'),
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Service Control')),
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('Daemon Service Action')),
					E('div', { 'class': 'cbi-value-field' }, [
						E('button', {
							'class': 'cbi-button cbi-button-apply',
							'click': function() { return self.handleServiceAction('restart'); }
						}, [ _('Restart Service') ]),
						E('button', {
							'class': 'cbi-button cbi-button-reset',
							'style': 'margin-left: 10px;',
							'click': function() { return self.handleServiceAction('stop'); }
						}, [ _('Stop Service') ]),
						E('button', {
							'class': 'cbi-button cbi-button-action',
							'style': 'margin-left: 10px;',
							'click': function() { return self.handleServiceAction('start'); }
						}, [ _('Start Service') ])
					])
				])
			])
		]);

		// --- TAB 2: Config Pane (CBI Form) ---
		var configPane = E('div', { 'id': 'tab-config', 'class': 'tab-pane', 'style': 'display: none;' });

		// --- TAB 3: Logs Pane ---
		var logArea = E('div', { 'class': 'linkback-log-area' }, [ _('Connecting to logs...') ]);
		var logsPane = E('div', { 'id': 'tab-logs', 'class': 'tab-pane', 'style': 'display: none;' }, [
			E('h3', {}, _('LinkBack System Logs')),
			E('div', { 'class': 'cbi-section-descr' }, _('Real-time routing adjustments and health check state transitions.')),
			E('div', { 'style': 'margin-bottom: 10px; text-align: right;' }, [
				E('button', {
					'class': 'cbi-button cbi-button-reset',
					'click': function() {
						logArea.textContent = _('Refreshing...');
						self.refreshLogs(logArea);
					}
				}, [ _('Refresh Logs') ])
			]),
			logArea
		]);

		tabcontainer.appendChild(statusPane);
		tabcontainer.appendChild(configPane);
		tabcontainer.appendChild(logsPane);

		// Render Config Form inside tab-config
		this.renderForm(configPane);

		// Start polling for real-time status updates every 3 seconds
		poll.add(function() {
			return callGetStatus().then(function(res) {
				self.updateStatusView(res);
			});
		}, 3);

		// Initial load of logs
		this.refreshLogs(logArea);

		return E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, _('LinkBack Multi-WAN Manager')),
			tabmenu,
			tabcontainer
		]);
	},

	updateStatusView: function(status) {
		var box = document.getElementById('linkback-status-box');
		if (!box) return;

		if (!status || !status.links || status.links.length === 0) {
			dom.content(box, [
				E('div', { 'class': 'cbi-section-node' }, [
					E('p', { 'style': 'color: #f44336; font-weight: bold; padding: 20px;' }, 
						_('LinkBack daemon is currently stopped or has no active configurations. Please configure links and enable it.'))
				])
			]);
			return;
		}

		var activeLink = status.active_link || 'none';
		var nodes = [];

		var stack = E('div', { 'class': 'linkback-stack' });

		status.links.forEach(function(link, index) {
			var roleTitle = '';
			var roleClass = '';
			var cardClass = 'linkback-card ';

			if (link.is_up && link.healthy) {
				if (link.name === activeLink) {
					roleTitle = _('主选链路 / 活动中 (Active Main)');
					roleClass = 'linkback-badge-active';
					cardClass += 'linkback-card-active';
				} else {
					roleTitle = _('次选链路 / 待命 (Standby)');
					roleClass = 'linkback-badge-standby';
					cardClass += 'linkback-card-standby';
				}
			} else {
				roleTitle = _('备选链路 / 已断开 (Faulted)');
				roleClass = 'linkback-badge-faulted';
				cardClass += 'linkback-card-faulted';
			}

			// Render detailed check badges
			var checkBadges = [];
			
			// Ping indicator
			if (link.ping && link.ping.rtt !== -1) {
				var dotClass = link.ping.ok ? 'linkback-dot-green' : 'linkback-dot-red';
				checkBadges.push(E('span', { 'class': 'linkback-indicator' }, [
					E('span', { 'class': 'linkback-dot ' + dotClass }),
					'Ping: ' + (link.ping.ok ? link.ping.rtt + 'ms' : _('Failed'))
				]));
			}

			// DNS indicator
			if (link.dns && link.dns.rtt !== -1) {
				var dotClass = link.dns.ok ? 'linkback-dot-green' : 'linkback-dot-red';
				checkBadges.push(E('span', { 'class': 'linkback-indicator' }, [
					E('span', { 'class': 'linkback-dot ' + dotClass }),
					'DNS: ' + (link.dns.ok ? link.dns.rtt + 'ms' : _('Failed'))
				]));
			}

			// TCP indicator
			if (link.tcp && link.tcp.rtt !== -1) {
				var dotClass = link.tcp.ok ? 'linkback-dot-green' : 'linkback-dot-red';
				checkBadges.push(E('span', { 'class': 'linkback-indicator' }, [
					E('span', { 'class': 'linkback-dot ' + dotClass }),
					'TCP: ' + (link.tcp.ok ? link.tcp.rtt + 'ms' : _('Failed'))
				]));
			}

			var card = E('div', { 'class': cardClass }, [
				E('div', { 'style': 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;' }, [
					E('strong', { 'style': 'font-size: 15px;' }, [
						_('Interface: ') + link.name + ' (' + (link.device || _('Disconnected')) + ')'
					]),
					E('span', { 'class': 'linkback-badge ' + roleClass }, roleTitle)
				]),
				E('div', { 'style': 'font-size: 12px; color: #555; margin-bottom: 12px;' }, [
					E('span', { 'style': 'margin-right: 15px;' }, _('Config Priority: ') + '<strong>' + link.priority + '</strong>'),
					E('span', { 'style': 'margin-right: 15px;' }, _('Base Metric: ') + '<strong>' + link.metric + '</strong>'),
					E('span', { 'style': 'margin-right: 15px;' }, _('Running Metric: ') + '<strong>' + link.current_metric + '</strong>'),
					link.gateway ? E('span', {}, _('Gateway: ') + '<strong>' + link.gateway + '</strong>') : ''
				]),
				E('div', { 'style': 'display: flex; justify-content: space-between; align-items: center;' }, [
					E('div', {}, checkBadges),
					E('span', { 'style': 'font-weight: bold; font-size: 12px;' }, 
						_('Health Score: ') + link.score + ' / ' + link.threshold + 
						(link.score >= link.threshold ? ' (OK)' : ' (Low)')
					)
				])
			]);

			var node = E('div', { 'class': 'linkback-node' }, [
				E('div', { 'class': 'linkback-num' }, [ (index + 1).toString() ]),
				card
			]);

			stack.appendChild(node);
		});

		dom.content(box, [ stack ]);
	},

	refreshLogs: function(area) {
		return callGetLog().then(function(res) {
			area.textContent = res.log || _('No logs available.');
			area.scrollTop = area.scrollHeight; // Scroll to bottom
		});
	},

	handleServiceAction: function(action) {
		ui.showModal(null, [
			E('p', { 'class': 'spinning' }, _('Applying service state action: %s...').format(action))
		]);

		return callManageService(action).then(function(res) {
			ui.hideModal();
			if (res && res.success) {
				ui.addNotification(null, E('p', _('Successfully completed service action.')), 'info');
			} else {
				ui.addNotification(null, E('p', _('Failed to manage service.')), 'error');
			}
		}).catch(function(err) {
			ui.hideModal();
			ui.addNotification(null, E('p', _('Error calling RPC: %s').format(err.message)), 'error');
		});
	},

	renderForm: function(container) {
		var m = new form.Map('linkback', _('LinkBack Global Configuration'), 
			_('Configure Multi-WAN fallback routes, check weights, intervals, and health targets.'));
		
		var s = m.section(form.TypedSection, 'global', _('Global Monitor Options'));
		s.anonymous = true;

		s.option(form.Flag, 'enabled', _('Enable LinkBack Service'));

		var interval = s.option(form.Value, 'check_interval', _('Check Interval (seconds)'));
		interval.datatype = 'uinteger';
		interval.default = '5';
		interval.rmempty = false;

		var timeout = s.option(form.Value, 'check_timeout', _('Connection Timeout (seconds)'));
		timeout.datatype = 'uinteger';
		timeout.default = '3';
		timeout.rmempty = false;

		var recovery = s.option(form.Value, 'recovery_delay', _('Recovery Delay (success count)'));
		recovery.datatype = 'uinteger';
		recovery.default = '3';
		recovery.rmempty = false;

		var failover = s.option(form.Value, 'failover_delay', _('Failover Delay (failure count)'));
		failover.datatype = 'uinteger';
		failover.default = '2';
		failover.rmempty = false;

		// --- Section for Links ---
		var sl = m.section(form.TypedSection, 'link', _('Monitored WAN Interfaces'),
			_('Add and prioritize your WAN interfaces. Interfaces will be sorted and evaluated by Priority (lower numbers are preferred).'));
		sl.anonymous = true;
		sl.addremove = true;

		// Link Name matching network.interface
		var iface = sl.option(form.Value, 'name', _('WAN Interface Name'), _('Matches your Network Interface name (e.g. wan, wan2)'));
		iface.datatype = 'string';
		iface.rmempty = false;

		var enabled = sl.option(form.Flag, 'enabled', _('Enabled'));
		enabled.default = '1';

		var priority = sl.option(form.Value, 'priority', _('Routing Priority'), _('Lesser number is preferred (e.g., 1 is main, 2 is backup)'));
		priority.datatype = 'uinteger';
		priority.default = '1';
		priority.rmempty = false;

		var metric = sl.option(form.Value, 'metric', _('Default Route Metric'), _('Base route metric when link is healthy (e.g., wan=10, wan2=20)'));
		metric.datatype = 'uinteger';
		metric.default = '10';
		metric.rmempty = false;

		// Ping configurations
		var pings = sl.option(form.Value, 'ping_targets', _('Ping targets'), _('Space-separated list of target IPs (e.g., 223.5.5.5 8.8.8.8)'));
		pings.datatype = 'string';
		pings.rmempty = true;

		var ping_w = sl.option(form.Value, 'ping_weight', _('Ping Check Weight'));
		ping_w.datatype = 'uinteger';
		ping_w.default = '1';

		// DNS configurations
		var dns_srv = sl.option(form.Value, 'dns_server', _('DNS Server IP'), _('DNS server to send UDP DNS requests to (e.g. 119.29.29.29)'));
		dns_srv.datatype = 'ip4addr';
		dns_srv.rmempty = true;

		var dns_dom = sl.option(form.Value, 'dns_domain', _('DNS Target Domain'), _('Domain name to query (e.g. www.baidu.com)'));
		dns_dom.datatype = 'string';
		dns_dom.rmempty = true;

		var dns_w = sl.option(form.Value, 'dns_weight', _('DNS Check Weight'));
		dns_w.datatype = 'uinteger';
		dns_w.default = '1';

		// TCP configurations
		var tcp_tgt = sl.option(form.Value, 'tcp_target', _('TCP Target IP'));
		tcp_tgt.datatype = 'ip4addr';
		tcp_tgt.rmempty = true;

		var tcp_p = sl.option(form.Value, 'tcp_port', _('TCP Target Port'));
		tcp_p.datatype = 'port';
		tcp_p.rmempty = true;

		var tcp_w = sl.option(form.Value, 'tcp_weight', _('TCP Check Weight'));
		tcp_w.datatype = 'uinteger';
		tcp_w.default = '1';

		// Score threshold
		var threshold = sl.option(form.Value, 'weight_threshold', _('Weight Threshold'), 
			_('Combined weight score required to mark this link healthy (e.g., if threshold is 2, any 2 successful checks will pass)'));
		threshold.datatype = 'uinteger';
		threshold.default = '2';
		threshold.rmempty = false;

		m.render().then(function(formNode) {
			dom.content(container, [ formNode ]);
		});
	}
});
