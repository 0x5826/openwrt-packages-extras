'use strict';
'require view';
'require rpc';
'require poll';
'require ui';
'require dom';

const callGetDevices = rpc.declare({
	object: 'luci.modem',
	method: 'get_devices',
	expect: { devices: [] }
});

const callGetStatus = rpc.declare({
	object: 'luci.modem',
	method: 'get_status',
	params: [ 'port', 'primary_net' ]
});

const callRefreshStatus = rpc.declare({
	object: 'luci.modem',
	method: 'refresh_status',
	params: [ 'port', 'primary_net' ]
});

const callDeviceAction = rpc.declare({
	object: 'luci.modem',
	method: 'device_action',
	params: [ 'port', 'action' ]
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

	renderProgressBar: function(percent, label, color) {
		const bg = color || '#2bc1a4';
		return E('div', { 'style': 'width: 220px; background: #eee; border-radius: 3px; height: 16px; position: relative; display: inline-block; vertical-align: middle; margin-right: 10px; overflow: hidden;' }, [
			E('div', {
				'style': 'height: 100%; width: ' + Math.min(100, Math.max(0, percent)) + '%; background: ' + bg + '; transition: width 0.3s;'
			}),
			E('span', {
				'style': 'position: absolute; width: 100%; top: 0; left: 0; text-align: center; font-size: 11px; line-height: 16px; color: #333; font-weight: bold;'
			}, label)
		]);
	},

	handleAction: function(action) {
		const self = this;
		if (!self.selectedPort) {
			ui.addNotification(null, E('p', {}, _('Please select a valid modem port first.')), 'error');
			return;
		}

		ui.showModal(_('Executing Action'), [
			E('p', { 'class': 'spinning' }, _('Sending action to cellular module, please wait...'))
		]);

		callDeviceAction(self.selectedPort, action).then(function(res) {
			ui.hideModal();
			if (res && res.success) {
				ui.addNotification(null, E('p', {}, _('Action executed successfully.')), 'info');
				self.forceRefresh();
			} else {
				ui.addNotification(null, E('p', {}, _('Action failed: ') + (res ? res.output : _('Unknown error'))), 'error');
			}
		}).catch(function(err) {
			ui.hideModal();
			ui.addNotification(null, E('p', {}, err.message), 'error');
		});
	},

	forceRefresh: function() {
		const self = this;
		if (!self.selectedPort) return;
		return callRefreshStatus(self.selectedPort, self.selectedNet).then(function(res) {
			self.applyStatusDOM(res);
		});
	},

	updateStatus: function() {
		const self = this;
		if (!self.selectedPort)
			return;

		return callGetStatus(self.selectedPort, self.selectedNet).then(function(res) {
			self.applyStatusDOM(res);
		});
	},

	applyStatusDOM: function(status) {
		const self = this;
		if (!status) return;

		const csq = status.csq || {};
		const cell = status.cell || {};
		const net = status.network || {};

		const tTemp = document.getElementById('modem_temp_val');
		if (tTemp) dom.content(tTemp, (status.temperature !== null && status.temperature !== undefined) ? (status.temperature + ' °C') : _('Not Supported'));

		const tOp = document.getElementById('modem_operator_val');
		if (tOp) dom.content(tOp, status.operator || _('Searching'));

		const tRat = document.getElementById('modem_rat_val');
		if (tRat) dom.content(tRat, status.act || _('Unknown'));

		const tBand = document.getElementById('modem_band_val');
		if (tBand) dom.content(tBand, cell.band || _('None'));

		const tSim = document.getElementById('modem_sim_val');
		if (tSim) {
			let sText = _('Normal');
			let sColor = 'green';
			if (status.sim_status === 'PIN_LOCKED') { sText = _('PIN Locked'); sColor = 'orange'; }
			else if (status.sim_status === 'PUK_LOCKED') { sText = _('PUK Locked'); sColor = 'red'; }
			else if (status.sim_status === 'NOT_INSERTED') { sText = _('Not Detected'); sColor = 'red'; }
			dom.content(tSim, E('span', { 'style': 'color: ' + sColor + '; font-weight: bold;' }, sText));
		}

		const sigCsq = document.getElementById('modem_sig_csq');
		if (sigCsq) {
			dom.content(sigCsq, [
				self.renderProgressBar(csq.percent || 0, (csq.csq || 0) + ' / 31 (' + (csq.percent || 0) + '%)', '#2bc1a4'),
				E('span', {}, (csq.rssi_dbm ? csq.rssi_dbm + ' dBm' : ''))
			]);
		}

		const sigRsrp = document.getElementById('modem_sig_rsrp');
		if (sigRsrp) {
			let rsrpVal = (cell.rsrp !== null && cell.rsrp !== undefined) ? cell.rsrp : null;
			let rsrpPercent = rsrpVal ? Math.max(0, Math.min(100, Math.floor((rsrpVal + 140) * (100 / 96)))) : 0;
			dom.content(sigRsrp, [
				self.renderProgressBar(rsrpPercent, rsrpVal ? (rsrpVal + ' dBm') : _('Calculating'), '#4895ef'),
				E('span', {}, rsrpVal ? (rsrpVal > -85 ? _('Excellent') : (rsrpVal > -105 ? _('Good') : _('Weak'))) : '')
			]);
		}

		const sigSinr = document.getElementById('modem_sig_sinr');
		if (sigSinr) {
			let sinrVal = (cell.sinr !== null && cell.sinr !== undefined) ? cell.sinr : null;
			let sinrPercent = sinrVal ? Math.max(0, Math.min(100, Math.floor((sinrVal + 10) * 2.5))) : 0;
			dom.content(sigSinr, [
				self.renderProgressBar(sinrPercent, sinrVal ? (sinrVal + ' dB') : _('Calculating'), '#4cc9f0')
			]);
		}

		const cellPci = document.getElementById('modem_cell_pci');
		if (cellPci) dom.content(cellPci, cell.pci || '-');
		const cellId = document.getElementById('modem_cell_id');
		if (cellId) dom.content(cellId, cell.cell_id || '-');
		const cellTac = document.getElementById('modem_cell_tac');
		if (cellTac) dom.content(cellTac, cell.tac || '-');
		const cellArfcn = document.getElementById('modem_cell_arfcn');
		if (cellArfcn) dom.content(cellArfcn, cell.earfcn || '-');

		const netStatus = document.getElementById('modem_net_status');
		if (netStatus) {
			let netText = net.connected ? _('Connected') : _('Disconnected');
			let netColor = net.connected ? 'green' : 'red';
			dom.content(netStatus, E('span', { 'style': 'color:' + netColor + '; font-weight: bold;' }, netText));
		}

		const netIp4 = document.getElementById('modem_net_ip4');
		if (netIp4) dom.content(netIp4, (net.ip4 && net.ip4.length > 0) ? net.ip4.join(', ') : '-');

		const netTraffic = document.getElementById('modem_net_traffic');
		if (netTraffic) {
			let rxMb = (net.rx_bytes ? (net.rx_bytes / (1024 * 1024)).toFixed(2) : '0') + ' MB';
			let txMb = (net.tx_bytes ? (net.tx_bytes / (1024 * 1024)).toFixed(2) : '0') + ' MB';
			dom.content(netTraffic, _('Downlink: ') + rxMb + ' / ' + _('Uplink: ') + txMb);
		}
	},

	render: function(devicesData) {
		const self = this;
		self.devicesList = (devicesData && devicesData.devices) ? devicesData.devices : [];

		const container = E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, _('Cellular Modem Manager') + ' - ' + _('Overview')),
			E('div', { 'class': 'cbi-map-descr' }, _('Real-time overview of cellular modem hardware, network registration, signal metrics, and data connection.'))
		]);

		if (self.devicesList.length === 0) {
			container.appendChild(E('div', { 'class': 'alert-message warning', 'style': 'margin-top: 20px; padding: 20px; border-left: 5px solid #ff9800; background: #fff8e1;' }, [
				E('h4', { 'style': 'margin: 0 0 10px 0; color: #d32f2f; font-size: 16px;' }, _('No Active Cellular Modem Detected')),
				E('p', { 'style': 'margin: 0 0 15px 0; line-height: 1.6; color: #555;' }, _('No active 4G or 5G cellular modem detected on the USB bus. Please verify hardware connection, power supply, or driver status.')),
				E('div', {}, [
					E('input', {
						'type': 'button',
						'class': 'btn cbi-button cbi-button-action',
						'value': _('Rescan Devices'),
						'click': function() {
							location.reload();
						}
					})
				])
			]));
			return container;
		}

		self.selectedPort = self.devicesList[0].primary_port;
		self.selectedNet = self.devicesList[0].primary_net;

		const deviceOptions = [];
		self.devicesList.forEach(function(dev, idx) {
			let label = dev.vendor + ' ' + dev.model + ' [' + (dev.primary_port || _('No Port')) + ' / ' + (dev.primary_net || _('No Net')) + ']';
			deviceOptions.push(E('option', { value: dev.primary_port, 'data-net': dev.primary_net, selected: idx === 0 }, label));
		});

		const selectorNode = E('fieldset', { 'class': 'cbi-section' }, [
			E('legend', {}, _('Active Modem Selection')),
			E('div', { 'class': 'cbi-section-node' }, [
				E('div', { 'style': 'display: flex; align-items: center; gap: 15px; padding: 10px 0;' }, [
					E('label', { 'style': 'font-weight: bold;' }, _('Current Device:')),
					E('select', {
						'class': 'cbi-input-select',
						'style': 'min-width: 320px;',
						'change': function(ev) {
							self.selectedPort = ev.target.value;
							let opt = ev.target.options[ev.target.selectedIndex];
							self.selectedNet = opt.getAttribute('data-net');
							self.forceRefresh();
						}
					}, deviceOptions),
					E('input', {
						'type': 'button',
						'class': 'btn cbi-button cbi-button-reload',
						'value': _('Refresh'),
						'click': ui.createHandlerFn(self, 'forceRefresh')
					})
				])
			])
		]);
		container.appendChild(selectorNode);

		const firstDev = self.devicesList[0] || {};
		const hwSection = E('fieldset', { 'class': 'cbi-section' }, [
			E('legend', {}, _('Hardware Information')),
			E('table', { 'class': 'table cbi-section-table' }, [
				E('tr', { 'class': 'tr' }, [
					E('td', { 'class': 'td left', 'width': '16%' }, _('Manufacturer')),
					E('td', { 'class': 'td left', 'width': '34%' }, firstDev.vendor || '-'),
					E('td', { 'class': 'td left', 'width': '16%' }, _('Model')),
					E('td', { 'class': 'td left', 'width': '34%' }, firstDev.model || '-')
				]),
				E('tr', { 'class': 'tr' }, [
					E('td', { 'class': 'td left' }, _('USB Identifiers')),
					E('td', { 'class': 'td left' }, (firstDev.vid && firstDev.pid) ? (firstDev.vid + ':' + firstDev.pid) : '-'),
					E('td', { 'class': 'td left' }, _('Core Temperature')),
					E('td', { 'class': 'td left', 'id': 'modem_temp_val' }, '-')
				]),
				E('tr', { 'class': 'tr' }, [
					E('td', { 'class': 'td left' }, _('Driver Binding')),
					E('td', { 'class': 'td left' }, firstDev.driver || _('Option Driver')),
					E('td', { 'class': 'td left' }, _('SIM Status')),
					E('td', { 'class': 'td left', 'id': 'modem_sim_val' }, '-')
				])
			])
		]);
		container.appendChild(hwSection);

		const sigSection = E('fieldset', { 'class': 'cbi-section' }, [
			E('legend', {}, _('Cellular Network and Signal Metrics')),
			E('table', { 'class': 'table cbi-section-table' }, [
				E('tr', { 'class': 'tr' }, [
					E('td', { 'class': 'td left', 'width': '16%' }, _('Operator')),
					E('td', { 'class': 'td left', 'width': '34%', 'id': 'modem_operator_val' }, '-'),
					E('td', { 'class': 'td left', 'width': '16%' }, _('Access Technology')),
					E('td', { 'class': 'td left', 'width': '34%', 'id': 'modem_rat_val' }, '-')
				]),
				E('tr', { 'class': 'tr' }, [
					E('td', { 'class': 'td left' }, _('Active Band')),
					E('td', { 'class': 'td left', 'id': 'modem_band_val' }, '-'),
					E('td', { 'class': 'td left' }, _('Physical Cell ID')),
					E('td', { 'class': 'td left', 'id': 'modem_cell_pci' }, '-')
				]),
				E('tr', { 'class': 'tr' }, [
					E('td', { 'class': 'td left' }, _('Cell ID')),
					E('td', { 'class': 'td left', 'id': 'modem_cell_id' }, '-'),
					E('td', { 'class': 'td left' }, _('Tracking Area Code')),
					E('td', { 'class': 'td left', 'id': 'modem_cell_tac' }, '-')
				]),
				E('tr', { 'class': 'tr' }, [
					E('td', { 'class': 'td left' }, _('Carrier Channel')),
					E('td', { 'class': 'td left', 'id': 'modem_cell_arfcn' }, '-'),
					E('td', { 'class': 'td left' }, _('Signal Strength CSQ')),
					E('td', { 'class': 'td left', 'id': 'modem_sig_csq' }, '-')
				]),
				E('tr', { 'class': 'tr' }, [
					E('td', { 'class': 'td left' }, _('Signal Power RSRP')),
					E('td', { 'class': 'td left', 'id': 'modem_sig_rsrp' }, '-'),
					E('td', { 'class': 'td left' }, _('Signal Quality SINR')),
					E('td', { 'class': 'td left', 'id': 'modem_sig_sinr' }, '-')
				])
			])
		]);
		container.appendChild(sigSection);

		const connSection = E('fieldset', { 'class': 'cbi-section' }, [
			E('legend', {}, _('Network Interface Connection')),
			E('table', { 'class': 'table cbi-section-table' }, [
				E('tr', { 'class': 'tr' }, [
					E('td', { 'class': 'td left', 'width': '16%' }, _('Connection State')),
					E('td', { 'class': 'td left', 'width': '34%', 'id': 'modem_net_status' }, '-'),
					E('td', { 'class': 'td left', 'width': '16%' }, _('Assigned IPv4')),
					E('td', { 'class': 'td left', 'width': '34%', 'id': 'modem_net_ip4' }, '-')
				]),
				E('tr', { 'class': 'tr' }, [
					E('td', { 'class': 'td left' }, _('Traffic Statistics')),
					E('td', { 'class': 'td left', 'colspan': '3', 'id': 'modem_net_traffic' }, '-')
				])
			]),
			E('div', { 'style': 'margin-top: 15px; display: flex; gap: 10px;' }, [
				E('input', {
					'type': 'button',
					'class': 'btn cbi-button cbi-button-reset',
					'value': _('Restart Modem'),
					'click': ui.createHandlerFn(self, 'handleAction', 'reboot')
				}),
				E('input', {
					'type': 'button',
					'class': 'btn cbi-button cbi-button-action',
					'value': _('Toggle Airplane Mode'),
					'click': ui.createHandlerFn(self, 'handleAction', 'airplane_on')
				}),
				E('input', {
					'type': 'button',
					'class': 'btn cbi-button cbi-button-reload',
					'value': _('Reset RF Radio'),
					'click': ui.createHandlerFn(self, 'handleAction', 'reset_radio')
				})
			])
		]);
		container.appendChild(connSection);

		poll.add(function() {
			return self.updateStatus();
		}, 5);

		setTimeout(function() {
			self.updateStatus();
		}, 200);

		return container;
	}
});
