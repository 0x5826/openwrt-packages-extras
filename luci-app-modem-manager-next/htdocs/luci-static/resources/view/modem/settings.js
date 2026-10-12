'use strict';
'require view';
'require rpc';
'require ui';

const callGetDevices = rpc.declare({
	object: 'luci.modem',
	method: 'get_devices',
	expect: { devices: [] }
});

const callSetMode = rpc.declare({
	object: 'luci.modem',
	method: 'set_mode',
	params: [ 'port', 'mode', 'template_id', 'sync_network', 'ifname', 'device_net' ]
});

const callSetPreferences = rpc.declare({
	object: 'luci.modem',
	method: 'set_preferences',
	params: [ 'port', 'rat', 'bands_lte', 'bands_nr5g' ]
});

const callSetApn = rpc.declare({
	object: 'luci.modem',
	method: 'set_apn',
	params: [ 'port', 'apn', 'pdp_type' ]
});

return view.extend({
	handleSaveApply: null,
	handleSave: null,
	handleReset: null,

	selectedPort: null,
	selectedNet: null,
	devicesList: [],

	load: function() {
		return callGetDevices();
	},

	handleApplySettings: function() {
		const self = this;
		if (!self.selectedPort) {
			ui.addNotification(null, E('p', {}, _('Please select an active modem first.')), 'error');
			return;
		}

		const modeEl = document.querySelector('input[name="modem_mode"]:checked');
		const modeVal = modeEl ? modeEl.value : 'ncm';
		const syncNet = document.getElementById('modem_sync_net').checked;
		const ifname = document.getElementById('modem_ifname').value || 'modem_wan';

		const ratEl = document.getElementById('modem_rat_select');
		const ratVal = ratEl ? ratEl.value : 'AUTO';

		const apnVal = document.getElementById('modem_apn').value || 'cmiot';
		const pdpVal = document.getElementById('modem_pdp').value || 'IPV4V6';

		ui.showModal(_('Applying Configuration'), [
			E('p', { 'class': 'spinning' }, _('Sending configuration commands to modem, please wait...'))
		]);

		Promise.all([
			callSetMode(self.selectedPort, modeVal, 'quectel-5g', syncNet, ifname, self.selectedNet),
			callSetPreferences(self.selectedPort, ratVal, [], []),
			callSetApn(self.selectedPort, apnVal, pdpVal)
		]).then(function(results) {
			ui.hideModal();
			ui.addNotification(null, E('p', {}, _('Modem settings successfully applied.')), 'info');
		}).catch(function(err) {
			ui.hideModal();
			ui.addNotification(null, E('p', {}, _('Failed to apply settings: ') + err.message), 'error');
		});
	},

	render: function(devicesData) {
		const self = this;
		self.devicesList = (devicesData && devicesData.devices) ? devicesData.devices : [];

		if (self.devicesList.length > 0) {
			self.selectedPort = self.devicesList[0].primary_port;
			self.selectedNet = self.devicesList[0].primary_net;
		}

		const deviceOptions = [];
		self.devicesList.forEach(function(dev, idx) {
			let label = dev.vendor + ' ' + dev.model + ' (' + (dev.primary_port || _('No Port')) + ')';
			deviceOptions.push(E('option', { value: dev.primary_port, 'data-net': dev.primary_net, selected: idx === 0 }, label));
		});

		const container = E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, _('Cellular Modem Manager') + ' - ' + _('Settings')),
			E('div', { 'class': 'cbi-map-descr' }, _('Configure driver protocols, lock preferred access technologies, customize APN credentials, and manage cellular network interfaces.'))
		]);

		// Device Selector
		const selectorNode = E('fieldset', { 'class': 'cbi-section' }, [
			E('legend', {}, _('Target Modem Selection')),
			E('div', { 'class': 'cbi-section-node' }, [
				E('div', { 'style': 'display: flex; align-items: center; gap: 15px; padding: 10px 0;' }, [
					E('label', { 'style': 'font-weight: bold;' }, _('Active Device:')),
					deviceOptions.length > 0 ? E('select', {
						'class': 'cbi-input-select',
						'style': 'min-width: 320px;',
						'change': function(ev) {
							self.selectedPort = ev.target.value;
							let opt = ev.target.options[ev.target.selectedIndex];
							self.selectedNet = opt.getAttribute('data-net');
						}
					}, deviceOptions) : E('span', { 'style': 'color: red;' }, _('No cellular modems detected.')),
				])
			])
		]);
		container.appendChild(selectorNode);

		// Protocol Mode Switching Section
		const modeSection = E('fieldset', { 'class': 'cbi-section' }, [
			E('legend', {}, _('Driver Protocol and Operation Mode')),
			E('div', { 'class': 'cbi-section-node' }, [
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('Driver Mode')),
					E('div', { 'class': 'cbi-value-field' }, [
						E('label', { 'style': 'margin-right: 20px;' }, [
							E('input', { 'type': 'radio', 'name': 'modem_mode', 'value': 'mbim' }), ' ',
							_('MBIM Mode')
						]),
						E('label', { 'style': 'margin-right: 20px;' }, [
							E('input', { 'type': 'radio', 'name': 'modem_mode', 'value': 'ncm', 'checked': 'checked' }), ' ',
							_('NCM Mode')
						]),
						E('label', { 'style': 'margin-right: 20px;' }, [
							E('input', { 'type': 'radio', 'name': 'modem_mode', 'value': 'qmi' }), ' ',
							_('QMI Mode')
						]),
						E('label', { 'style': 'margin-right: 20px;' }, [
							E('input', { 'type': 'radio', 'name': 'modem_mode', 'value': 'ecm' }), ' ',
							_('ECM Mode')
						]),
						E('label', {}, [
							E('input', { 'type': 'radio', 'name': 'modem_mode', 'value': 'rndis' }), ' ',
							_('RNDIS Mode')
						]),
						E('div', { 'class': 'cbi-value-description' }, _('Switching the operation mode requires restarting the modem to take effect.'))
					])
				]),
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('Sync OpenWrt Network')),
					E('div', { 'class': 'cbi-value-field' }, [
						E('input', { 'type': 'checkbox', 'id': 'modem_sync_net', 'checked': 'checked' }), ' ',
						_('Automatically update or create corresponding logical network interface in OpenWrt')
					])
				]),
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('Interface Name')),
					E('div', { 'class': 'cbi-value-field' }, [
						E('input', { 'type': 'text', 'id': 'modem_ifname', 'class': 'cbi-input-text', 'value': 'modem_wan' }),
						E('div', { 'class': 'cbi-value-description' }, _('The OpenWrt logical interface name to associate with this modem.'))
					])
				])
			])
		]);
		container.appendChild(modeSection);

		// Network RAT and Band Locking Section
		const ratSection = E('fieldset', { 'class': 'cbi-section' }, [
			E('legend', {}, _('Network Access Technology and Band Locking')),
			E('div', { 'class': 'cbi-section-node' }, [
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('Access Technology Preference')),
					E('div', { 'class': 'cbi-value-field' }, [
						E('select', { 'id': 'modem_rat_select', 'class': 'cbi-input-select' }, [
							E('option', { 'value': 'AUTO', 'selected': 'selected' }, _('Automatic Mode')),
							E('option', { 'value': 'NR5G' }, _('5G Standalone Only')),
							E('option', { 'value': 'NR5G:LTE' }, _('5G and 4G Hybrid')),
							E('option', { 'value': 'LTE' }, _('4G LTE Only'))
						]),
						E('div', { 'class': 'cbi-value-description' }, _('Select priority radio access technology for network registration.'))
					])
				]),
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('4G LTE Bands')),
					E('div', { 'class': 'cbi-value-field' }, [
						['B1', 'B3', 'B5', 'B8', 'B34', 'B38', 'B39', 'B40', 'B41'].map(function(band) {
							return E('label', { 'style': 'display: inline-block; width: 65px; margin-bottom: 5px;' }, [
								E('input', { 'type': 'checkbox', 'class': 'modem-band-lte', 'value': band, 'checked': 'checked' }), ' ',
								band
							]);
						})
					])
				]),
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('5G NR Bands')),
					E('div', { 'class': 'cbi-value-field' }, [
						['N1', 'N28', 'N41', 'N77', 'N78', 'N79'].map(function(band) {
							return E('label', { 'style': 'display: inline-block; width: 65px; margin-bottom: 5px;' }, [
								E('input', { 'type': 'checkbox', 'class': 'modem-band-nr', 'value': band, 'checked': 'checked' }), ' ',
								band
							]);
						})
					])
				])
			])
		]);
		container.appendChild(ratSection);

		// APN Section
		const apnSection = E('fieldset', { 'class': 'cbi-section' }, [
			E('legend', {}, _('Access Point Name (APN) Settings')),
			E('div', { 'class': 'cbi-section-node' }, [
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('APN Name')),
					E('div', { 'class': 'cbi-value-field' }, [
						E('input', { 'type': 'text', 'id': 'modem_apn', 'class': 'cbi-input-text', 'value': 'cmiot' }),
						E('div', { 'class': 'cbi-value-description' }, _('Cellular carrier APN profile name (e.g. cmiot, cbnet, uninet).'))
					])
				]),
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('PDP Protocol Type')),
					E('div', { 'class': 'cbi-value-field' }, [
						E('select', { 'id': 'modem_pdp', 'class': 'cbi-input-select' }, [
							E('option', { 'value': 'IPV4V6', 'selected': 'selected' }, _('Dual Stack IPv4 and IPv6')),
							E('option', { 'value': 'IP' }, _('IPv4 Only')),
							E('option', { 'value': 'IPV6' }, _('IPv6 Only'))
						])
					])
				])
			])
		]);
		container.appendChild(apnSection);

		// Submit Section
		const btnSection = E('div', { 'class': 'cbi-page-actions' }, [
			E('input', {
				'type': 'button',
				'class': 'btn cbi-button cbi-button-save',
				'value': _('Save and Apply'),
				'click': ui.createHandlerFn(self, 'handleApplySettings')
			})
		]);
		container.appendChild(btnSection);

		return container;
	}
});
