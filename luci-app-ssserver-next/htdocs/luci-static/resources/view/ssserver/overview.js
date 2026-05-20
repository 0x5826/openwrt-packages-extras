'use strict';
'require view';
'require rpc';
'require poll';
'require ui';
'require uci';

const callSsserverStatus = rpc.declare({
	object: 'luci.ssserver',
	method: 'get_status'
});

const callServiceAction = rpc.declare({
	object: 'luci.ssserver',
	method: 'service_action',
	params: [ 'action' ]
});

function renderState(status) {
	let text = _('Stopped');
	let color = 'red';

	if (status.running) {
		text = _('Running');
		if (status.pid) {
			text += ' [PID: ' + status.pid + ']';
		}
		color = 'green';
	}

	return { text, color };
}

return view.extend({
	handleSaveApply: null,
	handleSave: null,
	handleReset: null,

	load: function() {
		return Promise.all([
			callSsserverStatus(),
			uci.load('ssserver')
		]);
	},

	render: function(data) {
		const status = data && data[0] ? data[0] : {};
		const stateInfo = renderState(status);

		// Read configurations from UCI
		const ssserverConfig = uci.get('ssserver', 'main') || {};
		const server = ssserverConfig.server || '0.0.0.0';
		const port = ssserverConfig.server_port || '8388';
		const method = ssserverConfig.method || 'chacha20-ietf-poly1305';
		const timeout = ssserverConfig.timeout || '300';
		
		let modeText = _('TCP and UDP');
		if (ssserverConfig.mode === 'tcp_only') modeText = _('TCP only');
		if (ssserverConfig.mode === 'udp_only') modeText = _('UDP only');

		const dns = ssserverConfig.dns_resolver || _('Default');
		const tfo = (ssserverConfig.fast_open === '1') ? _('Enabled') : _('Disabled');
		const firewall = (ssserverConfig.open_firewall === '1') ? _('Enabled') : _('Disabled');

		const container = E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, _('Shadowsocks Server Title') + ' - ' + _('Overview')),
			E('div', { 'class': 'cbi-map-descr' }, _('Overview of ssserver running status and actual runtime configurations.'))
		]);

		// Service Status Section (Aligned with lucky and frpc style)
		const statusSection = E('div', { 'class': 'cbi-section' }, [
			E('h3', { 'class': 'cbi-section-title' }, _('Service Status')),
			E('div', { 'class': 'cbi-section-node' }, [
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('Current Status')),
					E('div', { 'class': 'cbi-value-field' }, [
						E('span', {
							id: 'ssserver-status-text',
							'style': 'font-weight:bold; color:' + stateInfo.color + '; margin-right:15px;'
						}, stateInfo.text),
						E('button', {
							id: 'ssserver-restart-btn',
							'class': 'btn cbi-button cbi-button-apply',
							'style': 'display:' + (status.running ? 'inline-block' : 'none') + ';',
							click: ui.createHandlerFn(this, function(ev) {
								if (!ev || !ev.currentTarget) return;
								const btn = ev.currentTarget;
								btn.disabled = true;
								
								ui.addNotification(null, E('p', _('Restarting Shadowsocks Server, please wait...')), 'info');
								
								return callServiceAction('restart').then(function(res) {
									btn.disabled = false;
									if (res && res.success) {
										ui.addNotification(null, E('p', _('Service restarted successfully.')), 'info');
									} else {
										ui.addNotification(null, E('p', _('Failed to restart service.')), 'error');
									}
								}).catch(function(err) {
									btn.disabled = false;
									ui.addNotification(null, E('p', _('An error occurred: ') + err.message), 'error');
								});
							})
						}, _('Restart'))
					])
				])
			])
		]);

		container.appendChild(statusSection);

		// Runtime Configuration Section
		const configSection = E('div', { 'class': 'cbi-section' }, [
			E('h3', { 'class': 'cbi-section-title' }, _('Runtime Configurations')),
			E('div', { 'class': 'cbi-section-node' }, [
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('Server Address')),
					E('div', { 'class': 'cbi-value-field' }, [
						E('code', {}, server)
					])
				]),
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('Server Port')),
					E('div', { 'class': 'cbi-value-field' }, [
						E('code', {}, port)
					])
				]),
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('Encryption Method')),
					E('div', { 'class': 'cbi-value-field' }, [
						E('code', {}, method)
					])
				]),
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('Network Mode')),
					E('div', { 'class': 'cbi-value-field' }, [
						E('span', {}, modeText)
					])
				]),
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('ssserver timeout')),
					E('div', { 'class': 'cbi-value-field' }, [
						E('span', {}, timeout + ' ' + _('seconds'))
					])
				]),
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('DNS Resolver')),
					E('div', { 'class': 'cbi-value-field' }, [
						E('code', {}, dns)
					])
				]),
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('TCP Fast Open')),
					E('div', { 'class': 'cbi-value-field' }, [
						E('span', {}, tfo)
					])
				]),
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('Open Firewall')),
					E('div', { 'class': 'cbi-value-field' }, [
						E('span', {}, firewall)
					])
				])
			])
		]);

		container.appendChild(configSection);

		// Add live status polling
		poll.add(function() {
			return callSsserverStatus().then(function(status) {
				const textNode = document.getElementById('ssserver-status-text');
				const restartBtn = document.getElementById('ssserver-restart-btn');
				
				if (textNode && restartBtn) {
					const stateInfo = renderState(status || {});
					
					textNode.textContent = stateInfo.text;
					textNode.style.color = stateInfo.color;
					
					// Toggle button visibility based on runtime state
					if (status.running) {
						restartBtn.style.display = 'inline-block';
					} else {
						restartBtn.style.display = 'none';
					}
				}
			});
		}, 5);

		return container;
	}
});
