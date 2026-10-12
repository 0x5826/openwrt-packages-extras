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

// Standard 3GPP and Vendor AT Command Knowledge Base
const AT_DICTIONARY = [
	{ cmd: 'ATI', desc: _('Query module manufacturer, model, and firmware version') },
	{ cmd: 'AT+CPIN?', desc: _('Query SIM card lock and ready status') },
	{ cmd: 'AT+CSQ', desc: _('Query received signal strength and bit error rate') },
	{ cmd: 'AT+CCID', desc: _('Query SIM card ICCID number') },
	{ cmd: 'AT+CFUN?', desc: _('Query current RF radio state (0:Min, 1:Full, 4:Airplane)') },
	{ cmd: 'AT+CFUN=1', desc: _('Enable full RF function (Turn off airplane mode)') },
	{ cmd: 'AT+CFUN=4', desc: _('Turn on airplane mode') },
	{ cmd: 'AT+CFUN=1,1', desc: _('Reboot module processor and RF reset') },
	{ cmd: 'AT+COPS?', desc: _('Query registered cellular operator and RAT') },
	{ cmd: 'AT+COPS=?', desc: _('Scan all available cellular networks in air (Long timeout)') },
	{ cmd: 'AT+CREG?', desc: _('Query 2G/3G network registration status') },
	{ cmd: 'AT+CEREG?', desc: _('Query 4G LTE network registration status') },
	{ cmd: 'AT+C5GREG?', desc: _('Query 5G NR network registration status') },
	{ cmd: 'AT+CGDCONT?', desc: _('Query configured PDP contexts and APN profiles') },
	{ cmd: 'AT+CGDCONT=1,"IPV4V6","cmiot"', desc: _('Configure PDP context 1 with APN') },
	{ cmd: 'AT+QENG="servingcell"', desc: _('Quectel: Query current serving cell details (5G SA/LTE, PCI, TAC, Band, RSRP, SINR)') },
	{ cmd: 'AT+QCAINFO', desc: _('Quectel: Query carrier aggregation (CA) state and secondary cells') },
	{ cmd: 'AT+QTEMP', desc: _('Quectel: Query CPU and RF chip temperatures') },
	{ cmd: 'AT+QNWINFO', desc: _('Quectel: Query current network band and channel info') },
	{ cmd: 'AT+GTCCINFO?', desc: _('Fibocom: Query current cell info and radio metrics') },
	{ cmd: 'AT+GTCAINFO?', desc: _('Fibocom: Query carrier aggregation info') },
	{ cmd: 'AT+GTRNDIS?', desc: _('Fibocom: Query RNDIS network connection status') }
];

// 3GPP TS 27.007 CME / CMS Error Descriptions
const CME_ERRORS = {
	'0': _('Phone failure'),
	'1': _('No connection to phone'),
	'2': _('Phone-adaptor link reserved'),
	'3': _('Operation not allowed'),
	'4': _('Operation not supported'),
	'5': _('PH-SIM PIN required'),
	'10': _('SIM card not inserted or not detected'),
	'11': _('SIM PIN required (Please enter PIN to unlock)'),
	'12': _('SIM PUK required (Please enter PUK to unlock)'),
	'13': _('SIM card failure or communication defect'),
	'14': _('SIM card busy, please retry later'),
	'15': _('SIM wrong password'),
	'16': _('Incorrect PIN entered'),
	'17': _('PIN2 required'),
	'18': _('PUK2 required'),
	'20': _('Memory storage full'),
	'21': _('Invalid index or memory entry not found'),
	'22': _('Not found'),
	'24': _('Text string too long'),
	'25': _('Invalid characters in text string'),
	'26': _('Dial string too long'),
	'27': _('Invalid characters in dial string'),
	'30': _('No cellular network service available'),
	'31': _('Network timeout'),
	'32': _('Network not allowed emergency calls only'),
	'100': _('Unknown error or unsupported extended command')
};

