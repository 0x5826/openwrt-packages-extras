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

		o = s.option(form.Value, 'check_interval', _('Check Interval (s)'),
			_('Time in seconds between each health check cycle.'));
		o.datatype = 'uinteger';
		o.default = '5';
		o.rmempty = false;

		o = s.option(form.Value, 'check_timeout', _('Check Timeout (s)'),
			_('Maximum wait time in seconds for each individual check probe.'));
		o.datatype = 'uinteger';
		o.default = '3';
		o.rmempty = false;

		o = s.option(form.Value, 'recovery_delay', _('Recovery Delay'),
			_('Number of consecutive successful checks required before marking a faulted link as healthy again (failback anti-flap).'));
		o.datatype = 'uinteger';
		o.default = '3';
		o.rmempty = false;

		o = s.option(form.Value, 'failover_delay', _('Failover Delay'),
			_('Number of consecutive failed checks required before marking a healthy link as faulted (failover anti-flap).'));
		o.datatype = 'uinteger';
		o.default = '2';
		o.rmempty = false;

		// --- Monitored Links Section ---
		s = m.section(form.TypedSection, 'link', _('Monitored WAN Interfaces'),
			_('Add and prioritize your WAN interfaces. Lower priority number means higher preference (e.g., 1 = primary, 2 = backup).'));
		s.anonymous = true;
		s.addremove = true;

		// Interface name - dynamic dropdown
		o = s.option(form.ListValue, 'name', _('Interface'),
			_('Select a logical WAN interface from Network settings.'));
		o.rmempty = false;
		uci.sections('network', 'interface').forEach(function(sec) {
			var n = sec['.name'];
			if (n !== 'loopback' && n !== 'lan') {
				o.value(n);
			}
		});

		o = s.option(form.Flag, 'enabled', _('Enabled'));
		o.default = '1';

		o = s.option(form.Value, 'priority', _('Priority'),
			_('Routing priority (lower number = higher preference, e.g. 1 = primary).'));
		o.datatype = 'uinteger';
		o.default = '1';
		o.rmempty = false;

		o = s.option(form.Value, 'metric', _('Base Metric'),
			_('Default route metric when this link is healthy (e.g., wan=10, wan2=20).'));
		o.datatype = 'uinteger';
		o.default = '10';
		o.rmempty = false;

		// --- Health Check Targets ---
		o = s.option(form.Value, 'ping_targets', _('Ping Targets'),
			_('Space-separated list of IPs to ping (e.g., 223.5.5.5 8.8.8.8).'));
		o.rmempty = true;

		o = s.option(form.Value, 'ping_weight', _('Ping Weight'));
		o.datatype = 'uinteger';
		o.default = '1';

		o = s.option(form.Value, 'dns_server', _('DNS Server'),
			_('DNS server IP for UDP query probe (e.g., 119.29.29.29).'));
		o.datatype = 'ip4addr';
		o.rmempty = true;

		o = s.option(form.Value, 'dns_domain', _('DNS Domain'),
			_('Domain name to resolve for DNS probe (e.g., www.baidu.com).'));
		o.rmempty = true;

		o = s.option(form.Value, 'dns_weight', _('DNS Weight'));
		o.datatype = 'uinteger';
		o.default = '1';

		o = s.option(form.Value, 'tcp_target', _('TCP Target'),
			_('Target IP for TCP handshake probe.'));
		o.datatype = 'ip4addr';
		o.rmempty = true;

		o = s.option(form.Value, 'tcp_port', _('TCP Port'),
			_('Target port for TCP handshake probe.'));
		o.datatype = 'port';
		o.rmempty = true;

		o = s.option(form.Value, 'tcp_weight', _('TCP Weight'));
		o.datatype = 'uinteger';
		o.default = '1';

		o = s.option(form.Value, 'weight_threshold', _('Health Threshold'),
			_('Combined weight score required to mark this link healthy (e.g., if threshold is 2, any 2 successful checks suffice).'));
		o.datatype = 'uinteger';
		o.default = '2';
		o.rmempty = false;

		return m.render();
	}
});
