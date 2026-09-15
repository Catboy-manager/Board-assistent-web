'use strict';

(function () {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    setTimeout(() => Notification.requestPermission(), 2000);
  }
})();