/* RU registration/login bridge for private preview and GitHub Pages. */
/* beautyRuUnknownDeviceLogin_v1 */
(() => {
  'use strict';
  const inPreview = location.pathname.startsWith('/__preview/');
  const SESSION_KEY = 'beauty_ru_bearer_session_v1';
  const API_ORIGIN = 'https://beautymaster-ru.duckdns.org';
  const KEY = 'beauty_ru_signup_pending_preview_v2'; // preserve old signup state
  const ACCOUNT_KEY = 'beauty_ru_cached_account_v1';
  const DATA_CACHE_KEY = 'manicureAppData_v1_ru_v898';
  const $ = id => document.getElementById(id);
  let busy = false;
  const form = $('registerForm');
  const codePanel = $('nailoraDiscoverCodePanel');
  const codeHome = codePanel.parentElement;
  const codeNextSibling = codePanel.nextSibling;
  const codeNote = codePanel.querySelector('p');
  const defaultCodeNote = codeNote.textContent;
  const finishButton = $('nailoraDiscoverFinish');
  const repeatButton = $('nailoraDiscoverCancel');
  const defaultFinishText = finishButton.textContent;
  const defaultRepeatText = repeatButton.textContent;
  const defaultRegisterText = $('createProfileButton').textContent;
  const hiddenBeforeCode = new WeakMap();

  function pending() {
    try {
      const p = JSON.parse(sessionStorage.getItem(KEY) || 'null');
      if (!p || !p.email || !p.profile || !['master','client'].includes(p.role)) return null;
      if (!Number.isFinite(p.createdAt) || Date.now() - p.createdAt > 86400000) return null;
      return p;
    } catch (_) { return null; }
  }
  function savePending(p) { sessionStorage.setItem(KEY, JSON.stringify(p)); }
  function setNote(message) { codeNote.textContent = message; }
  function resetRegistrationView() {
    for (const el of Array.from(form.children)) {
      if (el !== codePanel && hiddenBeforeCode.has(el))
        el.classList.toggle('hidden', hiddenBeforeCode.get(el));
    }
    codePanel.classList.add('hidden');
    if (codePanel.parentElement !== codeHome) codeHome.insertBefore(codePanel, codeNextSibling);
    finishButton.textContent = defaultFinishText;
    repeatButton.textContent = defaultRepeatText;
    repeatButton.classList.remove('hidden');
    codeNote.textContent = defaultCodeNote;
    $('createProfileButton').textContent = defaultRegisterText;
  }
  function fillPreviousFields(p) {
    const map = {
      regEmail: p.email, regName: p.profile.name || '', regPhone: p.profile.phone || '',
      regCountry: 'Россия', regCity: p.profile.city || '', regArea: p.profile.area || '',
      regAddress: p.profile.address || '', regSpecialty: p.profile.specialty || ''
    };
    for (const [id, value] of Object.entries(map)) if ($(id)) $(id).value = value;
    if ($('regActivityDirection')) $('regActivityDirection').value = p.profile.activityDirection || $('regActivityDirection').value;
    if ($('regPublicPhoneConsent')) $('regPublicPhoneConsent').checked = p.profile.publicPhoneConsent === true;
    chosenRole = p.role;
    selectedEntryRole = p.role;
  }
  function displayCode(p) {
    beginRegistration(p.role);
    fillPreviousFields(p);
    if (codePanel.parentElement !== form) form.prepend(codePanel);
    for (const el of Array.from(form.children)) {
      if (el !== codePanel) {
        if (!hiddenBeforeCode.has(el)) hiddenBeforeCode.set(el, el.classList.contains('hidden'));
        el.classList.add('hidden');
      }
    }
    codePanel.classList.remove('hidden');
    finishButton.textContent = p.verified ? 'Продолжить' : defaultFinishText;
    repeatButton.textContent = 'Отправить код ещё раз';
    repeatButton.classList.toggle('hidden', p.verified);
    $('registerTitle').textContent = 'Подтверждение электронной почты';
    setNote(p.verified
      ? 'Почта подтверждена. Завершаю создание профиля…'
      : 'Введи восьмизначный код, который пришёл на почту.');
    showOnly('register');
    if (!p.verified) $('nailoraDiscoverCode').focus();
  }
  function alreadyVerifiedView(p) {
    resetRegistrationView();
    beginRegistration(p.role);
    fillPreviousFields(p);
    $('regPassword').value = '';
    $('registerTitle').textContent = 'Завершение регистрации';
    $('createProfileButton').textContent = 'Открыть профиль';
    $('registerStatus').textContent =
      'Почта уже подтверждена. Введи пароль один раз, чтобы завершить регистрацию.';
    showOnly('register');
  }
  async function api(path, method = 'POST', body) {
    const url = inPreview
      ? '/__preview/api/v1/' + path
      : API_ORIGIN + '/v1/' + path;
    const bearer = !inPreview ? sessionStorage.getItem(SESSION_KEY) : null;
    const headers = {
      Accept: 'application/json',
      ...(body === undefined ? {} : {'Content-Type': 'application/json'})
    };
    if (bearer) headers.Authorization = 'Bearer ' + bearer;
    const res = await fetch(url, {
      method, credentials: inPreview ? 'same-origin' : 'omit', cache: 'no-store',
      redirect: 'error',
      headers,
      ...(body === undefined ? {} : {body: JSON.stringify(body)})
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (!inPreview && res.status === 401 && path !== 'auth/login')
        sessionStorage.removeItem(SESSION_KEY);
      const err = new Error(data.error || data.message || 'Ошибка ' + res.status);
      err.status = res.status;
      throw err;
    }
    if (!inPreview && (path === 'auth/login' || path === 'auth/verify')) {
      if (typeof data.access_token !== 'string' ||
          !/^[A-Za-z0-9_-]{43}$/.test(data.access_token))
        throw new Error('Сервер не вернул действительную сессию.');
      sessionStorage.setItem(SESSION_KEY, data.access_token);
    }
    if (!inPreview && path === 'auth/logout') sessionStorage.removeItem(SESSION_KEY);
    return data;
  }
  function profileDetails(p) {
    return {
      phone: p.profile.phone || '',
      area: p.profile.area || '',
      address: p.profile.address || '',
      specialty: p.profile.specialty || '',
      activityDirection: p.profile.activityDirection || '',
      publicPhoneConsent: p.profile.publicPhoneConsent === true
    };
  }
  function applyServerProfile(me, role, fallback) {
    const server = Array.isArray(me.profiles) ? me.profiles.find(x => x.role === role) : null;
    if (!server || !me.email || !me.user_id) throw new Error('Сервер не подтвердил профиль аккаунта.');
    const id = String(me.user_id);
    const previous = localStorage.getItem(ACCOUNT_KEY);
    // Never reuse an earlier user's role or appointment cache after switching account.
    if (previous !== id) {
      localStorage.removeItem(ROLE_KEY);
      localStorage.removeItem(DATA_CACHE_KEY);
      data = {
        clients: [], appointments: [], expenses: [], daysOff: [],
        monthlyHours: {}, availabilityByDate: {}, blockedSlots: [],
        services: [{id: 'nailora-service-default', name: 'Маникюр с покрытием', durationMinutes: 90, price: 0}]
      };
    }
    const cached = previous === id && profiles[role]?.email === me.email ? profiles[role] : {};
    const saved = {
      name: server.name || fallback.name || cached.name || '',
      phone: server.phone || fallback.phone || cached.phone || '',
      country: server.country || cached.country || 'Россия',
      city: server.city || fallback.city || cached.city || '',
      area: server.area || fallback.area || cached.area || '',
      address: server.address || fallback.address || cached.address || '',
      specialty: server.specialty || fallback.specialty || cached.specialty || '',
      activityDirection: server.activity_direction || server.activityDirection || fallback.activityDirection || cached.activityDirection || '',
      publicPhoneConsent: server.phone_publication_consent === true || (fallback.publicPhoneConsent === true && server.phone_publication_consent === undefined),
      avatarUrl: typeof server.avatar_url === 'string' && /^https:\/\//i.test(server.avatar_url) ? server.avatar_url :
        (typeof server.avatar_url === 'string' && server.avatar_url.startsWith('/avatars/') ? API_ORIGIN + server.avatar_url : (cached.avatarUrl || '')),
      email: me.email, authUserId: id,
      profileId: server.profile_id || server.id || '',
      language: currentLanguage
    };
    // Avoid any profile from another role/account silently surviving in memory.
    profiles = {master: null, client: null, [role]: saved};
    localStorage.setItem(ROLE_KEY, JSON.stringify(profiles));
    localStorage.setItem(ACCOUNT_KEY, id);
    nailoraRememberEmailRegion(me.email, NAILORA_REGION_RU);
    return saved;
  }
  function restoreMasterData(snapshot) {
    const payload = snapshot?.master_data;
    if (!payload || !payload.profile || !Array.isArray(payload.appointments))
      throw new Error('Российская база не вернула данные мастера. Пустой календарь не открываем.');
    const profile = payload.profile;
    const link = snapshot.profiles.find(p => p.role === 'master');
    if (String(profile.id) !== String(link?.profile_id))
      throw new Error('Профиль в ответе сервера не соответствует авторизованному аккаунту.');
    const schedule = payload.schedule_data && typeof payload.schedule_data === 'object'
      ? payload.schedule_data : {};
    const savedServices = Array.isArray(schedule.services) && schedule.services.length
      ? schedule.services : payload.services;
    // Read-only reconstruction. Nothing is sent back to the database here.
    data = {
      clients: [], expenses: [],
      appointments: payload.appointments.map(a => ({
        id: String(a.id), localId: a.local_id || '',
        clientId: a.client_id || '', name: a.client_name || '',
        phone: a.client_phone || '', service: a.service_name || '',
        price: Number(a.price) || 0, date: a.local_date || '',
        time: a.local_time || '', durationMinutes: Number(a.duration_minutes) || 60,
        notes: a.notes || '', paid: a.paid === true,
        photos: Array.isArray(a.photos) ? a.photos : [], status: a.status || ''
      })),
      daysOff: Array.isArray(schedule.daysOff) ? schedule.daysOff : [],
      monthlyHours: schedule.monthlyHours && typeof schedule.monthlyHours === 'object' && !Array.isArray(schedule.monthlyHours) ? schedule.monthlyHours : {},
      availabilityByDate: schedule.availabilityByDate && typeof schedule.availabilityByDate === 'object' && !Array.isArray(schedule.availabilityByDate) ? schedule.availabilityByDate : {},
      blockedSlots: Array.isArray(schedule.blockedSlots) ? schedule.blockedSlots : [],
      services: Array.isArray(savedServices) ? savedServices.map(s => ({
        id: String(s.id || ''), name: String(s.name || ''),
        durationMinutes: Number(s.durationMinutes ?? s.duration_minutes) || 60,
        price: Number(s.price) || 0
      })).filter(s => s.id && s.name) : []
    };
    const clients = new Map();
    for (const a of data.appointments) {
      const key = a.clientId ? 'id:' + a.clientId
        : a.phone ? 'phone:' + a.phone.replace(/\D/g, '')
        : a.name ? 'name:' + a.name.toLocaleLowerCase() : '';
      if (!key || clients.has(key)) continue;
      clients.set(key, {id: a.clientId || 'from-appointment:' + a.id,
        name: a.name || 'Клиент', phone: a.phone || '',
        service: a.service || '', price: a.price || 0, notes: ''});
    }
    data.clients = [...clients.values()];
    // Keep browser state isolated to the logged in Russian user. It is NOT cloud sync.
    localStorage.setItem(DATA_CACHE_KEY, JSON.stringify(data));
  }
  async function openExisting(role, me, fallback = {}) {
    let actual = me;
    if (role === 'master' && !inPreview) {
      actual = await api('me?include_master=1', 'GET');
      if (actual.user_id !== me.user_id)
        throw new Error('Не удалось проверить владельца профиля.');
    }
    applyServerProfile(actual, role, fallback);
    if (role === 'master' && !inPreview) restoreMasterData(actual);
    sessionStorage.removeItem(KEY);
    resetRegistrationView();
    $('regPassword').value = '';
    $('loginPassword').value = '';
    await openRole(role);
    if (role === 'master' && !inPreview) renderAll();
    setCloudStatus('Профиль открыт · ' + (me.email || 'аккаунт'));
  }
  async function finishRegistration(p) {
    if (busy) return;
    busy = true;
    finishButton.disabled = true;
    setNote('Создаю профиль…');
    try {
      const me = await api('me', 'GET');
      if (String(me.email || '').toLowerCase() !== p.email) throw new Error('Сессия относится к другому аккаунту.');
      await api('me/profiles', 'POST', {
        role: p.role, name: p.profile.name, city: p.profile.city,
        country: 'Россия', details: profileDetails(p)
      });
      const confirmed = await api('me', 'GET');
      if (String(confirmed.email || '').toLowerCase() !== p.email) throw new Error('Не удалось подтвердить профиль.');
      await openExisting(p.role, confirmed, p.profile);
    } catch (err) {
      if (/401|Требуется вход|Сессия недействительна/.test(String(err.message || ''))) {
        alreadyVerifiedView(p); // Old email verification did not create a session.
      } else {
        displayCode(p);
        setNote('Не удалось открыть профиль: ' + (err.message || 'ошибка') + '. Нажми «Продолжить» ещё раз.');
      }
    } finally {
      busy = false;
      finishButton.disabled = false;
    }
  }
  async function normalRuLogin(email, password, role, status) {
    await api('auth/login', 'POST', {email, password});
    const me = await api('me', 'GET');
    if (String(me.email || '').toLowerCase() !== email) throw new Error('Не удалось подтвердить аккаунт.');
    const p = pending();
    if (p && p.email === email && p.role === role && p.verified) {
      await api('me/profiles', 'POST', {
        role, name: p.profile.name, city: p.profile.city,
        country: 'Россия', details: profileDetails(p)
      });
    }
    const confirmed = await api('me', 'GET');
    if (!confirmed.profiles?.some(x => x.role === role)) {
      throw new Error('Профиль выбранной роли не найден.');
    }
    // First login on this device: switch to isolated Russian cache BEFORE
    // loading profile data. Cookie (preview) or sessionStorage token (public) survives reload.
    if (nailoraActiveRegion !== NAILORA_REGION_RU || nailoraRuCacheSuffix !== '_ru_v898') {
      nailoraRememberEmailRegion(email, NAILORA_REGION_RU);
      if (nailoraChangeRegion(NAILORA_REGION_RU)) location.reload();
      return;
    }
    await openExisting(role, confirmed, p?.profile || {});
    status.textContent = 'Вход выполнен.';
  }
  document.addEventListener('submit', async event => {
    if (event.target?.id !== 'registerForm') return;
    const p = pending();
    const country = $('regCountry').value.trim();
    if (!nailoraIsRussianCountry(country) && !(p && p.verified)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (busy) return;
    const role = p?.verified ? p.role : (chosenRole || selectedEntryRole || 'client');
    const email = $('regEmail').value.trim().toLowerCase();
    const password = $('regPassword').value;
    const profile = p?.verified ? p.profile : {
      name: $('regName').value.trim(), phone: $('regPhone').value.trim(),
      country: 'Россия', city: $('regCity').value.trim(),
      area: role === 'master' ? $('regArea').value.trim() : '',
      address: role === 'master' ? $('regAddress').value.trim() : '',
      specialty: role === 'master' ? $('regSpecialty').value.trim() : '',
      activityDirection: role === 'master' ? $('regActivityDirection').value : '',
      publicPhoneConsent: role === 'master' && $('regPublicPhoneConsent').checked === true
    };
    const status = $('registerStatus');
    if (!email || password.length < 12 || !profile.name || !profile.phone || !profile.city || (role === 'master' && !profile.address)) {
      status.textContent = password.length < 12
        ? 'Для российского профиля пароль должен содержать не менее 12 символов.'
        : 'Проверь обязательные поля регистрации.';
      return;
    }
    busy = true;
    $('createProfileButton').disabled = true;
    try {
      if (p?.verified) {
        status.textContent = 'Открываю профиль…';
        // Only for the account already verified using the previous broken flow.
        await api('auth/login', 'POST', {email: p.email, password});
        busy = false;
        await finishRegistration(p);
        return;
      }
      if (nailoraKnownEmailRegion(email, role) === NAILORA_REGION_RU) {
        // If the original verification finished without issuing a cookie,
        // allow finishing the profile in the same registration form.
        status.textContent = 'Проверяю подтверждённую почту…';
        await api('auth/login', 'POST', {email, password});
        const existing = {email, role, profile, verified: true, createdAt: Date.now()};
        savePending(existing);
        busy = false;
        await finishRegistration(existing);
        return;
      }
      status.textContent = 'Отправляю письмо с кодом…';
      await api('auth/register', 'POST', {email, password});
      savePending({email, role, profile, verified: false, createdAt: Date.now()});
      $('regPassword').value = '';
      if (nailoraChangeRegion(NAILORA_REGION_RU)) {
        if (nailoraRuCacheSuffix !== '_ru_v898') location.reload();
        else displayCode(pending());
      }
      // Region change might reload; pending state is restored at boot.
    } catch (err) {
      status.textContent = 'Не удалось завершить регистрацию: ' + (err.message || 'ошибка');
    } finally {
      busy = false;
      $('createProfileButton').disabled = false;
    }
  }, true);

  document.addEventListener('click', async event => {
    const button = event.target?.closest?.('#nailoraDiscoverFinish');
    const p = pending();
    if (!button || !p) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (busy) return;
    if (p.verified) { await finishRegistration(p); return; }
    const code = $('nailoraDiscoverCode').value.trim();
    if (!/^\d{8}$/.test(code)) { setNote('Введи восьмизначный код из письма.'); return; }
    busy = true;
    button.disabled = true;
    try {
      setNote('Проверяю код…');
      // Successful verification now sets the secure session cookie on the server.
      await api('auth/verify', 'POST', {email: p.email, code});
      p.verified = true;
      savePending(p);
      $('nailoraDiscoverCode').value = '';
    } catch (err) {
      setNote('Не удалось подтвердить email: ' + (err.message || 'ошибка'));
      return;
    } finally {
      busy = false;
      button.disabled = false;
    }
    await finishRegistration(p);
  }, true);

  document.addEventListener('click', async event => {
    const button = event.target?.closest?.('#nailoraDiscoverCancel');
    const p = pending();
    if (!button || !p || p.verified) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (busy) return;
    busy = true;
    button.disabled = true;
    try {
      await api('auth/resend', 'POST', {email: p.email});
      setNote('Новое письмо запрошено. Проверь почту.');
    } catch (err) {
      setNote('Не удалось отправить код: ' + (err.message || 'ошибка'));
    } finally {
      busy = false;
      button.disabled = false;
    }
  }, true);

  document.addEventListener('submit', async event => {
    if (event.target?.id !== 'loginForm') return;
    const email = $('loginEmail').value.trim().toLowerCase();
    const password = $('loginPassword').value;
    const role = $('loginRole').value;
    const known = nailoraKnownEmailRegion(email, role);
    // The original handler already knows how to log into Supabase when the
    // account's country is known on this device. Preserve that behavior.
    if (known === NAILORA_REGION_GLOBAL) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const status = $('loginStatus');
    if (!email || !password) {
      status.textContent = 'Введи email и пароль.';
      return;
    }
    if (busy) return;
    busy = true;
    try {
      status.textContent = 'Выполняю вход…';
      await normalRuLogin(email, password, role, status);
    } catch (err) {
      if (err.status === 401 && known !== NAILORA_REGION_RU) {
        // No unauthenticated email->country directory: that would disclose
        // account membership. On unknown devices a failed Russian login may
        // be a foreign account; use the existing Supabase flow instead.
        // A region change from an existing Russian session reloads the page;
        // only email and role are carried over, never the password.
        status.textContent = 'Выполняю вход…';
        try {
          if (!nailoraChangeRegion(NAILORA_REGION_GLOBAL)) return;
          await nailoraGlobalLogin(email, password, role, status);
        } catch (_) {
          status.textContent = 'Не удалось войти. Проверь email и пароль.';
        }
      } else {
        status.textContent = err.status === 401
          ? 'Не удалось войти. Проверь email и пароль.'
          : 'Вход временно недоступен. Повтори попытку позже.';
      }
    } finally { busy = false; }
  }, true);

  document.addEventListener('click', async event => {
    const button = event.target?.closest?.('#settingsLogout');
    if (!button || nailoraActiveRegion !== NAILORA_REGION_RU) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (busy) return;
    busy = true;
    button.disabled = true;
    try {
      await api('auth/logout', 'POST', {});
      localStorage.removeItem(ACTIVE_ROLE_KEY);
      localStorage.removeItem(ROLE_KEY);
      localStorage.removeItem(ACCOUNT_KEY);
      localStorage.removeItem(DATA_CACHE_KEY);
      sessionStorage.removeItem(KEY);
      location.reload();
    } catch (err) {
      alert('Не удалось выйти: ' + (err.message || 'ошибка соединения'));
      busy = false;
      button.disabled = false;
    }
  }, true);

  // Restore an interrupted registration, or an authenticated RU session.
  queueMicrotask(async () => {
    const p = pending();
    if (p) {
      if (nailoraActiveRegion !== NAILORA_REGION_RU || nailoraRuCacheSuffix !== '_ru_v898') {
        if (nailoraChangeRegion(NAILORA_REGION_RU)) location.reload();
        return;
      }
      if (!p.verified) { displayCode(p); return; }
      try {
        const me = await api('me', 'GET');
        if (String(me.email || '').toLowerCase() === p.email) {
          await finishRegistration(p);
          return;
        }
      } catch (_) {}
      alreadyVerifiedView(p);
      return;
    }
    if (nailoraActiveRegion !== NAILORA_REGION_RU) return;
    try {
      const me = await api('me', 'GET');
      const role = me.profiles?.find(x => x.role === (localStorage.getItem(ACTIVE_ROLE_KEY) || 'client'))?.role
        || me.profiles?.[0]?.role;
      if (role) await openExisting(role, me);
    } catch (_) { /* stay on welcome for unauthenticated visitors */ }
  });
})();
