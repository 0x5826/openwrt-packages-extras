'use strict';
'require view';
'require uci';
'require form';
'require ui';

return view.extend({
	load: function() {
		return Promise.all([
			uci.load('linkback'),
			uci.load('network')
		]);
	},

	// Check if the current config meets the requirements to enable service.
	// Returns an error string if conditions are not met, or null if OK.
	_checkEnableRequirements: function() {
		var link_sections = uci.sections('linkback', 'link') || [];
		if (link_sections.length <= 1) {
			return _('Cannot enable service: At least 2 monitored WAN interfaces must be configured for failover switcher.');
		}
		var has_valid_check = false;
		for (var i = 0; i < link_sections.length; i++) {
			var s_id = link_sections[i]['.name'];
			if (uci.get('linkback', s_id, 'ping_targets') ||
			    uci.get('linkback', s_id, 'dns_server') ||
			    uci.get('linkback', s_id, 'tcp_target')) {
				has_valid_check = true;
				break;
			}
		}
		if (!has_valid_check) {
			return _('Cannot enable service: At least one interface must have a configured check type (Ping, DNS, or TCP).');
		}
		return null;
	},

	// Override handleSave: show native LuCI warning notification bar instead of
	// the full-screen red modal error dialog when enable conditions are not met.
	handleSave: function() {
		var cb = document.querySelector('input[type="checkbox"][name$=".enabled"]');
		var will_enable = cb ? cb.checked : false;

		if (will_enable) {
			var err = this._checkEnableRequirements();
			if (err) {
				ui.addNotification(null, E('p', err), 'warning');
				return Promise.resolve();
			}
		}
		return this.map ? this.map.save() : Promise.resolve();
	},

	// Override handleSaveApply: same guard with save+apply.
	handleSaveApply: function(ev, mode) {
		var cb = document.querySelector('input[type="checkbox"][name$=".enabled"]');
		var will_enable = cb ? cb.checked : false;

		if (will_enable) {
			var err = this._checkEnableRequirements();
			if (err) {
				ui.addNotification(null, E('p', err), 'warning');
				return Promise.resolve();
			}
		}
		return this.map ? this.map.save(null, true) : Promise.resolve();
	},

	render: function() {
		var m, s, o;
		var self = this;

		// Helper function to expand table column controls and eliminate right empty space
		var makeTableColumnExpand = function(opt, width) {
			var origRender = opt.render;
			opt.render = function(option_index, section_id, in_table) {
				return Promise.resolve(origRender.call(this, option_index, section_id, in_table)).then(function(node) {
					if (in_table && node) {
						if (width) {
							node.style.width = width;
						}
						var input = node.querySelector('input, select, .cbi-dropdown');
						if (input) {
							input.style.width = '100%';
							input.style.maxWidth = 'none';
						}
					}
					return node;
				});
			};
		};

		m = new form.Map('linkback',
			_('LinkBack 链路守护') + ' - ' + _('Settings'),
			_('Configure Multi-WAN failover service, health check parameters, and monitored link interfaces.'));

		// Store map reference for use in handleSave/handleSaveApply
		self.map = m;

		// --- Global Settings Section ---
		s = m.section(form.TypedSection, 'global', _('Global Settings'));
		s.anonymous = true;

		// Enable switch (总开关) - must be the first option
		o = s.option(form.Flag, 'enabled', _('Enable Service'),
			_('Master switch to enable or disable the LinkBack failover daemon.'));
		o.rmempty = false;
		// Validation is now handled by handleSave/handleSaveApply via ui.addNotification.
		// Keep a passthrough validate to avoid the LuCI red modal when deleting interfaces.
		o.validate = function(section_id, value) {
			return true;
		};

		// --- Monitored Links Section ---
		s = m.section(form.GridSection, 'link', _('Monitored WAN Interfaces'),
			_('Add and prioritize your WAN interfaces. Lower priority number means higher preference (e.g., 1 = primary, 2 = backup).'));
		s.anonymous = true;
		s.addremove = true;

		// Custom dynamic Modal title for gorgeous UX
		s.modaltitle = function(section_id) {
			var parent_title = _('LinkBack 链路守护') + ' - ' + _('Settings');
			var is_new = (this.map.addedSection === section_id) || !uci.get('linkback', section_id, 'name');
			if (is_new) {
				return parent_title + ' - ' + _('Add Monitored Interface');
			} else {
				var name = uci.get('linkback', section_id, 'name') || section_id;
				return parent_title + ' - ' + _('Edit Monitored Interface') + ' (' + name + ')';
			}
		};

		// 1. Enabled (Enabled as the first column)
		o = s.option(form.Flag, 'enabled', _('Enabled'));
		o.default = '1';
		o.rmempty = false;
		makeTableColumnExpand(o, '8%');

		// 2. Interface name - dynamic dropdown (No description for main column)
		o = s.option(form.ListValue, 'name', _('Interface'));
		o.rmempty = false;
		var origNameRender = o.render;
		o.render = function(option_index, section_id, in_table) {
			this.keylist = [];
			this.vallist = [];
			var added_names = {};
			uci.sections('linkback', 'link').forEach(function(sec) {
				if (sec['.name'] !== section_id && sec.name) {
					added_names[sec.name] = true;
				}
			});
			var self = this;
			uci.sections('network', 'interface').forEach(function(sec) {
				var n = sec['.name'];
				if (n !== 'loopback' && n !== 'lan' && !added_names[n]) {
					self.value(n);
				}
			});
			return origNameRender.call(this, option_index, section_id, in_table);
		};
		makeTableColumnExpand(o, '25%');

		// 3. Priority (No description for main column)
		o = s.option(form.Value, 'priority', _('Priority'));
		o.datatype = 'uinteger';
		o.default = '1';
		o.rmempty = false;
		makeTableColumnExpand(o, '15%');

		// 4. Metric (No description for main column)
		o = s.option(form.Value, 'metric', _('Base Metric'));
		o.datatype = 'uinteger';
		o.default = '10';
		o.rmempty = false;
		makeTableColumnExpand(o, '15%');

		// 5. Check Type Dropdown (Displayed in main table & Modal)
		o = s.option(form.ListValue, 'check_type', _('Check Type'));
		o.value('', _('-- Not Configured --'));
		o.value('ping', _('Ping Probe'));
		o.value('dns', _('DNS Probe'));
		o.value('tcp', _('TCP Probe'));
		o.default = '';
		o.rmempty = true;
		makeTableColumnExpand(o, '20%');

		o.cfgvalue = function(section_id) {
			var ping_targets = uci.get('linkback', section_id, 'ping_targets');
			var dns_server = uci.get('linkback', section_id, 'dns_server');
			var tcp_target = uci.get('linkback', section_id, 'tcp_target');
			if (dns_server) {
				return 'dns';
			} else if (tcp_target) {
				return 'tcp';
			} else if (ping_targets) {
				return 'ping';
			}
			return '';
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
			} else {
				// Clear all probe configs if set to empty
				uci.remove('linkback', section_id, 'ping_weight');
				uci.remove('linkback', section_id, 'ping_targets');
				uci.remove('linkback', section_id, 'dns_weight');
				uci.remove('linkback', section_id, 'dns_server');
				uci.remove('linkback', section_id, 'dns_domain');
				uci.remove('linkback', section_id, 'tcp_weight');
				uci.remove('linkback', section_id, 'tcp_target');
				uci.remove('linkback', section_id, 'tcp_port');
			}
		};

		// 6. Ping Probe Parameters
		o = s.option(form.Value, 'ping_targets', _('Ping Targets'),
			_('Space-separated list of IPs to ping (e.g., 223.5.5.5 8.8.8.8).'));
		o.rmempty = true;
		o.modalonly = true;
		o.depends('check_type', 'ping');

		// 7. DNS Probe Parameters
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

		// 8. TCP Probe Parameters
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

		// 9. Individual health check options (Modal only)
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

		return m.render();
	}
});
