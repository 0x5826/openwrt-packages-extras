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
		return L.resolveDefault(callGetDevices(), []);
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
			return Promise.resolve();
		}

		ui.showModal(_('Executing Action'), [
			E('p', { 'class': 'spinning' }, _('Sending action to cellular module, please wait...'))
		]);

		return callDeviceAction(self.selectedPort, action).then(function(res) {
			ui.hideModal();
			if (res && res.success) {
				if (action === 'reboot') {
					ui.addNotification(null, E('p', {}, _('Modem reboot signal sent successfully. The module is rebooting, cellular network will reinitialize in 15-30 seconds.')), 'info');
					window.setTimeout(function() {
						self.forceRefresh();
					}, 20000);
				} else {
					ui.addNotification(null, E('p', {}, _('Action executed successfully.')), 'info');
					self.forceRefresh();
				}
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
		return callGetDevices().then(function(devRes) {
			const devs = Array.isArray(devRes) ? devRes : ((devRes && Array.isArray(devRes.devices)) ? devRes.devices : []);
			if (devs.length > 0) {
				self.selectedPort = devs[0].primary_port;
				self.selectedNet = devs[0].primary_net;
			}
			if (!self.selectedPort) return;
			return callRefreshStatus(self.selectedPort, self.selectedNet).then(function(res) {
				if (res && res.port && res.port !== self.selectedPort) {
					self.selectedPort = res.port;
				}
				self.applyStatusDOM(res);
			});
		}).catch(function(err) {
			if (!self.selectedPort) return;
			return callRefreshStatus(self.selectedPort, self.selectedNet).then(function(res) {
				self.applyStatusDOM(res);
			});
		});
	},

	updateStatus: function() {
		const self = this;
		return callGetStatus(self.selectedPort, self.selectedNet).then(function(res) {
			if (res && res.port && res.port !== self.selectedPort) {
				self.selectedPort = res.port;
			}
			self.applyStatusDOM(res);
		}).catch(function(e) {});
	},

	formatBytes: function(bytes) {
		if (bytes === null || bytes === undefined || isNaN(bytes) || bytes < 0) return '0 B';
		if (bytes === 0) return '0 B';
		const units = ['B', 'KB', 'MB', 'GB', 'TB'];
		const k = 1024;
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		const val = (bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 2);
		return val + ' ' + units[i];
	},

	formatSpeed: function(bytesPerSec) {
		if (bytesPerSec === null || bytesPerSec === undefined || isNaN(bytesPerSec) || bytesPerSec < 0) return '0 B/s';
		return this.formatBytes(bytesPerSec) + '/s';
	},

	formatUptime: function(sec) {
		if (!sec || sec <= 0) return '-';
		const d = Math.floor(sec / 86400);
		const h = Math.floor((sec % 86400) / 3600);
		const m = Math.floor((sec % 3600) / 60);
		const s = Math.floor(sec % 60);
		let str = (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
		if (d > 0) return d + ' ' + _('days') + ' ' + str;
		return str;
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

		const tFw = document.getElementById('modem_firmware_val');
		if (tFw && status.firmware) dom.content(tFw, status.firmware);

		const tImei = document.getElementById('modem_imei_val');
		if (tImei && status.imei) dom.content(tImei, status.imei);

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
			let rsrpVal = (cell.rsrp !== null && cell.rsrp !== undefined && cell.rsrp < 0 && cell.rsrp >= -145) ? cell.rsrp : null;
			let rsrpPercent = rsrpVal ? Math.max(0, Math.min(100, Math.floor((rsrpVal + 140) * (100 / 96)))) : 0;
			let qualityText = '';
			if (rsrpVal !== null) {
				if (rsrpVal >= -85) qualityText = _('Excellent');
				else if (rsrpVal >= -100) qualityText = _('Good');
				else qualityText = _('Weak');
			}
			dom.content(sigRsrp, [
				self.renderProgressBar(rsrpPercent, rsrpVal ? (rsrpVal + ' dBm') : _('Calculating'), '#4895ef'),
				E('span', {}, qualityText)
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
			let isConn = !!net.connected;
			let netText = isConn ? _('Connected') : _('Disconnected');
			let netColor = isConn ? '#4caf50' : '#f44336';
			let uptimeStr = (isConn && net.uptime) ? self.formatUptime(net.uptime) : '';
			dom.content(netStatus, [
				E('span', {
					'style': 'background-color: ' + netColor + '; color: #fff; padding: 2px 8px; border-radius: 3px; font-weight: bold; font-size: 11px; margin-right: 8px;'
				}, netText),
				uptimeStr ? E('span', { 'style': 'color: #555; font-size: 12px;' }, _('Uptime: ') + uptimeStr) : ''
			]);
		}

		const netPhys = document.getElementById('modem_net_phys');
		if (netPhys) {
			let devName = net.device || self.selectedNet || _('Not Registered');
			dom.content(netPhys, E('span', { 'style': 'font-weight: bold; font-family: monospace; color: #0366d6;' }, devName));
		}

		const netIface = document.getElementById('modem_net_iface');
		if (netIface) {
			let ifaceName = net.interface || _('Unmanaged (Config in OpenWrt Interfaces)');
			let protoStr = net.proto ? ' [' + net.proto.toUpperCase() + ']' : '';
			dom.content(netIface, ifaceName + protoStr);
		}

		const netIp4 = document.getElementById('modem_net_ip4');
		if (netIp4) dom.content(netIp4, (net.ip4 && net.ip4.length > 0) ? net.ip4.join(', ') : '-');

		const netIp6 = document.getElementById('modem_net_ip6');
		if (netIp6) dom.content(netIp6, (net.ip6 && net.ip6.length > 0) ? net.ip6.join(', ') : '-');

		const netTraffic = document.getElementById('modem_net_traffic');
		if (netTraffic) {
			const rxFormatted = self.formatBytes(net.rx_bytes || 0);
			const txFormatted = self.formatBytes(net.tx_bytes || 0);
			const totalFormatted = self.formatBytes((net.rx_bytes || 0) + (net.tx_bytes || 0));
			const rxPackets = net.rx_packets || 0;
			const txPackets = net.tx_packets || 0;

			dom.content(netTraffic, [
				E('div', { 'style': 'display: flex; gap: 24px; align-items: center; white-space: nowrap;' }, [
					E('span', {}, [
						E('strong', {}, _('Download') + ': '),
						rxFormatted + (rxPackets > 0 ? ' / ' + rxPackets + ' ' + _('Packets') : '')
					]),
					E('span', {}, [
						E('strong', {}, _('Upload') + ': '),
						txFormatted + (txPackets > 0 ? ' / ' + txPackets + ' ' + _('Packets') : '')
					]),
					E('span', { 'style': 'color: #333;' }, [
						E('strong', {}, _('Total Traffic') + ': '),
						totalFormatted
					])
				])
			]);
		}
	},

	render: function(devicesData) {
		const self = this;
		self.devicesList = Array.isArray(devicesData) ? devicesData : ((devicesData && Array.isArray(devicesData.devices)) ? devicesData.devices : []);

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
					E('td', { 'class': 'td left' }, _('Firmware Version')),
					E('td', { 'class': 'td left', 'id': 'modem_firmware_val' }, '-'),
					E('td', { 'class': 'td left' }, _('IMEI')),
					E('td', { 'class': 'td left', 'id': 'modem_imei_val' }, '-')
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
					E('td', { 'class': 'td left', 'width': '16%' }, _('Physical & Logical Interface')),
					E('td', { 'class': 'td left', 'width': '34%' }, [
						E('div', {}, [
							E('span', { 'style': 'color: #333; font-weight: bold; margin-right: 4px;' }, _('Physical:')),
							E('span', { 'id': 'modem_net_phys' }, '-'),
							E('span', { 'style': 'color: #888; margin: 0 8px;' }, '|'),
							E('span', { 'style': 'color: #333; font-weight: bold; margin-right: 4px;' }, _('Logical:')),
							E('span', { 'id': 'modem_net_iface' }, '-')
						])
					])
				]),
				E('tr', { 'class': 'tr' }, [
					E('td', { 'class': 'td left' }, _('Modem IPv4 Address')),
					E('td', { 'class': 'td left', 'id': 'modem_net_ip4' }, '-'),
					E('td', { 'class': 'td left' }, _('Modem IPv6 Address')),
					E('td', { 'class': 'td left', 'id': 'modem_net_ip6' }, '-')
				]),
				E('tr', { 'class': 'tr' }, [
					E('td', { 'class': 'td left' }, _('Traffic Statistics')),
					E('td', { 'class': 'td left', 'colspan': '3', 'id': 'modem_net_traffic' }, '-')
				])
			]),
			E('div', { 'style': 'margin-top: 15px; display: flex; gap: 10px;' }, [
				E('input', {
					'type': 'button',
					'class': 'btn cbi-button cbi-button-reload',
					'value': _('Refresh'),
					'click': ui.createHandlerFn(self, 'forceRefresh')
				}),
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
