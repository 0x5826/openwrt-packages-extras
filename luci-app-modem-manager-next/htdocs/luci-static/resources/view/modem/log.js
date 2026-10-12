'use strict';
'require view';
'require rpc';
'require poll';
'require ui';
'require dom';

const callGetLog = rpc.declare({
	object: 'luci.modem',
	method: 'get_log',
	expect: { log: '' }
});

const callClearLog = rpc.declare({
	object: 'luci.modem',
	method: 'clear_log'
});

return view.extend({
	handleSaveApply: null,
	handleSave: null,
	handleReset: null,

	load: function() {
		return L.resolveDefault(callGetLog(), '');
	},

	handleClearLog: function() {
		const self = this;
		callClearLog().then(function() {
			const logArea = document.getElementById('modem_log_content');
			if (logArea) logArea.value = '';
			ui.addNotification(null, E('p', {}, _('Log buffer cleared successfully.')), 'info');
		});
	},

	updateLog: function() {
		return callGetLog().then(function(res) {
			const logArea = document.getElementById('modem_log_content');
			if (logArea) {
				let logText = (typeof res === 'string') ? res : ((res && res.log) ? res.log : '');
				logArea.value = logText || _('No log entries recorded yet.');
				logArea.scrollTop = logArea.scrollHeight;
			}
		}).catch(function() {});
	},

	render: function(logData) {
		const self = this;
		let initialLog = (typeof logData === 'string') ? logData : ((logData && logData.log) ? logData.log : '');
		if (!initialLog) initialLog = _('No log entries recorded yet.');

		const container = E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, _('Cellular Modem Manager') + ' - ' + _('System Log')),
			E('div', { 'class': 'cbi-map-descr' }, _('View background AT command traces, hardware detection events, and auto-reconnect activities.'))
		]);

		const logSection = E('fieldset', { 'class': 'cbi-section' }, [
			E('legend', { 'style': 'display: flex; justify-content: space-between; align-items: center; width: 100%; box-sizing: border-box;' }, [
				E('span', {}, _('Modem Manager Logs')),
				E('span', { 'style': 'display: inline-flex; gap: 8px; align-items: center; margin-left: auto;' }, [
					E('input', {
						'type': 'button',
						'class': 'btn cbi-button cbi-button-reload',
						'value': _('Refresh'),
						'style': 'font-size: 11px;',
						'click': ui.createHandlerFn(self, 'updateLog')
					}),
					E('input', {
						'type': 'button',
						'class': 'btn cbi-button cbi-button-reset',
						'value': _('Clear Log'),
						'style': 'font-size: 11px;',
						'click': ui.createHandlerFn(self, 'handleClearLog')
					})
				])
			]),
			E('div', { 'class': 'cbi-section-node' }, [
				E('textarea', {
					'id': 'modem_log_content',
					'class': 'cbi-input-textarea',
					'style': 'width: 100%; min-height: 420px; font-family: monospace; font-size: 12px; background: #fafafa; border: 1px solid #ccc; box-sizing: border-box; padding: 10px;',
					'readonly': 'readonly',
					'wrap': 'off'
				}, [ initialLog ])
			])
		]);
		container.appendChild(logSection);

		poll.add(function() {
			return self.updateLog();
		}, 5);

		return container;
	}
});
