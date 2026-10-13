(function () {
  async function speakDone() {
    try {
      await fetch('/api/smart/cmd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Станция', cmd: 'say', text: 'закончил' })
      });
    } catch (e) {}
  }
  window.SMART_BRIDGE = { speakDone };
})();
