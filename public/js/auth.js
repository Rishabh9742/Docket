(function () {
    'use strict';
  
    // Already logged in? Go straight to the tasks page.
    if (Api.getToken()) {
      window.location.replace('/tasks.html');
      return;
    }
  
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const tabLogin = document.getElementById('tab-login');
    const tabRegister = document.getElementById('tab-register');
    const notice = document.getElementById('notice');
  
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  
    // ---------- Tabs ----------
    function selectTab(which) {
      const isLogin = which === 'login';
      tabLogin.setAttribute('aria-selected', String(isLogin));
      tabRegister.setAttribute('aria-selected', String(!isLogin));
      loginForm.hidden = !isLogin;
      registerForm.hidden = isLogin;
      notice.hidden = true;
    }
    tabLogin.addEventListener('click', () => selectTab('login'));
    tabRegister.addEventListener('click', () => selectTab('register'));
  
    if (new URLSearchParams(window.location.search).get('expired')) {
      notice.textContent = 'Your session has ended. Log in again to continue.';
      notice.hidden = false;
    }
  
    // ---------- Error display ----------
    function clearErrors(form) {
      form.querySelectorAll('[data-error-for]').forEach((p) => { p.textContent = ''; });
      form.querySelector('[data-form-error]').textContent = '';
      form.querySelectorAll('input').forEach((input) => input.removeAttribute('aria-invalid'));
    }
  
    function showErrors(form, errors) {
      let first = null;
      Object.entries(errors).forEach(([name, message]) => {
        const slot = form.querySelector(`[data-error-for="${name}"]`);
        const input = form.elements[name];
        if (slot) slot.textContent = message;
        if (input) {
          input.setAttribute('aria-invalid', 'true');
          if (!first) first = input;
        }
      });
      if (first) first.focus();
    }
  
    // ---------- Client-side validation (the server validates again) ----------
    function validateLogin(v) {
      const errors = {};
      if (!v.email) errors.email = 'Enter your email address.';
      else if (!EMAIL_RE.test(v.email)) errors.email = 'Enter a valid email address.';
      if (!v.password) errors.password = 'Enter your password.';
      return errors;
    }
  
    function validateRegister(v) {
      const errors = {};
      if (!v.name) errors.name = 'Enter your name.';
      if (!v.email) errors.email = 'Enter your email address.';
      else if (!EMAIL_RE.test(v.email)) errors.email = 'Enter a valid email address.';
      if (v.password.length < 8) errors.password = 'Password must be at least 8 characters.';
      else if (!/[A-Za-z]/.test(v.password) || !/\d/.test(v.password)) {
        errors.password = 'Password must include at least one letter and one number.';
      }
      return errors;
    }
  
    // ---------- Submit handlers ----------
    function handle(form, validate, endpoint, buttonText) {
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        clearErrors(form);
  
        const values = Object.fromEntries(new FormData(form).entries());
        Object.keys(values).forEach((k) => { if (k !== 'password') values[k] = values[k].trim(); });
  
        const errors = validate(values);
        if (Object.keys(errors).length) {
          showErrors(form, errors);
          return;
        }
  
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        button.textContent = 'Please wait…';
  
        try {
          const { token, user } = await Api.post(endpoint, values, { auth: false });
          Api.setSession(token, user);
          window.location.href = '/tasks.html';
        } catch (err) {
          if (err.details) showErrors(form, err.details);
          else form.querySelector('[data-form-error]').textContent = err.message;
          button.disabled = false;
          button.textContent = buttonText;
        }
      });
    }
  
    handle(loginForm, validateLogin, '/auth/login', 'Log in');
    handle(registerForm, validateRegister, '/auth/register', 'Create account');
  })();