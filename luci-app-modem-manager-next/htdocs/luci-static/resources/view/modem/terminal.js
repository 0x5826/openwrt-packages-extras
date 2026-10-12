'use strict';
'require view';
'require rpc';
'require ui';

const callGetDevices = rpc.declare({
	object: 'luci.modem',
	method: 'get_devices',
	expect: { devices: [] }
});

const callSendAt = rpc.declare({
	object: 'luci.modem',
	method: 'send_at',
	params: [ 'port', 'cmd', 'timeout' ]
});

return view.extend({
	handleSaveApply: null,
	handleSave: null,
	handleReset: null,

	selectedPort: null,
	devicesList: [],
	cmdHistory: [],
	historyIndex: -1,

	load: function() {
		return callGetDevices();
	},

	appendLog: function(text, type) {
		const out = document.getElementById('terminal_output');
		if (!out) return;

		const d = new Date();
		const timeStr = d.toTimeString().split(' ')[0] + '.' + String(d.getMilliseconds()).padStart(3, '0');

		let color = '#a9b7c6';
		let prefix = '';
		if (type === 'cmd') {
			color = '#9876aa';
			prefix = timeStr + ' >>> ';
		} else if (type === 'error') {
			color = '#ff6b68';
			prefix = timeStr + ' !!! ';
		} else {
			color = '#6a8759';
			prefix = timeStr + ' <<< ';
		}

		const line = document.createElement('div');
		line.style.color = color;
		line.style.wordBreak = 'break-all';
		line.style.fontFamily = 'monospace';
		line.style.lineHeight = '1.4em';
		line.textContent = prefix + text;

		out.appendChild(line);
		out.scrollTop = out.scrollHeight;
	},

	executeCommand: function(cmdStr) {
		const self = this;
		const inputEl = document.getElementById('terminal_input');
		const cmd = cmdStr || (inputEl ? inputEl.value.trim() : '');

		if (!cmd) return;

		if (!self.selectedPort) {
			ui.addNotification(null, E('p', {}, _('Please select a communication port first.')), 'error');
			return;
		}

		self.appendLog(cmd, 'cmd');

		// Add to history if unique from last
		if (self.cmdHistory.length === 0 || self.cmdHistory[self.cmdHistory.length - 1] !== cmd) {
			self.cmdHistory.push(cmd);
		}
		self.historyIndex = self.cmdHistory.length;

		if (inputEl) inputEl.value = '';

		const btn = document.getElementById('terminal_send_btn');
		if (btn) btn.disabled = true;

		callSendAt(self.selectedPort, cmd, 5).then(function(res) {
			if (btn) btn.disabled = false;
			if (res && res.output) {
				self.appendLog(res.output, res.success ? 'resp' : 'error');
			} else {
				self.appendLog(_('No response from modem.'), 'error');
			}
		}).catch(function(err) {
			if (btn) btn.disabled = false;
			self.appendLog(_('Execution failed: ') + err.message, 'error');
		});
	},

	renderPresetButton: function(cmd, label) {
		const self = this;
		return E('input', {
			'type': 'button',
			'class': 'btn cbi-button cbi-button-action',
			'style': 'margin-right: 6px; margin-bottom: 6px; font-family: monospace; font-size: 12px;',
			'value': label || cmd,
			'click': function() {
				const inputEl = document.getElementById('terminal_input');
				if (inputEl) {
					inputEl.value = cmd;
					inputEl.focus();
				}
				self.executeCommand(cmd);
			}
		});
	},

	render: function(devicesData) {
		const self = this;
		self.devicesList = (devicesData && devicesData.devices) ? devicesData.devices : [];

		const portOptions = [];
		self.devicesList.forEach(function(dev) {
			if (dev.ports && dev.ports.length > 0) {
				dev.ports.forEach(function(p) {
					let label = p + ' (' + dev.vendor + ' ' + dev.model + ')';
					portOptions.push(E('option', { value: p, selected: p === dev.primary_port }, label));
				});
			}
		});

		if (portOptions.length > 0) {
			self.selectedPort = self.devicesList[0].primary_port;
		}

		const container = E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, _('Cellular Modem Manager') + ' - ' + _('AT Command Terminal')),
			E('div', { 'class': 'cbi-map-descr' }, _('Direct interactive terminal for sending AT commands to cellular modules with concurrency locking, history navigation, and quick presets.'))
		]);

		// Port Selector Bar
		const selectorNode = E('fieldset', { 'class': 'cbi-section' }, [
			E('legend', {}, _('Serial Port Selection')),
			E('div', { 'class': 'cbi-section-node' }, [
				E('div', { 'style': 'display: flex; align-items: center; gap: 15px; padding: 10px 0;' }, [
					E('label', { 'style': 'font-weight: bold;' }, _('Communication Port:')),
					portOptions.length > 0 ? E('select', {
						'class': 'cbi-input-select',
						'style': 'min-width: 300px;',
						'change': function(ev) {
							self.selectedPort = ev.target.value;
						}
					}, portOptions) : E('span', { 'style': 'color: red;' }, _('No serial communication ports detected.')),
					E('label', { 'style': 'margin-left: 20px;' }, _('Baudrate: 115200 (Auto Locked)'))
				])
			])
		]);
		container.appendChild(selectorNode);

		// Quick Presets Section
		const presetsSection = E('fieldset', { 'class': 'cbi-section' }, [
			E('legend', {}, _('Quick AT Command Presets')),
			E('div', { 'class': 'cbi-section-node', 'style': 'padding: 10px;' }, [
				E('div', { 'style': 'margin-bottom: 8px;' }, [
					E('b', { 'style': 'display: inline-block; width: 110px;' }, _('General Info:')),
					self.renderPresetButton('ATI'),
					self.renderPresetButton('AT+CPIN?'),
					self.renderPresetButton('AT+CSQ'),
					self.renderPresetButton('AT+CCID'),
					self.renderPresetButton('AT+CFUN?')
				]),
				E('div', { 'style': 'margin-bottom: 8px;' }, [
					E('b', { 'style': 'display: inline-block; width: 110px;' }, _('Network State:')),
					self.renderPresetButton('AT+COPS?'),
					self.renderPresetButton('AT+CREG?'),
					self.renderPresetButton('AT+CEREG?'),
					self.renderPresetButton('AT+C5GREG?')
				]),
				E('div', { 'style': 'margin-bottom: 8px;' }, [
					E('b', { 'style': 'display: inline-block; width: 110px;' }, _('Quectel Extra:')),
					self.renderPresetButton('AT+QENG="servingcell"', 'Serving Cell'),
					self.renderPresetButton('AT+QCAINFO', 'Carrier Aggregation'),
					self.renderPresetButton('AT+QTEMP', 'Core Temperature'),
					self.renderPresetButton('AT+QNWINFO', 'Network Tech Info')
				]),
				E('div', {}, [
					E('b', { 'style': 'display: inline-block; width: 110px;' }, _('Fibocom Extra:')),
					self.renderPresetButton('AT+GTCCINFO?', 'Cell Info'),
					self.renderPresetButton('AT+GTCAINFO?', 'CA Info'),
					self.renderPresetButton('AT+GTRNDIS?', 'RNDIS State')
				])
			])
		]);
		container.appendChild(presetsSection);

		// Terminal Output Box
		const outputSection = E('fieldset', { 'class': 'cbi-section' }, [
			E('legend', {}, [
				_('Interactive Console Output'),
				E('span', { 'style': 'float: right;' }, [
					E('input', {
						'type': 'button',
						'class': 'btn cbi-button',
						'value': _('Clear Output'),
						'style': 'margin-right: 8px; font-size: 11px;',
						'click': function() {
							const out = document.getElementById('terminal_output');
							if (out) out.innerHTML = '';
						}
					}),
					E('input', {
						'type': 'button',
						'class': 'btn cbi-button',
						'value': _('Copy All'),
						'style': 'font-size: 11px;',
						'click': function() {
							const out = document.getElementById('terminal_output');
							if (out && navigator.clipboard) {
								navigator.clipboard.writeText(out.innerText);
								ui.addNotification(null, E('p', {}, _('Terminal output copied to clipboard.')), 'info');
							}
						}
					})
				])
			]),
			E('div', {
				'id': 'terminal_output',
				'style': 'background: #2b2b2b; color: #a9b7c6; font-family: monospace; font-size: 13px; min-height: 280px; max-height: 480px; overflow-y: auto; padding: 12px; border-radius: 4px; box-sizing: border-box;'
			}, [
				E('div', { 'style': 'color: #808080;' }, _('System ready. Enter an AT command and press Enter or Send to execute.'))
			])
		]);
		container.appendChild(outputSection);

		// Command Input Bar
		const inputSection = E('div', { 'style': 'margin-top: 15px; display: flex; gap: 10px; align-items: center;' }, [
			E('input', {
				'type': 'text',
				'id': 'terminal_input',
				'class': 'cbi-input-text',
				'style': 'flex: 1; font-family: monospace; font-size: 14px; padding: 6px 10px;',
				'placeholder': _('Enter AT command (e.g. AT+CSQ)...'),
				'keydown': function(ev) {
					if (ev.key === 'Enter') {
						ev.preventDefault();
						self.executeCommand();
					} else if (ev.key === 'ArrowUp') {
						if (self.cmdHistory.length > 0 && self.historyIndex > 0) {
							self.historyIndex--;
							ev.target.value = self.cmdHistory[self.historyIndex];
						}
					} else if (ev.key === 'ArrowDown') {
						if (self.historyIndex < self.cmdHistory.length - 1) {
							self.historyIndex++;
							ev.target.value = self.cmdHistory[self.historyIndex];
						} else {
							self.historyIndex = self.cmdHistory.length;
							ev.target.value = '';
						}
					}
				}
			}),
			E('input', {
				'type': 'button',
				'id': 'terminal_send_btn',
				'class': 'btn cbi-button cbi-button-action',
				'value': _('Send Command'),
				'click': function() {
					self.executeCommand();
				}
			})
		]);
		container.appendChild(inputSection);

		return container;
	}
});