// Chinese & Full-width punctuation replacement mapping
function sanitizeAtPunctuation(str) {
	if (!str) return '';
	let res = str;
	// Replace full-width quotes
	res = res.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
	// Replace full-width punctuation
	res = res.replace(/，/g, ',')
	         .replace(/？/g, '?')
	         .replace(/：/g, ':')
	         .replace(/；/g, ';')
	         .replace(/＝/g, '=')
	         .replace(/＋/g, '+')
	         .replace(/－/g, '-')
	         .replace(/（/g, '(')
	         .replace(/）/g, ')')
	         .replace(/\u3000/g, ' '); // full-width space

	// Ensure uppercase prefix for 'at'
	if (/^at([+=?&]|\s|$)/i.test(res)) {
		res = 'AT' + res.slice(2);
	}
	return res;
}

// Levenshtein distance for fuzzy suggestion
function levenshteinDistance(s1, s2) {
	const a = s1.toUpperCase();
	const b = s2.toUpperCase();
	const matrix = [];
	for (let i = 0; i <= b.length; i++) matrix[i] = [i];
	for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

	for (let i = 1; i <= b.length; i++) {
		for (let j = 1; j <= a.length; j++) {
			if (b.charAt(i - 1) === a.charAt(j - 1)) {
				matrix[i][j] = matrix[i - 1][j - 1];
			} else {
				matrix[i][j] = Math.min(
					matrix[i - 1][j - 1] + 1, // substitution
					matrix[i][j - 1] + 1,     // insertion
					matrix[i - 1][j] + 1      // deletion
				);
			}
		}
	}
	return matrix[b.length][a.length];
}

function findBestSuggestion(inputCmd) {
	if (!inputCmd || inputCmd.length < 3) return null;
	const clean = inputCmd.trim().toUpperCase();
	let bestMatch = null;
	let lowestDist = 999;

	for (let i = 0; i < AT_DICTIONARY.length; i++) {
		const target = AT_DICTIONARY[i].cmd.toUpperCase();
		const baseTarget = target.split('=')[0]; // base command prefix
		const baseClean = clean.split('=')[0];

		const dist = levenshteinDistance(baseClean, baseTarget);
		if (dist > 0 && dist <= 2 && dist < lowestDist) {
			lowestDist = dist;
			bestMatch = AT_DICTIONARY[i];
		}
	}
	return bestMatch;
}

