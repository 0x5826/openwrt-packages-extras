'use strict';
'require view';
'require form';
'require uci';
'require rpc';

const callNetbirdStatus = rpc.declare({
    object: 'luci.netbird',
    method: 'get_status'
});

return view.extend({
    load: function() {
        return callNetbirdStatus();
    },

    render: function(data) {
        let m, s, o;
        const identityExists = data?.config?.identity_exists || false;

        m = new form.Map('netbird', _('NetBird') + ' - ' + _('Settings'), 
            _('Configure your NetBird daemon connection variables. Fill in your Setup Key or bind to your custom Self-Hosted coordination management URL to register the router.'));

        s = m.section(form.TypedSection, 'netbird', _('Global Settings'));
        s.anonymous = true;

        o = s.option(form.Flag, 'enabled', _('Enabled'), _('Enable the NetBird service.'));
        o.rmempty = false;

        o = s.option(form.Value, 'setup_key', _('Setup Key'), _('Setup key for automatic registration.'));
        o.password = true;
        o.validate = function(section_id, value) {
            let enabled = m.lookupOption('enabled', section_id)[0].formvalue(section_id);
            if (enabled === '1') {
                if (!value && !identityExists) {
                    return _('A Setup Key is required to enable the service for the first time.');
                }
            }
            return true;
        };

        o = s.option(form.Value, 'management_url', _('Management URL'), _('Custom management server URL (leave blank for official).'));
        o.placeholder = 'https://api.netbird.io';

        o = s.option(form.Value, 'admin_url', _('Admin Panel URL'), _('Quick link to your NetBird admin console.'));
        o.placeholder = 'https://app.netbird.io/';

        o = s.option(form.Flag, 'exit_node', _('Exit Node'), _('Allow this device to act as an exit node.'));
        o.default = '0';

        o = s.option(form.Value, 'wireguard_port', _('WireGuard Port'), _('The UDP port used for WireGuard P2P connections.'));
        o.datatype = 'port';
        o.default = '51820';

        o = s.option(form.Flag, 'open_wan_port', _('Open WAN Port'), _('Automatically open the specified UDP port on the WAN interface for P2P connection.'));
        o.default = '0';

        o = s.option(form.Flag, 'cleanup_config', _('Cleanup Config'), _('Automatically delete the generated network interface and firewall settings when the service is stopped.'));
        o.default = '0';

        o = s.option(form.Flag, 'masq', _('Masquerade'), _('Enable Source NAT (masquerade) on the NetBird interface. Useful if remote subnet routing requires NAT or is not aware of local LAN routes.'));
        o.default = '1';

        o = s.option(form.ListValue, 'log_level', _('Log Level'), _('Control the verbosity of the NetBird service logs.'));
        o.value('debug', _('Debug'));
        o.value('info', _('Info'));
        o.value('warn', _('Warn (Recommended)'));
        o.value('error', _('Error'));
        o.default = 'warn';

        return m.render();
    }
});
