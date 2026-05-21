'use strict';
'require view';
'require uci';
'require form';

return view.extend({
	load: function() {
		return Promise.all([
			uci.load('linkback'),
			uci.load('network')
		]);
	},

	render: function() {
		var m, s, o;

		m = new form.Map('linkback',
			_('LinkBack 链路守护') + ' - ' + _('Settings'),
			_('Configure Multi-WAN failover service, health check parameters, and monitored link interfaces.'));

		// --- Global Settings Section ---
		s = m.section(form.TypedSection, 'global', _('Global Settings'));
		s.anonymous = true;

		// Enable switch (总开关) - must be the first option
		o = s.option(form.Flag, 'enabled', _('Enable Service'),
			_('Master switch to enable or disable the LinkBack failover daemon.'));
		o.rmempty = false;

		// --- Monitored Links Section ---
		s = m.section(form.GridSection, 'link', _('Monitored WAN Interfaces'),
			_('Add and prioritize your WAN interfaces. Lower priority number means higher preference (e.g., 1 = primary, 2 = backup).'));
		s.anonymous = true;
		s.addremove = true;

		// 1. Enabled (Enabled as the first column)
		o = s.option(form.Flag, 'enabled', _('Enabled'));
		o.default = '1';
		o.rmempty = false;

		// 2. Interface name - dynamic dropdown (No description for main column)
		o = s.option(form.ListValue, 'name', _('Interface'));
		o.rmempty = false;
		uci.sections('network', 'interface').forEach(function(sec) {
			var n = sec['.name'];
			if (n !== 'loopback' && n !== 'lan') {
				o.value(n);
			}
		});

		// 3. Priority (No description for main column)
		o = s.option(form.Value, 'priority', _('Priority'));
		o.datatype = 'uinteger';
		o.default = '1';
		o.rmempty = false;

		// 4. Metric (No description for main column)
		o = s.option(form.Value, 'metric', _('Base Metric'));
		o.datatype = 'uinteger';
		o.default = '10';
		o.rmempty = false;

		// --- Health Check Targets (Modal Only) ---

		// 1. Check Type Dropdown
		o = s.option(form.ListValue, 'check_type', _('Check Type'));
		o.modalonly = true;
		o.value('ping', _('Ping Probe'));
		o.value('dns', _('DNS Probe'));
		o.value('tcp', _('TCP Probe'));
		o.default = 'ping';

		o.cfgvalue = function(section_id) {
			var dns_server = uci.get('linkback', section_id, 'dns_server');
			var tcp_target = uci.get('linkback', section_id, 'tcp_target');
			if (dns_server) {
				return 'dns';
			} else if (tcp_target) {
				return 'tcp';
			}
			return 'ping';
		};

		o.write = function(section_id, value) {
			// Silently set weight_threshold = 1
			uci.set('linkback', section_id, 'weight_threshold', '1');

			if (value === 'ping') {
				uci.set('linkback', section_id, 'ping_weight', '1');
				// Clear dns
				uci.remove('linkback', section_id, 'dns_weight');
				uci.remove('linkback', section_id, 'dns_server');
				uci.remove('linkback', section_id, 'dns_domain');
				// Clear tcp
				uci.remove('linkback', section_id, 'tcp_weight');
				uci.remove('linkback', section_id, 'tcp_target');
				uci.remove('linkback', section_id, 'tcp_port');
			} else if (value === 'dns') {
				uci.set('linkback', section_id, 'dns_weight', '1');
				// Clear ping
				uci.remove('linkback', section_id, 'ping_weight');
				uci.remove('linkback', section_id, 'ping_targets');
				// Clear tcp
				uci.remove('linkback', section_id, 'tcp_weight');
				uci.remove('linkback', section_id, 'tcp_target');
				uci.remove('linkback', section_id, 'tcp_port');
			} else if (value === 'tcp') {
				uci.set('linkback', section_id, 'tcp_weight', '1');
				// Clear ping
				uci.remove('linkback', section_id, 'ping_weight');
				uci.remove('linkback', section_id, 'ping_targets');
				// Clear dns
				uci.remove('linkback', section_id, 'dns_weight');
				uci.remove('linkback', section_id, 'dns_server');
				uci.remove('linkback', section_id, 'dns_domain');
			}
		};

		// 1.5 Individual health check options (Modal only)
		o = s.option(form.Value, 'check_interval', _('Check Interval (s)'),
			_('Time in seconds between each health check cycle for this link.'));
		o.datatype = 'uinteger';
		o.default = '5';
		o.rmempty = false;
		o.modalonly = true;

		o = s.option(form.Value, 'check_timeout', _('Check Timeout (s)'),
			_('Maximum wait time in seconds for each individual check probe for this link.'));
		o.datatype = 'uinteger';
		o.default = '3';
		o.rmempty = false;
		o.modalonly = true;

		o = s.option(form.Value, 'recovery_delay', _('Recovery Delay'),
			_('Number of consecutive successful checks required before marking this link as healthy (failback anti-flap).'));
		o.datatype = 'uinteger';
		o.default = '3';
		o.rmempty = false;
		o.modalonly = true;

		o = s.option(form.Value, 'failover_delay', _('Failover Delay'),
			_('Number of consecutive failed checks required before marking this link as faulted (failover anti-flap).'));
		o.datatype = 'uinteger';
		o.default = '2';
		o.rmempty = false;
		o.modalonly = true;

		// 2. Ping Probe Parameters
		o = s.option(form.Value, 'ping_targets', _('Ping Targets'),
			_('Space-separated list of IPs to ping (e.g., 223.5.5.5 8.8.8.8).'));
		o.rmempty = true;
		o.modalonly = true;
		o.depends('check_type', 'ping');

		// 3. DNS Probe Parameters
		o = s.option(form.Value, 'dns_server', _('DNS Server'),
			_('DNS server IP for UDP query probe (e.g., 119.29.29.29).'));
		o.datatype = 'ip4addr';
		o.rmempty = true;
		o.modalonly = true;
		o.depends('check_type', 'dns');

		o = s.option(form.Value, 'dns_domain', _('DNS Domain'),
			_('Domain name to resolve for DNS probe (e.g., www.baidu.com).'));
		o.rmempty = true;
		o.modalonly = true;
		o.depends('check_type', 'dns');

		// 4. TCP Probe Parameters
		o = s.option(form.Value, 'tcp_target', _('TCP Target'),
			_('Target IP for TCP handshake probe.'));
		o.datatype = 'ip4addr';
		o.rmempty = true;
		o.modalonly = true;
		o.depends('check_type', 'tcp');

		o = s.option(form.Value, 'tcp_port', _('TCP Port'),
			_('Target port for TCP handshake probe.'));
		o.datatype = 'port';
		o.rmempty = true;
		o.modalonly = true;
		o.depends('check_type', 'tcp');

		return m.render();
	}
});
