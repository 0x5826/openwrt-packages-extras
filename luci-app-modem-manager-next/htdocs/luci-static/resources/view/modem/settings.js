'use strict';
'require view';
'require rpc';
'require ui';

const callGetDevices = rpc.declare({
	object: 'luci.modem',
	method: 'get_devices',
	expect: { devices: [] }
});

const callGetConfig = rpc.declare({
	object: 'luci.modem',
	method: 'get_config',
	expect: { port: '', baud: '115200' }
});

const callSaveConfig = rpc.declare({
	object: 'luci.modem',
	method: 'save_config',
	params: [ 'port', 'baud' ]
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
	configData: {},

	load: function() {
		return Promise.all([
			L.resolveDefault(callGetDevices(), []),
			L.resolveDefault(callGetConfig(), {})
		]);
	},

	handleApplySettings: function() {
		const self = this;
		const portSelect = document.getElementById('modem_port_select');
		const customPortInput = document.getElementById('modem_custom_port');
		let targetPort = (portSelect && portSelect.value === 'custom') ? (customPortInput ? customPortInput.value.trim() : '') : (portSelect ? portSelect.value : '');

		if (!targetPort) {
			targetPort = self.selectedPort;
		}

		if (!targetPort) {
			ui.addNotification(null, E('p', {}, _('Please specify or select an active AT communication port.')), 'error');
			return;
		}

		const baudVal = document.getElementById('modem_baud_select').value || '115200';

		const modeEl = document.querySelector('input[name="modem_mode"]:checked');
		const modeVal = modeEl ? modeEl.value : 'ncm';
		const syncNet = document.getElementById('modem_sync_net').checked;
		const ifname = document.getElementById('modem_ifname').value || 'modem_wan';

		const ratEl = document.getElementById('modem_rat_select');
		const ratVal = ratEl ? ratEl.value : 'AUTO';

		const lteEls = document.querySelectorAll('.modem-band-lte:checked');
		const nrEls = document.querySelectorAll('.modem-band-nr:checked');
		const bandsLte = [];
		const bandsNr = [];
		for (let i = 0; i < lteEls.length; i++) bandsLte.push(lteEls[i].value);
		for (let i = 0; i < nrEls.length; i++) bandsNr.push(nrEls[i].value);

		ui.showModal(_('Applying Configuration'), [
			E('p', { 'class': 'spinning' }, _('Saving port settings and sending configuration commands, please wait...'))
		]);

		Promise.all([
			callSaveConfig(targetPort, baudVal),
			callSetMode(targetPort, modeVal, 'quectel-5g', syncNet, ifname, self.selectedNet),
			callSetPreferences(targetPort, ratVal, bandsLte, bandsNr),
			callSetApn(targetPort, apnVal, pdpVal)
		]).then(function(results) {
			ui.hideModal();
			ui.addNotification(null, E('p', {}, _('Modem settings successfully applied.')), 'info');
		}).catch(function(err) {
			ui.hideModal();
			ui.addNotification(null, E('p', {}, _('Failed to apply settings: ') + err.message), 'error');
		});
	},

	render: function(loadData) {
		const self = this;
		const devicesData = loadData ? loadData[0] : null;
		self.configData = loadData ? loadData[1] : {};

		self.devicesList = Array.isArray(devicesData) ? devicesData : ((devicesData && Array.isArray(devicesData.devices)) ? devicesData.devices : []);

		if (self.devicesList.length > 0) {
			self.selectedPort = self.configData.port || self.devicesList[0].primary_port;
			self.selectedNet = self.devicesList[0].primary_net;
		}

		const deviceOptions = [];
		self.devicesList.forEach(function(dev, idx) {
			let label = dev.vendor + ' ' + dev.model + ' (' + (dev.primary_port || _('No Port')) + ')';
			const optAttrs = { value: dev.primary_port, 'data-net': dev.primary_net };
			if (idx === 0) optAttrs.selected = '';
			deviceOptions.push(E('option', optAttrs, label));
		});

		const container = E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, _('Cellular Modem Manager') + ' - ' + _('Settings')),
			E('div', { 'class': 'cbi-map-descr' }, _('Configure driver protocols, lock preferred access technologies, customize APN credentials, and manage cellular network interfaces.'))
		]);

		if (self.devicesList.length === 0) {
			container.appendChild(E('div', { 'class': 'alert-message warning', 'style': 'margin-top: 15px; padding: 15px; border-left: 5px solid #ff9800; background: #fff8e1;' }, [
				E('h4', { 'style': 'margin: 0 0 8px 0; color: #d32f2f;' }, _('No Cellular Modem Detected')),
				E('p', { 'style': 'margin: 0; color: #555;' }, _('No active cellular modem detected. You can still pre-configure serial port path or refresh after connecting.'))
			]));
		}

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

		// Serial Port Customization Section
		const dev = self.devicesList[0] || {};
		const availablePorts = dev.ports || [];
		const activeConfigPort = self.configData.port || dev.primary_port || '';

		const portSelectOptions = [];
		let matchedInList = false;

		availablePorts.forEach(function(p) {
			let isSelected = (p === activeConfigPort);
			if (isSelected) matchedInList = true;
			let isAuto = (p === dev.primary_port);
			let optLabel = p + (isAuto ? ' [' + _('Auto Recommended') + ']' : '');
			const optAttrs = { value: p };
			if (isSelected) optAttrs.selected = '';
			portSelectOptions.push(E('option', optAttrs, optLabel));
		});

		const customOptAttrs = { value: 'custom' };
		if (!matchedInList && activeConfigPort !== '') customOptAttrs.selected = '';
		portSelectOptions.push(E('option', customOptAttrs, _('Manual Custom Path')));

		const portSection = E('fieldset', { 'class': 'cbi-section' }, [
			E('legend', {}, _('Serial Port and Communication Configuration')),
			E('div', { 'class': 'cbi-section-node' }, [
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('Primary AT Port')),
					E('div', { 'class': 'cbi-value-field' }, [
						E('select', {
							'id': 'modem_port_select',
							'class': 'cbi-input-select',
							'style': 'min-width: 280px;',
							'change': function(ev) {
								const customWrap = document.getElementById('modem_custom_port_wrap');
								if (customWrap) {
									customWrap.style.display = (ev.target.value === 'custom') ? 'block' : 'none';
								}
							}
						}, portSelectOptions),
						E('div', {
							'id': 'modem_custom_port_wrap',
							'style': 'margin-top: 8px; display: ' + ((!matchedInList && activeConfigPort !== '') ? 'block' : 'none') + ';'
						}, [
							E('input', {
								'type': 'text',
								'id': 'modem_custom_port',
								'class': 'cbi-input-text',
								'style': 'min-width: 280px;',
								'placeholder': '/dev/ttyUSB2 or /dev/modem_at',
								'value': (!matchedInList ? activeConfigPort : '')
							}),
							E('span', { 'style': 'margin-left: 10px; color: #888; font-size: 12px;' }, _('Specify custom node path'))
						]),
						E('div', { 'class': 'cbi-value-description' }, _('Select or enter the dedicated AT control port for background status polling and control commands.'))
					])
				]),
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('Serial Baudrate')),
					E('div', { 'class': 'cbi-value-field' }, [
						E('select', { 'id': 'modem_baud_select', 'class': 'cbi-input-select', 'style': 'min-width: 150px;' },
							['9600', '38400', '57600', '115200', '230400', '460800', '921600'].map(function(b) {
								const opt = { value: b };
								if (b === (self.configData.baud || '115200')) opt.selected = '';
								return E('option', opt, b);
							})
						),
						E('div', { 'class': 'cbi-value-description' }, _('Standard cellular modem AT serial baudrate (Default: 115200).'))
					])
				])
			])
		]);
		container.appendChild(portSection);

		// Protocol Mode Switching Section
		const modeSection = E('fieldset', { 'class': 'cbi-section' }, [
			E('legend', {}, _('Driver Protocol and Operation Mode')),
			E('div', { 'class': 'cbi-section-node' }, [
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('Driver Mode')),
					E('div', { 'class': 'cbi-value-field' }, [
						E('label', { 'style': 'margin-right: 20px;' }, [
							E('input', { 'type': 'radio', 'name': 'modem_mode', 'value': 'ncm', 'checked': 'checked' }), ' ',
							_('NCM Mode')
						]),
						E('label', { 'style': 'margin-right: 20px;' }, [
							E('input', { 'type': 'radio', 'name': 'modem_mode', 'value': 'mbim' }), ' ',
							_('MBIM Mode')
						]),
						E('label', { 'style': 'margin-right: 20px;' }, [
							E('input', { 'type': 'radio', 'name': 'modem_mode', 'value': 'qmi' }), ' ',
							_('QMI Mode')
						]),
						E('label', {}, [
							E('input', { 'type': 'radio', 'name': 'modem_mode', 'value': 'ecm' }), ' ',
							_('ECM Mode')
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
						E('div', { 'style': 'display: flex; flex-wrap: wrap; gap: 10px; padding-top: 5px;' },
							['B1', 'B3', 'B5', 'B8', 'B34', 'B38', 'B39', 'B40', 'B41'].map(function(band) {
								return E('label', {
									'style': 'display: inline-flex; align-items: center; gap: 4px; cursor: pointer; min-width: 60px;'
								}, [
									E('input', { 'type': 'checkbox', 'class': 'cbi-input-checkbox modem-band-lte', 'value': band, 'checked': 'checked' }),
									E('span', {}, band)
								]);
							})
						)
					])
				]),
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('5G NR Bands')),
					E('div', { 'class': 'cbi-value-field' }, [
						E('div', { 'style': 'display: flex; flex-wrap: wrap; gap: 10px; padding-top: 5px;' },
							['N1', 'N28', 'N41', 'N77', 'N78', 'N79'].map(function(band) {
								return E('label', {
									'style': 'display: inline-flex; align-items: center; gap: 4px; cursor: pointer; min-width: 60px;'
								}, [
									E('input', { 'type': 'checkbox', 'class': 'cbi-input-checkbox modem-band-nr', 'value': band, 'checked': 'checked' }),
									E('span', {}, band)
								]);
							})
						)
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
