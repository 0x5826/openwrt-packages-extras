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
	params: [ 'port', 'mode' ]
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

const callGetApn = rpc.declare({
	object: 'luci.modem',
	method: 'get_apn',
	params: [ 'port' ]
});

const callGetCellLock = rpc.declare({
	object: 'luci.modem',
	method: 'get_cell_lock',
	params: [ 'port' ]
});

const callSetCellLock = rpc.declare({
	object: 'luci.modem',
	method: 'set_cell_lock',
	params: [ 'port', 'mode', 'earfcn', 'pci' ]
});

const callGetStatus = rpc.declare({
	object: 'luci.modem',
	method: 'get_status',
	params: [ 'port', 'primary_net' ]
});

return view.extend({
	handleSaveApply: null,
	handleSave: null,
	handleReset: null,

	selectedPort: null,
	selectedNet: null,
	devicesList: [],
	configData: {},
	cellLockData: {},
	apnData: {},

	load: function() {
		const self = this;
		return Promise.all([
			L.resolveDefault(callGetDevices(), []),
			L.resolveDefault(callGetConfig(), {})
		]).then(function(results) {
			const devs = results[0];
			const cfg = results[1] || {};
			const list = Array.isArray(devs) ? devs : ((devs && Array.isArray(devs.devices)) ? devs.devices : []);
			const port = cfg.port || (list.length > 0 ? list[0].primary_port : null);

			if (port) {
				return Promise.all([
					L.resolveDefault(callGetCellLock(port), {}),
					L.resolveDefault(callGetApn(port), {})
				]).then(function(extraResults) {
					return [ devs, cfg, extraResults[0] || {}, extraResults[1] || {} ];
				});
			}
			return [ devs, cfg, {}, {} ];
		});
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

		const ratEl = document.getElementById('modem_rat_select');
		const ratVal = ratEl ? ratEl.value : 'AUTO';

		const apnEl = document.getElementById('modem_apn');
		const apnVal = apnEl ? apnEl.value.trim() : 'cmiot';
		const pdpEl = document.getElementById('modem_pdp');
		const pdpVal = pdpEl ? pdpEl.value : 'IPV4V6';

		const lteEls = document.querySelectorAll('.modem-band-lte:checked');
		const nrEls = document.querySelectorAll('.modem-band-nr:checked');
		const bandsLte = [];
		const bandsNr = [];
		for (let i = 0; i < lteEls.length; i++) bandsLte.push(lteEls[i].value);
		for (let i = 0; i < nrEls.length; i++) bandsNr.push(nrEls[i].value);

		const cellModeEl = document.getElementById('modem_cell_lock_mode');
		const cellLockMode = cellModeEl ? cellModeEl.value : 'none';
		const cellEarfcnEl = document.getElementById('modem_cell_lock_earfcn');
		const cellLockEarfcn = cellEarfcnEl ? cellEarfcnEl.value.trim() : '';
		const cellPciEl = document.getElementById('modem_cell_lock_pci');
		const cellLockPci = cellPciEl ? cellPciEl.value.trim() : '';

		if (cellLockMode !== 'none') {
			if (!cellLockEarfcn || !cellLockPci) {
				ui.addNotification(null, E('p', {}, _('Both carrier frequency and physical cell ID are required for cell locking.')), 'error');
				return;
			}
			if (!/^[0-9]+$/.test(cellLockEarfcn) || !/^[0-9]+$/.test(cellLockPci)) {
				ui.addNotification(null, E('p', {}, _('Carrier frequency and physical cell ID must be valid positive integers.')), 'error');
				return;
			}
		}

		ui.showModal(_('Applying Configuration'), [
			E('p', { 'class': 'spinning' }, _('Saving port settings and sending configuration commands, please wait...'))
		]);

		callSaveConfig(targetPort, baudVal)
			.then(function() {
				return callSetMode(targetPort, modeVal);
			})
			.then(function() {
				return callSetPreferences(targetPort, ratVal, bandsLte, bandsNr);
			})
			.then(function() {
				return callSetApn(targetPort, apnVal, pdpVal);
			})
			.then(function() {
				return callSetCellLock(targetPort, cellLockMode, cellLockEarfcn, cellLockPci);
			})
			.then(function(lockRes) {
				ui.hideModal();
				if (lockRes && lockRes.success === false) {
					ui.addNotification(null, E('p', {}, _('Settings saved, but cell lock failed: ') + (lockRes.error || lockRes.output || '')), 'warning');
				} else {
					ui.addNotification(null, E('p', {}, _('Modem settings successfully applied.')), 'info');
				}
			})
			.catch(function(err) {
				ui.hideModal();
				ui.addNotification(null, E('p', {}, _('Failed to apply settings: ') + err.message), 'error');
			});
	},

	render: function(loadData) {
		const self = this;
		const devicesData = loadData ? loadData[0] : null;
		self.configData = loadData ? loadData[1] : {};
		self.cellLockData = loadData ? loadData[2] : {};
		self.apnData = loadData ? loadData[3] : {};

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

		// Target Modem Selector
		const selectorNode = E('fieldset', { 'class': 'cbi-section' }, [
			E('legend', {}, _('Target Modem Selection')),
			E('div', { 'class': 'cbi-section-node' }, [
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('Target Modem')),
					E('div', { 'class': 'cbi-value-field' }, [
						deviceOptions.length > 0 ? E('select', {
							'id': 'modem_device_select',
							'class': 'cbi-input-select',
							'style': 'min-width: 320px;',
							'change': function(ev) {
								self.selectedPort = ev.target.value;
								let opt = ev.target.options[ev.target.selectedIndex];
								self.selectedNet = opt ? opt.getAttribute('data-net') : null;
							}
						}, deviceOptions) : E('span', { 'style': 'color: red;' }, _('No cellular modems detected.')),
						E('div', { 'class': 'cbi-value-description' }, _('Select the active cellular module to configure.'))
					])
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
				])
			])
		]);
		container.appendChild(modeSection);

		// Cell Locking Section
		const isCellLocked = !!(self.cellLockData && self.cellLockData.locked);
		const cellLockType = isCellLocked ? (self.cellLockData.mode || 'nr5g') : 'none';

		const cellLockSection = E('fieldset', { 'class': 'cbi-section' }, [
			E('legend', {}, _('Base Station Cell Locking')),
			E('div', { 'class': 'cbi-section-node' }, [
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('Cell Lock Mode')),
					E('div', { 'class': 'cbi-value-field' }, [
						E('select', {
							'id': 'modem_cell_lock_mode',
							'class': 'cbi-input-select',
							'style': 'min-width: 240px;',
							'change': function(ev) {
								const val = ev.target.value;
								const inputsWrap = document.getElementById('modem_cell_lock_inputs');
								if (inputsWrap) {
									inputsWrap.style.display = (val === 'none') ? 'none' : 'block';
								}
							}
						}, [
							E('option', { 'value': 'none', 'selected': (cellLockType === 'none' ? '' : null) }, _('Automatic Selection')),
							E('option', { 'value': 'nr5g', 'selected': (cellLockType === 'nr5g' ? '' : null) }, _('Lock 5G NR Cell')),
							E('option', { 'value': 'lte', 'selected': (cellLockType === 'lte' ? '' : null) }, _('Lock 4G LTE Cell'))
						]),
						E('div', { 'class': 'cbi-value-description' }, _('Lock cellular module to a specific base station cell ID and carrier frequency.'))
					])
				]),
				E('div', { 'id': 'modem_cell_lock_inputs', 'style': 'display: ' + (isCellLocked ? 'block' : 'none') + ';' }, [
					E('div', { 'class': 'cbi-value' }, [
						E('label', { 'class': 'cbi-value-title' }, _('Carrier Frequency')),
						E('div', { 'class': 'cbi-value-field' }, [
							E('input', {
								'type': 'text',
								'id': 'modem_cell_lock_earfcn',
								'class': 'cbi-input-text',
								'style': 'min-width: 240px;',
								'placeholder': _('e.g. 627264 or 1850'),
								'value': (self.cellLockData.earfcn || '')
							}),
							E('div', { 'class': 'cbi-value-description' }, _('Target carrier ARFCN or EARFCN.'))
						])
					]),
					E('div', { 'class': 'cbi-value' }, [
						E('label', { 'class': 'cbi-value-title' }, _('Physical Cell ID')),
						E('div', { 'class': 'cbi-value-field' }, [
							E('input', {
								'type': 'text',
								'id': 'modem_cell_lock_pci',
								'class': 'cbi-input-text',
								'style': 'min-width: 240px;',
								'placeholder': _('e.g. 468'),
								'value': (self.cellLockData.pci || '')
							}),
							E('div', { 'class': 'cbi-value-description' }, _('Target base station physical cell identifier PCI.'))
						])
					]),
					E('div', { 'class': 'cbi-value' }, [
						E('label', { 'class': 'cbi-value-title' }, _('Lock Actions')),
						E('div', { 'class': 'cbi-value-field' }, [
							E('input', {
								'type': 'button',
								'class': 'btn cbi-button cbi-button-action',
								'value': _('Autofill Current Serving Cell'),
								'click': function() {
									if (!self.selectedPort) return;
									ui.showIndicator('modem_query', _('Querying serving cell...'));
									callGetStatus(self.selectedPort, self.selectedNet).then(function(st) {
										ui.hideIndicator('modem_query');
										if (st && st.cell && st.cell.earfcn && st.cell.pci) {
											const cell = st.cell;
											const earfcnInput = document.getElementById('modem_cell_lock_earfcn');
											const pciInput = document.getElementById('modem_cell_lock_pci');
											const modeSelect = document.getElementById('modem_cell_lock_mode');
											if (earfcnInput) earfcnInput.value = cell.earfcn;
											if (pciInput) pciInput.value = cell.pci;
											if (modeSelect) {
												modeSelect.value = cell.is_5g ? 'nr5g' : 'lte';
												const inputsWrap = document.getElementById('modem_cell_lock_inputs');
												if (inputsWrap) inputsWrap.style.display = 'block';
											}
											ui.addNotification(null, E('p', {}, _('Current cell values populated.')), 'info');
										} else {
											ui.addNotification(null, E('p', {}, _('No active serving cell details detected.')), 'warning');
										}
									}).catch(function(e) {
										ui.hideIndicator('modem_query');
										ui.addNotification(null, E('p', {}, e.message), 'error');
									});
								}
							}),
							E('input', {
								'type': 'button',
								'class': 'btn cbi-button cbi-button-reset',
								'style': 'margin-left: 10px;',
								'value': _('Clear Lock Immediately'),
								'click': function() {
									if (!self.selectedPort) return;
									ui.showModal(_('Clearing Cell Lock'), [
										E('p', { 'class': 'spinning' }, _('Sending unlocking commands...'))
									]);
									callSetCellLock(self.selectedPort, 'none').then(function(res) {
										ui.hideModal();
										const modeSelect = document.getElementById('modem_cell_lock_mode');
										if (modeSelect) modeSelect.value = 'none';
										const inputsWrap = document.getElementById('modem_cell_lock_inputs');
										if (inputsWrap) inputsWrap.style.display = 'none';
										ui.addNotification(null, E('p', {}, _('Cell lock cleared successfully.')), 'info');
									}).catch(function(e) {
										ui.hideModal();
										ui.addNotification(null, E('p', {}, e.message), 'error');
									});
								}
							})
						])
					])
				])
			])
		]);
		container.appendChild(cellLockSection);

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
		const activeApn = (self.apnData && self.apnData.apn) ? self.apnData.apn : '';
		const activePdp = (self.apnData && self.apnData.pdp_type) ? self.apnData.pdp_type : 'IPV4V6';

		const apnSection = E('fieldset', { 'class': 'cbi-section' }, [
			E('legend', {}, _('Access Point Name (APN) Settings')),
			E('div', { 'class': 'cbi-section-node' }, [
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('APN Name')),
					E('div', { 'class': 'cbi-value-field' }, [
						E('input', {
							'type': 'text',
							'id': 'modem_apn',
							'class': 'cbi-input-text',
							'placeholder': _('e.g. ctnet, cmiot, uninet'),
							'value': activeApn
						}),
						E('div', { 'class': 'cbi-value-description' }, _('Cellular carrier APN profile name (e.g. cmiot, cbnet, uninet).'))
					])
				]),
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('PDP Protocol Type')),
					E('div', { 'class': 'cbi-value-field' }, [
						E('select', { 'id': 'modem_pdp', 'class': 'cbi-input-select' }, [
							E('option', { 'value': 'IPV4V6', 'selected': (activePdp === 'IPV4V6' ? 'selected' : null) }, _('Dual Stack IPv4 and IPv6')),
							E('option', { 'value': 'IP', 'selected': (activePdp === 'IP' ? 'selected' : null) }, _('IPv4 Only')),
							E('option', { 'value': 'IPV6', 'selected': (activePdp === 'IPV6' ? 'selected' : null) }, _('IPv6 Only'))
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
