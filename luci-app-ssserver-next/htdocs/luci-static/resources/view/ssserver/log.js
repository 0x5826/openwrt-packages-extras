'use strict';
'require view';
'require rpc';
'require ui';
'require poll';

var callGetLog = rpc.declare({
	object: 'luci.ssserver',
	method: 'get_log',
	expect: {}
});

return view.extend({
	render: function() {
		var log_view = E('textarea', {
			'class': 'cbi-input-textarea',
			'style': 'width:100%; height:600px; font-family:monospace; font-size:12px;',
			'readonly': 'readonly',
			'wrap': 'off'
		});

		poll.add(function() {
			return callGetLog().then(function(res) {
				if (res && res.log) {
					log_view.value = res.log;
					log_view.scrollTop = log_view.scrollHeight;
				} else {
					log_view.value = _('No log entries found.');
				}
			});
		}, 5);

		return E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, [ _('Shadowsocks Server Log') ]),
			E('div', { 'class': 'cbi-section' }, [
				E('div', { 'class': 'cbi-section-descr' }, [ _('Logs are updated every 5 seconds.') ]),
				log_view
			])
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
