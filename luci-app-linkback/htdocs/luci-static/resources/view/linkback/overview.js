'use strict';
'require view';
'require rpc';
'require poll';
'require ui';
'require dom';

var callGetStatus = rpc.declare({
	object: 'luci.linkback',
	method: 'get_status'
});

var callManageService = rpc.declare({
	object: 'luci.linkback',
	method: 'manage_service',
	params: [ 'action' ]
});

return view.extend({
	handleSaveApply: null,
	handleSave: null,
	handleReset: null,

	injectStyle: function() {
		if (document.getElementById('linkback_status_style'))
			return;

		var css = [
			'@keyframes breathe-green{0%{box-shadow:0 0 4px rgba(76,175,80,.4)}50%{box-shadow:0 0 16px rgba(76,175,80,.9);border-color:#4CAF50}100%{box-shadow:0 0 4px rgba(76,175,80,.4)}}',
			'.linkback-card-active{border:2px solid #4CAF50!important;animation:breathe-green 2.5s infinite ease-in-out;background-color:rgba(76,175,80,.05)!important}',
			'.linkback-card-standby{border:1px solid #2196F3!important;background-color:rgba(33,150,243,.03)!important}',
			'.linkback-card-faulted{border:1px solid #f44336!important;background-color:rgba(244,67,54,.03)!important;opacity:.8}',
			'.linkback-dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;vertical-align:middle}',
			'.linkback-dot-green{background-color:#4CAF50;box-shadow:0 0 6px #4CAF50}',
			'.linkback-dot-red{background-color:#f44336;box-shadow:0 0 6px #f44336}',
			'.linkback-dot-grey{background-color:#9e9e9e}',
			'.linkback-indicator{display:inline-flex;align-items:center;padding:4px 10px;border-radius:12px;font-size:11px;font-weight:bold;margin-right:10px;background-color:rgba(0,0,0,.05)}',
			'.linkback-stack{position:relative;margin-left:20px;padding:10px 0}',
			'.linkback-stack::before{content:"";position:absolute;left:14px;top:20px;bottom:20px;width:2px;background:#e0e0e0;z-index:1}',
			'.linkback-node{display:flex;align-items:flex-start;margin-bottom:25px;position:relative;z-index:2}',
			'.linkback-num{display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:#2196F3;color:#fff;font-weight:bold;margin-right:20px;box-shadow:0 2px 4px rgba(0,0,0,.15);flex-shrink:0}',
			'.linkback-card{flex-grow:1;padding:15px;border-radius:8px;background:#fff;box-shadow:0 2px 5px rgba(0,0,0,.05);transition:all .3s ease}',
			'.linkback-card:hover{transform:translateY(-2px);box-shadow:0 4px 10px rgba(0,0,0,.1)}',
			'.linkback-badge{display:inline-block;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:bold;color:#fff}',
			'.linkback-badge-active{background-color:#4CAF50}',
			'.linkback-badge-standby{background-color:#2196F3}',
			'.linkback-badge-faulted{background-color:#f44336}'
		].join('');

		document.head.appendChild(E('style', { id: 'linkback_status_style' }, css));
	},

	load: function() {
		return callGetStatus();
	},

	render: function(status) {
		this.injectStyle();

		var container = E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, _('LinkBack 链路守护') + ' - ' + _('Overview')),
			E('div', { 'class': 'cbi-map-descr' }, _('Real-time health state, priority mapping, and service control for Multi-WAN default routing metrics.'))
		]);

		// --- Service Status Section ---
		var stateText = _('Collecting...');
		var stateColor = '#999';

		if (status && status.links && status.links.length > 0) {
			stateText = _('Running');
			stateColor = 'green';
		} else {
			stateText = _('Stopped');
			stateColor = 'red';
		}

		var statusSection = E('div', { 'class': 'cbi-section' }, [
			E('h3', { 'class': 'cbi-section-title' }, _('Service Status')),
			E('div', { 'class': 'cbi-section-node' }, [
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('Running State')),
					E('div', { 'class': 'cbi-value-field', style: 'display:flex; align-items:center;' }, [
						E('span', {
							id: 'linkback-service-state',
							style: 'font-weight:bold; color:' + stateColor + '; margin-right:15px;'
						}, stateText),
						E('button', {
							'class': 'btn cbi-button cbi-button-apply',
							click: ui.createHandlerFn(this, 'handleServiceAction', 'restart')
						}, _('Restart'))
					])
				])
			])
		]);
		container.appendChild(statusSection);

		// --- Link Priority Stack Section ---
		var linkSection = E('div', { 'class': 'cbi-section' }, [
			E('h3', { 'class': 'cbi-section-title' }, _('Link Priority Stack')),
			E('div', { 'class': 'cbi-section-node' }, [
				E('div', { id: 'linkback-status-box' }, [
					E('p', { 'class': 'spinning' }, _('Loading real-time link status...'))
				])
			])
		]);
		container.appendChild(linkSection);

		// Initial render
		this.updateStatusView(status);

		// Start polling every 3 seconds
		poll.add(L.bind(function() {
			return callGetStatus().then(L.bind(function(res) {
				this.updateStatusView(res);
			}, this));
		}, this), 3);

		return container;
	},

	updateStatusView: function(status) {
		var box = document.getElementById('linkback-status-box');
		if (!box)
			return;

		// Update service state indicator
		var stateEl = document.getElementById('linkback-service-state');
		if (stateEl) {
			if (status && status.links && status.links.length > 0) {
				stateEl.textContent = _('Running');
				stateEl.style.color = 'green';
			} else {
				stateEl.textContent = _('Stopped');
				stateEl.style.color = 'red';
			}
		}

		if (!status || !status.links || status.links.length === 0) {
			dom.content(box, [
				E('p', { style: 'color:#f44336; font-weight:bold; padding:20px;' },
					_('LinkBack daemon is not running or no links are configured. Please check Settings page.'))
			]);
			return;
		}

		var activeLink = status.active_link || 'none';
		var stack = E('div', { 'class': 'linkback-stack' });

		status.links.forEach(function(link, index) {
			var roleTitle = '';
			var roleClass = '';
			var cardClass = 'linkback-card ';

			if (link.is_up && link.healthy) {
				if (link.name === activeLink) {
					roleTitle = _('主选链路 / Active');
					roleClass = 'linkback-badge-active';
					cardClass += 'linkback-card-active';
				} else {
					roleTitle = _('次选链路 / Standby');
					roleClass = 'linkback-badge-standby';
					cardClass += 'linkback-card-standby';
				}
			} else {
				roleTitle = _('备选链路 / Faulted');
				roleClass = 'linkback-badge-faulted';
				cardClass += 'linkback-card-faulted';
			}

			// Health check indicators
			var checkBadges = [];

			if (link.ping && link.ping.rtt !== -1) {
				var dotClass = link.ping.ok ? 'linkback-dot-green' : 'linkback-dot-red';
				checkBadges.push(E('span', { 'class': 'linkback-indicator' }, [
					E('span', { 'class': 'linkback-dot ' + dotClass }),
					'Ping: ' + (link.ping.ok ? link.ping.rtt + 'ms' : _('Failed'))
				]));
			}

			if (link.dns && link.dns.rtt !== -1) {
				var dotClass = link.dns.ok ? 'linkback-dot-green' : 'linkback-dot-red';
				checkBadges.push(E('span', { 'class': 'linkback-indicator' }, [
					E('span', { 'class': 'linkback-dot ' + dotClass }),
					'DNS: ' + (link.dns.ok ? link.dns.rtt + 'ms' : _('Failed'))
				]));
			}

			if (link.tcp && link.tcp.rtt !== -1) {
				var dotClass = link.tcp.ok ? 'linkback-dot-green' : 'linkback-dot-red';
				checkBadges.push(E('span', { 'class': 'linkback-indicator' }, [
					E('span', { 'class': 'linkback-dot ' + dotClass }),
					'TCP: ' + (link.tcp.ok ? link.tcp.rtt + 'ms' : _('Failed'))
				]));
			}

			var metaItems = [
				E('span', { style: 'margin-right:15px;' }, _('Priority') + ': ' + link.priority),
				E('span', { style: 'margin-right:15px;' }, _('Metric') + ': ' + link.metric + ' → ' + link.current_metric)
			];

			if (link.gateway) {
				metaItems.push(E('span', {}, _('Gateway') + ': ' + link.gateway));
			}

			var card = E('div', { 'class': cardClass }, [
				E('div', { style: 'display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;' }, [
					E('strong', { style: 'font-size:15px;' },
						link.name + (link.device ? ' (' + link.device + ')' : '')),
					E('span', { 'class': 'linkback-badge ' + roleClass }, roleTitle)
				]),
				E('div', { style: 'font-size:12px; color:#555; margin-bottom:12px;' }, metaItems),
				E('div', { style: 'display:flex; justify-content:space-between; align-items:center;' }, [
					E('div', {}, checkBadges),
					E('span', { style: 'font-weight:bold; font-size:12px;' },
						_('Score') + ': ' + link.score + ' / ' + link.threshold +
						(link.score >= link.threshold ? ' ✓' : ' ✗'))
				])
			]);

			stack.appendChild(E('div', { 'class': 'linkback-node' }, [
				E('div', { 'class': 'linkback-num' }, [ String(index + 1) ]),
				card
			]));
		});

		dom.content(box, [ stack ]);
	},

	handleServiceAction: function(ev, action) {
		ui.showModal(null, [
			E('p', { 'class': 'spinning' }, _('Executing service action: %s ...').format(action))
		]);

		return callManageService(action).then(function(res) {
			ui.hideModal();
			if (res && res.success) {
				ui.addNotification(null, E('p', _('Service action completed successfully.')), 'info');
			} else {
				ui.addNotification(null, E('p', _('Failed to execute service action.')), 'error');
			}
		}).catch(function(err) {
			ui.hideModal();
			ui.addNotification(null, E('p', _('RPC error: %s').format(err.message)), 'error');
		});
	}
});
