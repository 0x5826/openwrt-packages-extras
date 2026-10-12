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
		return callGetLog();
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
			if (logArea && res) {
				logArea.value = res.log || _('No log entries recorded yet.');
				logArea.scrollTop = logArea.scrollHeight;
			}
		});
	},

	render: function(logData) {
		const self = this;
		const initialLog = (logData && logData.log) ? logData.log : _('No log entries recorded yet.');

		const container = E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, _('Cellular Modem Manager') + ' - ' + _('System Log')),
			E('div', { 'class': 'cbi-map-descr' }, _('View background AT command traces, hardware detection events, and auto-reconnect activities.'))
		]);

		const logSection = E('fieldset', { 'class': 'cbi-section' }, [
			E('legend', {}, [
				_('Modem Manager Logs'),
				E('span', { 'style': 'float: right;' }, [
					E('input', {
						'type': 'button',
						'class': 'btn cbi-button cbi-button-reload',
						'value': _('Refresh'),
						'style': 'margin-right: 8px; font-size: 11px;',
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
