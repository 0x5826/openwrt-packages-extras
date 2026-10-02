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

	// Comprehensive validation: check all conditions required for the service
	// to be safely enabled. Returns an error message string, or null if OK.
	_validateServiceConfig: function() {
		var global_sec = uci.sections('linkback', 'global')[0] || {};
		var mode = global_sec.mode || 'multi_wan';
		var link_sections = uci.sections('linkback', 'link') || [];

		// Rule 1: At least 2 targets
		if (link_sections.length < 2) {
			return _('Cannot enable service: At least 2 monitored links/gateways must be configured for failover switcher.');
		}

		if (mode === 'multi_gw') {
			var iface = global_sec.interface || 'lan';
			if (!iface) {
				return _('Cannot enable service: Bind interface must be configured in Multi-Gateway mode.');
			}
		}

		// Rule 2: ALL targets must have a health check configured
		var priorities = {};
		var gateways = {};
		var names = {};

		for (var i = 0; i < link_sections.length; i++) {
			var s_id = link_sections[i]['.name'];
			var target_name = uci.get('linkback', s_id, 'name') || s_id;
			var gw = uci.get('linkback', s_id, 'gateway');
			var prio = uci.get('linkback', s_id, 'priority') || '1';

			var has_check = uci.get('linkback', s_id, 'ping_targets') ||
			                uci.get('linkback', s_id, 'dns_server') ||
			                uci.get('linkback', s_id, 'tcp_target');
			if (!has_check) {
				return _('Cannot enable service: Target "%s" has no health check configured.').format(target_name);
			}

			// Priority uniqueness
			if (priorities[prio]) {
				return _('Cannot enable service: Targets "%s" and "%s" have the same priority %s.').format(priorities[prio], target_name, prio);
			}
			priorities[prio] = target_name;

			// Mode specific checks
			if (mode === 'multi_gw') {
				var ipPattern = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
				if (!gw || !ipPattern.test(gw)) {
					return _('Cannot enable service: Target "%s" has an invalid or missing Gateway IP.').format(target_name);
				}
				if (gateways[gw]) {
					return _('Cannot enable service: Targets "%s" and "%s" have the same Gateway IP %s.').format(gateways[gw], target_name, gw);
				}
				gateways[gw] = target_name;
			} else {
				if (names[target_name]) {
					return _('Cannot enable service: Interface "%s" is configured multiple times.').format(target_name);
				}
				names[target_name] = true;
			}
		}

		return null;
	},

	render: function() {
		var m, s, o;
		var self = this;

		var current_mode = uci.get('linkback', '@global[0]', 'mode') || 'multi_wan';

		// 智能判断当前是否为中文环境，并提供实时校验的翻译 fallback
		var is_zh = (_('Base Metric') === '默认跃点' || _('Base Metric') === '默认跃点 (Metric)');
		var t_priority_empty = is_zh ? '优先级不能为空。' : _('Priority must not be empty.');
		var t_priority_conflict = is_zh ? '优先级 %s 与其他目标冲突。优先级必须是唯一的。' : _('Priority %s conflicts with another target. Priorities must be unique.');

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
			_('Configure Multi-WAN / Multi-Gateway failover service, health check parameters, and monitored targets.'));

		// --- Global Settings Section ---
		s = m.section(form.TypedSection, 'global', _('Global Settings'));
		s.anonymous = true;

		// 1. Enable switch (总开关) - must be the first option
		o = s.option(form.Flag, 'enabled', _('Enable Service'),
			_('Master switch to enable or disable the LinkBack failover daemon.'));
		o.rmempty = false;
		o.write = function(section_id, value) {
			if (value === '1') {
				var err = self._validateServiceConfig();
				if (err) {
					ui.addNotification(null, E('p', err), 'error');
					uci.set('linkback', section_id, 'enabled', '0');
					return;
				}
			}
			uci.set('linkback', section_id, 'enabled', value);
		};

		// 2. Working Mode (工作模式下拉框)
		o = s.option(form.ListValue, 'mode', _('Working Mode'),
			_('Choose failover mode: Multi-WAN interface failover or Single-Interface multi-gateway redundancy (e.g. bypass gateway disaster recovery).'));
		o.value('multi_wan', _('Multi-WAN Interface Failover'));
		o.value('multi_gw', _('Single-Interface Multi-Gateway (Bypass/Main Gateway)'));
		o.default = 'multi_wan';
		o.rmempty = false;

		// 3. Bind Interface in Multi-Gateway mode
		o = s.option(form.ListValue, 'interface', _('Bind Interface'),
			_('The underlying network interface where all next-hop gateways reside (typically lan / br-lan).'));
		o.default = 'lan';
		o.rmempty = false;
		o.depends('mode', 'multi_gw');

		uci.sections('network', 'interface').forEach(function(sec) {
			var n = sec['.name'];
			if (n !== 'loopback') {
				o.value(n);
			}
		});

		// 4. Global Health Check Parameters
		o = s.option(form.Value, 'check_interval', _('Check Interval (s)'),
			_('Default time in seconds between each health check cycle.'));
		o.datatype = 'uinteger';
		o.default = '5';
		o.rmempty = false;

		o = s.option(form.Value, 'check_timeout', _('Check Timeout (s)'),
			_('Default maximum wait time in seconds for each check probe (1s recommended to prevent blocking).'));
		o.datatype = 'uinteger';
		o.default = '1';
		o.rmempty = false;

		o = s.option(form.Value, 'recovery_delay', _('Recovery Delay'),
			_('Number of consecutive successful checks required before marking link as recovered (failback anti-flap).'));
		o.datatype = 'uinteger';
		o.default = '3';
		o.rmempty = false;

		o = s.option(form.Value, 'failover_delay', _('Failover Delay'),
			_('Number of consecutive failed checks required before marking link as faulted (failover anti-flap).'));
		o.datatype = 'uinteger';
		o.default = '2';
		o.rmempty = false;

		// --- Monitored Targets Section ---
		s = m.section(form.GridSection, 'link', _('Monitored Links / Gateways'),
			_('Add and prioritize your links or next-hop gateways. Lower priority number means higher preference (e.g., 1 = primary, 2 = backup).'));
		s.anonymous = true;
		s.addremove = true;

		// Custom dynamic Modal title
		s.modaltitle = function(section_id) {
			var parent_title = _('LinkBack 链路守护') + ' - ' + _('Settings');
			var is_new = (this.map.addedSection === section_id) || !uci.get('linkback', section_id, 'name');
			if (is_new) {
				return parent_title + ' - ' + _('Add Monitored Target');
			} else {
				var name = uci.get('linkback', section_id, 'name') || section_id;
				return parent_title + ' - ' + _('Edit Monitored Target') + ' (' + name + ')';
			}
		};

		var origRemove = s.handleRemove;
		s.handleRemove = function(section_id, ev) {
			return origRemove.apply(this, arguments).then(function() {
				var enabled = uci.get('linkback', '@global[0]', 'enabled');
				if (enabled === '1') {
					var err = self._validateServiceConfig();
					if (err) {
						ui.addNotification(null, E('p',
							_('Service has been auto-disabled because the configuration is no longer valid: ') + err
						), 'warning');
						uci.set('linkback', '@global[0]', 'enabled', '0');
					}
				}
			});
		};

		// 1. Enabled
		o = s.option(form.Flag, 'enabled', _('Enabled'));
		o.default = '1';
		o.rmempty = false;
		makeTableColumnExpand(o, '8%');

		// 2. Name / Interface / Alias
		// In multi_wan mode, list available interfaces; in multi_gw mode, allow alias text
		if (current_mode === 'multi_gw') {
			o = s.option(form.Value, 'name', _('Gateway Name / Alias'),
				_('Descriptive alias for this gateway (e.g. Bypass_GW, Main_Router).'));
			o.rmempty = false;
			o.placeholder = 'Bypass_GW';
			makeTableColumnExpand(o, '20%');

			// 2b. Gateway IP
			o = s.option(form.Value, 'gateway', _('Gateway IP'),
				_('Next-hop IP address of this gateway (e.g. 192.168.1.254).'));
			o.datatype = 'ip4addr';
			o.rmempty = false;
			o.validate = function(section_id, value) {
				if (!value) return _('Gateway IP is required.');
				var self_opt = this;
				var conflict = false;
				uci.sections('linkback', 'link').forEach(function(sec) {
					var sid = sec['.name'];
					if (sid !== section_id) {
						var other_gw = self_opt.formvalue(sid) || uci.get('linkback', sid, 'gateway');
						if (other_gw && other_gw === value) {
							conflict = true;
						}
					}
				});
				if (conflict) {
					return _('Gateway IP %s is already used by another link.').format(value);
				}
				return true;
			};
			makeTableColumnExpand(o, '18%');
		} else {
			o = s.option(form.ListValue, 'name', _('Interface'));
			o.rmempty = false;

			var network_interfaces = {};
			uci.sections('network', 'interface').forEach(function(sec) {
				var n = sec['.name'];
				if (n !== 'loopback' && n !== 'lan') {
					network_interfaces[n] = true;
					o.value(n);
				}
			});

			uci.sections('linkback', 'link').forEach(function(sec) {
				if (sec.name && !network_interfaces[sec.name]) {
					o.value(sec.name, _('%s (configured)').format(sec.name));
				}
			});

			o.renderWidget = function(section_id, option_index, cfgvalue) {
				var used_names = {};
				uci.sections('linkback', 'link').forEach(function(sec) {
					if (sec['.name'] !== section_id && sec.name) {
						used_names[sec.name] = true;
					}
				});

				var filtered_choices = {};
				var filtered_keylist = [];
				if (Array.isArray(this.keylist)) {
					for (var i = 0; i < this.keylist.length; i++) {
						var key = this.keylist[i];
						if (!used_names[key]) {
							filtered_keylist.push(key);
							filtered_choices[key] = this.vallist[i];
						}
					}
				}

				var is_edit = !!uci.get('linkback', section_id, 'name');

				var widget = new ui.Select((cfgvalue != null) ? cfgvalue : this.default, filtered_choices, {
					id: this.cbid(section_id),
					size: this.size,
					sort: filtered_keylist,
					widget: this.widget,
					optional: this.optional,
					orientation: this.orientation,
					placeholder: this.placeholder,
					validate: (typeof(this.getValidator) === 'function') ? this.getValidator(section_id) : (this.validate ? this.validate.bind(this, section_id) : null),
					disabled: is_edit ? true : ((this.readonly != null) ? this.readonly : this.map.readonly)
				});

				return widget.render();
			};

			o.validate = function(section_id, value) {
				var added = false;
				uci.sections('linkback', 'link').forEach(function(sec) {
					if (sec['.name'] !== section_id && sec.name === value) {
						added = true;
					}
				});
				if (added) {
					return _('This interface has already been configured.');
				}
				return true;
			};
			makeTableColumnExpand(o, '25%');

			// In multi_wan mode, gateway is optional and usually auto-detected
			o = s.option(form.Value, 'gateway', _('Gateway (Optional)'),
				_('Leave empty for automatic detection via netifd.'));
			o.datatype = 'ip4addr';
			o.rmempty = true;
			o.modalonly = true;
		}

		// 3. Priority
		o = s.option(form.Value, 'priority', _('Priority'));
		o.datatype = 'uinteger';
		o.default = '1';
		o.rmempty = false;
		o.validate = function(section_id, value) {
			if (value == null || value === '') {
				return t_priority_empty;
			}
			var self_opt = this;
			var has_conflict = false;
			uci.sections('linkback', 'link').forEach(function(sec) {
				var sid = sec['.name'];
				if (sid !== section_id) {
					var other_val = self_opt.formvalue(sid);
					if (other_val == null || other_val === '') {
						other_val = uci.get('linkback', sid, 'priority');
					}
					if (other_val != null && other_val !== '' && String(other_val) === String(value)) {
						has_conflict = true;
					}
				}
			});
			if (has_conflict) {
				return t_priority_conflict.format(value);
			}
			return true;
		};
		makeTableColumnExpand(o, '12%');

		// 4. Metric (Read-only, generated from priority * 10)
		var metric_title = _('Base Metric');
		if (metric_title === '默认跃点 (Metric)') {
			metric_title = '默认跃点';
		}
		o = s.option(form.DummyValue, 'metric', metric_title);
		o.cfgvalue = function(section_id) {
			var prio = uci.get('linkback', section_id, 'priority');
			var prio_val = parseInt(prio, 10);
			if (isNaN(prio_val) || prio_val <= 0) {
				prio_val = 1;
			}
			return prio_val * 10;
		};
		makeTableColumnExpand(o, '12%');

		// 5. Dummy display option for Check Type in main Grid table (read-only)
		o = s.option(form.DummyValue, 'check_type_disp', _('Check Type'));
		o.modalonly = false;
		o.cfgvalue = function(section_id) {
			if (uci.get('linkback', section_id, 'ping_targets'))
				return _('Ping Probe');
			if (uci.get('linkback', section_id, 'dns_server'))
				return _('DNS Probe');
			if (uci.get('linkback', section_id, 'tcp_target'))
				return _('TCP Probe');
			return _('-- Not Configured --');
		};
		makeTableColumnExpand(o, '18%');

		// 6. Check Type Dropdown (Virtual field, Modal only)
		o = s.option(form.ListValue, 'check_type', _('Check Type'));
		o.value('ping', _('Ping Probe'));
		o.value('dns', _('DNS Probe'));
		o.value('tcp', _('TCP Probe'));
		o.default = 'ping';
		o.rmempty = false;
		o.modalonly = true;

		o.cfgvalue = function(section_id) {
			if (uci.get('linkback', section_id, 'ping_targets'))
				return 'ping';
			if (uci.get('linkback', section_id, 'dns_server'))
				return 'dns';
			if (uci.get('linkback', section_id, 'tcp_target'))
				return 'tcp';
			return 'ping';
		};

		o.write = function(section_id, value) {
			var current = uci.get('linkback', section_id, 'ping_targets') ? 'ping' :
			              (uci.get('linkback', section_id, 'dns_server') ? 'dns' :
			              (uci.get('linkback', section_id, 'tcp_target') ? 'tcp' : ''));
			var next = (value == null) ? 'ping' : String(value);

			if (next === current) {
				return;
			}

			uci.remove('linkback', section_id, 'weight_threshold');
			uci.remove('linkback', section_id, 'ping_weight');
			uci.remove('linkback', section_id, 'dns_weight');
			uci.remove('linkback', section_id, 'tcp_weight');

			if (current === 'ping' || current === '') {
				uci.remove('linkback', section_id, 'ping_targets');
			}
			if (current === 'dns' || current === '') {
				uci.remove('linkback', section_id, 'dns_server');
				uci.remove('linkback', section_id, 'dns_domain');
			}
			if (current === 'tcp' || current === '') {
				uci.remove('linkback', section_id, 'tcp_target');
				uci.remove('linkback', section_id, 'tcp_port');
			}
		};

		// 7. Ping Probe Parameters
		o = s.option(form.Value, 'ping_targets', _('Ping Targets'),
			_('Comma-separated list of IPs to ping (e.g., 223.5.5.5,8.8.8.8).'));
		o.rmempty = true;
		o.modalonly = true;
		o.depends('check_type', 'ping');
		o.validate = function(section_id, value) {
			if (!value) return true;
			var ips = value.replace(/\s+/g, '').split(',');
			for (var i = 0; i < ips.length; i++) {
				var ipPattern = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
				if (!ipPattern.test(ips[i])) {
					return _('Invalid IP address: "%s"').format(ips[i]);
				}
			}
			return true;
		};
		o.write = function(section_id, value) {
			if (value != null) {
				var cleaned = String(value).replace(/\s+/g, '');
				uci.set('linkback', section_id, 'ping_targets', cleaned);
			} else {
				uci.remove('linkback', section_id, 'ping_targets');
			}
		};

		// 8. DNS Probe Parameters
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

		// 9. TCP Probe Parameters
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

		// 10. Individual health check override options (Modal only)
		o = s.option(form.Value, 'check_interval', _('Check Interval (s)'),
			_('Time in seconds between each health check cycle for this link (leave empty to inherit global).'));
		o.datatype = 'uinteger';
		o.rmempty = true;
		o.modalonly = true;

		o = s.option(form.Value, 'check_timeout', _('Check Timeout (s)'),
			_('Maximum wait time in seconds for each probe for this link (leave empty to inherit global).'));
		o.datatype = 'uinteger';
		o.rmempty = true;
		o.modalonly = true;

		o = s.option(form.Value, 'recovery_delay', _('Recovery Delay'),
			_('Number of consecutive successful checks required before marking this link as healthy.'));
		o.datatype = 'uinteger';
		o.rmempty = true;
		o.modalonly = true;

		o = s.option(form.Value, 'failover_delay', _('Failover Delay'),
			_('Number of consecutive failed checks required before marking this link as faulted.'));
		o.datatype = 'uinteger';
		o.rmempty = true;
		o.modalonly = true;

		return m.render();
	}
});
