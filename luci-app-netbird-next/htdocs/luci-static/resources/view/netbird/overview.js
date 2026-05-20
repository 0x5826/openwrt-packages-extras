'use strict';
'require view';
'require rpc';
'require poll';
'require ui';

const callNetbirdStatus = rpc.declare({
    object: 'luci.netbird',
    method: 'get_status'
});

return view.extend({
    handleSaveApply: null,
    handleSave: null,
    handleReset: null,

    load: function() {
        return callNetbirdStatus();
    },

    render: function(data) {
        let status = data.status || {};
        let config = data.config || {};
        
        let isConnected = (status.daemonStatus === 'Connected' || status.status === 'Connected' || status.connected === true);
        let isConnecting = (status.daemonStatus === 'Connecting' || status.status === 'Connecting');
        let isKeyMissing = (!config.setup_key && !config.identity_exists);

        let container = E('div', { 'class': 'cbi-map' }, [
            E('h2', {}, _('NetBird Overview')),
            E('div', { 'class': 'cbi-map-descr' }, _('NetBird is an open-source VPN management platform built on top of WireGuard, making it easy to create secure private networks.'))
        ]);

        // Section 1: Service Status
        let statusText = _('Disconnected');
        let statusColor = 'red';
        
        if (isConnected) {
            statusText = _('Connected');
            statusColor = 'green';
        } else if (isConnecting) {
            statusText = _('Connecting') + '...';
            statusColor = 'orange';
        } else if (isKeyMissing) {
            statusText = _('Installation Key Not Configured');
            statusColor = 'red';
        }

        let serviceSection = E('div', { 'class': 'cbi-section' }, [
            E('h3', { 'class': 'cbi-section-title' }, _('Service Status')),
            E('div', { 'class': 'cbi-section-node' }, [
                E('div', { 'class': 'cbi-value' }, [
                    E('label', { 'class': 'cbi-value-title' }, _('Status')),
                    E('div', { 'class': 'cbi-value-field' }, [
                        E('span', { 
                            'id': 'netbird-status-text', 
                            'class': 'bold',
                            'style': 'color:' + statusColor
                        }, statusText)
                    ])
                ]),
                E('div', { 'class': 'cbi-value' }, [
                    E('label', { 'class': 'cbi-value-title' }, _('Version')),
                    E('div', { 'class': 'cbi-value-field' }, [
                        E('span', { 'id': 'netbird-version' }, (status.daemon_version || status.cli_version) ? (status.daemon_version || status.cli_version) : '-')
                    ])
                ])
            ])
        ]);
        container.appendChild(serviceSection);

        // Section 2: Help/Login (Conditional)
        let loginHelp = E('div', { 'class': 'cbi-section', 'id': 'netbird-login-help', 'style': (isConnected || isConnecting) ? 'display:none' : '' }, [
            E('div', { 'class': 'cbi-section-node' }, [
                E('div', { 'class': 'cbi-value' }, [
                    E('div', { 'class': 'cbi-section-descr' }, [
                        isKeyMissing ? _('Please configure a Setup Key in the Settings page to register this device.') :
                        _('NetBird is not connected. Please ensure you have configured a valid Setup Key in the Settings page and the service is enabled.')
                    ])
                ])
            ])
        ]);
        container.appendChild(loginHelp);

        // Section 3: Local Info (Conditional)
        let infoSection = E('div', { 'class': 'cbi-section', 'id': 'netbird-info-section', 'style': (isConnected || isConnecting) ? '' : 'display:none' }, [
            E('h3', { 'class': 'cbi-section-title' }, _('Local Information')),
            E('div', { 'class': 'cbi-section-node' }, [
                E('div', { 'class': 'cbi-value' }, [
                    E('label', { 'class': 'cbi-value-title' }, _('Interface IP')),
                    E('div', { 'class': 'cbi-value-field' }, [
                        E('span', { 'id': 'netbird-local-ip' }, status.netbirdIp || status.local_ip || '-')
                    ])
                ]),
                E('div', { 'class': 'cbi-value' }, [
                    E('label', { 'class': 'cbi-value-title' }, _('Host Name')),
                    E('div', { 'class': 'cbi-value-field' }, [
                        E('span', { 'id': 'netbird-hostname' }, status.fqdn || status.hostname || '-')
                    ])
                ])
            ])
        ]);
        container.appendChild(infoSection);

        // Section 4: Peers Table (Conditional)
        let peersSection = E('div', { 'class': 'cbi-section', 'id': 'netbird-peers-section', 'style': isConnected ? '' : 'display:none' }, [
            E('h3', { 'class': 'cbi-section-title' }, _('Network Nodes')),
            E('div', { 'class': 'cbi-section-node' }, [
                E('table', { 'class': 'table cbi-section-table', 'id': 'netbird-peers-table' }, [
                    E('tr', { 'class': 'tr table-titles' }, [
                        E('th', { 'class': 'th' }, _('Name')),
                        E('th', { 'class': 'th' }, _('Virtual IP')),
                        E('th', { 'class': 'th' }, _('Status')),
                        E('th', { 'class': 'th' }, _('Connection Type')),
                        E('th', { 'class': 'th' }, _('Last Online'))
                    ])
                ])
            ])
        ]);
        container.appendChild(peersSection);

        // Polling logic
        poll.add(() => {
            return callNetbirdStatus().then(res => {
                let s = res.status || {};
                let c = res.config || {};
                let connected = (s.daemonStatus === 'Connected' || s.status === 'Connected' || s.connected === true);
                let connecting = (s.daemonStatus === 'Connecting' || s.status === 'Connecting');
                let keyMissing = (!c.setup_key && !c.identity_exists);
                
                let statusTextNode = document.getElementById('netbird-status-text');
                if (statusTextNode) {
                    let text = _('Disconnected');
                    let color = 'red';
                    if (connected) {
                        text = _('Connected');
                        color = 'green';
                    } else if (connecting) {
                        text = _('Connecting') + '...';
                        color = 'orange';
                    } else if (keyMissing) {
                        text = _('Installation Key Not Configured');
                        color = 'red';
                    }
                    statusTextNode.textContent = text;
                    statusTextNode.style.color = color;
                }

                let versionText = document.getElementById('netbird-version');
                if (versionText) {
                    versionText.textContent = (s.daemon_version || s.cli_version) ? (s.daemon_version || s.cli_version) : '-';
                }

                document.getElementById('netbird-login-help').style.display = (connected || connecting) ? 'none' : '';
                document.getElementById('netbird-info-section').style.display = (connected || connecting) ? '' : 'none';
                document.getElementById('netbird-peers-section').style.display = connected ? '' : 'none';
                
                if (connected) {
                    let lip = document.getElementById('netbird-local-ip');
                    let hname = document.getElementById('netbird-hostname');
                    if (lip) lip.textContent = s.netbirdIp || s.local_ip || '-';
                    if (hname) hname.textContent = s.fqdn || s.hostname || '-';

                    let table = document.getElementById('netbird-peers-table');
                    if (table) {
                        while (table.rows.length > 1) table.deleteRow(1);

                        let peers = [];
                        if (s.peers && s.peers.details) {
                            peers = s.peers.details;
                        } else if (Array.isArray(s.peers)) {
                            peers = s.peers;
                        }

                        if (peers.length > 0) {
                            peers.forEach(peer => {
                                if (!peer) return;
                                let peerIp = peer.netbirdIp || peer.ip;
                                if (!peerIp) return;

                                let row = table.insertRow(-1);
                                row.className = 'tr';
                                row.insertCell(0).textContent = peer.fqdn || peer.hostname || peer.name || _('Unknown');
                                row.insertCell(1).textContent = peerIp;
                                row.insertCell(2).textContent = peer.status || _('Unknown');
                                row.insertCell(3).textContent = peer.connectionType || '-';

                                let lastOnline = peer.lastStatusUpdate || peer.last_online || _('Never');
                                if (lastOnline && lastOnline !== _('Never') && lastOnline.includes('T')) {
                                    try {
                                        lastOnline = new Date(lastOnline).toLocaleString();
                                    } catch (e) {}
                                }
                                row.insertCell(4).textContent = lastOnline;
                            });
                        }
                    }
                }
            });
        }, 5);

        return container;
    }
});
