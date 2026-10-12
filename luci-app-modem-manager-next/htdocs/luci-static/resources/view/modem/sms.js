'use strict';
'require view';
'require rpc';
'require ui';

const callGetDevices = rpc.declare({
	object: 'luci.modem',
	method: 'get_devices',
	expect: { devices: [] }
});

const callGetConfig = rpc.declare({
	object: 'luci.modem',
	method: 'get_config',
	expect: { port: '', baud: '115200' }
});

const callGetSmsStatus = rpc.declare({
	object: 'luci.modem',
	method: 'get_sms_status',
	params: [ 'port' ]
});

const callSetSmsEnable = rpc.declare({
	object: 'luci.modem',
	method: 'set_sms_enable',
	params: [ 'enabled', 'port' ]
});

const callGetSmsList = rpc.declare({
	object: 'luci.modem',
	method: 'get_sms_list',
	params: [ 'port' ]
});

const callSendSms = rpc.declare({
	object: 'luci.modem',
	method: 'send_sms',
	params: [ 'port', 'recipient', 'message' ]
});

const callDeleteSms = rpc.declare({
	object: 'luci.modem',
	method: 'delete_sms',
	params: [ 'port', 'index' ]
});

return view.extend({
	handleSaveApply: null,
	handleSave: null,
	handleReset: null,

	selectedPort: null,
	devicesList: [],
	smsEnabled: false,
	smsCapacity: { used: 0, total: 0 },
	smsList: [],

	load: function() {
		const self = this;
		return Promise.all([
			L.resolveDefault(callGetDevices(), []),
			L.resolveDefault(callGetConfig(), {})
		]).then(function(results) {
			const devicesData = results[0];
			const configData = results[1] || {};
			let list = [];
			if (Array.isArray(devicesData)) {
				list = devicesData;
			} else if (devicesData && Array.isArray(devicesData.devices)) {
				list = devicesData.devices;
			}
			self.devicesList = list;

			if (self.devicesList.length > 0) {
				self.selectedPort = configData.port || self.devicesList[0].primary_port;
			} else {
				self.selectedPort = null;
			}

			if (!self.selectedPort) {
				self.smsEnabled = false;
				self.smsCapacity = { used: 0, total: 0 };
				self.smsList = [];
				return Promise.resolve();
			}

			return callGetSmsStatus(self.selectedPort).then(function(statusRes) {
				self.smsEnabled = !!(statusRes && statusRes.enabled);
				self.smsCapacity = {
					used: statusRes?.used || 0,
					total: statusRes?.total || 0
				};

				if (self.smsEnabled) {
					return callGetSmsList(self.selectedPort).then(function(listRes) {
						self.smsList = (listRes && listRes.messages) ? listRes.messages : [];
					}).catch(function() {
						self.smsList = [];
					});
				} else {
					self.smsList = [];
					return Promise.resolve();
				}
			}).catch(function() {
				self.smsEnabled = false;
				self.smsCapacity = { used: 0, total: 0 };
				self.smsList = [];
				return Promise.resolve();
			});
		}).catch(function() {
			self.devicesList = [];
			self.selectedPort = null;
			self.smsEnabled = false;
			self.smsCapacity = { used: 0, total: 0 };
			self.smsList = [];
			return Promise.resolve();
		});
	},

	renderSmsState: function() {
		const self = this;
		const mainArea = document.getElementById('sms_main_content');
		if (!mainArea) return;

		while (mainArea.firstChild) {
			mainArea.removeChild(mainArea.firstChild);
		}

		if (!self.smsEnabled) {
			// Disabled state: safety notice card
			const disabledCard = E('div', {
				'style': 'background: #fff; border: 1px solid #e1e4e8; border-radius: 6px; padding: 30px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.05); margin-top: 15px;'
			}, [
				E('div', { 'style': 'font-size: 18px; font-weight: bold; color: #333; margin-bottom: 12px;' }, _('SMS Feature is Currently Disabled')),
				E('div', {
					'style': 'max-width: 680px; margin: 0 auto 24px auto; color: #555; line-height: 1.6; font-size: 14px;'
				}, _('To prevent IoT SIM cards, enterprise telemetry cards, or data-only SIM cards from unexpected billing, network carrier account suspensions, or serial AT buffer deadlocks, the SMS module is disabled by default. In this mode, no background polling or SMS commands will ever touch the cellular modem.')),
				E('div', { 'style': 'display: flex; justify-content: center; gap: 15px;' }, [
					E('button', {
						'class': 'btn cbi-button cbi-button-action',
						'style': 'min-width: 180px; font-weight: bold;',
						'click': function() {
							self.handleToggleSms(true);
						}
					}, _('Enable SMS Feature'))
				])
			]);
			mainArea.appendChild(disabledCard);
			return;
		}

		// Enabled state
		const toolbar = E('div', {
			'style': 'display: flex; justify-content: space-between; align-items: center; background: #fff; border: 1px solid #e1e4e8; border-radius: 6px; padding: 15px 20px; margin-top: 15px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);'
		}, [
			E('div', { 'style': 'display: flex; align-items: center; gap: 20px;' }, [
				E('div', {}, [
					E('span', { 'style': 'color: #333; font-size: 13px;' }, _('SIM Card Storage Capacity: ')),
					E('strong', { 'style': 'color: #333; font-size: 14px;' },
						self.smsCapacity.total > 0 ? (self.smsCapacity.used + ' / ' + self.smsCapacity.total + ' ' + _('Messages')) : (self.smsList.length + ' ' + _('Messages')))
				]),
				E('span', {
					'style': 'background: #e6ffed; color: #22863a; border: 1px solid #bef5cb; padding: 2px 8px; border-radius: 12px; font-size: 12px;'
				}, _('Module Active'))
			]),
			E('div', { 'style': 'display: flex; gap: 10px;' }, [
				E('button', {
					'class': 'btn cbi-button cbi-button-save',
					'click': function() {
						self.handleOpenSendModal();
					}
				}, _('Compose Message')),
				E('button', {
					'class': 'btn cbi-button cbi-button-action',
					'click': function() {
						self.handleRefreshList();
					}
				}, _('Refresh List')),
				E('button', {
					'class': 'btn cbi-button cbi-button-reset',
					'click': function() {
						self.handleClearAll();
					}
				}, _('Clear All')),
				E('button', {
					'class': 'btn cbi-button cbi-button-neutral',
					'style': 'color: #d73a49;',
					'click': function() {
						self.handleToggleSms(false);
					}
				}, _('Disable Feature'))
			])
		]);
		mainArea.appendChild(toolbar);

		// SMS Message List
		const listContainer = E('div', { 'style': 'margin-top: 15px;' });

		if (!self.smsList || self.smsList.length === 0) {
			listContainer.appendChild(E('div', {
				'style': 'background: #fff; border: 1px dashed #d1d5db; border-radius: 6px; padding: 40px; text-align: center; color: #888;'
			}, _('Inbox is empty. No messages stored on SIM card.')));
		} else {
			self.smsList.forEach(function(item) {
				const isUnread = (item.status && item.status.indexOf('UNREAD') !== -1);
				const card = E('div', {
					'style': 'background: #fff; border: 1px solid #e1e4e8; border-left: 4px solid ' + (isUnread ? '#0366d6' : '#28a745') + '; border-radius: 4px; padding: 15px 20px; margin-bottom: 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.04);'
				}, [
					E('div', { 'style': 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;' }, [
						E('div', { 'style': 'display: flex; align-items: center; gap: 10px;' }, [
							E('strong', { 'style': 'font-size: 15px; color: #24292e;' }, item.sender || _('Unknown Sender')),
							E('span', {
								'style': 'font-size: 11px; padding: 1px 6px; border-radius: 10px; background: ' + (isUnread ? '#dbedff; color: #0366d6;' : '#f1f8ff; color: #586069;')
							}, isUnread ? _('Unread') : _('Read')),
							E('span', { 'style': 'font-size: 11px; color: #999;' }, '#' + item.index)
						]),
						E('div', { 'style': 'color: #888; font-size: 12px;' }, item.time || '')
					]),
					E('div', {
						'style': 'color: #333; font-size: 14px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; margin: 10px 0; background: #fafbfc; padding: 10px 12px; border-radius: 4px;'
					}, item.content || _('[Empty Message Body]')),
					E('div', { 'style': 'display: flex; justify-content: flex-end; gap: 10px; margin-top: 8px;' }, [
						E('button', {
							'class': 'btn cbi-button cbi-button-action',
							'style': 'font-size: 12px;',
							'click': function() {
								self.handleOpenSendModal(item.sender);
							}
						}, _('Reply')),
						E('button', {
							'class': 'btn cbi-button cbi-button-reset',
							'style': 'font-size: 12px;',
							'click': function() {
								self.handleDeleteSingle(item.index);
							}
						}, _('Delete'))
					])
				]);
				listContainer.appendChild(card);
			});
		}

		mainArea.appendChild(listContainer);
	},

	handleToggleSms: function(enable) {
		const self = this;
		const actionTitle = enable ? _('Enable SMS Feature') : _('Disable SMS Feature');
		const actionText = enable ?
			_('Enabling SMS allows sending, receiving, and reading messages. Ensure your SIM card plan supports SMS traffic.') :
			_('Disabling SMS stops all SMS-related interactions and returns the cellular modem to pure data safety mode.');

		ui.showModal(actionTitle, [
			E('p', {}, actionText),
			E('div', { 'class': 'cbi-page-actions' }, [
				E('button', {
					'class': 'btn cbi-button cbi-button-neutral',
					'click': ui.hideModal
				}, _('Cancel')),
				E('button', {
					'class': 'btn cbi-button ' + (enable ? 'cbi-button-save' : 'cbi-button-reset'),
					'click': function() {
						ui.showModal(actionTitle, [
							E('p', { 'class': 'spinning' }, _('Updating configuration, please wait...'))
						]);
						callSetSmsEnable(!!enable, self.selectedPort).then(function(res) {
							self.smsEnabled = !!(res && (res.enabled || res.success));
							if (self.smsEnabled) {
								return Promise.all([
									callGetSmsStatus(self.selectedPort),
									callGetSmsList(self.selectedPort)
								]).then(function(datas) {
									const st = datas[0] || {};
									const ls = datas[1] || {};
									self.smsCapacity = { used: st.used || 0, total: st.total || 0 };
									self.smsList = (ls && Array.isArray(ls.messages)) ? ls.messages : [];
									ui.hideModal();
									self.renderSmsState();
								});
							} else {
								self.smsList = [];
								self.smsCapacity = { used: 0, total: 0 };
								ui.hideModal();
								self.renderSmsState();
							}
						}).catch(function(err) {
							ui.hideModal();
							ui.addNotification(null, E('p', {}, _('Failed to toggle SMS state: ') + err.message), 'error');
						});
					}
				}, _('Confirm'))
			])
		]);
	},

	handleRefreshList: function() {
		const self = this;
		if (!self.selectedPort) {
			self.renderSmsState();
			return;
		}
		ui.showModal(_('Refreshing Messages'), [
			E('p', { 'class': 'spinning' }, _('Reading SMS inbox from SIM card, please wait...'))
		]);

		Promise.all([
			callGetSmsStatus(self.selectedPort),
			callGetSmsList(self.selectedPort)
		]).then(function(results) {
			const st = results[0] || {};
			const ls = results[1] || {};
			self.smsCapacity = { used: st.used || 0, total: st.total || 0 };
			self.smsList = (ls && Array.isArray(ls.messages)) ? ls.messages : [];
			ui.hideModal();
			self.renderSmsState();
			ui.addNotification(null, E('p', {}, _('SMS list refreshed successfully.')), 'info');
		}).catch(function(err) {
			ui.hideModal();
			ui.addNotification(null, E('p', {}, _('Failed to refresh SMS list: ') + err.message), 'error');
		});
	},

	handleOpenSendModal: function(prefillRecipient) {
		const self = this;
		const recipientInput = E('input', {
			'type': 'text',
			'class': 'cbi-input-text',
			'style': 'width: 100%; box-sizing: border-box; padding: 7px 10px; font-family: monospace;',
			'placeholder': _('Target phone number, e.g. 10086 or +8613800000000'),
			'value': prefillRecipient || ''
		});

		const charCountEl = E('span', { 'style': 'color: #888; font-size: 12px;' }, '0 ' + _('characters'));

		const messageInput = E('textarea', {
			'class': 'cbi-input-textarea',
			'style': 'width: 100%; height: 130px; box-sizing: border-box; padding: 8px 10px; font-family: sans-serif; resize: vertical;',
			'placeholder': _('Enter SMS message content...'),
			'input': function(ev) {
				charCountEl.textContent = ev.target.value.length + ' ' + _('characters');
			}
		});

		const formContainer = E('div', {
			'style': 'min-width: 520px; max-width: 100%; box-sizing: border-box; padding: 4px 0;'
		}, [
			E('div', { 'style': 'margin-bottom: 16px;' }, [
				E('label', {
					'style': 'display: block; font-weight: bold; margin-bottom: 6px; color: #333; font-size: 13px;'
				}, _('Recipient Phone Number')),
				recipientInput
			]),
			E('div', { 'style': 'margin-bottom: 16px;' }, [
				E('div', {
					'style': 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;'
				}, [
					E('label', {
						'style': 'display: block; font-weight: bold; color: #333; font-size: 13px;'
					}, _('Message Content')),
					charCountEl
				]),
				messageInput
			]),
			E('div', {
				'style': 'display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; padding-top: 15px; border-top: 1px solid #e1e4e8;'
			}, [
				E('button', {
					'class': 'btn cbi-button cbi-button-neutral',
					'click': ui.hideModal
				}, _('Cancel')),
				E('button', {
					'class': 'btn cbi-button cbi-button-save',
					'click': function() {
						const to = recipientInput.value.trim();
						const text = messageInput.value.trim();
						if (!to) {
							ui.addNotification(null, E('p', {}, _('Please specify a valid recipient phone number.')), 'error');
							return;
						}
						if (!text) {
							ui.addNotification(null, E('p', {}, _('Message content cannot be empty.')), 'error');
							return;
						}

						ui.showModal(_('Sending Message'), [
							E('p', { 'class': 'spinning' }, _('Transmitting SMS message over cellular radio, please wait...'))
						]);

						callSendSms(self.selectedPort, to, text).then(function(res) {
							ui.hideModal();
							if (res && res.success) {
								ui.addNotification(null, E('p', {}, _('Message transmitted successfully.')), 'info');
								self.handleRefreshList();
							} else {
								ui.addNotification(null, E('p', {}, _('Failed to transmit message: ') + (res?.output || _('Unknown cellular error'))), 'error');
							}
						}).catch(function(err) {
							ui.hideModal();
							ui.addNotification(null, E('p', {}, _('Failed to transmit message: ') + err.message), 'error');
						});
					}
				}, _('Send'))
			])
		]);

		ui.showModal(_('Compose Message'), [ formContainer ]);
	},

	handleDeleteSingle: function(index) {
		const self = this;
		ui.showModal(_('Delete Message'), [
			E('p', {}, _('Are you sure you want to delete message #') + index + '?'),
			E('div', { 'class': 'cbi-page-actions' }, [
				E('button', {
					'class': 'btn cbi-button cbi-button-neutral',
					'click': ui.hideModal
				}, _('Cancel')),
				E('button', {
					'class': 'btn cbi-button cbi-button-reset',
					'click': function() {
						ui.showModal(_('Deleting Message'), [
							E('p', { 'class': 'spinning' }, _('Deleting message, please wait...'))
						]);
						callDeleteSms(self.selectedPort, index).then(function(res) {
							ui.hideModal();
							if (res && res.success) {
								ui.addNotification(null, E('p', {}, _('Message deleted successfully.')), 'info');
								self.handleRefreshList();
							} else {
								ui.addNotification(null, E('p', {}, _('Failed to delete message: ') + (res?.output || _('Unknown error'))), 'error');
							}
						}).catch(function(err) {
							ui.hideModal();
							ui.addNotification(null, E('p', {}, _('Failed to delete message: ') + err.message), 'error');
						});
					}
				}, _('Delete'))
			])
		]);
	},

	handleClearAll: function() {
		const self = this;
		ui.showModal(_('Clear All Messages'), [
			E('p', {}, _('Are you sure you want to clear all SMS messages stored on the SIM card? This action cannot be undone.')),
			E('div', { 'class': 'cbi-page-actions' }, [
				E('button', {
					'class': 'btn cbi-button cbi-button-neutral',
					'click': ui.hideModal
				}, _('Cancel')),
				E('button', {
					'class': 'btn cbi-button cbi-button-reset',
					'click': function() {
						ui.showModal(_('Clearing Messages'), [
							E('p', { 'class': 'spinning' }, _('Clearing all SMS messages, please wait...'))
						]);
						callDeleteSms(self.selectedPort, 'all').then(function(res) {
							ui.hideModal();
							if (res && res.success) {
								ui.addNotification(null, E('p', {}, _('All SMS messages cleared successfully.')), 'info');
								self.handleRefreshList();
							} else {
								ui.addNotification(null, E('p', {}, _('Failed to clear messages: ') + (res?.output || _('Unknown error'))), 'error');
							}
						}).catch(function(err) {
							ui.hideModal();
							ui.addNotification(null, E('p', {}, _('Failed to clear messages: ') + err.message), 'error');
						});
					}
				}, _('Confirm Clear'))
			])
		]);
	},

	render: function() {
		const self = this;

		const container = E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, _('Cellular Modem Manager') + ' - ' + _('SMS Management')),
			E('div', { 'class': 'cbi-map-descr' }, _('Read, compose, and manage cellular SMS messages stored on the SIM card.'))
		]);

		if (self.devicesList.length === 0) {
			container.appendChild(E('div', { 'class': 'alert-message warning', 'style': 'margin-top: 15px; padding: 15px; border-left: 5px solid #ff9800; background: #fff8e1;' }, [
				E('h4', { 'style': 'margin: 0 0 8px 0; color: #d32f2f;' }, _('No Cellular Modem Detected')),
				E('p', { 'style': 'margin: 0; color: #555;' }, _('No active cellular modem detected. Unable to manage SMS messages. Please check physical connection.'))
			]));
			return container;
		}

		// Dynamic SMS content container
		const mainArea = E('div', { 'id': 'sms_main_content' });
		container.appendChild(mainArea);

		// Initial render after DOM is mounted
		setTimeout(function() {
			self.renderSmsState();
		}, 0);

		return container;
	}
});
