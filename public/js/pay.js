(function () {
  var toast = document.getElementById('toast');
  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg || 'Copied ✅';
    toast.classList.add('show');
    setTimeout(function () { toast.classList.remove('show'); }, 1400);
  }
  document.querySelectorAll('.copy-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      var val = b.getAttribute('data-copy');
      if (navigator.clipboard) navigator.clipboard.writeText(val).then(function () { showToast(); });
      else {
        var t = document.createElement('textarea'); t.value = val; document.body.appendChild(t);
        t.select(); try { document.execCommand('copy'); } catch (e) {} document.body.removeChild(t); showToast();
      }
    });
  });

  var el = document.querySelector('[data-poll]');
  if (!el) return;
  var url = el.getAttribute('data-poll');
  var status = el.getAttribute('data-status');
  var expires = el.getAttribute('data-expires');
  var active = (el.getAttribute('data-active') || '').split(',');

  var cd = document.getElementById('countdown');
  if (cd && expires) {
    var end = Date.parse(expires.replace(' ', 'T') + 'Z');
    var tick = setInterval(function () {
      var diff = end - Date.now();
      if (diff <= 0) { clearInterval(tick); cd.textContent = '(expiring…)'; return; }
      var m = Math.floor(diff / 60000), s = Math.floor((diff % 60000) / 1000);
      cd.textContent = '(' + m + ':' + (s < 10 ? '0' : '') + s + ')';
    }, 1000);
  }

  if (active.indexOf(status) === -1) return;
  var poll = setInterval(function () {
    fetch(url, { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (d && d.status && d.status !== status) { clearInterval(poll); location.reload(); } })
      .catch(function () {});
  }, 6000);
})();