return view.extend({
	handleSaveApply: null,
	handleSave: null,
	handleReset: null,

	selectedPort: null,
	devicesList: [],
	cmdHistory: [],
	historyIndex: -1,
	favorites: [],

	load: function() {
		return L.resolveDefault(callGetDevices(), []);
	},

	loadFavorites: function() {
		try {
			const saved = localStorage.getItem('modem_at_favorites');
			if (saved) this.favorites = JSON.parse(saved);
		} catch(e) {}
		if (!Array.isArray(this.favorites) || this.favorites.length === 0) {
			this.favorites = [
				{ cmd: 'ATI', label: _('Module Info') },
				{ cmd: 'AT+CSQ', label: _('Signal CSQ') },
				{ cmd: 'AT+CPIN?', label: _('SIM Status') },
				{ cmd: 'AT+COPS?', label: _('Operator') },
				{ cmd: 'AT+QENG="servingcell"', label: _('Serving Cell') }
			];
		}
	},

	saveFavorites: function() {
		try {
			localStorage.setItem('modem_at_favorites', JSON.stringify(this.favorites));
		} catch(e) {}
	},

	appendLog: function(text, type, durationMs) {
		const out = document.getElementById('terminal_output');
		if (!out) return;

		const d = new Date();
		const timeStr = d.toTimeString().split(' ')[0] + '.' + String(d.getMilliseconds()).padStart(3, '0');

		const line = document.createElement('div');
		line.style.whiteSpace = 'pre-wrap';
		line.style.wordBreak = 'break-all';
		line.style.fontFamily = 'monospace';
		line.style.lineHeight = '1.4em';
		line.style.marginBottom = '4px';

		if (type === 'cmd') {
			line.style.color = '#cc7832';
			line.style.fontWeight = 'bold';
			line.textContent = timeStr + ' >>> ' + text;
		} else if (type === 'error') {
			line.style.color = '#ff6b68';
			line.textContent = timeStr + ' <<< ' + text;
		} else if (type === 'meta') {
			line.style.color = '#808080';
			line.style.fontSize = '11px';
			line.textContent = text;
		} else {
			line.style.color = '#a9b7c6';
			line.textContent = timeStr + ' <<< ' + text;
		}

		if (durationMs !== undefined && durationMs !== null) {
			const durSpan = document.createElement('span');
			durSpan.style.float = 'right';
			durSpan.style.color = '#629755';
			durSpan.style.fontSize = '11px';
			durSpan.textContent = '[' + _('Duration: ') + durationMs + ' ms]';
			line.appendChild(durSpan);
		}

		out.appendChild(line);

		// Parse CME / CMS Error Code Annotation
		const mCme = text.match(/\+(CME|CMS) ERROR:\s*([0-9]+)/);
		if (mCme) {
			const errCode = mCme[2];
			const explanation = CME_ERRORS[errCode];
			if (explanation) {
				const expLine = document.createElement('div');
				expLine.style.color = '#e5c07b';
				expLine.style.background = 'rgba(229, 192, 123, 0.1)';
				expLine.style.padding = '2px 6px';
				expLine.style.margin = '2px 0';
				expLine.style.borderRadius = '3px';
				expLine.style.fontSize = '12px';
				expLine.textContent = '[' + _('Error Explanation') + '] ' + mCme[0] + ' -> ' + explanation;
				out.appendChild(expLine);
			}
		}

		out.scrollTop = out.scrollHeight;
	},

	executeCommand: function(cmdStr) {
		const self = this;
		const inputEl = document.getElementById('terminal_input');
		let raw = cmdStr || (inputEl ? inputEl.value : '');

		// Auto sanitize Chinese/Full-width punctuation
		const cleanCmd = sanitizeAtPunctuation(raw).trim();
		if (!cleanCmd) return;

		if (!self.selectedPort) {
			ui.addNotification(null, E('p', {}, _('No active communication port configured. Please configure an AT control port in Settings first.')), 'error');
			return;
		}

		// Security Guard: warn on dangerous destructive reset commands
		if (/^AT&F|^AT\+RESTORE/i.test(cleanCmd)) {
			if (!confirm(_('Warning: This command may perform a factory reset on the cellular modem. Are you sure to execute?'))) {
				return;
			}
		}

		self.appendLog(cleanCmd, 'cmd');

		if (self.cmdHistory.length === 0 || self.cmdHistory[self.cmdHistory.length - 1] !== cleanCmd) {
			self.cmdHistory.push(cleanCmd);
		}
		self.historyIndex = self.cmdHistory.length;

		if (inputEl) {
			inputEl.value = '';
			self.hideAutocomplete();
		}

		const btn = document.getElementById('terminal_send_btn');
		if (btn) btn.disabled = true;

		// Calculate client-side timestamp fallback
		const tStart = Date.now();
		callSendAt(self.selectedPort, cleanCmd, 10).then(function(res) {
			if (btn) btn.disabled = false;
			const dur = (res && res.duration_ms) ? res.duration_ms : (Date.now() - tStart);

			if (res && res.output) {
				self.appendLog(res.output, res.success ? 'resp' : 'error', dur);

				// Suggest command if failed
				if (!res.success) {
					const sugg = findBestSuggestion(cleanCmd);
					if (sugg) {
						self.renderSuggestionNotice(sugg);
					}
				}
			} else {
				self.appendLog(_('No response from modem (Timeout or device busy).'), 'error', dur);
			}
		}).catch(function(err) {
			if (btn) btn.disabled = false;
			self.appendLog(_('Execution failed: ') + err.message, 'error');
		});
	},

	renderSuggestionNotice: function(sugg) {
		const self = this;
		const out = document.getElementById('terminal_output');
		if (!out) return;

		const line = document.createElement('div');
		line.style.color = '#61afef';
		line.style.background = 'rgba(97, 175, 239, 0.1)';
		line.style.padding = '3px 8px';
		line.style.margin = '4px 0';
		line.style.borderRadius = '3px';
		line.style.fontSize = '12px';

		const textSpan = document.createElement('span');
		textSpan.textContent = _('Did you mean: ') + sugg.cmd + ' - ' + sugg.desc + '? ';

		const fillBtn = document.createElement('a');
		fillBtn.href = '#';
		fillBtn.style.color = '#98c379';
		fillBtn.style.marginLeft = '8px';
		fillBtn.style.textDecoration = 'underline';
		fillBtn.textContent = _('[Fill in]');
		fillBtn.onclick = function(e) {
			e.preventDefault();
			const inputEl = document.getElementById('terminal_input');
			if (inputEl) {
				inputEl.value = sugg.cmd;
				inputEl.focus();
			}
		};

		line.appendChild(textSpan);
		line.appendChild(fillBtn);
		out.appendChild(line);
		out.scrollTop = out.scrollHeight;
	},

	showAutocomplete: function(query) {
		const self = this;
		const box = document.getElementById('terminal_autocomplete_box');
		if (!box) return;

		const clean = query.trim().toUpperCase();
		if (!clean || clean.length < 2) {
			box.style.display = 'none';
			return;
		}

		const matches = AT_DICTIONARY.filter(function(item) {
			return item.cmd.toUpperCase().indexOf(clean) !== -1;
		}).slice(0, 6);

		if (matches.length === 0) {
			box.style.display = 'none';
			return;
		}

		box.innerHTML = '';
		matches.forEach(function(m) {
			const itemEl = document.createElement('div');
			itemEl.style.padding = '5px 10px';
			itemEl.style.cursor = 'pointer';
			itemEl.style.fontSize = '12px';
			itemEl.style.borderBottom = '1px solid #eee';
			itemEl.style.display = 'flex';
			itemEl.style.justifyContent = 'space-between';

			const cmdSpan = document.createElement('b');
			cmdSpan.style.fontFamily = 'monospace';
			cmdSpan.textContent = m.cmd;

			const descSpan = document.createElement('span');
			descSpan.style.color = '#888';
			descSpan.style.marginLeft = '10px';
			descSpan.textContent = m.desc;

			itemEl.appendChild(cmdSpan);
			itemEl.appendChild(descSpan);

			itemEl.onmouseenter = function() { itemEl.style.background = '#f0f4f8'; };
			itemEl.onmouseleave = function() { itemEl.style.background = '#fff'; };
			itemEl.onclick = function() {
				const inputEl = document.getElementById('terminal_input');
				if (inputEl) {
					inputEl.value = m.cmd;
					inputEl.focus();
				}
				self.hideAutocomplete();
			};

			box.appendChild(itemEl);
		});

		box.style.display = 'block';
	},

	hideAutocomplete: function() {
		const box = document.getElementById('terminal_autocomplete_box');
		if (box) box.style.display = 'none';
	},

	refreshFavoritesUI: function() {
		const self = this;
		const favContainer = document.getElementById('terminal_favorites_list');
		if (!favContainer) return;

		favContainer.innerHTML = '';
		self.favorites.forEach(function(f, idx) {
			const btn = E('input', {
				'type': 'button',
				'class': 'btn cbi-button cbi-button-action',
				'style': 'margin-right: 6px; margin-bottom: 6px; font-family: monospace; font-size: 12px;',
				'value': f.label || f.cmd,
				'click': function() {
					const inputEl = document.getElementById('terminal_input');
					if (inputEl) inputEl.value = f.cmd;
					self.executeCommand(f.cmd);
				}
			});
			favContainer.appendChild(btn);
		});
	},

	addCurrentToFavorites: function() {
		const self = this;
		const inputEl = document.getElementById('terminal_input');
		const cmd = inputEl ? inputEl.value.trim() : '';
		if (!cmd) {
			ui.addNotification(null, E('p', {}, _('Please enter a command to favorite.')), 'warning');
			return;
		}

		const label = prompt(_('Enter a friendly name for this shortcut:'), cmd);
		if (label !== null) {
			self.favorites.push({ cmd: cmd, label: label.trim() || cmd });
			self.saveFavorites();
			self.refreshFavoritesUI();
			ui.addNotification(null, E('p', {}, _('Command added to favorites.')), 'info');
		}
	},

	exportLogFile: function() {
		const out = document.getElementById('terminal_output');
		if (!out) return;
		const text = out.innerText;
		const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
		const a = document.createElement('a');
		const d = new Date().toISOString().replace(/[:.]/g, '-');
		a.download = 'modem_at_log_' + d + '.txt';
		a.href = URL.createObjectURL(blob);
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
	},

	render: function(devicesData) {
		const self = this;
		self.devicesList = Array.isArray(devicesData) ? devicesData : ((devicesData && Array.isArray(devicesData.devices)) ? devicesData.devices : []);
		self.loadFavorites();

		if (self.devicesList.length > 0) {
			self.selectedPort = self.devicesList[0].primary_port || (self.devicesList[0].ports ? self.devicesList[0].ports[0] : null);
		} else {
			self.selectedPort = null;
		}

		const container = E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, _('Cellular Modem Manager') + ' - ' + _('AT Command Terminal')),
			E('div', { 'class': 'cbi-map-descr' }, _('Direct interactive terminal for sending AT commands with intelligent auto-punctuation correction, fuzzy suggestions, error translation, and custom favorites.'))
		]);

		if (!self.selectedPort) {
			container.appendChild(E('div', { 'class': 'alert-message warning', 'style': 'margin-top: 15px; padding: 15px; border-left: 5px solid #ff9800; background: #fff8e1;' }, [
				E('h4', { 'style': 'margin: 0 0 8px 0; color: #d32f2f;' }, _('No Serial Ports Available')),
				E('p', { 'style': 'margin: 0; color: #555;' }, _('No ttyUSB or ttyACM serial communication ports detected. Please verify hardware connection and driver state.'))
			]));
		}

		// Port Status Bar (Display Only)
		const activePortLabel = self.selectedPort ? (self.selectedPort + ' @ 115200') : _('No Port Available');
		const portStatusBar = E('div', {
			'style': 'margin-top: 15px; margin-bottom: 15px; display: flex; align-items: center; justify-content: space-between; background: #f4f6f8; border: 1px solid #e1e4e8; border-radius: 4px; padding: 8px 16px;'
		}, [
			E('span', {}, [
				E('strong', { 'style': 'color: #333;' }, _('Communication Port: ')),
				E('span', { 'style': 'color: #0366d6; font-weight: bold; font-family: monospace; font-size: 13px;' }, activePortLabel)
			]),
			E('span', { 'style': 'color: #666; font-size: 12px;' }, _('Bound to configured primary AT control port'))
		]);
		container.appendChild(portStatusBar);

		// Favorites and Presets Section
		const presetsSection = E('fieldset', { 'class': 'cbi-section' }, [
			E('legend', { 'style': 'display: flex; justify-content: space-between; align-items: center; width: 100%; box-sizing: border-box;' }, [
				E('span', {}, _('Command Presets and Favorites')),
				E('span', { 'style': 'display: inline-flex; gap: 8px; align-items: center; margin-left: auto;' }, [
					E('input', {
						'type': 'button',
						'class': 'btn cbi-button',
						'style': 'font-size: 11px;',
						'value': _('+ Add Current to Favorites'),
						'click': ui.createHandlerFn(self, 'addCurrentToFavorites')
					})
				])
			]),
			E('div', { 'class': 'cbi-section-node', 'style': 'padding: 10px;' }, [
				E('div', { 'style': 'margin-bottom: 8px;' }, [
					E('b', { 'style': 'display: inline-block; width: 110px;' }, _('Favorites:')),
					E('span', { 'id': 'terminal_favorites_list' })
				]),
				E('div', {}, [
					E('b', { 'style': 'display: inline-block; width: 110px;' }, _('Advanced:')),
					E('input', {
						'type': 'button',
						'class': 'btn cbi-button cbi-button-action',
						'style': 'margin-right: 6px; margin-bottom: 6px; font-family: monospace; font-size: 12px;',
						'value': 'AT+COPS=? - ' + _('Scan Networks'),
						'click': function() { self.executeCommand('AT+COPS=?'); }
					}),
					E('input', {
						'type': 'button',
						'class': 'btn cbi-button cbi-button-action',
						'style': 'margin-right: 6px; margin-bottom: 6px; font-family: monospace; font-size: 12px;',
						'value': 'AT+CGDCONT? - ' + _('Query APN'),
						'click': function() { self.executeCommand('AT+CGDCONT?'); }
					})
				])
			])
		]);
		container.appendChild(presetsSection);

		// Autocomplete Dropdown Box
		const autocompleteBox = E('div', {
			'id': 'terminal_autocomplete_box',
			'style': 'display: none; position: absolute; background: #fff; border: 1px solid #ccc; border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 1000; max-height: 200px; overflow-y: auto; width: 550px;'
		});

		// Command Input Bar (Positioned ABOVE Output Box)
		const inputSection = E('fieldset', { 'class': 'cbi-section', 'style': 'margin-bottom: 15px; position: relative;' }, [
			E('legend', {}, _('Command Execution')),
			E('div', { 'class': 'cbi-section-node', 'style': 'padding: 10px;' }, [
				E('div', { 'style': 'display: flex; gap: 10px; align-items: center;' }, [
					E('input', {
						'type': 'text',
						'id': 'terminal_input',
						'class': 'cbi-input-text',
						'style': 'flex: 1; font-family: monospace; font-size: 14px; padding: 6px 10px;',
						'placeholder': _('Enter AT command (e.g. AT+CSQ)... Chinese punctuation auto-converted'),
						'input': function(ev) {
							self.showAutocomplete(ev.target.value);
						},
						'keydown': function(ev) {
							if (ev.key === 'Enter') {
								ev.preventDefault();
								self.executeCommand();
							} else if (ev.key === 'Escape') {
								self.hideAutocomplete();
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
				]),
				autocompleteBox
			])
		]);
		container.appendChild(inputSection);

		// Terminal Output Box (Positioned BELOW Input Bar)
		const outputSection = E('fieldset', { 'class': 'cbi-section' }, [
			E('legend', { 'style': 'display: flex; justify-content: space-between; align-items: center; width: 100%; box-sizing: border-box;' }, [
				E('span', {}, _('Interactive Console Output')),
				E('span', { 'style': 'display: inline-flex; gap: 8px; align-items: center; margin-left: auto;' }, [
					E('input', {
						'type': 'button',
						'class': 'btn cbi-button',
						'value': _('Clear Output'),
						'style': 'font-size: 11px;',
						'click': function() {
							const out = document.getElementById('terminal_output');
							if (out) out.innerHTML = '';
						}
					}),
					E('input', {
						'type': 'button',
						'class': 'btn cbi-button',
						'value': _('Export Log'),
						'style': 'font-size: 11px;',
						'click': ui.createHandlerFn(self, 'exportLogFile')
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
				'style': 'background: #2b2b2b; color: #a9b7c6; font-family: monospace; font-size: 13px; min-height: 280px; max-height: 480px; overflow-y: auto; padding: 12px; border-radius: 4px; box-sizing: border-box; white-space: pre-wrap;'
			}, [
				E('div', { 'style': 'color: #808080;' }, _('System ready. Full-width punctuation will be automatically converted to standard ASCII.'))
			])
		]);
		container.appendChild(outputSection);

		setTimeout(function() {
			self.refreshFavoritesUI();
		}, 100);

		return container;
	}
});
