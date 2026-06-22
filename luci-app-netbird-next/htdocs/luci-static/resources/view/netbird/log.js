'use strict';
'require view';
'require rpc';
'require poll';

const callNetbirdLogs = rpc.declare({
    object: 'luci.netbird',
    method: 'get_logs',
    params: [ 'lines' ]
});

return view.extend({
    handleSaveApply: null,
    handleSave: null,
    handleReset: null,

    render: function() {
        const area = E('textarea', {
            id: 'netbird-log-content',
            style: 'width:100%; height:500px; background:#f4f4f4; color:#333; padding:10px; border:1px solid #ccc; border-radius:3px; font-family:monospace; font-size:12px; overflow-y:auto; white-space:pre-wrap; word-break:break-all; margin-top:10px;',
            readonly: 'readonly'
        }, _('Loading logs...'));

        poll.add(() => this.updateLogs(), 5);

        return E('div', { 'class': 'cbi-map' }, [
            E('h2', {}, _('NetBird') + ' - ' + _('Log')),
            E('div', { 'class': 'cbi-map-descr' }, _('Inspect and stream the local NetBird daemon service logs. Synchronized topology updates, WireGuard link configurations, and peer events are shown below.')),
            E('fieldset', { 'class': 'cbi-section' }, [
                E('legend', {}, _('Logs')),
                E('div', { 'class': 'cbi-section-node' }, area)
            ])
        ]);
    },

    updateLogs: function() {
        return callNetbirdLogs(100).then(res => {
            let area = document.getElementById('netbird-log-content');
            if (area) {
                area.value = res.logs || _('No logs available.');
                area.scrollTop = area.scrollHeight;
            }
        });
    }
});
