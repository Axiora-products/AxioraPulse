import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserAttribute,
} from 'amazon-cognito-identity-js';

let _userPool = null;
const isMock = import.meta.env.VITE_MOCK_COGNITO === 'true';

function getUserPool() {
  if (isMock) return null;
  if (!_userPool) {
    const id = import.meta.env.VITE_COGNITO_USER_POOL_ID;
    const clientId = import.meta.env.VITE_COGNITO_APP_CLIENT_ID;
    if (!id || !clientId) throw new Error('VITE_COGNITO_USER_POOL_ID and VITE_COGNITO_APP_CLIENT_ID must be set');
    _userPool = new CognitoUserPool({ UserPoolId: id, ClientId: clientId });
  }
  return _userPool;
}

export function cognitoSignIn(email, password) {
  if (isMock) {
    return new Promise(async (resolve, reject) => {
      try {
        const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
        const response = await fetch(`${baseUrl}/auth/mock-login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.detail || 'Mock login failed');
        }

        const data = await response.json();

        const mockSession = {
          getIdToken: () => ({
            getJwtToken: () => data.id_token,
          }),
          getAccessToken: () => ({
            getJwtToken: () => 'mock-access-token',
          }),
          getRefreshToken: () => ({
            getToken: () => 'mock-refresh-token',
          }),
          isValid: () => true,
        };

        localStorage.setItem('token', data.id_token);
        resolve(mockSession);
      } catch (err) {
        reject(err);
      }
    });
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
  if (isMock) {
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
  if (isMock) {
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
  if (isMock) {
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
  if (isMock) {
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
  if (isMock) {
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
  if (isMock) {
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
  if (isMock) {
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
