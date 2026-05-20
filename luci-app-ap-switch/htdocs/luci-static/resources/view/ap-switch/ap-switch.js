'use strict';
'require view';
'require rpc';
'require ui';
'require uci';

var callGetStatus = rpc.declare({
	object: 'luci.ap-switch',
	method: 'get_status'
});

var callSetMode = rpc.declare({
	object: 'luci.ap-switch',
	method: 'set_mode',
	params: ['mode']
});

var callProbeIP = rpc.declare({
	object: 'luci.ap-switch',
	method: 'probe_ip'
});

return L.view.extend({
	load: function() {
		return Promise.all([
			callGetStatus(),
			uci.load('ap-switch')
		]);
	},

	render: function(data) {
		var self = this;
		var status = data[0];
		var mode = status.mode || 'router';
		var lan_ip = status.lan_ip || 'N/A';
		var lan_proto = status.lan_proto || 'static';
		var lan_mac = status.lan_mac || 'N/A';
		var probed_ip = status.probed_ip || '';

		var body = E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, _('AP Switch') + ' - ' + _('Switch Mode')),
			E('div', { 'class': 'cbi-map-descr' }, _('Switch your system runtime configuration smoothly between standard Router and Access Point (AP) modes. Network interfaces and bridge rules will be adjusted automatically.')),
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Current Status')),
				E('div', { 'class': 'cbi-section-node' }, [
					E('div', { 'class': 'cbi-value' }, [
						E('label', { 'class': 'cbi-value-title' }, _('Operation Mode')),
						E('div', { 'class': 'cbi-value-field' }, [
							E('strong', {}, (mode === 'ap' ? _('Access Point (AP)') : _('Router')))
						])
					]),
					E('div', { 'class': 'cbi-value' }, [
						E('label', { 'class': 'cbi-value-title' }, _('Login URL')),
						E('div', { 'class': 'cbi-value-field' }, [
							lan_ip ? E('a', { 
								'href': 'http://' + lan_ip,
								'target': '_blank',
								'style': 'text-decoration: underline; font-weight: bold;'
							}, 'http://' + lan_ip) : _('N/A')
						])
					]),
					E('div', { 'class': 'cbi-value' }, [
						E('label', { 'class': 'cbi-value-title' }, _('LAN IP Address')),
						E('div', { 'class': 'cbi-value-field' }, [
							E('strong', { 'style': 'color: #2196F3;' }, lan_ip || _('Pending...')),
							E('span', { 'style': 'margin-left: 10px; color: #666;' }, '(' + lan_proto + ')')
						])
					]),
					E('div', { 'class': 'cbi-value' }, [
						E('label', { 'class': 'cbi-value-title' }, _('LAN MAC Address')),
						E('div', { 'class': 'cbi-value-field' }, [
							E('span', { 'id': 'lan-mac' }, lan_mac)
						])
					])
				])
			]),
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Change Mode')),
				E('div', { 'class': 'cbi-section-node' }, [
					(mode !== 'ap') ? E('div', { 'class': 'cbi-value' }, [
						E('label', { 'class': 'cbi-value-title' }, _('Pre-fetch AP IP')),
						E('div', { 'class': 'cbi-value-field' }, [
							E('button', {
								'class': 'cbi-button cbi-button-action',
								'click': ui.createHandlerFn(this, function() {
									ui.showModal(null, [ E('p', { 'class': 'spinning' }, _('Probing for DHCP IP on br-lan...')) ]);
									return callProbeIP().then(function(res) {
										ui.hideModal();
										if (res && res.ip) {
											document.getElementById('probed-ip-display').innerText = res.ip;
											probed_ip = res.ip;
											ui.addNotification(null, E('p', _('Successfully fetched IP: %s').format(res.ip)), 'info');
										} else {
											ui.addNotification(null, E('p', _('Failed to fetch IP. Ensure a LAN port is connected to your main router.')), 'warning');
										}
									});
								})
							}, [ _('Probe IP') ]),
							E('span', { 'style': 'margin-left: 10px; font-weight: bold; color: #2196F3;', 'id': 'probed-ip-display' }, probed_ip || _('Not probed'))
						])
					]) : E('div', {}, []),
					E('div', { 'class': 'cbi-value' }, [
						E('label', { 'class': 'cbi-value-title' }, _('Switch to %s').format(mode === 'ap' ? _('Router Mode') : _('AP Mode'))),
						E('div', { 'class': 'cbi-value-field' }, [
							E('button', {
								'class': 'cbi-button cbi-button-apply',
								'click': ui.createHandlerFn(this, function() {
									return self.handleSwitch(mode === 'ap' ? 'router' : 'ap', status, probed_ip);
								})
							}, [ (mode === 'ap' ? _('Switch to Router Mode') : _('Switch to AP Mode')) ])
						])
					])
				])
			])
		]);

		return body;
	},

	handleSwitch: function(target_mode, status, probed_ip) {
		var msg = '';
		if (target_mode === 'ap') {
			msg = _('Switching to AP mode will bridge the WAN port into "br-lan". The "br-lan" interface will become a DHCP client to your main router.');
			
			if (probed_ip) {
				msg += '\n\n' + _('A valid IP was pre-fetched: %s. You can use this address to log in after the switch.').format(probed_ip);
				msg += '\n\n' + _('Are you sure you want to proceed?');
			} else {
				msg += '\n\n' + _('WARNING: No IP address was pre-fetched via DHCP probe!');
				msg += '\n' + _('We strongly recommend connecting your LAN port to the main router and using "Probe IP" first.');
				msg += '\n' + _('If you proceed now, you must find the new IP from your main router using MAC: %s').format(status.lan_mac || 'N/A');
				msg += '\n\n' + _('Do you want to proceed anyway or cancel to plug in the cable and try again?');
			}
		} else {
			msg = _('Switching to Router mode will restore the WAN port and local DHCP server. Your device will use the previous static IP address. Are you sure?');
		}

		if (!confirm(msg)) return;

		ui.showModal(null, [
			E('p', { 'class': 'spinning' }, _('Applying changes and restarting network...')),
			E('p', {}, _('The page will redirect or you may need to manually reconnect to the new IP address in a few moments.'))
		]);

		return callSetMode(target_mode).then(function(res) {
			if (res && res.result === 'success') {
				setTimeout(function() {
					ui.hideModal();
					ui.addNotification(null, E('p', _('Mode switched successfully. Please check your network connection.')), 'info');
				}, 5000);
			} else {
				ui.hideModal();
				ui.addNotification(null, E('p', _('Failed to switch mode: %s').format(res.error || 'Unknown error')), 'error');
			}
		}).catch(function(err) {
			ui.hideModal();
			ui.addNotification(null, E('p', _('Error calling RPC: %s').format(err.message)), 'error');
		});
	}
});
