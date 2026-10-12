// Small wrapper around fetch: adds the auth token, parses JSON and normalises errors.
const Api = (() => {
    const TOKEN_KEY = 'docket_token';
    const USER_KEY = 'docket_user';
  
    class ApiError extends Error {
      constructor(message, status, details) {
        super(message);
        this.status = status;
        this.details = details || null;
      }
    }
  
    const getToken = () => localStorage.getItem(TOKEN_KEY);
  
    function getUser() {
      try {
        return JSON.parse(localStorage.getItem(USER_KEY));
      } catch {
        return null;
      }
    }
  
    function setSession(token, user) {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    }
  
    function clearSession() {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    }
  
    async function request(path, { method = 'GET', body, auth = true } = {}) {
      const headers = {};
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (auth && getToken()) headers.Authorization = `Bearer ${getToken()}`;
  
      let res;
      try {
        res = await fetch(`/api${path}`, {
          method,
          headers,
          body: body !== undefined ? JSON.stringify(body) : undefined
        });
      } catch {
        throw new ApiError('Cannot reach the server. Check your connection and try again.', 0);
      }
  
      if (res.status === 204) return null;
  
      let data = null;
      try {
        data = await res.json();
      } catch {
        /* non-JSON response */
      }
  
      if (!res.ok) {
        // An expired or invalid token on a protected call sends the person back to log in.
        if (res.status === 401 && auth) {
          clearSession();
          window.location.href = '/index.html?expired=1';
        }
        throw new ApiError((data && data.error) || 'Something went wrong. Try again.', res.status, data && data.details);
      }
      return data;
    }
  
    return {
      ApiError,
      getToken,
      getUser,
      setSession,
      clearSession,
      get: (path) => request(path),
      post: (path, body, opts) => request(path, { method: 'POST', body, ...opts }),
      patch: (path, body) => request(path, { method: 'PATCH', body }),
      delete: (path) => request(path, { method: 'DELETE' })
    };
  })();
  