import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserAttribute,
} from 'amazon-cognito-identity-js';

let _userPool = null;
let _config = null;

export function setAuthConfig(config) {
  _config = config;
}

export function isMockAuth() {
  if (_config) {
    return _config.MOCK_COGNITO === true || _config.MOCK_COGNITO === 'true';
  }
  return import.meta.env.VITE_MOCK_COGNITO === 'true';
}

function getUserPool() {
  if (isMockAuth()) return null;
  if (!_userPool) {
    const id = _config?.COGNITO_USER_POOL_ID || import.meta.env.VITE_COGNITO_USER_POOL_ID;
    const clientId = _config?.COGNITO_APP_CLIENT_ID || import.meta.env.VITE_COGNITO_APP_CLIENT_ID;
    const endpoint = _config?.COGNITO_ENDPOINT || import.meta.env.VITE_COGNITO_ENDPOINT;
    if (!id || !clientId) throw new Error('COGNITO_USER_POOL_ID and COGNITO_APP_CLIENT_ID must be configured');
    _userPool = new CognitoUserPool({
      UserPoolId: id,
      ClientId: clientId,
      endpoint: endpoint || undefined
    });
  }
  return _userPool;
}

// cognito.js — replace cognitoSignIn

export async function cognitoSignIn(email, password) {
  if (isMockAuth()) {
    const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
    const name = localStorage.getItem(`mock_name_${email}`) || undefined;

    const response = await fetch(`${baseUrl}/auth/mock-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.detail || 'Mock login failed');
    }

    const data = await response.json();
    localStorage.removeItem(`mock_name_${email}`);
    localStorage.setItem('token', data.id_token);

    return {
      getIdToken: () => ({ getJwtToken: () => data.id_token }),
      getAccessToken: () => ({ getJwtToken: () => 'mock-access-token' }),
      getRefreshToken: () => ({ getToken: () => 'mock-refresh-token' }),
      isValid: () => true,
    };
  }

  return new Promise((resolve, reject) => {
    const pool = getUserPool();
    const authDetails = new AuthenticationDetails({ Username: email, Password: password });
    const cognitoUser = new CognitoUser({ Username: email, Pool: pool });
    cognitoUser.setAuthenticationFlowType('USER_PASSWORD_AUTH');
    cognitoUser.authenticateUser(authDetails, {
      onSuccess: resolve,
      onFailure: reject,
    });
  });
}

export function cognitoSignUp(email, password, name) {
  if (isMockAuth()) {
    // Preserve full name locally for immediate mock-login / sync
    localStorage.setItem(`mock_name_${email}`, name);
    return Promise.resolve({
      user: {
        getUsername: () => email,
      },
      userConfirmed: true,
    });
  }

  return new Promise((resolve, reject) => {
    const attrs = [
      new CognitoUserAttribute({ Name: 'email', Value: email }),
      new CognitoUserAttribute({ Name: 'name', Value: name }),
    ];
    getUserPool().signUp(email, password, attrs, null, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

export function cognitoConfirmSignUp(email, code) {
  if (isMockAuth()) {
    return Promise.resolve('SUCCESS');
  }

  return new Promise((resolve, reject) => {
    const cognitoUser = new CognitoUser({ Username: email, Pool: getUserPool() });
    cognitoUser.confirmRegistration(code, true, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

export function cognitoResendCode(email) {
  if (isMockAuth()) {
    return Promise.resolve('SUCCESS');
  }

  return new Promise((resolve, reject) => {
    const cognitoUser = new CognitoUser({ Username: email, Pool: getUserPool() });
    cognitoUser.resendConfirmationCode((err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

export function cognitoForgotPassword(email) {
  if (isMockAuth()) {
    return Promise.resolve('SUCCESS');
  }

  return new Promise((resolve, reject) => {
    const cognitoUser = new CognitoUser({ Username: email, Pool: getUserPool() });
    cognitoUser.forgotPassword({
      onSuccess: resolve,
      onFailure: reject,
      inputVerificationCode: resolve,
    });
  });
}

export function cognitoConfirmPassword(email, code, newPassword) {
  if (isMockAuth()) {
    return Promise.resolve('SUCCESS');
  }

  return new Promise((resolve, reject) => {
    const cognitoUser = new CognitoUser({ Username: email, Pool: getUserPool() });
    cognitoUser.confirmPassword(code, newPassword, {
      onSuccess: resolve,
      onFailure: reject,
    });
  });
}

export function cognitoGetCurrentSession() {
  if (isMockAuth()) {
    return new Promise((resolve, reject) => {
      const token = localStorage.getItem('token');
      if (!token) return reject(new Error('No authenticated user'));

      const mockSession = {
        getIdToken: () => ({
          getJwtToken: () => token,
        }),
        getAccessToken: () => ({
          getJwtToken: () => 'mock-access-token',
        }),
        getRefreshToken: () => ({
          getToken: () => 'mock-refresh-token',
        }),
        isValid: () => true,
      };

      resolve(mockSession);
    });
  }

  return new Promise((resolve, reject) => {
    const user = getUserPool().getCurrentUser();
    if (!user) return reject(new Error('No authenticated user'));
    user.getSession((err, session) => {
      if (err) reject(err);
      else resolve(session);
    });
  });
}

export function cognitoSignOut() {
  if (isMockAuth()) {
    localStorage.removeItem('token');
    return;
  }

  try {
    const user = getUserPool().getCurrentUser();
    if (user) user.signOut();
  } catch {
    // pool not configured yet — nothing to sign out
  }
}

/**
 * Change password for the currently logged-in user.
 * Uses the Cognito changePassword flow which verifies the old password
 * before setting the new one — no full re-login required.
 */

export function cognitoChangePassword(email, oldPassword, newPassword) {
  if (isMockAuth()) {
    return Promise.resolve('SUCCESS');
  }

  return new Promise((resolve, reject) => {
    // pool.getCurrentUser() restores the stored session from localStorage.
    // new CognitoUser({ Username, Pool }) does NOT — it starts with no tokens.
    const cognitoUser = getUserPool().getCurrentUser();

    if (!cognitoUser) {
      return reject(new Error('NO_USER'));
    }

    cognitoUser.getSession((sessionErr, session) => {
      if (sessionErr || !session?.isValid()) {
        return reject(new Error('SESSION_EXPIRED'));
      }

      cognitoUser.changePassword(oldPassword, newPassword, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  });
}
