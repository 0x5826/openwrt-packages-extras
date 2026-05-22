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
	handleSaveApply: null,
	handleSave: null,
	handleReset: null,

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

		var changeModeRows = [
			E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td left', 'width': '33%' }, _('Switch to %s').format(mode === 'ap' ? _('Router Mode') : _('AP Mode'))),
				E('td', { 'class': 'td left' }, [
					E('button', {
						'class': 'cbi-button cbi-button-apply',
						'click': ui.createHandlerFn(self, function() {
							return self.handleSwitch(mode === 'ap' ? 'router' : 'ap', status);
						})
					}, [ (mode === 'ap' ? _('Switch to Router Mode') : _('Switch to AP Mode')) ])
				])
			])
		];

		var body = E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, _('AP Switch Title') + ' - ' + _('Switch Mode')),
			E('div', { 'class': 'cbi-map-descr' }, _('Switch your system runtime configuration smoothly between standard Router and Access Point (AP) modes. Network interfaces and bridge rules will be adjusted automatically.')),
			E('fieldset', { 'class': 'cbi-section' }, [
				E('legend', {}, _('Current Status')),
				E('div', { 'class': 'cbi-section-node' }, [
					E('table', { 'class': 'table cbi-section-table' }, [
						E('tr', { 'class': 'tr' }, [
							E('td', { 'class': 'td left', 'width': '33%' }, _('Operation Mode')),
							E('td', { 'class': 'td left' }, E('strong', {}, (mode === 'ap' ? _('Access Point (AP)') : _('Router'))))
						]),
						E('tr', { 'class': 'tr' }, [
							E('td', { 'class': 'td left' }, _('Login URL')),
							E('td', { 'class': 'td left' }, lan_ip ? E('a', { 
								'href': 'http://' + lan_ip,
								'target': '_blank',
								'style': 'text-decoration: underline; font-weight: bold; color: blue;'
							}, 'http://' + lan_ip) : _('N/A'))
						]),
						E('tr', { 'class': 'tr' }, [
							E('td', { 'class': 'td left' }, _('LAN IP Address')),
							E('td', { 'class': 'td left' }, [
								E('strong', { 'style': 'color: #2196F3;' }, lan_ip || _('Pending...')),
								E('span', { 'style': 'margin-left: 10px; color: #666;' }, '(' + lan_proto + ')')
							])
						]),
						E('tr', { 'class': 'tr' }, [
							E('td', { 'class': 'td left' }, _('LAN MAC Address')),
							E('td', { 'class': 'td left', 'id': 'lan-mac' }, lan_mac)
						])
					])
				])
			]),
			E('fieldset', { 'class': 'cbi-section' }, [
				E('legend', {}, _('Change Mode')),
				E('div', { 'class': 'cbi-section-node' }, [
					E('table', { 'class': 'table cbi-section-table' }, changeModeRows)
				])
			])
		]);

		return body;
	},

	handleSwitch: function(target_mode, status) {
		var self = this;

		var executeSwitch = function() {
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
		};

		if (target_mode === 'ap') {
			ui.showModal(null, [
				E('p', { 'class': 'spinning' }, _('Auto-probing for future AP IP via DHCP on br-lan...')),
				E('p', {}, _('This ensures you can find your way back to the management panel after the switch.'))
			]);

			return callProbeIP().then(function(res) {
				ui.hideModal();
				var msg = _('Switching to AP mode will bridge the WAN port into "br-lan". The "br-lan" interface will become a DHCP client to your main router.');
				
				if (res && res.ip) {
					msg += '\n\n' + _('Successfully pre-fetched future management IP: %s').format(res.ip);
					msg += '\n' + _('You can use this IP to access this dashboard after the switch.');
					msg += '\n\n' + _('Are you sure you want to switch to AP mode and restart network?');
				} else {
					msg += '\n\n' + _('WARNING: Failed to pre-fetch IP address via DHCP probe!');
					msg += '\n' + _('This may be because your LAN port is not connected to the main router.');
					msg += '\n' + _('If you proceed, you must find the new IP from your main router client list using MAC: %s').format(status.lan_mac || 'N/A');
					msg += '\n\n' + _('Do you still want to force the switch anyway?');
				}

				if (confirm(msg)) {
					return executeSwitch();
				}
			}).catch(function(err) {
				ui.hideModal();
				var msg = _('Switching to AP mode will bridge the WAN port into "br-lan". The "br-lan" interface will become a DHCP client to your main router.');
				msg += '\n\n' + _('WARNING: DHCP probe RPC error: %s').format(err.message);
				msg += '\n' + _('If you proceed, you must find the new IP from your main router client list using MAC: %s').format(status.lan_mac || 'N/A');
				msg += '\n\n' + _('Do you still want to force the switch anyway?');

				if (confirm(msg)) {
					return executeSwitch();
				}
			});
		} else {
			var msg = _('Switching to Router mode will restore the WAN port and local DHCP server. Your device will use the previous static IP address. Are you sure?');
			if (confirm(msg)) {
				return executeSwitch();
			}
		}
	}
});
